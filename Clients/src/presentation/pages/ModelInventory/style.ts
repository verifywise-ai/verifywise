/* eslint-disable @typescript-eslint/no-unused-vars */
import { Theme, SxProps } from "@mui/material/styles";
import { palette } from "../../themes/palette";

// Main page styles (index.tsx)
export const mainStackStyle = {
  gap: "20px",
};

export const filterButtonRowStyle = {
  gap: "20px",
};

export const toastFadeStyle = {
  position: "fixed" as const,
  top: 0,
  left: 0,
  right: 0,
  zIndex: 1000,
};

export const statusFilterSelectStyle = {
  width: "200px",
  minHeight: "34px",
};

export const evidenceTypeFilterSelectStyle = {
  width: "200px",
  minHeight: "34px",
};

export const addNewModelButtonStyle = {
  backgroundColor: palette.brand.primary,
  border: `1px solid ${palette.brand.primary}`,
};

// Summary component styles (ModelInventorySummary.tsx)
export const summaryContainerStyle = {
  marginBottom: "20px",
  gap: "20px",
  flexWrap: "wrap" as const,
};

export const summaryCardBoxStyle = (theme: Theme) => ({
  flex: 1,
  minWidth: "200px",
  backgroundColor: "white",
  border: `1px solid ${theme.palette.border.light}`,
  borderRadius: theme.shape.borderRadius,
  padding: "20px",
  display: "flex",
  flexDirection: "column" as const,
  alignItems: "center" as const,
  justifyContent: "center" as const,
  gap: "20px",
});

export const summaryCardNumberStyle = (color: string) => ({
  fontWeight: 700,
  color: color,
  fontSize: "2rem",
  margin: 0,
});

export const summaryCardLabelStyle = (theme: Theme) => ({
  fontSize: 13,
  fontWeight: 400,
  color: theme.palette.text.secondary,
  textTransform: "uppercase" as const,
  margin: 0,
});

// Table component styles (modelInventoryTable.tsx)

// Capabilities chips
export const capabilitiesChipContainerStyle = {
  gap: "8px",
};

export const capabilityChipStyle = {
  fontSize: 11,
  height: "20px",
  backgroundColor: palette.background.hover,
  borderRadius: 12,
  color: palette.text.tertiary,
  margin: 0,
  fontWeight: 500,
};

export const capabilityChipExtraStyle = {
  fontSize: 11,
  height: "20px",
  backgroundColor: palette.background.hover,
  borderRadius: 12,
  color: palette.text.tertiary,
  margin: 0,
  fontWeight: 500,
};

export const tableRowHoverStyle = {
  "&:hover": { backgroundColor: palette.background.hover, cursor: "pointer" },
};

export const tableRowDeletingStyle = {
  opacity: 0.6,
  backgroundColor: palette.background.hover,
};

export const loadingContainerStyle = (_: Theme) => ({
  border: `1px solid ${palette.border.light}`,
  borderRadius: "4px",
  padding: "60px 20px",
  minHeight: 200,
});

export const emptyStateContainerStyle = (_: Theme) => ({
  border: `1px solid ${palette.border.light}`,
  borderRadius: "4px",
  padding: "60px 20px 80px 20px",
  gap: "20px",
  minHeight: 200,
  backgroundColor: palette.background.main,
});

export const emptyStateTextStyle = {
  fontSize: 13,
  color: palette.text.tertiary,
  margin: 0,
  fontWeight: 400,
};

export const tableFooterRowStyle = (theme: Theme) => ({
  "& .MuiTableCell-root.MuiTableCell-footer": {
    paddingX: theme.spacing(8),
    paddingY: theme.spacing(4),
  },
});

export const showingTextCellStyle = (theme: Theme) => ({
  paddingX: theme.spacing(2),
  fontSize: 11,
  opacity: 0.7,
  fontWeight: 400,
});

export const showingTextCellStyleForPolicyLinked = (theme: Theme) => ({
  paddingX: theme.spacing(2),
  fontSize: 11,
  opacity: 0.7,
  fontWeight: 400,

  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
});

export const paginationMenuProps = (theme: Theme) => ({
  keepMounted: true,
  PaperProps: {
    className: "pagination-dropdown",
    sx: {
      mt: 0,
      mb: theme.spacing(2),
    },
  },
  transformOrigin: {
    vertical: "bottom" as const,
    horizontal: "left" as const,
  },
  anchorOrigin: {
    vertical: "top" as const,
    horizontal: "left" as const,
  },
  sx: { mt: theme.spacing(-2) },
});

export const paginationSelectStyle = (theme: Theme) => ({
  ml: theme.spacing(4),
  mr: theme.spacing(12),
  minWidth: theme.spacing(20),
  textAlign: "left" as const,
  "&.Mui-focused > div": {
    backgroundColor: theme.palette.background.main,
  },
});

export const paginationStyle = (theme: Theme) => ({
  mt: theme.spacing(6),
  color: theme.palette.text.secondary,
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

export const searchBoxStyle =
  (isSearchBarVisible: boolean): SxProps<Theme> =>
  (theme: Theme) => ({
    display: "flex",
    alignItems: "center",
    border: `1px solid ${theme.palette.border.dark}`,
    borderRadius: theme.shape.borderRadius,
    p: "1px 1px",
    bgcolor: palette.background.main,
    width: isSearchBarVisible ? "50%" : "auto",
    transition: "all 0.3s ease",
    mb: 9,
    minHeight: "34px",
  });

export const inputStyle = (isSearchBarVisible: boolean): SxProps<Theme> => ({
  flex: 1,
  fontSize: "14px",
  opacity: isSearchBarVisible ? 1 : 0,
  transition: "opacity 0.3s ease",
});
