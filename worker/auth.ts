import { hash, verifyPassword, newPassword, passwordValid } from "./password";
import type { User } from "../shared/types";
import { LOGIN_ATTEMPT_LIMIT, LOGIN_WINDOW_MS, USERNAME_MAX_LENGTH, USERNAME_PATTERN } from "../shared/limits";
import type { Env } from "./env";
import { issueToken } from "./jwt";
import { HttpError, readForm } from "./input";
import { adminUsers } from "./users";
import { recordOperation } from "./operation-record";

type Account = User & { passwordHash: string; credentialVersion: number };

export async function auth(request: Request, env: Env, user: User | null) {
    const path = new URL(request.url).pathname;
    if (path === "/api/auth/me" && request.method === "GET") return Response.json({ user });
    if (path === "/api/operations" || path.startsWith("/api/admin/")) return adminUsers(request, env, user);
    if (request.method !== "POST") throw new HttpError(404, "未找到该登录操作。");
    if (path === "/api/auth/logout") {
        env.signal?.throwIfAborted();
        if (user) await env.DB.prepare("DELETE FROM sessions WHERE userId = ?").bind(user.id).run();
        return Response.json({ user: null });
    }
    if (!["/api/auth/login", "/api/auth/password"].includes(path)) throw new HttpError(404, "未找到该登录操作。");
    if (path === "/api/auth/password" && !user) throw new HttpError(401, "请先登录。");

    env.signal?.throwIfAborted();
    const form = await readForm(request, 8192);
    const username = path === "/api/auth/password" ? user!.username : String(form.get("username") ?? "").trim().replace(/[A-Z]/g, letter => letter.toLowerCase());
    const password = String(form.get("password") ?? "");
    if (username.length > USERNAME_MAX_LENGTH || !USERNAME_PATTERN.test(username) || !passwordValid(password)) throw new HttpError(400, "请输入有效用户名和 6–128 个字符的密码。");
    const ip = request.headers.get("CF-Connecting-IP");
    if (path === "/api/auth/login" && !user && ip) {
        const now = Date.now();
        const ipHash = hash(`ip:${ip}`);
        const removeExpired = env.DB.prepare("DELETE FROM auth_attempts WHERE attemptedAt <= ?").bind(now - LOGIN_WINDOW_MS);
        const reserveAttempt = env.DB.prepare(`
            INSERT INTO auth_attempts (ipHash, attemptedAt)
            SELECT ?, ? WHERE (
                SELECT COUNT(*) FROM auth_attempts WHERE ipHash = ? AND attemptedAt > ?
            ) < ?
        `).bind(ipHash, now, ipHash, now - LOGIN_WINDOW_MS, LOGIN_ATTEMPT_LIMIT);
        const earliestAttempt = env.DB.prepare(`
            SELECT MIN(attemptedAt) AS firstAttempt FROM auth_attempts
            WHERE ipHash = ? AND attemptedAt > ?
        `).bind(ipHash, now - LOGIN_WINDOW_MS);
        env.signal?.throwIfAborted();
        const [_removed, reserved, earliest] = await env.DB.batch([removeExpired, reserveAttempt, earliestAttempt]);
        if (!reserved.meta.changes) {
            const { firstAttempt } = earliest.results[0] as { firstAttempt: number };
            throw new HttpError(429, "当前 IP 在 10 分钟内登录尝试已达 3 次，请稍后重试。", {
                "Retry-After": String(Math.max(1, Math.ceil((firstAttempt + LOGIN_WINDOW_MS - now) / 1000))),
            });
        }
    }
    env.signal?.throwIfAborted();
    const account = await env.DB.prepare(`
        SELECT id, name, username, role, passwordHash, credentialVersion
        FROM users WHERE username = ? AND deletedAt IS NULL
    `).bind(username).first<Account>();
    env.signal?.throwIfAborted();
    const matches = await verifyPassword(password, account?.passwordHash ?? "");
    if (!account || !matches) throw new HttpError(path === "/api/auth/password" ? 400 : 401, path === "/api/auth/password" ? "当前密码不正确。" : "用户名或密码不正确。");

    if (path === "/api/auth/password") {
        const next = String(form.get("newPassword") ?? "");
        if (!passwordValid(next)) throw new HttpError(400, "新密码长度必须为 6–128 个字符。");
        env.signal?.throwIfAborted();
        const replacement = await newPassword(next);
        const update = env.DB.prepare(`
            UPDATE users SET passwordHash = ?, credentialVersion = credentialVersion + 1
            WHERE id = ? AND credentialVersion = ? AND deletedAt IS NULL
        `).bind(replacement, account.id, account.credentialVersion);
        const operation = recordOperation(env.DB, user!, "password_reset", { userId: account.id, self: true });
        env.signal?.throwIfAborted();
        const [changed] = await env.DB.batch([update, operation]);
        if (!changed.meta.changes) throw new HttpError(409, "账户已发生变化，请重新登录。");
        return Response.json({ user: null });
    }
    env.signal?.throwIfAborted();
    const confirmed = await env.DB.prepare(`
        SELECT id, name, username, role FROM users
        WHERE id = ? AND credentialVersion = ? AND deletedAt IS NULL
    `).bind(account.id, account.credentialVersion).first<User>();
    if (!confirmed) throw new HttpError(401, "账户已发生变化，请重新登录。");
    env.signal?.throwIfAborted();
    const token = await issueToken(request, env, account);
    if (ip) {
        env.signal?.throwIfAborted();
        await env.DB.prepare("DELETE FROM auth_attempts WHERE ipHash = ?").bind(hash(`ip:${ip}`)).run();
    }
    return Response.json({ ...token, user: confirmed });
}
