export type { User, Member, Assignee, Issue, IssueSummary, Reply, TimelineEntry, LoginSession } from "../shared/types";
import type { LoginSession } from "../shared/types";
import { confirmDraftNavigation } from "./DraftGuard";

const jsonCache = new Map<string, { data: unknown; expiresAt: number }>();
const pendingJson = new Map<string, Promise<unknown>>();
const imageCache = new Map<string, { blob: Blob; expiresAt: number }>();
const pendingImages = new Map<string, Promise<Blob>>();
const sessionListeners = new Set<() => void>();
let imageCacheBytes = 0;
let cacheGeneration = 0;
let imageCacheGeneration = 0;
let sessionGeneration = 0;

export function subscribeApiSession(listener: () => void) {
    sessionListeners.add(listener);
    return () => { sessionListeners.delete(listener); };
}

export function getApiSessionGeneration() {
    return sessionGeneration;
}

export function clearApiCache() {
    cacheGeneration++;
    jsonCache.clear();
    pendingJson.clear();
}

function clearImageCache() {
    imageCacheGeneration++;
    imageCache.clear();
    pendingImages.clear();
    imageCacheBytes = 0;
}

export function resetApiSession() {
    sessionGeneration++;
    clearApiCache();
    clearImageCache();
    for (const listener of sessionListeners) listener();
}

export function getCachedJson<T>(url: string): T | undefined {
    const cached = jsonCache.get(url);
    if (!cached) return undefined;
    if (cached.expiresAt <= Date.now()) {
        jsonCache.delete(url);
        return undefined;
    }
    return cached.data as T;
}

export function cachedJson<T>(url: string, { refresh = false }: { refresh?: boolean } = {}): Promise<T> {
    if (!refresh) {
        const cached = getCachedJson<T>(url);
        if (cached !== undefined) return Promise.resolve(cached);
        const pending = pendingJson.get(url);
        if (pending) return pending as Promise<T>;
    }
    jsonCache.delete(url);
    const generation = cacheGeneration;
    const session = sessionGeneration;
    const request = api(url).then(response => response.json()).then((data: T) => {
        if (session !== sessionGeneration) throw new DOMException(`读取 ${url} 的登录状态已变更`, "AbortError");
        if (generation !== cacheGeneration || pendingJson.get(url) !== request) {
            return cachedJson<T>(url);
        }
        for (const [key, cached] of jsonCache) {
            if (cached.expiresAt <= Date.now()) jsonCache.delete(key);
        }
        if (jsonCache.size >= 50) jsonCache.delete(jsonCache.keys().next().value!);
        jsonCache.set(url, { data, expiresAt: Date.now() + 30_000 });
        return data;
    }).finally(() => {
        if (pendingJson.get(url) === request) pendingJson.delete(url);
    });
    pendingJson.set(url, request);
    return request;
}

export function cachedImage(url: string, { refresh = false }: { refresh?: boolean } = {}): Promise<Blob> {
    if (refresh) {
        const previous = imageCache.get(url);
        if (previous) imageCacheBytes -= previous.blob.size;
        imageCache.delete(url);
        pendingImages.delete(url);
    }
    for (const [key, cached] of imageCache) {
        if (cached.expiresAt <= Date.now()) {
            imageCacheBytes -= cached.blob.size;
            imageCache.delete(key);
        }
    }
    const cached = imageCache.get(url);
    if (cached) return Promise.resolve(cached.blob);
    const pending = pendingImages.get(url);
    if (pending) return pending;
    const generation = imageCacheGeneration;
    const session = sessionGeneration;
    const request = api(url).then(response => response.blob()).then(blob => {
        if (session !== sessionGeneration) throw new DOMException(`读取图片 ${url} 的登录状态已变更`, "AbortError");
        if (generation !== imageCacheGeneration || pendingImages.get(url) !== request) return blob;
        if (blob.size <= 10 * 1024 * 1024) {
            while (imageCache.size > 0 && (imageCacheBytes + blob.size > 50 * 1024 * 1024 || imageCache.size >= 50)) {
                const key = imageCache.keys().next().value!;
                imageCacheBytes -= imageCache.get(key)!.blob.size;
                imageCache.delete(key);
            }
            imageCache.set(url, { blob, expiresAt: Date.now() + 30_000 });
            imageCacheBytes += blob.size;
        }
        return blob;
    }).finally(() => {
        if (pendingImages.get(url) === request) pendingImages.delete(url);
    });
    pendingImages.set(url, request);
    return request;
}

export function forgetImage(url: string) {
    const cached = imageCache.get(url);
    if (cached) imageCacheBytes -= cached.blob.size;
    imageCache.delete(url);
    pendingImages.delete(url);
}

export class ApiError extends Error {
    status: number;
    constructor(status: number, message: string) { super(message); this.name = "ApiError"; this.status = status; }
    override toString() { return this.message.replace(/[。.]+$/, ""); }
}

export const LOGIN_STORAGE_KEY = "aldaris.login";

export function getLoginSession(): LoginSession | null {
    const raw = localStorage.getItem(LOGIN_STORAGE_KEY);
    if (!raw) return null;
    let session: LoginSession;
    try {
        session = JSON.parse(raw);
        if (!session || typeof session.token !== "string" || !session.token || !session.user
            || !Number.isSafeInteger(session.user.id) || session.user.id < 1
            || typeof session.user.name !== "string" || typeof session.user.username !== "string"
            || !["user", "admin"].includes(session.user.role) || !Number.isSafeInteger(session.expiresAt)) throw new Error();
    } catch {
        setLoginSession(null);
        throw new Error("保存的登录状态损坏，已清除，请重新登录。");
    }
    if (session.expiresAt <= Date.now()) { setLoginSession(null); return null; }
    return session;
}

export function setLoginSession(session: LoginSession | null) {
    if (session) {
        const value = JSON.stringify(session);
        localStorage.setItem(LOGIN_STORAGE_KEY, value);
        sessionStorage.setItem(LOGIN_STORAGE_KEY, value);
    } else {
        localStorage.removeItem(LOGIN_STORAGE_KEY);
        sessionStorage.removeItem(LOGIN_STORAGE_KEY);
    }
    resetApiSession();
    window.dispatchEvent(new Event("auth-session-changed"));
}

export function synchronizeSession() {
    const shared = localStorage.getItem(LOGIN_STORAGE_KEY);
    if (shared === sessionStorage.getItem(LOGIN_STORAGE_KEY)) return false;
    if (shared === null) sessionStorage.removeItem(LOGIN_STORAGE_KEY);
    else sessionStorage.setItem(LOGIN_STORAGE_KEY, shared);
    resetApiSession();
    window.dispatchEvent(new Event("auth-session-changed"));
    return true;
}

export function assertApiSession(expected: number) {
    synchronizeSession();
    if (expected !== sessionGeneration) throw new DOMException("登录状态已变更，已取消旧账户操作。", "AbortError");
}

export async function api(url: string, options?: RequestInit & { expectedSession?: number }) {
    const method = options?.method?.toUpperCase() ?? "GET";
    const mutation = !["GET", "HEAD"].includes(method);
    if (synchronizeSession() && mutation) throw new ApiError(409, "另一个标签页已切换账户，请确认当前账户后重新操作。");
    if (options?.expectedSession !== undefined) assertApiSession(options.expectedSession);
    const login = getLoginSession();
    const stored = localStorage.getItem(LOGIN_STORAGE_KEY);
    const session = sessionGeneration;
    const headers = new Headers(options?.headers);
    if (login) headers.set("Authorization", `Bearer ${login.token}`);
    const timeout = new AbortController();
    const timer = window.setTimeout(() => timeout.abort(new DOMException("请求超时，请重试。", "TimeoutError")), mutation ? 120_000 : 30_000);
    const signal = options?.signal ? AbortSignal.any([options.signal, timeout.signal]) : timeout.signal;
    let response: Response;
    let payload: Blob;
    try {
        response = await fetch(url, { ...options, headers, credentials: "omit", signal });
        payload = await response.blob();
    } finally { window.clearTimeout(timer); }
    if (session !== sessionGeneration || stored !== localStorage.getItem(LOGIN_STORAGE_KEY)) {
        synchronizeSession();
        throw new DOMException("请求期间登录状态已变更。", "AbortError");
    }
    if (!response.ok) {
        if (response.status === 401 && stored !== null && !url.startsWith("/api/auth/login")) {
            setLoginSession(null);
            window.dispatchEvent(new Event("auth-expired"));
        }
        let message = `请求失败 (HTTP ${response.status})，请稍后重试。`;
        if (response.headers.get("Content-Type")?.includes("application/json")) {
            try {
                const data = JSON.parse(await payload.text());
                if (data.error) message = String(data.error);
            } catch { message = `服务返回了无效响应 (HTTP ${response.status})。`; }
        }
        throw new ApiError(response.status, message);
    }
    if (mutation) {
        clearApiCache();
        if (["PATCH", "DELETE"].includes(method) && /^\/api\/replies\/\d+$/.test(url)) clearImageCache();
    }
    return new Response(response.status === 204 || response.status === 205 || response.status === 304 ? null : payload, {
        status: response.status, statusText: response.statusText, headers: response.headers,
    });
}

export function navigate(path: string) {
    if (!confirmDraftNavigation()) return false;
    const index = (window.history.state?.aldarisIndex ?? 0) + 1;
    window.history.pushState({ aldarisIndex: index }, "", path);
    window.dispatchEvent(new PopStateEvent("popstate", { state: window.history.state }));
    window.scrollTo(0, 0);
    return true;
}
