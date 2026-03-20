// style.ts
import { SxProps, Theme } from "@mui/material";

export const searchBoxStyle =
    (isSearchBarVisible: boolean): SxProps<Theme> =>
    (theme: Theme) => ({
        display: "flex",
        alignItems: "center",
        justifyContent: isSearchBarVisible ? "flex-start" : "center",
        border: `1px solid ${theme.palette.border.dark}`, // adjust as needed
        borderRadius: theme.shape.borderRadius,
        p: isSearchBarVisible ? "6px 8px" : "0",
        bgcolor: "background.main",
        width: isSearchBarVisible ? "50%" : "34px",
        height: "34px",
        transition: "all 0.3s ease",
        mb: 9,
    });

export const inputStyle = (isSearchBarVisible: boolean): SxProps<Theme> => ({
    flex: 1,
    fontSize: "14px",
    opacity: isSearchBarVisible ? 1 : 0,
    transition: "opacity 0.3s ease",
});
