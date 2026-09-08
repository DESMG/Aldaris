import { Fragment, useEffect, useRef, useState } from "react";
import { Alert, Avatar, Box, Button, ButtonGroup, Card, CardContent, CardHeader, Chip, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle, Divider, Menu, LinearProgress, MenuItem, Paper, Stack, Typography } from "@mui/material";
import { api, ApiError, assertApiSession, cachedJson, clearApiCache, getApiSessionGeneration, getCachedJson } from "./api";
import type { Issue, Reply, User } from "./api";
import Content from "./IssueContent";
import { EditReplyForm, ReplyForm } from "./ReplyForms";
import AssigneeEditor from "./AssigneeEditor";
import useIssueTimeline from "./useIssueTimeline";
import { assignmentLabels, assignmentRoles } from "../shared/assignments";

const priorityRank: Record<Issue["priority"], number> = { Low: 0, Medium: 1, High: 2 };

export default function IssueDetail({ id, user, replyTarget }: { id: number; user: User | null; replyTarget: string | null }) {
    const apiSession = getApiSessionGeneration();
    const cachedIssue = getCachedJson<{ issue: Issue }>(`/api/issues/${id}`);
    const [issue, setIssue] = useState<Issue | null>(() => cachedIssue?.issue ?? null);
    const [target, setTarget] = useState(replyTarget);
    const [refresh, setRefresh] = useState(0);
    const { entries: replies, loading, error: loadError, hiddenCount, expanding, expand, targetUnavailable, hasSeparateTarget, total } = useIssueTimeline(id, target, refresh);
    const [detailLoading, setDetailLoading] = useState(!cachedIssue);
    const [detailError, setDetailError] = useState("");
    const [detailRefresh, setDetailRefresh] = useState(0);
    const lastDetailRefresh = useRef(detailRefresh);
    const [saving, setSaving] = useState(false);
    const updating = useRef(false);
    const mounted = useRef(false);
    useEffect(() => {
        mounted.current = true;
        return () => { mounted.current = false; };
    }, []);
    const [error, setError] = useState("");
    const [issueConflict, setIssueConflict] = useState<{ field: "status" | "priority"; value: string; stateReason: "completed" | "not_planned" } | null>(null);
    const [editing, setEditing] = useState<number | null>(null);
    const [deleting, setDeleting] = useState<{ id: number; version: number } | null>(null);
    const [deleteConflict, setDeleteConflict] = useState(false);
    const [deletePreview, setDeletePreview] = useState<Reply | null>(null);
    const [deleteLoading, setDeleteLoading] = useState(false);
    const [editingAssignee, setEditingAssignee] = useState(false);
    const [closeMenu, setCloseMenu] = useState<HTMLElement | null>(null);
    const [closeReason, setCloseReason] = useState<"completed" | "not_planned">(() => cachedIssue?.issue.stateReason ?? "completed");
    const canEdit = user !== null && issue !== null && (user.id === issue.authorId || user.role === "admin");

    async function updateIssue(field: "status" | "priority", value: string, stateReason = closeReason) {
        const pathname = (window.location.hash.slice(1) || "/").split("?")[0];
        if (!mounted.current || pathname !== `/issues/${id}` || updating.current || !issue) return false;
        if (field === "priority" && priorityRank[value as Issue["priority"]] <= priorityRank[issue.priority]) {
            clearApiCache();
            setRefresh(value => value + 1);
            setIssueConflict(null);
            setError("");
            return true;
        }
        updating.current = true;
        setSaving(true);
        setError("");
        setIssueConflict(null);
        const body = new FormData();
        body.set(field, value);
        if (field === "status" && value === "Closed") body.set("stateReason", stateReason);
        try {
            const response = await api(`/api/issues/${id}/${field}`, { method: "POST", headers: { "If-Match": `"${issue.version}"` }, body, expectedSession: apiSession });
            const changed: Pick<Issue, "status" | "stateReason" | "version"> | Pick<Issue, "priority" | "version"> = await response.json();
            assertApiSession(apiSession);
            setIssue((current) => current ? { ...current, ...changed } : current);
            if (field === "status") setCloseReason(value === "Open" ? "completed" : stateReason);
            setRefresh(value => value + 1);
            return true;
        } catch (error) {
            if (error instanceof ApiError && error.status === 409) {
                setIssueConflict({ field, value, stateReason });
                setDetailLoading(true);
                setDetailRefresh(value => value + 1);
                setError("工单已被更新，正在重新载入最新属性。你要提交的操作已保留，请核对后重试。");
            } else setError(`更新失败：${String(error)}`);
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
        setTarget(replyTarget);
        setEditing(null);
    }, [replyTarget]);

    useEffect(() => {
        if (!target || loading || !issue) return;
        document.getElementById(`reply-${target}`)?.scrollIntoView({ block: "center" });
    }, [target, loading, issue?.id]);

    useEffect(() => {
        if (!issue) return;
        const previous = document.title;
        document.title = issue.title;
        return () => { document.title = previous; };
    }, [issue?.title]);
    return <Stack spacing={3}>
        {(loading || detailLoading) && <LinearProgress aria-label="正在加载详情" />}
        {detailError && <Alert severity="error" action={<Button color="inherit" onClick={() => setDetailRefresh(value => value + 1)}>重试</Button>}>{detailError}</Alert>}
        {loadError && <Alert severity="error" action={<Button color="inherit" disabled={editing !== null} onClick={() => setRefresh((value) => value + 1)}>重试</Button>}>{loadError}</Alert>}
        {error && <Alert severity="error">{error}</Alert>}
        {issueConflict && <Alert severity="warning" action={<Button color="inherit" disabled={saving || editing !== null || detailLoading || !!detailError} onClick={() => void updateIssue(issueConflict.field, issueConflict.value, issueConflict.stateReason)}>按最新版本重试</Button>}>
            保留的操作：{issueConflict.field === "priority" ? `加急至 ${{ Low: "低", Medium: "中", High: "高" }[issueConflict.value as Issue["priority"]]}优先级` : issueConflict.value === "Open" ? "重新打开工单" : issueConflict.stateReason === "completed" ? "关闭为已完成" : "关闭为不计划处理"}。请比较当前工单属性后提交。
        </Alert>}
        {targetUnavailable && <Alert severity="warning">定位的评论已删除或不可用。</Alert>}
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
                            <CardContent><Content description={issue.description} images={issue.images} clearedImages={issue.clearedImages} mentions={issue.mentions} /></CardContent>
                        </Card>

                        {replies.map((reply, index) => <Fragment key={reply.kind + reply.id}>
                            {index === 10 && hiddenCount > 0 && <Paper id="timeline-gap" variant="outlined" sx={{ p: 2 }}><Stack spacing={1}>
                                <Typography variant="body2">中间还有 {hiddenCount} 条记录未展开 (共 {total} 条)。</Typography>
                                <Button disabled={saving || loading || expanding || editing !== null} onClick={() => void expand()}>{expanding ? "正在展开…" : "展开较早的 20 条记录"}</Button>
                                {hasSeparateTarget && <Typography variant="caption" color="text.secondary">下方单独展示定位的评论；展开记录后会自动合并。</Typography>}
                            </Stack></Paper>}
                            {reply.kind !== "reply" ? <Stack direction="row" spacing={2} sx={{ alignItems: "center", py: 1, pl: 2 }}>
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
                            </Stack> : <Card id={"reply-" + reply.id} variant="outlined" sx={{ boxShadow: "none", borderRadius: 1, borderColor: String(reply.id) === target ? "primary.main" : "divider" }}>
                                <CardHeader avatar={<Avatar>{reply.authorName.slice(0, 1)}</Avatar>} title={reply.authorName} subheader={new Date(reply.createdAt).toLocaleString("sv-SE")}
                                    action={reply.authorId === issue.authorId ? <Chip label="作者" size="small" variant="outlined" /> : undefined} sx={{ bgcolor: "var(--surface-muted)" }} />
                                <Divider />
                                <CardContent><Stack spacing={2}>
                                    {editing === reply.id ? <EditReplyForm reply={reply} saving={saving} onCancel={() => setEditing(null)} onSave={async (description, retainedImages, images, version) => {
                                        if (saving) return;
                                        const pageUrl = window.location.href;
                                        const historyIndex = window.history.state?.aldarisIndex;
                                        setSaving(true);
                                        setError("");
                                        const body = new FormData();
                                        body.set("description", description);
                                        for (const key of retainedImages) body.append("retainedImages", key);
                                        for (const file of images) body.append("images", file);
                                        try {
                                            await api(`/api/replies/${reply.id}`, { method: "PATCH", headers: { "If-Match": `"${version}"` }, body, expectedSession: apiSession });
                                            assertApiSession(apiSession);
                                            if (!mounted.current || window.location.href !== pageUrl || window.history.state?.aldarisIndex !== historyIndex) return;
                                            setEditing(null);
                                            setRefresh(value => value + 1);
                                        } finally { setSaving(false); }
                                    }} /> : <Content description={reply.description} images={reply.images} clearedImages={reply.clearedImages} mentions={reply.mentions} />}
                                    {(user?.id === reply.authorId || user?.role === "admin") && editing !== reply.id && <Stack direction="row" spacing={1}>
                                        <Button variant="text" disabled={saving || loading || editing !== null || editingAssignee} onClick={() => {
                                            setEditing(reply.id);
                                            setError("");
                                        }}>编辑</Button>
                                        <Button variant="text" color="error" disabled={saving || loading || editing !== null || editingAssignee} onClick={() => {
                                            setError("");
                                            setDeleteConflict(false);
                                            setDeletePreview(null);
                                            setDeleting({ id: reply.id, version: reply.version });
                                        }}>删除</Button>
                                    </Stack>}
                                </Stack>
                                </CardContent></Card>}</Fragment>)}
                        {user ? <ReplyForm issueId={id} saving={saving} blocked={loading || detailLoading || !!loadError || !!detailError} editing={editing !== null} onStatus={async (status, reason, replied) => {
                            if (!canEdit) return;
                            const changed = await updateIssue("status", status, reason);
                            if (!changed && replied) setError("回复已发表，但工单状态更新失败。请核对最新属性后重试状态操作，无需重复发表回复。");
                        }} onReply={async (description, images, key) => {
                            const pageUrl = window.location.href;
                            const historyIndex = window.history.state?.aldarisIndex;
                            setSaving(true);
                            setError("");
                            const body = new FormData();
                            body.set("description", description);
                            for (const file of images) body.append("images", file);
                            try {
                                const response = await api(`/api/issues/${id}/replies`, { method: "POST", headers: { "Idempotency-Key": key }, body, expectedSession: apiSession });
                                const created: { id: number } = await response.json();
                                assertApiSession(apiSession);
                                if (!mounted.current || window.location.href !== pageUrl || window.history.state?.aldarisIndex !== historyIndex) return true;
                                setTarget(String(created.id));
                                window.history.replaceState(window.history.state, "", `/#/issues/${id}?reply=${created.id}`);
                                const replyUrl = window.location.href;
                                requestAnimationFrame(() => {
                                    if (mounted.current && window.location.href === replyUrl && window.history.state?.aldarisIndex === historyIndex && getApiSessionGeneration() === apiSession) {
                                        window.dispatchEvent(new PopStateEvent("popstate", { state: window.history.state }));
                                    }
                                });
                                setRefresh((value) => value + 1);
                                return true;
                            } catch (error) {
                                if (mounted.current) setError(`回复失败：${String(error)}`);
                                return false;
                            } finally {
                                if (mounted.current) setSaving(false);
                            }
                        }}>
                            {(hasContent, submitStatus, disabled) => canEdit && <>
                                <ButtonGroup variant="outlined" disabled={disabled} sx={{ flexShrink: 0 }}>
                                    <Button type="button" sx={{ whiteSpace: "nowrap" }} onClick={() => void submitStatus(issue.status === "Open" ? "Closed" : "Open", closeReason)}
                                        startIcon={<Box component="span" aria-hidden="true" sx={{ lineHeight: 1, color: issue.status === "Closed" ? "success.main" : closeReason === "completed" ? "secondary.main" : "text.secondary" }}>{issue.status === "Closed" ? "○" : closeReason === "completed" ? "✓" : "−"}</Box>}>
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
                        </ReplyForm> : <Box><Button variant="outlined" href={`/#/login?next=/issues/${id}`}>登录后回复</Button></Box>}
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
                            {canEdit && issue.priority !== "High" && <Button variant="outlined" color="error" size="small" disabled={saving || editing !== null || detailLoading || !!detailError || issueConflict !== null} onClick={() => void updateIssue("priority", issue.priority === "Low" ? "Medium" : "High")}>
                                加急
                            </Button>}
                        </Stack>
                        <Box><Chip variant="outlined" label={`${{ Low: "低", Medium: "中", High: "高" }[issue.priority]}优先级`} color={issue.priority === "High" ? "error" : issue.priority === "Medium" ? "warning" : "info"} /></Box>
                        <Stack direction="row" sx={{ alignItems: "center", justifyContent: "space-between" }}>
                            <Typography variant="body2" color="text.secondary">负责人</Typography>
                            {canEdit && !editingAssignee && <Button variant="text" disabled={saving || editing !== null} onClick={() => {
                                setEditingAssignee(true);
                            }}>修改</Button>}
                        </Stack>
                        {editingAssignee ? <AssigneeEditor issue={issue} saving={saving} onSavingChange={setSaving} onCancel={() => setEditingAssignee(false)} onSaved={changed => {
                            setIssue(current => current ? { ...current, ...changed } : current);
                            setEditingAssignee(false);
                            setRefresh(value => value + 1);
                        }} /> : assignmentRoles.map(role => {
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
                {deleteConflict && <Alert severity="warning" sx={{ mt: 2 }} action={<Button color="inherit" disabled={saving} onClick={async () => {
                    if (saving || !deleting) return;
                    setSaving(true);
                    setDeleteLoading(true);
                    setError("");
                    try {
                        const response = await api(`/api/replies/${deleting.id}`, { expectedSession: apiSession });
                        const data: { reply: Reply } = await response.json();
                        assertApiSession(apiSession);
                        if (!mounted.current) return;
                        setDeletePreview(data.reply);
                        setDeleting({ id: data.reply.id, version: data.reply.version });
                        setDeleteConflict(false);
                    } catch (error) {
                        if (!mounted.current) return;
                        if (error instanceof ApiError && error.status === 404) {
                            setDeleting(null);
                            setRefresh(value => value + 1);
                            setError("评论已不存在，正在刷新时间线。");
                        } else setError(`读取待删除评论失败：${String(error)}`);
                    } finally {
                        if (mounted.current) { setSaving(false); setDeleteLoading(false); }
                    }
                }}>{deleteLoading ? "载入中…" : "载入最新评论"}</Button>}>评论已被修改，请载入最新内容，核对后再次确认删除。</Alert>}
                {deletePreview && <Stack spacing={2} sx={{ mt: 2 }}>
                    <Typography variant="subtitle2">当前待删除版本 {deletePreview.version}，请核对内容与图片。</Typography>
                    <Content description={deletePreview.description} images={deletePreview.images} clearedImages={deletePreview.clearedImages} mentions={deletePreview.mentions} />
                </Stack>}
            </DialogContent>
            <DialogActions>
                <Button color="inherit" disabled={saving} onClick={() => setDeleting(null)} autoFocus>取消</Button>
                <Button color="error" disabled={saving || deleteConflict} onClick={async () => {
                    if (saving || deleteConflict || !deleting) return;
                    setSaving(true);
                    setError("");
                    try {
                        await api(`/api/replies/${deleting.id}`, { method: "DELETE", headers: { "If-Match": `"${deleting.version}"` }, expectedSession: apiSession });
                        assertApiSession(apiSession);
                        if (!mounted.current) return;
                        setDeleting(null);
                        setRefresh(value => value + 1);
                    } catch (error) {
                        if (!mounted.current) return;
                        if (error instanceof ApiError && error.status === 409) {
                            setDeleteConflict(true);
                            setDeletePreview(null);
                        } else if (error instanceof ApiError && error.status === 404) {
                            setDeleting(null);
                            setRefresh(value => value + 1);
                            setError("评论已不存在，正在刷新时间线。");
                            return;
                        }
                        setError(`删除评论失败：${String(error)}`);
                    } finally { if (mounted.current) setSaving(false); }
                }}>{deleteLoading ? "载入中…" : saving ? "删除中…" : deletePreview ? "确认删除此版本" : "确认删除"}</Button>
            </DialogActions>
        </Dialog>
    </Stack>;
}
