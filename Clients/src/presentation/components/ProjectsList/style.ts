// style.ts
import { SxProps, Theme } from "@mui/material";
import { background, border as borderPalette } from "../../themes/palette";

export const searchBoxStyle = (
  isSearchBarVisible: boolean
): SxProps<Theme> => ({
  display: "flex",
  alignItems: "center",
  border: `1px solid ${borderPalette.light}`,
  borderRadius: 1,
  p: "4px 6px",
  bgcolor: `${background.main}`,
  width: isSearchBarVisible ? "23.8%" : "40px",
  transition: "all 0.3s ease",
});

export const inputStyle = (isSearchBarVisible: boolean): SxProps<Theme> => ({
  flex: 1,
  fontSize: "14px",
  opacity: isSearchBarVisible ? 1 : 0,
  transition: "opacity 0.3s ease",
});

export const noProjectsTextStyle: SxProps<Theme> = {
  color: "#666",
  textAlign: "left",
  mt: 3,
};

export const projectWrapperStyle = (count: number): SxProps<Theme> => ({
  width: count === 1 ? "50%" : "100%",
  display: "flex",
  flexDirection: "row",
  flexWrap: count <= 3 ? "nowrap" : "wrap",
  justifyContent: count <= 3 ? "space-between" : "flex-start",
  alignItems: "stretch",
  gap: 2.5, // using theme spacing
});

export const vwhomeBodyProjectsGrid: SxProps<Theme> = {
  display: "grid",
  gridTemplateColumns: {
    xs: "1fr",
    sm: "repeat(2, 1fr)",
    md: "repeat(3, 1fr)",
    lg: "repeat(4, 1fr)",
    xl: "repeat(4, 1fr)",
  },
  gap: 2.5,
  width: "100%",
  gridAutoRows: "auto",
};
