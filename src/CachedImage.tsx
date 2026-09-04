import { useEffect, useState, useSyncExternalStore } from "react";
import { Box } from "@mui/material";
import type { SxProps, Theme } from "@mui/material/styles";
import { cachedImage, getApiSessionGeneration, subscribeApiSession } from "./api";

export default function CachedImage({ src, alt, sx }: { src: string; alt: string; sx?: SxProps<Theme> }) {
    const generation = useSyncExternalStore(subscribeApiSession, getApiSessionGeneration);
    const [image, setImage] = useState<{ src: string; generation: number; objectUrl: string } | null>(null);
    const [error, setError] = useState("");
    useEffect(() => {
        let active = true;
        let objectUrl: string | undefined;
        setError("");
        cachedImage(src).then(blob => {
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
    }, [src, generation]);
    return <Box component="img" src={image?.src === src && image.generation === generation ? image.objectUrl : undefined}
        alt={alt} title={error || undefined} draggable={false} sx={sx} />;
}
