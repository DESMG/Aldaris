import { FORM_BODY_MAX_BYTES } from "../shared/limits.ts";
import { HttpError } from "../shared/http-error.ts";
export { HttpError } from "../shared/http-error.ts";

export async function readForm(request: Request, maxBytes = FORM_BODY_MAX_BYTES): Promise<FormData> {
    const contentType = request.headers.get("Content-Type") ?? "";
    const mediaType = contentType.split(";", 1)[0].trim().toLowerCase();
    if (!["multipart/form-data", "application/x-www-form-urlencoded"].includes(mediaType)) {
        throw new HttpError(415, "读取表单：请求必须使用表单格式。");
    }
    const encoding = request.headers.get("Content-Encoding");
    if (encoding && encoding.toLowerCase() !== "identity") {
        throw new HttpError(415, "读取表单：不支持压缩的请求体。");
    }
    const declaredLength = request.headers.get("Content-Length");
    if (declaredLength !== null && (!/^\d+$/.test(declaredLength) || !Number.isSafeInteger(Number(declaredLength)))) {
        throw new HttpError(400, "读取表单：请求体长度无效。");
    }
    if (declaredLength !== null && Number(declaredLength) > maxBytes) {
        throw new HttpError(413, "读取表单：请求体超过大小限制。");
    }
    if (!request.body) throw new HttpError(400, "读取表单：请求体不能为空。");

    const reader = request.body.getReader();
    const bytes = new Uint8Array(maxBytes);
    let size = 0;
    try {
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            if (value.byteLength > maxBytes - size) {
                // Cancellation is best effort; its failure must not replace the size error.
                void reader.cancel().catch(() => {});
                throw new HttpError(413, "读取表单：请求体超过大小限制。");
            }
            bytes.set(value, size);
            size += value.byteLength;
        }
    } finally {
        reader.releaseLock();
    }
    try {
        return await new Response(bytes.subarray(0, size), { headers: { "Content-Type": contentType } }).formData();
    } catch {
        throw new HttpError(400, "读取表单：请求体不是有效表单。");
    }
}
