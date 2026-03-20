import { background } from "../../../themes/palette";

export const infoCardStyle = {
  border: `1px solid #d0d5dd`,
  borderRadius: 2,
  background: `linear-gradient(135deg, ${background.main} 0%, ${background.gradientStop} 100%)`,
  minWidth: 228,
  width: "100%",
  padding: "8px 36px 14px 14px",
  position: "relative",
};

export const infoCardTitleStyle = {
  fontSize: 13,
  color: "#8594AC",
  pb: "2px",
  textWrap: "wrap",
};

export const descCardbodyStyle = {
  fontSize: 13,
  color: "#2D3748",
  textAlign: "justify",
};
