import { StrictMode, useEffect, useState } from "react";
import { flushSync } from "react-dom";

import { Alert, Box, Button, LinearProgress, Stack, Typography, colors } from "@mui/material";
import Container from "@mui/material/Container";
import CssBaseline from "@mui/material/CssBaseline";
import { createTheme, ThemeProvider, useColorScheme } from "@mui/material/styles";
import Issues from "./Issues";
import IssueDetail from "./IssueDetail";
import AuthPage from "./AuthPage";
import Users from "./Users";
import { api, navigate } from "./api";
import type { User } from "./api";

const palette = {
    primary: { main: colors.indigo[500] },
    secondary: { main: colors.blue[500] },
    success: { main: colors.green[500] },
    info: { main: colors.cyan[500] },
    warning: { main: colors.orange[500] },
    error: { main: colors.red[500] },
};

const theme = createTheme({
    cssVariables: {
        colorSchemeSelector: "class",
        cssVarPrefix: "theme",
    },
    colorSchemes: {
        light: { palette: { mode: "light", ...palette, background: { default: "#eef1f7", paper: "#ffffff" } } },
        dark: { palette: { mode: "dark", ...palette, primary: { main: colors.blue[200] }, background: { default: "#10151f", paper: "#1b2331" } } },
    },
    shape: { borderRadius: 12 },
    transitions: { duration: { shortest: 300, shorter: 400, short: 500, standard: 600, complex: 750, enteringScreen: 450, leavingScreen: 390 } },
    typography: {
        fontFamily: [
            "JetBrains Mono",
            "Noto Sans SC",
            "Apple Color Emoji",
            "Segoe UI Emoji",
            "Segoe UI Symbol",
            "Noto Color Emoji",
            "system-ui",
            "-apple-system",
            "emoji",
            "monospace",
        ].join(","),
        fontSize: 14,
        body1: { fontSize: "0.875rem" },
        body2: { fontSize: "0.8125rem" },
        h4: { fontWeight: 750, fontSize: "1.75rem" },
        h5: { fontWeight: 700 },
        h6: { fontWeight: 650 },
    },
    components: {
        MuiCssBaseline: {
            styleOverrides: {
                "@keyframes enterContent": {
                    from: { opacity: 0, transform: "translateY(6px)" },
                    to: { opacity: 1, transform: "translateY(0)" },
                },
                ".page-content": { animation: "enterContent 440ms ease-out" },
                ".MuiPaper-outlined, .MuiAlert-root": { animation: "enterContent 360ms ease-out" },
                "@keyframes revealTheme": {
                    from: { clipPath: "circle(0px at var(--reveal-x) var(--reveal-y))" },
                    to: { clipPath: "circle(var(--reveal-radius) at var(--reveal-x) var(--reveal-y))" },
                },
                "::view-transition-old(root), ::view-transition-new(root)": { mixBlendMode: "normal", animation: "none" },
                "::view-transition-new(root)": { animation: "revealTheme 440ms ease-in-out" },
                "@media (prefers-reduced-motion: reduce)": {
                    "*, *::before, *::after": { animation: "none !important", transition: "none !important", scrollBehavior: "auto !important" },
                },
            },
        },
        MuiButton: {
            defaultProps: { variant: "contained", disableElevation: true },
            styleOverrides: { root: { textTransform: "none", fontWeight: 650, borderRadius: 8 } },
        },
        MuiPaper: {
            styleOverrides: {
                root: { backgroundImage: "none" },
                outlined: { boxShadow: "0 3px 12px rgb(0 0 0 / 5%)" },
            },
        },
        MuiTab: { styleOverrides: { root: { fontWeight: 650 } } },
    },
});

function ThemeToggle() {
    const { mode, systemMode, setMode } = useColorScheme();
    const [switching, setSwitching] = useState(false);
    const dark = (mode === "system" ? systemMode : mode) === "dark";
    return <Button color="inherit" variant="outlined" disabled={!mode || switching} onClick={async event => {
        const next = dark ? "light" : "dark";
        if (!document.startViewTransition || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
            setMode(next);
            return;
        }
        const rect = event.currentTarget.getBoundingClientRect();
        const x = rect.left + rect.width / 2;
        const y = rect.top + rect.height / 2;
        const radius = Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y));
        const style = document.documentElement.style;
        style.setProperty("--reveal-x", `${x}px`);
        style.setProperty("--reveal-y", `${y}px`);
        style.setProperty("--reveal-radius", `${radius}px`);
        setSwitching(true);
        try {
            const transition = document.startViewTransition(() => flushSync(() => setMode(next)));
            await transition.finished;
        } catch (error) {
            console.error("主题切换动画失败", error);
        } finally {
            setSwitching(false);
        }
    }}>
        {dark ? "浅色模式" : "深色模式"}
    </Button>;
}

export default function App() {
    const [path, setPath] = useState(window.location.pathname + window.location.search);
    const [user, setUser] = useState<User | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [refresh, setRefresh] = useState(0);
    const [loggingOut, setLoggingOut] = useState(false);
    const pathname = path.split("?")[0];
    const detail = pathname.match(/^\/issues\/(\d+)$/);

    useEffect(() => {
        if (!loading && !error && !user && pathname !== "/login") {
            const loginPath = `/login?next=${encodeURIComponent(path)}`;
            window.history.replaceState(null, "", loginPath);
            setPath(loginPath);
        }
    }, [loading, error, user, pathname, path]);

    useEffect(() => {
        const route = () => setPath(window.location.pathname + window.location.search);
        const expired = () => setUser(null);
        const focus = () => setRefresh((value) => value + 1);
        window.addEventListener("popstate", route);
        window.addEventListener("auth-expired", expired);
        window.addEventListener("focus", focus);
        return () => {
            window.removeEventListener("popstate", route);
            window.removeEventListener("auth-expired", expired);
            window.removeEventListener("focus", focus);
        };
    }, []);

    useEffect(() => {
        const controller = new AbortController();
        api("/api/auth/me", { signal: controller.signal })
            .then((response) => response.json())
            .then((data: { user: User | null }) => {
                if (controller.signal.aborted) return;
                setUser(data.user);
                setError("");
            })
            .catch((error) => { if (!controller.signal.aborted) setError(`读取登录状态失败：${String(error)}`); })
            .finally(() => { if (!controller.signal.aborted) setLoading(false); });
        return () => controller.abort();
    }, [refresh]);

    return (
        <StrictMode>
            <ThemeProvider
                theme={theme}
                defaultMode="dark"
                modeStorageKey="theme"
                colorSchemeStorageKey="colorScheme"
                noSsr
            >
                <CssBaseline enableColorScheme />
                {pathname === "/login" && <Box sx={{ position: "absolute", top: 16, right: 16 }}><ThemeToggle /></Box>}
                <Container component="main" maxWidth="lg" sx={{ py: 4, ...(pathname === "/login" ? { minHeight: "100dvh", display: "flex", alignItems: "center", justifyContent: "center" } : {}) }} onClick={(event) => {
                    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
                    const link = (event.target as Element).closest("a");
                    if (!link || link.origin !== window.location.origin || link.target || link.hasAttribute("download")) return;
                    event.preventDefault();
                    navigate(link.pathname + link.search + link.hash);
                }}>
                    <Stack spacing={3} sx={{ width: "100%", ...(pathname === "/login" ? { maxWidth: 440 } : {}) }}>
                        {pathname !== "/login" && <Box component="header" sx={{ p: { xs: 2.5, sm: 3.5 }, borderRadius: "8px", bgcolor: "background.paper", border: "1px solid", borderColor: "divider", borderTop: "4px solid", borderTopColor: "primary.main", boxShadow: "0 8px 28px rgb(0 0 0 / 8%)" }}>
                            <Stack direction="row" spacing={2} sx={{ alignItems: "center", justifyContent: "space-between", flexWrap: "wrap" }}>
                                <Typography component="a" href="/" variant="h4" sx={{ color: "text.primary", textDecoration: "none" }}>问题管理系统</Typography>
                                <Stack direction="row" spacing={1} useFlexGap sx={{ alignItems: "center", flexWrap: "wrap" }}>
                                    <ThemeToggle />
                                    {user ? <>
                                        <Button color="inherit" variant="text" href="/account">{user.name}{user.role === "admin" ? " · 管理员" : ""}</Button>
                                        {user.role === "admin" && <Button color="inherit" variant="text" href="/admin/users">用户管理</Button>}
                                        <Button variant="text" color="inherit" disabled={loggingOut} onClick={async () => {
                                            setLoggingOut(true);
                                            try {
                                                await api("/api/auth/logout", { method: "POST" });
                                                setUser(null);
                                                setRefresh((value) => value + 1);
                                                navigate("/");
                                            } catch (error) {
                                                setError(`退出失败：${String(error)}`);
                                            } finally {
                                                setLoggingOut(false);
                                            }
                                        }}>退出</Button>
                                    </> : !loading && <>
                                        <Button color="inherit" href={`/login?next=${encodeURIComponent(pathname)}`}>登录</Button>
                                    </>}
                                </Stack>
                            </Stack>
                            <Typography variant="caption" component="p" color="text.secondary" sx={{ mt: 2.5, mb: 0, pt: 2, borderTop: "1px solid", borderColor: "divider", lineHeight: 1.8 }}>
                                唉，你竟堕落至此？曾几何时，你是我们最耀眼的希望，是我们最珍视的子嗣；如今，你却已与我们背道而驰，彻底迷失。你不仅自取沉沦，更将那些追随你的人也一同拖入了深渊。
                            </Typography>
                        </Box>}
                        {loading && <LinearProgress aria-label="读取登录状态" />}
                        {error && <Alert severity="error" action={<Button color="inherit" onClick={() => setRefresh((value) => value + 1)}>重试</Button>}>{error}</Alert>}
                        {!loading && !error && (user || pathname === "/login") && <Box key={path} className="page-content">{pathname === "/" ? <Issues user={user} />
                            : detail ? <IssueDetail key={detail[1]} id={Number(detail[1])} user={user} />
                            : pathname === "/admin/users" && user ? <Users user={user} onUserChange={setUser} />
                            : pathname === "/login" || pathname === "/account" || pathname === "/admin/users/new"
                                ? <AuthPage key={path} mode={pathname === "/admin/users/new" ? "create-user" : pathname.slice(1) as "login" | "account"} user={user} onUserChange={(user) => {
                                    setUser(user);
                                    setRefresh((value) => value + 1);
                                }} />
                                : <Stack spacing={2}><Typography>页面不存在。</Typography><Button href="/">返回列表</Button></Stack>}</Box>}
                    </Stack>
                </Container>
            </ThemeProvider>
        </StrictMode>
    );
}
