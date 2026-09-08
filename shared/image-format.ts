import { IMAGE_MAX_DIMENSION, IMAGE_MAX_PIXELS } from "./limits.ts";
import { HttpError } from "./http-error.ts";

type ImageInfo = { contentType: string; width: number; height: number; animated: boolean };

function invalid(format: string): never {
    throw new HttpError(400, `上传图片：${format} 图片结构无效或文件不完整。`);
}

function dimensions(width: number, height: number, maxDimension: number, maxPixels: number) {
    if (!width || !height || width > maxDimension || height > maxDimension || width * height > maxPixels) {
        throw new HttpError(400, "上传图片：图片尺寸过大，请缩小后重试。");
    }
}

function text(bytes: Uint8Array, start: number, length: number) {
    return String.fromCharCode(...bytes.subarray(start, start + length));
}

function webp(bytes: Uint8Array, maxDimension: number, maxPixels: number): ImageInfo {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    if (bytes.length < 20 || view.getUint32(4, true) + 8 !== bytes.length) invalid("WebP");
    let offset = 12;
    let width = 0;
    let height = 0;
    let flags = 0;
    let extended = false;
    let alpha = false;
    let image = false;
    while (offset + 8 <= bytes.length) {
        const kind = text(bytes, offset, 4);
        const length = view.getUint32(offset + 4, true);
        const start = offset + 8;
        const end = start + length;
        if (end + (length & 1) > bytes.length || ((length & 1) && bytes[end] !== 0)) invalid("WebP");
        if (kind === "VP8X") {
            if (offset !== 12 || length !== 10) invalid("WebP");
            flags = bytes[start];
            if ((flags & ~0x10) || bytes[start + 1] || bytes[start + 2] || bytes[start + 3]) invalid("WebP");
            width = 1 + bytes[start + 4] + (bytes[start + 5] << 8) + (bytes[start + 6] << 16);
            height = 1 + bytes[start + 7] + (bytes[start + 8] << 8) + (bytes[start + 9] << 16);
            dimensions(width, height, maxDimension, maxPixels);
            extended = true;
        } else if (kind === "ALPH") {
            if (!extended || !(flags & 0x10) || alpha || image || length < 2 || (bytes[start] & 0xc0)
                || (bytes[start] & 3) > 1 || ((bytes[start] >> 4) & 3) > 1) invalid("WebP");
            if ((bytes[start] & 3) === 0 && length !== 1 + width * height) invalid("WebP");
            alpha = true;
        } else if (kind === "VP8 " || kind === "VP8L") {
            if (image) invalid("WebP");
            let frameWidth: number;
            let frameHeight: number;
            let hasAlpha = alpha;
            if (kind === "VP8 ") {
                if (length < 11 || (bytes[start] & 1) || ((bytes[start] >> 1) & 7) > 3 || !(bytes[start] & 0x10)
                    || text(bytes, start + 3, 3) !== "\x9d\x01\x2a") invalid("WebP");
                const partition = (bytes[start] | (bytes[start + 1] << 8) | (bytes[start + 2] << 16)) >>> 5;
                if (!partition || partition > length - 10) invalid("WebP");
                frameWidth = view.getUint16(start + 6, true) & 0x3fff;
                frameHeight = view.getUint16(start + 8, true) & 0x3fff;
            } else {
                if (alpha || length < 6 || bytes[start] !== 0x2f || (bytes[start + 4] & 0xe0)) invalid("WebP");
                const header = view.getUint32(start + 1, true);
                frameWidth = (header & 0x3fff) + 1;
                frameHeight = ((header >>> 14) & 0x3fff) + 1;
                hasAlpha = Boolean(header & 0x10000000);
            }
            dimensions(frameWidth, frameHeight, maxDimension, maxPixels);
            if (extended && (width !== frameWidth || height !== frameHeight || Boolean(flags & 0x10) !== hasAlpha)) invalid("WebP");
            width = frameWidth;
            height = frameHeight;
            image = true;
        } else {
            invalid("WebP");
        }
        offset = end + (length & 1);
    }
    if (!image || offset !== bytes.length) invalid("WebP");
    return { contentType: "image/webp", width, height, animated: false };
}

// These checks validate container structure and resource bounds, not every compressed
// pixel or metadata stream. Full decoding/re-encoding requires a trusted image codec.
export function inspectImage(bytes: Uint8Array, maxDimension = IMAGE_MAX_DIMENSION, maxPixels = IMAGE_MAX_PIXELS): ImageInfo {
    if (!bytes.length) throw new HttpError(400, "上传图片：图片内容不能为空。");
    if (text(bytes, 0, 4) === "RIFF" && text(bytes, 8, 4) === "WEBP") return webp(bytes, maxDimension, maxPixels);
    throw new HttpError(400, "上传图片：文件内容必须是静态 WebP 图片。");
}
