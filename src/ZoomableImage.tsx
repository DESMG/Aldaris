import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Box, Button, Modal, Stack, SvgIcon } from "@mui/material";
import type { SxProps, Theme } from "@mui/material/styles";

export default function ZoomableImage({ alt, thumbnailSx, renderImage }: {
    alt: string;
    thumbnailSx: SxProps<Theme>;
    renderImage: (sx: SxProps<Theme>) => ReactNode;
}) {
    const [open, setOpen] = useState(false);
    const [view, setView] = useState({ scale: 1, x: 0, y: 0 });
    const preview = useRef<HTMLDivElement>(null);
    const pointers = useRef(new Map<number, { x: number; y: number }>());
    const dragged = useRef(false);
    useEffect(() => {
        if (!open) return;
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
    }, [open]);
    return <>
        <Box role="button" tabIndex={0}
            aria-label={`放大${alt}`}
            aria-expanded={open}
            onKeyDown={event => { if (event.target === event.currentTarget && (event.key === "Enter" || event.key === " ")) { event.preventDefault(); event.currentTarget.click(); } }}
            onClick={event => {
                event.currentTarget.focus({ preventScroll: true });
                setView({ scale: 1, x: 0, y: 0 });
                pointers.current.clear();
                dragged.current = false;
                setOpen(true);
            }}
            sx={{
                display: "flex", alignItems: "center", justifyContent: "center", border: 0,
                p: 0, background: "transparent", cursor: "zoom-in", alignSelf: "flex-start", maxWidth: "100%", touchAction: "manipulation",
                "&:focus-visible": { outline: "2px solid", outlineColor: "primary.main", outlineOffset: 2 },
            }}>
            {renderImage(thumbnailSx)}
        </Box>
        <Modal open={open} onClose={() => setOpen(false)}
            slotProps={{ backdrop: { sx: { backgroundColor: "rgba(32, 32, 32, 0.8)" } } }}>
            <Box ref={preview} role="dialog" aria-modal="true" aria-label="图片放大预览"
                sx={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 1, p: 2, overflow: "hidden", touchAction: "none" }}>
                <Box onClick={() => { if (!dragged.current) setOpen(false); }}
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
                    display: "flex", alignItems: "center", justifyContent: "center", width: "100%", minHeight: 0,
                    cursor: "grab", userSelect: "none", "&:active": { cursor: "grabbing" },
                }}>
                    {renderImage({
                        display: "block", minWidth: 0, maxWidth: "100%", maxHeight: "calc(100dvh - 88px)", objectFit: "contain",
                        transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})`,
                    })}
                </Box>
                <Stack direction="row" spacing={1} sx={{ position: "relative", zIndex: 1, flexShrink: 0, whiteSpace: "nowrap" }}>
                    {[1.25, 0.8].map(factor => <Button key={factor} variant="outlined"
                        aria-label={factor > 1 ? "放大图片" : "缩小图片"} title={factor > 1 ? "放大图片" : "缩小图片"}
                        disabled={factor > 1 ? view.scale >= 8 : view.scale <= 1}
                        onClick={() => setView(current => {
                            const scale = Math.min(8, Math.max(1, current.scale * factor));
                            return { scale, x: current.x * scale / current.scale, y: current.y * scale / current.scale };
                        })} sx={{ minWidth: 36, px: 0.5 }}>
                        <SvgIcon>
                            <circle cx="10" cy="10" r="6" fill="none" stroke="currentColor" strokeWidth="2" />
                            <path d="M14.5 14.5 21 21M7 10h6" fill="none" stroke="currentColor" strokeWidth="2" />
                            {factor > 1 && <path d="M10 7v6" fill="none" stroke="currentColor" strokeWidth="2" />}
                        </SvgIcon>
                    </Button>)}
                    <Button variant="outlined" onClick={() => setView({ scale: 1, x: 0, y: 0 })}>重置缩放</Button>
                    <Button variant="contained" onClick={() => setOpen(false)}>关闭预览</Button>
                </Stack>
            </Box>
        </Modal>
    </>;
}
