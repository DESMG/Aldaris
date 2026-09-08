import { useEffect, useRef, useState } from "react";
import { Alert, Box, Button, MenuItem, Paper, Stack, TextField, Typography } from "@mui/material";
import { api, navigate, setLoginSession, getApiSessionGeneration, assertApiSession } from "./api";
import type { LoginSession, User } from "./api";
import PasswordStrength from "./PasswordStrength";
import { isPasswordBreached } from "./passwordBreach";
import { confirmAction } from "./ConfirmDialog";
import { useDraftGuard } from "./DraftGuard";
import { NAME_MAX_LENGTH, USERNAME_MAX_LENGTH } from "../shared/limits";
import { useTextDraft } from "./useTextDraft";

export default function AuthPage({ mode, user, onUserChange, resumeUserId }: {
    mode: "login" | "create-user" | "account";
    user: User | null;
    onUserChange: (user: User | null) => void;
    resumeUserId?: number;
}) {
    const apiSession = getApiSessionGeneration();
    const [error, setError] = useState("");
    const [saving, setSaving] = useState(false);
    const [success, setSuccess] = useState("");
    const [strengthPassword, setStrengthPassword] = useState("");
    const [dirty, setDirty] = useState(false);
    const [role, setRole] = useState<User["role"]>("user");
    const draft = useTextDraft(mode === "create-user" ? "create-user" : null, { name: "", username: "" }, value =>
        typeof value.name === "string" && typeof value.username === "string");
    const clearGuard = useDraftGuard(mode === "create-user" && (dirty || !!draft.value.name || !!draft.value.username), draft.clear);
    const mounted = useRef(true);
    useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
    const path = window.location.hash.slice(1) || "/";
    const params = new URLSearchParams(path.includes("?") ? path.slice(path.indexOf("?")) : "");
    const next = params.get("next") ?? "/";
    const destination = ["/account", "/admin/users", "/admin/users/new", "/operations", "/privacy", "/terms", "/license"].includes(next)
        || /^\/issues\/\d+(?:\?reply=\d+)?$/.test(next) || /^\/(?:\?[^#]*)?$/.test(next) ? next : "/";
    const title = mode === "create-user" ? "创建用户" : mode === "account" ? "修改密码" : "登录";

    if (mode === "create-user" && user?.role !== "admin") {
        return <Alert severity="error">只有管理员可以创建用户。</Alert>;
    }

    if (mode === "account" && !user) {
        return <Button href="/#/login?next=/account">登录后管理账户</Button>;
    }
    if (mode === "login" && user) {
        return <Stack spacing={2}>
            <Typography>已登录为 {user.name}</Typography>
            <Button href={`/#${destination}`}>继续浏览</Button>
        </Stack>;
    }

    return <Paper variant="outlined" sx={{ p: { xs: 3, sm: 4 }, maxWidth: 440, mx: "auto", width: "100%", bgcolor: "var(--surface-muted)" }}>
        <Box component="form" onChange={() => { if (mode === "create-user") setDirty(true); }} onSubmit={async (event) => {
            event.preventDefault();
            if (saving) return;
            const form = event.currentTarget;
            const body = new FormData(form);
            const password = String(body.get(mode === "account" ? "newPassword" : "password"));
            if (mode !== "login" && password !== body.get("confirmPassword")) {
                setError("两次输入的密码不一致。");
                return;
            }
            setSaving(true);
            if (mode === "create-user") setDirty(true);
            setError("");
            setSuccess("");
            try {
                if (mode !== "login") {
                    const breached = await isPasswordBreached(password);
                    if (!mounted.current) return;
                    assertApiSession(apiSession);
                    if (breached && !await confirmAction("此密码已发生泄露事件，是否允许修改？")) return;
                    if (!mounted.current) return;
                    assertApiSession(apiSession);
                }
                const endpoint = mode === "create-user" ? "/api/admin/users" : `/api/auth/${mode === "account" ? "password" : mode}`;
                const response = await api(endpoint, { method: "POST", body, expectedSession: apiSession });
                const data: LoginSession = await response.json();
                assertApiSession(apiSession);
                if (mode === "create-user") draft.clear();
                if (!mounted.current) return;
                if (mode === "login" && resumeUserId !== undefined && data.user.id !== resumeUserId) {
                    setError("请使用原账户重新登录，以恢复该账户的草稿。");
                    return;
                }
                if (mode === "create-user") {
                    setSuccess(`已创建用户 ${data.user!.name}。`);
                    form.reset();
                    setRole("user");
                    setStrengthPassword("");
                    setDirty(false);
                    clearGuard();
                    return;
                }
                if (mode === "login") setLoginSession(data);
                onUserChange(data.user);
                if (mode === "login" && resumeUserId !== undefined) return;
                navigate(mode === "account" ? "/login?passwordChanged=1" : destination);
            } catch (error) {
                if (mounted.current) setError(String(error));
            } finally {
                if (mounted.current) setSaving(false);
            }
        }}>
            <Stack spacing={2}>
                <Stack direction="row" spacing={2} useFlexGap sx={{ alignItems: "center", flexWrap: "wrap" }}>
                    <Typography component="h1" variant="h5">{title}</Typography>
                    {mode === "create-user" && <Button href="/#/admin/users" color="inherit" variant="outlined" disabled={saving}>← 返回用户管理</Button>}
                </Stack>
                {mode === "login" && params.has("passwordChanged") && <Alert severity="success">密码已修改，请重新登录。</Alert>}
                {error && <Alert severity="error">{error}</Alert>}
                {draft.error && <Alert severity="error">{draft.error}</Alert>}
                {success && <Alert severity="success">{success}</Alert>}
                {mode === "create-user" && <TextField name="name" label="昵称" autoComplete="off" value={draft.value.name} onChange={event => { draft.setValue({ ...draft.value, name: event.target.value }); event.target.setCustomValidity(Array.from(event.target.value).length > NAME_MAX_LENGTH ? "昵称最多 32 个字符。" : ""); }} required disabled={saving} slotProps={{ htmlInput: { maxLength: NAME_MAX_LENGTH * 2 } }} helperText="中文真实姓名；重名用数字或减号加部门名区分，最多 32 字符" />}
                {mode !== "account" && <TextField name="username" label="用户名" autoComplete="username" value={draft.value.username} onChange={event => draft.setValue({ ...draft.value, username: event.target.value })} required disabled={saving} slotProps={{ htmlInput: { maxLength: USERNAME_MAX_LENGTH, pattern: "[A-Za-z]+[0-9]*" } }} helperText={mode === "login" ? undefined : "本人姓名的英文拼音，重名在末尾加数字，最多 32 字符"} />}
                {mode === "create-user" && <Typography variant="caption" color="text.secondary">用户名和昵称在本标签页自动保存；密码需重新填写。</Typography>}
                {mode === "create-user" && <TextField select name="role" label="账户角色" value={role} onChange={event => { setRole(event.target.value as User["role"]); setDirty(true); }} disabled={saving} helperText="产品、开发使用管理员；测试、投放使用用户。"><MenuItem value="user">用户</MenuItem><MenuItem value="admin">管理员</MenuItem></TextField>}
                <TextField name="password" onChange={event => { if (mode !== "account") setStrengthPassword(event.target.value); }} label={mode === "account" ? "当前密码" : "密码"} type="password" autoComplete={mode === "create-user" ? "new-password" : "current-password"} required disabled={saving} slotProps={{ htmlInput: { minLength: 6, maxLength: 128 } }} />
                {mode === "account" && <TextField name="newPassword" onChange={event => setStrengthPassword(event.target.value)} label="新密码" type="password" autoComplete="new-password" required disabled={saving} slotProps={{ htmlInput: { minLength: 6, maxLength: 128 } }} />}
                {mode !== "login" && <TextField name="confirmPassword" label="确认密码" type="password" autoComplete="new-password" required disabled={saving} slotProps={{ htmlInput: { minLength: 6, maxLength: 128 } }} />}
                {mode !== "login" && <Typography variant="caption" color="text.secondary">密码长度为 6–128 个字符</Typography>}
                {mode !== "login" && <PasswordStrength password={strengthPassword} />}
                <Button type="submit" variant="contained" disabled={saving}>{saving ? "处理中…" : mode === "account" ? "修改密码" : title}</Button>
            </Stack>
        </Box>
    </Paper>;
}
