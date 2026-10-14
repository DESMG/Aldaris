import { cloudflare } from "@cloudflare/vite-plugin";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { readFileSync } from "node:fs";
import { join } from "node:path";

export default defineConfig({
    root: ".",
    publicDir: "./public",
    server: {
        port: 3000,
        strictPort: true,
    },
    build: {
        outDir: "./dist",
        emptyOutDir: true,
        reportCompressedSize: true,
    },
    environments: {
        client: {
            build: {
                rolldownOptions: {
                    output: {
                        hashCharacters: "hex",
                        entryFileNames: "assets/[name].[hash].js",
                        chunkFileNames: "assets/[name].[hash].js",
                        assetFileNames: "assets/[name].[hash].[ext]",
                    },
                },
            },
        },
    },
    plugins: [react(), cloudflare(), {
        name: "asset-cache-headers",
        apply: "build",
        enforce: "post",
        applyToEnvironment: environment => environment.name === "client",
        generateBundle: {
            order: "post",
            handler(_options, bundle) {
                const names = ["Cache-Control", "CDN-Cache-Control", "Cloudflare-CDN-Cache-Control"];
                const overrides = [
                    ...names.map(name => `  ! ${name}`),
                    ...names.map(name => `  ${name}: public, max-age=2592000, must-revalidate`),
                ].join("\n");
                const rules = Object.keys(bundle).filter(fileName => /\.(?:js|css)$/.test(fileName)).sort()
                    .map(fileName => `/${fileName}\n${overrides}`);
                const source = readFileSync(join(this.environment.config.publicDir, "_headers"), "utf8").trimEnd();
                this.emitFile({ type: "asset", fileName: "_headers", source: `${source}\n\n${rules.join("\n\n")}\n` });
            },
        },
    }],
});
