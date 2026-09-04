import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Alert, Box, Button, Paper, Popper, Stack, TextField, Typography } from "@mui/material";
import type { PopperProps } from "@mui/material";
import { cachedJson, getCachedJson } from "./api";
import type { Member } from "./api";

function ImagePreview({ file, alt }: { file: File; alt: string }) {
    const [url, setUrl] = useState<string>();
    useEffect(() => {
        const imageUrl = URL.createObjectURL(file);
        setUrl(imageUrl);
        return () => URL.revokeObjectURL(imageUrl);
    }, [file]);
    return <Box component="img" src={url} alt={alt} sx={{ display: "block", maxWidth: "100%", maxHeight: 320, objectFit: "contain" }} />;
}

export default function Description({ label, value, onChange, images, onImagesChange, disabled }: {
    label: string;
    value: string;
    onChange: (value: string) => void;
    images: File[];
    onImagesChange: (images: File[]) => void;
    disabled: boolean;
}) {
    const input = useRef<HTMLTextAreaElement>(null);
    const popup = useRef<HTMLDivElement>(null);
    const [anchor, setAnchor] = useState<PopperProps["anchorEl"]>(null);
    const [cursor, setCursor] = useState(0);
    const [focused, setFocused] = useState(false);
    const [users, setUsers] = useState<Member[]>([]);
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);
    const mention = value.slice(0, cursor).match(/(?<![\p{L}\p{N}_@.+-])@([a-z0-9_.-]{1,50})$/iu);
    const search = focused && !disabled && mention ? mention[1] : null;
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
    return <Stack spacing={2} onBlur={event => {
        if (!event.currentTarget.contains(event.relatedTarget) && !popup.current?.contains(event.relatedTarget)) setFocused(false);
    }}>
        <TextField
            label={label} multiline minRows={4} fullWidth disabled={disabled}
            inputRef={input} helperText="输入 @用户名 搜索并提及用户。"
            onFocus={() => setFocused(true)}
            onSelect={() => setCursor(input.current?.selectionStart ?? 0)}
            slotProps={{ htmlInput: { maxLength: 20000 } }}
            value={value} onChange={(event) => { onChange(event.target.value); setCursor(event.target.selectionStart ?? 0); }}
            onPaste={(event) => {
                const pasted = Array.from(event.clipboardData.files).filter((file) => file.type.startsWith("image/"));
                if (pasted.length > 0) onImagesChange([...images, ...pasted]);
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
                        if (next.length > 20000) { setError("内容最多 20000 个字符。"); return; }
                        onChange(next);
                        setCursor(start + inserted.length);
                        requestAnimationFrame(() => {
                            input.current?.focus();
                            input.current?.setSelectionRange(start + inserted.length, start + inserted.length);
                        });
                    }}>@{user.username}</Button>)}
            </Paper>
        </Popper>}
        {images.map((file, index) => <Box key={index}>
            <ImagePreview file={file} alt={`图片 ${index + 1}`} />
            <Button disabled={disabled} onClick={() => onImagesChange(images.filter((_, i) => i !== index))}>移除图片 {index + 1}</Button>
        </Box>)}
    </Stack>;
}
