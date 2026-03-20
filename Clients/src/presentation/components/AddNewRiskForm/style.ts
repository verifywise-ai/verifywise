import { Theme } from "@mui/material/styles";
import { brand } from "../../themes/palette";

export const getTabStyle = (theme: Theme) => ({
  textTransform: "none" as const,
  fontWeight: 400,
  alignItems: "flex-start",
  justifyContent: "flex-end",
  padding: "16px 0 7px",
  minHeight: "20px",
  "&.Mui-selected": {
    color: theme.palette.primary.main,
  },
});

/**
 * @deprecated Use getTabStyle(theme) instead for theme compliance
 */
export const tabStyle = {
  textTransform: "none",
  fontWeight: 400,
  alignItems: "flex-start",
  justifyContent: "flex-end",
  padding: "16px 0 7px",
  minHeight: "20px",
  "&.Mui-selected": {
    color: `${brand.primary}`,
  },
};
