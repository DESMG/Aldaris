import { useEffect, useState } from "react";
import { Alert, Button, LinearProgress, Paper, Stack, Typography } from "@mui/material";
import { api } from "./api";
import type { OperationEvent, User } from "../shared/types";

const labels: Record<OperationEvent["action"], string> = {
    user_created: "创建账户", user_updated: "编辑账户", user_deleted: "删除账户", password_reset: "重置密码",
    issue_created: "创建工单", reply_created: "发表回复", reply_edited: "编辑回复", reply_deleted: "删除回复",
    issue_status: "修改工单状态", issue_priority: "修改优先级", issue_assignees: "修改负责人",
};

export default function OperationEvents({ user }: { user: User }) {
    const [events, setEvents] = useState<OperationEvent[]>([]);
    const [next, setNext] = useState<number | null>(null);
    const [before, setBefore] = useState<number | null>(null);
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(true);
    const [refresh, setRefresh] = useState(0);
    useEffect(() => {
        if (user.role !== "admin") return;
        const controller = new AbortController();
        setLoading(true);
        setError("");
        api(`/api/operations${before === null ? "" : "?before=" + before}`, { signal: controller.signal })
            .then(response => response.json()).then((data: { events: OperationEvent[]; next: number | null }) => {
                if (controller.signal.aborted) return;
                setEvents(current => before === null ? data.events : [...current, ...data.events]);
                setNext(data.next);
            }).catch(error => { if (!controller.signal.aborted) setError(String(error)); })
            .finally(() => { if (!controller.signal.aborted) setLoading(false); });
        return () => controller.abort();
    }, [before, refresh, user.role]);
    if (user.role !== "admin") return <Alert severity="error">只有管理员可以查看操作记录。</Alert>;
    return <Stack spacing={2}>
        <Stack direction="row" spacing={2} useFlexGap sx={{ alignItems: "center", flexWrap: "wrap" }}>
            <Typography variant="h5" component="h1">操作记录</Typography>
            <Button sx={{ ml: "auto" }} disabled={loading} onClick={() => { setBefore(null); setRefresh(value => value + 1); }}>刷新</Button>
        </Stack>
        {error && <Alert severity="error" action={<Button onClick={() => setRefresh(value => value + 1)}>重试</Button>}>{error}</Alert>}
        {loading && <LinearProgress />}
        {!loading && !error && events.length === 0 && <Typography>暂无操作记录。</Typography>}
        {events.map(event => <Paper key={event.id} variant="outlined" sx={{ p: 2, overflowWrap: "anywhere" }}>
            <Typography>{event.actorName} (用户 #{event.actorId}) · {labels[event.action]}</Typography>
            {event.targetId !== null && <Typography variant="body2">目标用户 #{event.targetId}</Typography>}
            <Typography variant="caption" color="text.secondary">{new Date(event.createdAt).toLocaleString("sv-SE")}</Typography>
            {Object.entries(event.details).map(([key, value]) => <Typography key={key} variant="body2">{key}: {String(value)}</Typography>)}
        </Paper>)}
        {next !== null && <Button disabled={loading} onClick={() => setBefore(next)}>加载更早记录</Button>}
    </Stack>;
}
