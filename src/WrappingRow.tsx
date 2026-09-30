import { ReactNode } from "react";
import { Stack } from "@mui/material";

export default function WrappingRow({ children, spacing = 2, justifyContent }: {
    children: ReactNode;
    spacing?: number;
    justifyContent?: "space-between";
}) {
    return <Stack direction="row" spacing={spacing} useFlexGap sx={{ alignItems: "center", flexWrap: "wrap", justifyContent }}>
        {children}
    </Stack>;
}
