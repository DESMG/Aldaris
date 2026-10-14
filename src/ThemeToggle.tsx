import { useEffect, useState } from "react";
import { flushSync } from "react-dom";
import { IconButton } from "@mui/material";
import LightMode from "@mui/icons-material/LightMode";
import DarkMode from "@mui/icons-material/DarkMode";
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
        {dark ? <LightMode /> : <DarkMode />}
    </IconButton>;
}
