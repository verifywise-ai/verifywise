import { SxProps, Theme } from "@mui/material";
import { brand, background, border, text, accent } from "../../../themes/palette";

export const frameworkCardStyle: SxProps<Theme> = {
  background: `linear-gradient(135deg, ${background.main} 0%, ${background.gradientStop} 100%)`,
  border: `1px solid ${border.dark}`,
  borderRadius: "4px",
  p: 12,
  display: "flex",
  flexDirection: "column",
  minHeight: "150px",
};

export const frameworkCardTitleStyle: SxProps<Theme> = {
  fontSize: 13,
  fontWeight: 500,
  color: `${text.primary}`,
};

export const frameworkCardDescriptionStyle: SxProps<Theme> = {
  fontSize: 13,
  color: `${text.secondary}`,
  mb: "auto",
};

export const frameworkAddedBadgeStyle: SxProps<Theme> = {
  display: "flex",
  alignItems: "center",
  gap: 0.5,
  backgroundColor: `${accent.primary.bg}`,
  borderRadius: "4px",
  px: 2,
  py: 4,
  fontSize: 13,
  fontWeight: 600,
  color: brand.primary,
};
