import { useEffect, useRef, useState } from "react";
import { Alert, Box, Button, MenuItem, Paper, Stack, TextField, Typography } from "@mui/material";
import { api, navigate, setLoginSession, getApiSessionGeneration, assertApiSession } from "./api";
import type { LoginSession, User } from "./api";
import { isPasswordBreached } from "./passwordBreach";
import { confirmAction } from "./ConfirmDialog";
import { useDraftGuard } from "./DraftGuard";
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH, USERNAME_MAX_LENGTH } from "../shared/limits";
import { useTextDraft } from "./useTextDraft";
import NewPasswordFields from "./NewPasswordFields";
import UserIdentityFields from "./UserIdentityFields";
import WrappingRow from "./WrappingRow";

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
    const [confirmPassword, setConfirmPassword] = useState("");
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
                    setConfirmPassword("");
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
                <WrappingRow>
                    <Typography component="h1" variant="h5">{title}</Typography>
                    {mode === "create-user" && <Button href="/#/admin/users" color="inherit" variant="outlined" disabled={saving}>← 返回用户管理</Button>}
                </WrappingRow>
                {mode === "login" && params.has("passwordChanged") && <Alert severity="success">密码已修改，请重新登录。</Alert>}
                {error && <Alert severity="error">{error}</Alert>}
                {draft.error && <Alert severity="error">{draft.error}</Alert>}
                {success && <Alert severity="success">{success}</Alert>}
                {mode === "create-user" && <UserIdentityFields value={draft.value} onChange={draft.setValue} disabled={saving} nameAutoComplete="off" usernameAutoComplete="username" />}
                {mode === "login" && <TextField name="username" label="用户名" autoComplete="username" value={draft.value.username} onChange={event => draft.setValue({ ...draft.value, username: event.target.value })} required disabled={saving} slotProps={{ htmlInput: { maxLength: USERNAME_MAX_LENGTH, pattern: "[A-Za-z]+[0-9]*" } }} />}
                {mode === "create-user" && <Typography variant="caption" color="text.secondary">用户名和昵称自动保存；刷新后可恢复，密码需重新填写。</Typography>}
                {mode === "create-user" && <TextField select name="role" label="账户角色" value={role} onChange={event => { setRole(event.target.value as User["role"]); setDirty(true); }} disabled={saving} helperText="产品、开发使用管理员；测试、投放使用用户。"><MenuItem value="user">用户</MenuItem><MenuItem value="admin">管理员</MenuItem></TextField>}
                {mode !== "create-user" && <TextField name="password" label={mode === "account" ? "当前密码" : "密码"} type="password" autoComplete="current-password" required disabled={saving} slotProps={{ htmlInput: { minLength: PASSWORD_MIN_LENGTH, maxLength: PASSWORD_MAX_LENGTH } }} />}
                {mode !== "login" && <NewPasswordFields
                    passwordName={mode === "account" ? "newPassword" : "password"}
                    passwordLabel={mode === "account" ? "新密码" : "密码"}
                    confirmLabel="确认密码"
                    password={strengthPassword}
                    confirmPassword={confirmPassword}
                    onPasswordChange={setStrengthPassword}
                    onConfirmPasswordChange={setConfirmPassword}
                    disabled={saving}
                    required
                />}
                <Button type="submit" variant="contained" disabled={saving}>{saving ? "处理中…" : mode === "account" ? "修改密码" : title}</Button>
            </Stack>
        </Box>
    </Paper>;
}
