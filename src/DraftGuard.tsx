import { useEffect, useRef } from "react";

const drafts = new Set<{ current: boolean }>();

export function hasUnsavedDrafts() {
    return [...drafts].some(draft => draft.current);
}

export function discardDraftGuards() {
    for (const draft of drafts) draft.current = false;
}

function beforeUnload(event: BeforeUnloadEvent) {
    if (!hasUnsavedDrafts()) return;
    event.preventDefault();
    event.returnValue = "";
}

export function confirmDraftNavigation() {
    return !hasUnsavedDrafts() || window.confirm("仍有未提交的内容。离开后这些内容将丢失，确定离开？");
}

export function useDraftGuard(dirty: boolean) {
    const draft = useRef(dirty);
    draft.current = dirty;
    useEffect(() => {
        drafts.add(draft);
        window.addEventListener("beforeunload", beforeUnload);
        return () => {
            drafts.delete(draft);
            if (!drafts.size) window.removeEventListener("beforeunload", beforeUnload);
        };
    }, []);
    return () => { draft.current = false; };
}
