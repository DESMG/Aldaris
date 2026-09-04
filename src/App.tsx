import { StrictMode, useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";

import { Alert, Avatar, Box, Button, Divider, IconButton, LinearProgress, Menu, MenuItem, Stack, SvgIcon, Typography } from "@mui/material";
import Container from "@mui/material/Container";
import CssBaseline from "@mui/material/CssBaseline";
import { createTheme, ThemeProvider, useColorScheme } from "@mui/material/styles";
import Issues, { initialIssuesView } from "./Issues";
import IssueDetail from "./IssueDetail";
import AuthPage from "./AuthPage";
import Users from "./Users";
import Notifications, { NotificationLink } from "./Notifications";
import { api, clearApiCache, navigate, resetApiSession } from "./api";
import type { User } from "./api";

const theme = createTheme({
    cssVariables: {
        colorSchemeSelector: "class",
        cssVarPrefix: "theme",
    },
    colorSchemes: {
        light: { palette: {
            primary: { main: "#0969da", light: "#ddf4ff", dark: "#0550ae", contrastText: "#ffffff" },
            secondary: { main: "#8250df", light: "#fbefff", dark: "#6639ba", contrastText: "#ffffff" },
            success: { main: "#1a7f37", light: "#dafbe1", dark: "#116329", contrastText: "#ffffff" },
            info: { main: "#0969da", light: "#ddf4ff", dark: "#0550ae", contrastText: "#ffffff" },
            warning: { main: "#9a6700", light: "#fff8c5", dark: "#7d4e00", contrastText: "#ffffff" },
            error: { main: "#d1242f", light: "#ffebe9", dark: "#a40e26", contrastText: "#ffffff" },
            background: { default: "#ffffff", paper: "#ffffff" },
            text: { primary: "#1f2328", secondary: "#59636e", disabled: "#818b98" },
            divider: "#d1d9e0",
            action: { active: "#59636e", hover: "#818b981a", selected: "#818b9826", disabled: "#818b98", disabledBackground: "#eff2f5", focus: "#0969da26", hoverOpacity: 0.1, selectedOpacity: 0.15, focusOpacity: 0.15 },
        } },
        dark: { palette: {
            primary: { main: "#4493f8", light: "#388bfd1a", dark: "#79c0ff", contrastText: "#ffffff" },
            secondary: { main: "#ab7df8", light: "#ab7df826", dark: "#d2a8ff", contrastText: "#ffffff" },
            success: { main: "#3fb950", light: "#2ea04326", dark: "#56d364", contrastText: "#ffffff" },
            info: { main: "#4493f8", light: "#388bfd1a", dark: "#79c0ff", contrastText: "#ffffff" },
            warning: { main: "#d29922", light: "#bb800926", dark: "#e3b341", contrastText: "#ffffff" },
            error: { main: "#f85149", light: "#f851491a", dark: "#ff7b72", contrastText: "#ffffff" },
            background: { default: "#0d1117", paper: "#0d1117" },
            text: { primary: "#f0f6fc", secondary: "#9198a1", disabled: "#656c76" },
            divider: "#3d444d",
            action: { active: "#9198a1", hover: "#656c7633", selected: "#656c7633", disabled: "#656c76", disabledBackground: "#212830", focus: "#4493f826", hoverOpacity: 0.2, selectedOpacity: 0.2, focusOpacity: 0.15 },
        } },
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
                ":root, .light": {
                    "--surface-muted": "#f6f8fa", "--surface-overlay": "#ffffff", "--control-bg": "#f6f8fa", "--control-hover": "#eff2f5", "--control-active": "#e6eaef",
                    "--positive-bg": "#1f883d", "--positive-hover": "#1c8139", "--positive-active": "#197935", "--positive-disabled": "#95d8a6",
                    "--done-bg": "#8250df", "--neutral-bg": "#59636e", "--timeline-bg": "#f6f8fa", "--accent-bg": "#0969da", "--danger-bg": "#cf222e", "--danger-hover": "#cf222e", "--danger-active": "#a40e26", "--danger-text": "#d1242f",
                    "--nav-active": "#fd8c73", "--overlay-backdrop": "#c8d1da66", "--overlay-shadow": "0 8px 24px #1f232833",
                    "--primary-border": "#54aeff66", "--info-border": "#54aeff66", "--secondary-border": "#c297ff66", "--success-border": "#4ac26b66", "--warning-border": "#d4a72c66", "--error-border": "#ff818266",
                    "--emphasis-border": "#1f232826", "--positive-disabled-text": "#ffffffcc",
                },
                ".dark": {
                    "--surface-muted": "#151b23", "--surface-overlay": "#010409", "--control-bg": "#212830", "--control-hover": "#262c36", "--control-active": "#2a313c",
                    "--positive-bg": "#238636", "--positive-hover": "#29903b", "--positive-active": "#2e9a40", "--positive-disabled": "#105823",
                    "--done-bg": "#8957e5", "--neutral-bg": "#656c76", "--timeline-bg": "#212830", "--accent-bg": "#1f6feb", "--danger-bg": "#da3633", "--danger-hover": "#b62324", "--danger-active": "#da3633", "--danger-text": "#fa5e55",
                    "--nav-active": "#f78166", "--overlay-backdrop": "#21283066", "--overlay-shadow": "0 8px 24px #01040999",
                    "--primary-border": "#388bfd66", "--info-border": "#388bfd66", "--secondary-border": "#ab7df866", "--success-border": "#2ea04366", "--warning-border": "#bb800966", "--error-border": "#f8514966",
                    "--emphasis-border": "#ffffff26", "--positive-disabled-text": "#ffffff66",
                },
                "a": { color: "var(--theme-palette-primary-main)" },
                "::selection": { backgroundColor: "var(--theme-palette-action-focus)" },
                ":focus-visible, .MuiButtonBase-root.Mui-focusVisible": { outline: "2px solid var(--theme-palette-primary-main)", outlineOffset: 2 },
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
            defaultProps: { variant: "outlined", disableElevation: true },
            styleOverrides: { root: ({ theme }) => ({
                textTransform: "none", fontWeight: 650, borderRadius: 8,
                "&.MuiButton-outlined, &.MuiButton-contained": {
                    color: theme.vars!.palette.text.primary, backgroundColor: "var(--control-bg)", border: "1px solid", borderColor: theme.vars!.palette.divider,
                    "&:hover": { backgroundColor: "var(--control-hover)" }, "&:active": { backgroundColor: "var(--control-active)" },
                },
                "&.MuiButton-contained.MuiButton-colorPrimary, &.MuiButton-contained.MuiButton-colorSuccess": {
                    color: "#ffffff", backgroundColor: "var(--positive-bg)", borderColor: "var(--emphasis-border)",
                    "&:hover": { backgroundColor: "var(--positive-hover)" }, "&:active": { backgroundColor: "var(--positive-active)" },
                },
                "&.MuiButton-colorError": {
                    color: "var(--danger-text)",
                    "&:hover": { color: "#ffffff", backgroundColor: "var(--danger-hover)", borderColor: "var(--danger-hover)" },
                    "&:active": { color: "#ffffff", backgroundColor: "var(--danger-active)" },
                },
                "&.Mui-disabled": { color: theme.vars!.palette.text.disabled, backgroundColor: theme.vars!.palette.action.disabledBackground, borderColor: theme.vars!.palette.divider },
                "&.MuiButton-contained.MuiButton-colorPrimary.Mui-disabled, &.MuiButton-contained.MuiButton-colorSuccess.Mui-disabled": { color: "var(--positive-disabled-text)", backgroundColor: "var(--positive-disabled)", borderColor: "var(--positive-disabled)" },
            }) },
        },
        MuiPaper: {
            styleOverrides: {
                root: { backgroundImage: "none" },
                outlined: { boxShadow: "none" },
            },
        },
        MuiTab: { styleOverrides: { root: ({ theme }) => ({ fontWeight: 650, color: theme.vars!.palette.text.secondary, "&.Mui-selected": { color: theme.vars!.palette.text.primary } }) } },
        MuiTabs: { styleOverrides: { indicator: { backgroundColor: "var(--nav-active)" } } },
        MuiBackdrop: { styleOverrides: { root: { backgroundColor: "var(--overlay-backdrop)", "&.MuiBackdrop-invisible": { backgroundColor: "transparent" } } } },
        MuiDialog: { styleOverrides: { paper: ({ theme }) => ({ backgroundColor: "var(--surface-overlay)", border: "1px solid", borderColor: theme.vars!.palette.divider, boxShadow: "var(--overlay-shadow)" }) } },
        MuiPopover: { styleOverrides: { paper: ({ theme }) => ({ backgroundColor: "var(--surface-overlay)", border: "1px solid", borderColor: theme.vars!.palette.divider, boxShadow: "var(--overlay-shadow)" }) } },
        MuiAutocomplete: { styleOverrides: { paper: ({ theme }) => ({ backgroundColor: "var(--surface-overlay)", border: "1px solid", borderColor: theme.vars!.palette.divider, boxShadow: "var(--overlay-shadow)" }) } },
        MuiOutlinedInput: { styleOverrides: { root: ({ theme }) => ({
            backgroundColor: theme.vars!.palette.background.default,
            "& .MuiOutlinedInput-notchedOutline": { borderColor: theme.vars!.palette.divider },
            "&:hover .MuiOutlinedInput-notchedOutline": { borderColor: theme.vars!.palette.text.secondary },
            "&.Mui-focused .MuiOutlinedInput-notchedOutline": { borderColor: theme.vars!.palette.primary.main },
            "&.Mui-error .MuiOutlinedInput-notchedOutline": { borderColor: theme.vars!.palette.error.main },
            "&.Mui-disabled": { backgroundColor: theme.vars!.palette.action.disabledBackground },
            "&.Mui-disabled .MuiOutlinedInput-notchedOutline": { borderColor: theme.vars!.palette.divider },
            "& input::placeholder, & textarea::placeholder": { color: theme.vars!.palette.text.secondary, opacity: 1 },
        }) } },
        MuiChip: { styleOverrides: { root: ({ theme }) => ({
            backgroundColor: theme.vars!.palette.action.selected, color: theme.vars!.palette.text.primary,
            "&.MuiChip-colorPrimary, &.MuiChip-colorInfo": { backgroundColor: "var(--accent-bg)", color: "#ffffff" },
            "&.MuiChip-colorSuccess": { backgroundColor: "var(--positive-bg)", color: "#ffffff" },
            "&.MuiChip-colorSecondary": { backgroundColor: "var(--done-bg)", color: "#ffffff" },
            "&.MuiChip-colorError": { backgroundColor: "var(--danger-bg)", color: "#ffffff" },
            "&.MuiChip-outlined": { backgroundColor: "transparent", color: theme.vars!.palette.text.secondary, borderColor: theme.vars!.palette.divider },
            ...Object.fromEntries((["primary", "secondary", "success", "info", "warning", "error"] as const).map(color => [`&.MuiChip-outlined.MuiChip-color${color[0].toUpperCase()}${color.slice(1)}`, { color: theme.vars!.palette[color].main, backgroundColor: theme.vars!.palette[color].light, borderColor: `var(--${color}-border)` }])),
        }) } },
        MuiAvatar: { styleOverrides: { colorDefault: ({ theme }) => ({ backgroundColor: "var(--control-bg)", color: theme.vars!.palette.text.secondary, border: "1px solid", borderColor: theme.vars!.palette.divider }) } },
        MuiAlert: { styleOverrides: { root: ({ theme }) => ({
            ...Object.fromEntries((["success", "info", "warning", "error"] as const).map(color => [`&.MuiAlert-color${color[0].toUpperCase()}${color.slice(1)}`, { color: theme.vars!.palette.text.primary, backgroundColor: theme.vars!.palette[color].light, border: "1px solid", borderColor: `var(--${color}-border)`, "& .MuiAlert-icon": { color: theme.vars!.palette[color].main } }])),
        }) } },
        MuiBadge: { styleOverrides: { colorPrimary: { backgroundColor: "var(--accent-bg)", color: "#ffffff" }, colorError: { backgroundColor: "var(--danger-bg)", color: "#ffffff" } } },
        MuiLinearProgress: { styleOverrides: { root: { backgroundColor: "var(--control-bg)" }, bar: { backgroundColor: "var(--accent-bg)" } } },
    },
});

function ThemeToggle() {
    const { mode, systemMode, setMode } = useColorScheme();
    const [switching, setSwitching] = useState(false);
    const dark = (mode === "system" ? systemMode : mode) === "dark";
    useEffect(() => {
        document.querySelector('meta[name="theme-color"]')!.setAttribute("content", dark ? "#0d1117" : "#ffffff");
    }, [dark]);
    return <IconButton color="inherit" aria-label={dark ? "切换到浅色模式" : "切换到深色模式"} title={dark ? "浅色模式" : "深色模式"} disabled={!mode || switching} onClick={async event => {
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
        <SvgIcon>
            {dark ? <path d="M12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10Zm-1-6h2v4h-2Zm0 18h2v4h-2ZM1 11h4v2H1Zm18 0h4v2h-4ZM4.22 2.81l2.83 2.83-1.41 1.41-2.83-2.83Zm12.73 14.14 2.83 2.83 1.41-1.41-2.83-2.83ZM2.81 19.78l2.83-2.83 1.41 1.41-2.83 2.83ZM16.95 5.64l2.83-2.83 1.41 1.41-2.83 2.83Z" />
                : <path d="M9.37 5.51A7 7 0 0 0 18.49 14.63 7 7 0 1 1 9.37 5.51ZM12 3a9 9 0 1 0 9 9c0-.46-.04-.92-.11-1.36A5.5 5.5 0 0 1 13.36 3.11 9.3 9.3 0 0 0 12 3Z" />}
        </SvgIcon>
    </IconButton>;
}

export default function App() {
    const [path, setPath] = useState(window.location.pathname + window.location.search);
    const [user, setUser] = useState<User | null>(null);
    const issuesView = useRef(initialIssuesView);
    const currentUser = useRef<User | null>(null);
    const [setupRequired, setSetupRequired] = useState(false);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [refresh, setRefresh] = useState(0);
    const [loggingOut, setLoggingOut] = useState(false);
    const [accountAnchor, setAccountAnchor] = useState<HTMLElement | null>(null);
    const authController = useRef<AbortController | null>(null);
    const lastAuthCheck = useRef(0);
    const pathname = path.split("?")[0];
    const detail = pathname.match(/^\/issues\/(\d+)$/);
    const replyTarget = new URLSearchParams(path.split("?")[1]).get("reply");

    function handleUserChange(nextUser: User | null) {
        if (currentUser.current?.id !== nextUser?.id || currentUser.current?.role !== nextUser?.role) {
            resetApiSession();
            issuesView.current = initialIssuesView;
        }
        else clearApiCache();
        currentUser.current = nextUser;
        authController.current?.abort();
        authController.current = null;
        lastAuthCheck.current = Date.now();
        setUser(nextUser);
        setSetupRequired(false);
        setError("");
        setLoading(false);
    }

    useEffect(() => {
        if (!loading && !error && !user && pathname !== "/login") {
            const loginPath = `/login?next=${encodeURIComponent(path)}`;
            window.history.replaceState(null, "", loginPath);
            setPath(loginPath);
        }
    }, [loading, error, user, pathname, path]);

    useEffect(() => {
        const route = () => setPath(window.location.pathname + window.location.search);
        const expired = () => {
            authController.current?.abort();
            authController.current = null;
            currentUser.current = null;
            issuesView.current = initialIssuesView;
            setUser(null);
            setError("");
            setLoading(false);
        };
        const focus = () => {
            if (!authController.current && Date.now() - lastAuthCheck.current >= 60_000) {
                setRefresh((value) => value + 1);
            }
        };
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
        authController.current = controller;
        lastAuthCheck.current = Date.now();
        api("/api/auth/me", { signal: controller.signal })
            .then((response) => response.json())
            .then((data: { user: User | null; setupRequired: boolean }) => {
                if (controller.signal.aborted) return;
                if (currentUser.current?.id !== data.user?.id || currentUser.current?.role !== data.user?.role) {
                    resetApiSession();
                    issuesView.current = initialIssuesView;
                }
                currentUser.current = data.user;
                setSetupRequired(data.setupRequired);
                setUser(current => current?.id === data.user?.id && current?.name === data.user?.name
                    && current?.username === data.user?.username && current?.role === data.user?.role ? current : data.user);
                setError("");
            })
            .catch((error) => { if (!controller.signal.aborted) setError(`读取登录状态失败：${String(error)}`); })
            .finally(() => {
                if (!controller.signal.aborted) setLoading(false);
                if (authController.current === controller) authController.current = null;
            });
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
                        {pathname !== "/login" && <Box component="header" sx={{ p: { xs: 2.5, sm: 3.5 }, borderRadius: "8px", bgcolor: "var(--surface-muted)", border: "1px solid", borderColor: "divider" }}>
                            <Stack direction="row" spacing={2} useFlexGap sx={{ alignItems: "center", justifyContent: "space-between", flexWrap: "wrap" }}>
                                <Typography component="a" href="/" variant="h4" sx={{ color: "text.primary", textDecoration: "none" }}>问题管理系统</Typography>
                                <Stack direction="row" spacing={1} useFlexGap sx={{ alignItems: "center", flexWrap: "wrap" }}>
                                    <ThemeToggle />
                                    {user ? <>
                                        <NotificationLink key={user.id} />
                                        <IconButton id="account-button" aria-label="账户菜单" title={user.name} aria-controls={accountAnchor ? "account-menu" : undefined} aria-haspopup="true" aria-expanded={accountAnchor ? "true" : undefined} onClick={event => setAccountAnchor(event.currentTarget)}>
                                            <Avatar sx={{ width: 32, height: 32, fontSize: 14 }}>{Array.from(user.name || user.username)[0]?.toUpperCase()}</Avatar>
                                        </IconButton>
                                        <Menu id="account-menu" anchorEl={accountAnchor} open={Boolean(accountAnchor)} onClose={() => setAccountAnchor(null)} anchorOrigin={{ vertical: "bottom", horizontal: "right" }} transformOrigin={{ vertical: "top", horizontal: "right" }} slotProps={{ list: { "aria-labelledby": "account-button" }, paper: { sx: { minWidth: 200, mt: 1 } } }}>
                                            <Box sx={{ px: 2, py: 1 }}>
                                                <Typography variant="subtitle2">{user.name}</Typography>
                                                <Typography variant="caption" color="text.secondary">{user.role === "admin" ? "管理员" : "用户"}</Typography>
                                            </Box>
                                            <Divider />
                                            <MenuItem component="a" href="/account" onClick={() => setAccountAnchor(null)}>账户设置</MenuItem>
                                            {user.role === "admin" && <MenuItem component="a" href="/admin/users" onClick={() => setAccountAnchor(null)}>用户管理</MenuItem>}
                                            <Divider />
                                            <MenuItem disabled={loggingOut} onClick={async () => {
                                                setAccountAnchor(null);
                                                setLoggingOut(true);
                                                try {
                                                    await api("/api/auth/logout", { method: "POST" });
                                                    handleUserChange(null);
                                                    navigate("/");
                                                } catch (error) {
                                                    setError(`退出失败：${String(error)}`);
                                                } finally {
                                                    setLoggingOut(false);
                                                }
                                            }}>{loggingOut ? "正在退出…" : "退出"}</MenuItem>
                                        </Menu>
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
                        {!loading && (user || pathname === "/login") && <Box key={`${user?.id}:${user?.role}:${pathname}`} className="page-content">{pathname === "/" ? <Issues user={user} savedView={issuesView} />
                            : detail ? <IssueDetail key={detail[1]} id={Number(detail[1])} user={user} replyTarget={replyTarget} />
                            : pathname === "/notifications" && user ? <Notifications key={user.id} />
                            : pathname === "/admin/users" && user ? <Users user={user} onUserChange={handleUserChange} />
                            : pathname === "/login" || pathname === "/account" || pathname === "/admin/users/new"
                                ? <AuthPage key={setupRequired ? "setup" : pathname} mode={pathname === "/login" && setupRequired ? "setup" : pathname === "/admin/users/new" ? "create-user" : pathname.slice(1) as "login" | "account"} user={user} onUserChange={handleUserChange} />
                                : <Stack spacing={2}><Typography>页面不存在。</Typography><Button href="/">返回列表</Button></Stack>}</Box>}
                    </Stack>
                </Container>
            </ThemeProvider>
        </StrictMode>
    );
}
