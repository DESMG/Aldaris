import { auth, currentUser } from "./auth";
import { mentionUsernames } from "../shared/mentions";
import { assignmentRoles } from "../shared/assignments";

type Env = {
    DB: D1Database;
    IMAGES: R2Bucket;
};

type IssueRow = {
    id: number;
    title: string;
    description: string;
    priority: string;
    status: "Open" | "Closed";
    stateReason: "completed" | "not_planned" | null;
    images: string;
    createdAt: string;
    authorId: number | null;
    authorName: string | null;
    assignees: string;
    assignmentVersion: number;
};

type ReplyRow = {
    id: number;
    version: number;
    issueId: number;
    authorId: number;
    authorName: string;
    description: string;
    images: string;
    createdAt: string;
};

async function deletePendingImages(env: Env) {
    const pending = await env.DB.prepare("SELECT key FROM r2_deletions LIMIT 100").all<{ key: string }>();
    if (!pending.results.length) return;
    const keys = pending.results.map(row => row.key);
    await env.IMAGES.delete(keys);
    await env.DB.prepare("DELETE FROM r2_deletions WHERE key IN (SELECT value FROM json_each(?))").bind(JSON.stringify(keys)).run();
}

async function rollbackImages(env: Env, keys: string[]) {
    if (!keys.length) return;
    try {
        await env.DB.prepare("INSERT OR IGNORE INTO r2_deletions (key) SELECT value FROM json_each(?)")
            .bind(JSON.stringify(keys)).run();
    } catch (error) {
        console.error("记录 R2 图片回滚任务失败，尝试直接删除", keys, error);
        await env.IMAGES.delete(keys);
    }
}

export default {
    async fetch(request, env, ctx) {
        const url = new URL(request.url);
        let cleanup = false;

        try {
            if (url.pathname === "/api/health" && request.method === "GET") {
                return Response.json({ status: "ok" });
            }
            const publicAction = (url.pathname === "/api/auth/me" && request.method === "GET")
                || (["/api/auth/login", "/api/auth/setup"].includes(url.pathname) && request.method === "POST");
            if (publicAction) {
                if (request.method === "POST" && request.headers.get("Origin") !== url.origin) {
                    return Response.json({ error: "请求来源无效。" }, { status: 403 });
                }
                return await auth(request, env.DB);
            }
            const user = await currentUser(request, env.DB);
            if (!user) return Response.json({ error: "请先登录。" }, { status: 401, headers: { "Cache-Control": "no-store" } });
            if (!["GET", "HEAD"].includes(request.method) && request.headers.get("Origin") !== url.origin) {
                return Response.json({ error: "请求来源无效。" }, { status: 403 });
            }
            if (url.pathname.startsWith("/api/auth/") || url.pathname.startsWith("/api/admin/users")) return await auth(request, env.DB);
            cleanup = true;

            if (["/api/users", "/api/users/mentions"].includes(url.pathname) && request.method === "GET") {
                const search = (url.searchParams.get("search") ?? "").trim();
                if (!/^[a-z0-9_.-]{1,50}$/i.test(search)) {
                    return Response.json({ users: [] }, { headers: { "Cache-Control": "no-store" } });
                }
                const result = await env.DB.prepare("SELECT id, name, username FROM users WHERE deletedAt IS NULL AND instr(lower(username), lower(?)) > 0 ORDER BY username LIMIT 5")
                    .bind(search).all();
                return Response.json({ users: result.results }, { headers: { "Cache-Control": "no-store" } });
            }

            if (url.pathname === "/api/notifications/unread" && request.method === "GET") {
                const count = await env.DB.prepare("SELECT COUNT(*) AS total FROM notifications WHERE userId = ? AND readAt IS NULL").bind(user.id).first();
                return Response.json(count, { headers: { "Cache-Control": "no-store" } });
            }
            if (url.pathname === "/api/notifications" && request.method === "GET") {
                const page = Number(url.searchParams.get("page") ?? "1");
                const filter = url.searchParams.get("filter") ?? "all";
                if (!Number.isSafeInteger(page) || page < 1 || page > 1000000 || !["all", "unread"].includes(filter)) return Response.json({ error: "读取通知：页码或筛选条件无效。" }, { status: 400 });
                const [count, rows] = await env.DB.batch([
                    env.DB.prepare("SELECT COUNT(*) AS total FROM notifications WHERE userId = ? AND (? = 'all' OR readAt IS NULL)").bind(user.id, filter),
                    env.DB.prepare("SELECT notifications.*, users.name AS actorName, issues.title AS issueTitle FROM notifications JOIN users ON users.id = notifications.actorId JOIN issues ON issues.id = notifications.issueId WHERE notifications.userId = ? AND (? = 'all' OR notifications.readAt IS NULL) ORDER BY notifications.id DESC LIMIT 20 OFFSET ?")
                        .bind(user.id, filter, (page - 1) * 20),
                ]);
                return Response.json({ notifications: rows.results, total: (count.results[0] as { total: number }).total }, { headers: { "Cache-Control": "no-store" } });
            }
            if (["/api/notifications/read", "/api/notifications/unread", "/api/notifications/delete"].includes(url.pathname) && request.method === "POST") {
                const form = await request.formData();
                const ids = [...new Set(form.getAll("id").map(Number))];
                if (!ids.length || ids.length > 20 || ids.some(id => !Number.isSafeInteger(id) || id < 1)) {
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

            if (url.pathname === "/api/issues" && request.method === "GET") {
                const status = url.searchParams.get("status") ?? "Open";
                const page = Number(url.searchParams.get("page") ?? "1");
                const search = (url.searchParams.get("search") ?? "").trim();
                if (!["Open", "Closed"].includes(status) || !Number.isSafeInteger(page) || page < 1 || page > 1000000) {
                    return Response.json({ error: "获取工单列表：状态或页码无效。" }, { status: 400 });
                }

                const [counts, rows] = await env.DB.batch([
                    env.DB.prepare("SELECT status, COUNT(*) AS total FROM issues WHERE instr(lower(title), lower(?)) > 0 GROUP BY status").bind(search),
                    env.DB.prepare("SELECT issues.*, users.name AS authorName, (SELECT json_group_array(json_object('id', members.id, 'name', members.name, 'username', members.username, 'role', issue_assignees.role)) FROM issue_assignees JOIN users AS members ON members.id = issue_assignees.userId WHERE issue_assignees.issueId = issues.id AND members.deletedAt IS NULL) AS assignees FROM issues LEFT JOIN users ON users.id = issues.authorId WHERE status = ? AND instr(lower(title), lower(?)) > 0 ORDER BY issues.id DESC LIMIT 10 OFFSET ?")
                        .bind(status, search, (page - 1) * 10),
                ]);
                const totals = { Open: 0, Closed: 0 };
                for (const row of counts.results as { status: "Open" | "Closed"; total: number }[]) {
                    totals[row.status] = row.total;
                }
                const issues = (rows.results as IssueRow[]).map((issue) => ({ ...issue, images: JSON.parse(issue.images), assignees: JSON.parse(issue.assignees) }));
                return Response.json({ issues, counts: totals }, { headers: { "Cache-Control": "no-store" } });
            }

            const detailMatch = url.pathname.match(/^\/api\/issues\/(\d+)$/);
            if (detailMatch && request.method === "GET") {
                const issue = await env.DB.prepare("SELECT issues.*, users.name AS authorName, (SELECT json_group_array(json_object('id', members.id, 'name', members.name, 'username', members.username, 'role', issue_assignees.role)) FROM issue_assignees JOIN users AS members ON members.id = issue_assignees.userId WHERE issue_assignees.issueId = issues.id AND members.deletedAt IS NULL) AS assignees FROM issues LEFT JOIN users ON users.id = issues.authorId WHERE issues.id = ?")
                    .bind(detailMatch[1]).first<IssueRow>();
                if (!issue) return Response.json({ error: "未找到该工单。" }, { status: 404 });
                return Response.json({ issue: { ...issue, images: JSON.parse(issue.images), assignees: JSON.parse(issue.assignees) } }, { headers: { "Cache-Control": "no-store" } });
            }

            const timelineMatch = url.pathname.match(/^\/api\/issues\/(\d+)\/timeline$/);
            if (timelineMatch && request.method === "GET") {
                let page = Number(url.searchParams.get("page") ?? "1");
                if (!Number.isSafeInteger(page) || page < 1 || page > 1000000) return Response.json({ error: "读取时间线：页码无效。" }, { status: 400 });
                const issueId = timelineMatch[1];
                const exists = await env.DB.prepare("SELECT id FROM issues WHERE id = ?").bind(issueId).first();
                if (!exists) return Response.json({ error: "读取时间线：未找到该工单。" }, { status: 404 });
                const timeline = "SELECT id, 'reply' AS kind, authorId AS actorId, createdAt FROM replies WHERE issueId = ? UNION ALL SELECT id, kind, actorId, createdAt FROM issue_events WHERE issueId = ?";
                const target = url.searchParams.get("target");
                if (target) {
                    if (!Number.isSafeInteger(Number(target)) || Number(target) < 1) return Response.json({ error: "时间线定位参数无效。" }, { status: 400 });
                    const reply = await env.DB.prepare("SELECT createdAt FROM replies WHERE issueId = ? AND id = ?").bind(issueId, target).first<{ createdAt: string }>();
                    if (reply) {
                        const position = await env.DB.prepare("SELECT COUNT(*) AS total FROM (" + timeline + ") WHERE createdAt < ? OR (createdAt = ? AND (kind < 'reply' OR (kind = 'reply' AND id <= ?)))").bind(issueId, issueId, reply.createdAt, reply.createdAt, target).first<{ total: number }>();
                        page = Math.max(1, Math.ceil(position!.total / 20));
                    }
                }
                const [count, rows] = await env.DB.batch([
                    env.DB.prepare("SELECT COUNT(*) AS total FROM (" + timeline + ")").bind(issueId, issueId),
                    env.DB.prepare("SELECT t.*, users.name AS actorName, replies.description, replies.images, replies.version, issue_events.details FROM (" + timeline + ") AS t LEFT JOIN users ON users.id = t.actorId LEFT JOIN replies ON t.kind = 'reply' AND replies.id = t.id LEFT JOIN issue_events ON t.kind != 'reply' AND issue_events.id = t.id ORDER BY t.createdAt, t.kind, t.id LIMIT 20 OFFSET ?").bind(issueId, issueId, (page - 1) * 20),
                ]);
                return Response.json({ total: (count.results[0] as { total: number }).total, page, entries: (rows.results as { id: number; kind: string; actorId: number | null; actorName: string | null; createdAt: string; description: string | null; images: string | null; version: number | null; details: string | null }[]).map(row => row.kind === "reply"
                    ? { ...row, authorId: row.actorId, authorName: row.actorName, images: JSON.parse(row.images as string) }
                    : { ...row, details: JSON.parse(row.details as string) }) }, { headers: { "Cache-Control": "no-store" } });
            }

            const replyMatch = url.pathname.match(/^\/api\/issues\/(\d+)\/replies$/);
            if (replyMatch && request.method === "GET") {
                let page = Number(url.searchParams.get("page") ?? "1");
                if (!Number.isSafeInteger(page) || page < 1 || page > 1000000) return Response.json({ error: "回复页码无效。" }, { status: 400 });
                const target = url.searchParams.get("target");
                if (target !== null) {
                    if (!Number.isSafeInteger(Number(target)) || Number(target) < 1) return Response.json({ error: "回复定位参数无效。" }, { status: 400 });
                    const position = await env.DB.prepare("SELECT COUNT(*) AS total FROM replies WHERE issueId = ? AND id <= ?").bind(replyMatch[1], target).first<{ total: number }>();
                    page = Math.max(1, Math.ceil(position!.total / 10));
                }
                const [count, rows] = await env.DB.batch([
                    env.DB.prepare("SELECT COUNT(*) AS total FROM replies WHERE issueId = ?").bind(replyMatch[1]),
                    env.DB.prepare("SELECT replies.*, users.name AS authorName FROM replies JOIN users ON users.id = replies.authorId WHERE issueId = ? ORDER BY replies.id LIMIT 10 OFFSET ?")
                        .bind(replyMatch[1], (page - 1) * 10),
                ]);
                const total = (count.results[0] as { total: number }).total;
                const replies = (rows.results as ReplyRow[]).map((reply) => ({ ...reply, images: JSON.parse(reply.images) }));
                return Response.json({ replies, total, page }, { headers: { "Cache-Control": "no-store" } });
            }

            if ((url.pathname === "/api/issues" || replyMatch) && request.method === "POST") {
                if (replyMatch) {
                    const issue = await env.DB.prepare("SELECT id FROM issues WHERE id = ?").bind(replyMatch[1]).first();
                    if (!issue) return Response.json({ error: "回复失败：未找到该工单。" }, { status: 404 });
                }
                const form = await request.formData();
                const title = String(form.get("title") ?? "").trim();
                const description = String(form.get("description") ?? "").trim();
                if (!replyMatch && assignmentRoles.some(role => form.has(role))) {
                    return Response.json({ error: "创建工单：新建时禁止指定产品、开发或测试人员。" }, { status: 400 });
                }
                if (!replyMatch && form.getAll("priority").some(value => value !== "Low")) {
                    return Response.json({ error: "创建工单：新建时优先级固定为低。" }, { status: 400 });
                }
                const images = form.getAll("images") as File[];
                if (!replyMatch && (!title || title.length > 200)) {
                    return Response.json({ error: "创建工单：标题不能为空且最多 200 个字符。" }, { status: 400 });
                }
                if (description.length > 20000 || (replyMatch && !description && images.length === 0)) {
                    return Response.json({ error: "内容不能为空，文字最多 20000 个字符。" }, { status: 400 });
                }
                if (images.length > 10 || images.some((file) => !["image/png", "image/jpeg", "image/gif", "image/webp"].includes(file.type) || file.size === 0 || file.size > 10 * 1024 * 1024)) {
                    return Response.json({ error: "最多 10 张 PNG、JPEG、GIF 或 WebP 图片，每张不超过 10 MB。" }, { status: 400 });
                }

                const keys: string[] = [];
                try {
                    for (const file of images) {
                        const key = crypto.randomUUID();
                        keys.push(key);
                        await env.IMAGES.put(key, file.stream(), { httpMetadata: { contentType: file.type } });
                    }
                    const createdAt = new Date().toISOString();
                    const statement = replyMatch
                        ? env.DB.prepare("INSERT INTO replies (issueId, authorId, description, images, createdAt) VALUES (?, ?, ?, ?, ?)")
                            .bind(replyMatch[1], user.id, description, JSON.stringify(keys), createdAt)
                        : env.DB.prepare("INSERT INTO issues (title, description, priority, images, createdAt, authorId) VALUES (?, ?, ?, ?, ?, ?)")
                            .bind(title, description, "Low", JSON.stringify(keys), createdAt, user.id);
                    const mentions = JSON.stringify(mentionUsernames(description));
                    const notifications = replyMatch
                        ? env.DB.prepare("INSERT OR IGNORE INTO notifications (userId, actorId, issueId, replyId, kind, source, createdAt) SELECT users.id, ?, replies.issueId, replies.id, 'mention', 'reply:' || replies.id, ? FROM users CROSS JOIN replies WHERE replies.id = (SELECT MAX(id) FROM replies) AND users.deletedAt IS NULL AND users.id != ? AND users.username IN (SELECT value FROM json_each(?))")
                            .bind(user.id, createdAt, user.id, mentions)
                        : env.DB.prepare("INSERT OR IGNORE INTO notifications (userId, actorId, issueId, kind, source, createdAt) SELECT users.id, ?, issues.id, 'mention', 'issue:' || issues.id, ? FROM users CROSS JOIN issues WHERE issues.id = (SELECT MAX(id) FROM issues) AND users.deletedAt IS NULL AND users.id != ? AND users.username IN (SELECT value FROM json_each(?))")
                            .bind(user.id, createdAt, user.id, mentions);
                    const [result] = await env.DB.batch([statement, notifications]);
                    return Response.json({ id: result.meta.last_row_id }, { status: 201 });
                } catch (error) {
                    await rollbackImages(env, keys);
                    throw error;
                }
            }

            const commentMatch = url.pathname.match(/^\/api\/replies\/(\d+)$/);
            if (commentMatch && ["PATCH", "DELETE"].includes(request.method)) {
                const reply = await env.DB.prepare("SELECT * FROM replies WHERE id = ?").bind(commentMatch[1]).first<ReplyRow>();
                if (!reply) return Response.json({ error: "未找到该评论。" }, { status: 404 });
                if (reply.authorId !== user.id && user.role !== "admin") return Response.json({ error: "只有评论作者或管理员可以编辑和删除评论。" }, { status: 403 });
                if (request.headers.get("If-Match") !== `"${reply.version}"`) {
                    return Response.json({ error: "评论已被修改，请刷新后重试。" }, { status: 409 });
                }
                const oldImages: string[] = JSON.parse(reply.images);
                if (request.method === "DELETE") {
                    const [, result] = await env.DB.batch([
                        env.DB.prepare("INSERT INTO issue_events (issueId, actorId, kind, details, createdAt) SELECT issueId, ?, 'reply_deleted', json_object('replyId', id), ? FROM replies WHERE id = ? AND version = ?").bind(user.id, new Date().toISOString(), reply.id, reply.version),
                        env.DB.prepare("DELETE FROM replies WHERE id = ? AND version = ?").bind(reply.id, reply.version),
                        env.DB.prepare("INSERT OR IGNORE INTO r2_deletions (key) SELECT value FROM json_each(?) WHERE changes() > 0").bind(reply.images),
                    ]);
                    if (!result.meta.changes) return Response.json({ error: "评论已被修改，请刷新后重试。" }, { status: 409 });
                    return Response.json({ ok: true });
                }
                const form = await request.formData();
                const description = String(form.get("description") ?? "").trim();
                const retained = form.getAll("retainedImages") as string[];
                const files = form.getAll("images") as File[];
                if (retained.some(key => !oldImages.includes(key)) || new Set(retained).size !== retained.length) return Response.json({ error: "评论图片无效。" }, { status: 400 });
                if (description.length > 20000 || (!description && !retained.length && !files.length)) return Response.json({ error: "评论不能为空，文字最多 20000 个字符。" }, { status: 400 });
                if (retained.length + files.length > 10 || files.some(file => !["image/png", "image/jpeg", "image/gif", "image/webp"].includes(file.type) || !file.size || file.size > 10 * 1024 * 1024)) return Response.json({ error: "最多 10 张图片，每张不超过 10 MB，支持 PNG、JPEG、GIF、WebP。" }, { status: 400 });
                const uploaded: string[] = [];
                try {
                    for (const file of files) {
                        const key = crypto.randomUUID();
                        uploaded.push(key);
                        await env.IMAGES.put(key, file.stream(), { httpMetadata: { contentType: file.type } });
                    }
                    const removed = oldImages.filter(key => !retained.includes(key));
                    const [, , , result] = await env.DB.batch([
                        env.DB.prepare("INSERT INTO issue_events (issueId, actorId, kind, details, createdAt) SELECT issueId, ?, 'reply_edited', json_object('replyId', id), ? FROM replies WHERE id = ? AND version = ?").bind(user.id, new Date().toISOString(), reply.id, reply.version),
                        env.DB.prepare("INSERT OR IGNORE INTO notifications (userId, actorId, issueId, replyId, kind, source, createdAt) SELECT users.id, ?, replies.issueId, replies.id, 'mention', 'reply:' || replies.id, ? FROM users CROSS JOIN replies WHERE replies.id = ? AND replies.version = ? AND users.deletedAt IS NULL AND users.id != ? AND users.username IN (SELECT value FROM json_each(?))")
                            .bind(user.id, new Date().toISOString(), reply.id, reply.version, user.id, JSON.stringify(mentionUsernames(description))),
                        env.DB.prepare("INSERT OR IGNORE INTO r2_deletions (key) SELECT value FROM json_each(?) WHERE EXISTS (SELECT 1 FROM replies WHERE id = ? AND version = ?)").bind(JSON.stringify(removed), reply.id, reply.version),
                        env.DB.prepare("UPDATE replies SET description = ?, images = ?, version = version + 1 WHERE id = ? AND version = ?")
                            .bind(description, JSON.stringify([...retained, ...uploaded]), reply.id, reply.version),
                    ]);
                    if (!result.meta.changes) {
                        await rollbackImages(env, uploaded);
                        return Response.json({ error: "评论已被修改，请刷新后重试。" }, { status: 409 });
                    }
                } catch (error) {
                    await rollbackImages(env, uploaded);
                    throw error;
                }
                return Response.json({ ok: true });
            }

            const assignmentMatch = url.pathname.match(/^\/api\/issues\/(\d+)\/assignees$/);
            if (assignmentMatch && request.method === "POST") {
                const issue = await env.DB.prepare("SELECT authorId, assignmentVersion FROM issues WHERE id = ?").bind(assignmentMatch[1]).first<{ authorId: number | null; assignmentVersion: number }>();
                if (!issue) return Response.json({ error: "指派失败：未找到该工单。" }, { status: 404 });
                if (user.role !== "admin" && issue.authorId !== user.id) return Response.json({ error: "只有作者或管理员可以指派负责人。" }, { status: 403 });
                if (request.headers.get("If-Match") !== `"${issue.assignmentVersion}"`) return Response.json({ error: "指派失败：负责人已被修改，请刷新页面后重新编辑。" }, { status: 409 });
                const form = await request.formData();
                const assignees = assignmentRoles.flatMap(role => [...new Set(form.getAll(role).map(Number))].map(userId => ({ role, userId })));
                if (assignees.some(entry => !Number.isSafeInteger(entry.userId) || entry.userId < 1)) return Response.json({ error: "指派失败：负责人无效。" }, { status: 400 });
                const members = await env.DB.prepare("SELECT COUNT(*) AS total FROM users WHERE deletedAt IS NULL AND id IN (SELECT json_extract(value, '$.userId') FROM json_each(?))").bind(JSON.stringify(assignees)).first<{ total: number }>();
                if (members!.total !== new Set(assignees.map(entry => entry.userId)).size) return Response.json({ error: "指派失败：负责人不存在或已被删除。" }, { status: 400 });
                const [, , , , result, rows] = await env.DB.batch([
                    env.DB.prepare("INSERT INTO issue_events (issueId, actorId, kind, details, createdAt) SELECT id, ?, 'assignment', json_object('before', json((SELECT json_group_array(json_object('userId', userId, 'role', role, 'name', (SELECT name FROM users WHERE id = userId))) FROM issue_assignees WHERE issueId = issues.id)), 'after', json((SELECT json_group_array(json_object('userId', users.id, 'role', json_extract(value, '$.role'), 'name', users.name)) FROM json_each(?) JOIN users ON users.id = json_extract(value, '$.userId')))), ? FROM issues WHERE id = ? AND assignmentVersion = ? AND (EXISTS (SELECT userId, role FROM issue_assignees WHERE issueId = issues.id EXCEPT SELECT json_extract(value, '$.userId'), json_extract(value, '$.role') FROM json_each(?)) OR EXISTS (SELECT json_extract(value, '$.userId'), json_extract(value, '$.role') FROM json_each(?) EXCEPT SELECT userId, role FROM issue_assignees WHERE issueId = issues.id))")
                        .bind(user.id, JSON.stringify(assignees), new Date().toISOString(), assignmentMatch[1], issue.assignmentVersion, JSON.stringify(assignees), JSON.stringify(assignees)),
                    env.DB.prepare("INSERT INTO notifications (userId, actorId, issueId, kind, source, createdAt, assignmentRole) SELECT users.id, ?, ?, 'assignment', ? || ':' || json_extract(value, '$.role'), ?, json_extract(value, '$.role') FROM json_each(?) JOIN users ON users.id = json_extract(value, '$.userId') WHERE users.deletedAt IS NULL AND users.id != ? AND NOT EXISTS (SELECT 1 FROM issue_assignees WHERE issueId = ? AND userId = users.id AND role = json_extract(value, '$.role')) AND EXISTS (SELECT 1 FROM issues WHERE id = ? AND assignmentVersion = ?)")
                        .bind(user.id, assignmentMatch[1], crypto.randomUUID(), new Date().toISOString(), JSON.stringify(assignees), user.id, assignmentMatch[1], assignmentMatch[1], issue.assignmentVersion),
                    env.DB.prepare("DELETE FROM issue_assignees WHERE issueId = ? AND EXISTS (SELECT 1 FROM issues WHERE id = ? AND assignmentVersion = ?)").bind(assignmentMatch[1], assignmentMatch[1], issue.assignmentVersion),
                    env.DB.prepare("INSERT INTO issue_assignees (issueId, userId, role) SELECT ?, users.id, json_extract(value, '$.role') FROM json_each(?) JOIN users ON users.id = json_extract(value, '$.userId') WHERE users.deletedAt IS NULL AND EXISTS (SELECT 1 FROM issues WHERE id = ? AND assignmentVersion = ?)").bind(assignmentMatch[1], JSON.stringify(assignees), assignmentMatch[1], issue.assignmentVersion),
                    env.DB.prepare("UPDATE issues SET assignmentVersion = assignmentVersion + 1 WHERE id = ? AND assignmentVersion = ?").bind(assignmentMatch[1], issue.assignmentVersion),
                    env.DB.prepare("SELECT users.id, users.name, users.username, issue_assignees.role FROM issue_assignees JOIN users ON users.id = issue_assignees.userId WHERE issueId = ? ORDER BY issue_assignees.role, users.username").bind(assignmentMatch[1]),
                ]);
                if (!result.meta.changes) return Response.json({ error: "指派失败：负责人已被修改，请刷新页面后重新编辑。" }, { status: 409 });
                return Response.json({ assignees: rows.results, assignmentVersion: issue.assignmentVersion + 1 });
            }

            const issueMatch = url.pathname.match(/^\/api\/issues\/(\d+)\/(status|priority)$/);
            if (issueMatch && request.method === "POST") {
                const issue = await env.DB.prepare("SELECT authorId FROM issues WHERE id = ?").bind(issueMatch[1]).first<{ authorId: number | null }>();
                if (!issue) return Response.json({ error: "未找到该工单。" }, { status: 404 });
                if (user.role !== "admin" && issue.authorId !== user.id) {
                    return Response.json({ error: "只有作者或管理员可以更改状态和优先级。" }, { status: 403 });
                }
                const form = await request.formData();
                const field = issueMatch[2];
                const value = String(form.get(field) ?? "");
                const allowed = field === "status" ? ["Open", "Closed"] : ["Low", "Medium", "High"];
                if (!allowed.includes(value)) {
                    return Response.json({ error: "更新工单：状态或优先级无效。" }, { status: 400 });
                }
                const stateReason = value === "Closed" ? String(form.get("stateReason") ?? "") : null;
                if (field === "status" && value === "Closed" && !["completed", "not_planned"].includes(stateReason!)) return Response.json({ error: "关闭工单：请选择已完成或已关闭。" }, { status: 400 });
                const createdAt = new Date().toISOString();
                await env.DB.batch(field === "status" ? [
                    env.DB.prepare("INSERT INTO issue_events (issueId, actorId, kind, details, createdAt) SELECT id, ?, 'status', json_object('before', status, 'after', ?, 'stateReason', ?), ? FROM issues WHERE id = ? AND (status != ? OR stateReason IS NOT ?)").bind(user.id, value, stateReason, createdAt, issueMatch[1], value, stateReason),
                    env.DB.prepare("UPDATE issues SET status = ?, stateReason = ? WHERE id = ?").bind(value, stateReason, issueMatch[1]),
                ] : [
                    env.DB.prepare("INSERT INTO issue_events (issueId, actorId, kind, details, createdAt) SELECT id, ?, 'priority', json_object('before', priority, 'after', ?), ? FROM issues WHERE id = ? AND priority != ?").bind(user.id, value, createdAt, issueMatch[1], value),
                    env.DB.prepare("UPDATE issues SET priority = ? WHERE id = ?").bind(value, issueMatch[1]),
                ]);
                return Response.json(field === "status" ? { status: value, stateReason } : { priority: value });
            }

            const imageMatch = url.pathname.match(/^\/api\/images\/([a-f0-9-]{36})$/);
            if (imageMatch && request.method === "GET") {
                const image = await env.IMAGES.get(imageMatch[1]);
                if (!image) return new Response("Image not found", { status: 404 });
                const headers = new Headers({ "X-Content-Type-Options": "nosniff", "Cache-Control": "private, no-store" });
                image.writeHttpMetadata(headers);
                headers.set("ETag", image.httpEtag);
                return new Response(image.body, { headers });
            }

            return Response.json({ error: "未找到该 API。" }, { status: 404 });
        } catch (error) {
            console.error(`${request.method} ${url.pathname} failed`, error);
            return Response.json({ error: "请求处理失败，请稍后重试。" }, { status: 500 });
        } finally {
            if (cleanup) ctx.waitUntil(deletePendingImages(env).catch(error => {
                console.error("清理 R2 图片失败，保留任务等待重试", error);
            }));
        }
    },
} satisfies ExportedHandler<Env>;
