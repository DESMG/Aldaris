import type { Env } from "./env";
import type { User } from "../shared/types";
import { mentionUsernames } from "../shared/mentions";
import { assignmentAccountRoles, assignmentRoles } from "../shared/assignments";
import { ASSIGNEE_MAX_COUNT, UPLOAD_BODY_MAX_BYTES, TITLE_MAX_LENGTH, DESCRIPTION_MAX_LENGTH } from "../shared/limits";
import { readForm, HttpError } from "./input";
import { readImages } from "./images";
import { rollbackImages } from "./image-cleanup";
import { timeline } from "./timeline";
import { createHash } from "node:crypto";
import { recordOperation } from "./operation-record";

type IssueRow = Omit<import("../shared/types").Issue, "images" | "assignees"> & { images: string; assignees: string };

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


export async function issues(request: Request, env: Env, user: User) {
    const url = new URL(request.url);
    if (url.pathname === "/api/issues" && request.method === "GET") {
        const status = url.searchParams.get("status") ?? "Open";
        const page = Number(url.searchParams.get("page") ?? "1");
        const search = (url.searchParams.get("search") ?? "").trim();
        if (!["Open", "Closed"].includes(status) || !Number.isSafeInteger(page) || page < 1 || page > 1000000) {
            return Response.json({ error: "获取工单列表：状态或页码无效。" }, { status: 400 });
        }

        const [counts, rows] = await env.DB.batch([
            env.DB.prepare("SELECT status, COUNT(*) AS total FROM issues WHERE instr(lower(title), lower(?)) > 0 GROUP BY status").bind(search),
            env.DB.prepare(`
                SELECT issues.id, issues.title, issues.priority, issues.status,
                    issues.stateReason, issues.createdAt, users.name AS authorName,
                    (
                        SELECT json_group_array(json_object(
                            'id', members.id, 'name', members.name,
                            'role', issue_assignees.role
                        ))
                        FROM issue_assignees
                        JOIN users AS members ON members.id = issue_assignees.userId
                        WHERE issue_assignees.issueId = issues.id
                            AND members.deletedAt IS NULL
                    ) AS assignees
                FROM issues
                LEFT JOIN users ON users.id = issues.authorId
                WHERE status = ?
                    AND instr(lower(title), lower(?)) > 0
                ORDER BY issues.id DESC LIMIT 10 OFFSET ?
            `)
                .bind(status, search, (page - 1) * 10),
        ]);
        const totals = { Open: 0, Closed: 0 };
        for (const row of counts.results as { status: "Open" | "Closed"; total: number }[]) {
            totals[row.status] = row.total;
        }
        const issues = (rows.results as (Omit<import('../shared/types').IssueSummary, 'assignees'> & { assignees: string })[]).map((issue) => ({ ...issue, assignees: JSON.parse(issue.assignees) }));
        return Response.json({ issues, counts: totals }, { headers: { "Cache-Control": "no-store" } });
    }

    const detailMatch = url.pathname.match(/^\/api\/issues\/(\d+)$/);
    if (detailMatch && request.method === "GET") {
        const issue = await env.DB.prepare(`
                SELECT issues.id, issues.title, issues.description,
                    (SELECT json_group_array(key) FROM (SELECT key FROM images
                        WHERE images.issueId = issues.id AND state = 'active' ORDER BY position)) AS images,
                    issues.priority, issues.status, issues.stateReason, issues.createdAt,
                    issues.authorId, issues.assignmentVersion, issues.version,
                    users.name AS authorName,
                    (
                        SELECT json_group_array(json_object(
                            'id', members.id, 'name', members.name,
                            'username', members.username, 'role', issue_assignees.role
                        ))
                        FROM issue_assignees
                        JOIN users AS members ON members.id = issue_assignees.userId
                        WHERE issue_assignees.issueId = issues.id
                            AND members.deletedAt IS NULL
                    ) AS assignees
                FROM issues
                LEFT JOIN users ON users.id = issues.authorId
                WHERE issues.id = ?
            `)
            .bind(detailMatch[1]).first<IssueRow>();
        if (!issue) return Response.json({ error: "未找到该工单。" }, { status: 404 });
        return Response.json({ issue: { ...issue, images: JSON.parse(issue.images), assignees: JSON.parse(issue.assignees) } }, { headers: { "Cache-Control": "no-store" } });
    }

    const timelineMatch = url.pathname.match(/^\/api\/issues\/(\d+)\/timeline$/);
    if (timelineMatch && request.method === "GET") return timeline(request, env, timelineMatch[1]);
    const replyMatch = url.pathname.match(/^\/api\/issues\/(\d+)\/replies$/);
    const singleReply = url.pathname.match(/^\/api\/replies\/(\d+)$/);
    if (singleReply && request.method === "GET") {
        const reply = await env.DB.prepare(`
            SELECT replies.id, replies.version, replies.authorId, users.name AS authorName,
                replies.description, replies.createdAt,
                (SELECT json_group_array(key) FROM (SELECT key FROM images
                    WHERE images.replyId = replies.id AND state = 'active' ORDER BY position)) AS images
            FROM replies JOIN users ON users.id = replies.authorId WHERE replies.id = ?
        `).bind(singleReply[1]).first<ReplyRow>();
        if (!reply) throw new HttpError(404, "该评论已被删除。");
        return Response.json({ reply: { ...reply, images: JSON.parse(reply.images) } });
    }

    if ((url.pathname === "/api/issues" || replyMatch) && request.method === "POST") {
        if (replyMatch) {
            const issue = await env.DB.prepare("SELECT id FROM issues WHERE id = ?").bind(replyMatch[1]).first();
            if (!issue) return Response.json({ error: "回复失败：未找到该工单。" }, { status: 404 });
        }
        const form = await readForm(request, UPLOAD_BODY_MAX_BYTES);
        const title = String(form.get("title") ?? "").trim();
        const description = String(form.get("description") ?? "").trim();
        if (!replyMatch && assignmentRoles.some(role => form.has(role))) {
            return Response.json({ error: "创建工单：新建时禁止指定产品、开发或测试人员。" }, { status: 400 });
        }
        if (!replyMatch && form.getAll("priority").some(value => value !== "Low")) {
            return Response.json({ error: "创建工单：新建时优先级固定为低。" }, { status: 400 });
        }
        const images = await readImages(form);
        if (!replyMatch && (!title || title.length > TITLE_MAX_LENGTH)) {
            return Response.json({ error: "创建工单：标题不能为空且最多 200 个字符。" }, { status: 400 });
        }
        if (description.length > DESCRIPTION_MAX_LENGTH || (replyMatch && !description && images.length === 0)) {
            return Response.json({ error: "内容不能为空，文字最多 20000 个字符。" }, { status: 400 });
        }
        const requestKey = request.headers.get("Idempotency-Key") ?? "";
        if (!/^[a-f0-9-]{36}$/i.test(requestKey)) throw new HttpError(400, "提交标识无效，请重新打开编辑器。");
        const fingerprintHash = createHash("sha256").update(JSON.stringify([title, description]));
        for (const file of images) {
            fingerprintHash.update(file.contentType).update(String(file.bytes.length)).update(file.bytes);
        }
        const fingerprint = fingerprintHash.digest("hex");
        const previous = await env.DB.prepare("SELECT route, fingerprint, resourceId FROM mutation_requests WHERE userId = ? AND requestKey = ?")
            .bind(user.id, requestKey).first<{ route: string; fingerprint: string; resourceId: number }>();
        if (previous) {
            if (previous.route !== url.pathname || previous.fingerprint !== fingerprint) throw new HttpError(409, "此提交标识已用于其他内容，请重新提交。");
            return Response.json({ id: previous.resourceId }, { status: 201 });
        }

        const keys: string[] = [];
        const creationToken = crypto.randomUUID();
        let committed = false;
        let commitAttempted = false;
        try {
            for (const file of images) {
                const key = crypto.randomUUID();
                keys.push(key);
                await env.IMAGES.put(key, file.bytes, { httpMetadata: { contentType: file.contentType } });
            }
            const createdAt = new Date().toISOString();
            const statement = replyMatch
                ? env.DB.prepare(`INSERT INTO replies (issueId, authorId, description, creationToken, createdAt)
                    SELECT ?, ?, ?, ?, ? WHERE NOT EXISTS (SELECT 1 FROM mutation_requests WHERE userId = ? AND requestKey = ?)`)
                    .bind(replyMatch[1], user.id, description, creationToken, createdAt, user.id, requestKey)
                : env.DB.prepare(`INSERT INTO issues (title, description, priority, creationToken, createdAt, authorId)
                    SELECT ?, ?, ?, ?, ?, ? WHERE NOT EXISTS (SELECT 1 FROM mutation_requests WHERE userId = ? AND requestKey = ?)`)
                    .bind(title, description, "Low", creationToken, createdAt, user.id, user.id, requestKey);
            const mentions = JSON.stringify(mentionUsernames(description));
            const notifications = replyMatch
                ? env.DB.prepare(`
                INSERT OR IGNORE INTO notifications (userId, actorId, issueId, replyId, kind, source, createdAt)
                SELECT users.id, ?, replies.issueId, replies.id, 'mention', 'reply:' || replies.id, ?
                FROM users
                CROSS JOIN replies
                WHERE changes() > 0
                AND replies.creationToken = ?
                AND users.deletedAt IS NULL
                AND users.id != ?
                AND users.username IN (SELECT value
                FROM json_each(?))
            `)
                    .bind(user.id, createdAt, creationToken, user.id, mentions)
                : env.DB.prepare(`
                INSERT OR IGNORE INTO notifications (userId, actorId, issueId, kind, source, createdAt)
                SELECT users.id, ?, issues.id, 'mention', 'issue:' || issues.id, ?
                FROM users
                CROSS JOIN issues
                WHERE changes() > 0
                AND issues.creationToken = ?
                AND users.deletedAt IS NULL
                AND users.id != ?
                AND users.username IN (SELECT value
                FROM json_each(?))
            `)
                    .bind(user.id, createdAt, creationToken, user.id, mentions);
            const remember = env.DB.prepare(`
                INSERT OR IGNORE INTO mutation_requests (userId, requestKey, route, fingerprint, resourceId, createdAt)
                SELECT ?, ?, ?, ?, id, ? FROM ${replyMatch ? "replies" : "issues"} WHERE creationToken = ?
            `).bind(user.id, requestKey, url.pathname, fingerprint, createdAt, creationToken);
            const operation = env.DB.prepare(`
                INSERT INTO events (actorId, action, details, createdAt)
                SELECT ?, ?, json_object('resourceId', resourceId), ? FROM mutation_requests
                WHERE userId = ? AND requestKey = ? AND changes() > 0 AND ? = 'admin'
            `).bind(user.id, replyMatch ? "reply_created" : "issue_created", createdAt, user.id, requestKey, user.role);
            const imageRows = JSON.stringify(keys.map((key, index) => ({
                key, contentType: images[index].contentType, byteSize: images[index].bytes.length,
            })));
            const attachImages = env.DB.prepare(replyMatch ? `
                INSERT INTO images (key, replyId, position, contentType, byteSize, state, createdAt)
                SELECT json_extract(value, '$.key'), replies.id, key, json_extract(value, '$.contentType'),
                    json_extract(value, '$.byteSize'), 'active', ?
                FROM json_each(?) CROSS JOIN replies WHERE replies.creationToken = ?
            ` : `
                INSERT INTO images (key, issueId, position, contentType, byteSize, state, createdAt)
                SELECT json_extract(value, '$.key'), issues.id, key, json_extract(value, '$.contentType'),
                    json_extract(value, '$.byteSize'), 'active', ?
                FROM json_each(?) CROSS JOIN issues WHERE issues.creationToken = ?
            `).bind(createdAt, imageRows, creationToken);
            commitAttempted = true;
            const [created] = await env.DB.batch([statement, notifications, remember, operation, attachImages]);
            committed = created.meta.changes > 0;
            if (!created.meta.changes) await rollbackImages(env, keys);
            const saved = await env.DB.prepare("SELECT route, fingerprint, resourceId FROM mutation_requests WHERE userId = ? AND requestKey = ?")
                .bind(user.id, requestKey).first<{ route: string; fingerprint: string; resourceId: number }>();
            if (saved!.route !== url.pathname || saved!.fingerprint !== fingerprint) throw new HttpError(409, "此提交标识已用于其他内容，请重新提交。");
            return Response.json({ id: saved!.resourceId }, { status: 201 });
        } catch (error) {
            if (!commitAttempted) await rollbackImages(env, keys);
            else if (!committed) console.error("创建内容的提交结果待核对，保留图片", requestKey, keys, error);
            throw error;
        }
    }

    const commentMatch = url.pathname.match(/^\/api\/replies\/(\d+)$/);
    if (commentMatch && ["PATCH", "DELETE"].includes(request.method)) {
        const reply = await env.DB.prepare(`
            SELECT id, issueId, authorId, description, version, createdAt,
                (SELECT json_group_array(key) FROM (SELECT key FROM images
                    WHERE replyId = replies.id AND state = 'active' ORDER BY position)) AS images
            FROM replies WHERE id = ?
        `).bind(commentMatch[1]).first<ReplyRow>();
        if (!reply) return Response.json({ error: "未找到该评论。" }, { status: 404 });
        if (reply.authorId !== user.id && user.role !== "admin") return Response.json({ error: "只有评论作者或管理员可以编辑和删除评论。" }, { status: 403 });
        if (request.headers.get("If-Match") !== `"${reply.version}"`) {
            return Response.json({ error: "评论已被修改，请刷新后重试。" }, { status: 409 });
        }
        const oldImages: string[] = JSON.parse(reply.images);
        if (request.method === "DELETE") {
            const event = env.DB.prepare(`
                INSERT INTO events (channel, issueId, actorId, action, details, createdAt)
                SELECT 'timeline', issueId, ?, 'reply_deleted', json_object('replyId', id), ?
                FROM replies WHERE id = ? AND version = ?
            `).bind(user.id, new Date().toISOString(), reply.id, reply.version);
            const removeImages = env.DB.prepare(`
                UPDATE images SET replyId = NULL, position = NULL, state = 'deleting'
                WHERE replyId = ? AND EXISTS (SELECT 1 FROM replies WHERE id = ? AND version = ?)
            `).bind(reply.id, reply.id, reply.version);
            const remove = env.DB.prepare("DELETE FROM replies WHERE id = ? AND version = ?").bind(reply.id, reply.version);
            const operation = recordOperation(env.DB, user, "reply_deleted", { replyId: reply.id, issueId: reply.issueId });
            const [_eventResult, _imageResult, result] = await env.DB.batch([event, removeImages, remove, operation]);
            if (!result.meta.changes) return Response.json({ error: "评论已被修改，请刷新后重试。" }, { status: 409 });
            return Response.json({ ok: true });
        }
        const form = await readForm(request, UPLOAD_BODY_MAX_BYTES);
        const description = String(form.get("description") ?? "").trim();
        const retained = form.getAll("retainedImages") as string[];
        const files = await readImages(form, retained.length);
        if (retained.some(key => !oldImages.includes(key)) || new Set(retained).size !== retained.length) return Response.json({ error: "评论图片无效。" }, { status: 400 });
        if (description.length > DESCRIPTION_MAX_LENGTH || (!description && !retained.length && !files.length)) return Response.json({ error: "评论不能为空，文字最多 20000 个字符。" }, { status: 400 });
        const uploaded: string[] = [];
        let commitAttempted = false;
        try {
            for (const file of files) {
                const key = crypto.randomUUID();
                uploaded.push(key);
                await env.IMAGES.put(key, file.bytes, { httpMetadata: { contentType: file.contentType } });
            }
            const removed = oldImages.filter(key => !retained.includes(key));
            const recordEdit = env.DB.prepare(`
                INSERT INTO events (channel, issueId, actorId, action, details, createdAt)
                SELECT 'timeline', issueId, ?, 'reply_edited', json_object('replyId', id), ?
                FROM replies
                WHERE id = ?
                AND version = ?
            `).bind(user.id, new Date().toISOString(), reply.id, reply.version);
            const notifyMentions = env.DB.prepare(`
                INSERT OR IGNORE INTO notifications (userId, actorId, issueId, replyId, kind, source, createdAt)
                SELECT users.id, ?, replies.issueId, replies.id, 'mention', 'reply:' || replies.id, ?
                FROM users
                CROSS JOIN replies
                WHERE replies.id = ?
                AND replies.version = ?
                AND users.deletedAt IS NULL
                AND users.id != ?
                AND users.username IN (SELECT value
                FROM json_each(?))
            `)
                    .bind(user.id, new Date().toISOString(), reply.id, reply.version, user.id, JSON.stringify(mentionUsernames(description)));
            const queueRemovedImages = env.DB.prepare(`
                UPDATE images SET replyId = NULL, position = NULL, state = 'deleting'
                WHERE key IN (SELECT value FROM json_each(?)) AND replyId = ?
                    AND EXISTS (SELECT 1 FROM replies WHERE id = ? AND version = ?)
            `).bind(JSON.stringify(removed), reply.id, reply.id, reply.version);
            const detachRetained = env.DB.prepare(`
                UPDATE images SET replyId = NULL, position = NULL, state = 'deleting'
                WHERE replyId = ? AND key IN (SELECT value FROM json_each(?))
                    AND EXISTS (SELECT 1 FROM replies WHERE id = ? AND version = ?)
            `).bind(reply.id, JSON.stringify(retained), reply.id, reply.version);
            const attachRetained = env.DB.prepare(`
                UPDATE images SET replyId = ?, position = (SELECT key FROM json_each(?) WHERE value = images.key), state = 'active'
                WHERE key IN (SELECT value FROM json_each(?)) AND state = 'deleting'
                    AND EXISTS (SELECT 1 FROM replies WHERE id = ? AND version = ?)
            `).bind(reply.id, JSON.stringify(retained), JSON.stringify(retained), reply.id, reply.version);
            const imageRows = JSON.stringify(uploaded.map((key, index) => ({
                key, contentType: files[index].contentType, byteSize: files[index].bytes.length,
            })));
            const attachUploaded = env.DB.prepare(`
                INSERT INTO images (key, replyId, position, contentType, byteSize, state, createdAt)
                SELECT json_extract(value, '$.key'), ?, ? + key, json_extract(value, '$.contentType'),
                    json_extract(value, '$.byteSize'), 'active', ?
                FROM json_each(?) WHERE EXISTS (SELECT 1 FROM replies WHERE id = ? AND version = ?)
            `).bind(reply.id, retained.length, new Date().toISOString(), imageRows, reply.id, reply.version);
            const updateReply = env.DB.prepare("UPDATE replies SET description = ?, version = version + 1 WHERE id = ? AND version = ?")
                    .bind(description, reply.id, reply.version);
            const operation = recordOperation(env.DB, user, "reply_edited", { replyId: reply.id, issueId: reply.issueId });
            commitAttempted = true;
            const [_editEvent, _mentionResult, _imageResult, _detachResult, _retainedResult, _uploadedResult, result] = await env.DB.batch([
                recordEdit, notifyMentions, queueRemovedImages, detachRetained, attachRetained, attachUploaded, updateReply, operation,
            ]);
            if (!result.meta.changes) {
                await rollbackImages(env, uploaded);
                return Response.json({ error: "评论已被修改，请刷新后重试。" }, { status: 409 });
            }
        } catch (error) {
            if (!commitAttempted) await rollbackImages(env, uploaded);
            else console.error("编辑评论的提交结果待核对，保留新图片", reply.id, uploaded, error);
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
        const form = await readForm(request);
        const assignees = assignmentRoles.flatMap(role => [...new Set(form.getAll(role).map(Number))].map(userId => ({ role, userId, accountRole: assignmentAccountRoles[role] })));
        if (assignees.some(entry => !Number.isSafeInteger(entry.userId) || entry.userId < 1)) return Response.json({ error: "指派失败：负责人无效。" }, { status: 400 });
        if (new Set(assignees.map(entry => entry.userId)).size > ASSIGNEE_MAX_COUNT) throw new HttpError(400, `指派失败：每个工单最多指派 ${ASSIGNEE_MAX_COUNT} 人。`);
        const eligibleMembers = `SELECT COUNT(*) FROM json_each(?) selection
            JOIN users member ON member.id = json_extract(selection.value, '$.userId')
            WHERE member.deletedAt IS NULL AND member.role = json_extract(selection.value, '$.accountRole')`;
        const members = await env.DB.prepare(`SELECT (${eligibleMembers}) AS total`).bind(JSON.stringify(assignees)).first<{ total: number }>();
        if (members!.total !== assignees.length) throw new HttpError(400, "指派失败：产品、开发必须为管理员，测试必须为普通用户，且账户必须有效。");
        const memberCount = assignees.length;
        const membersAreActive = `(${eligibleMembers}) = ?`;
        const recordAssignment = env.DB.prepare(`
                INSERT INTO events (channel, issueId, actorId, action, details, createdAt)
                SELECT 'timeline', id, ?, 'issue_assignees', json_object('before', json((SELECT json_group_array(json_object('userId', userId, 'role', role, 'name', (SELECT name
                FROM users
                WHERE id = userId)))
                FROM issue_assignees
                WHERE issueId = issues.id)), 'after', json((SELECT json_group_array(json_object('userId', users.id, 'role', json_extract(value, '$.role'), 'name', users.name))
                FROM json_each(?)
                JOIN users ON users.id = json_extract(value, '$.userId')))), ?
                FROM issues
                WHERE id = ?
                AND assignmentVersion = ?
                AND ${membersAreActive}
                AND (EXISTS (SELECT userId, role
                FROM issue_assignees
                WHERE issueId = issues.id
                EXCEPT SELECT json_extract(value, '$.userId'), json_extract(value, '$.role')
                FROM json_each(?))
                OR EXISTS (SELECT json_extract(value, '$.userId'), json_extract(value, '$.role')
                FROM json_each(?)
                EXCEPT SELECT userId, role
                FROM issue_assignees
                WHERE issueId = issues.id))
            `)
                .bind(
                    user.id, JSON.stringify(assignees), new Date().toISOString(),
                    assignmentMatch[1], issue.assignmentVersion,
                    JSON.stringify(assignees), memberCount,
                    JSON.stringify(assignees), JSON.stringify(assignees),
                );
        const notifyAssignees = env.DB.prepare(`
                INSERT INTO notifications (userId, actorId, issueId, kind, source, createdAt, assignmentRole)
                SELECT users.id, ?, ?, 'assignment', ? || ':' || json_extract(value, '$.role'), ?, json_extract(value, '$.role')
                FROM json_each(?)
                JOIN users ON users.id = json_extract(value, '$.userId')
                WHERE users.deletedAt IS NULL
                AND users.id != ?
                AND NOT EXISTS (SELECT 1
                FROM issue_assignees
                WHERE issueId = ?
                AND userId = users.id
                AND role = json_extract(value, '$.role'))
                AND EXISTS (SELECT 1
                FROM issues
                WHERE id = ?
                AND assignmentVersion = ?
                AND ${membersAreActive})
            `)
                .bind(
                    user.id, assignmentMatch[1], crypto.randomUUID(), new Date().toISOString(),
                    JSON.stringify(assignees), user.id, assignmentMatch[1],
                    assignmentMatch[1], issue.assignmentVersion, JSON.stringify(assignees), memberCount,
                );
        const removeAssignees = env.DB.prepare(`
            DELETE FROM issue_assignees WHERE issueId = ? AND EXISTS (
                SELECT 1 FROM issues
                WHERE id = ? AND assignmentVersion = ? AND ${membersAreActive}
            )
        `).bind(assignmentMatch[1], assignmentMatch[1], issue.assignmentVersion, JSON.stringify(assignees), memberCount);
        const insertAssignees = env.DB.prepare(`
                INSERT INTO issue_assignees (issueId, userId, role)
                SELECT ?, users.id, json_extract(value, '$.role')
                FROM json_each(?)
                JOIN users ON users.id = json_extract(value, '$.userId')
                WHERE users.deletedAt IS NULL
                AND EXISTS (SELECT 1
                FROM issues
                WHERE id = ?
                AND assignmentVersion = ?
                AND ${membersAreActive})
            `).bind(assignmentMatch[1], JSON.stringify(assignees), assignmentMatch[1], issue.assignmentVersion, JSON.stringify(assignees), memberCount);
        const updateVersion = env.DB.prepare(`
            UPDATE issues SET assignmentVersion = assignmentVersion + 1
            WHERE id = ? AND assignmentVersion = ? AND ${membersAreActive}
        `).bind(assignmentMatch[1], issue.assignmentVersion, JSON.stringify(assignees), memberCount);
        const selectAssignees = env.DB.prepare(`
                SELECT users.id, users.name, users.username, issue_assignees.role
                FROM issue_assignees
                JOIN users ON users.id = issue_assignees.userId
                WHERE issueId = ?
                ORDER BY issue_assignees.role, users.username
            `).bind(assignmentMatch[1]);
        const operation = recordOperation(env.DB, user, "issue_assignees", { issueId: Number(assignmentMatch[1]) });
        const [_eventResult, _notificationResult, _removedResult, _insertedResult, result, _auditResult, rows] = await env.DB.batch([
            recordAssignment, notifyAssignees, removeAssignees, insertAssignees, updateVersion, operation, selectAssignees,
        ]);
        if (!result.meta.changes) return Response.json({ error: "指派失败：负责人已被修改，请刷新页面后重新编辑。" }, { status: 409 });
        return Response.json({ assignees: rows.results, assignmentVersion: issue.assignmentVersion + 1 });
    }

    const issueMatch = url.pathname.match(/^\/api\/issues\/(\d+)\/(status|priority)$/);
    if (issueMatch && request.method === "POST") {
        const issue = await env.DB.prepare("SELECT authorId, version FROM issues WHERE id = ?").bind(issueMatch[1]).first<{ authorId: number | null; version: number }>();
        if (!issue) return Response.json({ error: "未找到该工单。" }, { status: 404 });
        if (user.role !== "admin" && issue.authorId !== user.id) {
            return Response.json({ error: "只有作者或管理员可以更改状态和优先级。" }, { status: 403 });
        }
        const form = await readForm(request);
        if (request.headers.get("If-Match") !== `"${issue.version}"`) throw new HttpError(409, "工单已被修改，请重新读取后重试。");
        const field = issueMatch[2];
        const value = String(form.get(field) ?? "");
        const allowed = field === "status" ? ["Open", "Closed"] : ["Low", "Medium", "High"];
        if (!allowed.includes(value)) {
            return Response.json({ error: "更新工单：状态或优先级无效。" }, { status: 400 });
        }
        const stateReason = value === "Closed" ? String(form.get("stateReason") ?? "") : null;
        if (field === "status" && value === "Closed" && !["completed", "not_planned"].includes(stateReason!)) return Response.json({ error: "关闭工单：请选择已完成或已关闭。" }, { status: 400 });
        const createdAt = new Date().toISOString();
        const recordChange = field === "status"
            ? env.DB.prepare(`
                INSERT INTO events (channel, issueId, actorId, action, details, createdAt)
                SELECT 'timeline', id, ?, 'issue_status', json_object('before', status, 'after', ?, 'stateReason', ?), ?
                FROM issues WHERE id = ? AND version = ? AND (status != ? OR stateReason IS NOT ?)
            `).bind(user.id, value, stateReason, createdAt, issueMatch[1], issue.version, value, stateReason)
            : env.DB.prepare(`
                INSERT INTO events (channel, issueId, actorId, action, details, createdAt)
                SELECT 'timeline', id, ?, 'issue_priority', json_object('before', priority, 'after', ?), ?
                FROM issues WHERE id = ? AND version = ? AND priority != ?
            `).bind(user.id, value, createdAt, issueMatch[1], issue.version, value);
        const update = field === "status"
            ? env.DB.prepare("UPDATE issues SET status = ?, stateReason = ?, version = version + 1 WHERE id = ? AND version = ?").bind(value, stateReason, issueMatch[1], issue.version)
            : env.DB.prepare("UPDATE issues SET priority = ?, version = version + 1 WHERE id = ? AND version = ?").bind(value, issueMatch[1], issue.version);
        const operation = recordOperation(env.DB, user, field === "status" ? "issue_status" : "issue_priority", { issueId: Number(issueMatch[1]), value });
        const [_eventResult, updated] = await env.DB.batch([recordChange, update, operation]);
        if (!updated.meta.changes) throw new HttpError(409, "工单已被修改，请重新读取后重试。");
        return Response.json(field === "status" ? { status: value, stateReason, version: issue.version + 1 } : { priority: value, version: issue.version + 1 });
    }


}
