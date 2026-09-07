import type { Env } from "./env";

export async function deletePendingImages(env: Env) {
    env.signal?.throwIfAborted();
    const pending = await env.DB.prepare("SELECT key FROM images WHERE state = 'deleting' ORDER BY createdAt, key LIMIT 20").all<{ key: string }>();
    if (!pending.results.length) return;
    const keys = pending.results.map(row => row.key);
    env.signal?.throwIfAborted();
    await env.IMAGES.delete(keys);
    // Keep references and positions for cleared-image placeholders.
    env.signal?.throwIfAborted();
    await env.DB.batch([
        env.DB.prepare("UPDATE images SET state = 'deleted' WHERE state = 'deleting' AND key IN (SELECT value FROM json_each(?))").bind(JSON.stringify(keys)),
        env.DB.prepare("UPDATE image_capacity SET requestedBytes = 0 WHERE id = 1 AND 10000000000 - byteSize >= requestedBytes"),
    ]);
}

export async function rollbackImages(env: Env, keys: string[], unstartedUpload: string | null = null) {
    if (!keys.length) return;
    env.signal?.throwIfAborted();
    await env.DB.prepare(`UPDATE images SET state = 'deleting'
        WHERE key IN (SELECT value FROM json_each(?))
            AND (state IN ('reserved', 'uploaded') OR (state = 'uploading' AND key = ?))`)
        .bind(JSON.stringify(keys), unstartedUpload).run();
}

export async function reclaimImageSpace(env: Env, requiredBytes: number) {
    env.signal?.throwIfAborted();
    await env.DB.prepare("UPDATE image_capacity SET requestedBytes = MAX(requestedBytes, ?) WHERE id = 1").bind(requiredBytes).run();
    env.signal?.throwIfAborted();
    await queueOldImages(env);
    env.signal?.throwIfAborted();
    await deletePendingImages(env);
}

async function queueOldImages(env: Env) {
    env.signal?.throwIfAborted();
    await env.DB.prepare(`UPDATE images SET state = 'deleting' WHERE key IN (
        SELECT key FROM (
            SELECT key, COALESCE(SUM(byteSize) OVER (ORDER BY createdAt, key
                ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING), 0) AS precedingBytes
            FROM (SELECT key, byteSize, createdAt FROM images WHERE state = 'active' ORDER BY createdAt, key LIMIT 20)
        ) WHERE precedingBytes < (SELECT requestedBytes - (10000000000 - byteSize) FROM image_capacity WHERE id = 1)
            - (SELECT COALESCE(SUM(byteSize), 0) FROM images WHERE state = 'deleting')
        ORDER BY precedingBytes LIMIT 20
    )`).run();
}

export async function reconcileImages(env: Env) {
    const expired = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    env.signal?.throwIfAborted();
    await env.DB.prepare(`UPDATE images SET state = 'deleting' WHERE key IN (
        SELECT key FROM images WHERE state IN ('reserved', 'uploaded') AND createdAt < ?
        ORDER BY createdAt, key LIMIT 20
    )`).bind(expired).run();
    env.signal?.throwIfAborted();
    const uncertain = await env.DB.prepare(`SELECT key FROM images WHERE state = 'uploading'
        AND createdAt < ? ORDER BY checkedAt, key LIMIT 10`).bind(expired).all<{ key: string }>();
    for (const { key } of uncertain.results) {
        env.signal?.throwIfAborted();
        await env.DB.prepare("UPDATE images SET checkedAt = ? WHERE key = ? AND state = 'uploading'").bind(new Date().toISOString(), key).run();
        // Absence cannot prove an interrupted PUT will never finish.
        env.signal?.throwIfAborted();
        if (await env.IMAGES.head(key)) {
            env.signal?.throwIfAborted();
            await env.DB.prepare("UPDATE images SET state = 'deleting' WHERE key = ? AND state = 'uploading'").bind(key).run();
        } else console.error("图片上传结果尚未确认，继续保留容量", key);
    }
    env.signal?.throwIfAborted();
    await queueOldImages(env);
    env.signal?.throwIfAborted();
    await deletePendingImages(env);
}
