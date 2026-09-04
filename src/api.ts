import type { AssignmentRole } from "../shared/assignments";

export type User = { id: number; name: string; username: string; role: "user" | "admin" };
export type Member = Pick<User, "id" | "name" | "username">;
export type Assignee = Member & { role: AssignmentRole };

export type Issue = {
    id: number;
    title: string;
    description: string;
    images: string[];
    priority: "Low" | "Medium" | "High";
    status: "Open" | "Closed";
    stateReason: "completed" | "not_planned" | null;
    createdAt: string;
    authorId: number | null;
    authorName: string | null;
    assignees: Assignee[];
    assignmentVersion: number;
};

export type Reply = {
    id: number;
    version: number;
    authorId: number;
    authorName: string;
    description: string;
    images: string[];
    createdAt: string;
};

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

export function cachedImage(url: string): Promise<Blob> {
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
        if (generation !== imageCacheGeneration) return blob;
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

export async function api(url: string, options?: RequestInit) {
    const session = sessionGeneration;
    const response = await fetch(url, options);
    if (session !== sessionGeneration) throw new DOMException(`请求 ${url} 的登录状态已变更`, "AbortError");
    if (!response.ok) {
        if (response.status === 401) {
            resetApiSession();
            window.dispatchEvent(new Event("auth-expired"));
        }
        const data = await response.json();
        throw new Error(data.error);
    }
    const method = options?.method?.toUpperCase();
    if (method && !["GET", "HEAD"].includes(method)) {
        clearApiCache();
        if (["PATCH", "DELETE"].includes(method) && /^\/api\/replies\/\d+$/.test(url)) clearImageCache();
    }
    return response;
}

export function navigate(path: string) {
    window.history.pushState(null, "", path);
    window.dispatchEvent(new PopStateEvent("popstate"));
    window.scrollTo(0, 0);
}

export type TimelineEntry = (Reply & { kind: "reply" }) | {
    id: number;
    kind: "status" | "priority" | "reply_edited" | "reply_deleted";
    actorName: string | null;
    createdAt: string;
    details: { before: string; after: string; stateReason: Issue["stateReason"]; replyId: number };
} | {
    id: number;
    kind: "assignment";
    actorName: string | null;
    createdAt: string;
    details: { before: { userId: number; role: AssignmentRole; name: string }[]; after: { userId: number; role: AssignmentRole; name: string }[] };
};
