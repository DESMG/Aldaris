import type { Env } from "./env";
import type { Notification, User } from "../shared/types";
import { NOTIFICATION_BATCH_LIMIT } from "../shared/limits";
import { readForm } from "./input";

export async function notifications(request: Request, env: Env, user: User) {
    const url = new URL(request.url);
    if (url.pathname === "/api/notifications/unread" && request.method === "GET") {
        const count = await env.DB.prepare("SELECT COUNT(*) AS total FROM notifications WHERE userId = ? AND readAt IS NULL").bind(user.id).first();
        return Response.json(count, { headers: { "Cache-Control": "no-store" } });
    }
    if (url.pathname === "/api/notifications" && request.method === "GET") {
        const before = Number(url.searchParams.get("before") ?? Number.MAX_SAFE_INTEGER);
        const filter = url.searchParams.get("filter") ?? "all";
        if (!Number.isSafeInteger(before) || before < 1 || !["all", "unread"].includes(filter)) return Response.json({ error: "读取通知：游标或筛选条件无效。" }, { status: 400 });
        const rows = await env.DB.prepare(`
            SELECT notifications.id, notifications.issueId, notifications.replyId, notifications.kind,
                notifications.assignmentRole, notifications.createdAt, notifications.readAt,
                users.name AS actorName, issues.title AS issueTitle
            FROM notifications JOIN users ON users.id = notifications.actorId
                JOIN issues ON issues.id = notifications.issueId
            WHERE notifications.userId = ? AND notifications.id < ? AND (? = 'all' OR notifications.readAt IS NULL)
            ORDER BY notifications.id DESC LIMIT ?
        `).bind(user.id, before, filter, NOTIFICATION_BATCH_LIMIT + 1).all<Notification>();
        const page = rows.results.slice(0, NOTIFICATION_BATCH_LIMIT);
        return Response.json({ notifications: page, next: rows.results.length > NOTIFICATION_BATCH_LIMIT ? page.at(-1)!.id : null });
    }
    if (["/api/notifications/read", "/api/notifications/unread", "/api/notifications/delete"].includes(url.pathname) && request.method === "POST") {
        const form = await readForm(request, 8192);
        const ids = [...new Set(form.getAll("id").map(Number))];
        if (!ids.length || ids.length > NOTIFICATION_BATCH_LIMIT || ids.some(id => !Number.isSafeInteger(id) || id < 1)) {
            return Response.json({ error: "操作通知：请选择 1 至 20 条有效通知。" }, { status: 400 });
        }
        if (url.pathname === "/api/notifications/read") {
            const readAt = new Date().toISOString();
            await env.DB.prepare("UPDATE notifications SET readAt = COALESCE(readAt, ?) WHERE userId = ? AND id IN (SELECT value FROM json_each(?))")
        .bind(readAt, user.id, JSON.stringify(ids)).run();
            return Response.json({ readAt });
        }
        if (url.pathname === "/api/notifications/unread") {
            await env.DB.prepare("UPDATE notifications SET readAt = NULL WHERE userId = ? AND id IN (SELECT value FROM json_each(?))")
        .bind(user.id, JSON.stringify(ids)).run();
            return Response.json({ readAt: null });
        }
        await env.DB.prepare("DELETE FROM notifications WHERE userId = ? AND id IN (SELECT value FROM json_each(?))")
            .bind(user.id, JSON.stringify(ids)).run();
        return Response.json({ ok: true });
    }
    const notificationMatch = url.pathname.match(/^\/api\/notifications\/(\d+)\/read$/);
    if (notificationMatch && request.method === "POST") {
        const result = await env.DB.prepare("UPDATE notifications SET readAt = COALESCE(readAt, ?) WHERE id = ? AND userId = ?")
            .bind(new Date().toISOString(), notificationMatch[1], user.id).run();
        if (!result.meta.changes) return Response.json({ error: "标记已读：未找到该通知。" }, { status: 404 });
        return Response.json({ ok: true });
    }


}
