import { useEffect, useRef, useState } from "react";
import { Alert, Box, Button, MenuItem, Paper, Stack, TextField, Typography } from "@mui/material";
import { api, navigate, setLoginSession, getApiSessionGeneration, assertApiSession } from "./api";
import type { LoginSession, User } from "./api";
import PasswordStrength from "./PasswordStrength";
import { useDraftGuard } from "./DraftGuard";

export default function AuthPage({ mode, user, onUserChange, resumeUserId }: {
    mode: "login" | "setup" | "create-user" | "account";
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
    const clearGuard = useDraftGuard(mode === "create-user" && dirty);
    const mounted = useRef(true);
    useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
    const next = new URLSearchParams(window.location.search).get("next") ?? "/";
    const destination = ["/account", "/admin/users", "/admin/users/new", "/operations", "/notifications"].includes(next)
        || /^\/issues\/\d+(?:\?reply=\d+)?$/.test(next) || /^\/(?:\?[^#]*)?$/.test(next) ? next : "/";
    const title = mode === "setup" ? "创建管理员" : mode === "create-user" ? "创建用户" : mode === "account" ? "修改密码" : "登录";

    if (mode === "create-user" && user?.role !== "admin") {
        return <Alert severity="error">只有管理员可以创建用户。</Alert>;
    }

    if (mode === "account" && !user) {
        return <Button href="/login?next=/account">登录后管理账户</Button>;
    }
    if (mode === "login" && user) {
        return <Stack spacing={2}>
            <Typography>已登录为 {user.name}</Typography>
            <Button href={destination}>继续浏览</Button>
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
                const endpoint = mode === "create-user" ? "/api/admin/users" : `/api/auth/${mode === "account" ? "password" : mode}`;
                const response = await api(endpoint, { method: "POST", body, expectedSession: apiSession });
                const data: LoginSession = await response.json();
                if (!mounted.current) return;
                assertApiSession(apiSession);
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
                navigate(mode === "setup" ? "/login?setupComplete=1" : mode === "account" ? "/login?passwordChanged=1" : destination);
            } catch (error) {
                if (mounted.current) setError(String(error));
            } finally {
                if (mounted.current) setSaving(false);
            }
        }}>
            <Stack spacing={2}>
                {mode !== "login" && mode !== "setup" && <Box><Button href={mode === "create-user" ? "/admin/users" : "/"} color="inherit" variant="outlined" disabled={saving}>← {mode === "create-user" ? "返回用户管理" : "返回列表"}</Button></Box>}
                <Typography component="h1" variant="h5">{title}</Typography>
                {mode === "setup" && <Typography color="text.secondary">首次使用，请创建管理员账户。</Typography>}
                {mode === "setup" && <TextField name="setupCredential" label="初始化凭据" type="password" autoComplete="off" required disabled={saving} slotProps={{ htmlInput: { maxLength: 512 } }} helperText="填写部署时预先设置的 KV 初始化凭据" />}
                {mode === "login" && new URLSearchParams(window.location.search).has("setupComplete") && <Alert severity="success">管理员已创建，请登录。</Alert>}
                {mode === "login" && new URLSearchParams(window.location.search).has("passwordChanged") && <Alert severity="success">密码已修改，请重新登录。</Alert>}
                {error && <Alert severity="error">{error}</Alert>}
                {success && <Alert severity="success">{success}</Alert>}
                {(mode === "create-user" || mode === "setup") && <TextField name="name" label="昵称" autoComplete="off" required disabled={saving} slotProps={{ htmlInput: { maxLength: 50 } }} />}
                {mode !== "account" && <TextField name="username" label="用户名" autoComplete="username" required disabled={saving} slotProps={{ htmlInput: { maxLength: 50 } }} />}
                {mode === "create-user" && <TextField select name="role" label="账户角色" value={role} onChange={event => { setRole(event.target.value as User["role"]); setDirty(true); }} disabled={saving} helperText="产品、开发使用管理员；测试、投放使用用户。"><MenuItem value="user">用户</MenuItem><MenuItem value="admin">管理员</MenuItem></TextField>}
                <TextField name="password" onChange={event => { if (mode !== "account") setStrengthPassword(event.target.value); }} label={mode === "account" ? "当前密码" : "密码"} type="password" autoComplete={mode === "create-user" || mode === "setup" ? "new-password" : "current-password"} required disabled={saving} slotProps={{ htmlInput: { minLength: 6, maxLength: 128 } }} helperText={mode === "create-user" || mode === "setup" ? "6–128 个字符" : undefined} />
                {mode === "account" && <TextField name="newPassword" onChange={event => setStrengthPassword(event.target.value)} label="新密码" type="password" autoComplete="new-password" required disabled={saving} slotProps={{ htmlInput: { minLength: 6, maxLength: 128 } }} helperText="6–128 个字符" />}
                {mode !== "login" && <PasswordStrength password={strengthPassword} />}
                {mode !== "login" && <TextField name="confirmPassword" label="确认密码" type="password" autoComplete="new-password" required disabled={saving} slotProps={{ htmlInput: { minLength: 6, maxLength: 128 } }} />}
                <Button type="submit" variant="contained" disabled={saving}>{saving ? "处理中…" : mode === "account" ? "修改密码" : title}</Button>
            </Stack>
        </Box>
    </Paper>;
}
