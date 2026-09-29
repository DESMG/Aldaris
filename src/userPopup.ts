import type { PopperProps } from "@mui/material";
import type { SxProps, Theme } from "@mui/material/styles";

export const userPopupPlacement: PopperProps["placement"] = "bottom-start";
export const userPopupSx: SxProps<Theme> = { zIndex: theme => theme.zIndex.modal + 1 };
export const userPopupModifiers: PopperProps["modifiers"] = [
    { name: "offset", options: { offset: [0, 4] } },
    { name: "preventOverflow", options: { padding: 8 } },
];
export const USER_POPUP_MAX_HEIGHT = 220;
