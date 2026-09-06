import { StrictMode, useEffect, useRef, useState } from "react";

import { Alert, Avatar, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, Divider, GlobalStyles, IconButton, LinearProgress, Menu, MenuItem, Snackbar, Stack, Typography } from "@mui/material";
import Container from "@mui/material/Container";
import CssBaseline from "@mui/material/CssBaseline";
import { ThemeProvider } from "@mui/material/styles";
import theme from "./theme";
import ThemeToggle from "./ThemeToggle";
import OperationEvents from "./OperationEvents";
import { confirmDraftNavigation, discardDraftGuards, hasUnsavedDrafts } from "./DraftGuard";
import Issues from "./Issues";
import IssueDetail from "./IssueDetail";
import AuthPage from "./AuthPage";
import Users from "./Users";
import Notifications, { NotificationLink } from "./Notifications";
import { api, navigate, getLoginSession, setLoginSession, synchronizeSession, LOGIN_STORAGE_KEY, getApiSessionGeneration, assertApiSession } from "./api";
import type { User } from "./api";

export default function App() {
    const apiSession = getApiSessionGeneration();
    const [path, setPath] = useState(window.location.pathname + window.location.search);
    const [user, setUser] = useState<User | null>(null);
    const [pausedAccount, setPausedAccount] = useState<User | null>(null);
    const pausedAccountRef = useRef<User | null>(null);
    const pageUser = pausedAccount ?? user;
    const pageUserRef = useRef<User | null>(null);
    pageUserRef.current = pageUser;
    const [pageVersion, setPageVersion] = useState(0);
    const [notice, setNotice] = useState("");
    const historyIndex = useRef(window.history.state?.aldarisIndex ?? 0);
    const restoringHistory = useRef(false);
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

    function syncUser(nextUser: User | null) {
        const owner = pageUserRef.current;
        if (owner && nextUser?.id !== owner.id && hasUnsavedDrafts()) {
            // This records the editor's owner, never an authenticated session.
            pausedAccountRef.current = owner;
            setPausedAccount(owner);
        } else if (nextUser && pausedAccountRef.current?.id === nextUser.id) {
            pausedAccountRef.current = null;
            setPausedAccount(null);
        }
        setUser(nextUser);
    }

    function handleUserChange(nextUser: User | null) {
        const session = getLoginSession();
        if (!nextUser) setLoginSession(null);
        else if (session && (session.user.name !== nextUser.name || session.user.username !== nextUser.username || session.user.role !== nextUser.role)) setLoginSession({ ...session, user: nextUser });
        authController.current?.abort();
        authController.current = null;
        lastAuthCheck.current = Date.now();
        syncUser(nextUser);
        setSetupRequired(false);
        setError("");
        setLoading(false);
    }

    useEffect(() => {
        if (!loading && !error && !user && !pausedAccount && pathname !== "/login") {
            const loginPath = `/login?next=${encodeURIComponent(path)}`;
            window.history.replaceState(window.history.state, "", loginPath);
            setPath(loginPath);
        }
    }, [loading, error, user, pausedAccount, pathname, path]);

    useEffect(() => {
        window.history.replaceState({ ...window.history.state, aldarisIndex: historyIndex.current }, "");
        const route = (event: PopStateEvent) => {
            const nextIndex = window.history.state?.aldarisIndex ?? 0;
            if (restoringHistory.current) { restoringHistory.current = false; return; }
            if (event.isTrusted && nextIndex !== historyIndex.current && !confirmDraftNavigation()) {
                restoringHistory.current = true;
                window.history.go(historyIndex.current - nextIndex);
                return;
            }
            if (pausedAccountRef.current) {
                discardDraftGuards();
                pausedAccountRef.current = null;
                setPausedAccount(null);
            }
            historyIndex.current = nextIndex;
            setPath(window.location.pathname + window.location.search);
        };
        const changed = () => {
            authController.current?.abort();
            authController.current = null;
            try { syncUser(getLoginSession()?.user ?? null); setError(""); }
            catch (error) { syncUser(null); setError(String(error)); }
            setAccountAnchor(null);
            setNotice("");
            setRefresh(value => value + 1);
        };
        const storage = (event: StorageEvent) => {
            if (event.storageArea === localStorage && (event.key === LOGIN_STORAGE_KEY || event.key === null)) synchronizeSession();
        };
        const focus = () => {
            synchronizeSession();
            if (!authController.current && Date.now() - lastAuthCheck.current >= 60_000) setRefresh(value => value + 1);
        };
        const notify = (event: Event) => setNotice((event as CustomEvent<string>).detail);
        window.addEventListener("popstate", route);
        window.addEventListener("auth-session-changed", changed);
        window.addEventListener("storage", storage);
        window.addEventListener("focus", focus);
        window.addEventListener("app-notice", notify);
        return () => {
            window.removeEventListener("popstate", route);
            window.removeEventListener("auth-session-changed", changed);
            window.removeEventListener("storage", storage);
            window.removeEventListener("focus", focus);
            window.removeEventListener("app-notice", notify);
        };
    }, []);

    useEffect(() => {
        let session;
        try { session = getLoginSession(); } catch { return; }
        if (!session) return;
        const timer = window.setTimeout(() => {
            if (getLoginSession()?.token === session.token) setLoginSession(null);
        }, Math.max(0, session.expiresAt - Date.now()));
        return () => window.clearTimeout(timer);
    }, [user, refresh]);

    useEffect(() => {
        const controller = new AbortController();
        const expectedSession = getApiSessionGeneration();
        authController.current = controller;
        lastAuthCheck.current = Date.now();
        api("/api/auth/me", { signal: controller.signal, expectedSession })
            .then((response) => response.json())
            .then((data: { user: User | null; setupRequired: boolean }) => {
                if (controller.signal.aborted) return;
                assertApiSession(expectedSession);
                const stored = getLoginSession();
                if (stored && !data.user) { setLoginSession(null); return; }
                if (stored && data.user && JSON.stringify(stored.user) !== JSON.stringify(data.user)) {
                    setLoginSession({ ...stored, user: data.user });
                }
                setSetupRequired(data.setupRequired);
                syncUser(data.user);
                setError("");
            })
            .catch((error) => { if (!controller.signal.aborted) setError(`读取登录状态失败：${String(error)}`); })
            .finally(() => {
                if (!controller.signal.aborted) setLoading(false);
                if (authController.current === controller) authController.current = null;
            });
        return () => controller.abort();
    }, [refresh]);

    useEffect(() => { if (!detail) document.title = "问题管理系统"; }, [pathname]);

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
                <GlobalStyles styles={pausedAccount ? { ".MuiModal-root:not(.reauthentication-dialog), .MuiPopper-root": { visibility: "hidden" } } : {}} />
                {pathname === "/login" && <Box sx={{ position: "absolute", top: 16, right: 16 }}><ThemeToggle /></Box>}
                <Container component="main" maxWidth="lg" inert={pausedAccount !== null} sx={{ py: 4, visibility: pausedAccount ? "hidden" : "visible", ...(pathname === "/login" ? { minHeight: "100dvh", display: "flex", alignItems: "center", justifyContent: "center" } : {}) }} onClick={(event) => {
                    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
                    const link = (event.target as Element).closest("a");
                    if (!link || link.origin !== window.location.origin || link.target || link.hasAttribute("download")) return;
                    if (link.hash) return;
                    if (!["/", "/login", "/account", "/notifications", "/operations", "/admin/users", "/admin/users/new"].includes(link.pathname)
                        && !/^\/issues\/\d+$/.test(link.pathname)) return;
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
                                            {user.role === "admin" && <MenuItem component="a" href="/operations" onClick={() => setAccountAnchor(null)}>操作记录</MenuItem>}
                                            <Divider />
                                            <MenuItem disabled={loggingOut} onClick={async () => {
                                                setAccountAnchor(null);
                                                setLoggingOut(true);
                                                try {
                                                    if (!confirmDraftNavigation()) return;
                                                    assertApiSession(apiSession);
                                                    discardDraftGuards();
                                                    handleUserChange(null);
                                                    window.history.replaceState(window.history.state, "", "/login");
                                                    setPath("/login");
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
                        {!loading && (pageUser || pathname === "/login") && <Box key={`${pageUser?.id}:${pageUser?.role}:${pathname}:${pageVersion}`} className="page-content">{pathname === "/" ? <Issues user={pageUser} locationSearch={path.split("?")[1] ?? ""} />
                            : detail ? <IssueDetail key={detail[1]} id={Number(detail[1])} user={pageUser} replyTarget={replyTarget} />
                            : pathname === "/notifications" && pageUser ? <Notifications key={pageUser.id} />
                            : pathname === "/operations" && pageUser ? <OperationEvents user={pageUser} />
                            : pathname === "/admin/users" && pageUser ? <Users user={pageUser} onUserChange={handleUserChange} />
                            : pathname === "/login" || pathname === "/account" || pathname === "/admin/users/new"
                                ? <AuthPage key={setupRequired ? "setup" : pathname} mode={pathname === "/login" && setupRequired ? "setup" : pathname === "/admin/users/new" ? "create-user" : pathname.slice(1) as "login" | "account"} user={pageUser} onUserChange={handleUserChange} />
                                : <Stack spacing={2}><Typography>页面不存在。</Typography><Button href="/">返回列表</Button></Stack>}</Box>}
                    </Stack>
                </Container>
                <Dialog open={pausedAccount !== null} className="reauthentication-dialog" fullWidth maxWidth="sm" sx={{ zIndex: theme.zIndex.modal + 10 }}>
                    <DialogTitle>重新登录以恢复草稿</DialogTitle>
                    <DialogContent>
                        <Typography sx={{ mb: 2, overflowWrap: "anywhere" }}>登录已失效或账户已切换，@{pausedAccount?.username} 的未提交内容仍保留在当前页面。请重新登录原账户；刷新后可恢复已保存的文字，图片和密码需重新填写，关闭标签页后不承诺恢复。</Typography>
                        {pausedAccount && <AuthPage key={pausedAccount.id} mode="login" user={null} resumeUserId={pausedAccount.id} onUserChange={handleUserChange} />}
                    </DialogContent>
                    <DialogActions><Button color="inherit" onClick={() => {
                        if (!window.confirm("放弃当前编辑内容及其已保存的文字草稿？")) return;
                        discardDraftGuards(true);
                        pausedAccountRef.current = null;
                        setPausedAccount(null);
                        setPageVersion(value => value + 1);
                    }}>放弃草稿</Button></DialogActions>
                </Dialog>
                <Snackbar open={notice !== ""} onClose={(_, reason) => { if (reason !== "clickaway") setNotice(""); }}>
                    <Alert severity="warning" onClose={() => setNotice("")}>{notice}</Alert>
                </Snackbar>
            </ThemeProvider>
        </StrictMode>
    );
}
