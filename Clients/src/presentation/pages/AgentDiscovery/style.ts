import { Theme } from "@mui/material/styles";
import { brand, background, border as borderPalette } from "../../themes/palette";

export const agentMainStack = {
  gap: "16px",
};

export const agentToastContainer = {
  position: "fixed" as const,
  top: 0,
  left: 0,
  right: 0,
  zIndex: 1000,
};

export const addAgentButton = {
  backgroundColor: `${brand.primary}`,
  border: `1px solid ${brand.primary}`,
  gap: "8px",
};

export const syncButton = {
  border: `1px solid ${borderPalette.dark}`,
  gap: "8px",
};

export const statusCardsContainer = {
  minWidth: "fit-content",
  width: { xs: "100%", sm: "fit-content" },
  height: "100%",
  display: "flex",
  flexDirection: { xs: "column", sm: "row" },
  gap: "16px",
  overflow: "auto",
};

export const statusCardTile = {
  paddingY: { xs: "10px", sm: "15px" },
  paddingX: { xs: "15px", sm: "30px" },
  textAlign: "center",
  fontWeight: 600,
  position: "relative",
  cursor: "default",
  minWidth: { xs: "120px", sm: "140px" },
  width: { xs: "120px", sm: "140px" },
  backgroundColor: `${background.main}`,
  border: `1px solid ${borderPalette.dark}`,
  borderRadius: 2,
};

export const statusCardKey = {
  fontSize: 13,
};

export const statusCardValue = {
  fontSize: 28,
  fontWeight: 800,
};

// Permission category chip
export const permissionChip = {
  fontSize: 11,
  height: "20px",
  backgroundColor: `${background.surface}`,
  borderRadius: 4,
  color: "#666",
  margin: 0,
  fontWeight: 500,
};

// Pagination & footer
export const agentFooterRow = (theme: Theme) => ({
  "& .MuiTableCell-root.MuiTableCell-footer": {
    paddingX: theme.spacing(8),
    paddingY: theme.spacing(4),
  },
});

export const agentShowingText = (theme: Theme) => ({
  paddingX: theme.spacing(2),
  fontSize: 11,
  opacity: 0.7,
  fontWeight: 400,
  whiteSpace: "nowrap" as const,
});

export const agentPaginationMenu = (theme: Theme) => ({
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

export const agentPaginationSelect = (theme: Theme) => ({
  ml: theme.spacing(4),
  mr: theme.spacing(12),
  minWidth: theme.spacing(20),
  textAlign: "left" as const,
  "&.Mui-focused > div": {
    backgroundColor: theme.palette.background.main,
  },
});

export const agentPagination = (theme: Theme) => ({
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
