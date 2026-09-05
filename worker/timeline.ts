import { Buffer } from "node:buffer";
import type { TimelineEntry } from "../shared/types";
import type { Env } from "./env";
import { HttpError } from "./input";

type Boundary = [string, string, number];
type Cursor = { issueId: string; after: Boundary; before: Boundary };
type Row = {
    id: number; kind: TimelineEntry["kind"]; actorId: number | null; actorName: string | null;
    createdAt: string; description: string | null; images: string | null;
    version: number | null; details: string | null;
};
const source = `
    WITH timeline AS (
        SELECT id, 'reply' AS kind, authorId AS actorId, createdAt FROM replies WHERE issueId = ?
        UNION ALL SELECT id, CASE action
            WHEN 'issue_status' THEN 'status'
            WHEN 'issue_priority' THEN 'priority'
            WHEN 'issue_assignees' THEN 'assignment'
            ELSE action END AS kind, actorId, createdAt
        FROM events WHERE channel = 'timeline' AND issueId = ?
    )`;
const select = `
    SELECT t.id, t.kind, t.actorId, t.createdAt, users.name AS actorName,
        replies.description,
        (SELECT json_group_array(key) FROM (SELECT key FROM images
            WHERE replyId = replies.id AND state = 'active' ORDER BY position)) AS images,
        replies.version, events.details
    FROM timeline t LEFT JOIN users ON users.id = t.actorId
    LEFT JOIN replies ON t.kind = 'reply' AND replies.id = t.id
    LEFT JOIN events ON t.kind != 'reply' AND events.id = t.id
`;

function entry(row: Row): TimelineEntry {
    if (row.kind === "reply") return {
        id: row.id, kind: "reply", authorId: row.actorId!, authorName: row.actorName!,
        createdAt: row.createdAt, description: row.description!, images: JSON.parse(row.images!), version: row.version!,
    };
    return { id: row.id, kind: row.kind, actorName: row.actorName, createdAt: row.createdAt, details: JSON.parse(row.details!) };
}
function boundary(row: Row): Boundary { return [row.createdAt, row.kind, row.id]; }
function encode(cursor: Cursor) { return Buffer.from(JSON.stringify(cursor)).toString("base64url"); }
function validBoundary(value: Boundary) {
    return Array.isArray(value) && value.length === 3 && typeof value[0] === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value[0])
        && ["reply", "status", "priority", "assignment", "reply_edited", "reply_deleted"].includes(value[1])
        && Number.isSafeInteger(value[2]) && value[2] > 0;
}

export async function timeline(request: Request, env: Env, issueId: string) {
    const exists = await env.DB.prepare("SELECT id FROM issues WHERE id = ?").bind(issueId).first();
    if (!exists) throw new HttpError(404, "读取时间线：未找到该工单。");
    const url = new URL(request.url);
    const before = url.searchParams.get("before");
    let entries: TimelineEntry[];
    let hiddenCount: number;
    let beforeCursor: string | null;
    let total: number;
    if (before !== null) {
        let cursor: Cursor;
        try {
            if (!/^[A-Za-z0-9_-]{1,2048}$/.test(before)) throw new Error();
            cursor = JSON.parse(Buffer.from(before, "base64url").toString());
            if (!cursor || cursor.issueId !== issueId || !validBoundary(cursor.after) || !validBoundary(cursor.before)) throw new Error();
        } catch { throw new HttpError(400, "展开时间线：游标无效。"); }
        const range = " WHERE (t.createdAt, t.kind, t.id) > (?, ?, ?) AND (t.createdAt, t.kind, t.id) < (?, ?, ?)";
        const count = env.DB.prepare(source + " SELECT COUNT(*) AS total FROM timeline").bind(issueId, issueId);
        const hidden = env.DB.prepare(source + " SELECT COUNT(*) AS total FROM timeline t" + range).bind(issueId, issueId, ...cursor.after, ...cursor.before);
        const middle = env.DB.prepare(source + select + range + " ORDER BY t.createdAt DESC, t.kind DESC, t.id DESC LIMIT 20").bind(issueId, issueId, ...cursor.after, ...cursor.before);
        const [countResult, hiddenResult, middleResult] = await env.DB.batch([count, hidden, middle]);
        total = (countResult.results[0] as { total: number }).total;
        const rows = (middleResult.results as Row[]).reverse();
        entries = rows.map(entry);
        hiddenCount = Math.max(0, (hiddenResult.results[0] as { total: number }).total - rows.length);
        beforeCursor = hiddenCount ? encode({ issueId, after: cursor.after, before: boundary(rows[0]) }) : null;
    } else {
        const count = env.DB.prepare(source + " SELECT COUNT(*) AS total FROM timeline").bind(issueId, issueId);
        const head = env.DB.prepare(source + select + " ORDER BY t.createdAt, t.kind, t.id LIMIT 10").bind(issueId, issueId);
        const tail = env.DB.prepare(source + select + " ORDER BY t.createdAt DESC, t.kind DESC, t.id DESC LIMIT 10").bind(issueId, issueId);
        const [countResult, headResult, tailResult] = await env.DB.batch([count, head, tail]);
        total = (countResult.results[0] as { total: number }).total;
        const first = headResult.results as Row[];
        const last = (tailResult.results as Row[]).reverse();
        const seen = new Set(first.map(row => row.kind + ":" + row.id));
        const rows = [...first, ...last.filter(row => !seen.has(row.kind + ":" + row.id))];
        entries = rows.map(entry);
        hiddenCount = Math.max(0, total - rows.length);
        beforeCursor = hiddenCount ? encode({ issueId, after: boundary(first.at(-1)!), before: boundary(last[0]) }) : null;
    }
    const target = url.searchParams.get("target");
    let targetEntry: TimelineEntry | null = null;
    let targetUnavailable = false;
    if (target !== null) {
        if (!Number.isSafeInteger(Number(target)) || Number(target) < 1) throw new HttpError(400, "时间线定位参数无效。");
        const row = await env.DB.prepare(source + select + " WHERE t.kind = 'reply' AND t.id = ?").bind(issueId, issueId, target).first<Row>();
        targetEntry = row ? entry(row) : null;
        targetUnavailable = row === null;
    }
    return Response.json({ entries, total, hiddenCount, beforeCursor, targetEntry, targetUnavailable });
}
