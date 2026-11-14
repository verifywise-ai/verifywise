import { border as borderPalette, radiusPx, palette as vwPalette } from "../../../themes/palette";
export const GroupStatsCardFrame = {
  display: "flex",
  flexDirection: "row",
  justifyContent: "space-between",
  alignItems: "center",
  width: "100%",
  minWidth: "300px",
  maxWidth: "100%",
  gap: "40px",
  backgroundColor: "white",
  padding: "10px 25px",
  border: `1px solid ${borderPalette.dark}`,
  borderRadius: radiusPx.sm,
  boxShadow: "none",
};

export const GroupStatsCardRate = {
  color: vwPalette.text.secondary,
  fontSize: 26,
};
