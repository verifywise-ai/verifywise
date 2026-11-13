import { border as borderPalette, radiusPx } from "../../../themes/palette";
export const smallStatsCardStyle = {
  border: `1px solid ${borderPalette.light}`,
  borderRadius: radiusPx.sm,
  padding: "10px",
  pt: "15px",
  minWidth: 300,
  width: "100%",
  gap: 5,
};

export const smallStatsCardHeader = {
  display: "flex",
  flexDirection: "row",
  justifyContent: "space-between",
  alignItems: "center",
};
