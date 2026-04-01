import { SxProps, Theme } from "@mui/material";
import { layoutStyles } from "../../../themes";
import { brand } from "../../../themes/palette";

export const containerStyle: SxProps<Theme> = {
  width: "100%",
  mt: 2,
};

export const headerContainerStyle: SxProps<Theme> = {
  ...layoutStyles.flexBetween(),
  flexWrap: "wrap",
  gap: 2,
  mb: 2,
};

export const frameworkTabsContainerStyle: SxProps<Theme> = (theme) => ({
  display: "flex",
  border: `1px solid ${theme.palette.divider}`,
  borderRadius: theme.shape.borderRadius,
  overflow: "hidden",
  height: 43,
  backgroundColor: theme.palette.background.paper,
});

export const getFrameworkTabStyle = (isActive: boolean, isLast: boolean): SxProps<Theme> => (theme) => ({
  cursor: "pointer",
  px: 5,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  height: "100%",
  backgroundColor: isActive ? theme.palette.background.paper : theme.palette.action.hover,
  color: theme.palette.text.primary,
  fontFamily: theme.typography.fontFamily,
  fontSize: theme.typography.fontSize,
  borderRight: isLast ? "none" : `1px solid ${theme.palette.divider}`,
  fontWeight: theme.typography.body2?.fontWeight,
  transition: "background 0.2s",
  userSelect: "none",
  width: "142px",
});

export const addButtonStyle: SxProps<Theme> = (theme) => ({
  backgroundColor: theme.palette.primary.main,
  border: `1px solid ${theme.palette.primary.main}`,
  color: "background.main",
  fontFamily: theme.typography.fontFamily,
  fontSize: theme.typography.fontSize,
  fontWeight: 400,
  textTransform: "none",
  borderRadius: theme.spacing(1),
  boxShadow: "none",
  "&:hover": {
    backgroundColor: theme.palette.primary.dark || brand.primaryDark,
    boxShadow: "none",
  },
  "&:focus": {
    outline: "none",
  },
});

export const tabListStyle: SxProps<Theme> = {
  minHeight: "20px",
  "& .MuiTabs-flexContainer": {
    columnGap: "34px",
  },
};

export const modalContainerStyle: SxProps<Theme> = (theme) => ({
  position: "absolute",
  top: "50%",
  left: "50%",
  transform: "translate(-50%, -50%)",
  backgroundColor: theme.palette.background.main,
  borderRadius: theme.spacing(1.5),
  boxShadow: theme.boxShadow,
  maxWidth: 480,
  width: "100%",
  margin: theme.spacing(1),
  maxHeight: "90vh",
  overflow: "auto",
  animation: "scaleIn 0.2s",
  padding: theme.spacing(2.5),
});

export const modalHeaderStyle: SxProps<Theme> = (theme) => ({
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  borderBottom: `1px solid ${theme.palette.border?.light || "#E5E7EB"}`,
  padding: theme.spacing(1),
  marginBottom: theme.spacing(2),
});

export const modalCloseButtonStyle: SxProps<Theme> = (theme) => ({
  color: theme.palette.text.tertiary,
  "&:hover": { 
    color: theme.palette.text.primary, 
    backgroundColor: theme.palette.action?.hover || "#e3f5e6"
  },
  p: 1,
});

export const modalDescriptionStyle: SxProps<Theme> = (theme) => ({
  color: theme.palette.text.tertiary,
  marginBottom: theme.spacing(3),
  fontSize: 14,
  textAlign: "left",
});

export const frameworkCardStyle: SxProps<Theme> = (theme) => ({
  border: `1.5px solid ${theme.palette.primary.main}`,
  borderRadius: theme.spacing(1),
  backgroundColor: theme.palette.primary.light || "#e3f5e6",
  padding: theme.spacing(2.5),
  transition: "background 0.2s",
});

export const frameworkCardTitleStyle: SxProps<Theme> = {
  fontWeight: 500,
  color: "text.primary",
  fontSize: 16,
};

export const frameworkCardAddedStyle: SxProps<Theme> = {
  display: "flex",
  alignItems: "center",
  color: "primary.main",
  gap: 1,
  fontSize: 14,
};

export const frameworkCardDescriptionStyle: SxProps<Theme> = {
  color: "text.tertiary",
  fontSize: 14,
  textAlign: "left",
};

export const modalDoneButtonStyle: SxProps<Theme> = (theme) => ({
  backgroundColor: theme.palette.primary.main,
  border: `1px solid ${theme.palette.primary.main}`,
  color: "background.main",
  fontFamily: theme.typography.fontFamily,
  fontSize: 15,
  fontWeight: 500,
  textTransform: "none",
  borderRadius: theme.shape.borderRadius,
  boxShadow: "none",
  px: 4,
  py: 1,
  "&:hover": {
    backgroundColor: theme.palette.primary.dark || brand.primaryDark,
    boxShadow: "none",
  },
  "&:focus": {
    outline: "none",
  },
});
