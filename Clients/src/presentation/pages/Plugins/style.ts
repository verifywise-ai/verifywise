import { SxProps, Theme } from "@mui/material";
import { brand, text, background, border as borderPalette } from "../../themes/palette";

// Category sidebar styles - matching main app sidebar design
export const categorySidebar: SxProps<Theme> = {
  width: 200,
  minWidth: 200,
  flexShrink: 0,
};

export const categoryMenuItem = (isSelected: boolean): SxProps<Theme> => ({
  display: "flex",
  alignItems: "center",
  gap: 1.5,
  height: "32px",
  padding: "0 12px",
  borderRadius: "4px",
  cursor: "pointer",
  background: isSelected
    ? "linear-gradient(135deg, #F7F7F7 0%, #F2F2F2 100%)"
    : "transparent",
  border: isSelected ? "1px solid #E8E8E8" : "1px solid transparent",
  "&:hover": {
    background: isSelected
      ? "linear-gradient(135deg, #F7F7F7 0%, #F2F2F2 100%)"
      : "#FAFAFA",
    border: isSelected ? "1px solid #E8E8E8" : "1px solid transparent",
    "& svg": {
      color: `${brand.primary} !important`,
      stroke: `${brand.primary} !important`,
    },
    "& svg path": {
      stroke: `${brand.primary} !important`,
    },
  },
  transition: "all 0.2s ease",
});

export const categoryMenuText = (isSelected: boolean): SxProps<Theme> => ({
  fontSize: "13px",
  fontWeight: isSelected ? 600 : 400,
  color: isSelected ? "#101828" : `${text.icon}`,
});

export const categoryHeader: SxProps<Theme> = {
  padding: "16px 20px",
  backgroundColor: `${background.accent}`,
  border: `1px solid ${borderPalette.dark}`,
  borderRadius: "4px",
};

export const categoryHeaderTitle: SxProps<Theme> = {
  fontSize: "15px",
  fontWeight: 600,
  color: "#101828",
};

export const categoryHeaderDescription: SxProps<Theme> = {
  fontSize: "13px",
  color: `${text.icon}`,
  lineHeight: 1.5,
};

export const pluginCardsGrid: SxProps<Theme> = {
  display: "grid",
  gridTemplateColumns: {
    xs: "1fr",
    md: "repeat(2, 1fr)",
  },
  gap: "16px",
};

export const pluginCardsGridThreeColumn: SxProps<Theme> = {
  display: "grid",
  gridTemplateColumns: {
    xs: "1fr",
    md: "repeat(2, 1fr)",
    lg: "repeat(3, 1fr)",
  },
  gap: "16px",
};

export const pluginCardWrapper: SxProps<Theme> = {
  height: "100%",
};

export const pluginCardWrapperThreeColumn: SxProps<Theme> = {
  height: "100%",
};

export const emptyStateContainer: SxProps<Theme> = {
  textAlign: "center",
  py: 4,
};

export const emptyStateText: SxProps<Theme> = {
  color: `${text.icon}`,
  fontSize: "14px",
};

export const tabPanelStyle: SxProps<Theme> = {
  p: 0,
  pt: 2,
};

// Region collapsible section styles
export const regionHeader = (theme: Theme): SxProps<Theme> => ({
  display: "flex",
  alignItems: "center",
  gap: theme.spacing(3),
  py: theme.spacing(3),
  px: theme.spacing(2),
  mx: theme.spacing(-2),
  borderBottom: `1px solid ${theme.palette.border?.light || "#eaecf0"}`,
  cursor: "pointer",
  borderRadius: theme.shape.borderRadius,
  transition: "all 0.2s ease",
  "&:hover": {
    backgroundColor: theme.palette.action?.hover || "rgba(19, 113, 91, 0.04)",
  },
  "&:hover svg": {
    color: theme.palette.primary.main,
  },
});

export const regionChevron = (theme: Theme, isExpanded: boolean): SxProps<Theme> => ({
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  transition: "transform 0.2s ease",
  transform: isExpanded ? "rotate(0deg)" : "rotate(-90deg)",
  color: theme.palette.text.secondary,
});

export const regionFlagStyle: SxProps<Theme> = {
  fontSize: "22px",
  lineHeight: 1,
};

export const regionNameStyle = (theme: Theme): SxProps<Theme> => ({
  fontSize: "15px",
  fontWeight: 600,
  color: theme.palette.text.primary,
});

export const regionCountStyle = (theme: Theme): SxProps<Theme> => ({
  fontSize: "13px",
  color: theme.palette.text.tertiary || text.muted,
  fontWeight: 500,
});

export const regionContent = (theme: Theme): SxProps<Theme> => ({
  display: "grid",
  gridTemplateColumns: {
    xs: "1fr",
    md: "repeat(2, 1fr)",
    lg: "repeat(3, 1fr)",
  },
  gap: "16px",
  mt: theme.spacing(4),
  mb: theme.spacing(2),
});
