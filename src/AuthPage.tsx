import { useState } from "react";
import { Alert, Box, Button, Paper, Stack, TextField, Typography } from "@mui/material";
import { api, navigate } from "./api";
import type { User } from "./api";

export default function AuthPage({ mode, user, onUserChange }: {
    mode: "login" | "create-user" | "account";
    user: User | null;
    onUserChange: (user: User | null) => void;
}) {
    const [error, setError] = useState("");
    const [saving, setSaving] = useState(false);
    const [success, setSuccess] = useState("");
    const next = new URLSearchParams(window.location.search).get("next") ?? "/";
    const destination = ["/account", "/admin/users", "/admin/users/new"].includes(next) || /^\/issues\/\d+$/.test(next) ? next : "/";
    const title = mode === "create-user" ? "创建用户" : mode === "account" ? "修改密码" : "登录";

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

    return <Paper variant="outlined" sx={{ p: { xs: 3, sm: 4 }, maxWidth: 440, mx: "auto", width: "100%", borderTop: "4px solid", borderTopColor: "primary.main", boxShadow: "0 16px 48px rgb(0 0 0 / 14%)" }}>
        <Box component="form" onSubmit={async (event) => {
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
            setError("");
            setSuccess("");
            try {
                const endpoint = mode === "create-user" ? "/api/admin/users" : `/api/auth/${mode === "account" ? "password" : mode}`;
                const response = await api(endpoint, { method: "POST", body });
                const data: { user: User | null } = await response.json();
                if (mode === "create-user") {
                    setSuccess(`已创建用户 ${data.user!.name}。`);
                    form.reset();
                    return;
                }
                onUserChange(data.user);
                navigate(mode === "account" ? "/login?passwordChanged=1" : destination);
            } catch (error) {
                setError(String(error));
            } finally {
                setSaving(false);
            }
        }}>
            <Stack spacing={2}>
                {mode !== "login" && <Box><Button href={mode === "create-user" ? "/admin/users" : "/"} color="inherit" variant="outlined" disabled={saving}>← {mode === "create-user" ? "返回用户管理" : "返回列表"}</Button></Box>}
                <Typography component="h1" variant="h5">{title}</Typography>
                {mode === "login" && new URLSearchParams(window.location.search).has("passwordChanged") && <Alert severity="success">密码已修改，请重新登录。</Alert>}
                {error && <Alert severity="error">{error}</Alert>}
                {success && <Alert severity="success">{success}</Alert>}
                {mode === "account" && <>
                    <Typography>{user!.name} · {user!.role === "admin" ? "管理员" : "用户"}</Typography>
                    <Typography color="text.secondary">{user!.username}</Typography>
                </>}
                {mode === "create-user" && <TextField name="name" label="昵称" autoComplete="off" required disabled={saving} slotProps={{ htmlInput: { maxLength: 50 } }} />}
                {mode !== "account" && <TextField name="username" label="用户名" autoComplete="username" required disabled={saving} slotProps={{ htmlInput: { maxLength: 50 } }} />}
                <TextField name="password" label={mode === "account" ? "当前密码" : "密码"} type="password" autoComplete={mode === "create-user" ? "new-password" : "current-password"} required disabled={saving} slotProps={{ htmlInput: { minLength: 6, maxLength: 128 } }} helperText={mode === "create-user" ? "6–128 个字符" : undefined} />
                {mode === "account" && <TextField name="newPassword" label="新密码" type="password" autoComplete="new-password" required disabled={saving} slotProps={{ htmlInput: { minLength: 6, maxLength: 128 } }} helperText="6–128 个字符" />}
                {mode !== "login" && <TextField name="confirmPassword" label="确认密码" type="password" autoComplete="new-password" required disabled={saving} slotProps={{ htmlInput: { minLength: 6, maxLength: 128 } }} />}
                <Button type="submit" variant="contained" disabled={saving}>{saving ? "处理中…" : mode === "account" ? "修改密码" : title}</Button>
            </Stack>
        </Box>
    </Paper>;
}
