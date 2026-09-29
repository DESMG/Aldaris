import { useEffect, useRef } from "react";
import { confirmAction } from "./ConfirmDialog";

const drafts = new Set<{ current: boolean; discardText?: () => void }>();

export function hasUnsavedDrafts() {
    return [...drafts].some(draft => draft.current);
}

export function discardDraftGuards(discardText = false) {
    for (const draft of drafts) {
        if (discardText) draft.discardText?.();
        draft.current = false;
    }
}

function beforeUnload(event: BeforeUnloadEvent) {
    if (!hasUnsavedDrafts()) return;
    event.preventDefault();
    event.returnValue = "";
}

export async function confirmDraftNavigation() {
    return !hasUnsavedDrafts() || await confirmAction("仍有未提交内容。离开后可在当前浏览器标签页恢复文字草稿；图片、密码和其他未保存内容会丢失。确定离开？");
}

export function useDraftGuard(dirty: boolean, discardText?: () => void) {
    const draft = useRef({ current: dirty, discardText });
    draft.current.current = dirty;
    draft.current.discardText = discardText;
    useEffect(() => {
        const entry = draft.current;
        drafts.add(entry);
        window.addEventListener("beforeunload", beforeUnload);
        return () => {
            drafts.delete(entry);
            if (!drafts.size) window.removeEventListener("beforeunload", beforeUnload);
        };
    }, []);
    return () => { draft.current.current = false; };
}
