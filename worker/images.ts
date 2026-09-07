import { IMAGE_MAX_BYTES, IMAGE_MAX_COUNT } from "../shared/limits.ts";
import { HttpError } from "../shared/http-error.ts";
import { inspectImage } from "../shared/image-format.ts";
import type { Env } from "./env";
import { reclaimImageSpace, rollbackImages } from "./image-cleanup";
export { inspectImage } from "../shared/image-format.ts";

export async function uploadImages(env: Env, files: { bytes: Uint8Array; contentType: string }[]) {
    if (!files.length) return [];
    const rows = files.map(file => ({ key: `${crypto.randomUUID()}.${file.contentType === "image/png" ? "png" : "jpg"}`, contentType: file.contentType, byteSize: file.bytes.length }));
    const keys = rows.map(row => row.key);
    const reserve = env.DB.prepare(`INSERT INTO images (key, contentType, byteSize, state, createdAt)
        SELECT json_extract(value, '$.key'), json_extract(value, '$.contentType'),
            json_extract(value, '$.byteSize'), 'reserved', ? FROM json_each(?)`)
        .bind(new Date().toISOString(), JSON.stringify(rows));
    try {
        env.signal?.throwIfAborted();
        await reserve.run();
    } catch (error) {
        if (!(error instanceof Error) || !error.message.includes("image_capacity_exceeded")) throw error;
        env.signal?.throwIfAborted();
        await reclaimImageSpace(env, rows.reduce((total, row) => total + row.byteSize, 0));
        env.signal?.throwIfAborted();
        try { await reserve.run(); }
        catch (retryError) {
            if (retryError instanceof Error && retryError.message.includes("image_capacity_exceeded")) {
                env.signal?.throwIfAborted();
                await env.DB.prepare("UPDATE image_capacity SET requestedBytes = MAX(requestedBytes, ?) WHERE id = 1")
                    .bind(rows.reduce((total, row) => total + row.byteSize, 0)).run();
                throw new HttpError(507, "图片容量不足，清理任务将继续重试，请稍后重新提交。");
            }
            throw retryError;
        }
    }
    let unstartedUpload: string | null = null;
    try {
        for (const [index, file] of files.entries()) {
            const key = keys[index];
            env.signal?.throwIfAborted();
            unstartedUpload = key;
            const started = await env.DB.prepare("UPDATE images SET state = 'uploading' WHERE key = ? AND state = 'reserved'").bind(key).run();
            if (!started.meta.changes) throw new HttpError(409, "图片上传预留已过期，请重新提交。");
            env.signal?.throwIfAborted();
            unstartedUpload = null;
            await env.IMAGES.put(key, file.bytes, { httpMetadata: { contentType: file.contentType } });
            env.signal?.throwIfAborted();
            const uploaded = await env.DB.prepare("UPDATE images SET state = 'uploaded' WHERE key = ? AND state = 'uploading'").bind(key).run();
            if (!uploaded.meta.changes) throw new HttpError(409, "图片上传预留已过期，请重新提交。");
        }
        return keys;
    } catch (error) {
        if (env.signal?.aborted) {
            // Only release abandoned reservations; never continue the business mutation.
            // A key whose PUT never started is safe to clear even in 'uploading'.
            await rollbackImages({ DB: env.DB, IMAGES: env.IMAGES }, keys, unstartedUpload);
            throw error;
        }
        await rollbackImages(env, keys, unstartedUpload);
        throw error;
    }
}

export async function readImages(form: FormData, retainedCount = 0): Promise<{ bytes: Uint8Array; contentType: string }[]> {
    const files = form.getAll("images");
    if (retainedCount + files.length > IMAGE_MAX_COUNT) throw new HttpError(400, "上传图片：最多保留 10 张图片。");
    const images: { bytes: Uint8Array; contentType: string }[] = [];
    for (const file of files) {
        if (!(file instanceof File)) throw new HttpError(400, "上传图片：images 必须是文件字段。");
        if (!file.size || file.size > IMAGE_MAX_BYTES) throw new HttpError(400, "上传图片：每张图片必须大于 0 字节且不超过 1 MiB。");
        const bytes = new Uint8Array(await file.arrayBuffer());
        const info = inspectImage(bytes);
        if (file.type !== info.contentType) throw new HttpError(400, "上传图片：声明的格式与实际图片内容不一致。");
        images.push({ bytes, contentType: info.contentType });
    }
    return images;
}
