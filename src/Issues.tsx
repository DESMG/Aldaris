import { useEffect, useState } from "react";
import {
    Alert, Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle,
    LinearProgress, MenuItem, Pagination, Paper, Stack, Tab, Tabs, TextField, Typography,
} from "@mui/material";

import { api, navigate } from "./api";
import type { Issue, User } from "./api";
import Description from "./Description";

export default function Issues({ user }: { user: User | null }) {
    const [issues, setIssues] = useState<Issue[]>([]);
    const [search, setSearch] = useState("");
    const [status, setStatus] = useState<"Open" | "Closed">("Open");
    const [page, setPage] = useState(1);
    const [counts, setCounts] = useState({ Open: 0, Closed: 0 });
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");
    const [refresh, setRefresh] = useState(0);
    const [creating, setCreating] = useState(false);
    const [title, setTitle] = useState("");
    const [description, setDescription] = useState("");
    const [images, setImages] = useState<File[]>([]);
    const [priority, setPriority] = useState("Medium");
    const pages = Math.max(1, Math.ceil(counts[status] / 10));

    useEffect(() => {
        const controller = new AbortController();
        setLoading(true);
        setError("");
        const query = new URLSearchParams({ status, page: String(page), search });
        api(`/api/issues?${query}`, { signal: controller.signal })
            .then((response) => response.json())
            .then((data: { issues: Issue[]; counts: { Open: number; Closed: number } }) => {
                if (controller.signal.aborted) return;
                setIssues(data.issues);
                setCounts(data.counts);
                setPage(Math.min(page, Math.max(1, Math.ceil(data.counts[status] / 10))));
            })
            .catch((error) => {
                if (!controller.signal.aborted) setError(`获取列表失败：${String(error)}`);
            })
            .finally(() => {
                if (!controller.signal.aborted) setLoading(false);
            });
        return () => controller.abort();
    }, [status, page, search, refresh]);

    return (
        <Stack spacing={3}>
            <Paper variant="outlined" sx={{ p: { xs: 2, sm: 2.5 }, borderRadius: 3 }}>
            <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
                <TextField
                    label="搜索标题"
                    value={search}
                    onChange={(event) => {
                        setSearch(event.target.value);
                        setPage(1);
                    }}
                    fullWidth
                    size="small"
                />
                <Button variant="contained" sx={{ flexShrink: 0, whiteSpace: "nowrap", textTransform: "none" }} onClick={() => {
                    if (!user) { navigate("/login"); return; }
                    setTitle("");
                    setDescription("");
                    setImages([]);
                    setPriority("Medium");
                    setError("");
                    setCreating(true);
                }}>新建工单</Button>
            </Stack>

            <Tabs value={status} onChange={(_, value: "Open" | "Closed") => {
                setStatus(value);
                setPage(1);
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
                {!loading && !error && issues.map((issue) => (
                    <Paper component="a" href={`/issues/${issue.id}`} key={issue.id} variant="outlined" sx={{ display: "block", color: "text.primary", textDecoration: "none", p: { xs: 2, sm: 2.5 }, borderLeft: "4px solid", borderLeftColor: issue.priority === "High" ? "error.main" : issue.priority === "Medium" ? "warning.main" : "info.main", transition: "border-color 300ms, box-shadow 300ms", "&:hover, &:focus-visible": { borderTopColor: "primary.main", borderRightColor: "primary.main", borderBottomColor: "primary.main", boxShadow: "0 6px 20px rgb(0 0 0 / 12%)" }, "&:focus-visible": { outline: "2px solid", outlineColor: "primary.main", outlineOffset: 4 } }}>
                        <Stack spacing={2}>
                            <Typography
                                title={`#${issue.id} ${issue.title}`}
                                sx={{ color: "text.primary", fontSize: "1rem", fontWeight: 650, overflowWrap: "anywhere" }}
                            >
                                <Box component="span" sx={{ color: "text.secondary", fontWeight: 400, mr: 1.5 }}>#{issue.id}</Box>{issue.title}
                            </Typography>
                            <Stack direction="row" spacing={1} useFlexGap sx={{ alignItems: "center", flexWrap: "wrap" }}>
                                <Chip size="small" label={issue.status === "Open" ? "未关闭" : "已关闭"} color={issue.status === "Open" ? "success" : "default"} />
                                <Chip size="small" label={`${{ Low: "低", Medium: "中", High: "高" }[issue.priority]}优先级`} color={issue.priority === "High" ? "error" : issue.priority === "Medium" ? "warning" : "info"} variant="outlined" />
                                <Typography variant="caption" color="text.secondary" sx={{ ml: { sm: "auto" }, width: { xs: "100%", sm: "auto" } }}>{new Date(issue.createdAt).toLocaleString("sv-SE")}</Typography>
                            </Stack>
                        </Stack>
                    </Paper>
                ))}
            </Stack>
            {counts[status] > 0 && <Pagination count={pages} page={page} disabled={loading} onChange={(_, value) => setPage(value)} />}

            <Dialog open={creating && user !== null} onClose={() => { if (!saving) setCreating(false); }} fullWidth maxWidth="sm" aria-labelledby="create-issue-title">
                <Box component="form" onSubmit={async (event) => {
                    event.preventDefault();
                    if (!title.trim() || saving) return;
                    setSaving(true);
                    setError("");
                    const body = new FormData();
                    body.set("title", title.trim());
                    body.set("description", description.trim());
                    body.set("priority", priority);
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
                            <TextField select label="优先级" disabled={saving} value={priority} onChange={(event) => setPriority(event.target.value)}>
                                <MenuItem value="Low">低</MenuItem>
                                <MenuItem value="Medium">中</MenuItem>
                                <MenuItem value="High">高</MenuItem>
                            </TextField>
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
