import { useEffect, useState } from "react";
import { Alert, Box, Button, Chip, LinearProgress, MenuItem, Pagination, Paper, Stack, TextField, Typography } from "@mui/material";
import { api } from "./api";
import type { Issue, Reply, User } from "./api";
import Description from "./Description";

function Content({ description, images }: { description: string; images: string[] }) {
    return <Stack spacing={2}>
        {description && <Typography sx={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{description}</Typography>}
        {images.map((key, index) => <Box component="a" key={key} href={`/api/images/${key}?private=1`} target="_blank" rel="noreferrer">
            <Box component="img" src={`/api/images/${key}?private=1`} alt={`图片 ${index + 1}`} sx={{ display: "block", maxWidth: "100%", maxHeight: 480, objectFit: "contain" }} />
        </Box>)}
    </Stack>;
}

export default function IssueDetail({ id, user }: { id: number; user: User | null }) {
    const [issue, setIssue] = useState<Issue | null>(null);
    const [replies, setReplies] = useState<Reply[]>([]);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(1);
    const [refresh, setRefresh] = useState(0);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [loadError, setLoadError] = useState("");
    const [error, setError] = useState("");
    const [description, setDescription] = useState("");
    const [images, setImages] = useState<File[]>([]);
    const [editing, setEditing] = useState<number | null>(null);
    const [editVersion, setEditVersion] = useState(0);
    const [editDescription, setEditDescription] = useState("");
    const [retainedImages, setRetainedImages] = useState<string[]>([]);
    const [editImages, setEditImages] = useState<File[]>([]);
    const canEdit = user !== null && issue !== null && (user.id === issue.authorId || user.role === "admin");

    async function updateIssue(field: "status" | "priority", value: string) {
        setSaving(true);
        setError("");
        const body = new FormData();
        body.set(field, value);
        try {
            const response = await api(`/api/issues/${id}/${field}`, { method: "POST", body });
            const changed: Pick<Issue, "status"> | Pick<Issue, "priority"> = await response.json();
            setIssue((current) => current ? { ...current, ...changed } : current);
        } catch (error) {
            setError(`更新失败：${String(error)}`);
        } finally {
            setSaving(false);
        }
    }

    useEffect(() => {
        const controller = new AbortController();
        setLoading(true);
        setLoadError("");
        Promise.all([
            api(`/api/issues/${id}`, { signal: controller.signal }).then((response) => response.json()),
            api(`/api/issues/${id}/replies?page=${page}`, { signal: controller.signal }).then((response) => response.json()),
        ]).then(([detail, comments]: [{ issue: Issue }, { replies: Reply[]; total: number }]) => {
            if (controller.signal.aborted) return;
            setIssue(detail.issue);
            setReplies(comments.replies);
            setTotal(comments.total);
        }).catch((error) => {
            if (!controller.signal.aborted) setLoadError(`读取详情失败：${String(error)}`);
        }).finally(() => {
            if (!controller.signal.aborted) setLoading(false);
        });
        return () => controller.abort();
    }, [id, page, refresh]);

    return <Stack spacing={3}>
        <Box><Button color="inherit" variant="outlined" href="/">← 返回列表</Button></Box>
        {loading && <LinearProgress aria-label="正在加载详情" />}
        {loadError && <Alert severity="error" action={<Button color="inherit" onClick={() => setRefresh((value) => value + 1)}>重试</Button>}>{loadError}</Alert>}
        {error && <Alert severity="error">{error}</Alert>}
        {!loading && !loadError && issue &&
            <Box sx={{ display: "grid", gridTemplateColumns: { xs: "minmax(0, 1fr)", md: "minmax(0, 1fr) 240px" }, gap: 3, alignItems: "start" }}>
                <Stack spacing={3} sx={{ minWidth: 0 }}>
                    <Typography component="h1" variant="h5" sx={{ overflowWrap: "anywhere", minWidth: 0 }}>#{issue.id} {issue.title}</Typography>
                    <Paper variant="outlined" sx={{ p: { xs: 2, sm: 3 }, borderTop: "4px solid", borderTopColor: "primary.main" }}>
                        <Stack spacing={2}>
                            <Typography variant="overline" color="primary.main" sx={{ fontWeight: 700 }}>问题描述</Typography>
                            <Stack direction="row" spacing={1} useFlexGap sx={{ alignItems: "center", flexWrap: "wrap" }}>
                                <Typography variant="body2">{issue.authorName ?? "匿名"}</Typography>
                                <Typography variant="body2" color="text.secondary">{new Date(issue.createdAt).toLocaleString("sv-SE")}</Typography>
                            </Stack>
                            <Content description={issue.description} images={issue.images} />
                        </Stack>
                    </Paper>

                    <Typography component="h2" variant="h6">回复 ({total})</Typography>
                    {replies.map((reply) => <Paper key={reply.id} variant="outlined" sx={{ p: { xs: 2, sm: 3 }, ml: { sm: 2 }, borderLeft: "3px solid", borderLeftColor: reply.authorId === issue.authorId ? "primary.main" : "divider", boxShadow: "none" }}>
                        <Stack spacing={2}>
                            <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: "wrap", alignItems: "center" }}>
                                <Typography variant="body2" sx={{ fontWeight: 700 }}>{reply.authorName}</Typography>
                                {reply.authorId === issue.authorId && <Chip label="作者" size="small" variant="outlined" />}
                                <Typography variant="body2" color="text.secondary">{new Date(reply.createdAt).toLocaleString("sv-SE")}</Typography>
                            </Stack>
                            {editing === reply.id ? <Box component="form" onSubmit={async event => {
                                event.preventDefault();
                                if (saving) return;
                                setSaving(true);
                                setError("");
                                const body = new FormData();
                                body.set("description", editDescription);
                                for (const key of retainedImages) body.append("retainedImages", key);
                                for (const file of editImages) body.append("images", file);
                                try {
                                    await api(`/api/replies/${reply.id}`, { method: "PATCH", headers: { "If-Match": `"${editVersion}"` }, body });
                                    setEditing(null);
                                    setEditImages([]);
                                    setRefresh(value => value + 1);
                                } catch (error) { setError(`编辑评论失败：${String(error)}`); }
                                finally { setSaving(false); }
                            }}>
                                <Stack spacing={2}>
                                    <Description label="评论内容" value={editDescription} onChange={setEditDescription} images={editImages} onImagesChange={setEditImages} disabled={saving} />
                                    {retainedImages.map((key, index) => <Stack key={key} spacing={1}>
                                        <Content description="" images={[key]} />
                                        <Box><Button disabled={saving} onClick={() => setRetainedImages(keys => keys.filter(image => image !== key))}>移除图片 {index + 1}</Button></Box>
                                    </Stack>)}
                                    <Stack direction="row" spacing={1}>
                                        <Button type="submit" disabled={saving || (!editDescription.trim() && !retainedImages.length && !editImages.length)}>保存</Button>
                                        <Button color="inherit" disabled={saving} onClick={() => { setEditing(null); setEditImages([]); }}>取消</Button>
                                    </Stack>
                                </Stack>
                            </Box> : <Content description={reply.description} images={reply.images} />}
                            {(user?.id === reply.authorId || user?.role === "admin") && editing !== reply.id && <Stack direction="row" spacing={1}>
                                <Button variant="text" disabled={saving || editing !== null} onClick={() => {
                                    setEditing(reply.id);
                                    setEditVersion(reply.version);
                                    setEditDescription(reply.description);
                                    setRetainedImages(reply.images);
                                    setEditImages([]);
                                    setError("");
                                }}>编辑</Button>
                                <Button variant="text" color="error" disabled={saving || editing !== null} onClick={async () => {
                                    if (!window.confirm("删除这条评论及其全部图片？此操作无法撤销。")) return;
                                    setSaving(true);
                                    setError("");
                                    try {
                                        await api(`/api/replies/${reply.id}`, { method: "DELETE", headers: { "If-Match": `"${reply.version}"` } });
                                        setPage(Math.min(page, Math.max(1, Math.ceil((total - 1) / 10))));
                                        setRefresh(value => value + 1);
                                    } catch (error) { setError(`删除评论失败：${String(error)}`); }
                                    finally { setSaving(false); }
                                }}>删除</Button>
                            </Stack>}
                        </Stack>
                    </Paper>)}
                    {total > 10 && <Pagination page={page} count={Math.ceil(total / 10)} disabled={saving} onChange={(_, value) => setPage(value)} />}
                    {user ? <Box component="form" sx={{ p: { xs: 2, sm: 3 }, bgcolor: "background.paper", border: "1px solid", borderColor: "primary.main", borderRadius: 3 }} onSubmit={async (event) => {
                        event.preventDefault();
                        if (saving || (!description.trim() && images.length === 0)) return;
                        setSaving(true);
                        setError("");
                        const body = new FormData();
                        body.set("description", description.trim());
                        for (const file of images) body.append("images", file);
                        try {
                            await api(`/api/issues/${id}/replies`, { method: "POST", body });
                            setDescription("");
                            setImages([]);
                            setPage(Math.ceil((total + 1) / 10));
                            setRefresh((value) => value + 1);
                        } catch (error) {
                            setError(`回复失败：${String(error)}`);
                        } finally {
                            setSaving(false);
                        }
                    }}>
                        <Stack spacing={2}>
                            <Typography component="h2" variant="h6">参与讨论</Typography>
                            <Description label="回复内容" value={description} onChange={setDescription} images={images} onImagesChange={setImages} disabled={saving} />
                            <Box><Button type="submit" variant="contained" disabled={saving || (!description.trim() && images.length === 0)}>{saving ? "保存中…" : "发表回复"}</Button></Box>
                        </Stack>
                    </Box> : <Box><Button variant="outlined" href={`/login?next=/issues/${id}`}>登录后回复</Button></Box>}
                </Stack>
                <Paper component="aside" variant="outlined" sx={{ p: 2.5, borderTop: "4px solid", borderTopColor: "info.main", position: { md: "sticky" }, top: 24 }}>
                    <Stack spacing={2}>
                        <Typography component="h2" variant="h6">问题属性</Typography>
                        <Typography variant="body2" color="text.secondary">状态</Typography>
                        <Box><Chip label={issue.status === "Open" ? "未关闭" : "已关闭"} color={issue.status === "Open" ? "success" : "default"} /></Box>
                        {canEdit && <Button variant="outlined" disabled={saving} onClick={() => updateIssue("status", issue.status === "Open" ? "Closed" : "Open")}>
                            {issue.status === "Open" ? "关闭工单" : "重新打开"}
                        </Button>}
                        <TextField select label="优先级" size="small" value={issue.priority} disabled={!canEdit || saving} onChange={(event) => updateIssue("priority", event.target.value)}>
                            <MenuItem value="Low">低</MenuItem>
                            <MenuItem value="Medium">中</MenuItem>
                            <MenuItem value="High">高</MenuItem>
                        </TextField>
                    </Stack>
                </Paper>
            </Box>}
    </Stack>;
}
