import { readdirSync, readFileSync } from "node:fs";
import { brotliCompressSync, constants, gzipSync, zstdCompressSync } from "node:zlib";

const assets = new URL("./dist/client/assets/", import.meta.url);
const files = readdirSync(assets).filter(file => file.endsWith(".js"));

let gzipSize = 0;
let brotliSize = 0;
let zstdSize = 0;

for (const file of files) {
    const source = readFileSync(new URL(file, assets));
    gzipSize += gzipSync(source, { level: 8 }).byteLength;
    brotliSize += brotliCompressSync(source, {
        params: { [constants.BROTLI_PARAM_QUALITY]: 4 },
    }).byteLength;
    zstdSize += zstdCompressSync(source, {
        params: { [constants.ZSTD_c_compressionLevel]: 3 },
    }).byteLength;
}

console.log(`Gzip 8: ${(gzipSize / 1024).toFixed(2)} KiB`);
console.log(`Brotli 4: ${(brotliSize / 1024).toFixed(2)} KiB`);
console.log(`Zstandard 3: ${(zstdSize / 1024).toFixed(2)} KiB`);
