/**
 * @fileoverview Risk Inheritance Graph styles (MUI sx objects).
 */

import type { CSSProperties } from "react";
import { SxProps, Theme } from "@mui/material";
import { textStyles } from "../../themes/typography";

// The canvas needs an explicit height: ReactFlow does not size itself.
export const pageContainerSx: SxProps<Theme> = {
  display: "flex",
  flexDirection: "column",
  height: "100%",
  gap: 8, // 16px — section gap
};

export const graphWrapperSx: SxProps<Theme> = {
  position: "relative",
  flex: 1,
  minHeight: 480,
  width: "100%",
  backgroundColor: "background.accent",
  borderRadius: "4px",
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
  ...textStyles.body,
  color: "text.secondary",
};

// Error state styles
export const errorContainerSx: SxProps<Theme> = {
  display: "flex",
  flexDirection: "column",
  justifyContent: "center",
  alignItems: "center",
  height: "100%",
  gap: 2, // 4px — icon + label
  padding: 8, // 16px
};

export const errorTextSx: SxProps<Theme> = {
  ...textStyles.error,
  color: "status.error.text",
  textAlign: "center",
};

// Legend / stats panel styles
export const controlPanelSx: SxProps<Theme> = {
  gap: 4, // 8px — related items
  py: 6, // the guide's card padding: 12px 16px
  px: 8,
  bgcolor: "background.main",
  borderRadius: "4px",
  border: 1,
  borderColor: "divider",
  boxShadow: (theme) => theme.boxShadow,
  minWidth: 200,
  maxWidth: 260,
};

export const legendLabelSx: SxProps<Theme> = {
  ...textStyles.subsectionTitle,
  color: "text.primary",
  mb: 4, // 8px
};

export const legendItemSx: SxProps<Theme> = {
  display: "flex",
  alignItems: "center",
  gap: 2, // 4px — icon + label
  // No mb: the parent Stack owns the rhythm. "Don't use margins between children."
};

export const legendTextSx: SxProps<Theme> = {
  ...textStyles.body,
  color: "text.secondary",
};

/** Map key: one compact strip, same surface as the Link types card. */
export const guidePanelSx: SxProps<Theme> = {
  display: "flex",
  alignItems: "center",
  gap: 5, // 10px between key items
  py: 3, // 6px
  px: 5, // 10px
  bgcolor: "background.main",
  borderRadius: "4px",
  border: 1,
  borderColor: "divider",
  boxShadow: (theme) => theme.boxShadow,
};

export const guideIconSx: SxProps<Theme> = {
  "display": "flex",
  "color": "text.accent",
  "cursor": "help",
  "&:hover, &:focus-visible": { color: "text.secondary" },
};

export const guideItemSx: SxProps<Theme> = {
  display: "flex",
  alignItems: "center",
  gap: 2, // 4px — swatch + label
};

export const guideTextSx: SxProps<Theme> = {
  ...textStyles.bodySmall,
  color: "text.secondary",
};

/** Node-type key: a small box drawn with the same 2px coloured border as the node. */
export const nodeSwatchSx = (color: string): SxProps<Theme> => ({
  width: 10,
  height: 10,
  flexShrink: 0,
  border: `2px solid ${color}`,
  borderRadius: "2px",
});

export const statsContainerSx: SxProps<Theme> = {
  pt: 4, // 8px
  borderTop: 1,
  borderColor: "divider",
};

export const statsTextSx: SxProps<Theme> = {
  ...textStyles.caption,
  color: "text.accent",
};
