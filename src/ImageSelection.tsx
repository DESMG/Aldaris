import { useEffect, useRef, useState } from "react";
import { Alert, Box, Button, IconButton, Stack, Typography } from "@mui/material";
import { IMAGE_MAX_BYTES, IMAGE_MAX_COUNT } from "../shared/limits";
import ZoomableImage from "./ZoomableImage";

async function prepareImage(file: File) {
    const worker = new Worker(new URL("./image.worker.ts", import.meta.url), { type: "module" });
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
        return await new Promise<File>((resolve, reject) => {
            timeout = setTimeout(() => reject(new Error(`${file.name}: 图片处理超时，请缩小后重试。`)), 120_000);
            worker.onmessage = (event: MessageEvent<{ file: File; error?: never } | { error: string; file?: never }>) => {
                if (event.data.file) resolve(event.data.file);
                else reject(new Error(event.data.error));
            };
            worker.onerror = () => reject(new Error(`${file.name}: 无法启动图片转码，请刷新页面或更新浏览器后重试。`));
            worker.onmessageerror = () => reject(new Error(`${file.name}: 无法读取图片转码结果。`));
            worker.postMessage(file);
        });
    } finally { clearTimeout(timeout); worker.terminate(); }
}

function ImagePreview({ file, index }: { file: File; index: number }) {
    const [url, setUrl] = useState<string>();
    const [failed, setFailed] = useState(false);
    useEffect(() => {
        const objectUrl = URL.createObjectURL(file);
        setUrl(objectUrl);
        setFailed(false);
        return () => URL.revokeObjectURL(objectUrl);
    }, [file]);
    return <Stack spacing={0.5}>
        {failed ? <Alert severity="error" sx={{ minHeight: 120 }}>图片 {index + 1} 无法预览，请移除后重新选择。</Alert> : url && <ZoomableImage key={url}
            alt={`图片 ${index + 1}`}
            thumbnailSx={{ display: "block", width: 160, maxWidth: "100%", height: 120, objectFit: "contain" }}
            renderImage={sx => <Box component="img" src={url} alt={`图片 ${index + 1}`} draggable={false} onError={() => setFailed(true)} sx={sx} />}
        />}
        <Typography variant="caption" color="text.secondary" align="center">{(file.size / 1024).toFixed(1)} KiB</Typography>
    </Stack>;
}

export default function ImageSelection({ images, onChange, disabled, retainedCount = 0, onProcessingChange, pastedFiles }: {
    images: File[];
    onChange: (images: File[]) => void;
    disabled: boolean;
    retainedCount?: number;
    onProcessingChange?: (processing: boolean) => void;
    pastedFiles: File[] | null;
}) {
    const [processing, setProcessing] = useState(false);
    const [error, setError] = useState("");
    const currentImages = useRef(images);
    currentImages.current = images;
    const active = useRef(false);
    const mounted = useRef(true);
    useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
    async function add(files: File[]) {
        if (!files.length || disabled) return;
        if (active.current) { setError("正在处理上一批图片，本次粘贴未添加，请稍后重试。"); return; }
        setError("");
        if (files.length + currentImages.current.length + retainedCount > IMAGE_MAX_COUNT) {
            setError(`每次提交最多 ${IMAGE_MAX_COUNT} 张图片，本次选择未添加。`);
            return;
        }
        active.current = true;
        setProcessing(true);
        onProcessingChange?.(true);
        try {
            const prepared: File[] = [];
            for (const file of files) prepared.push(await prepareImage(file));
            if (mounted.current) onChange([...currentImages.current, ...prepared]);
        } catch (error) {
            if (mounted.current) setError(`${String(error)} 本次选择未添加。`);
        } finally {
            active.current = false;
            if (mounted.current) { setProcessing(false); onProcessingChange?.(false); }
        }
    }
    useEffect(() => { if (pastedFiles) void add(pastedFiles); }, [pastedFiles]);
    return <Stack spacing={1}>
        <Box><Button component="label" disabled={disabled || processing}>选择图片
            <input type="file" accept="image/png,image/jpeg" multiple hidden disabled={disabled || processing} onChange={event => {
                const files = Array.from(event.target.files ?? []);
                event.target.value = "";
                void add(files);
            }} />
        </Button></Box>
        <Typography variant="caption" color="text.secondary">已选 {images.length + retainedCount}/{IMAGE_MAX_COUNT} 张，{retainedCount ? "新图片" : "图片"}合计 {(images.reduce((size, file) => size + file.size, 0) / 1024).toFixed(1)} KiB{retainedCount > 0 && ` (已有 ${retainedCount} 张)`}。</Typography>
        <Typography variant="caption" color="text.secondary">可选择或粘贴静态 JPG、PNG；每张不超过 {IMAGE_MAX_BYTES / 1024 / 1024} MiB，合计不超过 {IMAGE_MAX_BYTES * IMAGE_MAX_COUNT / 1024 / 1024} MiB。</Typography>
        {processing && <Typography variant="body2" role="status">正在处理图片，请稍候…</Typography>}
        {error && <Alert severity="error" onClose={() => setError("")}>{error}</Alert>}
        <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1 }}>
            {images.map((file, index) => <Box key={index} sx={{ position: "relative", width: 160, maxWidth: "100%", p: 0.5, border: 1, borderColor: "divider", borderRadius: 1 }}>
                <ImagePreview file={file} index={index} />
                <IconButton size="small" aria-label={`移除图片 ${index + 1}`} disabled={disabled || processing}
                    onClick={() => onChange(images.filter((_, i) => i !== index))}
                    sx={{ position: "absolute", top: 4, right: 4, width: 24, height: 24, bgcolor: "background.paper", border: 1, borderColor: "divider", "&:hover": { bgcolor: "background.paper" } }}>
                    <Box component="span" aria-hidden="true" sx={{ fontSize: 18, lineHeight: 1 }}>×</Box>
                </IconButton>
            </Box>)}
        </Box>
    </Stack>;
}
