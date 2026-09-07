export type Env = { DB: D1Database; IMAGES: R2Bucket; signal?: AbortSignal; waitUntil?: (promise: Promise<unknown>) => void };

declare global {
    namespace Cloudflare {
        interface GlobalProps {
            mainModule: typeof import("./index");
        }
    }
}
