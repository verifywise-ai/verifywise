import { text } from "../../themes/palette";
export const vwfileHeading = {
  color: `${text.primary}`,
  fontSize: 16,
  fontWeight: 600,
  pb: 5.5,
};
export const filesTablePlaceholder = {
  width: "100%",
  height: "300px",
  minWidth: "100%",
  minHeight: 300,
  borderRadius: 2,
};

export const filesTableFrame = {
  display: "flex",
  flexDirection: "column",
  flex: 1,
  width: "100%",
  maxWidth: "100%",
  position: "relative",
  borderRadius: "4px",
  overflow: "hidden",
  transition: "opacity 0.3s ease-in-out",
};
