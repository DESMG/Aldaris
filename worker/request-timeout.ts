import { HttpError } from "../shared/http-error.ts";

export async function withRequestTimeout(handle: (signal: AbortSignal) => Promise<Response>) {
    const controller = new AbortController();
    const error = new HttpError(504, "请求处理超时，请检查结果后重试。");
    let timer: ReturnType<typeof setTimeout>;
    const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
            reject(error);
            controller.abort(error);
        }, 5000);
    });
    try {
        return await Promise.race([timeout, (async () => {
            const response = await handle(controller.signal);
            if (controller.signal.aborted) {
                void response.body?.cancel().catch(() => {});
                throw error;
            }
            if (!response.body) return response;
            const reader = response.body.getReader();
            const cancel = () => { void reader.cancel().catch(() => {}); };
            controller.signal.addEventListener("abort", cancel, { once: true });
            const chunks: Uint8Array[] = [];
            try {
                while (true) {
                    const { done, value } = await reader.read();
                    controller.signal.throwIfAborted();
                    if (done) break;
                    chunks.push(value);
                }
                return new Response(new Blob(chunks), { status: response.status, headers: response.headers });
            } finally {
                controller.signal.removeEventListener("abort", cancel);
                reader.releaseLock();
            }
        })()]);
    } finally {
        clearTimeout(timer!);
    }
}
