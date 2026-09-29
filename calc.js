import { readdirSync, readFileSync } from "node:fs";
import { brotliCompressSync, constants, zstdCompressSync } from "node:zlib";

const assets = new URL("./dist/client/assets/", import.meta.url);
const files = readdirSync(assets).filter(file => file.endsWith(".js"));
let brotliSize = 0;
let zstdSize = 0;

for (const file of files) {
    const source = readFileSync(new URL(file, assets));
    brotliSize += brotliCompressSync(source, {
        params: { [constants.BROTLI_PARAM_QUALITY]: 11 },
    }).byteLength;
    zstdSize += zstdCompressSync(source, {
        params: { [constants.ZSTD_c_compressionLevel]: 19 },
    }).byteLength;
}

console.log(`Brotli 11: ${(brotliSize / 1024).toFixed(2)} KiB`);
console.log(`Zstandard 19: ${(zstdSize / 1024).toFixed(2)} KiB`);
