import { useEffect, useRef, useState } from "react";
import { Alert, Box, Button, Stack, Typography } from "@mui/material";
import {
    IMAGE_MAX_BYTES, IMAGE_MAX_COUNT, IMAGE_MAX_DIMENSION, IMAGE_MAX_PIXELS,
    IMAGE_SOURCE_MAX_BYTES, IMAGE_SOURCE_MAX_DIMENSION, IMAGE_SOURCE_MAX_PIXELS,
} from "../shared/limits";
import { inspectImage } from "../shared/image-format";
const supportedTypes = ["image/png", "image/jpeg"];

async function prepareImage(file: File) {
    if (!supportedTypes.includes(file.type)) throw new Error(`${file.name}: 仅支持静态 JPG 和 PNG 图片。`);
    if (!file.size) throw new Error(`${file.name}: 图片为空。`);
    if (file.size > IMAGE_SOURCE_MAX_BYTES) throw new Error(`${file.name}: 图片过大，请先自行缩小。`);
    const bytes = new Uint8Array(await file.arrayBuffer());
    let info;
    try { info = inspectImage(bytes, IMAGE_SOURCE_MAX_DIMENSION, IMAGE_SOURCE_MAX_PIXELS); }
    catch (error) { throw new Error(`${file.name}: ${String(error)}`); }
    if (info.contentType !== file.type) throw new Error(`${file.name}: 图片内容与文件格式不符，请重新导出。`);
    if (info.animated) throw new Error(`${file.name}: 不支持动图，请选择静态 JPG 或 PNG 图片。`);
    let bitmap: ImageBitmap;
    try { bitmap = await createImageBitmap(file); }
    catch { throw new Error(`${file.name}: 无法读取图片，请检查文件是否完整。`); }
    const canvas = document.createElement("canvas");
    try {
        if (!bitmap.width || !bitmap.height || bitmap.width > IMAGE_SOURCE_MAX_DIMENSION || bitmap.height > IMAGE_SOURCE_MAX_DIMENSION
            || bitmap.width * bitmap.height > IMAGE_SOURCE_MAX_PIXELS) {
            throw new Error(`${file.name}: 图片尺寸过大，请缩小后重试。`);
        }
        const context = canvas.getContext("2d");
        if (!context) throw new Error(`${file.name}: 浏览器无法处理图片。`);
        let factor = Math.min(
            1,
            IMAGE_MAX_DIMENSION / bitmap.width,
            IMAGE_MAX_DIMENSION / bitmap.height,
            Math.sqrt(IMAGE_MAX_PIXELS / (bitmap.width * bitmap.height)),
        );
        for (let attempt = 0; attempt < 8; attempt++) {
            canvas.width = Math.max(1, Math.floor(bitmap.width * factor));
            canvas.height = Math.max(1, Math.floor(bitmap.height * factor));
            context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
            const quality = file.type === "image/jpeg" ? Math.max(0.55, 0.88 - attempt * 0.05) : undefined;
            const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, file.type, quality));
            if (!blob || blob.type !== file.type) throw new Error(`${file.name}: 浏览器无法处理此图片，请换用支持 JPG 和 PNG 的浏览器。`);
            if (blob.size <= IMAGE_MAX_BYTES) return new File([blob], file.name.replace(/\.[^.]+$/, "") + (blob.type === "image/png" ? ".png" : ".jpg"), { type: blob.type });
            factor *= 0.8;
        }
        throw new Error(`${file.name}: 图片仍超过 1 MiB，请自行缩小后重试。`);
    } finally { bitmap.close(); canvas.width = 0; canvas.height = 0; }
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
        {failed ? <Alert severity="error">图片 {index + 1} 无法预览，请移除后重新选择。</Alert> : <Box component="img" src={url} alt={`图片 ${index + 1}`} onError={() => setFailed(true)} sx={{ display: "block", maxWidth: "100%", maxHeight: 240, objectFit: "contain" }} />}
        <Typography variant="caption" sx={{ overflowWrap: "anywhere" }}>{file.name} · {(file.size / 1024).toFixed(1)} KiB</Typography>
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
        {images.map((file, index) => <Box key={index}>
            <ImagePreview file={file} index={index} />
            <Button disabled={disabled || processing} onClick={() => onChange(images.filter((_, i) => i !== index))}>移除图片 {index + 1}</Button>
        </Box>)}
    </Stack>;
}
