import { useEffect, useRef, useState } from "react";
import { cachedJson, getCachedJson } from "./api";
import type { Reply, TimelineEntry } from "./api";

type TimelineData = {
    entries: TimelineEntry[];
    total: number;
    hiddenCount: number;
    beforeCursor: string | null;
    targetEntry: (Reply & { kind: "reply" }) | null;
    targetUnavailable: boolean;
};

export default function useIssueTimeline(id: number, target: string | null, refresh: number) {
    const url = `/api/issues/${id}/timeline${target ? `?target=${encodeURIComponent(target)}` : ""}`;
    const cached = getCachedJson<TimelineData>(url);
    const [data, setData] = useState<TimelineData>(() => cached ?? { entries: [], total: 0, hiddenCount: 0, beforeCursor: null, targetEntry: null, targetUnavailable: false });
    const [loading, setLoading] = useState(!cached);
    const [expanding, setExpanding] = useState(false);
    const [error, setError] = useState("");
    const lastRefresh = useRef(refresh);
    const generation = useRef(0);
    const expandingRef = useRef(false);
    useEffect(() => {
        const current = ++generation.current;
        let cancelled = false;
        const force = lastRefresh.current !== refresh;
        lastRefresh.current = refresh;
        setLoading(force || !getCachedJson(url));
        setError("");
        cachedJson<TimelineData>(url, { refresh: force }).then(next => {
            if (!cancelled && current === generation.current) setData(next);
        }).catch(error => {
            if (!cancelled && current === generation.current) setError(`读取时间线失败：${String(error)}`);
        }).finally(() => {
            if (!cancelled && current === generation.current) setLoading(false);
        });
        return () => { cancelled = true; generation.current++; };
    }, [url, refresh]);

    async function expand() {
        if (!data.beforeCursor || loading || expandingRef.current) return;
        expandingRef.current = true;
        setExpanding(true);
        setError("");
        const current = generation.current;
        const anchor = document.getElementById("timeline-gap");
        const top = anchor?.getBoundingClientRect().top;
        try {
            const next = await cachedJson<TimelineData>(`/api/issues/${id}/timeline?before=${encodeURIComponent(data.beforeCursor)}`, { refresh: true });
            if (current !== generation.current) return;
            setData(previous => {
                const known = new Set(previous.entries.map(entry => `${entry.kind}:${entry.id}`));
                const added = next.entries.filter(entry => !known.has(`${entry.kind}:${entry.id}`));
                return { ...previous, entries: [...previous.entries.slice(0, 10), ...added, ...previous.entries.slice(10)], total: next.total, hiddenCount: next.hiddenCount, beforeCursor: next.beforeCursor };
            });
            requestAnimationFrame(() => {
                if (top === undefined || !anchor?.isConnected) return;
                window.scrollBy(0, anchor.getBoundingClientRect().top - top);
            });
        } catch (error) {
            if (current === generation.current) setError(`展开时间线失败：${String(error)}`);
        } finally { expandingRef.current = false; setExpanding(false); }
    }
    const targetInEntries = data.targetEntry && data.entries.some(entry => entry.kind === "reply" && entry.id === data.targetEntry!.id);
    const entries = data.targetEntry && !targetInEntries
        ? [...data.entries.slice(0, 10), data.targetEntry, ...data.entries.slice(10)] : data.entries;
    return { ...data, entries, loading, expanding, error, expand, hasSeparateTarget: !!data.targetEntry && !targetInEntries };
}
