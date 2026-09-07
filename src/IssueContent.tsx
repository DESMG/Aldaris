import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Box, Button, Modal, Stack, Tooltip, Typography } from "@mui/material";
import CachedImage from "./CachedImage";
import type { Mention } from "../shared/types";
import { textLinks } from "../shared/links";
import { forgetImage } from "./api";

export default function Content({ description, images, clearedImages = [], mentions = [] }: { description: string; images: string[]; clearedImages?: string[]; mentions?: Mention[] }) {
    const [expandedImage, setExpandedImage] = useState<string | null>(null);
    const [view, setView] = useState({ scale: 1, x: 0, y: 0 });
    const preview = useRef<HTMLDivElement>(null);
    const pointers = useRef(new Map<number, { x: number; y: number }>());
    const dragged = useRef(false);
    useEffect(() => {
        for (const key of clearedImages) forgetImage(`/api/images/${key}`);
        if (expandedImage !== null && clearedImages.includes(expandedImage)) setExpandedImage(null);
    }, [clearedImages, expandedImage]);
    useEffect(() => {
        if (expandedImage === null) return;
        const wheel = (event: WheelEvent) => {
            if (!preview.current || !event.composedPath().includes(preview.current)) return;
            event.preventDefault();
            const unit = event.deltaMode === WheelEvent.DOM_DELTA_LINE ? 16
                : event.deltaMode === WheelEvent.DOM_DELTA_PAGE ? window.innerHeight : 1;
            setView(current => {
                const scale = Math.min(8, Math.max(1, current.scale * Math.exp(-event.deltaY * unit * 0.01)));
                return { scale, x: current.x * scale / current.scale, y: current.y * scale / current.scale };
            });
        };
        document.addEventListener("wheel", wheel, { passive: false, capture: true });
        return () => document.removeEventListener("wheel", wheel, true);
    }, [expandedImage]);
    function plainText(value: string, start: number) {
        let offset = 0;
        const result: ReactNode[] = [];
        for (const mention of mentions.filter(item => item.index >= start && item.index + item.username.length + 1 <= start + value.length).sort((a, b) => a.index - b.index)) {
            const index = mention.index - start;
            const text = value.slice(index, index + mention.username.length + 1);
            const label = mention.deletedAt ? "已删除用户" : `${mention.name} (@${mention.currentUsername}) · ${mention.role === "admin" ? "管理员" : "用户"}`;
            result.push(value.slice(offset, index), <Tooltip key={`mention-${mention.index}`} title={label}>
                <Box component="span" tabIndex={0} sx={{ color: "primary.main", fontWeight: 700 }}>{text}{mention.deletedAt ? " (已删除用户)" : ""}</Box>
            </Tooltip>);
            offset = index + text.length;
        }
        result.push(value.slice(offset));
        return result;
    }
    let offset = 0;
    const text: ReactNode[] = [];
    for (const match of textLinks(description)) {
        const { text: value, url } = match;
        text.push(...plainText(description.slice(offset, match.index), offset));
        const external = url.origin !== window.location.origin;
        text.push(<Box key={`link-${match.index}`} component="a" href={url.href} target={external ? "_blank" : undefined} rel={external ? "noreferrer noopener" : undefined} sx={{ color: "primary.main" }}>{value}</Box>);
        offset = match.index + value.length;
    }
    text.push(...plainText(description.slice(offset), offset));
    return <Stack spacing={2}>
        {description && <Typography sx={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{text}</Typography>}
        {images.map((key, index) => clearedImages.includes(key) ? <Typography key={key} color="text.secondary">[图片已被清理]</Typography> : <Box role="button" tabIndex={0} key={key}
            aria-label={`放大图片 ${index + 1}`}
            aria-expanded={expandedImage === key}
            onKeyDown={event => { if (event.target === event.currentTarget && (event.key === "Enter" || event.key === " ")) { event.preventDefault(); event.currentTarget.click(); } }}
            onClick={event => {
                event.currentTarget.focus({ preventScroll: true });
                setView({ scale: 1, x: 0, y: 0 });
                pointers.current.clear();
                dragged.current = false;
                setExpandedImage(key);
            }}
            sx={{
                display: "flex", alignItems: "center", justifyContent: "center", border: 0,
                p: 0, background: "transparent", cursor: "zoom-in", alignSelf: "flex-start", maxWidth: "100%", touchAction: "manipulation",
                "&:focus-visible": { outline: "2px solid", outlineColor: "primary.main", outlineOffset: 2 },
            }}>
            <CachedImage src={`/api/images/${key}`} alt={`图片 ${index + 1}`} sx={{
                display: "block", maxWidth: "100%", maxHeight: 480, objectFit: "contain",
            }} />
        </Box>)}
        <Modal open={expandedImage !== null && !clearedImages.includes(expandedImage)} onClose={() => setExpandedImage(null)}
            slotProps={{ backdrop: { sx: { backgroundColor: "var(--overlay-backdrop)" } } }}>
            <Box ref={preview} role="dialog" aria-modal="true" aria-label="图片放大预览"
                sx={{ position: "absolute", inset: 0, overflow: "hidden", touchAction: "none" }}>
                <Box onClick={() => { if (!dragged.current) setExpandedImage(null); }}
                    onPointerDown={event => {
                        if (event.button !== 0) return;
                        if (pointers.current.size === 0) dragged.current = false;
                        pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
                        if (pointers.current.size > 1) dragged.current = true;
                        event.currentTarget.setPointerCapture(event.pointerId);
                    }}
                    onPointerMove={event => {
                        const previous = pointers.current.get(event.pointerId);
                        if (!previous) return;
                        const next = { x: event.clientX, y: event.clientY };
                        const other = [...pointers.current.entries()].find(([id]) => id !== event.pointerId)?.[1];
                        pointers.current.set(event.pointerId, next);
                        const dx = next.x - previous.x;
                        const dy = next.y - previous.y;
                        if (dx === 0 && dy === 0) return;
                        dragged.current = true;
                        if (other) {
                            const before = Math.hypot(previous.x - other.x, previous.y - other.y);
                            const after = Math.hypot(next.x - other.x, next.y - other.y);
                            if (before === 0) return;
                            setView(current => {
                                const scale = Math.min(8, Math.max(1, current.scale * after / before));
                                return { scale, x: current.x * scale / current.scale + dx / 2,
                                    y: current.y * scale / current.scale + dy / 2 };
                            });
                        } else {
                            setView(current => ({ ...current, x: current.x + dx, y: current.y + dy }));
                        }
                    }}
                    onPointerUp={event => { pointers.current.delete(event.pointerId); }}
                    onPointerCancel={event => { dragged.current = true; pointers.current.delete(event.pointerId); }}
                    onLostPointerCapture={event => { pointers.current.delete(event.pointerId); }}
                    sx={{
                    display: "flex", alignItems: "center", justifyContent: "center", width: "100%", height: "100%",
                    p: 2, boxSizing: "border-box", cursor: "grab", userSelect: "none", "&:active": { cursor: "grabbing" },
                }}>
                    {expandedImage !== null && <CachedImage src={`/api/images/${expandedImage}`}
                        alt={`图片 ${images.indexOf(expandedImage) + 1}`} sx={{
                            display: "block", minWidth: 0, maxWidth: "100%", maxHeight: "calc(100dvh - 32px)", objectFit: "contain",
                            transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})`,
                        }} />}
                </Box>
                <Stack direction="row" spacing={1} sx={{ position: "absolute", top: 16, right: 16 }}>
                    <Button onClick={() => setView({ scale: 1, x: 0, y: 0 })}>重置缩放</Button>
                    <Button onClick={() => setExpandedImage(null)}>关闭预览</Button>
                </Stack>
            </Box>
        </Modal>
    </Stack>;
}
