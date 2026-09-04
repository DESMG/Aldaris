import { IMAGE_MAX_DIMENSION, IMAGE_MAX_PIXELS } from "./limits.ts";
import { HttpError } from "./http-error.ts";

type ImageInfo = { contentType: string; width: number; height: number; animated: boolean };

function invalid(format: string): never {
    throw new HttpError(400, `上传图片：${format} 图片结构无效或文件不完整。`);
}

function dimensions(width: number, height: number) {
    if (!width || !height || width > IMAGE_MAX_DIMENSION || height > IMAGE_MAX_DIMENSION || width * height > IMAGE_MAX_PIXELS) {
        throw new HttpError(400, "上传图片：尺寸超过限制 (单边最多 8192 像素、最多 16 Mi 像素)。");
    }
}

function text(bytes: Uint8Array, start: number, length: number) {
    return String.fromCharCode(...bytes.subarray(start, start + length));
}

const crcTable = Uint32Array.from({ length: 256 }, (_, value) => {
    for (let bit = 0; bit < 8; bit++) value = (value >>> 1) ^ ((value & 1) ? 0xedb88320 : 0);
    return value >>> 0;
});

function png(bytes: Uint8Array): ImageInfo {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    let offset = 8;
    let width = 0;
    let height = 0;
    let color = -1;
    let depth = 0;
    let palette = false;
    let dataSize = 0;
    let dataEnded = false;
    const zlibHeader: number[] = [];
    while (offset + 12 <= bytes.length) {
        const length = view.getUint32(offset);
        const kind = text(bytes, offset + 4, 4);
        const start = offset + 8;
        const end = start + length;
        if (end + 4 > bytes.length || !/^[A-Za-z]{2}[A-Z][A-Za-z]$/.test(kind)) invalid("PNG");
        let crc = 0xffffffff;
        for (let index = offset + 4; index < end; index++) crc = crcTable[(crc ^ bytes[index]) & 255] ^ (crc >>> 8);
        if (((crc ^ 0xffffffff) >>> 0) !== view.getUint32(end)) invalid("PNG");
        if (offset === 8 && kind !== "IHDR") invalid("PNG");
        if (kind === "IHDR") {
            if (offset !== 8 || length !== 13) invalid("PNG");
            width = view.getUint32(start);
            height = view.getUint32(start + 4);
            dimensions(width, height);
            depth = bytes[start + 8];
            color = bytes[start + 9];
            const validDepth = color === 0 ? [1, 2, 4, 8, 16] : color === 3 ? [1, 2, 4, 8] : [8, 16];
            if (![0, 2, 3, 4, 6].includes(color) || !validDepth.includes(depth)
                || bytes[start + 10] !== 0 || bytes[start + 11] !== 0 || bytes[start + 12] > 1) invalid("PNG");
        } else if (kind === "PLTE") {
            if (palette || dataSize || !length || length % 3 || length > 768 || color === 0 || color === 4
                || (color === 3 && length / 3 > 2 ** depth)) invalid("PNG");
            palette = true;
        } else if (kind === "IDAT") {
            if (dataEnded || (color === 3 && !palette)) invalid("PNG");
            for (let index = start; index < end && zlibHeader.length < 2; index++) zlibHeader.push(bytes[index]);
            dataSize += length;
        } else if (["acTL", "fcTL", "fdAT"].includes(kind)) {
            throw new HttpError(400, "上传图片：不支持动图，仅支持静态 PNG 和 JPEG 图片。");
        } else if (kind === "IEND") {
            if (length || end + 4 !== bytes.length || dataSize < 6 || zlibHeader.length !== 2
                || (zlibHeader[0] & 15) !== 8 || (zlibHeader[0] >> 4) > 7 || (zlibHeader[1] & 32)
                || ((zlibHeader[0] << 8) + zlibHeader[1]) % 31) invalid("PNG");
            return { contentType: "image/png", width, height, animated: false };
        } else if ((bytes[offset + 4] & 32) === 0) {
            invalid("PNG");
        }
        if (kind !== "IDAT" && dataSize) dataEnded = true;
        offset = end + 4;
    }
    return invalid("PNG");
}

function jpeg(bytes: Uint8Array): ImageInfo {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    let offset = 2;
    let width = 0;
    let height = 0;
    const components = new Set<number>();
    let scans = 0;
    while (offset < bytes.length) {
        if (bytes[offset++] !== 0xff) invalid("JPEG");
        while (bytes[offset] === 0xff) offset++;
        const marker = bytes[offset++];
        if (marker === 0xd9) {
            if (!width || !scans || offset !== bytes.length) invalid("JPEG");
            return { contentType: "image/jpeg", width, height, animated: false };
        }
        if (marker === 0 || marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7) || offset + 2 > bytes.length) invalid("JPEG");
        const length = view.getUint16(offset);
        const start = offset + 2;
        const end = offset + length;
        if (length < 2 || end > bytes.length) invalid("JPEG");
        if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
            if (width || length < 11) invalid("JPEG");
            height = view.getUint16(start + 1);
            width = view.getUint16(start + 3);
            dimensions(width, height);
            const count = bytes[start + 5];
            if (count < 1 || count > 4 || length !== 8 + 3 * count || bytes[start] < 2 || bytes[start] > 16) invalid("JPEG");
            for (let index = start + 6; index < end; index += 3) {
                const sampling = bytes[index + 1];
                if (components.has(bytes[index]) || (sampling >> 4) < 1 || (sampling >> 4) > 4
                    || (sampling & 15) < 1 || (sampling & 15) > 4 || bytes[index + 2] > 3) invalid("JPEG");
                components.add(bytes[index]);
            }
        } else if (marker === 0xdb) {
            let index = start;
            while (index < end) {
                const table = bytes[index++];
                if ((table >> 4) > 1 || (table & 15) > 3) invalid("JPEG");
                index += 64 * ((table >> 4) + 1);
            }
            if (index !== end || index === start) invalid("JPEG");
        } else if (marker === 0xc4) {
            let index = start;
            while (index < end) {
                if (index + 17 > end || (bytes[index] >> 4) > 1 || (bytes[index] & 15) > 3) invalid("JPEG");
                index++;
                let symbols = 0;
                for (let bit = 0; bit < 16; bit++) symbols += bytes[index++];
                if (!symbols || symbols > 256) invalid("JPEG");
                index += symbols;
            }
            if (index !== end || index === start) invalid("JPEG");
        } else if (marker === 0xdd && length !== 4) {
            invalid("JPEG");
        } else if (marker === 0xda) {
            const count = bytes[start];
            if (!width || !count || count > components.size || length !== 6 + count * 2 || ++scans > 100) invalid("JPEG");
            const scanComponents = new Set<number>();
            for (let index = start + 1; index < start + 1 + count * 2; index += 2) {
                if (!components.has(bytes[index]) || scanComponents.has(bytes[index]) || (bytes[index + 1] >> 4) > 3 || (bytes[index + 1] & 15) > 3) invalid("JPEG");
                scanComponents.add(bytes[index]);
            }
            offset = end;
            let entropyBytes = 0;
            while (offset < bytes.length) {
                if (bytes[offset] !== 0xff) {
                    entropyBytes++;
                    offset++;
                } else if (bytes[offset + 1] === 0) {
                    entropyBytes++;
                    offset += 2;
                } else if (bytes[offset + 1] >= 0xd0 && bytes[offset + 1] <= 0xd7) {
                    offset += 2;
                } else {
                    break;
                }
            }
            if (!entropyBytes) invalid("JPEG");
            continue;
        }
        offset = end;
    }
    return invalid("JPEG");
}

// These checks validate container structure and resource bounds, not every compressed
// pixel or metadata stream. Full decoding/re-encoding requires a trusted image codec.
export function inspectImage(bytes: Uint8Array): ImageInfo {
    if (!bytes.length) throw new HttpError(400, "上传图片：图片内容不能为空。");
    if (text(bytes, 0, 8) === "\x89PNG\r\n\x1a\n") return png(bytes);
    if (bytes[0] === 0xff && bytes[1] === 0xd8) return jpeg(bytes);
    throw new HttpError(400, "上传图片：文件内容必须是静态 PNG 或 JPEG 图片。");
}
