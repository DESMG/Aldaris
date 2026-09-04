import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Alert, Button, Paper, Popper, Stack, TextField, Typography } from "@mui/material";
import type { PopperProps } from "@mui/material";
import { cachedJson, getCachedJson } from "./api";
import type { Member } from "./api";
import ImageSelection from "./ImageSelection";
import { DESCRIPTION_MAX_LENGTH } from "../shared/limits";

export default function Description({ label, value, onChange, images, onImagesChange, disabled, retainedCount, onProcessingChange }: {
    label: string;
    value: string;
    onChange: (value: string) => void;
    images: File[];
    onImagesChange: (images: File[]) => void;
    disabled: boolean;
    retainedCount?: number;
    onProcessingChange?: (processing: boolean) => void;
}) {
    const input = useRef<HTMLTextAreaElement>(null);
    const popup = useRef<HTMLDivElement>(null);
    const [anchor, setAnchor] = useState<PopperProps["anchorEl"]>(null);
    const [cursor, setCursor] = useState(0);
    const [focused, setFocused] = useState(false);
    const [dismissed, setDismissed] = useState(false);
    const [users, setUsers] = useState<Member[]>([]);
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);
    const [pastedFiles, setPastedFiles] = useState<File[] | null>(null);
    const mention = value.slice(0, cursor).match(/(?<![\p{L}\p{N}_@.+-])@([a-z0-9_.-]{1,50})$/iu);
    const search = focused && !disabled && !dismissed && mention ? mention[1] : null;
    useLayoutEffect(() => {
        const textarea = input.current;
        if (search === null || !textarea) {
            setAnchor(null);
            return;
        }
        const mirror = document.createElement("div");
        const marker = document.createElement("span");
        mirror.setAttribute("aria-hidden", "true");
        document.body.append(mirror);
        const updateAnchor = () => {
            const style = getComputedStyle(textarea);
            for (const property of [
                "font-family", "font-size", "font-weight", "font-style", "font-variant",
                "font-stretch", "line-height", "letter-spacing", "word-spacing", "text-indent",
                "text-transform", "text-align", "direction", "tab-size", "padding-top",
                "padding-right", "padding-bottom", "padding-left", "word-break", "overflow-wrap",
            ]) mirror.style.setProperty(property, style.getPropertyValue(property));
            Object.assign(mirror.style, {
                position: "fixed", visibility: "hidden", pointerEvents: "none",
                left: "0", top: "0", margin: "0", border: "0", boxSizing: "border-box",
                width: `${textarea.clientWidth}px`, whiteSpace: "pre-wrap",
            });
            const start = cursor - search.length - 1;
            marker.textContent = "@";
            mirror.replaceChildren(document.createTextNode(value.slice(0, start)), marker,
                document.createTextNode(value.slice(start + 1)));
            const textRect = marker.getBoundingClientRect();
            const inputRect = textarea.getBoundingClientRect();
            const x = inputRect.left + textarea.clientLeft + textRect.left - textarea.scrollLeft;
            const y = inputRect.top + textarea.clientTop + textRect.top - textarea.scrollTop;
            if (y + textRect.height < inputRect.top || y > inputRect.bottom ||
                x + textRect.width < inputRect.left || x > inputRect.right) {
                setAnchor(null);
                return;
            }
            const rect = new DOMRect(x, y, 0, textRect.height);
            setAnchor({ getBoundingClientRect: () => rect, contextElement: textarea });
        };
        updateAnchor();
        const observer = new ResizeObserver(updateAnchor);
        observer.observe(textarea);
        window.addEventListener("resize", updateAnchor);
        document.addEventListener("scroll", updateAnchor, true);
        return () => {
            observer.disconnect();
            window.removeEventListener("resize", updateAnchor);
            document.removeEventListener("scroll", updateAnchor, true);
            mirror.remove();
        };
    }, [value, cursor, search]);
    useEffect(() => {
        if (search === null) return;
        setError("");
        const url = `/api/users/mentions?search=${encodeURIComponent(search)}`;
        const cached = getCachedJson<{ users: Member[] }>(url);
        if (cached !== undefined) {
            setUsers(cached.users);
            setLoading(false);
            return;
        }
        let active = true;
        setLoading(true);
        setUsers([]);
        const timer = window.setTimeout(() => {
            cachedJson<{ users: Member[] }>(url).then(data => {
                if (active) setUsers(data.users);
            }).catch(error => { if (active) setError(`读取提及候选人失败：${String(error)}`); })
                .finally(() => { if (active) setLoading(false); });
        }, 200);
        return () => { active = false; window.clearTimeout(timer); };
    }, [search]);
    return <Stack spacing={2} onKeyDown={event => {
        if (event.key !== "Escape" || search === null || anchor === null) return;
        event.preventDefault();
        event.stopPropagation();
        setDismissed(true);
        input.current?.focus();
    }} onBlur={event => {
        if (!event.currentTarget.contains(event.relatedTarget) && !popup.current?.contains(event.relatedTarget)) setFocused(false);
    }}>
        <TextField
            label={label} multiline minRows={4} fullWidth disabled={disabled}
            inputRef={input} helperText="输入 @用户名 搜索并提及用户。"
            onFocus={() => setFocused(true)}
            onSelect={() => {
                const next = input.current?.selectionStart ?? 0;
                if (next !== cursor) setDismissed(false);
                setCursor(next);
            }}
            slotProps={{ htmlInput: { maxLength: DESCRIPTION_MAX_LENGTH } }}
            value={value} onChange={(event) => { setDismissed(false); onChange(event.target.value); setCursor(event.target.selectionStart ?? 0); }}
            onPaste={(event) => {
                const pasted = Array.from(event.clipboardData.files).filter((file) => file.type.startsWith("image/"));
                if (pasted.length > 0) { event.preventDefault(); setPastedFiles(pasted); }
            }}
        />
        {search !== null && <Popper open={anchor !== null} anchorEl={anchor} placement="bottom-start"
            sx={{ zIndex: theme => theme.zIndex.modal + 1 }}
            modifiers={[{ name: "offset", options: { offset: [0, 4] } }, { name: "preventOverflow", options: { padding: 8 } }]}>
            <Paper ref={popup} variant="outlined" sx={{ p: 1, width: 300, maxWidth: "calc(100vw - 16px)", boxSizing: "border-box", maxHeight: 220, overflow: "auto", bgcolor: "var(--surface-overlay)", boxShadow: "var(--overlay-shadow)" }}>
                {error && <Alert severity="error">{error}</Alert>}
                {loading && <Typography variant="body2">正在查找用户…</Typography>}
                {!loading && !error && users.length === 0 && <Typography variant="body2">没有匹配的用户。</Typography>}
                {users.map(user => <Button key={user.id} variant="text" fullWidth sx={{ justifyContent: "flex-start" }}
                    onMouseDown={event => event.preventDefault()} onClick={() => {
                        const start = cursor - search.length - 1;
                        const inserted = `@${user.username} `;
                        const next = value.slice(0, start) + inserted + value.slice(cursor);
                        if (next.length > DESCRIPTION_MAX_LENGTH) { setError(`内容最多 ${DESCRIPTION_MAX_LENGTH} 个字符。`); return; }
                        onChange(next);
                        setCursor(start + inserted.length);
                        requestAnimationFrame(() => {
                            input.current?.focus();
                            input.current?.setSelectionRange(start + inserted.length, start + inserted.length);
                        });
                    }}>@{user.username}</Button>)}
            </Paper>
        </Popper>}
        <ImageSelection images={images} onChange={onImagesChange} disabled={disabled} retainedCount={retainedCount} onProcessingChange={onProcessingChange} pastedFiles={pastedFiles} />
    </Stack>;
}
