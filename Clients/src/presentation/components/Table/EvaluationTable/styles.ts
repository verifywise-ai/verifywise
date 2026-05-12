// Styles for EvaluationTable component
import { palette } from "../../../themes/palette";

export const styles = {
  table: {
    minWidth: 650,
  },
  header: {
    backgroundColor: palette.background.accent,
  },
  row: {
    "&:nth-of-type(odd)": {
      backgroundColor: palette.background.accent,
    },
  },
};

export const paginationStatus = (theme: any) => ({
  paddingX: theme.spacing(2),
  fontSize: 12,
  opacity: 0.7,
});

export const paginationStyle = (theme: any) => ({
  "mt": theme.spacing(6),
  "color": theme.palette.text.secondary,
  "& .MuiSelect-icon": {
    width: "24px",
    height: "fit-content",
  },
  "& .MuiSelect-select": {
    width: theme.spacing(10),
    borderRadius: theme.shape.borderRadius,
    border: `1px solid ${theme.palette.border.light}`,
    padding: theme.spacing(4),
  },
});

export const paginationSelect = (theme: any) => ({
  "ml": theme.spacing(4),
  "mr": theme.spacing(12),
  "minWidth": theme.spacing(20),
  "textAlign": "left",
  "&.Mui-focused > div": {
    backgroundColor: theme.palette.background.main,
  },
});

export const paginationDropdown = (theme: any) => ({
  mt: 0,
  mb: theme.spacing(2),
});

export const emptyData = {
  textAlign: "center" as const,
  padding: "40px 20px",
  border: "none",
  backgroundColor: palette.background.main,
};
