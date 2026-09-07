import { useRef, useState } from "react";
import { getLoginSession } from "./api";

// Callers supply only text and the identifiers needed to submit it safely.
export function useTextDraft<T extends object>(scope: string | null, initial: T, validate: (value: Record<string, unknown>) => boolean) {
    const [key] = useState(() => {
        if (!scope) return null;
        const owner = getLoginSession()?.user.id;
        return owner ? `aldaris.draft.${owner}.${scope}` : null;
    });
    const [draft, setDraft] = useState<{ value: T; revision: string | null; error: string }>(() => {
        let saved: string | null;
        try {
            saved = key ? sessionStorage.getItem(key) : null;
        } catch (error) {
            return { value: initial, revision: null, error: `读取文字草稿失败：${String(error)}` };
        }
        if (saved === null) return { value: initial, revision: null, error: "" };
        try {
            const parsed = JSON.parse(saved);
            if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed) ||
                Object.keys(parsed).length !== 2 || typeof parsed.revision !== "string" ||
                !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(parsed.revision) ||
                parsed.value === null || typeof parsed.value !== "object" || Array.isArray(parsed.value) ||
                Object.keys(parsed.value).length !== Object.keys(initial).length ||
                !Object.keys(initial).every(field => Object.hasOwn(parsed.value, field)) || !validate(parsed.value)) {
                throw new Error("草稿结构与当前表单不兼容");
            }
            return { value: parsed.value as T, revision: parsed.revision, error: "" };
        } catch {
            try {
                sessionStorage.removeItem(key!);
                return { value: initial, revision: null, error: "" };
            } catch (error) {
                return { value: initial, revision: null, error: `文字草稿格式无效，无法恢复；删除失败：${String(error)}` };
            }
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
