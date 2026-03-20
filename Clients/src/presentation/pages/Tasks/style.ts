// style.ts for Tasks page
import { SxProps, Theme } from "@mui/material";
import { background, border as borderPalette } from "../../themes/palette";

export const searchBoxStyle: SxProps<Theme> = {
  display: "flex",
  alignItems: "center",
  border: `1px solid ${borderPalette.light}`,
  borderRadius: 1,
  p: "4px 6px",
  bgcolor: `${background.main}`,
  flex: 1,
  mr: 2,
  height: "34px",
};

export const searchInputStyle: SxProps<Theme> = {
  flex: 1,
  fontSize: "14px",
};

// Style for toggle label text (My Tasks, Include Archived)
export const toggleLabelStyle: SxProps<Theme> = {
  fontSize: "13px",
  fontWeight: 500,
};

// Style for toggle container stack
export const toggleContainerStyle: SxProps<Theme> = {
  flexDirection: "row",
  alignItems: "center",
  gap: "8px",
};