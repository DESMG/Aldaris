import { useEffect, useState } from "react";
import { Autocomplete, TextField } from "@mui/material";
import { cachedJson, getCachedJson } from "./api";
import type { Member } from "./api";

export default function UserPicker({ label, value, onChange, disabled }: {
    label: string;
    value: Member[];
    onChange: (value: Member[]) => void;
    disabled: boolean;
}) {
    const [open, setOpen] = useState(false);
    const [search, setSearch] = useState("");
    const [users, setUsers] = useState<Member[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const query = search.trim();
    const canSearch = /^[a-z0-9_.-]{1,50}$/i.test(query);
    useEffect(() => {
        setUsers([]);
        setError("");
        if (!open || disabled || !canSearch) {
            setLoading(false);
            return;
        }
        const url = `/api/users?search=${encodeURIComponent(query)}`;
        const cached = getCachedJson<{ users: Member[] }>(url);
        if (cached !== undefined) {
            setUsers(cached.users);
            setLoading(false);
            return;
        }
        let active = true;
        setLoading(true);
        const timer = window.setTimeout(() => {
            cachedJson<{ users: Member[] }>(url).then(data => {
                if (active) setUsers(data.users);
            }).catch(error => { if (active) setError(`读取用户失败：${String(error)}`); })
                .finally(() => { if (active) setLoading(false); });
        }, 200);
        return () => { active = false; window.clearTimeout(timer); };
    }, [open, disabled, query, canSearch]);
    return <Autocomplete multiple filterSelectedOptions value={value} options={users} disabled={disabled} loading={loading}
        inputValue={search}
        onOpen={() => setOpen(true)} onClose={() => { setOpen(false); setSearch(""); }}
        onInputChange={(_, input) => setSearch(input)}
        onChange={(_, next) => onChange(next)} filterOptions={options => options}
        getOptionLabel={option => `@${option.username}`}
        isOptionEqualToValue={(option, selected) => option.id === selected.id}
        noOptionsText={error || (canSearch ? "没有匹配的用户" : "请输入用户名搜索")} loadingText="正在读取用户…"
        slotProps={{
            popper: {
                placement: "bottom-start",
                sx: { zIndex: theme => theme.zIndex.modal + 1 },
                modifiers: [{ name: "offset", options: { offset: [0, 4] } }, { name: "preventOverflow", options: { padding: 8 } }],
            },
            listbox: { sx: { maxHeight: 220 } },
        }}
        renderInput={params => <TextField {...params} label={label} error={!!error} helperText={error || "输入用户名搜索，最多显示 5 人；可选择多人，也可留空"} />} />;
}
