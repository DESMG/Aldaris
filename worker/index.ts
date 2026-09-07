import { WorkerEntrypoint } from "cloudflare:workers";
import { auth } from "./auth";
import { currentUser } from "./jwt";
import { issues } from "./issues";
import { reconcileImages } from "./image-cleanup";
import { HttpError } from "./input";
import { securityHeaders } from "./security";
import type { Env } from "./env";
import { withRequestTimeout } from "./request-timeout";

function apiError(message: string) {
    return message.replace(/[。.]+$/, "");
}

// Only the authenticated default entrypoint calls this through ctx.exports.
export class Images extends WorkerEntrypoint<Env> {
    async fetch(request: Request) {
        try {
            return await withRequestTimeout(async signal => {
                signal.throwIfAborted();
                const key = new URL(request.url).pathname.slice(1);
                const image = await this.env.IMAGES.get(key);
                if (!image) return new Response(null, { status: 404, headers: {
                    "Cache-Control": "no-store",
                    "CDN-Cache-Control": "no-store",
                    "Cloudflare-CDN-Cache-Control": "no-store",
                } });
                const headers = new Headers();
                image.writeHttpMetadata(headers);
                headers.set("ETag", image.httpEtag);
                headers.set("Cache-Control", "public, max-age=2592000");
                headers.set("CDN-Cache-Control", "public, max-age=2592000");
                headers.set("Cloudflare-CDN-Cache-Control", "public, max-age=2592000");
                return new Response(image.body, { headers });
            });
        } catch (error) {
            if (!(error instanceof HttpError) || error.status !== 504) throw error;
            return Response.json({ error: apiError(error.message) }, { status: 504, headers: {
                "Cache-Control": "no-store",
                "CDN-Cache-Control": "no-store",
                "Cloudflare-CDN-Cache-Control": "no-store",
            } });
        }
    }
}

async function route(request: Request, env: Env, ctx: ExecutionContext) {
    env.signal?.throwIfAborted();
    const url = new URL(request.url);
    if (!["GET", "HEAD"].includes(request.method) && request.headers.get("Origin") !== url.origin) throw new HttpError(403, "请求来源无效。");
    const publicAction = url.pathname === "/api/auth/login" && request.method === "POST";
    const user = publicAction ? null : await currentUser(request, env);
    env.signal?.throwIfAborted();
    if (publicAction || url.pathname === "/api/auth/me" || url.pathname.startsWith("/api/auth/") || url.pathname === "/api/operations" || url.pathname.startsWith("/api/admin/")) return auth(request, env, user);
    if (!user) throw new HttpError(401, "请先登录。");
    if (["/api/users", "/api/users/mentions"].includes(url.pathname) && request.method === "GET") {
        const search = (url.searchParams.get("search") ?? "").trim();
        const role = url.pathname === "/api/users" ? url.searchParams.get("role") : null;
        if (role !== null && !["admin", "user"].includes(role)) throw new HttpError(400, "搜索用户：账户角色无效。");
        if (!/^[a-z0-9]{1,32}$/i.test(search)) return Response.json({ users: [] });
        env.signal?.throwIfAborted();
        const result = await env.DB.prepare(`
            SELECT id, name, username FROM users
            WHERE deletedAt IS NULL AND instr(lower(username), lower(?)) > 0
                AND (? IS NULL OR role = ?) ORDER BY username = lower(?) DESC, username LIMIT 5
        `).bind(search, role, role, search).all();
        return Response.json({ users: result.results });
    }
    if (url.pathname.startsWith("/api/issues") || url.pathname.startsWith("/api/replies")) {
        const response = await issues(request, env, user);
        if (response) return response;
    }
    const imageMatch = url.pathname.match(/^\/api\/images\/([a-f0-9-]{36}\.(?:png|jpg))$/);
    if (imageMatch && request.method === "GET") {
        env.signal?.throwIfAborted();
        const record = await env.DB.prepare("SELECT state FROM images WHERE key = ?").bind(imageMatch[1]).first<{ state: string }>();
        if (record?.state === "deleting" || record?.state === "deleted") throw new HttpError(410, "[图片已被清理]");
        if (record?.state !== "active") throw new HttpError(404, "图片不存在。");
        // Forward only the object path; credentials, query, Range and conditions stay here.
        env.signal?.throwIfAborted();
        const response = await ctx.exports.Images.fetch(new Request(new URL(`/${imageMatch[1]}`, url.origin), { signal: request.signal }));
        if (response.status === 404) {
            env.signal?.throwIfAborted();
            const cleared = await env.DB.prepare("SELECT 1 FROM images WHERE key = ? AND state IN ('deleting', 'deleted')").bind(imageMatch[1]).first();
            if (cleared) throw new HttpError(410, "[图片已被清理]");
            throw new HttpError(404, "图片不存在。");
        }
        if (!response.ok) throw new HttpError(response.status === 504 ? 504 : 502, `读取图片 ${imageMatch[1]}：内部取图入口返回 HTTP ${response.status}。`);
        const headers = new Headers(response.headers);
        headers.set("Cache-Control", "private, max-age=2592000");
        headers.set("CDN-Cache-Control", "no-store");
        headers.set("Cloudflare-CDN-Cache-Control", "no-store");
        headers.set("Vary", "Authorization, Host");
        if (request.headers.get("If-None-Match")?.split(",").some(value => value.trim().replace(/^W\//, "") === headers.get("ETag") || value.trim() === "*")) {
            return new Response(null, { status: 304, headers });
        }
        return new Response(response.body, { headers });
    }
    throw new HttpError(404, "未找到该 API。");
}

export default {
    async fetch(request, env, ctx) {
        let response: Response;
        try {
            response = await withRequestTimeout(signal => route(new Request(request, { signal }), {
                DB: env.DB, IMAGES: env.IMAGES, signal, waitUntil: promise => ctx.waitUntil(promise),
            }, ctx));
        }
        catch (error) {
            if (error instanceof HttpError) response = Response.json({ error: apiError(error.message) }, { status: error.status, headers: error.headers });
            else {
                console.error(`${request.method} ${new URL(request.url).pathname} failed`, error);
                response = Response.json({ error: "请求处理失败，请稍后重试" }, { status: 500 });
            }
        }
        const headers = new Headers({
            "Cache-Control": "private, no-store",
            "CDN-Cache-Control": "no-store",
            "Cloudflare-CDN-Cache-Control": "no-store",
        });
        for (const [name, value] of response.headers) headers.set(name, value);
        for (const [name, value] of Object.entries(securityHeaders)) headers.set(name, value);
        return new Response(response.body, { status: response.status, headers });
    },
    async scheduled(_event, env) {
        await reconcileImages(env);
    },
} satisfies ExportedHandler<Env>;
