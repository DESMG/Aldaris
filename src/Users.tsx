import { useEffect, useState } from "react";
import { Alert, Avatar, Box, Button, Chip, Dialog, Paper, Stack, TextField, Typography, useMediaQuery } from "@mui/material";
import { api, navigate } from "./api";
import type { User } from "./api";

export default function Users({ user, onUserChange }: { user: User; onUserChange: (user: User | null) => void }) {
    const [users, setUsers] = useState<User[]>([]);
    const [editing, setEditing] = useState<User | null>(null);
    const [editOpen, setEditOpen] = useState(false);
    const reducedMotion = useMediaQuery("(prefers-reduced-motion: reduce)");
    const [error, setError] = useState("");
    const [saving, setSaving] = useState(false);
    const [loading, setLoading] = useState(true);
    const [refresh, setRefresh] = useState(0);

    useEffect(() => {
        if (user.role !== "admin") return;
        const controller = new AbortController();
        setLoading(true);
        api("/api/admin/users", { signal: controller.signal }).then(response => response.json()).then((data: { users: User[] }) => {
            if (!controller.signal.aborted) setUsers(data.users);
        }).catch(error => {
            if (!controller.signal.aborted) setError(`读取用户失败：${String(error)}`);
        }).finally(() => {
            if (!controller.signal.aborted) setLoading(false);
        });
        return () => controller.abort();
    }, [refresh, user.role]);

    if (user.role !== "admin") return <Alert severity="error">只有管理员可以管理用户。</Alert>;

    return <Stack spacing={3}>
        <Stack direction="row" spacing={2}>
            <Button href="/" color="inherit">← 返回列表</Button>
            <Button href="/admin/users/new">创建用户</Button>
        </Stack>
        <Typography component="h1" variant="h5">用户管理</Typography>
        {error && !editing && <Alert severity="error">{error}</Alert>}
        {loading && <Typography>正在读取用户…</Typography>}
        <Dialog open={editOpen} onClose={() => { if (!saving) setEditOpen(false); }} fullWidth maxWidth="xs" aria-labelledby="edit-user-title" transitionDuration={reducedMotion ? 0 : 440} slotProps={{ transition: { onExited: () => setEditing(null) }, paper: { sx: { p: { xs: 3, sm: 4 }, maxWidth: 440, borderTop: "4px solid", borderTopColor: "primary.main" } } }}>
        {editing &&
            <Box component="form" key={editing.id} onSubmit={async event => {
                event.preventDefault();
                if (saving) return;
                const body = new FormData(event.currentTarget);
                if (body.get("password") !== body.get("confirmPassword")) { setError("两次输入的密码不一致。"); return; }
                setSaving(true);
                setError("");
                try {
                    const response = await api(`/api/admin/users/${editing.id}`, { method: "PATCH", body });
                    const data: { user: User } = await response.json();
                    if (editing.id === user.id) {
                        if (body.get("password") || body.get("username") !== user.username) {
                            onUserChange(null);
                            navigate("/login");
                            return;
                        }
                        onUserChange(data.user);
                    }
                    setEditOpen(false);
                    setRefresh(value => value + 1);
                } catch (error) { setError(`编辑用户失败：${String(error)}`); }
                finally { setSaving(false); }
            }}>
                <Stack spacing={2}>
                    <Box><Button color="inherit" variant="outlined" disabled={saving} onClick={() => setEditOpen(false)}>关闭</Button></Box>
                    <Typography id="edit-user-title" component="h2" variant="h5">编辑用户</Typography>
                    {error && <Alert severity="error">{error}</Alert>}
                    <TextField name="name" label="昵称" defaultValue={editing.name} required disabled={saving} slotProps={{ htmlInput: { maxLength: 50 } }} />
                    <TextField name="username" label="用户名" defaultValue={editing.username} required disabled={saving} slotProps={{ htmlInput: { maxLength: 50 } }} />
                    <TextField name="password" label="新密码" type="password" autoComplete="new-password" helperText="留空则保留原密码" disabled={saving} slotProps={{ htmlInput: { minLength: 6, maxLength: 128 } }} />
                    <TextField name="confirmPassword" label="确认新密码" type="password" autoComplete="new-password" disabled={saving} />
                    <Button type="submit" variant="contained" disabled={saving}>{saving ? "处理中…" : "保存修改"}</Button>
                </Stack>
            </Box>}
        </Dialog>
        {users.map(account => <Paper key={account.id} variant="outlined" sx={{ p: 2.5, borderLeft: "4px solid", borderLeftColor: account.role === "admin" ? "primary.main" : "divider" }}>
            <Stack direction="row" spacing={2} sx={{ alignItems: "center", flexWrap: "wrap" }} useFlexGap>
                <Avatar sx={{ bgcolor: account.role === "admin" ? "primary.main" : "text.secondary", color: "background.paper" }}>{Array.from(account.name)[0]}</Avatar>
                <Box sx={{ flex: 1, minWidth: 120, overflowWrap: "anywhere" }}>
                    <Typography sx={{ fontWeight: 700 }}>{account.name}</Typography>
                    <Typography variant="caption" color="text.secondary">{account.username}</Typography>
                </Box>
                <Chip size="small" label={account.role === "admin" ? "管理员" : "用户"} color={account.role === "admin" ? "primary" : "default"} variant="outlined" />
                <Button variant="outlined" disabled={saving} onClick={() => { setEditing(account); setEditOpen(true); setError(""); }}>编辑</Button>
                <Button variant="text" color="error" disabled={saving || account.id === user.id} onClick={async () => {
                    if (!window.confirm(`删除用户 "${account.name}"？其工单和评论将保留，该用户将无法登录。`)) return;
                    setSaving(true);
                    setError("");
                    try {
                        await api(`/api/admin/users/${account.id}`, { method: "DELETE" });
                        if (editing?.id === account.id) setEditOpen(false);
                        setRefresh(value => value + 1);
                    } catch (error) { setError(`删除用户失败：${String(error)}`); }
                    finally { setSaving(false); }
                }}>删除</Button>
            </Stack>
        </Paper>)}
    </Stack>;
}
