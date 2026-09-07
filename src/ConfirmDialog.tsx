import { useEffect, useSyncExternalStore } from "react";
import { Button, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle } from "@mui/material";

let pending: { message: string; resolve: (confirmed: boolean) => void } | null = null;
const listeners = new Set<() => void>();

function finish(confirmed: boolean) {
    const current = pending;
    pending = null;
    for (const listener of listeners) listener();
    current?.resolve(confirmed);
}

export function confirmAction(message: string): Promise<boolean> {
    finish(false);
    return new Promise(resolve => {
        pending = { message, resolve };
        for (const listener of listeners) listener();
    });
}

export function cancelConfirmation() {
    finish(false);
}

function subscribe(listener: () => void) {
    listeners.add(listener);
    return () => { listeners.delete(listener); };
}

export default function ConfirmDialog() {
    const current = useSyncExternalStore(subscribe, () => pending);
    useEffect(() => {
        const cancel = () => finish(false);
        window.addEventListener("auth-session-changed", cancel);
        return () => {
            window.removeEventListener("auth-session-changed", cancel);
            cancel();
        };
    }, []);
    return <Dialog open={current !== null} onClose={() => finish(false)} fullWidth maxWidth="xs"
        className="confirmation-dialog" aria-labelledby="confirmation-title" aria-describedby="confirmation-message"
        sx={{ zIndex: theme => theme.zIndex.modal + 20 }}>
        <DialogTitle id="confirmation-title">请确认</DialogTitle>
        <DialogContent><DialogContentText id="confirmation-message">{current?.message}</DialogContentText></DialogContent>
        <DialogActions>
            <Button autoFocus color="inherit" onClick={() => finish(false)}>取消</Button>
            <Button variant="contained" onClick={() => finish(true)}>确认</Button>
        </DialogActions>
    </Dialog>;
}
