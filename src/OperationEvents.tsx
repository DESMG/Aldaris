import { useEffect, useState } from "react";
import { Alert, Button, LinearProgress, Paper, Stack, Typography } from "@mui/material";
import { api } from "./api";
import type { OperationEvent, User } from "../shared/types";

const labels: Record<OperationEvent["action"], string> = {
    user_created: "创建账户", user_updated: "编辑账户", user_deleted: "删除账户", password_reset: "重置密码",
    issue_created: "创建工单", reply_created: "发表回复", reply_edited: "编辑回复", reply_deleted: "删除回复",
    issue_status: "修改工单状态", issue_priority: "修改优先级", issue_assignees: "修改负责人",
};

function describe(event: OperationEvent) {
    switch (event.action) {
        case "user_created": return [
            `账户：${event.details.name} (@${event.details.username})`,
            `角色：${event.details.role === "admin" ? "管理员" : "用户"}`,
        ];
        case "user_updated": return [
            ...(event.details.previousName === event.details.name ? [] : [`昵称：${event.details.previousName} → ${event.details.name}`]),
            ...(event.details.previousUsername === event.details.username ? [] : [`用户名：@${event.details.previousUsername} → @${event.details.username}`]),
        ];
        case "user_deleted": return [`账户：${event.details.name} (@${event.details.username})`];
        case "password_reset": return "self" in event.details
            ? [`账户：用户 #${event.details.userId}`, "修改方式：本人修改"]
            : [
                `账户：${event.details.name} (@${event.details.username})`,
                "修改方式：管理员重置",
                ...(event.details.previousName === event.details.name ? [] : [`昵称：${event.details.previousName} → ${event.details.name}`]),
                ...(event.details.previousUsername === event.details.username ? [] : [`用户名：@${event.details.previousUsername} → @${event.details.username}`]),
            ];
        case "issue_created": return [`工单：#${event.details.resourceId}`];
        case "reply_created": return [`评论：#${event.details.resourceId}`];
        case "reply_edited": return [`工单：#${event.details.issueId}`, `评论：#${event.details.replyId}`];
        case "reply_deleted": return [`工单：#${event.details.issueId}`, `评论：#${event.details.replyId}`];
        case "issue_status": return [`工单：#${event.details.issueId}`, `状态：${event.details.value === "Open" ? "打开" : "已关闭"}`];
        case "issue_priority": return [`工单：#${event.details.issueId}`, `优先级：${{ Low: "低", Medium: "中", High: "高" }[event.details.value]}`];
        case "issue_assignees": return [`工单：#${event.details.issueId}`];
    }
    event satisfies never;
    throw new Error("操作记录包含未支持的操作类型。");
}

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
            {describe(event).map(line => <Typography key={line} variant="body2">{line}</Typography>)}
        </Paper>)}
        {next !== null && <Button disabled={loading} onClick={() => setBefore(next)}>加载更早记录</Button>}
    </Stack>;
}
