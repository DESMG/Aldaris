import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { Buffer } from "node:buffer";
import type { Env } from "./env";
import type { User } from "../shared/types";
import { HttpError } from "./input";

type Claims = { sub: number; ver: number; iss: string; aud: string; iat: number; exp: number };
const lifetimeSeconds = 7 * 24 * 60 * 60;

function signature(input: string, secret: string) {
    return createHmac("sha256", secret).update(input).digest();
}

async function signingSecret(env: Env) {
    const existing = await env.DB.prepare("SELECT value FROM runtime_secrets WHERE name = 'jwt'").first<{ value: string }>();
    if (existing) return existing.value;

    const generated = Buffer.from(randomBytes(32)).toString("base64url");
    await env.DB.prepare(`
        INSERT OR IGNORE INTO runtime_secrets (name, value, createdAt) VALUES ('jwt', ?, ?)
    `).bind(generated, new Date().toISOString()).run();
    const stored = await env.DB.prepare("SELECT value FROM runtime_secrets WHERE name = 'jwt'").first<{ value: string }>();
    if (!stored) throw new Error("无法初始化认证签名密钥");
    return stored.value;
}

export async function issueToken(request: Request, env: Env, user: User & { credentialVersion: number }) {
    const iat = Math.floor(Date.now() / 1000);
    const origin = new URL(request.url).origin;
    const claims: Claims = { sub: user.id, ver: user.credentialVersion, iss: origin, aud: origin, iat, exp: iat + lifetimeSeconds };
    const input = `${Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url")}.${Buffer.from(JSON.stringify(claims)).toString("base64url")}`;
    const secret = await signingSecret(env);
    return { token: `${input}.${Buffer.from(signature(input, secret)).toString("base64url")}`, expiresAt: claims.exp * 1000 };
}

export async function currentUser(request: Request, env: Env): Promise<User | null> {
    const authorization = request.headers.get("Authorization");
    if (!authorization) return null;
    const match = /^Bearer ([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]+)$/.exec(authorization);
    if (!match || authorization.length > 2048) throw new HttpError(401, "登录凭据无效，请重新登录。");
    const expected = signature(`${match[1]}.${match[2]}`, await signingSecret(env));
    const actual = Buffer.from(match[3], "base64url");
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) throw new HttpError(401, "登录凭据无效，请重新登录。");
    let header: { alg: string; typ: string };
    let claims: Claims;
    try {
        header = JSON.parse(Buffer.from(match[1], "base64url").toString());
        claims = JSON.parse(Buffer.from(match[2], "base64url").toString());
    } catch { throw new HttpError(401, "登录凭据格式无效，请重新登录。"); }
    const now = Math.floor(Date.now() / 1000);
    const origin = new URL(request.url).origin;
    if (!header || header.alg !== "HS256" || header.typ !== "JWT" || !claims
        || claims.iss !== origin || claims.aud !== origin
        || !Number.isSafeInteger(claims.sub) || claims.sub < 1
        || !Number.isSafeInteger(claims.ver) || claims.ver < 1
        || !Number.isSafeInteger(claims.iat) || claims.iat > now
        || !Number.isSafeInteger(claims.exp) || claims.exp <= now || claims.exp - claims.iat !== lifetimeSeconds) {
        throw new HttpError(401, "登录凭据已过期或无效，请重新登录。");
    }
    return env.DB.prepare(`
        SELECT id, name, username, role FROM users
        WHERE id = ? AND credentialVersion = ? AND deletedAt IS NULL
    `).bind(claims.sub, claims.ver).first<User>();
}
