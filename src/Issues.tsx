import { useEffect, useRef, useState } from "react";
import type { RefObject } from "react";
import {
    Alert, Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle,
    LinearProgress, Pagination, Paper, Stack, Tab, Tabs, TextField, Typography,
} from "@mui/material";

import { api, cachedJson, getCachedJson, navigate } from "./api";
import type { Issue, User } from "./api";
import Description from "./Description";
import { assignmentLabels, assignmentRoles } from "../shared/assignments";

export type IssuesView = { search: string; querySearch: string; status: "Open" | "Closed"; page: number };
export const initialIssuesView: IssuesView = { search: "", querySearch: "", status: "Open", page: 1 };
type IssuesData = { issues: Issue[]; counts: { Open: number; Closed: number } };

export default function Issues({ user, savedView }: { user: User | null; savedView: RefObject<IssuesView> }) {
    const [view, setView] = useState(() => savedView.current);
    const { search, querySearch, status, page } = view;
    const url = `/api/issues?${new URLSearchParams({ status, page: String(page), search: querySearch })}`;
    const cached = getCachedJson<IssuesData>(url);
    const [issues, setIssues] = useState<Issue[]>(() => cached?.issues ?? []);
    const [counts, setCounts] = useState(() => cached?.counts ?? { Open: 0, Closed: 0 });
    const [loading, setLoading] = useState(!cached);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");
    const [refresh, setRefresh] = useState(0);
    const lastRefresh = useRef(refresh);
    const [creating, setCreating] = useState(false);
    const [title, setTitle] = useState("");
    const [description, setDescription] = useState("");
    const [images, setImages] = useState<File[]>([]);
    const pages = Math.max(1, Math.ceil(counts[status] / 10));

    useEffect(() => {
        savedView.current = view;
    }, [savedView, view]);

    useEffect(() => {
        if (search.trim() === querySearch) return;
        const timer = window.setTimeout(() => {
            setView(current => ({ ...current, querySearch: search.trim(), page: 1 }));
        }, 300);
        return () => window.clearTimeout(timer);
    }, [search, querySearch, setView]);

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
                <TextField
                    label="搜索标题"
                    value={search}
                    onChange={(event) => {
                        setView(current => ({ ...current, search: event.target.value }));
                    }}
                    fullWidth
                    size="small"
                />
                <Button variant="contained" sx={{ flexShrink: 0, whiteSpace: "nowrap", textTransform: "none" }} onClick={() => {
                    if (!user) { navigate("/login"); return; }
                    setTitle("");
                    setDescription("");
                    setImages([]);
                    setError("");
                    setCreating(true);
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
                        {search.trim() ? "没有符合搜索条件的工单。" : `暂无${status === "Open" ? "未关闭" : "已关闭"}的工单。`}
                    </Typography>
                </Paper>
            )}

            <Stack spacing={2}>
                {issues.map((issue) => (
                    <Paper component="a" href={`/issues/${issue.id}`} key={issue.id} variant="outlined" sx={{ display: "block", color: "text.primary", textDecoration: "none", boxShadow: "none", borderRadius: 1, p: { xs: 2, sm: 2.5 }, "&:hover, &:focus-visible": { bgcolor: "action.hover" }, "&:focus-visible": { outline: "2px solid", outlineColor: "primary.main", outlineOffset: 4 } }}>
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
                                    <Chip key={`${role}-${member.id}`} size="small" label={`${assignmentLabels[role]}：${member.name}`} sx={{ height: "auto", minHeight: 24, "& .MuiChip-label": { whiteSpace: "normal", overflowWrap: "anywhere", py: 0.5 } }} />
                                )))}
                                <Typography variant="caption" color="text.secondary" sx={{ ml: { sm: "auto" }, width: { xs: "100%", sm: "auto" } }}>{new Date(issue.createdAt).toLocaleString("sv-SE")}</Typography>
                            </Stack>
                        </Stack>
                    </Paper>
                ))}
            </Stack>
            {counts[status] > 0 && <Pagination count={pages} page={page} disabled={loading} onChange={(_, value) => setView(current => ({ ...current, page: value }))} />}

            <Dialog open={creating && user !== null} onClose={() => { if (!saving) setCreating(false); }} fullWidth maxWidth="sm" aria-labelledby="create-issue-title">
                <Box component="form" onSubmit={async (event) => {
                    event.preventDefault();
                    if (!title.trim() || saving) return;
                    setSaving(true);
                    setError("");
                    const body = new FormData();
                    body.set("title", title.trim());
                    body.set("description", description.trim());
                    for (const file of images) body.append("images", file);
                    try {
                        const response = await api("/api/issues", { method: "POST", body });
                        const data: { id: number } = await response.json();
                        setCreating(false);
                        setImages([]);
                        navigate(`/issues/${data.id}`);
                    } catch (error) {
                        setError(`创建失败：${String(error)}`);
                    } finally {
                        setSaving(false);
                    }
                }}>
                    <DialogTitle id="create-issue-title">新建工单</DialogTitle>
                    <DialogContent>
                        <Stack spacing={2} sx={{ pt: 1 }}>
                            {error && <Alert severity="error">{error}</Alert>}
                            <TextField label="标题" required autoFocus fullWidth disabled={saving} slotProps={{ htmlInput: { maxLength: 200 } }} value={title} onChange={(event) => setTitle(event.target.value)} />
                            <Description label="描述" value={description} onChange={setDescription} images={images} onImagesChange={setImages} disabled={saving} />
                            <Stack direction="row"><Chip label="低优先级" color="info" variant="outlined" /></Stack>
                        </Stack>
                    </DialogContent>
                    <DialogActions>
                        <Button disabled={saving} onClick={() => setCreating(false)}>取消</Button>
                        <Button type="submit" variant="contained" disabled={!title.trim() || saving}>{saving ? "保存中…" : "创建"}</Button>
                    </DialogActions>
                </Box>
            </Dialog>

        </Stack>
    );
}
