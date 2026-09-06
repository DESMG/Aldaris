import { useRef, useState } from "react";
import { getLoginSession } from "./api";

// Callers supply only text and the identifiers needed to submit it safely.
export function useTextDraft<T extends object>(scope: string | null, initial: T) {
    const [key] = useState(() => {
        if (!scope) return null;
        const owner = getLoginSession()?.user.id;
        return owner ? `aldaris.draft.${owner}.${scope}` : null;
    });
    const [draft, setDraft] = useState<{ value: T; revision: string | null; error: string }>(() => {
        try {
            const saved = key ? sessionStorage.getItem(key) : null;
            return saved === null ? { value: initial, revision: null, error: "" } : { ...JSON.parse(saved), error: "" };
        } catch (error) {
            return { value: initial, revision: null, error: `读取文字草稿失败：${String(error)}` };
        }
    });
    const revision = useRef(draft.revision);
    const currentValue = useRef(draft.value);
    function setValue(value: T) {
        currentValue.current = value;
        let error = "";
        const nextRevision = crypto.randomUUID();
        try {
            if (key) sessionStorage.setItem(key, JSON.stringify({ value, revision: nextRevision }));
            revision.current = nextRevision;
        }
        catch (failure) { error = `保存文字草稿失败：${String(failure)}`; }
        setDraft({ value, revision: revision.current, error });
    }
    function update(fields: Partial<T>) {
        setValue({ ...currentValue.current, ...fields });
    }
    function clear() {
        let error = "";
        try {
            const saved = key ? sessionStorage.getItem(key) : null;
            // A response from an unmounted editor must not clear a newer draft.
            if (saved !== null && JSON.parse(saved).revision !== revision.current) return;
            if (key) sessionStorage.removeItem(key);
            revision.current = null;
        }
        catch (failure) { error = `清除文字草稿失败：${String(failure)}`; }
        currentValue.current = initial;
        setDraft({ value: initial, revision: revision.current, error });
    }
    return { ...draft, setValue, update, clear };
}
