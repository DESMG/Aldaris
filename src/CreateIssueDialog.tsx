import { useEffect, useRef, useState } from "react";
import { Alert, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, Stack, TextField, useMediaQuery } from "@mui/material";
import { api, assertApiSession, getApiSessionGeneration, navigate } from "./api";
import Description from "./Description";
import { useDraftGuard } from "./DraftGuard";
import { confirmAction } from "./ConfirmDialog";
import { TITLE_MAX_LENGTH } from "../shared/limits";
import { useTextDraft } from "./useTextDraft";

export default function CreateIssueDialog({ origin, onClose }: { origin: DOMRect; onClose: () => void }) {
    const [open, setOpen] = useState(true);
    const reducedMotion = useMediaQuery("(prefers-reduced-motion: reduce)");
    const paper = useRef<HTMLDivElement>(null);
    const animation = useRef<Animation | null>(null);
    const fragments = useRef<HTMLDivElement[]>([]);
    function animate(expanding: boolean) {
        if (reducedMotion) return;
        const element = paper.current!;
        animation.current?.cancel();
        if (!expanding) {
            const bounds = element.getBoundingClientRect();
            const seam = "50% 0%, 54% 15%, 47% 30%, 53% 45%, 46% 60%, 54% 75%, 49% 90%, 50% 100%";
            for (const direction of [-1, 1]) {
                const fragment = element.cloneNode(true) as HTMLDivElement;
                fragment.removeAttribute("id");
                fragment.querySelectorAll("[id]").forEach(node => node.removeAttribute("id"));
                fragment.inert = true;
                fragment.setAttribute("aria-hidden", "true");
                Object.assign(fragment.style, {
                    position: "fixed", left: `${bounds.left}px`, top: `${bounds.top}px`,
                    width: `${bounds.width}px`, height: `${bounds.height}px`, margin: "0",
                    maxWidth: "none", maxHeight: "none", pointerEvents: "none", animation: "none",
                    clipPath: `polygon(${direction < 0 ? "0% 0%, " + seam + ", 0% 100%" : "100% 0%, " + seam + ", 100% 100%"})`,
                    transformOrigin: direction < 0 ? "25% 50%" : "75% 50%",
                });
                element.parentElement!.appendChild(fragment);
                fragments.current.push(fragment);
                fragment.animate([
                    { transform: "translate(0, 0) rotate(0deg)", opacity: 1 },
                    { transform: `translate(${direction * 24}px, 0) rotate(${direction * 8}deg)`, opacity: 1, offset: 0.25 },
                    { opacity: 1, offset: 0.75 },
                    { transform: `translate(${direction * 120}px, ${window.innerHeight - bounds.top + bounds.height}px) rotate(${direction * 45}deg)`, opacity: 0 },
                ], { duration: 1000, easing: "linear", fill: "forwards" });
            }
            element.style.visibility = "hidden";
            return;
        }
        const bounds = element.getBoundingClientRect();
        const collapsedTransform = `translate(${origin.x + origin.width / 2 - bounds.x - bounds.width / 2}px, ${origin.y + origin.height / 2 - bounds.y - bounds.height / 2}px) scale(${origin.width / bounds.width}, ${origin.height / bounds.height})`;
        animation.current = element.animate([
            { transform: collapsedTransform },
            { transform: "none" },
        ], { duration: 500, easing: "cubic-bezier(0.25, 1, 0.5, 1)", fill: "both" });
    }
    const apiSession = getApiSessionGeneration();
    const draft = useTextDraft("create-issue", { title: "", description: "", requestKey: "" }, value =>
        typeof value.title === "string" && typeof value.description === "string" && typeof value.requestKey === "string");
    const { title, description } = draft.value;
    const [images, setImages] = useState<File[]>([]);
    const [saving, setSaving] = useState(false);
    const [processing, setProcessing] = useState(false);
    const [error, setError] = useState("");
    const submitting = useRef(false);
    const mounted = useRef(false);
    useEffect(() => {
        mounted.current = true;
        return () => {
            mounted.current = false;
            animation.current?.cancel();
            fragments.current.forEach(fragment => { fragment.getAnimations().forEach(item => item.cancel()); fragment.remove(); });
            fragments.current = [];
        };
    }, []);
    const submission = useRef<{ title: string; description: string; images: File[]; key: string } | null>(null);
    const dirty = !!title || !!description || images.length > 0 || processing;
    const clearGuard = useDraftGuard(dirty, draft.clear);
    async function close() {
        if (saving || processing || (dirty && !await confirmAction("放弃尚未创建的工单内容？"))) return;
        clearGuard();
        setOpen(false);
    }
    return <Dialog open={open} onClose={close} fullWidth maxWidth="sm" aria-labelledby="create-issue-title"
        transitionDuration={reducedMotion ? 0 : { enter: 500, exit: 1000 }}
        slotProps={{ paper: { ref: paper }, transition: {
            style: { opacity: 1 },
            onEnter: () => animate(true),
            onEntered: () => animation.current?.cancel(),
            onExit: () => animate(false),
            onExited: () => { draft.clear(); onClose(); },
        } }}>
        <Box component="form" onSubmit={async event => {
            event.preventDefault();
            if (!open || !title.trim() || saving || processing || submitting.current) return;
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
                </Stack>
            </DialogContent>
            <DialogActions>
                <Button disabled={saving || processing} onClick={close}>取消</Button>
                <Button type="submit" variant="contained" disabled={!title.trim() || saving || processing}>{saving ? "保存中…" : "创建"}</Button>
            </DialogActions>
        </Box>
    </Dialog>;
}
