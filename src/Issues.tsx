import { useEffect, useRef, useState } from "react";
import {
    Alert, Box, Button, Chip,
    LinearProgress, Pagination, Paper, Stack, Tab, Tabs, Typography,
} from "@mui/material";

import { cachedJson, getCachedJson, navigate } from "./api";
import type { IssueSummary, User } from "./api";
import CreateIssueDialog from "./CreateIssueDialog";
import { assignmentLabels, assignmentRoles } from "../shared/assignments";

type IssuesView = { status: "Open" | "Closed"; page: number };
function readView(): IssuesView {
    const path = window.location.hash.slice(1) || "/";
    const params = new URLSearchParams(path.includes("?") ? path.slice(path.indexOf("?")) : "");
    const page = Number(params.get("page") ?? "1");
    return { status: params.get("status") === "Closed" ? "Closed" : "Open", page: Number.isSafeInteger(page) && page > 0 ? page : 1 };
}
type IssuesData = { issues: IssueSummary[]; counts: { Open: number; Closed: number } };

export default function Issues({ user, locationSearch }: { user: User | null; locationSearch: string }) {
    const [view, setView] = useState(readView);
    const { status, page } = view;
    const url = `/api/issues?${new URLSearchParams({ status, page: String(page) })}`;
    const cached = getCachedJson<IssuesData>(url);
    const [issues, setIssues] = useState<IssueSummary[]>(() => cached?.issues ?? []);
    const [counts, setCounts] = useState(() => cached?.counts ?? { Open: 0, Closed: 0 });
    const [loading, setLoading] = useState(!cached);
    const [error, setError] = useState("");
    const [refresh, setRefresh] = useState(0);
    const lastRefresh = useRef(refresh);
    const [creating, setCreating] = useState<DOMRect | null>(null);
    const pages = Math.max(1, Math.ceil(counts[status] / 10));

    useEffect(() => {
        const params = new URLSearchParams();
        if (status !== "Open") params.set("status", status);
        if (page > 1) params.set("page", String(page));
        const query = params.toString();
        const next = "/" + (query ? `?${query}` : "");
        const path = window.location.hash.slice(1) || "/";
        if (path.split("?")[0] === "/" && next !== path) {
            void navigate(next).then(confirmed => { if (!confirmed) setView(readView()); });
        }
    }, [status, page]);

    useEffect(() => {
        setView(readView());
    }, [locationSearch]);

    useEffect(() => {
        const controller = new AbortController();
        const force = lastRefresh.current !== refresh;
        lastRefresh.current = refresh;
        setLoading(force || !getCachedJson<IssuesData>(url));
        setError("");
        cachedJson<IssuesData>(url, { refresh: force })
            .then(data => {
                if (controller.signal.aborted) return;
                setIssues(data.issues);
                setCounts(data.counts);
                const nextPage = Math.min(page, Math.max(1, Math.ceil(data.counts[status] / 10)));
                if (nextPage !== page) setView(current => ({ ...current, page: nextPage }));
            })
            .catch((error) => {
                if (!controller.signal.aborted) setError(`获取列表失败：${String(error)}`);
            })
            .finally(() => {
                if (!controller.signal.aborted) setLoading(false);
            });
        return () => controller.abort();
    }, [status, page, url, refresh, setView]);

    return (
        <Stack spacing={3}>
            <Paper variant="outlined" sx={{ p: { xs: 2, sm: 2.5 }, borderRadius: 3 }}>
                <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
                    <Button variant="contained" sx={{ flexShrink: 0, whiteSpace: "nowrap", textTransform: "none" }} onClick={event => {
                        if (!user) { navigate("/login"); return; }
                        setError("");
                        setCreating(event.currentTarget.getBoundingClientRect());
                    }}>新建工单</Button>
                </Stack>

                <Tabs value={status} onChange={(_, value: "Open" | "Closed") => {
                    setView(current => ({ ...current, status: value, page: 1 }));
                }} aria-label="工单状态" sx={{ mt: 2, borderBottom: "1px solid", borderColor: "divider" }}>
                    <Tab value="Open" label={`未关闭 (${counts.Open})`} />
                    <Tab value="Closed" label={`已关闭 (${counts.Closed})`} />
                </Tabs>
            </Paper>
            {error && !creating && (
                <Alert severity="error" action={<Button color="inherit" onClick={() => setRefresh((value) => value + 1)}>重试</Button>}>
                    {error}
                </Alert>
            )}
            {loading && <LinearProgress aria-label="正在加载工单" />}
            <Typography variant="body2" color="text.secondary">
                共 {counts[status]} 个工单
            </Typography>

            {!loading && !error && issues.length === 0 && (
                <Paper variant="outlined" sx={{ p: 4, textAlign: "center" }}>
                    <Typography>
                        {`暂无${status === "Open" ? "未关闭" : "已关闭"}的工单。`}
                    </Typography>
                </Paper>
            )}

            <Stack spacing={2}>
                {issues.map((issue) => (
                    <Paper component="a" href={`/#/issues/${issue.id}`} key={issue.id} variant="outlined" sx={{ display: "block", color: "text.primary", textDecoration: "none", boxShadow: "none", borderRadius: 1, p: { xs: 2, sm: 2.5 }, "&:hover, &:focus-visible": { bgcolor: "action.hover" }, "&:focus-visible": { outline: "2px solid", outlineColor: "primary.main", outlineOffset: 4 } }}>
                        <Stack spacing={2}>
                            <Typography
                                title={`#${issue.id} ${issue.title}`}
                                sx={{ color: "text.primary", fontSize: "1rem", fontWeight: 650, overflowWrap: "anywhere" }}
                            >
                                <Box component="span" sx={{ color: "text.secondary", fontWeight: 400, mr: 1.5 }}>#{issue.id}</Box>{issue.title}
                            </Typography>
                            <Stack direction="row" spacing={1} useFlexGap sx={{ alignItems: "center", flexWrap: "wrap" }}>
                                <Chip size="small" label={issue.status === "Open" ? "未关闭" : issue.stateReason === "completed" ? "已完成" : "已关闭"} color={issue.status === "Open" ? "success" : issue.stateReason === "completed" ? "secondary" : "default"} sx={{ "&.MuiChip-colorDefault": { bgcolor: "var(--neutral-bg)", color: "common.white" } }} />
                                <Chip size="small" label={`${{ Low: "低", Medium: "中", High: "高" }[issue.priority]}优先级`} color={issue.priority === "High" ? "error" : issue.priority === "Medium" ? "warning" : "info"} variant="outlined" />
                                <Chip size="small" label={`创建人：${issue.authorName ?? "匿名"}`} sx={{ height: "auto", minHeight: 24, "& .MuiChip-label": { whiteSpace: "normal", overflowWrap: "anywhere", py: 0.5 } }} />
                                {assignmentRoles.flatMap(role => issue.assignees.filter(member => member.role === role).map(member => (
                                    <Chip key={`${role}-${member.id}`} size="small" label={<>
                                        {`${assignmentLabels[role]}：${member.name}`}
                                        {member.id === user?.id && <Box component="span" aria-hidden="true" ref={(node: HTMLSpanElement | null) => {
                                            if (!node) return;
                                            const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
                                            const animation = node.animate([
                                                { transform: "translateX(-120%)", offset: 0 },
                                                { transform: "translateX(120%)", offset: 1 },
                                            ], { duration: 1500, iterations: Infinity, easing: "ease-in-out" });
                                            const updateMotion = () => {
                                                if (reducedMotion.matches) animation.cancel();
                                                else animation.play();
                                            };
                                            updateMotion();
                                            reducedMotion.addEventListener("change", updateMotion);
                                            return () => { animation.cancel(); reducedMotion.removeEventListener("change", updateMotion); };
                                        }} sx={{
                                            position: "absolute", inset: 0, pointerEvents: "none", transform: "translateX(-120%)",
                                            background: "linear-gradient(115deg, transparent 35%, rgba(255, 255, 255, 0.9) 50%, transparent 65%)",
                                            ".dark &": {
                                                background: "linear-gradient(115deg, transparent 35%, rgba(255, 255, 255, 0.5) 50%, transparent 65%)",
                                            },
                                        }} />}
                                    </>}
                                        title={member.id === user?.id ? "你是此工单的关系人" : undefined}
                                        sx={{
                                            height: "auto", minHeight: 24,
                                            "& .MuiChip-label": { whiteSpace: "normal", overflowWrap: "anywhere", py: 0.5 },
                                            ...(member.id === user?.id && {
                                                position: "relative", overflow: "hidden",
                                            }),
                                        }} />
                                )))}
                                <Typography variant="caption" color="text.secondary" sx={{ ml: { sm: "auto" }, width: { xs: "100%", sm: "auto" } }}>{new Date(issue.createdAt).toLocaleString("sv-SE")}</Typography>
                            </Stack>
                        </Stack>
                    </Paper>
                ))}
            </Stack>
            {counts[status] > 0 && <Pagination count={pages} page={page} disabled={loading} onChange={(_, value) => setView(current => ({ ...current, page: value }))} />}

            {creating && user && <CreateIssueDialog origin={creating} onClose={() => setCreating(null)} />}

        </Stack>
    );
}
