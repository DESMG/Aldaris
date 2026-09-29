import type { ReactNode } from "react";
import { Alert, Button, Paper, Stack, Typography } from "@mui/material";

export default function VersionConflictPanel({ conflict, conflictMessage, loading, onLoad, latest, title, children, onAccept, acceptLabel, acceptDisabled = false }: {
    conflict: boolean;
    conflictMessage: ReactNode;
    loading: boolean;
    onLoad: () => void | Promise<void>;
    latest: boolean;
    title: ReactNode;
    children: ReactNode;
    onAccept: () => void;
    acceptLabel: string;
    acceptDisabled?: boolean;
}) {
    return <>
        {conflict && <Alert severity="warning" action={<Button color="inherit" disabled={loading} onClick={() => void onLoad()}>载入最新版本</Button>}>
            {conflictMessage}
        </Alert>}
        {latest && <Paper variant="outlined" sx={{ p: 2 }}>
            <Stack spacing={2}>
                <Typography variant="subtitle2">{title}</Typography>
                {children}
                <Button disabled={acceptDisabled} onClick={onAccept}>{acceptLabel}</Button>
            </Stack>
        </Paper>}
    </>;
}
