import { auth, currentUser } from "./auth";

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
    images: string;
    createdAt: string;
    authorId: number | null;
    authorName: string | null;
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

export default {
    async fetch(request, env, ctx) {
        const url = new URL(request.url);
        let cleanup = false;

        try {
            if (!["GET", "HEAD"].includes(request.method) && request.headers.get("Origin") !== url.origin) {
                return Response.json({ error: "请求来源无效。" }, { status: 403 });
            }
            if (url.pathname.startsWith("/api/auth/") || url.pathname.startsWith("/api/admin/users")) return await auth(request, env.DB);
            if (url.pathname === "/api/health" && request.method === "GET") {
                return Response.json({ status: "ok" });
            }
            const user = await currentUser(request, env.DB);
            if (!user) return Response.json({ error: "请先登录。" }, { status: 401, headers: { "Cache-Control": "no-store" } });
            cleanup = true;

            if (url.pathname === "/api/issues" && request.method === "GET") {
                const status = url.searchParams.get("status") ?? "Open";
                const page = Number(url.searchParams.get("page") ?? "1");
                const search = (url.searchParams.get("search") ?? "").trim();
                if (!["Open", "Closed"].includes(status) || !Number.isSafeInteger(page) || page < 1 || page > 1000000) {
                    return Response.json({ error: "获取工单列表：状态或页码无效。" }, { status: 400 });
                }

                const [counts, rows] = await env.DB.batch([
                    env.DB.prepare("SELECT status, COUNT(*) AS total FROM issues WHERE instr(lower(title), lower(?)) > 0 GROUP BY status").bind(search),
                    env.DB.prepare("SELECT issues.*, users.name AS authorName FROM issues LEFT JOIN users ON users.id = issues.authorId WHERE status = ? AND instr(lower(title), lower(?)) > 0 ORDER BY issues.id DESC LIMIT 10 OFFSET ?")
                        .bind(status, search, (page - 1) * 10),
                ]);
                const totals = { Open: 0, Closed: 0 };
                for (const row of counts.results as { status: "Open" | "Closed"; total: number }[]) {
                    totals[row.status] = row.total;
                }
                const issues = (rows.results as IssueRow[]).map((issue) => ({ ...issue, images: JSON.parse(issue.images) }));
                return Response.json({ issues, counts: totals }, { headers: { "Cache-Control": "no-store" } });
            }

            const detailMatch = url.pathname.match(/^\/api\/issues\/(\d+)$/);
            if (detailMatch && request.method === "GET") {
                const issue = await env.DB.prepare("SELECT issues.*, users.name AS authorName FROM issues LEFT JOIN users ON users.id = issues.authorId WHERE issues.id = ?")
                    .bind(detailMatch[1]).first<IssueRow>();
                if (!issue) return Response.json({ error: "未找到该工单。" }, { status: 404 });
                return Response.json({ issue: { ...issue, images: JSON.parse(issue.images) } }, { headers: { "Cache-Control": "no-store" } });
            }

            const replyMatch = url.pathname.match(/^\/api\/issues\/(\d+)\/replies$/);
            if (replyMatch && request.method === "GET") {
                const page = Number(url.searchParams.get("page") ?? "1");
                if (!Number.isSafeInteger(page) || page < 1 || page > 1000000) return Response.json({ error: "回复页码无效。" }, { status: 400 });
                const [count, rows] = await env.DB.batch([
                    env.DB.prepare("SELECT COUNT(*) AS total FROM replies WHERE issueId = ?").bind(replyMatch[1]),
                    env.DB.prepare("SELECT replies.*, users.name AS authorName FROM replies JOIN users ON users.id = replies.authorId WHERE issueId = ? ORDER BY replies.id LIMIT 10 OFFSET ?")
                        .bind(replyMatch[1], (page - 1) * 10),
                ]);
                const total = (count.results[0] as { total: number }).total;
                const replies = (rows.results as ReplyRow[]).map((reply) => ({ ...reply, images: JSON.parse(reply.images) }));
                return Response.json({ replies, total }, { headers: { "Cache-Control": "no-store" } });
            }

            if ((url.pathname === "/api/issues" || replyMatch) && request.method === "POST") {
                if (replyMatch) {
                    const issue = await env.DB.prepare("SELECT id FROM issues WHERE id = ?").bind(replyMatch[1]).first();
                    if (!issue) return Response.json({ error: "回复失败：未找到该工单。" }, { status: 404 });
                }
                const form = await request.formData();
                const title = String(form.get("title") ?? "").trim();
                const description = String(form.get("description") ?? "").trim();
                const priority = String(form.get("priority") ?? "");
                const images = form.getAll("images") as File[];
                if (!replyMatch && (!title || title.length > 200 || !["Low", "Medium", "High"].includes(priority))) {
                    return Response.json({ error: "创建工单：请检查标题、描述长度和优先级。" }, { status: 400 });
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
                            .bind(title, description, priority, JSON.stringify(keys), createdAt, user.id);
                    const result = await statement.run();
                    return Response.json({ id: result.meta.last_row_id }, { status: 201 });
                } catch (error) {
                    if (keys.length > 0) await env.IMAGES.delete(keys);
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
                    const [result] = await env.DB.batch([
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
                    const [result] = await env.DB.batch([
                        env.DB.prepare("UPDATE replies SET description = ?, images = ?, version = version + 1 WHERE id = ? AND version = ?")
                            .bind(description, JSON.stringify([...retained, ...uploaded]), reply.id, reply.version),
                        env.DB.prepare("INSERT OR IGNORE INTO r2_deletions (key) SELECT value FROM json_each(?) WHERE changes() > 0").bind(JSON.stringify(removed)),
                    ]);
                    if (!result.meta.changes) {
                        if (uploaded.length) await env.IMAGES.delete(uploaded);
                        return Response.json({ error: "评论已被修改，请刷新后重试。" }, { status: 409 });
                    }
                } catch (error) {
                    if (uploaded.length) await env.IMAGES.delete(uploaded);
                    throw error;
                }
                return Response.json({ ok: true });
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
                const sql = field === "status" ? "UPDATE issues SET status = ? WHERE id = ?" : "UPDATE issues SET priority = ? WHERE id = ?";
                const result = await env.DB.prepare(sql).bind(value, issueMatch[1]).run();
                if (result.meta.changes === 0) {
                    return Response.json({ error: "更新工单：未找到该工单。" }, { status: 404 });
                }
                return Response.json({ [field]: value });
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
