import { SxProps, Theme } from "@mui/material";

// Tab styles
export const tabStyle: SxProps<Theme> = {
  textTransform: "none",
  fontWeight: 400,
  alignItems: "flex-start",
  justifyContent: "flex-end",
  padding: "16px 0 7px",
  minHeight: "20px",
};

// Empty state styles
export const noProjectContainerStyle: SxProps<Theme> = (theme) => ({
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  textAlign: "center",
  marginTop: theme.spacing(10),
  marginX: "auto",
  padding: theme.spacing(5),
  border: `1px solid ${theme.palette.divider}`,
  borderRadius: theme.shape.borderRadius,
  width: { xs: "90%", sm: "90%", md: "1056px" },
  maxWidth: "100%",
  height: { xs: "100%", md: "418px" },
  backgroundColor: theme.palette.background.main,
});

export const noProjectImageStyle: SxProps<Theme> = (theme) => ({
  marginBottom: theme.spacing(4),
  "& img": {
    maxWidth: "100%",
    height: "auto",
    objectFit: "contain",
  },
});

export const noProjectDescriptionStyle: SxProps<Theme> = (theme) => ({
  marginBottom: theme.spacing(6),
  color: theme.palette.text.secondary,
  fontSize: theme.typography.fontSize,
});

export const newProjectButtonStyle: SxProps<Theme> = (theme) => ({
  backgroundColor: "#4C7DE7", // TODO: Move this to theme as secondary action color
  border: "1px solid #4C7DE7",
  color: "background.main",
  fontFamily: theme.typography.fontFamily,
  fontSize: theme.typography.fontSize,
  fontWeight: 400,
  textTransform: "none",
  borderRadius: theme.shape.borderRadius,
  boxShadow: "none",
  padding: theme.spacing(1.25, 2),
  width: "119px",
  height: "34px",
  "&:hover": {
    backgroundColor: "#3C6BD6",
    boxShadow: "none",
  },
  "&:focus": {
    outline: "none",
  },
});

// Project section styles
export const projectTitleStyle: SxProps<Theme> = {
  color: "text.primary",
  fontWeight: 600,
  mb: "6px",
  fontSize: 16,
};

export const projectDescriptionStyle: SxProps<Theme> = {
  fontSize: (theme) => theme.typography.fontSize,
  color: "text.secondary",
};

export const tabContainerStyle: SxProps<Theme> = {
  minWidth: "968px",
  overflowX: "auto",
  whiteSpace: "nowrap",
};

export const tabListContainerStyle: SxProps<Theme> = {
  // borderBottom: 1,
  // borderColor: "divider",
};

export const tabListStyle: SxProps<Theme> = {
  minHeight: "20px",
  borderBottom: "none",
  "& .MuiTabs-flexContainer": { columnGap: "34px" },
  "& .MuiTabs-indicator": {
    backgroundColor: "brand.primary",
  },
};