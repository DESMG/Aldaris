import { useEffect, useRef } from "react";

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

export function confirmDraftNavigation() {
    return !hasUnsavedDrafts() || window.confirm("仍有未提交的内容。已保存的文字草稿可在本标签页恢复；图片、密码及其他未保存内容会丢失，确定离开？");
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
