import { StrictMode } from "react";

import { colors } from "@mui/material";
import Container from "@mui/material/Container";
import CssBaseline from "@mui/material/CssBaseline";
import Typography from "@mui/material/Typography";
import { createTheme, ThemeProvider } from "@mui/material/styles";

const palette = {
    primary: { main: colors.indigo[500] },
    secondary: { main: colors.blue[500] },
    success: { main: colors.green[500] },
    info: { main: colors.cyan[500] },
    warning: { main: colors.orange[500] },
    error: { main: colors.red[500] },
};

const theme = createTheme({
    cssVariables: {
        colorSchemeSelector: "class",
        cssVarPrefix: "theme",
    },
    colorSchemes: {
        light: { palette: { mode: "light", ...palette } },
        dark: { palette: { mode: "dark", ...palette } },
    },
    typography: {
        fontFamily: [
            "JetBrains Mono",
            "Noto Sans SC",
            "Apple Color Emoji",
            "Segoe UI Emoji",
            "Segoe UI Symbol",
            "Noto Color Emoji",
            "system-ui",
            "-apple-system",
            "emoji",
            "monospace",
        ].join(","),
        fontSize: 16,
    },
});

export default function App() {
    return (
        <StrictMode>
            <ThemeProvider
                theme={theme}
                defaultMode="dark"
                modeStorageKey="theme"
                colorSchemeStorageKey="colorScheme"
                noSsr
            >
                <CssBaseline enableColorScheme />
                <Container component="main" maxWidth="md" sx={{ py: 6 }}>
                    <Typography component="h1" variant="h4" gutterBottom>
                        Aldaris
                    </Typography>
                    <Typography color="text.secondary">Issue Tracker System</Typography>
                </Container>
            </ThemeProvider>
        </StrictMode>
    );
}
