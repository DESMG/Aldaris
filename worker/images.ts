import { IMAGE_MAX_BYTES, IMAGE_MAX_COUNT } from "../shared/limits.ts";
import { HttpError } from "../shared/http-error.ts";
import { inspectImage } from "../shared/image-format.ts";
export { inspectImage } from "../shared/image-format.ts";

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
