import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { Buffer } from "node:buffer";

export type User = { id: number; name: string; username: string; role: "user" | "admin" };
type Account = User & { passwordHash: string; passwordSalt: string };

function hash(value: string) {
    return createHash("sha256").update(value).digest("hex");
}

function passwordHash(password: string, salt: string) {
    return Buffer.from(scryptSync(password, salt, 64, { N: 32768, r: 8, p: 3, maxmem: 64 * 1024 * 1024 }));
}

function sessionHash(request: Request) {
    const cookie = request.headers.get("Cookie") ?? "";
    const token = cookie.match(/(?:^|;\s*)aldaris_session=([a-f0-9]{64})(?:;|$)/)?.[1];
    return token ? hash(token) : null;
}

function cookie(request: Request, token: string, maxAge: number) {
    const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
    return `aldaris_session=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${secure}`;
}

export async function currentUser(request: Request, db: D1Database) {
    const tokenHash = sessionHash(request);
    if (!tokenHash) return null;
    return db.prepare("SELECT users.id, users.name, users.username, users.role FROM sessions JOIN users ON users.id = sessions.userId WHERE sessions.tokenHash = ? AND sessions.expiresAt > ? AND users.deletedAt IS NULL")
        .bind(tokenHash, Date.now()).first<User>();
}

export async function auth(request: Request, db: D1Database) {
    const path = new URL(request.url).pathname;
    const headers = new Headers({ "Cache-Control": "no-store" });
    if (path === "/api/auth/me" && request.method === "GET") {
        return Response.json({ user: await currentUser(request, db) }, { headers });
    }
    if (path.startsWith("/api/admin/users")) {
        const admin = await currentUser(request, db);
        if (!admin) return Response.json({ error: "请先登录。" }, { status: 401, headers });
        if (admin.role !== "admin") return Response.json({ error: "只有管理员可以管理用户。" }, { status: 403, headers });
        if (path === "/api/admin/users" && request.method === "GET") {
            const result = await db.prepare("SELECT id, name, username, role FROM users WHERE deletedAt IS NULL ORDER BY id").all<User>();
            return Response.json({ users: result.results }, { headers });
        }
        const match = path.match(/^\/api\/admin\/users\/(\d+)$/);
        if (match && ["PATCH", "DELETE"].includes(request.method)) {
            const target = await db.prepare("SELECT id, name, username, role FROM users WHERE id = ? AND deletedAt IS NULL").bind(match[1]).first<User>();
            if (!target) return Response.json({ error: "未找到该用户。" }, { status: 404, headers });
            if (request.method === "DELETE") {
                if (target.id === admin.id) return Response.json({ error: "不能删除当前登录账户。" }, { status: 403, headers });
                await db.batch([
                    db.prepare("DELETE FROM sessions WHERE userId = ?").bind(target.id),
                    db.prepare("UPDATE users SET name = '已删除用户', username = ?, passwordHash = '', passwordSalt = '', deletedAt = ? WHERE id = ?")
                        .bind(`deleted:${target.id}`, new Date().toISOString(), target.id),
                ]);
                return Response.json({ ok: true }, { headers });
            }
            const form = await request.formData();
            const name = String(form.get("name") ?? "").trim();
            const username = String(form.get("username") ?? "").trim().toLowerCase();
            const password = String(form.get("password") ?? "");
            if (!name || name.length > 50 || !/^[a-z0-9_.-]{1,50}$/.test(username) || (password && (password.length < 6 || password.length > 128))) return Response.json({ error: "请检查昵称、用户名和密码长度。" }, { status: 400, headers });
            const duplicate = await db.prepare("SELECT id FROM users WHERE username = ? AND id != ?").bind(username, target.id).first();
            if (duplicate) return Response.json({ error: "该用户名已存在。" }, { status: 409, headers });
            const statements = [db.prepare("UPDATE users SET name = ?, username = ? WHERE id = ?").bind(name, username, target.id)];
            if (password) {
                const salt = Buffer.from(randomBytes(16)).toString("hex");
                statements.push(db.prepare("UPDATE users SET passwordHash = ?, passwordSalt = ? WHERE id = ?").bind(passwordHash(password, salt).toString("hex"), salt, target.id));
            }
            if (password || username !== target.username) statements.push(db.prepare("DELETE FROM sessions WHERE userId = ?").bind(target.id));
            await db.batch(statements);
            return Response.json({ user: { ...target, name, username } }, { headers });
        }
    }
    if (request.method !== "POST") return Response.json({ error: "未找到该登录操作。" }, { status: 404, headers });

    if (path === "/api/auth/logout") {
        await db.prepare("DELETE FROM sessions WHERE tokenHash = ?").bind(sessionHash(request)).run();
        headers.set("Set-Cookie", cookie(request, "", 0));
        return Response.json({ user: null }, { headers });
    }
    if (!["/api/admin/users", "/api/auth/login", "/api/auth/password"].includes(path)) {
        return Response.json({ error: "未找到该登录操作。" }, { status: 404, headers });
    }

    const user = path !== "/api/auth/login" ? await currentUser(request, db) : null;
    if (path !== "/api/auth/login" && !user) return Response.json({ error: "请先登录。" }, { status: 401, headers });
    if (path === "/api/admin/users" && user!.role !== "admin") return Response.json({ error: "只有管理员可以创建用户。" }, { status: 403, headers });
    const form = await request.formData();
    const username = path === "/api/auth/password" ? user!.username : String(form.get("username") ?? "").trim().toLowerCase();
    const password = String(form.get("password") ?? "");
    const now = Date.now();
    const window = Math.floor(now / 900000);
    const keys = [hash(`username:${username}:${window}`)];
    const ip = request.headers.get("CF-Connecting-IP");
    if (ip) keys.push(hash(`ip:${ip}:${window}`));
    await db.prepare("DELETE FROM auth_attempts WHERE expiresAt <= ?").bind(now).run();
    for (const key of keys) {
        const attempt = await db.prepare("INSERT INTO auth_attempts (key, attempts, expiresAt) VALUES (?, 1, ?) ON CONFLICT(key) DO UPDATE SET attempts = attempts + 1 RETURNING attempts")
            .bind(key, (window + 1) * 900000).first<{ attempts: number }>();
        if (attempt!.attempts > (key === keys[0] ? 20 : 100)) {
            headers.set("Retry-After", String(Math.ceil(((window + 1) * 900000 - now) / 1000)));
            return Response.json({ error: "尝试次数过多，请稍后重试。" }, { status: 429, headers });
        }
    }

    if (path === "/api/auth/password") {
        const newPassword = String(form.get("newPassword") ?? "");
        if (password.length > 128 || newPassword.length < 6 || newPassword.length > 128) {
            return Response.json({ error: "新密码长度必须为 6–128 个字符。" }, { status: 400, headers });
        }
        const account = await db.prepare("SELECT passwordHash, passwordSalt FROM users WHERE id = ? AND deletedAt IS NULL").bind(user!.id).first<Account>();
        if (!account) return Response.json({ error: "请重新登录。" }, { status: 401, headers });
        if (!timingSafeEqual(passwordHash(password, account!.passwordSalt), Buffer.from(account!.passwordHash, "hex"))) {
            return Response.json({ error: "当前密码不正确。" }, { status: 400, headers });
        }
        const salt = Buffer.from(randomBytes(16)).toString("hex");
        const [changed] = await db.batch([
            db.prepare("UPDATE users SET passwordHash = ?, passwordSalt = ? WHERE id = ? AND passwordHash = ? AND passwordSalt = ? AND deletedAt IS NULL")
                .bind(passwordHash(newPassword, salt).toString("hex"), salt, user!.id, account.passwordHash, account.passwordSalt),
            db.prepare("DELETE FROM sessions WHERE userId = ? AND changes() > 0").bind(user!.id),
        ]);
        if (!changed.meta.changes) return Response.json({ error: "账户已发生变化，请重新登录。" }, { status: 409, headers });
        headers.set("Set-Cookie", cookie(request, "", 0));
        return Response.json({ user: null }, { headers });
    }

    if (!/^[a-z0-9_.-]{1,50}$/.test(username) || password.length < 6 || password.length > 128) {
        return Response.json({ error: "请输入有效用户名和 6–128 个字符的密码。" }, { status: 400, headers });
    }

    let account = await db.prepare("SELECT id, name, username, role, passwordHash, passwordSalt FROM users WHERE username = ? AND deletedAt IS NULL").bind(username).first<Account>();
    if (path === "/api/admin/users") {
        const name = String(form.get("name") ?? "").trim();
        if (!name || name.length > 50) return Response.json({ error: "昵称长度必须为 1–50 个字符。" }, { status: 400, headers });
        if (account) return Response.json({ error: "该用户名已存在。" }, { status: 409, headers });
        const salt = Buffer.from(randomBytes(16)).toString("hex");
        account = await db.prepare("INSERT INTO users (name, username, passwordHash, passwordSalt, createdAt) VALUES (?, ?, ?, ?, ?) ON CONFLICT(username) DO NOTHING RETURNING id, name, username, role, passwordHash, passwordSalt")
            .bind(name, username, passwordHash(password, salt).toString("hex"), salt, new Date().toISOString()).first<Account>();
        if (!account) return Response.json({ error: "该用户名已存在。" }, { status: 409, headers });
        const { id, name: createdName, role } = account;
        return Response.json({ user: { id, name: createdName, username, role } }, { status: 201, headers });
    } else {
        const digest = passwordHash(password, account?.passwordSalt ?? "00000000000000000000000000000000");
        const expected = account ? Buffer.from(account.passwordHash, "hex") : Buffer.alloc(64);
        const matches = timingSafeEqual(digest, expected);
        if (!account || !matches) return Response.json({ error: "用户名或密码不正确。" }, { status: 401, headers });
    }

    const token = Buffer.from(randomBytes(32)).toString("hex");
    const maxAge = 7 * 24 * 60 * 60;
    const [, created] = await db.batch([
        db.prepare("DELETE FROM sessions WHERE expiresAt <= ? OR tokenHash = ?").bind(now, sessionHash(request)),
        db.prepare("INSERT INTO sessions (tokenHash, userId, expiresAt) SELECT ?, id, ? FROM users WHERE id = ? AND username = ? AND passwordHash = ? AND passwordSalt = ? AND deletedAt IS NULL")
            .bind(hash(token), now + maxAge * 1000, account.id, account.username, account.passwordHash, account.passwordSalt),
    ]);
    if (!created.meta.changes) return Response.json({ error: "账户已发生变化，请重新登录。" }, { status: 401, headers });
    headers.set("Set-Cookie", cookie(request, token, maxAge));
    const { id, name, role } = account;
    return Response.json({ user: { id, name, username, role } }, { headers });
}
