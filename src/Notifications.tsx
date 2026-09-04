import { useEffect, useRef, useState } from "react";
import { Alert, Badge, Box, Button, Checkbox, Chip, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle, FormControlLabel, IconButton, LinearProgress, Paper, Snackbar, Stack, SvgIcon, Typography } from "@mui/material";
import { api, assertApiSession, cachedJson, getApiSessionGeneration, getCachedJson, navigate } from "./api";
import { assignmentLabels } from "../shared/assignments";
import type { Notification, NotificationsPage } from "../shared/types";
import { NOTIFICATION_BATCH_LIMIT } from "../shared/limits";

export function NotificationLink() {
    const [total, setTotal] = useState<number | null>(null);
    const [error, setError] = useState("");
    useEffect(() => {
        let controller: AbortController | null = null;
        let lastRefresh = -Infinity;
        let pendingChange = false;
        const refresh = () => {
            if (controller || document.visibilityState === "hidden") return;
            if (!pendingChange && Date.now() - lastRefresh < 60_000) return;
            lastRefresh = Date.now();
            pendingChange = false;
            controller = new AbortController();
            const active = controller;
            api("/api/notifications/unread", { signal: active.signal }).then(response => response.json())
                .then((data: { total: number }) => { if (!active.signal.aborted) { setTotal(data.total); setError(""); } })
                .catch(error => { if (!active.signal.aborted) setError(`读取未读通知失败：${String(error)}`); })
                .finally(() => {
                    if (active.signal.aborted) return;
                    controller = null;
                    if (pendingChange) refresh();
                });
        };
        refresh();
        const timer = window.setInterval(refresh, 60_000);
        const changed = () => { pendingChange = true; refresh(); };
        window.addEventListener("focus", refresh);
        window.addEventListener("notifications-changed", changed);
        return () => {
            controller?.abort(); window.clearInterval(timer);
            window.removeEventListener("focus", refresh);
            window.removeEventListener("notifications-changed", changed);
        };
    }, []);
    const label = error ? "通知中心 (读取失败)" : total === null ? "通知中心" : `通知中心 (${total} 条未读)`;
    return <IconButton href="/notifications" color="inherit" aria-label={label} title={error || label}>
        <Badge badgeContent={error ? "!" : total} color={error ? "error" : "primary"} max={99}>
            <SvgIcon><path d="M12 22a2 2 0 0 0 2-2h-4a2 2 0 0 0 2 2Zm6-6v-5c0-3.07-1.63-5.64-4.5-6.32V4a1.5 1.5 0 0 0-3 0v.68C7.64 5.36 6 7.92 6 11v5l-2 2v1h16v-1Zm-2 1H8v-6c0-2.48 1.51-4.5 4-4.5s4 2.02 4 4.5Z" /></SvgIcon>
        </Badge>
    </IconButton>;
}

export default function Notifications() {
    const apiSession = getApiSessionGeneration();
    const cached = getCachedJson<NotificationsPage>("/api/notifications?filter=all");
    const [notifications, setNotifications] = useState<Notification[]>(cached?.notifications ?? []);
    const [selected, setSelected] = useState<number[]>([]);
    const [before, setBefore] = useState(0);
    const [next, setNext] = useState<number | null>(cached?.next ?? null);
    const [loading, setLoading] = useState(!cached);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");
    const [refresh, setRefresh] = useState(0);
    const forceRefresh = useRef(false);
    const [deleting, setDeleting] = useState<number[]>([]);
    const [message, setMessage] = useState("");
    useEffect(() => {
        let cancelled = false;
        const url = `/api/notifications?filter=all${before ? `&before=${before}` : ""}`;
        const force = forceRefresh.current;
        forceRefresh.current = false;
        setLoading(force || !getCachedJson(url)); setError("");
        cachedJson<NotificationsPage>(url, { refresh: force })
            .then(data => {
                if (cancelled) return;
                setNotifications(current => before ? [...current.filter(item => item.id >= before), ...data.notifications] : data.notifications);
                setNext(data.next);
            }).catch(error => { if (!cancelled) setError(`读取通知失败：${String(error)}`); })
            .finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, [before, refresh]);
    async function updateNotifications(ids: number[], action: "read" | "unread" | "delete", background = false) {
        if (saving || loading || !ids.length) return false;
        setSaving(true); setError("");
        try {
            const form = new FormData();
            for (const id of ids) form.append("id", String(id));
            const response = await api(`/api/notifications/${action}`, { method: "POST", body: form, keepalive: true, expectedSession: apiSession });
            assertApiSession(apiSession);
            if (action === "read") {
                const data: { readAt: string } = await response.json();
                assertApiSession(apiSession);
                setNotifications(current => current.map(notification => ids.includes(notification.id) && notification.readAt === null ? { ...notification, readAt: data.readAt } : notification));
            } else if (action === "unread") {
                setNotifications(current => current.map(notification => ids.includes(notification.id) ? { ...notification, readAt: null } : notification));
            } else {
                setBefore(0);
                setSelected([]);
                setRefresh(value => value + 1);
                setDeleting([]);
                setMessage("通知已删除。");
            }
            setSelected(current => current.filter(id => !ids.includes(id)));
            window.dispatchEvent(new Event("notifications-changed"));
            return true;
        } catch (error) {
            setError(`${action === "read" ? "标记已读" : action === "unread" ? "标记未读" : "删除通知"}失败：${String(error)}`);
            if (background) {
                try {
                    assertApiSession(apiSession);
                    window.dispatchEvent(new CustomEvent("app-notice", { detail: `标记通知已读失败，请在通知中心重试：${String(error)}` }));
                } catch { /* Account changes must not display the previous account's errors. */ }
            }
            return false;
        } finally { setSaving(false); }
    }
    return <Stack spacing={2}>
        <Box><Button color="inherit" variant="outlined" href="/" disabled={saving}>← 返回列表</Button></Box>
        <Stack direction="row" sx={{ alignItems: "center", justifyContent: "space-between" }}>
            <Typography component="h1" variant="h5">个人通知中心</Typography>
            <Button variant="outlined" disabled={loading || saving} onClick={() => { forceRefresh.current = true; setBefore(0); setSelected([]); setRefresh(value => value + 1); }}>刷新</Button>
        </Stack>
        <Stack direction="row" spacing={1} useFlexGap sx={{ alignItems: "center", flexWrap: "wrap" }}>
            <FormControlLabel label={`选择前 ${NOTIFICATION_BATCH_LIMIT} 条`} control={<Checkbox disabled={loading || saving || !notifications.length}
                checked={notifications.length > 0 && notifications.slice(0, NOTIFICATION_BATCH_LIMIT).every(item => selected.includes(item.id))}
                indeterminate={selected.length > 0 && !notifications.slice(0, NOTIFICATION_BATCH_LIMIT).every(item => selected.includes(item.id))}
                onChange={(_, checked) => setSelected(checked ? notifications.slice(0, NOTIFICATION_BATCH_LIMIT).map(notification => notification.id) : [])} />} />
            <Typography variant="body2">已勾选 {selected.length}/{NOTIFICATION_BATCH_LIMIT} 条</Typography>
            <Button variant="outlined" disabled={loading || saving || !notifications.some(notification => selected.includes(notification.id) && notification.readAt === null)} onClick={() => void updateNotifications(selected, "read")}>一键已读</Button>
            <Button variant="outlined" disabled={loading || saving || !notifications.some(notification => selected.includes(notification.id) && notification.readAt !== null)} onClick={() => void updateNotifications(selected, "unread")}>一键未读</Button>
            <Button variant="outlined" color="error" disabled={loading || saving || !selected.length} onClick={() => { setError(""); setDeleting([...selected]); }}>一键删除</Button>
        </Stack>
        {loading && <LinearProgress aria-label="正在读取通知" />}
        {error && !deleting.length && <Alert severity="error">{error}</Alert>}
        {!loading && !error && notifications.length === 0 && <Paper variant="outlined" sx={{ p: 4 }}><Typography>暂无通知。</Typography></Paper>}
        {notifications.map(notification => <Paper key={notification.id} variant="outlined" sx={{ p: 2.5, borderLeft: "4px solid", borderLeftColor: notification.readAt === null ? "primary.main" : "divider" }}>
            <Stack spacing={1.5}>
                <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
                    <Checkbox checked={selected.includes(notification.id)} disabled={loading || saving || (selected.length >= NOTIFICATION_BATCH_LIMIT && !selected.includes(notification.id))} slotProps={{ input: { "aria-label": `选择通知 #${notification.id}` } }} onChange={(_, checked) => setSelected(current => checked ? [...current, notification.id] : current.filter(id => id !== notification.id))} />
                    <Chip size="small" label={notification.kind === "mention" ? "提及了你" : notification.assignmentRole === null ? "指派给你" : `指派为${assignmentLabels[notification.assignmentRole]}`} color={notification.readAt === null ? "primary" : "default"} variant="outlined" />
                    <Typography variant="body2">{notification.actorName}</Typography>
                    <Typography variant="caption" color="text.secondary">{notification.readAt === null ? "未读" : "已读"}</Typography>
                </Stack>
                <Typography component="a" href={`/issues/${notification.issueId}${notification.replyId === null ? "" : `?reply=${notification.replyId}`}`} onClick={event => {
                    if (notification.readAt !== null) return;
                    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
                        void updateNotifications([notification.id], "read", true);
                        return;
                    }
                    event.preventDefault();
                    const destination = event.currentTarget.getAttribute("href")!;
                    void updateNotifications([notification.id], "read", true);
                    try { assertApiSession(apiSession); navigate(destination); }
                    catch (error) { setError(`打开工单失败：${String(error)}`); }
                }} onAuxClick={event => {
                    if (event.button === 1 && notification.readAt === null) void updateNotifications([notification.id], "read", true);
                }} sx={{ color: "primary.main", overflowWrap: "anywhere" }}>#{notification.issueId} {notification.issueTitle}</Typography>
                <Typography variant="caption" color="text.secondary">{new Date(notification.createdAt).toLocaleString("sv-SE")}</Typography>
                <Stack direction="row" spacing={1}>
                    <Button variant="outlined" disabled={loading || saving} onClick={() => void updateNotifications([notification.id], notification.readAt === null ? "read" : "unread")}>{notification.readAt === null ? "标为已读" : "标为未读"}</Button>
                    <Button variant="outlined" color="error" disabled={loading || saving} onClick={() => { setError(""); setDeleting([notification.id]); }}>删除通知</Button>
                </Stack>
            </Stack>
        </Paper>)}
        {next !== null && <Button disabled={loading || saving} onClick={() => setBefore(next)}>加载更多通知</Button>}
        <Dialog open={deleting.length > 0} onClose={() => { if (!saving) setDeleting([]); }} fullWidth maxWidth="xs" aria-labelledby="delete-notifications-title" aria-describedby="delete-notifications-description">
            <DialogTitle id="delete-notifications-title">删除通知</DialogTitle>
            <DialogContent>
                <DialogContentText id="delete-notifications-description">确定删除所选的 {deleting.length} 条通知？此操作无法撤销，相关工单和评论会保留。</DialogContentText>
                {error && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}
            </DialogContent>
            <DialogActions>
                <Button color="inherit" disabled={saving} onClick={() => setDeleting([])} autoFocus>取消</Button>
                <Button color="error" disabled={saving || loading} onClick={() => void updateNotifications(deleting, "delete")}>{saving ? "删除中…" : "确认删除"}</Button>
            </DialogActions>
        </Dialog>
        <Snackbar open={message !== ""} autoHideDuration={4000} onClose={(_, reason) => { if (reason !== "clickaway") setMessage(""); }}>
            <Alert severity="success" onClose={() => setMessage("")}>{message}</Alert>
        </Snackbar>
    </Stack>;
}
