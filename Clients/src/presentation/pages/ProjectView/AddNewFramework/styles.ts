import { SxProps, Theme } from "@mui/material";
import { brand, background, status } from "../../../themes/palette";

export const modalContainerStyle: SxProps<Theme> = {
  position: "absolute",
  top: "50%",
  left: "50%",
  transform: "translate(-50%, -50%)",
  bgcolor: `${background.main}`,
  borderRadius: 3,
  boxShadow: 6,
  maxWidth: 480,
  width: "100%",
  mx: 2,
  maxHeight: "90vh",
  overflow: "auto",
  animation: "scaleIn 0.2s",
  padding: "20px",
};

export const modalHeaderStyle: SxProps<Theme> = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  borderBottom: `1px solid ${status.default.border}`,
  p: 2,
};

export const modalCloseButtonStyle: SxProps<Theme> = {
  "color": `${status.default.text}`,
  "&:hover": { color: "#232B3A", background: "#e3f5e6" },
  "p": 1,
};

export const modalDescriptionStyle: SxProps<Theme> = {
  color: `${status.default.text}`,
  mb: 6,
  fontSize: 14,
  textAlign: "left",
  mt: 6,
};

export const frameworkCardStyle: SxProps<Theme> = {
  background: "linear-gradient(135deg, #ffffff 0%, #f8fafc 100%)",
  border: "1px solid #d0d5dd",
  borderRadius: "4px",
  p: "24px",
  display: "flex",
  flexDirection: "column",
  minHeight: "150px",
};

export const frameworkCardTitleStyle: SxProps<Theme> = {
  fontSize: 13,
  fontWeight: 500,
  color: "#000000",
};

export const frameworkCardAddedStyle: SxProps<Theme> = {
  display: "flex",
  alignItems: "center",
  color: `${brand.primary}`,
  gap: 1,
  fontSize: 14,
};

export const frameworkCardDescriptionStyle: SxProps<Theme> = {
  fontSize: 13,
  color: "#666666",
  mb: "auto",
};

export const frameworkAddedBadgeStyle: SxProps<Theme> = {
  display: "flex",
  alignItems: "center",
  gap: 0.5,
  backgroundColor: "#E6F4EE",
  borderRadius: "4px",
  px: 1.5,
  py: 0.5,
  fontSize: 13,
  fontWeight: 600,
  color: "#13715B",
};

export const modalDoneButtonStyle: SxProps<Theme> = {
  "px": 4,
  "py": 1,
  "fontWeight": 500,
  "borderRadius": 2,
  "boxShadow": "none",
  "fontSize": 15,
  "backgroundColor": `${brand.primary}`,
  "color": `${background.main}`,
  "border": `1px solid ${brand.primary}`,
  "&:hover": {
    backgroundColor: `${brand.primaryDark}`,
  },
};
