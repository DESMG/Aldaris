export type User = { id: number; name: string; username: string; role: "user" | "admin" };

export type Issue = {
    id: number;
    title: string;
    description: string;
    images: string[];
    priority: "Low" | "Medium" | "High";
    status: "Open" | "Closed";
    createdAt: string;
    authorId: number | null;
    authorName: string | null;
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

export async function api(url: string, options?: RequestInit) {
    const response = await fetch(url, options);
    if (!response.ok) {
        if (response.status === 401) window.dispatchEvent(new Event("auth-expired"));
        const data = await response.json();
        throw new Error(data.error);
    }
    return response;
}

export function navigate(path: string) {
    window.history.pushState(null, "", path);
    window.dispatchEvent(new PopStateEvent("popstate"));
    window.scrollTo(0, 0);
}
