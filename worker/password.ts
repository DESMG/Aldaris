import { createHash, randomBytes, scryptSync } from "node:crypto";
import { Buffer } from "node:buffer";
import { PASSWORD_MIN_LENGTH, PASSWORD_MAX_LENGTH } from "../shared/limits";

export function hash(value: string) { return createHash("sha256").update(value).digest("hex"); }
export function passwordHash(password: string, salt: string) {
    return Buffer.from(scryptSync(password, salt, 64, { N: 32768, r: 8, p: 3, maxmem: 64 * 1024 * 1024 }));
}
export function passwordValid(password: string) { return password.length >= PASSWORD_MIN_LENGTH && password.length <= PASSWORD_MAX_LENGTH; }
export function newPassword(password: string) {
    const salt = Buffer.from(randomBytes(16)).toString("hex");
    return { salt, digest: passwordHash(password, salt).toString("hex") };
}
