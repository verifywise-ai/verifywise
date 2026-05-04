import { Theme } from "@mui/material/styles";

export const taskTableStyles = (theme: Theme) => ({
  archivedText: {
    fontSize: theme.typography.body2.fontSize,
    color: theme.palette.text.disabled,
    fontStyle: "italic",
    px: 1,
  },
});
