import { useRef, useState } from "react";
import { Alert, Button, Paper, Stack, Typography } from "@mui/material";
import { api, ApiError, assertApiSession, getApiSessionGeneration } from "./api";
import type { Assignee, Issue } from "./api";
import { assignmentAccountRoles, assignmentLabels, assignmentRoles } from "../shared/assignments";
import { ASSIGNEE_MAX_COUNT } from "../shared/limits";
import UserPicker from "./UserPicker";
import { useDraftGuard } from "./DraftGuard";

export default function AssigneeEditor({ issue, onSaved, onCancel, saving, onSavingChange }: {
    issue: Issue;
    onSaved: (changed: Pick<Issue, "assignees" | "assignmentVersion">) => void;
    onCancel: () => void;
    saving: boolean;
    onSavingChange: (saving: boolean) => void;
}) {
    const apiSession = getApiSessionGeneration();
    const [assignees, setAssignees] = useState<Assignee[]>(issue.assignees);
    const [version, setVersion] = useState(issue.assignmentVersion);
    const [conflict, setConflict] = useState(false);
    const [latest, setLatest] = useState<Issue | null>(null);
    const [error, setError] = useState("");
    const updating = useRef(false);
    const signature = (members: Assignee[]) => members.map(member => `${member.role}:${member.id}`).sort().join(",");
    const dirty = signature(assignees) !== signature(issue.assignees);
    const clearGuard = useDraftGuard(dirty);
    const selectedIds = [...new Set(assignees.map(member => member.id))];
    return <Stack spacing={1}>
        {error && <Alert severity="error">{error}</Alert>}
        {conflict && <Alert severity="warning" action={<Button disabled={saving} color="inherit" onClick={async () => {
            onSavingChange(true);
            try {
                const response = await api(`/api/issues/${issue.id}`);
                const data: { issue: Issue } = await response.json();
                setLatest(data.issue);
            } catch (error) { setError(`重新读取负责人失败：${String(error)}`); }
            finally { onSavingChange(false); }
        }}>载入最新版本</Button>}>负责人已被更新，你的选择仍保留。请比较最新指派后再次保存。</Alert>}
        {latest && <Paper variant="outlined" sx={{ p: 1.5 }}><Stack spacing={1}>
            <Typography variant="subtitle2">服务器最新指派</Typography>
            {assignmentRoles.map(role => <Typography key={role} variant="body2">{assignmentLabels[role]}：{latest.assignees.filter(member => member.role === role).map(member => `@${member.username}`).join("、") || "未指派"}</Typography>)}
            <Button disabled={saving} onClick={() => { setVersion(latest.assignmentVersion); setConflict(false); setLatest(null); setError(""); }}>保留我的选择并使用此版本</Button>
        </Stack></Paper>}
        <Typography variant="body2">已指派 {selectedIds.length}/{ASSIGNEE_MAX_COUNT} 人，同一人兼任产品和开发只计一次。</Typography>
        {selectedIds.length > ASSIGNEE_MAX_COUNT && <Alert severity="warning">已有指派超过上限，请先移除负责人，减至 {ASSIGNEE_MAX_COUNT} 人以内再保存。</Alert>}
        {assignmentRoles.map(role => <UserPicker key={role} label={assignmentLabels[role]} value={assignees.filter(member => member.role === role)} accountRole={assignmentAccountRoles[role]} selectedIds={selectedIds}
            onChange={members => {
                const next = [...assignees.filter(member => member.role !== role), ...members.map(member => ({ ...member, role }))];
                const nextCount = new Set(next.map(member => member.id)).size;
                if (nextCount > ASSIGNEE_MAX_COUNT && nextCount > selectedIds.length) {
                    setError(`每个工单最多指派 ${ASSIGNEE_MAX_COUNT} 人，请先移除其他负责人。`);
                    return;
                }
                setAssignees(next);
            }} disabled={saving} />)}
        <Button variant="contained" disabled={saving || conflict || selectedIds.length > ASSIGNEE_MAX_COUNT} onClick={async () => {
            if (updating.current) return;
            updating.current = true;
            onSavingChange(true);
            setError("");
            const body = new FormData();
            for (const member of assignees) body.append(member.role, String(member.id));
            try {
                const response = await api(`/api/issues/${issue.id}/assignees`, { method: "POST", headers: { "If-Match": `"${version}"` }, body, expectedSession: apiSession });
                const changed: Pick<Issue, "assignees" | "assignmentVersion"> = await response.json();
                assertApiSession(apiSession);
                clearGuard();
                onSaved(changed);
            } catch (error) {
                if (error instanceof ApiError && error.status === 409) setConflict(true);
                setError(`指派失败：${String(error)}`);
            } finally { onSavingChange(false); updating.current = false; }
        }}>保存指派</Button>
        <Button variant="text" disabled={saving} onClick={() => {
            if (dirty && !window.confirm("放弃尚未保存的负责人修改？")) return;
            clearGuard();
            onCancel();
        }}>取消</Button>
    </Stack>;
}
