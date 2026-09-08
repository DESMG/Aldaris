import { StrictMode, useCallback, useEffect, useRef, useState } from "react";
import { Alert, Avatar, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, Divider, GlobalStyles, IconButton, LinearProgress, Menu, MenuItem, Snackbar, Stack, Typography } from "@mui/material";
import Container from "@mui/material/Container";
import CssBaseline from "@mui/material/CssBaseline";
import { ThemeProvider } from "@mui/material/styles";

import { api, navigate, getLoginSession, setLoginSession, synchronizeSession, LOGIN_STORAGE_KEY, getApiSessionGeneration, assertApiSession } from "./api";
import type { User } from "./api";
import theme from "./theme";
import ThemeToggle from "./ThemeToggle";
import { confirmDraftNavigation, discardDraftGuards, hasUnsavedDrafts } from "./DraftGuard";
import ConfirmDialog, { cancelConfirmation, confirmAction } from "./ConfirmDialog";

import AuthPage from "./AuthPage";
import Issues from "./Issues";
import IssueDetail from "./IssueDetail";
import LicensePage from "./LicensePage";
import OperationEvents from "./OperationEvents";
import PolicyPage from "./PolicyPage";
import Users from "./Users";

const slogans = [
    "若任由他将黑暗圣堂武士被玷污的影响带回艾尔，一切都将万劫不复。我们会找到他，并将他带回接受审判。",
    "我们审判官肩负着超越这些琐事、确保族人安全与未来的职责。如今真正威胁我们的并非异虫，而是那个背离正道的塔萨达。",
    "我们曾试图惩罚你，然而真正犯错的却是我们。你代表着我们所有人身上最伟大的一面，而我们全部的希望如今都与你同在。",
    "你的所作所为已经使你失去了同胞的宽恕。你违抗命令，一再质疑议会的神圣意志，并在故乡最黑暗的时刻弃之而去。",
];

export default function App() {
    const apiSession = getApiSessionGeneration();
    const [path, setPath] = useState(window.location.hash.slice(1) || "/");
    const pageContent = useRef<HTMLDivElement | null>(null);
    const pageExitAnimation = useRef<Animation | null>(null);
    const [sloganIndex, setSloganIndex] = useState(() => Math.floor(Math.random() * slogans.length));
    const sloganPath = useRef(path);
    const [user, setUser] = useState<User | null>(null);
    const [pausedAccount, setPausedAccount] = useState<User | null>(null);
    const pausedAccountRef = useRef<User | null>(null);
    const pageUser = pausedAccount ?? user;
    const pageUserRef = useRef<User | null>(null);
    pageUserRef.current = pageUser;
    const [pageVersion, setPageVersion] = useState(0);
    const [notice, setNotice] = useState("");
    const historyIndex = useRef(window.history.state?.aldarisIndex ?? 0);
    const handledHistory = useRef({ url: window.location.href, index: historyIndex.current });
    const restoringHistory = useRef(false);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [refresh, setRefresh] = useState(0);
    const [loggingOut, setLoggingOut] = useState(false);
    const [accountAnchor, setAccountAnchor] = useState<HTMLElement | null>(null);
    const authController = useRef<AbortController | null>(null);
    const lastAuthCheck = useRef(0);
    const pathname = path.split("?")[0];
    const locationSearch = path.includes("?") ? path.slice(path.indexOf("?") + 1) : "";
    const detail = pathname.match(/^\/issues\/(\d+)$/);
    const isIssueDetail = !!detail;
    const isIssueList = pathname === "/";
    const attachPageContent = useCallback((node: HTMLDivElement | null) => {
        pageContent.current = node;
        if (!node) return;
        const animation = (isIssueDetail || isIssueList) && !window.matchMedia("(prefers-reduced-motion: reduce)").matches ? node.animate([
            { transform: isIssueDetail ? "translateX(64px)" : "translateX(-64px)", opacity: 0 },
            { transform: "translateX(0)", opacity: 1 },
        ], { duration: 250, easing: "ease-out" }) : null;
        return () => { animation?.cancel(); pageExitAnimation.current?.cancel(); pageContent.current = null; };
    }, [isIssueDetail, isIssueList]);
    const replyTarget = new URLSearchParams(locationSearch).get("reply");

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
        setError("");
        setLoading(false);
    }

    useEffect(() => {
        if (!loading && !error && !user && !pausedAccount && !["/login", "/privacy", "/terms", "/license"].includes(pathname)) {
            const loginPath = `/login?next=${encodeURIComponent(path)}`;
            window.history.replaceState(window.history.state, "", `/#${loginPath}`);
            handledHistory.current = { url: window.location.href, index: historyIndex.current };
            setPath(loginPath);
        }
    }, [loading, error, user, pausedAccount, pathname, path]);

    useEffect(() => {
        window.history.replaceState({ ...window.history.state, aldarisIndex: historyIndex.current }, "");
        let pendingHistoryDelta = 0;
        let approvedHistory = false;
        const route = (event: PopStateEvent | HashChangeEvent) => {
            let nextIndex = window.history.state?.aldarisIndex;
            if (nextIndex == null) {
                nextIndex = historyIndex.current + 1;
                window.history.replaceState({ ...window.history.state, aldarisIndex: nextIndex }, "");
            }
            const nextUrl = window.location.href;
            if (handledHistory.current.url === nextUrl && handledHistory.current.index === nextIndex) return;
            handledHistory.current = { url: nextUrl, index: nextIndex };
            cancelConfirmation();
            if (restoringHistory.current) {
                restoringHistory.current = false;
                const delta = pendingHistoryDelta;
                pendingHistoryDelta = 0;
                void confirmDraftNavigation().then(confirmed => {
                    if (!confirmed) return;
                    approvedHistory = true;
                    window.history.go(delta);
                });
                return;
            }
            if (event.isTrusted && nextIndex !== historyIndex.current && hasUnsavedDrafts() && !approvedHistory) {
                pendingHistoryDelta = nextIndex - historyIndex.current;
                restoringHistory.current = true;
                window.history.go(historyIndex.current - nextIndex);
                return;
            }
            approvedHistory = false;
            if (pausedAccountRef.current) {
                discardDraftGuards();
                pausedAccountRef.current = null;
                setPausedAccount(null);
            }
            historyIndex.current = nextIndex;
            const nextPath = window.location.hash.slice(1) || "/";
            const content = pageContent.current;
            pageExitAnimation.current?.cancel();
            if (content) content.inert = false;
            if (content?.dataset.issueDetail === "true" && nextPath.split("?")[0] === "/" && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
                content.inert = true;
                const session = getApiSessionGeneration();
                const animation = content.animate([
                    { transform: "translateX(0)", opacity: 1 },
                    { transform: "translateX(64px)", opacity: 0 },
                ], { duration: 250, easing: "ease-in", fill: "forwards" });
                pageExitAnimation.current = animation;
                void animation.finished.then(() => {
                    if (window.location.href === nextUrl && getApiSessionGeneration() === session) setPath(nextPath);
                    else { animation.cancel(); content.inert = false; }
                }, () => { /* Navigation or unmount cancelled the animation. */ });
            } else setPath(nextPath);
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
        window.addEventListener("hashchange", route);
        window.addEventListener("auth-session-changed", changed);
        window.addEventListener("storage", storage);
        window.addEventListener("focus", focus);
        window.addEventListener("app-notice", notify);
        return () => {
            window.removeEventListener("popstate", route);
            window.removeEventListener("hashchange", route);
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
            .then((data: { user: User | null }) => {
                if (controller.signal.aborted) return;
                assertApiSession(expectedSession);
                const stored = getLoginSession();
                if (stored && !data.user) { setLoginSession(null); return; }
                if (stored && data.user && JSON.stringify(stored.user) !== JSON.stringify(data.user)) {
                    setLoginSession({ ...stored, user: data.user });
                }
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

    useEffect(() => {
        if (sloganPath.current === path) return;
        sloganPath.current = path;
        const offset = 1 + Math.floor(Math.random() * (slogans.length - 1));
        setSloganIndex(index => (index + offset) % slogans.length);
    }, [path]);

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
                <GlobalStyles styles={pausedAccount ? { ".MuiModal-root:not(.reauthentication-dialog):not(.confirmation-dialog), .MuiPopper-root": { visibility: "hidden" } } : {}} />
                {pathname === "/login" && <Box sx={{ position: "absolute", top: 16, right: 16 }}><ThemeToggle /></Box>}
                <Container component="main" maxWidth="md" inert={pausedAccount !== null} sx={{ py: 4, visibility: pausedAccount ? "hidden" : "visible", ...(pathname === "/login" ? { minHeight: "100dvh", display: "flex", alignItems: "center", justifyContent: "center" } : {}) }} onClick={(event) => {
                    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
                    const link = (event.target as Element).closest("a");
                    if (!link || link.origin !== window.location.origin || link.target || link.hasAttribute("download")) return;
                    if (link.pathname !== "/" || link.search || !link.hash.startsWith("#/")) return;
                    const nextPath = link.hash.slice(1);
                    const nextPathname = nextPath.split("?")[0];
                    if (!["/", "/login", "/account", "/privacy", "/terms", "/license", "/operations", "/admin/users", "/admin/users/new"].includes(nextPathname)
                        && !/^\/issues\/\d+$/.test(nextPathname)) return;
                    event.preventDefault();
                    navigate(nextPath);
                }}>
                    <Stack spacing={3} sx={{ width: "100%", ...(pathname === "/login" ? { maxWidth: 440 } : {}) }}>
                        {pathname !== "/login" && <Box component="header" sx={{ p: { xs: 2.5, sm: 3.5 }, borderRadius: "8px", bgcolor: "var(--surface-muted)", border: "1px solid", borderColor: "divider" }}>
                            <Stack direction="row" spacing={2} useFlexGap sx={{ alignItems: "center", justifyContent: "space-between", flexWrap: "wrap" }}>
                                <Stack direction="row" spacing={2} useFlexGap sx={{ alignItems: "center", flexWrap: "wrap" }}>
                                    <Typography component="a" href="/#/" variant="h4" sx={{ color: "text.primary", textDecoration: "none" }}>问题管理系统</Typography>
                                    {pathname !== "/" && <Button href="/#/" color="inherit" variant="outlined">← 返回列表</Button>}
                                </Stack>
                                <Stack direction="row" spacing={1} useFlexGap sx={{ alignItems: "center", flexWrap: "wrap" }}>
                                    <ThemeToggle />
                                    {user ? <>
                                        <IconButton id="account-button" aria-label="账户菜单" title={user.name} aria-controls={accountAnchor ? "account-menu" : undefined} aria-haspopup="true" aria-expanded={accountAnchor ? "true" : undefined} onClick={event => setAccountAnchor(event.currentTarget)}>
                                            <Avatar sx={{ width: 32, height: 32, fontSize: 14, bgcolor: "primary.main", color: "primary.contrastText", borderColor: "primary.main" }}>{Array.from(user.name || user.username)[0]?.toUpperCase()}</Avatar>
                                        </IconButton>
                                        <Menu id="account-menu" anchorEl={accountAnchor} open={Boolean(accountAnchor)} onClose={() => setAccountAnchor(null)} anchorOrigin={{ vertical: "bottom", horizontal: "right" }} transformOrigin={{ vertical: "top", horizontal: "right" }} slotProps={{ list: { "aria-labelledby": "account-button" }, paper: { sx: { minWidth: 200, mt: 1 } } }}>
                                            <Box sx={{ px: 2, py: 1 }}>
                                                <Typography variant="subtitle2" sx={{ overflowWrap: "anywhere" }}>{user.name} <Box component="span" sx={{ color: "text.secondary", fontWeight: 400 }}>(@{user.username})</Box></Typography>
                                                <Typography variant="caption" color="text.secondary">{user.role === "admin" ? "管理员" : "用户"}</Typography>
                                            </Box>
                                            <Divider sx={{ my: 1 }} />
                                            <MenuItem component="a" href="/#/account" onClick={() => setAccountAnchor(null)}>账户设置</MenuItem>
                                            {user.role === "admin" && <MenuItem component="a" href="/#/admin/users" onClick={() => setAccountAnchor(null)}>用户管理</MenuItem>}
                                            {user.role === "admin" && <MenuItem component="a" href="/#/operations" onClick={() => setAccountAnchor(null)}>操作记录</MenuItem>}
                                            <Divider />
                                            <MenuItem disabled={loggingOut} onClick={async () => {
                                                setAccountAnchor(null);
                                                setLoggingOut(true);
                                                try {
                                                    if (!await confirmDraftNavigation()) return;
                                                    assertApiSession(apiSession);
                                                    await api("/api/auth/logout", { method: "POST", expectedSession: apiSession });
                                                    assertApiSession(apiSession);
                                                    discardDraftGuards();
                                                    handleUserChange(null);
                                                    window.history.replaceState(window.history.state, "", "/#/login");
                                                    handledHistory.current = { url: window.location.href, index: historyIndex.current };
                                                    setPath("/login");
                                                } catch (error) {
                                                    setError(`退出失败：${String(error)}`);
                                                } finally {
                                                    setLoggingOut(false);
                                                }
                                            }}>{loggingOut ? "正在退出…" : "退出"}</MenuItem>
                                        </Menu>
                                    </> : !loading && <>
                                        <Button color="inherit" href={`/#/login?next=${encodeURIComponent(path)}`}>登录</Button>
                                    </>}
                                </Stack>
                            </Stack>
                            <Typography variant="caption" component="p" color="text.secondary" sx={{ mt: 2.5, mb: 0, pt: 2, borderTop: "1px solid", borderColor: "divider", lineHeight: 1.8 }}>
                                {slogans[sloganIndex]}
                            </Typography>
                        </Box>}
                        {loading && <LinearProgress aria-label="读取登录状态" />}
                        {error && <Alert severity="error" action={<Button color="inherit" onClick={() => setRefresh((value) => value + 1)}>重试</Button>}>{error}</Alert>}
                        {pathname === "/license" ? <LicensePage /> : pathname === "/privacy" || pathname === "/terms" ? <PolicyPage kind={pathname === "/privacy" ? "privacy" : "terms"} /> : !loading && (pageUser || pathname === "/login") && <Box key={`${pageUser?.id}:${pageUser?.role}:${pathname}:${pageVersion}`} className={isIssueDetail || isIssueList ? undefined : "page-content"} sx={isIssueList ? { "& .MuiPaper-outlined, & .MuiAlert-root": { animation: "none" } } : undefined} data-issue-detail={isIssueDetail} ref={attachPageContent}>{pathname === "/" ? <Issues user={pageUser} locationSearch={locationSearch} />
                            : detail ? <IssueDetail key={detail[1]} id={Number(detail[1])} user={pageUser} replyTarget={replyTarget} />
                                : pathname === "/operations" && pageUser ? <OperationEvents user={pageUser} />
                                    : pathname === "/admin/users" && pageUser ? <Users user={pageUser} onUserChange={handleUserChange} />
                                        : pathname === "/login" || pathname === "/account" || pathname === "/admin/users/new"
                                            ? <AuthPage key={pathname} mode={pathname === "/admin/users/new" ? "create-user" : pathname.slice(1) as "login" | "account"} user={pageUser} onUserChange={handleUserChange} />
                                            : <Typography component="h1" variant="h5">页面不存在。</Typography>}</Box>}
                        <Stack component="footer" direction="row" spacing={1} useFlexGap sx={{
                            justifyContent: "center", flexWrap: "wrap", pt: 2,
                            "& a": {
                                px: 2, minHeight: 40, borderRadius: 2,
                                "&:hover, &[aria-current='page']": { bgcolor: "action.selected" },
                            },
                        }}>
                            <Button href="/#/privacy" variant="text" aria-current={pathname === "/privacy" ? "page" : undefined}>隐私政策</Button>
                            <Button href="/#/terms" variant="text" aria-current={pathname === "/terms" ? "page" : undefined}>使用条款</Button>
                            <Button href="/#/license" variant="text" aria-current={pathname === "/license" ? "page" : undefined}>开源许可</Button>
                            <Button href="https://github.com/DESMG/Aldaris" target="_blank" rel="external noopener noreferrer nofollow" variant="text">源代码</Button>
                        </Stack>
                    </Stack>
                </Container>
                <Dialog open={pausedAccount !== null} className="reauthentication-dialog" fullWidth maxWidth="sm" sx={{ zIndex: theme.zIndex.modal + 10 }}>
                    <DialogTitle>重新登录以恢复草稿</DialogTitle>
                    <DialogContent>
                        <Typography sx={{ mb: 2, overflowWrap: "anywhere" }}>登录已失效或账户已切换，@{pausedAccount?.username} 的未提交内容仍保留在当前页面。请重新登录原账户；刷新后可恢复已保存的文字，图片和密码需重新填写，关闭标签页后不承诺恢复。</Typography>
                        {pausedAccount && <AuthPage key={pausedAccount.id} mode="login" user={null} resumeUserId={pausedAccount.id} onUserChange={handleUserChange} />}
                    </DialogContent>
                    <DialogActions><Button color="inherit" onClick={async () => {
                        if (!await confirmAction("放弃当前编辑内容及其已保存的文字草稿？")) return;
                        discardDraftGuards(true);
                        pausedAccountRef.current = null;
                        setPausedAccount(null);
                        setPageVersion(value => value + 1);
                    }}>放弃草稿</Button></DialogActions>
                </Dialog>
                <ConfirmDialog />
                <Snackbar open={notice !== ""} onClose={(_, reason) => { if (reason !== "clickaway") setNotice(""); }}>
                    <Alert severity="warning" onClose={() => setNotice("")}>{notice}</Alert>
                </Snackbar>
            </ThemeProvider>
        </StrictMode>
    );
}
