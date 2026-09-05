import type { ManagedUser, OperationEvent, User } from "../shared/types";
import { NAME_MAX_LENGTH, USERNAME_PATTERN } from "../shared/limits";
import type { Env } from "./env";
import { HttpError, readForm } from "./input";
import { newPassword, passwordValid } from "./password";

export async function adminUsers(request: Request, env: Env, admin: User | null) {
    if (!admin) throw new HttpError(401, "请先登录。");
    if (admin.role !== "admin") throw new HttpError(403, "只有管理员可以执行此操作。");
    const url = new URL(request.url);
    if (url.pathname === "/api/operations" && request.method === "GET") {
        const before = Number(url.searchParams.get("before") ?? Number.MAX_SAFE_INTEGER);
        if (!Number.isSafeInteger(before) || before < 1) throw new HttpError(400, "读取操作记录：游标无效。");
        const rows = await env.DB.prepare(`
            SELECT events.id, events.actorId, users.name AS actorName,
                events.targetId, action, details, events.createdAt
            FROM events JOIN users ON users.id = actorId
            WHERE events.channel = 'operation' AND events.id < ? ORDER BY events.id DESC LIMIT 51
        `).bind(before).all<Omit<OperationEvent, "details"> & { details: string }>();
        const events = rows.results.slice(0, 50).map(row => ({ ...row, details: JSON.parse(row.details) }));
        return Response.json({ events, next: rows.results.length > 50 ? events.at(-1)!.id : null });
    }
    if (url.pathname === "/api/admin/users" && request.method === "GET") {
        const after = Number(url.searchParams.get("after") ?? "0");
        if (!Number.isSafeInteger(after) || after < 0) throw new HttpError(400, "读取用户：游标无效。");
        const rows = await env.DB.prepare(`
            SELECT id, name, username, role, profileVersion AS version FROM users
            WHERE deletedAt IS NULL AND id > ? ORDER BY id LIMIT 21
        `).bind(after).all<ManagedUser>();
        const users = rows.results.slice(0, 20);
        return Response.json({ users, next: rows.results.length > 20 ? users.at(-1)!.id : null });
    }
    if (url.pathname === "/api/admin/users" && request.method === "POST") {
        const form = await readForm(request, 8192);
        const name = String(form.get("name") ?? "").trim();
        const username = String(form.get("username") ?? "").trim().toLowerCase();
        const password = String(form.get("password") ?? "");
        const role = String(form.get("role") ?? "user");
        if (!name || name.length > NAME_MAX_LENGTH || !USERNAME_PATTERN.test(username) || !passwordValid(password) || !["admin", "user"].includes(role)) throw new HttpError(400, "创建用户：请检查昵称、用户名、角色和密码长度。");
        const { salt, digest } = newPassword(password);
        const createdAt = new Date().toISOString();
        const create = env.DB.prepare(`
            INSERT INTO users (name, username, passwordHash, passwordSalt, role, createdAt)
            SELECT ?, ?, ?, ?, ?, ? WHERE EXISTS (
                SELECT 1 FROM users WHERE id = ? AND role = 'admin' AND deletedAt IS NULL
            ) ON CONFLICT(username) DO NOTHING
            RETURNING id, name, username, role, profileVersion AS version
        `).bind(name, username, digest, salt, role, createdAt, admin.id);
        const audit = env.DB.prepare(`
            INSERT INTO events (actorId, targetId, action, details, createdAt)
            SELECT ?, id, 'user_created', json_object('username', username, 'name', name, 'role', role), ?
            FROM users WHERE id = last_insert_rowid() AND changes() > 0
        `).bind(admin.id, createdAt);
        const [created] = await env.DB.batch<ManagedUser>([create, audit]);
        if (!created.meta.changes) throw new HttpError(409, "创建用户：用户名已存在或管理员权限已发生变化，请刷新后重试。");
        return Response.json({ user: created.results[0] }, { status: 201 });
    }
    const match = url.pathname.match(/^\/api\/admin\/users\/(\d+)$/);
    if (!match || !["GET", "PATCH", "DELETE"].includes(request.method)) throw new HttpError(404, "未找到该管理操作。");
    const target = await env.DB.prepare("SELECT id, name, username, role, credentialVersion, profileVersion AS version FROM users WHERE id = ? AND deletedAt IS NULL")
        .bind(match[1]).first<ManagedUser & { credentialVersion: number }>();
    if (!target) throw new HttpError(404, "未找到该用户。");
    if (request.method === "GET") {
        const { id, name, username, role, version } = target;
        return Response.json({ user: { id, name, username, role, version } });
    }
    if (request.headers.get("If-Match") !== `"${target.version}"`) {
        throw new HttpError(409, "用户资料已发生变化，请载入最新版本后重试。");
    }
    if (request.method === "DELETE") {
        if (target.id === admin.id) throw new HttpError(403, "不能删除当前登录账户。");
        const deletedAt = new Date().toISOString();
        const deleteAllowed = `EXISTS (
            SELECT 1 FROM users actor CROSS JOIN users target
            WHERE actor.id = ? AND actor.role = 'admin' AND actor.deletedAt IS NULL
                AND target.id = ? AND target.profileVersion = ? AND target.deletedAt IS NULL
                AND (target.role != 'admin' OR (SELECT COUNT(*) FROM users WHERE role = 'admin' AND deletedAt IS NULL) > 1)
        )`;
        const recordAssignments = env.DB.prepare(`
            INSERT INTO events (channel, issueId, actorId, action, details, createdAt)
            SELECT 'timeline', issues.id, ?, 'issue_assignees',
                json_object('before', json((SELECT json_group_array(json_object('userId', a.userId, 'role', a.role, 'name', members.name))
                    FROM issue_assignees a JOIN users members ON members.id = a.userId WHERE a.issueId = issues.id)),
                    'after', json((SELECT json_group_array(json_object('userId', a.userId, 'role', a.role, 'name', members.name))
                    FROM issue_assignees a JOIN users members ON members.id = a.userId WHERE a.issueId = issues.id AND a.userId != ?))), ?
            FROM issues WHERE id IN (SELECT issueId FROM issue_assignees WHERE userId = ?) AND ${deleteAllowed}
        `).bind(admin.id, target.id, deletedAt, target.id, admin.id, target.id, target.version);
        const bumpAssignments = env.DB.prepare(`UPDATE issues SET assignmentVersion = assignmentVersion + 1
            WHERE id IN (SELECT issueId FROM issue_assignees WHERE userId = ?) AND ${deleteAllowed}`)
            .bind(target.id, admin.id, target.id, target.version);
        const removeAssignments = env.DB.prepare(`DELETE FROM issue_assignees WHERE userId = ? AND ${deleteAllowed}`)
            .bind(target.id, admin.id, target.id, target.version);
        const removeUser = env.DB.prepare(`
            UPDATE users SET name = '已删除用户', username = ?, passwordHash = '', passwordSalt = '',
                deletedAt = ?, credentialVersion = credentialVersion + 1, profileVersion = profileVersion + 1
            WHERE id = ? AND ${deleteAllowed}
        `).bind(`deleted:${target.id}`, deletedAt, target.id, admin.id, target.id, target.version);
        const audit = env.DB.prepare(`
            INSERT INTO events (actorId, targetId, action, details, createdAt)
            SELECT ?, ?, 'user_deleted', ?, ? WHERE changes() > 0
        `).bind(admin.id, target.id, JSON.stringify({ username: target.username, name: target.name }), deletedAt);
        const [_events, _versions, _assignments, removed] = await env.DB.batch([recordAssignments, bumpAssignments, removeAssignments, removeUser, audit]);
        if (!removed.meta.changes) throw new HttpError(409, "删除用户：用户资料或管理员权限已变化，或该用户是最后一位管理员。请刷新后重新选择。");
        return Response.json({ ok: true });
    }
    const form = await readForm(request, 8192);
    const name = String(form.get("name") ?? "").trim();
    const username = String(form.get("username") ?? "").trim().toLowerCase();
    const password = String(form.get("password") ?? "");
    if (!name || name.length > NAME_MAX_LENGTH || !USERNAME_PATTERN.test(username) || (password && !passwordValid(password))) throw new HttpError(400, "编辑用户：请检查昵称、用户名和密码长度。");
    const replacement = password ? newPassword(password) : null;
    const changed = env.DB.prepare(`
        UPDATE users SET name = ?, username = ?,
            passwordHash = COALESCE(?, passwordHash), passwordSalt = COALESCE(?, passwordSalt),
            credentialVersion = credentialVersion + ?, profileVersion = profileVersion + 1
        WHERE id = ? AND profileVersion = ? AND credentialVersion = ? AND deletedAt IS NULL
            AND EXISTS (SELECT 1 FROM users actor WHERE actor.id = ? AND actor.role = 'admin' AND actor.deletedAt IS NULL)
            AND NOT EXISTS (SELECT 1 FROM users WHERE username = ? AND id != ?)
        RETURNING id, name, username, role, profileVersion AS version
    `).bind(name, username, replacement?.digest ?? null, replacement?.salt ?? null,
        password || username !== target.username ? 1 : 0, target.id, target.version, target.credentialVersion, admin.id, username, target.id);
    const audit = env.DB.prepare(`
        INSERT INTO events (actorId, targetId, action, details, createdAt)
        SELECT ?, ?, ?, ?, ? WHERE changes() > 0
    `).bind(admin.id, target.id, password ? "password_reset" : "user_updated",
        JSON.stringify({ previousName: target.name, name, previousUsername: target.username, username, passwordChanged: !!password }), new Date().toISOString());
    const [updated] = await env.DB.batch<ManagedUser>([changed, audit]);
    if (!updated.meta.changes) throw new HttpError(409, "用户资料或管理员权限已变化，或用户名已存在，请重新读取后编辑。");
    return Response.json({ user: updated.results[0] });
}
