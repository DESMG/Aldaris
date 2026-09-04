import { cloudflare } from "@cloudflare/vite-plugin";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

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
    },
    environments: {
        client: {
            optimizeDeps: {
                include: [
                    "react",
                    "react-dom/client",
                    "react/jsx-runtime",
                    "react/jsx-dev-runtime",
                    "@mui/material",
                    "@mui/material/Container",
                    "@mui/material/CssBaseline",
                    "@mui/material/styles",
                ],
                holdUntilCrawlEnd: false,
            },
            resolve: {
                conditions: ["mui-modern", "module", "browser", "development|production"],
            },
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
    plugins: [react(), cloudflare()],
});
