import { createHash, timingSafeEqual } from "node:crypto";
import { Buffer } from "node:buffer";
import { PASSWORD_MIN_LENGTH, PASSWORD_MAX_LENGTH } from "../shared/limits.ts";

const iterations = 100000;
// PBKDF2-HMAC-SHA-256: $iterations$derived-key-hex$salt-hex$

export function hash(value: string) { return createHash("sha256").update(value).digest("hex"); }
export async function passwordHash(password: string, salt: string, rounds = iterations) {
    if (!/^[a-f0-9]{32}$/.test(salt) || rounds !== iterations) throw new Error("派生密码：盐或迭代次数无效。");
    const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
    return Buffer.from(await crypto.subtle.deriveBits({
        name: "PBKDF2", hash: "SHA-256", salt: Buffer.from(salt, "hex"), iterations: rounds,
    }, key, 256));
}
export function passwordValid(password: string) { return password.length >= PASSWORD_MIN_LENGTH && password.length <= PASSWORD_MAX_LENGTH; }
export async function newPassword(password: string) {
    const salt = Buffer.from(crypto.getRandomValues(new Uint8Array(16))).toString("hex");
    const digest = (await passwordHash(password, salt)).toString("hex");
    return `$${iterations}$${digest}$${salt}$`;
}

export async function verifyPassword(password: string, digest: string) {
    if (digest.length === 106) {
        const record = /^\$(100000)\$([a-f0-9]{64})\$([a-f0-9]{32})\$$/.exec(digest);
        if (record) {
            const actual = await passwordHash(password, record[3], Number(record[1]));
            return timingSafeEqual(actual, Buffer.from(record[2], "hex"));
        }
    }
    // Missing accounts and malformed records still perform
    // the current KDF, without accepting arbitrary work factors from stored data.
    const actual = await passwordHash(password, "00000000000000000000000000000000");
    timingSafeEqual(actual, Buffer.alloc(32));
    return false;
}
