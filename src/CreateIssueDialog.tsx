import { useEffect, useRef, useState } from "react";
import { Alert, Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, Stack, TextField } from "@mui/material";
import { api, assertApiSession, getApiSessionGeneration, navigate } from "./api";
import Description from "./Description";
import { useDraftGuard } from "./DraftGuard";
import { TITLE_MAX_LENGTH } from "../shared/limits";
import { useTextDraft } from "./useTextDraft";

export default function CreateIssueDialog({ onClose }: { onClose: () => void }) {
    const apiSession = getApiSessionGeneration();
    const draft = useTextDraft("create-issue", { title: "", description: "", requestKey: "" });
    const { title, description } = draft.value;
    const [images, setImages] = useState<File[]>([]);
    const [saving, setSaving] = useState(false);
    const [processing, setProcessing] = useState(false);
    const [error, setError] = useState("");
    const submitting = useRef(false);
    const mounted = useRef(false);
    useEffect(() => {
        mounted.current = true;
        return () => { mounted.current = false; };
    }, []);
    const submission = useRef<{ title: string; description: string; images: File[]; key: string } | null>(null);
    const dirty = !!title || !!description || images.length > 0 || processing;
    const clearGuard = useDraftGuard(dirty, draft.clear);
    function close() {
        if (saving || processing || (dirty && !window.confirm("放弃尚未创建的工单内容？"))) return;
        clearGuard();
        draft.clear();
        onClose();
    }
    return <Dialog open onClose={close} fullWidth maxWidth="sm" aria-labelledby="create-issue-title">
        <Box component="form" onSubmit={async event => {
            event.preventDefault();
            if (!title.trim() || saving || processing || submitting.current) return;
            const pageUrl = window.location.href;
            const historyIndex = window.history.state?.aldarisIndex;
            submitting.current = true;
            setSaving(true);
            setError("");
            const issueTitle = title.trim();
            const text = description;
            if (!submission.current || submission.current.title !== issueTitle || submission.current.description !== text || submission.current.images.length !== images.length || images.some((file, index) => file !== submission.current!.images[index])) {
                submission.current = { title: issueTitle, description: text, images, key: images.length ? crypto.randomUUID() : draft.value.requestKey || crypto.randomUUID() };
                draft.setValue({ title, description, requestKey: images.length ? "" : submission.current.key });
            }
            const body = new FormData();
            body.set("title", issueTitle);
            body.set("description", text);
            for (const file of images) body.append("images", file);
            try {
                const response = await api("/api/issues", { method: "POST", headers: { "Idempotency-Key": submission.current.key }, body, expectedSession: apiSession });
                const data: { id: number } = await response.json();
                assertApiSession(apiSession);
                draft.clear();
                if (!mounted.current || window.location.href !== pageUrl || window.history.state?.aldarisIndex !== historyIndex) return;
                clearGuard();
                onClose();
                navigate(`/issues/${data.id}`);
            } catch (error) { if (mounted.current) setError(`创建失败：${String(error)}`); }
            finally { if (mounted.current) setSaving(false); submitting.current = false; }
        }}>
            <DialogTitle id="create-issue-title">新建工单</DialogTitle>
            <DialogContent>
                <Stack spacing={2} sx={{ pt: 1 }}>
                    {error && <Alert severity="error">{error}</Alert>}
                    {draft.error && <Alert severity="error">{draft.error}</Alert>}
                    <TextField label="标题" required autoFocus fullWidth disabled={saving} slotProps={{ htmlInput: { maxLength: TITLE_MAX_LENGTH } }} value={title} onChange={event => { submission.current = null; draft.setValue({ title: event.target.value, description, requestKey: "" }); }} />
                    <Description label="描述" value={description} onChange={value => { submission.current = null; draft.setValue({ title, description: value, requestKey: "" }); }} images={images} onImagesChange={files => { submission.current = null; draft.update({ requestKey: "" }); setImages(files); }} disabled={saving} onProcessingChange={setProcessing} />
                    <Alert severity="info">文字在本标签页自动保存；刷新后请重新选择未提交的图片。</Alert>
                    <Stack direction="row"><Chip label="低优先级" color="info" variant="outlined" /></Stack>
                </Stack>
            </DialogContent>
            <DialogActions>
                <Button disabled={saving || processing} onClick={close}>取消</Button>
                <Button type="submit" variant="contained" disabled={!title.trim() || saving || processing}>{saving ? "保存中…" : "创建"}</Button>
            </DialogActions>
        </Box>
    </Dialog>;
}
