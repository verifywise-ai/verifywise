/**
 * @fileoverview AI Dependency Graph Styles
 *
 * Styles for the AI Dependency Graph visualization component.
 * Note: These styles use semantic color tokens that should map to theme values
 * when the theme is available. For static styles, we use CSS-compatible values.
 */

import type { CSSProperties } from "react";
import { SxProps, Theme } from "@mui/material";

// Container styles - uses theme-compatible neutral background
export const graphContainerStyle: CSSProperties = {
  width: "100%",
  height: "100%",
  backgroundColor: "#fafafa", // theme.palette.grey[50] equivalent
};

// Loading state styles
export const loadingContainerSx: SxProps<Theme> = {
  display: "flex",
  flexDirection: "column",
  justifyContent: "center",
  alignItems: "center",
  height: "100%",
  gap: 2,
};

export const loadingTextSx: SxProps<Theme> = {
  fontSize: (theme) => theme.typography.body2.fontSize,
  color: "text.secondary",
};

// Error state styles
export const errorContainerSx: SxProps<Theme> = {
  display: "flex",
  flexDirection: "column",
  justifyContent: "center",
  alignItems: "center",
  height: "100%",
  gap: 2,
  padding: 3,
};

export const errorTextSx: SxProps<Theme> = {
  fontSize: (theme) => theme.typography.body2.fontSize,
  color: "error.main",
  textAlign: "center",
};

// Empty state styles
export const emptyStateContainerSx: SxProps<Theme> = {
  display: "flex",
  flexDirection: "column",
  justifyContent: "center",
  alignItems: "center",
  height: "100%",
  gap: 2,
  bgcolor: "grey.50",
};

export const emptyStateTitleSx: SxProps<Theme> = {
  fontSize: (theme) => theme.typography.body1.fontSize,
  fontWeight: 600,
  color: "text.primary",
};

export const emptyStateDescriptionSx: SxProps<Theme> = {
  fontSize: (theme) => theme.typography.body2.fontSize,
  color: "text.secondary",
  textAlign: "center",
  maxWidth: 300,
};

// Control panel styles
export const controlPanelSx: SxProps<Theme> = {
  gap: 1,
  p: 1.5,
  bgcolor: "common.white",
  borderRadius: 1,
  border: 1,
  borderColor: "divider",
  boxShadow: 1,
  minWidth: 240,
  maxWidth: 280,
};

export const legendLabelSx: SxProps<Theme> = {
  fontSize: (theme) => theme.typography.caption.fontSize,
  fontWeight: 600,
  color: "text.secondary",
  mb: 1,
};

export const legendItemSx: SxProps<Theme> = {
  display: "flex",
  alignItems: "center",
  gap: 1,
  mb: 0.5,
};

export const colorDotSx = (color: string): SxProps<Theme> => ({
  width: 10,
  height: 10,
  borderRadius: "50%",
  backgroundColor: color,
  flexShrink: 0,
});

export const legendTextSx: SxProps<Theme> = {
  fontSize: (theme) => theme.typography.caption.fontSize,
  color: "text.primary",
};

export const statsContainerSx: SxProps<Theme> = {
  pt: 1,
  borderTop: 1,
  borderColor: "divider",
};

export const statsTextSx: SxProps<Theme> = {
  fontSize: (theme) => theme.typography.caption.fontSize,
  color: "text.secondary",
};

// Sidebar styles
export const sidebarContainerSx: SxProps<Theme> = {
  position: "absolute",
  right: 0,
  top: 0,
  bottom: 0,
  width: 320,
  bgcolor: "common.white",
  borderLeft: 1,
  borderColor: "divider",
  boxShadow: 3,
  display: "flex",
  flexDirection: "column",
  zIndex: 10,
};

export const sidebarHeaderSx: SxProps<Theme> = {
  p: 2,
  borderBottom: 1,
  borderColor: "divider",
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
};

export const sidebarTitleSx: SxProps<Theme> = {
  fontSize: (theme) => theme.typography.body2.fontSize,
  fontWeight: 600,
  color: "text.primary",
};

export const sidebarContentSx: SxProps<Theme> = {
  flex: 1,
  overflow: "auto",
  p: 1,
};

export const sidebarSectionSx: SxProps<Theme> = {
  mb: 2,
};

// Table styles for metadata display
export const sidebarTableSx: SxProps<Theme> = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: "1px",
  bgcolor: "divider",
  border: 1,
  borderColor: "divider",
  borderRadius: 1,
  overflow: "hidden",
  mb: 2,
};

export const sidebarTableCellSx: SxProps<Theme> = {
  bgcolor: "common.white",
  p: "8px 12px",
};

export const sidebarTableLabelSx: SxProps<Theme> = {
  fontSize: (theme) => theme.typography.caption.fontSize,
  fontWeight: 600,
  color: "text.secondary",
  textTransform: "uppercase",
  mb: 0.5,
};

export const sidebarTableValueSx: SxProps<Theme> = {
  fontSize: (theme) => theme.typography.body2.fontSize,
  color: "text.primary",
};

export const sidebarLabelSx: SxProps<Theme> = {
  fontSize: (theme) => theme.typography.caption.fontSize,
  fontWeight: 600,
  color: "text.secondary",
  mb: 0.5,
  textTransform: "uppercase",
};

export const sidebarValueSx: SxProps<Theme> = {
  fontSize: (theme) => theme.typography.body2.fontSize,
  color: "text.primary",
};

export const filePathSx: SxProps<Theme> = {
  "fontSize": (theme) => theme.typography.caption.fontSize,
  "color": "primary.main",
  "cursor": "pointer",
  "overflow": "hidden",
  "textOverflow": "ellipsis",
  "whiteSpace": "nowrap",
  "display": "block",
  "&:hover": {
    textDecoration: "underline",
  },
};
