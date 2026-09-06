import { auth } from "./auth";
import { currentUser } from "./jwt";
import { issues } from "./issues";
import { notifications } from "./notifications";
import { reconcileImages } from "./image-cleanup";
import { HttpError } from "./input";
import { securityHeaders } from "./security";
import type { Env } from "./env";

function apiError(message: string) {
    return message.replace(/[。.]+$/, "");
}

async function route(request: Request, env: Env) {
    const url = new URL(request.url);
    if (url.pathname === "/api/health" && request.method === "GET") return Response.json({ status: "ok" });
    if (!["GET", "HEAD"].includes(request.method) && request.headers.get("Origin") !== url.origin) throw new HttpError(403, "请求来源无效。");
    const publicAction = ["/api/auth/login", "/api/auth/setup"].includes(url.pathname) && request.method === "POST";
    const user = publicAction ? null : await currentUser(request, env);
    if (publicAction || url.pathname === "/api/auth/me" || url.pathname.startsWith("/api/auth/") || url.pathname === "/api/operations" || url.pathname.startsWith("/api/admin/")) return auth(request, env, user);
    if (!user) throw new HttpError(401, "请先登录。");
    if (["/api/users", "/api/users/mentions"].includes(url.pathname) && request.method === "GET") {
        const search = (url.searchParams.get("search") ?? "").trim();
        const role = url.pathname === "/api/users" ? url.searchParams.get("role") : null;
        if (role !== null && !["admin", "user"].includes(role)) throw new HttpError(400, "搜索用户：账户角色无效。");
        if (!/^[a-z0-9]{1,32}$/i.test(search)) return Response.json({ users: [] });
        const result = await env.DB.prepare(`
            SELECT id, name, username FROM users
            WHERE deletedAt IS NULL AND instr(lower(username), lower(?)) > 0
                AND (? IS NULL OR role = ?) ORDER BY username = lower(?) DESC, username LIMIT 5
        `).bind(search, role, role, search).all();
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
        const record = await env.DB.prepare("SELECT state FROM images WHERE key = ?").bind(imageMatch[1]).first<{ state: string }>();
        if (record?.state === "deleting" || record?.state === "deleted") throw new HttpError(410, "[图片已被清理]");
        if (record?.state !== "active") throw new HttpError(404, "图片不存在。");
        const image = await env.IMAGES.get(imageMatch[1]);
        if (!image) {
            const cleared = await env.DB.prepare("SELECT 1 FROM images WHERE key = ? AND state IN ('deleting', 'deleted')").bind(imageMatch[1]).first();
            if (cleared) throw new HttpError(410, "[图片已被清理]");
            throw new HttpError(404, "图片不存在。");
        }
        const headers = new Headers();
        image.writeHttpMetadata(headers);
        headers.set("ETag", image.httpEtag);
        return new Response(image.body, { headers });
    }
    throw new HttpError(404, "未找到该 API。");
}

export default {
    async fetch(request, env) {
        let response: Response;
        try { response = await route(request, env); }
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
    async scheduled(_event, env) {
        await reconcileImages(env);
    },
} satisfies ExportedHandler<Env>;
