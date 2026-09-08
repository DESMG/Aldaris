import {
    IMAGE_MAX_BYTES, IMAGE_MAX_DIMENSION, IMAGE_MAX_PIXELS,
    IMAGE_SOURCE_MAX_BYTES,
} from "../shared/limits";
import { inspectImage } from "../shared/image-format";
import { inspectSourceImage } from "./image-source";

type CWebP = {
    FS: { writeFile(name: string, bytes: Uint8Array): void; readFile(name: string): Uint8Array; unlink(name: string): void };
    callMain(args: string[]): number;
};

async function prepareImage(file: File) {
    if (!["image/png", "image/jpeg"].includes(file.type)) throw new Error("仅支持静态 JPG 和 PNG 图片。");
    if (!file.size) throw new Error("图片为空。");
    if (file.size > IMAGE_SOURCE_MAX_BYTES) throw new Error("图片过大，请先自行缩小。");
    const bytes = new Uint8Array(await file.arrayBuffer());
    const info = inspectSourceImage(bytes, file.type);
    const moduleUrl = new URL("/libwebp/cwebp.mjs", self.location.origin).href;
    const { default: createCWebP } = await import(/* @vite-ignore */ moduleUrl);
    const encoder: CWebP = await createCWebP();
    encoder.FS.writeFile("input", bytes);
    try {
        let factor = Math.min(1, IMAGE_MAX_DIMENSION / info.width, IMAGE_MAX_DIMENSION / info.height,
            Math.sqrt(IMAGE_MAX_PIXELS / (info.width * info.height)));
        for (let attempt = 0; attempt < 8; attempt++) {
            const width = Math.max(1, Math.floor(info.width * factor));
            const height = Math.max(1, Math.floor(info.height * factor));
            const status = encoder.callMain(["-quiet", "-q", String(Math.max(55, 88 - attempt * 5)), "-m", "4",
                "-resize", String(width), String(height), "-metadata", "none", "input", "-o", "output.webp"]);
            if (status !== 0) throw new Error(`WebP 编码失败 (${status})。`);
            const output = new Uint8Array(encoder.FS.readFile("output.webp"));
            encoder.FS.unlink("output.webp");
            if (output.length <= IMAGE_MAX_BYTES) {
                const result = inspectImage(output);
                if (result.contentType !== "image/webp" || result.width !== width || result.height !== height) {
                    throw new Error("WebP 编码结果无效。");
                }
                return new File([output], file.name.replace(/\.[^.]+$/, "") + ".webp", { type: "image/webp" });
            }
            factor *= 0.8;
        }
        throw new Error("图片仍超过 1 MiB，请自行缩小后重试。");
    } finally { encoder.FS.unlink("input"); }
}

self.onmessage = async (event: MessageEvent<File>) => {
    try { self.postMessage({ file: await prepareImage(event.data) }); }
    catch (error) { self.postMessage({ error: `${event.data.name}: 图片转码失败：${String(error)}` }); }
};
