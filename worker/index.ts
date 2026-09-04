import { auth } from "./auth";
import { currentUser } from "./jwt";
import { issues } from "./issues";
import { notifications } from "./notifications";
import { deletePendingImages } from "./image-cleanup";
import { HttpError } from "./input";
import { securityHeaders } from "./security";
import type { Env } from "./env";

function apiError(message: string) {
    return message.replace(/[。.]+$/, "");
}

async function route(request: Request, env: Env, ctx: ExecutionContext) {
    const url = new URL(request.url);
    if (url.pathname === "/api/health" && request.method === "GET") return Response.json({ status: "ok" });
    if (!["GET", "HEAD"].includes(request.method) && request.headers.get("Origin") !== url.origin) throw new HttpError(403, "请求来源无效。");
    const publicAction = ["/api/auth/login", "/api/auth/setup"].includes(url.pathname) && request.method === "POST";
    const user = publicAction ? null : await currentUser(request, env);
    if (publicAction || url.pathname === "/api/auth/me" || url.pathname.startsWith("/api/auth/") || url.pathname === "/api/operations" || url.pathname.startsWith("/api/admin/")) return auth(request, env, user);
    if (!user) throw new HttpError(401, "请先登录。");
    try {
        if (["/api/users", "/api/users/mentions"].includes(url.pathname) && request.method === "GET") {
            const search = (url.searchParams.get("search") ?? "").trim();
            const role = url.pathname === "/api/users" ? url.searchParams.get("role") : null;
            if (role !== null && !["admin", "user"].includes(role)) throw new HttpError(400, "搜索用户：账户角色无效。");
            if (!/^[a-z0-9_.-]{1,50}$/i.test(search)) return Response.json({ users: [] });
            const result = await env.DB.prepare(`
                SELECT id, name, username FROM users
                WHERE deletedAt IS NULL AND instr(lower(username), lower(?)) > 0
                    AND (? IS NULL OR role = ?) ORDER BY username LIMIT 5
            `).bind(search, role, role).all();
            return Response.json({ users: result.results });
        }
        if (url.pathname.startsWith("/api/notifications")) {
            const response = await notifications(request, env, user);
            if (response) return response;
        }
        if (url.pathname.startsWith("/api/issues") || url.pathname.startsWith("/api/replies")) {
            const response = await issues(request, env, user);
            if (response) return response;
        }
        const imageMatch = url.pathname.match(/^\/api\/images\/([a-f0-9-]{36})$/);
        if (imageMatch && request.method === "GET") {
            const image = await env.IMAGES.get(imageMatch[1]);
            if (!image) throw new HttpError(404, "图片不存在或已清理。");
            const headers = new Headers();
            image.writeHttpMetadata(headers);
            headers.set("ETag", image.httpEtag);
            return new Response(image.body, { headers });
        }
        throw new HttpError(404, "未找到该 API。");
    } finally {
        ctx.waitUntil(deletePendingImages(env).catch(error => {
            console.error("清理 R2 图片失败，保留任务等待重试", error);
        }));
    }
}

export default {
    async fetch(request, env, ctx) {
        let response: Response;
        try { response = await route(request, env, ctx); }
        catch (error) {
            if (error instanceof HttpError) response = Response.json({ error: apiError(error.message) }, { status: error.status, headers: error.headers });
            else {
                console.error(`${request.method} ${new URL(request.url).pathname} failed`, error);
                response = Response.json({ error: "请求处理失败，请稍后重试" }, { status: 500 });
            }
        }
        const headers = new Headers(response.headers);
        for (const [name, value] of Object.entries(securityHeaders)) headers.set(name, value);
        headers.set("Cache-Control", "private, no-store");
        return new Response(response.body, { status: response.status, headers });
    },
} satisfies ExportedHandler<Env>;
