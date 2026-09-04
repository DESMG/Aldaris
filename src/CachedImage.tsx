import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Alert, Box, Button, Typography } from "@mui/material";
import type { SxProps, Theme } from "@mui/material/styles";
import { cachedImage, getApiSessionGeneration, subscribeApiSession } from "./api";

export default function CachedImage({ src, alt, sx }: { src: string; alt: string; sx?: SxProps<Theme> }) {
    const generation = useSyncExternalStore(subscribeApiSession, getApiSessionGeneration);
    const [image, setImage] = useState<{ src: string; generation: number; objectUrl: string } | null>(null);
    const [error, setError] = useState("");
    const [retry, setRetry] = useState(0);
    const [visible, setVisible] = useState(false);
    const container = useRef<HTMLDivElement>(null);
    useEffect(() => {
        const observer = new IntersectionObserver(entries => {
            if (entries.some(entry => entry.isIntersecting)) {
                setVisible(true);
                observer.disconnect();
            }
        }, { rootMargin: "200px" });
        observer.observe(container.current!);
        return () => observer.disconnect();
    }, []);
    useEffect(() => {
        if (!visible) return;
        let active = true;
        let objectUrl: string | undefined;
        setError("");
        cachedImage(src, { refresh: retry > 0 }).then(blob => {
            if (!active || generation !== getApiSessionGeneration()) return;
            objectUrl = URL.createObjectURL(blob);
            setImage({ src, generation, objectUrl });
        }).catch(error => {
            if (active && generation === getApiSessionGeneration()) setError(`读取图片失败：${String(error)}`);
        });
        return () => {
            active = false;
            if (objectUrl) URL.revokeObjectURL(objectUrl);
        };
    }, [src, generation, visible, retry]);
    const loaded = image?.src === src && image.generation === generation;
    return <Box ref={container} sx={{ maxWidth: "100%", maxHeight: "100%", minWidth: loaded ? 0 : 180, minHeight: loaded ? 0 : 80 }}>
        {error ? <Alert severity="error" action={<Button color="inherit" onClick={event => { event.stopPropagation(); setError(""); setImage(null); setRetry(value => value + 1); }}>重试</Button>}>{error}</Alert>
            : loaded ? <Box component="img" src={image.objectUrl} alt={alt} draggable={false} onError={() => setError("图片无法显示，请重试。")} sx={sx} />
                : <Typography variant="caption" color="text.secondary">{visible ? "正在读取图片…" : "图片将在进入视野时加载"}</Typography>}
    </Box>;
}
