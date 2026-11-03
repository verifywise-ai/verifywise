import { Theme } from "@mui/material/styles";

export const getTabStyle = (theme: Theme) => ({
  "textTransform": "none" as const,
  "fontWeight": 400,
  "alignItems": "flex-start",
  "justifyContent": "flex-end",
  "padding": "16px 0 7px",
  "minHeight": "20px",
  "&.Mui-selected": {
    color: theme.palette.primary.main,
  },
});
