export async function isPasswordBreached(password: string) {
    try {
        const digest = await crypto.subtle.digest("SHA-1", new TextEncoder().encode(password));
        const hash = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("").toUpperCase();
        const response = await fetch(`https://api.pwnedpasswords.com/range/${hash.slice(0, 5)}`, {
            headers: { "Add-Padding": "true" },
            credentials: "omit",
            referrerPolicy: "no-referrer",
            signal: AbortSignal.timeout(10_000),
        });
        if (!response.ok) throw new Error("密码泄露查询失败");
        const rows = (await response.text()).trim().split(/\r?\n/);
        if (!rows.every(row => /^[A-F0-9]{35}:\d+$/i.test(row))) throw new Error("密码泄露查询响应无效");
        return rows.some(row => {
            const [suffix, count] = row.split(":");
            return suffix.toUpperCase() === hash.slice(5) && Number(count) > 0;
        });
    } catch {
        // An unavailable breach check does not block setting a password.
        return false;
    }
}
