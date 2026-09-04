import { useEffect, useState } from "react";
import { flushSync } from "react-dom";
import { IconButton, SvgIcon } from "@mui/material";
import { useColorScheme } from "@mui/material/styles";

export default function ThemeToggle() {
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
