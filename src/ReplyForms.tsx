import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Alert, Box, Button, Paper, Stack, Typography } from "@mui/material";
import { api, ApiError } from "./api";
import type { Reply } from "./api";
import Content from "./IssueContent";
import Description from "./Description";
import { useDraftGuard } from "./DraftGuard";
import { confirmAction } from "./ConfirmDialog";
import { useTextDraft } from "./useTextDraft";

export function ReplyForm({ issueId, saving, blocked, editing, onReply, onStatus, children }: {
    issueId: number;
    saving: boolean;
    blocked: boolean;
    editing: boolean;
    onReply: (description: string, images: File[], key: string) => Promise<boolean>;
    onStatus: (status: "Open" | "Closed", reason: "completed" | "not_planned", replied: boolean) => Promise<void>;
    children: (hasContent: boolean, submit: (status: "Open" | "Closed", reason: "completed" | "not_planned") => Promise<void>, disabled: boolean) => ReactNode;
}) {
    const draft = useTextDraft(`reply.${issueId}`, { description: "", requestKey: "" }, value =>
        typeof value.description === "string" && typeof value.requestKey === "string");
    const { description } = draft.value;
    const [images, setImages] = useState<File[]>([]);
    const [processing, setProcessing] = useState(false);
    const submitting = useRef(false);
    const mounted = useRef(false);
    useEffect(() => {
        mounted.current = true;
        return () => { mounted.current = false; };
    }, []);
    const submission = useRef<{ description: string; images: File[]; key: string } | null>(null);
    const hasContent = !!description.trim() || images.length > 0;
    const disabled = saving || blocked || editing || processing;
    const clearGuard = useDraftGuard(!!description || images.length > 0 || processing, draft.clear);
    async function submit(status?: "Open" | "Closed", reason: "completed" | "not_planned" = "completed") {
        if (disabled || submitting.current || (!status && !hasContent)) return;
        const historyIndex = window.history.state?.aldarisIndex;
        submitting.current = true;
        try {
            if (hasContent) {
                const text = description;
                if (!submission.current || submission.current.description !== text || submission.current.images.length !== images.length || images.some((file, index) => file !== submission.current!.images[index])) {
                    submission.current = { description: text, images, key: images.length ? crypto.randomUUID() : draft.value.requestKey || crypto.randomUUID() };
                    draft.setValue({ description, requestKey: images.length ? "" : submission.current.key });
                }
                if (!await onReply(text, images, submission.current.key)) return;
                draft.clear();
                if (!mounted.current || window.history.state?.aldarisIndex !== historyIndex) return;
                setImages([]);
                submission.current = null;
                clearGuard();
            }
            if (status) await onStatus(status, reason, hasContent);
        } finally { submitting.current = false; }
    }
    return <Box component="form" sx={{ p: { xs: 2, sm: 3 }, bgcolor: "background.paper", border: "1px solid", borderColor: "divider", borderRadius: 1 }} onSubmit={event => {
        event.preventDefault();
        void submit();
    }}>
        <Stack spacing={2}>
            <Typography component="h2" variant="h6">参与讨论</Typography>
            {draft.error && <Alert severity="error">{draft.error}</Alert>}
            <Description label="回复内容" value={description} onChange={value => { submission.current = null; draft.setValue({ description: value, requestKey: "" }); }} images={images} onImagesChange={files => { submission.current = null; draft.update({ requestKey: "" }); setImages(files); }} disabled={saving} onProcessingChange={setProcessing} />
            <Typography variant="caption" color="text.secondary">文字在本标签页自动保存；刷新后请重新选择未提交的图片。</Typography>
            {editing && <Typography variant="body2" color="text.secondary">请先保存或取消评论编辑，再发表新回复。</Typography>}
            <Box sx={{ display: "flex", flexWrap: "wrap", justifyContent: "flex-end", alignItems: "center", gap: 1 }}>
                {children(hasContent, submit, disabled)}
                <Button type="submit" variant="contained" disabled={disabled || !hasContent}>{saving ? "保存中…" : "发表回复"}</Button>
            </Box>
        </Stack>
    </Box>;
}

export function EditReplyForm({ reply, saving, onSave, onCancel }: {
    reply: Reply;
    saving: boolean;
    onSave: (description: string, retainedImages: string[], images: File[], version: number) => Promise<void>;
    onCancel: () => void;
}) {
    const draft = useTextDraft(`edit-reply.${reply.id}`, { description: reply.description, retainedImages: reply.images, version: reply.version }, value =>
        typeof value.description === "string" && Number.isSafeInteger(value.version) && (value.version as number) > 0 &&
        Array.isArray(value.retainedImages) && value.retainedImages.every(image => typeof image === "string"));
    const { description, retainedImages, version } = draft.value;
    const [clearedImages, setClearedImages] = useState(reply.clearedImages);
    const [images, setImages] = useState<File[]>([]);
    const [processing, setProcessing] = useState(false);
    const [conflict, setConflict] = useState(version !== reply.version);
    const [latest, setLatest] = useState<Reply | null>(null);
    const [reloading, setReloading] = useState(false);
    const [error, setError] = useState("");
    const submitting = useRef(false);
    const dirty = description !== reply.description || retainedImages.join() !== reply.images.join() || images.length > 0 || processing;
    const clearGuard = useDraftGuard(dirty, draft.clear);
    const disabled = saving || processing || reloading || conflict || (!description.trim() && !retainedImages.length && !images.length);
    return <Box component="form" onSubmit={async event => {
        event.preventDefault();
        if (disabled || submitting.current) return;
        submitting.current = true;
        setError("");
        try {
            await onSave(description, retainedImages, images, version);
            draft.clear();
            clearGuard();
        } catch (error) {
            if (error instanceof ApiError && error.status === 409) setConflict(true);
            setError(`编辑评论失败：${String(error)}`);
        } finally { submitting.current = false; }
    }}>
        <Stack spacing={2}>
            {error && <Alert severity="error">{error}</Alert>}
            {draft.error && <Alert severity="error">{draft.error}</Alert>}
            {conflict && <Alert severity="warning" action={<Button color="inherit" disabled={reloading} onClick={async () => {
                setReloading(true);
                try {
                    const response = await api(`/api/replies/${reply.id}`);
                    const data: { reply: Reply } = await response.json();
                    setLatest(data.reply);
                } catch (error) { setError(`重新读取评论失败：${String(error)}`); }
                finally { setReloading(false); }
            }}>载入最新版本</Button>}>这条评论已被更新。你的草稿仍在下方，请先载入最新内容进行比较。</Alert>}
            {latest && <Paper variant="outlined" sx={{ p: 2 }}><Stack spacing={2}>
                <Typography variant="subtitle2">服务器最新版本 (版本 {latest.version})</Typography>
                <Content description={latest.description} images={latest.images} clearedImages={latest.clearedImages} mentions={latest.mentions} />
                <Typography variant="body2">你的草稿将替换服务器最新内容，下方没有的服务器图片不会保留。服务器已删除的旧图片将从草稿移除，请核对后再保存。</Typography>
                <Button disabled={saving || reloading} onClick={() => {
                    draft.setValue({ description, version: latest.version, retainedImages: retainedImages.filter(key => latest.images.includes(key)) });
                    setClearedImages(latest.clearedImages);
                    setConflict(false);
                    setLatest(null);
                    setError("");
                }}>保留草稿并使用此版本</Button>
            </Stack></Paper>}
            <Description label="评论内容" value={description} onChange={value => draft.setValue({ ...draft.value, description: value })} images={images} onImagesChange={setImages} disabled={saving || reloading} retainedCount={retainedImages.length} onProcessingChange={setProcessing} />
            <Typography variant="caption" color="text.secondary">文字在本标签页自动保存；刷新后再次编辑即可恢复，未提交的图片需重新选择。</Typography>
            {retainedImages.map((key, index) => <Stack key={key} spacing={1}>
                <Content description="" images={[key]} clearedImages={clearedImages} />
                <Box><Button disabled={saving || processing} onClick={() => draft.setValue({ ...draft.value, retainedImages: retainedImages.filter(image => image !== key) })}>移除图片 {index + 1}</Button></Box>
            </Stack>)}
            <Stack direction="row" spacing={1}>
                <Button type="submit" variant="contained" disabled={disabled}>保存</Button>
                <Button color="inherit" disabled={saving || processing} onClick={async () => {
                    if (dirty && !await confirmAction("放弃尚未保存的评论修改？")) return;
                    clearGuard();
                    draft.clear();
                    onCancel();
                }}>取消</Button>
            </Stack>
        </Stack>
    </Box>;
}
