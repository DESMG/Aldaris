import { useEffect, useRef, useState } from "react";
import { Alert, Avatar, Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle, Paper, Stack, TextField, Typography, useMediaQuery } from "@mui/material";
import { api, ApiError, cachedJson, getCachedJson, navigate, getApiSessionGeneration, assertApiSession } from "./api";
import type { User } from "./api";
import type { ManagedUser } from "../shared/types";
import PasswordStrength from "./PasswordStrength";
import { isPasswordBreached } from "./passwordBreach";
import { confirmAction } from "./ConfirmDialog";
import { useDraftGuard } from "./DraftGuard";
import { NAME_MAX_LENGTH, USERNAME_MAX_LENGTH, PASSWORD_MIN_LENGTH, PASSWORD_MAX_LENGTH } from "../shared/limits";
import { useTextDraft } from "./useTextDraft";

export default function Users({ user, onUserChange }: { user: User; onUserChange: (user: User | null) => void }) {
    const apiSession = getApiSessionGeneration();
    const cached = getCachedJson<{ users: ManagedUser[]; next: number | null }>("/api/admin/users");
    const [after, setAfter] = useState(0);
    const [next, setNext] = useState<number | null>(cached?.next ?? null);
    const [password, setPassword] = useState("");
    const draft = useTextDraft("edit-user", { id: 0, version: 0, name: "", username: "" }, value =>
        Number.isSafeInteger(value.id) && (value.id as number) >= 0 &&
        Number.isSafeInteger(value.version) && (value.version as number) >= 0 &&
        typeof value.name === "string" && typeof value.username === "string");
    const { name: editName, username: editUsername } = draft.value;
    const [confirmPassword, setConfirmPassword] = useState("");
    const [users, setUsers] = useState<ManagedUser[]>(() => cached?.users ?? []);
    const [editing, setEditing] = useState<ManagedUser | null>(null);
    const [editOpen, setEditOpen] = useState(false);
    const [deleting, setDeleting] = useState<ManagedUser | null>(null);
    const [conflict, setConflict] = useState(false);
    const [latest, setLatest] = useState<ManagedUser | null>(null);
    const [reloading, setReloading] = useState(false);
    const [deleteConflict, setDeleteConflict] = useState(false);
    const reducedMotion = useMediaQuery("(prefers-reduced-motion: reduce)");
    const [error, setError] = useState("");
    const [listError, setListError] = useState("");
    const [saving, setSaving] = useState(false);
    const [loading, setLoading] = useState(!cached);
    const [refresh, setRefresh] = useState(0);
    const lastRefresh = useRef(refresh);
    const listEnd = useRef<HTMLDivElement>(null);
    const dirty = editOpen && editing !== null && (conflict || editName !== editing.name || editUsername !== editing.username || password !== "" || confirmPassword !== "");
    const clearGuard = useDraftGuard(dirty, draft.clear);
    const mounted = useRef(true);
    useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);

    async function closeEditor() {
        if (saving || reloading || (dirty && !await confirmAction("放弃尚未保存的用户资料修改？"))) return;
        clearGuard();
        draft.clear();
        setEditOpen(false);
    }

    const restoredDraft = useRef<typeof draft.value | null>(draft.value);
    useEffect(() => {
        const saved = restoredDraft.current;
        if (user.role !== "admin" || !saved?.id) return;
        let active = true;
        api(`/api/admin/users/${saved.id}`).then(response => response.json()).then((data: { user: ManagedUser }) => {
            if (!active || restoredDraft.current !== saved) return;
            setEditing({ ...data.user, version: saved.version });
            setConflict(data.user.version !== saved.version);
            setEditOpen(true);
        }).catch(error => { if (active && restoredDraft.current === saved) setListError(`恢复用户资料草稿失败：${String(error)}`); });
        return () => { active = false; };
    }, [user.role]);

    useEffect(() => {
        if (user.role !== "admin") return;
        const controller = new AbortController();
        const force = lastRefresh.current !== refresh;
        lastRefresh.current = refresh;
        const url = after ? `/api/admin/users?after=${after}` : "/api/admin/users";
        setLoading(force || !getCachedJson(url));
        setListError("");
        cachedJson<{ users: ManagedUser[]; next: number | null }>(url, { refresh: force }).then(data => {
            if (!controller.signal.aborted) {
                setUsers(current => after ? [...current.filter(account => account.id <= after), ...data.users] : data.users);
                setNext(data.next);
            }
        }).catch(error => {
            if (!controller.signal.aborted) setListError(`读取用户失败：${String(error)}`);
        }).finally(() => {
            if (!controller.signal.aborted) setLoading(false);
        });
        return () => controller.abort();
    }, [refresh, user.role, after]);

    useEffect(() => {
        if (user.role !== "admin" || next === null || loading || saving || listError || editing !== null || deleting !== null) return;
        let active = true;
        const observer = new IntersectionObserver(entries => {
            if (active && entries.some(entry => entry.isIntersecting)) {
                active = false;
                observer.disconnect();
                setAfter(next);
            }
        });
        observer.observe(listEnd.current!);
        return () => { active = false; observer.disconnect(); };
    }, [next, loading, saving, listError, editing, deleting, user.role]);

    if (user.role !== "admin") return <Alert severity="error">只有管理员可以管理用户。</Alert>;

    return <Stack spacing={3}>
        <Stack direction="row" spacing={2} useFlexGap sx={{ alignItems: "center", flexWrap: "wrap" }}>
            <Typography component="h1" variant="h5">用户管理</Typography>
            <Button href="/#/admin/users/new" variant="contained">创建用户</Button>
        </Stack>
        {draft.error && <Alert severity="error">{draft.error}</Alert>}
        {loading && users.length === 0 && <Typography role="status">正在读取用户…</Typography>}
        <Dialog open={editOpen} onClose={closeEditor} fullWidth maxWidth="xs" aria-labelledby="edit-user-title" transitionDuration={reducedMotion ? 0 : 440} slotProps={{ transition: { onExited: () => { setEditing(null); setPassword(""); setConfirmPassword(""); } }, paper: { sx: { p: { xs: 3, sm: 4 }, maxWidth: 440 } } }}>
        {editing &&
            <Box component="form" key={editing.id} onSubmit={async event => {
                event.preventDefault();
                if (saving || conflict || reloading) return;
                const body = new FormData(event.currentTarget);
                if (body.get("password") !== body.get("confirmPassword")) { setError("两次输入的密码不一致。"); return; }
                setSaving(true);
                setError("");
                try {
                    const newPassword = String(body.get("password") ?? "");
                    if (newPassword) {
                        const breached = await isPasswordBreached(newPassword);
                        if (!mounted.current) return;
                        assertApiSession(apiSession);
                        if (breached && !await confirmAction("此密码已发生泄露事件，是否允许修改？")) return;
                        if (!mounted.current) return;
                        assertApiSession(apiSession);
                    }
                    const response = await api(`/api/admin/users/${editing.id}`, { method: "PATCH", headers: { "If-Match": `"${editing.version}"` }, body, expectedSession: apiSession });
                    const data: { user: ManagedUser } = await response.json();
                    assertApiSession(apiSession);
                    draft.clear();
                    clearGuard();
                    setEditOpen(false);
                    if (editing.id === user.id) {
                        if (body.get("password") || data.user.username !== user.username) {
                            onUserChange(null);
                            navigate("/login");
                            return;
                        }
                        const { id, name, username, role } = data.user;
                        onUserChange({ id, name, username, role });
                    }
                    setUsers(current => current.map(account => account.id === data.user.id ? data.user : account));
                } catch (error) {
                    if (error instanceof ApiError && error.status === 409) setConflict(true);
                    setError(`编辑用户失败：${String(error)}`);
                }
                finally { setSaving(false); }
            }}>
                <Stack spacing={2}>
                    <Box><Button color="inherit" variant="outlined" disabled={saving || reloading} onClick={closeEditor}>关闭</Button></Box>
                    <Typography id="edit-user-title" component="h2" variant="h5">编辑用户</Typography>
                    {error && <Alert severity="error">{error}</Alert>}
                    {conflict && <Alert severity="warning" action={<Button color="inherit" disabled={reloading} onClick={async () => {
                        setReloading(true);
                        try {
                            const response = await api(`/api/admin/users/${editing.id}`);
                            const data: { user: ManagedUser } = await response.json();
                            setLatest(data.user);
                        } catch (error) { setError(`载入最新用户资料失败：${String(error)}`); }
                        finally { setReloading(false); }
                    }}>载入最新版本</Button>}>保存存在冲突。你的表单仍保留，请先载入最新内容进行比较。</Alert>}
                    {latest && <Paper variant="outlined" sx={{ p: 2 }}><Stack spacing={1}>
                        <Typography variant="subtitle2">服务器最新版本 (版本 {latest.version})</Typography>
                        <Typography sx={{ overflowWrap: "anywhere" }}>{latest.name} · {latest.username}</Typography>
                        <Typography variant="body2">请与下方表单比较。保留表单后，需要再次点击保存修改；填写的新密码也会被提交。</Typography>
                        <Button disabled={saving || reloading} onClick={() => {
                            setEditing(latest);
                            draft.setValue({ ...draft.value, version: latest.version });
                            setConflict(false);
                            setLatest(null);
                            setError("");
                        }}>保留表单并使用此版本</Button>
                    </Stack></Paper>}
                    <TextField name="name" label="昵称" value={editName} onChange={event => { draft.setValue({ ...draft.value, name: event.target.value }); event.target.setCustomValidity(Array.from(event.target.value).length > NAME_MAX_LENGTH ? "昵称最多 32 个字符。" : ""); }} required disabled={saving || reloading} slotProps={{ htmlInput: { maxLength: NAME_MAX_LENGTH * 2 } }} helperText="中文真实姓名；重名用数字或减号加部门名区分，最多 32 字符" />
                    <TextField name="username" label="用户名" value={editUsername} onChange={event => draft.setValue({ ...draft.value, username: event.target.value })} required disabled={saving || reloading} slotProps={{ htmlInput: { maxLength: USERNAME_MAX_LENGTH, pattern: "[A-Za-z]+[0-9]*" } }} helperText="本人姓名的英文拼音，重名在末尾加数字，最多 32 字符" />
                    <Typography variant="caption" color="text.secondary">用户名和昵称在本标签页自动保存；密码需重新填写。</Typography>
                    <TextField name="password" value={password} onChange={event => setPassword(event.target.value)} label="新密码" type="password" autoComplete="new-password" helperText="留空则保留原密码" disabled={saving || reloading} slotProps={{ htmlInput: { minLength: PASSWORD_MIN_LENGTH, maxLength: PASSWORD_MAX_LENGTH } }} />
                    <TextField name="confirmPassword" value={confirmPassword} onChange={event => setConfirmPassword(event.target.value)} label="确认新密码" type="password" autoComplete="new-password" disabled={saving || reloading} slotProps={{ htmlInput: { minLength: PASSWORD_MIN_LENGTH, maxLength: PASSWORD_MAX_LENGTH } }} />
                    <Typography variant="caption" color="text.secondary">密码长度为 {PASSWORD_MIN_LENGTH}–{PASSWORD_MAX_LENGTH} 个字符</Typography>
                    <PasswordStrength password={password} />
                    <Button type="submit" variant="contained" disabled={saving || conflict || reloading}>{saving ? "处理中…" : "保存修改"}</Button>
                </Stack>
            </Box>}
        </Dialog>
        {users.map(account => <Paper key={account.id} variant="outlined" sx={{ p: 2.5 }}>
            <Stack direction="row" spacing={2} sx={{ alignItems: "center", flexWrap: "wrap" }} useFlexGap>
                <Avatar>{Array.from(account.name)[0]}</Avatar>
                <Box sx={{ flex: 1, minWidth: 120, overflowWrap: "anywhere" }}>
                    <Typography sx={{ fontWeight: 700 }}>{account.name}</Typography>
                    <Typography variant="caption" color="text.secondary">{account.username}</Typography>
                </Box>
                <Chip size="small" label={account.role === "admin" ? "管理员" : "用户"} variant="outlined" />
                <Button variant="outlined" disabled={saving || loading || editing !== null} onClick={() => { restoredDraft.current = null; setEditing(account); draft.setValue({ id: account.id, version: account.version, name: account.name, username: account.username }); setPassword(""); setConfirmPassword(""); setConflict(false); setLatest(null); setEditOpen(true); setError(""); }}>编辑</Button>
                <Button variant="text" color="error" disabled={saving || loading || account.id === user.id} onClick={() => { setError(""); setDeleteConflict(false); setDeleting(account); }}>删除</Button>
            </Stack>
        </Paper>)}
        {listError && !editing && !deleting && <Alert severity="error" action={<Button color="inherit" disabled={loading} onClick={() => setRefresh(value => value + 1)}>重试</Button>}>{listError}</Alert>}
        {loading && users.length > 0 && <Typography role="status">正在读取用户…</Typography>}
        {next !== null && <Box ref={listEnd} aria-hidden="true" sx={{ height: 1 }} />}
        <Dialog open={deleting !== null} onClose={() => { if (!saving) setDeleting(null); }} fullWidth maxWidth="xs" aria-labelledby="delete-user-title" aria-describedby="delete-user-description">
            <DialogTitle id="delete-user-title">删除用户</DialogTitle>
            <DialogContent>
                <DialogContentText id="delete-user-description">删除用户 "{deleting?.name}"？其工单和评论将保留，该用户将无法登录。</DialogContentText>
                {error && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}
                {deleteConflict && <Button sx={{ mt: 1 }} onClick={() => {
                    setDeleting(null);
                    setError("");
                    setAfter(0);
                    setRefresh(value => value + 1);
                }}>刷新用户列表后重新选择</Button>}
            </DialogContent>
            <DialogActions>
                <Button color="inherit" disabled={saving} onClick={() => setDeleting(null)} autoFocus>取消</Button>
                <Button color="error" disabled={saving || deleteConflict} onClick={async () => {
                    if (saving || deleteConflict || !deleting) return;
                    setSaving(true);
                    setError("");
                    try {
                        await api(`/api/admin/users/${deleting.id}`, { method: "DELETE", headers: { "If-Match": `"${deleting.version}"` }, expectedSession: apiSession });
                        setUsers(current => current.filter(user => user.id !== deleting.id));
                        setDeleting(null);
                    } catch (error) {
                        if (error instanceof ApiError && error.status === 409) setDeleteConflict(true);
                        setError(`删除用户失败：${String(error)}`);
                    }
                    finally { setSaving(false); }
                }}>{saving ? "删除中…" : "确认删除"}</Button>
            </DialogActions>
        </Dialog>
    </Stack>;
}
