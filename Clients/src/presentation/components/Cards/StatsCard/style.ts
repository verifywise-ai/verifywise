import { Theme } from "@mui/material";
import { cardStyles } from "../../../themes";

export const StatsCardFrame = (theme: Theme) => ({
  ...cardStyles.stats(theme),
});

export const StatsCardRate = (theme: Theme) => ({
  color: theme.palette.text.primary,
  fontSize: 26,
});

export const StatsCardCaption = (theme: Theme) => ({
  color: theme.palette.text.accent,
  fontSize: theme.typography.fontSize,
});
