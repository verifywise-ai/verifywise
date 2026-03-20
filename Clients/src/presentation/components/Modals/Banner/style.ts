import { text } from "../../../themes/palette";
export const bannerBoxStyle = {
  position: "fixed",
  bottom: 16,
  right: 16,
  zIndex: 1000,
};

export const bannerPaperStyle = {
  height: "52px",
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  color: `${text.tertiary}`,
};

export const bannerTextStyle = {
  fontSize: "13px",
  color: `${text.tertiary}`,
  whiteSpace: "nowrap",
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  paddingLeft: "7px",
};

export const closeIconStyle = {
  cursor: "pointer",
  marginLeft: "8px",
  marginRight: "8px",
};
