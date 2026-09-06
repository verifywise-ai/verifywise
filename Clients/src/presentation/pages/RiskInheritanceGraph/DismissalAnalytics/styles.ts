/**
 * @fileoverview Dismissal Analytics styles (MUI sx objects).
 */

import { SxProps, Theme } from "@mui/material";

export const sectionSx: SxProps<Theme> = {
  mt: 1,
};

export const blockHeadingSx: SxProps<Theme> = {
  fontSize: (theme) => theme.typography.body2.fontSize,
  fontWeight: 600,
  color: "text.primary",
  mt: 2,
  mb: 0.5,
};

export const captionSx: SxProps<Theme> = {
  fontSize: (theme) => theme.typography.caption.fontSize,
  color: "text.secondary",
  mb: 1,
};

export const tableSx: SxProps<Theme> = {
  mb: 1,
};

export const rateCellSx: SxProps<Theme> = {
  display: "flex",
  alignItems: "center",
  gap: 1,
  minWidth: 140,
};

export const barTrackSx: SxProps<Theme> = {
  flex: 1,
  height: 6,
  borderRadius: 3,
  bgcolor: "grey.200",
  overflow: "hidden",
};

export const barFillSx = (percent: number): SxProps<Theme> => ({
  height: "100%",
  width: `${Math.min(100, Math.max(0, percent))}%`,
  bgcolor: "warning.main",
  borderRadius: 3,
});

export const groupHeaderSx: SxProps<Theme> = {
  fontSize: (theme) => theme.typography.body2.fontSize,
  fontWeight: 600,
  color: "text.primary",
  mt: 1.5,
  mb: 0.5,
};

export const noteItemSx: SxProps<Theme> = {
  py: 1,
  borderBottom: 1,
  borderColor: "divider",
};

export const noteMetaSx: SxProps<Theme> = {
  fontSize: (theme) => theme.typography.caption.fontSize,
  color: "text.secondary",
};

export const noteTextSx: SxProps<Theme> = {
  fontSize: (theme) => theme.typography.body2.fontSize,
  color: "text.primary",
  mt: 0.5,
};

export const stateContainerSx: SxProps<Theme> = {
  display: "flex",
  justifyContent: "center",
  alignItems: "center",
  py: 3,
};

export const stateTextSx: SxProps<Theme> = {
  fontSize: (theme) => theme.typography.body2.fontSize,
  color: "text.secondary",
};
