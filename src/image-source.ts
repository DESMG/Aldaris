import { IMAGE_SOURCE_MAX_DIMENSION, IMAGE_SOURCE_MAX_PIXELS } from "../shared/limits.ts";

// Read only the bounds and animation markers needed before allocating codec memory.
// The codec validates and decodes the compressed image data.
export function inspectSourceImage(bytes: Uint8Array, contentType: string) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    let width = 0;
    let height = 0;
    if (contentType === "image/png") {
        if (bytes.length < 33 || String.fromCharCode(...bytes.subarray(0, 8)) !== "\x89PNG\r\n\x1a\n"
            || view.getUint32(8) !== 13 || view.getUint32(12) !== 0x49484452) throw new Error("PNG 文件头无效。");
        width = view.getUint32(16);
        height = view.getUint32(20);
        let offset = 8;
        while (offset + 12 <= bytes.length) {
            const length = view.getUint32(offset);
            const kind = view.getUint32(offset + 4);
            if (length > bytes.length - offset - 12) throw new Error("PNG 文件不完整。");
            if ([0x6163544c, 0x6663544c, 0x66644154].includes(kind)) throw new Error("不支持动图，请选择静态 JPG 或 PNG 图片。");
            offset += length + 12;
        }
        if (offset !== bytes.length) throw new Error("PNG 文件不完整。");
    } else if (contentType === "image/jpeg") {
        if (bytes.length < 4 || view.getUint16(0) !== 0xffd8) throw new Error("JPEG 文件头无效。");
        let offset = 2;
        while (offset + 4 <= bytes.length) {
            if (bytes[offset++] !== 0xff) throw new Error("JPEG 标记无效。");
            while (bytes[offset] === 0xff) offset++;
            const marker = bytes[offset++];
            if (marker === 0xda || marker === 0xd9) break;
            if (offset + 2 > bytes.length) throw new Error("JPEG 文件不完整。");
            const length = view.getUint16(offset);
            if (length < 2 || offset + length > bytes.length) throw new Error("JPEG 文件不完整。");
            if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
                if (length < 8) throw new Error("JPEG 尺寸信息无效。");
                height = view.getUint16(offset + 3);
                width = view.getUint16(offset + 5);
                break;
            }
            offset += length;
        }
    } else {
        throw new Error("仅支持静态 JPG 和 PNG 图片。");
    }
    if (!width || !height) throw new Error("图片尺寸无效。");
    if (width > IMAGE_SOURCE_MAX_DIMENSION || height > IMAGE_SOURCE_MAX_DIMENSION
        || width * height > IMAGE_SOURCE_MAX_PIXELS) throw new Error("图片尺寸过大，请缩小后重试。");
    return { width, height };
}
