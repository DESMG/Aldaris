import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Alert, Avatar, Box, Button, ButtonGroup, Card, CardContent, CardHeader, Chip, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle, Divider, Menu, LinearProgress, MenuItem, Modal, Pagination, Paper, Stack, TextField, Typography } from "@mui/material";
import { api, cachedJson, getCachedJson } from "./api";
import type { Assignee, Issue, Reply, TimelineEntry, User } from "./api";
import Description from "./Description";
import CachedImage from "./CachedImage";
import UserPicker from "./UserPicker";
import { mentionMatches } from "../shared/mentions";
import { assignmentLabels, assignmentRoles } from "../shared/assignments";

function Content({ description, images }: { description: string; images: string[] }) {
    const [expandedImage, setExpandedImage] = useState<string | null>(null);
    const [view, setView] = useState({ scale: 1, x: 0, y: 0 });
    const preview = useRef<HTMLDivElement>(null);
    const pointers = useRef(new Map<number, { x: number; y: number }>());
    const dragged = useRef(false);
    useEffect(() => {
        if (expandedImage === null) return;
        const wheel = (event: WheelEvent) => {
            if (!preview.current || !event.composedPath().includes(preview.current)) return;
            event.preventDefault();
            const unit = event.deltaMode === WheelEvent.DOM_DELTA_LINE ? 16
                : event.deltaMode === WheelEvent.DOM_DELTA_PAGE ? window.innerHeight : 1;
            setView(current => {
                const scale = Math.min(8, Math.max(1, current.scale * Math.exp(-event.deltaY * unit * 0.01)));
                return { scale, x: current.x * scale / current.scale, y: current.y * scale / current.scale };
            });
        };
        document.addEventListener("wheel", wheel, { passive: false, capture: true });
        return () => document.removeEventListener("wheel", wheel, true);
    }, [expandedImage]);
    let offset = 0;
    const text = mentionMatches(description).flatMap(match => {
        const before = description.slice(offset, match.index);
        offset = match.index + match[0].length;
        return [before, <Box key={match.index} component="span" sx={{ color: "primary.main", fontWeight: 700 }}>{match[0]}</Box>];
    });
    return <Stack spacing={2}>
        {description && <Typography sx={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{text}{description.slice(offset)}</Typography>}
        {images.map((key, index) => <Box component="button" type="button" key={key}
            aria-label={`放大图片 ${index + 1}`}
            aria-expanded={expandedImage === key}
            onClick={event => {
                event.currentTarget.focus({ preventScroll: true });
                setView({ scale: 1, x: 0, y: 0 });
                pointers.current.clear();
                dragged.current = false;
                setExpandedImage(key);
            }}
            sx={{
                display: "flex", alignItems: "center", justifyContent: "center", border: 0,
                p: 0, background: "transparent", cursor: "zoom-in", alignSelf: "flex-start", maxWidth: "100%", touchAction: "manipulation",
                "&:focus-visible": { outline: "2px solid", outlineColor: "primary.main", outlineOffset: 2 },
            }}>
            <CachedImage src={`/api/images/${key}?private=1`} alt={`图片 ${index + 1}`} sx={{
                display: "block", maxWidth: "100%", maxHeight: 480, objectFit: "contain",
            }} />
        </Box>)}
        <Modal open={expandedImage !== null} onClose={() => setExpandedImage(null)}
            slotProps={{ backdrop: { sx: { backgroundColor: "var(--overlay-backdrop)" } } }}>
            <Box ref={preview} role="dialog" aria-modal="true" aria-label="图片放大预览"
                sx={{ position: "absolute", inset: 0, overflow: "hidden", touchAction: "none" }}>
                <Box onClick={() => { if (!dragged.current) setExpandedImage(null); }}
                    onPointerDown={event => {
                        if (event.button !== 0) return;
                        if (pointers.current.size === 0) dragged.current = false;
                        pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
                        if (pointers.current.size > 1) dragged.current = true;
                        event.currentTarget.setPointerCapture(event.pointerId);
                    }}
                    onPointerMove={event => {
                        const previous = pointers.current.get(event.pointerId);
                        if (!previous) return;
                        const next = { x: event.clientX, y: event.clientY };
                        const other = [...pointers.current.entries()].find(([id]) => id !== event.pointerId)?.[1];
                        pointers.current.set(event.pointerId, next);
                        const dx = next.x - previous.x;
                        const dy = next.y - previous.y;
                        if (dx === 0 && dy === 0) return;
                        dragged.current = true;
                        if (other) {
                            const before = Math.hypot(previous.x - other.x, previous.y - other.y);
                            const after = Math.hypot(next.x - other.x, next.y - other.y);
                            if (before === 0) return;
                            setView(current => {
                                const scale = Math.min(8, Math.max(1, current.scale * after / before));
                                return { scale, x: current.x * scale / current.scale + dx / 2,
                                    y: current.y * scale / current.scale + dy / 2 };
                            });
                        } else {
                            setView(current => ({ ...current, x: current.x + dx, y: current.y + dy }));
                        }
                    }}
                    onPointerUp={event => { pointers.current.delete(event.pointerId); }}
                    onPointerCancel={event => { dragged.current = true; pointers.current.delete(event.pointerId); }}
                    onLostPointerCapture={event => { pointers.current.delete(event.pointerId); }}
                    sx={{
                    display: "flex", alignItems: "center", justifyContent: "center", width: "100%", height: "100%",
                    p: 2, boxSizing: "border-box", cursor: "grab", userSelect: "none", "&:active": { cursor: "grabbing" },
                }}>
                    {expandedImage !== null && <CachedImage src={`/api/images/${expandedImage}?private=1`}
                        alt={`图片 ${images.indexOf(expandedImage) + 1}`} sx={{
                            display: "block", minWidth: 0, maxWidth: "100%", maxHeight: "100%", objectFit: "contain",
                            transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})`,
                        }} />}
                </Box>
                <Stack direction="row" spacing={1} sx={{ position: "absolute", top: 16, right: 16 }}>
                    <Button onClick={() => setView({ scale: 1, x: 0, y: 0 })}>重置缩放</Button>
                    <Button onClick={() => setExpandedImage(null)}>关闭预览</Button>
                </Stack>
            </Box>
        </Modal>
    </Stack>;
}

function ReplyForm({ saving, blocked, editing, onReply, onStatus, children }: {
    saving: boolean;
    blocked: boolean;
    editing: boolean;
    onReply: (description: string, images: File[]) => Promise<boolean>;
    onStatus: (status: "Open" | "Closed", reason: "completed" | "not_planned", replied: boolean) => Promise<void>;
    children: (hasContent: boolean, submit: (status: "Open" | "Closed", reason: "completed" | "not_planned") => Promise<void>, disabled: boolean) => ReactNode;
}) {
    const [description, setDescription] = useState("");
    const [images, setImages] = useState<File[]>([]);
    const submitting = useRef(false);
    const hasContent = !!description.trim() || images.length > 0;
    const disabled = saving || blocked || editing;
    async function submit(status?: "Open" | "Closed", reason: "completed" | "not_planned" = "completed") {
        if (disabled || submitting.current || (!status && !hasContent)) return;
        submitting.current = true;
        try {
            if (hasContent) {
                if (!await onReply(description.trim(), images)) return;
                setDescription("");
                setImages([]);
            }
            if (status) await onStatus(status, reason, hasContent);
        } finally {
            submitting.current = false;
        }
    }
    return <Box component="form" sx={{ p: { xs: 2, sm: 3 }, bgcolor: "background.paper", border: "1px solid", borderColor: "divider", borderRadius: 1 }} onSubmit={event => {
        event.preventDefault();
        void submit();
    }}>
        <Stack spacing={2}>
            <Typography component="h2" variant="h6">参与讨论</Typography>
            <Description label="回复内容" value={description} onChange={setDescription} images={images} onImagesChange={setImages} disabled={saving} />
            {editing && <Typography variant="body2" color="text.secondary">请先保存或取消评论编辑，再发表新回复。</Typography>}
            <Box sx={{ display: "flex", flexWrap: "wrap", justifyContent: "flex-end", alignItems: "center", gap: 1 }}>
                {children(hasContent, submit, disabled)}
                <Button type="submit" variant="contained" disabled={disabled || !hasContent}>{saving ? "保存中…" : "发表回复"}</Button>
            </Box>
        </Stack>
    </Box>;
}

function EditReplyForm({ reply, saving, onSave, onCancel }: {
    reply: Reply;
    saving: boolean;
    onSave: (description: string, retainedImages: string[], images: File[], version: number) => Promise<void>;
    onCancel: () => void;
}) {
    const [description, setDescription] = useState(reply.description);
    const [retainedImages, setRetainedImages] = useState(reply.images);
    const [images, setImages] = useState<File[]>([]);
    const [version] = useState(reply.version);
    const submitting = useRef(false);
    const disabled = saving || (!description.trim() && !retainedImages.length && !images.length);
    return <Box component="form" onSubmit={async event => {
        event.preventDefault();
        if (disabled || submitting.current) return;
        submitting.current = true;
        try {
            await onSave(description, retainedImages, images, version);
        } finally {
            submitting.current = false;
        }
    }}>
        <Stack spacing={2}>
            <Description label="评论内容" value={description} onChange={setDescription} images={images} onImagesChange={setImages} disabled={saving} />
            {retainedImages.map((key, index) => <Stack key={key} spacing={1}>
                <Content description="" images={[key]} />
                <Box><Button disabled={saving} onClick={() => setRetainedImages(keys => keys.filter(image => image !== key))}>移除图片 {index + 1}</Button></Box>
            </Stack>)}
            <Stack direction="row" spacing={1}>
                <Button type="submit" variant="contained" disabled={disabled}>保存</Button>
                <Button color="inherit" disabled={saving} onClick={onCancel}>取消</Button>
            </Stack>
        </Stack>
    </Box>;
}

export default function IssueDetail({ id, user, replyTarget }: { id: number; user: User | null; replyTarget: string | null }) {
    const cachedIssue = getCachedJson<{ issue: Issue }>(`/api/issues/${id}`);
    const cachedTimeline = getCachedJson<{ entries: TimelineEntry[]; total: number; page: number }>(`/api/issues/${id}/timeline?page=1${replyTarget ? `&target=${encodeURIComponent(replyTarget)}` : ""}`);
    const targetResolved = useRef(false);
    const targetScrolled = useRef(false);
    const resolvedPage = useRef<{ id: number; page: number; refresh: number; replyTarget: string | null } | null>(null);
    const [issue, setIssue] = useState<Issue | null>(() => cachedIssue?.issue ?? null);
    const [replies, setReplies] = useState<TimelineEntry[]>(() => cachedTimeline?.entries ?? []);
    const [total, setTotal] = useState(() => cachedTimeline?.total ?? 0);
    const [page, setPage] = useState(1);
    const [refresh, setRefresh] = useState(0);
    const [loading, setLoading] = useState(!cachedTimeline);
    const [detailLoading, setDetailLoading] = useState(!cachedIssue);
    const [detailError, setDetailError] = useState("");
    const [detailRefresh, setDetailRefresh] = useState(0);
    const lastRefresh = useRef(refresh);
    const lastDetailRefresh = useRef(detailRefresh);
    const [saving, setSaving] = useState(false);
    const updating = useRef(false);
    const [loadError, setLoadError] = useState("");
    const [error, setError] = useState("");
    const [editing, setEditing] = useState<number | null>(null);
    const [deleting, setDeleting] = useState<{ id: number; version: number } | null>(null);
    const [editingPriority, setEditingPriority] = useState(false);
    const [editingAssignee, setEditingAssignee] = useState(false);
    const [assignees, setAssignees] = useState<Assignee[]>([]);
    const [assignmentVersion, setAssignmentVersion] = useState(1);
    const [closeMenu, setCloseMenu] = useState<HTMLElement | null>(null);
    const [closeReason, setCloseReason] = useState<"completed" | "not_planned">(() => cachedIssue?.issue.stateReason ?? "completed");
    const canEdit = user !== null && issue !== null && (user.id === issue.authorId || user.role === "admin");

    async function updateIssue(field: "status" | "priority", value: string, stateReason = closeReason) {
        if (updating.current) return false;
        updating.current = true;
        setSaving(true);
        setError("");
        const body = new FormData();
        body.set(field, value);
        if (field === "status" && value === "Closed") body.set("stateReason", stateReason);
        try {
            const response = await api(`/api/issues/${id}/${field}`, { method: "POST", body });
            const changed: Pick<Issue, "status" | "stateReason"> | Pick<Issue, "priority"> = await response.json();
            setIssue((current) => current ? { ...current, ...changed } : current);
            if (field === "status") setCloseReason(value === "Open" ? "completed" : stateReason);
            setRefresh(value => value + 1);
            if (field === "priority") setEditingPriority(false);
            return true;
        } catch (error) {
            setError(`更新失败：${String(error)}`);
            return false;
        } finally {
            setSaving(false);
            updating.current = false;
        }
    }

    useEffect(() => {
        const controller = new AbortController();
        const force = lastDetailRefresh.current !== detailRefresh;
        lastDetailRefresh.current = detailRefresh;
        setDetailLoading(force || !getCachedJson(`/api/issues/${id}`));
        setDetailError("");
        cachedJson<{ issue: Issue }>(`/api/issues/${id}`, { refresh: force })
            .then((data: { issue: Issue }) => {
                if (!controller.signal.aborted) {
                    setIssue(data.issue);
                    setCloseReason(data.issue.stateReason ?? "completed");
                }
            }).catch(error => {
                if (!controller.signal.aborted) setDetailError(`读取详情失败：${String(error)}`);
            }).finally(() => {
                if (!controller.signal.aborted) setDetailLoading(false);
            });
        return () => controller.abort();
    }, [id, detailRefresh]);

    useEffect(() => {
        targetResolved.current = false;
        targetScrolled.current = false;
        resolvedPage.current = null;
    }, [id, replyTarget]);

    useEffect(() => {
        const resolved = resolvedPage.current;
        if (resolved && resolved.id === id && resolved.page === page && resolved.refresh === refresh && resolved.replyTarget === replyTarget) return;
        resolvedPage.current = null;
        const controller = new AbortController();
        const force = lastRefresh.current !== refresh;
        lastRefresh.current = refresh;
        setLoadError("");
        const targetQuery = replyTarget && !targetResolved.current ? `&target=${encodeURIComponent(replyTarget)}` : "";
        const url = `/api/issues/${id}/timeline?page=${page}${targetQuery}`;
        setLoading(force || !getCachedJson(url));
        cachedJson<{ entries: TimelineEntry[]; total: number; page: number }>(url, { refresh: force })
        .then((comments: { entries: TimelineEntry[]; total: number; page: number }) => {
            if (controller.signal.aborted) return;
            targetResolved.current = true;
            const lastPage = Math.max(1, Math.ceil(comments.total / 20));
            if (comments.page > lastPage) {
                setPage(lastPage);
                setRefresh(value => value + 1);
                return;
            }
            resolvedPage.current = { id, page: comments.page, refresh, replyTarget };
            setLoading(false);
            setPage(comments.page);
            setReplies(comments.entries);
            setTotal(comments.total);
        }).catch((error) => {
            if (!controller.signal.aborted) setLoadError(`读取时间线失败：${String(error)}`);
        }).finally(() => {
            if (!controller.signal.aborted) setLoading(false);
        });
        return () => controller.abort();
    }, [id, page, refresh, replyTarget]);

    useEffect(() => {
        if (!replyTarget || !targetResolved.current || loading || !issue || targetScrolled.current) return;
        const target = document.getElementById(`reply-${replyTarget}`);
        if (target) { target.scrollIntoView({ block: "center" }); targetScrolled.current = true; }
    }, [replyTarget, loading, issue, replies]);

    return <Stack spacing={3}>
        <Box><Button color="inherit" variant="outlined" href="/">← 返回列表</Button></Box>
        {(loading || detailLoading) && <LinearProgress aria-label="正在加载详情" />}
        {detailError && <Alert severity="error" action={<Button color="inherit" onClick={() => setDetailRefresh(value => value + 1)}>重试</Button>}>{detailError}</Alert>}
        {loadError && <Alert severity="error" action={<Button color="inherit" onClick={() => setRefresh((value) => value + 1)}>重试</Button>}>{loadError}</Alert>}
        {error && <Alert severity="error">{error}</Alert>}
        {issue &&
            <Box sx={{ display: "grid", gridTemplateColumns: { xs: "minmax(0, 1fr)", md: "minmax(0, 1fr) 280px" }, gap: 3, alignItems: "start" }}>
                <Stack spacing={3} sx={{ minWidth: 0 }}>
                    <Stack spacing={1}>
                        <Typography component="h1" variant="h5" sx={{ overflowWrap: "anywhere" }}>{issue.title} <Box component="span" sx={{ color: "text.secondary", fontWeight: 400 }}>#{issue.id}</Box></Typography>
                        <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
                            <Chip label={issue.status === "Open" ? "未关闭" : issue.stateReason === "completed" ? "已完成" : "已关闭"} color={issue.status === "Open" ? "success" : issue.stateReason === "completed" ? "secondary" : "default"} sx={{ "&.MuiChip-colorDefault": { bgcolor: "var(--neutral-bg)", color: "common.white" } }} />
                            <Typography variant="body2" color="text.secondary">{issue.authorName ?? "匿名"} 创建了此工单</Typography>
                        </Stack>
                    </Stack>
                    <Stack spacing={3} aria-label="工单时间线" sx={{
                        position: "relative", minWidth: 0,
                        "&::before": { content: '\'\'', position: "absolute", top: 0, bottom: 0, left: 32, width: 2, bgcolor: "divider" },
                        "& > *": { position: "relative" },
                    }}>
                    <Card variant="outlined" sx={{ boxShadow: "none", borderRadius: 1 }}>
                        <CardHeader avatar={<Avatar>{(issue.authorName ?? "匿").slice(0, 1)}</Avatar>} title={issue.authorName ?? "匿名"} subheader={new Date(issue.createdAt).toLocaleString("sv-SE")} sx={{ bgcolor: "var(--surface-muted)" }} />
                        <Divider />
                        <CardContent><Content description={issue.description} images={issue.images} /></CardContent>
                    </Card>

                    {replies.map((reply) => reply.kind !== "reply" ? <Stack key={reply.kind + reply.id} direction="row" spacing={2} sx={{ alignItems: "center", py: 1, pl: 2 }}>
                        <Avatar sx={{ width: 32, height: 32, fontSize: 16, bgcolor: reply.kind === "status" ? (reply.details.after === "Open" ? "var(--positive-bg)" : reply.details.stateReason === "completed" ? "var(--done-bg)" : "var(--neutral-bg)") : "var(--timeline-bg)", color: reply.kind === "status" ? "common.white" : "text.secondary" }}>
                            {reply.kind === "status" ? (reply.details.after === "Open" ? "○" : reply.details.stateReason === "completed" ? "✓" : "−") : "•"}
                        </Avatar>
                        <Stack spacing={0.5} sx={{ minWidth: 0 }}>
                            <Typography variant="body2" sx={{ overflowWrap: "anywhere" }}>
                                <Box component="span" sx={{ fontWeight: 700 }}>{reply.actorName ?? "匿名"}</Box>{" "}
                                {reply.kind === "status" ? (reply.details.after === "Open" ? "重新打开了工单" : (reply.details.before === "Closed" ? "更改了关闭原因 (" : "关闭了工单 (") + (reply.details.stateReason === "completed" ? "已完成" : "已关闭") + ")")
                                    : reply.kind === "priority" ? "将优先级从 " + reply.details.before + " 改为 " + reply.details.after
                                    : reply.kind === "assignment" ? "更新了负责人"
                                    : reply.kind === "reply_edited" ? "编辑了评论 #" + reply.details.replyId : "删除了评论 #" + reply.details.replyId}
                            </Typography>
                            {reply.kind === "assignment" && assignmentRoles.map(role => {
                                const removed = reply.details.before.filter(member => member.role === role && !reply.details.after.some(next => next.userId === member.userId && next.role === role));
                                const added = reply.details.after.filter(member => member.role === role && !reply.details.before.some(previous => previous.userId === member.userId && previous.role === role));
                                return (removed.length > 0 || added.length > 0) && <Typography key={role} variant="body2" sx={{ overflowWrap: "anywhere" }}>
                                    {assignmentLabels[role]}：{removed.length > 0 && "移除 " + removed.map(member => member.name).join("、")}
                                    {removed.length > 0 && added.length > 0 && "；"}{added.length > 0 && "指派 " + added.map(member => member.name).join("、")}
                                </Typography>;
                            })}
                            <Typography component="time" dateTime={reply.createdAt} variant="caption" color="text.secondary">{new Date(reply.createdAt).toLocaleString("sv-SE")}</Typography>
                        </Stack>
                    </Stack> : <Card id={"reply-" + reply.id} key={"reply" + reply.id} variant="outlined" sx={{ boxShadow: "none", borderRadius: 1, borderColor: String(reply.id) === replyTarget ? "primary.main" : "divider" }}>
                        <CardHeader avatar={<Avatar>{reply.authorName.slice(0, 1)}</Avatar>} title={reply.authorName} subheader={new Date(reply.createdAt).toLocaleString("sv-SE")}
                            action={reply.authorId === issue.authorId ? <Chip label="作者" size="small" variant="outlined" /> : undefined} sx={{ bgcolor: "var(--surface-muted)" }} />
                        <Divider />
                        <CardContent><Stack spacing={2}>
                            {editing === reply.id ? <EditReplyForm reply={reply} saving={saving} onCancel={() => setEditing(null)} onSave={async (description, retainedImages, images, version) => {
                                if (saving) return;
                                setSaving(true);
                                setError("");
                                const body = new FormData();
                                body.set("description", description);
                                for (const key of retainedImages) body.append("retainedImages", key);
                                for (const file of images) body.append("images", file);
                                try {
                                    await api(`/api/replies/${reply.id}`, { method: "PATCH", headers: { "If-Match": `"${version}"` }, body });
                                    setEditing(null);
                                    setRefresh(value => value + 1);
                                } catch (error) { setError(`编辑评论失败：${String(error)}`); }
                                finally { setSaving(false); }
                            }} /> : <Content description={reply.description} images={reply.images} />}
                            {(user?.id === reply.authorId || user?.role === "admin") && editing !== reply.id && <Stack direction="row" spacing={1}>
                                <Button variant="text" disabled={saving || loading || editing !== null} onClick={() => {
                                    setEditing(reply.id);
                                    setError("");
                                }}>编辑</Button>
                                <Button variant="text" color="error" disabled={saving || loading || editing !== null} onClick={() => { setError(""); setDeleting({ id: reply.id, version: reply.version }); }}>删除</Button>
                            </Stack>}
                        </Stack>
                    </CardContent></Card>)}
                    {total > 20 && <Pagination sx={{ bgcolor: "background.default", py: 1 }} page={page} count={Math.ceil(total / 20)} disabled={saving || loading || editing !== null} onChange={(_, value) => setPage(value)} />}
                    {user ? <ReplyForm saving={saving} blocked={loading || detailLoading || !!loadError || !!detailError} editing={editing !== null} onStatus={async (status, reason, replied) => {
                        if (!canEdit) return;
                        const changed = await updateIssue("status", status, reason);
                        if (changed) setPage(Math.ceil((total + (replied ? 2 : 1)) / 20));
                        else if (replied) setError("回复已发表，但工单状态更新失败。请重试状态操作，无需重复发表回复。");
                    }} onReply={async (description, images) => {
                        setSaving(true);
                        setError("");
                        const body = new FormData();
                        body.set("description", description);
                        for (const file of images) body.append("images", file);
                        try {
                            await api(`/api/issues/${id}/replies`, { method: "POST", body });
                            setPage(Math.ceil((total + 1) / 20));
                            setRefresh((value) => value + 1);
                            return true;
                        } catch (error) {
                            setError(`回复失败：${String(error)}`);
                            return false;
                        } finally {
                            setSaving(false);
                        }
                    }}>
                        {(hasContent, submitStatus, disabled) => canEdit && <>
                            <ButtonGroup variant="outlined" disabled={disabled} sx={{ flexShrink: 0 }}>
                                <Button type="button" sx={{ whiteSpace: "nowrap" }} onClick={() => void submitStatus(issue.status === "Open" ? "Closed" : "Open", closeReason)}
                                    startIcon={<Box component="span" aria-hidden="true" sx={{ color: issue.status === "Closed" ? "success.main" : closeReason === "completed" ? "secondary.main" : "text.secondary" }}>{issue.status === "Closed" ? "○" : closeReason === "completed" ? "✓" : "−"}</Box>}>
                                    {hasContent ? "回复并" : ""}{issue.status === "Closed" ? "重新打开" : closeReason === "completed" ? "关闭工单" : "关闭为不计划处理"}
                                </Button>
                                <Button type="button" sx={{ px: 1, minWidth: "36px !important", flex: "0 0 36px" }} aria-label={issue.status === "Closed" ? "更改关闭原因" : "选择关闭原因"} aria-haspopup="menu" aria-controls={closeMenu ? "close-reason-menu" : undefined} aria-expanded={Boolean(closeMenu)} onClick={event => setCloseMenu(event.currentTarget)}>▾</Button>
                            </ButtonGroup>
                            <Menu id="close-reason-menu" anchorEl={closeMenu} open={Boolean(closeMenu)} onClose={() => setCloseMenu(null)}>
                                {(["completed", "not_planned"] as const).map(reason => <MenuItem key={reason} role="menuitemradio" aria-checked={(issue.status === "Closed" ? issue.stateReason : closeReason) === reason}
                                    selected={(issue.status === "Closed" ? issue.stateReason : closeReason) === reason} disabled={disabled || (issue.status === "Closed" && issue.stateReason === reason)}
                                    onClick={() => {
                                        setCloseMenu(null);
                                        if (issue.status === "Closed") void updateIssue("status", "Closed", reason);
                                        else setCloseReason(reason);
                                    }}>
                                    <Box component="span" aria-hidden="true" sx={{ color: reason === "completed" ? "secondary.main" : "text.secondary", mr: 1.5 }}>{reason === "completed" ? "✓" : "−"}</Box>
                                    <Box><Typography>{reason === "completed" ? "已完成" : "不计划处理"}</Typography><Typography variant="caption" color="text.secondary">{reason === "completed" ? "问题已解决，工作已完成" : "不再处理此问题"}</Typography></Box>
                                </MenuItem>)}
                            </Menu>
                        </>}
                    </ReplyForm> : <Box><Button variant="outlined" href={`/login?next=/issues/${id}`}>登录后回复</Button></Box>}
                    </Stack>
                </Stack>
                <Paper component="aside" variant="outlined" sx={{ p: 2.5, position: { md: "sticky" }, top: 24 }}>
                    <Stack spacing={2}>
                        <Typography component="h2" variant="h6">问题属性</Typography>
                        <Typography variant="body2" color="text.secondary">状态</Typography>
                        <Box><Chip label={issue.status === "Open" ? "未关闭" : issue.stateReason === "completed" ? "已完成" : "已关闭"} color={issue.status === "Open" ? "success" : issue.stateReason === "completed" ? "secondary" : "default"} sx={{ "&.MuiChip-colorDefault": { bgcolor: "var(--neutral-bg)", color: "common.white" } }} /></Box>
                        <Divider />
                        <Stack direction="row" sx={{ alignItems: "center", justifyContent: "space-between" }}>
                            <Typography variant="body2" color="text.secondary">优先级</Typography>
                            {canEdit && !editingPriority && <Button variant="text" disabled={saving} onClick={() => setEditingPriority(true)}>修改</Button>}
                        </Stack>
                        {editingPriority ? <Stack spacing={1}><TextField select label="修改优先级" size="small" value={issue.priority} disabled={saving} onChange={(event) => updateIssue("priority", event.target.value)}>
                            <MenuItem value="Low">低</MenuItem>
                            <MenuItem value="Medium">中</MenuItem>
                            <MenuItem value="High">高</MenuItem>
                        </TextField><Button variant="text" disabled={saving} onClick={() => setEditingPriority(false)}>取消</Button></Stack>
                            : <Box><Chip variant="outlined" label={`${{ Low: "低", Medium: "中", High: "高" }[issue.priority]}优先级`} color={issue.priority === "High" ? "error" : issue.priority === "Medium" ? "warning" : "info"} /></Box>}
                        <Stack direction="row" sx={{ alignItems: "center", justifyContent: "space-between" }}>
                            <Typography variant="body2" color="text.secondary">负责人</Typography>
                            {canEdit && !editingAssignee && <Button variant="text" disabled={saving} onClick={() => {
                                setAssignees(issue.assignees);
                                setAssignmentVersion(issue.assignmentVersion);
                                setEditingAssignee(true);
                            }}>修改</Button>}
                        </Stack>
                        {editingAssignee ? <Stack spacing={1}>
                            {assignmentRoles.map(role => <UserPicker key={role} label={assignmentLabels[role]} value={assignees.filter(member => member.role === role)}
                                onChange={members => setAssignees(current => [...current.filter(member => member.role !== role), ...members.map(member => ({ ...member, role }))])} disabled={saving} />)}
                            <Button variant="contained" disabled={saving} onClick={async () => {
                                setSaving(true); setError("");
                                const body = new FormData();
                                for (const member of assignees) body.append(member.role, String(member.id));
                                try {
                                    const response = await api(`/api/issues/${id}/assignees`, { method: "POST", headers: { "If-Match": `"${assignmentVersion}"` }, body });
                                    const changed: Pick<Issue, "assignees" | "assignmentVersion"> = await response.json();
                                    setIssue(current => current ? { ...current, ...changed } : current);
                                    setEditingAssignee(false);
                                    setRefresh(value => value + 1);
                                } catch (error) { setError(`指派失败：${String(error)}`); }
                                finally { setSaving(false); }
                            }}>保存指派</Button>
                            <Button variant="text" disabled={saving} onClick={() => setEditingAssignee(false)}>取消</Button>
                        </Stack> : assignmentRoles.map(role => {
                            const members = issue.assignees.filter(member => member.role === role);
                            return <Stack key={role} spacing={0.5}>
                                <Typography variant="caption" color="text.secondary">{assignmentLabels[role]}</Typography>
                                {members.length === 0 ? <Typography variant="body2" color="text.secondary">未指派</Typography>
                                    : members.map(member => <Typography key={member.id} variant="body2" sx={{ overflowWrap: "anywhere" }}>{member.name} (@{member.username})</Typography>)}
                            </Stack>;
                        })}
                    </Stack>
                </Paper>
            </Box>}
        <Dialog open={deleting !== null} onClose={() => { if (!saving) setDeleting(null); }} fullWidth maxWidth="xs" aria-labelledby="delete-reply-title" aria-describedby="delete-reply-description">
            <DialogTitle id="delete-reply-title">删除评论</DialogTitle>
            <DialogContent>
                <DialogContentText id="delete-reply-description">删除这条评论及其全部图片？此操作无法撤销。</DialogContentText>
                {error && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}
            </DialogContent>
            <DialogActions>
                <Button color="inherit" disabled={saving} onClick={() => setDeleting(null)} autoFocus>取消</Button>
                <Button color="error" disabled={saving} onClick={async () => {
                    if (saving || !deleting) return;
                    setSaving(true);
                    setError("");
                    try {
                        await api(`/api/replies/${deleting.id}`, { method: "DELETE", headers: { "If-Match": `"${deleting.version}"` } });
                        setDeleting(null);
                        setRefresh(value => value + 1);
                    } catch (error) { setError(`删除评论失败：${String(error)}`); }
                    finally { setSaving(false); }
                }}>{saving ? "删除中…" : "确认删除"}</Button>
            </DialogActions>
        </Dialog>
    </Stack>;
}
