import { Chip } from "@mui/material";
import type { ChipProps } from "@mui/material";
import type { Issue } from "./api";

const priorityLabels: Record<Issue["priority"], string> = { Low: "低", Medium: "中", High: "高" };

export function issuePriorityLabel(priority: Issue["priority"]) {
    return priorityLabels[priority];
}

export default function IssuePriorityChip({ priority, size, compact = false, inline = false }: {
    priority: Issue["priority"];
    size?: ChipProps["size"];
    compact?: boolean;
    inline?: boolean;
}) {
    return <Chip
        component={inline ? "span" : "div"}
        size={size}
        variant="outlined"
        label={`${issuePriorityLabel(priority)}${compact ? "" : "优先级"}`}
        color={priority === "High" ? "error" : priority === "Medium" ? "warning" : "info"}
    />;
}
