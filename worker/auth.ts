import { timingSafeEqual } from "node:crypto";
import { hash, passwordHash, newPassword, passwordValid } from "./password";
import { Buffer } from "node:buffer";
import type { User } from "../shared/types";
import { LOGIN_ATTEMPT_LIMIT, LOGIN_WINDOW_MS, NAME_MAX_LENGTH, USERNAME_PATTERN } from "../shared/limits";
import type { Env } from "./env";
import { currentUser, issueToken } from "./jwt";
import { HttpError, readForm } from "./input";
import { adminUsers } from "./users";
import { recordOperation } from "./operation-record";

type Account = User & { passwordHash: string; passwordSalt: string; credentialVersion: number };

export async function auth(request: Request, env: Env, user: User | null) {
    const path = new URL(request.url).pathname;
    if (path === "/api/auth/me" && request.method === "GET") {
        const existing = await env.DB.prepare("SELECT id FROM users LIMIT 1").first();
        return Response.json({ user, setupRequired: !existing });
    }
    if (path === "/api/operations" || path.startsWith("/api/admin/")) return adminUsers(request, env, user);
    if (request.method !== "POST") throw new HttpError(404, "未找到该登录操作。");
    if (path === "/api/auth/logout") return Response.json({ user: null });
    if (!["/api/auth/login", "/api/auth/password", "/api/auth/setup"].includes(path)) throw new HttpError(404, "未找到该登录操作。");
    if (path === "/api/auth/password" && !user) throw new HttpError(401, "请先登录。");

    if (path === "/api/auth/setup") {
        const existing = await env.DB.prepare("SELECT id FROM users LIMIT 1").first();
        if (existing) throw new HttpError(409, "系统已初始化，请登录。");
        const credential = await env.KV.get("setup");
        if (!credential || credential.length < 32) throw new HttpError(503, "请先在 KV 配置至少 32 个字符的一次性初始化凭据。");
        const form = await readForm(request, 8192);
        const provided = String(form.get("setupCredential") ?? "");
        if (!provided || !timingSafeEqual(Buffer.from(hash(provided)), Buffer.from(hash(credential)))) throw new HttpError(403, "初始化凭据不正确。");
        const name = String(form.get("name") ?? "").trim();
        const username = String(form.get("username") ?? "").trim().toLowerCase();
        const password = String(form.get("password") ?? "");
        if (!name || name.length > NAME_MAX_LENGTH || !USERNAME_PATTERN.test(username) || !passwordValid(password)) throw new HttpError(400, "请检查昵称、用户名和密码长度。");
        if (password !== form.get("confirmPassword")) throw new HttpError(400, "两次输入的密码不一致。");
        const { salt, digest } = newPassword(password);
        const createdAt = new Date().toISOString();
        const create = env.DB.prepare(`
            INSERT INTO users (name, username, passwordHash, passwordSalt, role, createdAt)
            SELECT ?, ?, ?, ?, 'admin', ? WHERE NOT EXISTS (SELECT 1 FROM users)
            RETURNING id
        `).bind(name, username, digest, salt, createdAt);
        const audit = env.DB.prepare(`
            INSERT INTO events (actorId, targetId, action, details, createdAt)
            SELECT id, id, 'setup', json_object('username', username), ? FROM users WHERE changes() > 0
        `).bind(createdAt);
        const [created] = await env.DB.batch([create, audit]);
        if (!created.meta.changes) throw new HttpError(409, "系统已初始化，请登录。");
        return Response.json({ user: null }, { status: 201 });
    }

    const form = await readForm(request, 8192);
    const username = path === "/api/auth/password" ? user!.username : String(form.get("username") ?? "").trim().toLowerCase();
    const password = String(form.get("password") ?? "");
    if (!USERNAME_PATTERN.test(username) || !passwordValid(password)) throw new HttpError(400, "请输入有效用户名和 6–128 个字符的密码。");
    const now = Date.now();
    const accountKey = hash(`username:${username}`);
    const removeExpired = env.DB.prepare("DELETE FROM auth_attempts WHERE scope = 'account' AND attemptedAt <= ?").bind(now - LOGIN_WINDOW_MS);
    const reserveAttempt = env.DB.prepare(`
        INSERT INTO auth_attempts (id, scope, subjectHash, attemptedAt)
        SELECT ?, 'account', ?, ? WHERE (
            SELECT COUNT(*) FROM auth_attempts WHERE scope = 'account' AND subjectHash = ? AND attemptedAt > ?
        ) < ?
    `).bind(crypto.randomUUID(), accountKey, now, accountKey, now - LOGIN_WINDOW_MS, LOGIN_ATTEMPT_LIMIT);
    const earliestAttempt = env.DB.prepare(`
        SELECT MIN(attemptedAt) AS firstAttempt FROM auth_attempts
        WHERE scope = 'account' AND subjectHash = ? AND attemptedAt > ?
    `).bind(accountKey, now - LOGIN_WINDOW_MS);
    const [_removed, reserved, earliest] = await env.DB.batch([removeExpired, reserveAttempt, earliestAttempt]);
    if (!reserved.meta.changes) {
        const { firstAttempt } = earliest.results[0] as { firstAttempt: number };
        throw new HttpError(429, "10 分钟内最多尝试 3 次，请稍后重试。", {
            "Retry-After": String(Math.max(1, Math.ceil((firstAttempt + LOGIN_WINDOW_MS - now) / 1000))),
        });
    }
    const ip = request.headers.get("CF-Connecting-IP");
    if (ip) {
        const window = Math.floor(now / 900000);
        const key = hash(`ip:${ip}:${window}`);
        await env.DB.prepare("DELETE FROM auth_attempts WHERE scope = 'network' AND expiresAt <= ?").bind(now).run();
        const attempt = await env.DB.prepare(`
            INSERT INTO auth_attempts (id, scope, attempts, expiresAt) VALUES (?, 'network', 1, ?)
            ON CONFLICT(id) DO UPDATE SET attempts = attempts + 1 RETURNING attempts
        `).bind(key, (window + 1) * 900000).first<{ attempts: number }>();
        if (attempt!.attempts > 100) throw new HttpError(429, "当前网络尝试次数过多，请稍后重试。", { "Retry-After": String(Math.ceil(((window + 1) * 900000 - now) / 1000)) });
    }
    const account = await env.DB.prepare(`
        SELECT id, name, username, role, passwordHash, passwordSalt, credentialVersion
        FROM users WHERE username = ? AND deletedAt IS NULL
    `).bind(username).first<Account>();
    const digest = passwordHash(password, account?.passwordSalt ?? "00000000000000000000000000000000");
    const expected = account ? Buffer.from(account.passwordHash, "hex") : Buffer.alloc(64);
    const matches = timingSafeEqual(digest, expected);
    if (!account || !matches) throw new HttpError(path === "/api/auth/password" ? 400 : 401, path === "/api/auth/password" ? "当前密码不正确。" : "用户名或密码不正确。");

    if (path === "/api/auth/password") {
        const next = String(form.get("newPassword") ?? "");
        if (!passwordValid(next)) throw new HttpError(400, "新密码长度必须为 6–128 个字符。");
        const replacement = newPassword(next);
        const update = env.DB.prepare(`
            UPDATE users SET passwordHash = ?, passwordSalt = ?, credentialVersion = credentialVersion + 1
            WHERE id = ? AND credentialVersion = ? AND deletedAt IS NULL
        `).bind(replacement.digest, replacement.salt, account.id, account.credentialVersion);
        const operation = recordOperation(env.DB, user!, "password_reset", { userId: account.id, self: true });
        const [changed] = await env.DB.batch([update, operation]);
        if (!changed.meta.changes) throw new HttpError(409, "账户已发生变化，请重新登录。");
        return Response.json({ user: null });
    }
    const token = await issueToken(request, env, account);
    const confirmed = await currentUser(new Request(request.url, { headers: { Authorization: `Bearer ${token.token}` } }), env);
    if (!confirmed) throw new HttpError(401, "账户已发生变化，请重新登录。");
    return Response.json({ ...token, user: confirmed });
}
