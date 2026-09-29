import { Chip } from "@mui/material";
import type { ChipProps } from "@mui/material";
import type { Issue } from "./api";

export default function IssueStatusChip({ status, stateReason, size }: {
    status: Issue["status"];
    stateReason: Issue["stateReason"];
    size?: ChipProps["size"];
}) {
    return <Chip
        size={size}
        label={status === "Open" ? "打开" : stateReason === "completed" ? "已完成" : "已关闭"}
        color={status === "Open" ? "success" : stateReason === "completed" ? "secondary" : "default"}
        sx={{ "&.MuiChip-colorDefault": { bgcolor: "var(--neutral-bg)", color: "common.white" } }}
    />;
}
