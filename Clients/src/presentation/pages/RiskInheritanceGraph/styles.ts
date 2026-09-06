/**
 * @fileoverview Risk Inheritance Graph styles (MUI sx objects).
 */

import type { CSSProperties } from "react";
import { SxProps, Theme } from "@mui/material";

// The canvas needs an explicit height: ReactFlow does not size itself.
export const pageContainerSx: SxProps<Theme> = {
  display: "flex",
  flexDirection: "column",
  height: "100%",
  gap: 1,
};

export const graphWrapperSx: SxProps<Theme> = {
  position: "relative",
  flex: 1,
  minHeight: 480,
  width: "100%",
  backgroundColor: "#fafafa", // theme.palette.grey[50] equivalent
  borderRadius: 1,
  border: 1,
  borderColor: "divider",
};

export const graphContainerStyle: CSSProperties = {
  width: "100%",
  height: "100%",
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
  maxWidth: 360,
};

// Legend / stats panel styles
export const controlPanelSx: SxProps<Theme> = {
  gap: 1,
  p: 1.5,
  bgcolor: "common.white",
  borderRadius: 1,
  border: 1,
  borderColor: "divider",
  boxShadow: 1,
  minWidth: 200,
  maxWidth: 260,
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
