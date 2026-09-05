import type { Env } from "./env";

export async function deletePendingImages(env: Env) {
    const pending = await env.DB.prepare("SELECT key FROM images WHERE state = 'deleting' LIMIT 100").all<{ key: string }>();
    if (!pending.results.length) return;
    const keys = pending.results.map(row => row.key);
    await env.IMAGES.delete(keys);
    await env.DB.prepare("DELETE FROM images WHERE state = 'deleting' AND key IN (SELECT value FROM json_each(?))").bind(JSON.stringify(keys)).run();
}

export async function rollbackImages(env: Env, keys: string[]) {
    if (!keys.length) return;
    try {
        await env.DB.prepare("INSERT OR IGNORE INTO images (key, state) SELECT value, 'deleting' FROM json_each(?)")
            .bind(JSON.stringify(keys)).run();
    } catch (error) {
        console.error("记录 R2 图片回滚任务失败，尝试直接删除", keys, error);
        await env.IMAGES.delete(keys);
    }
}
