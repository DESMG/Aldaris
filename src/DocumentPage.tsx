import { ReactNode } from "react";
import { Box, Button, Paper, Stack, Typography } from "@mui/material";
import { SxProps, Theme } from "@mui/material/styles";

export default function DocumentPage({ title, children, contentSx }: {
    title: string;
    children: ReactNode;
    contentSx?: SxProps<Theme>;
}) {
    return <Paper component="article" variant="outlined" sx={{ p: { xs: 2, sm: 4 }, overflowWrap: "anywhere" }}>
        <Stack spacing={2} sx={contentSx}>
            <Typography component="h1" variant="h4">{title}</Typography>
            {children}
        </Stack>
        <Box sx={{ display: "flex", justifyContent: "center", mt: 4 }}>
            <Button href="/#/" variant="contained">我已知晓</Button>
        </Box>
    </Paper>;
}
