import { SxProps, Theme } from "@mui/material";

/**
 * Common style mixins to prevent duplication across components
 */

// Button mixins
export const buttonMixins = {
  primary: (theme: Theme): SxProps<Theme> => ({
    backgroundColor: theme.palette.primary.main,
    border: `1px solid ${theme.palette.primary.main}`,
    color: "#fff",
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.fontSize,
    fontWeight: 400,
    textTransform: "none",
    borderRadius: theme.shape.borderRadius,
    boxShadow: "none",
    "&:hover": {
      backgroundColor: theme.palette.primary.dark || "#10614d",
      boxShadow: "none",
    },
    "&:focus": {
      outline: "none",
    },
  }),

  secondary: (theme: Theme): SxProps<Theme> => ({
    backgroundColor: theme.palette.secondary.main,
    border: `1px solid ${theme.palette.border?.light || "#eaecf0"}`,
    color: theme.palette.secondary.contrastText,
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.fontSize,
    fontWeight: 400,
    textTransform: "none",
    borderRadius: theme.shape.borderRadius,
    boxShadow: "none",
    "&:hover": {
      backgroundColor: theme.palette.secondary.dark,
      boxShadow: "none",
    },
    "&:focus": {
      outline: "none",
    },
  }),

  outlined: (theme: Theme): SxProps<Theme> => ({
    backgroundColor: "transparent",
    border: `1px solid ${theme.palette.border?.light || "#eaecf0"}`,
    color: theme.palette.text.secondary,
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.fontSize,
    fontWeight: 400,
    textTransform: "none",
    borderRadius: theme.shape.borderRadius,
    boxShadow: "none",
    "&:hover": {
      backgroundColor: theme.palette.action?.hover || "#f5f5f5",
      boxShadow: "none",
    },
    "&:focus": {
      outline: "none",
    },
  }),
};

// Card mixins
export const cardMixins = {
  base: (theme: Theme): SxProps<Theme> => ({
    backgroundColor: theme.palette.background.main,
    border: `1px solid ${theme.palette.border?.light || "#eaecf0"}`,
    borderRadius: theme.shape.borderRadius,
    boxShadow: theme.boxShadow,
    padding: theme.spacing(2),
  }),

  stats: (theme: Theme): SxProps<Theme> => ({
    ...cardMixins.base(theme),
    display: "flex",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: theme.spacing(1.25, 3.125),
    minWidth: "300px",
  }),

  interactive: (theme: Theme): SxProps<Theme> => ({
    ...cardMixins.base(theme),
    cursor: "pointer",
    transition: "background-color 0.2s ease-in-out",
    "&:hover": {
      backgroundColor: theme.palette.action?.hover || "#fafafa",
    },
  }),
};

// Modal mixins
export const modalMixins = {
  container: (theme: Theme): SxProps<Theme> => ({
    position: "absolute",
    top: "50%",
    left: "50%",
    transform: "translate(-50%, -50%)",
    backgroundColor: theme.palette.background.main,
    borderRadius: theme.spacing(1.5),
    boxShadow: theme.boxShadow,
    maxWidth: "480px",
    width: "100%",
    margin: theme.spacing(1),
    maxHeight: "90vh",
    overflow: "auto",
    animation: "scaleIn 0.2s",
    padding: theme.spacing(2.5),
  }),

  header: (theme: Theme): SxProps<Theme> => ({
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    borderBottom: `1px solid ${theme.palette.border?.light || "#E5E7EB"}`,
    padding: theme.spacing(1),
  }),

  closeButton: (theme: Theme): SxProps<Theme> => ({
    color: theme.palette.text.tertiary,
    "&:hover": {
      color: theme.palette.text.primary,
      backgroundColor: theme.palette.action?.hover || "#e3f5e6",
    },
    padding: theme.spacing(0.5),
  }),
};

// Table mixins
export const tableMixins = {
  container: (theme: Theme): SxProps<Theme> => ({
    border: `1px solid ${theme.palette.border?.light || "#EEEEEE"}`,
    borderRadius: theme.shape.borderRadius,
    "& td, & th": {
      border: 0,
    },
  }),

  headerCell: (theme: Theme): SxProps<Theme> => ({
    color: theme.palette.text.tertiary,
    fontWeight: 400,
    padding: theme.spacing(1.5, 1.25),
    whiteSpace: "nowrap",
    textTransform: "uppercase",
    backgroundColor: theme.palette.background.accent,
  }),

  bodyCell: (theme: Theme): SxProps<Theme> => ({
    fontSize: theme.typography.fontSize,
    padding: theme.spacing(1.5, 1.25),
    whiteSpace: "nowrap",
    backgroundColor: theme.palette.background.main,
  }),

  hoverableRow: (theme: Theme): SxProps<Theme> => ({
    cursor: "pointer",
    transition: "background-color 0.3s ease-in-out",
    "&:hover td": {
      backgroundColor: theme.palette.action?.hover || "#fafafa",
    },
  }),
};

// Form mixins
export const formMixins = {
  container: (theme: Theme): SxProps<Theme> => ({
    display: "flex",
    flexDirection: "column",
    gap: theme.spacing(2),
    padding: theme.spacing(2),
  }),

  fieldContainer: (theme: Theme): SxProps<Theme> => ({
    display: "flex",
    flexDirection: "column",
    gap: theme.spacing(1),
  }),

  inputField: (theme: Theme): SxProps<Theme> => ({
    "& .MuiOutlinedInput-root": {
      borderRadius: theme.shape.borderRadius,
      "& fieldset": {
        borderColor: theme.palette.border?.light || "#eaecf0",
      },
      "&:hover fieldset": {
        borderColor: theme.palette.border?.dark || "#d0d5dd",
      },
      "&.Mui-focused fieldset": {
        borderColor: theme.palette.primary.main,
      },
    },
  }),
};

// Layout mixins
export const layoutMixins = {
  flexCenter: (): SxProps<Theme> => ({
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  }),

  flexBetween: (): SxProps<Theme> => ({
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
  }),

  flexStart: (): SxProps<Theme> => ({
    display: "flex",
    alignItems: "center",
    justifyContent: "flex-start",
  }),

  fullHeight: (): SxProps<Theme> => ({
    height: "100%",
  }),

  container: (theme: Theme): SxProps<Theme> => ({
    width: "100%",
    padding: theme.spacing(2),
  }),
};

// Icon mixins
export const iconMixins = {
  button: (theme: Theme): SxProps<Theme> => ({
    padding: theme.spacing(0.5),
    transition: "none",
    "&:hover": {
      backgroundColor: theme.palette.background.fill,
    },
    "&:focus": {
      outline: "none",
    },
    "& svg path": {
      stroke: theme.palette.other?.icon || "#667085",
    },
  }),

  standard: (theme: Theme): SxProps<Theme> => ({
    "& svg path": {
      stroke: theme.palette.other?.icon || "#667085",
    },
  }),
};

// Typography mixins
export const typographyMixins = {
  pageTitle: (theme: Theme): SxProps<Theme> => ({
    color: theme.palette.text.primary,
    fontSize: "16px",
    fontWeight: 600,
  }),

  pageDescription: (theme: Theme): SxProps<Theme> => ({
    color: theme.palette.text.secondary,
    fontSize: theme.typography.fontSize,
  }),

  cardTitle: (theme: Theme): SxProps<Theme> => ({
    fontWeight: 500,
    color: theme.palette.text.primary,
    fontSize: "16px",
  }),

  cardDescription: (theme: Theme): SxProps<Theme> => ({
    color: theme.palette.text.tertiary,
    fontSize: "14px",
  }),
};

// Status mixins
export const statusMixins = {
  success: (theme: Theme): SxProps<Theme> => ({
    color: theme.palette.status?.success?.text || "#079455",
    backgroundColor: theme.palette.status?.success?.bg || "#ecfdf3",
    border: `1px solid ${theme.palette.status?.success?.main || "#17b26a"}`,
    borderRadius: theme.shape.borderRadius,
    padding: theme.spacing(0.5, 1),
    fontSize: "12px",
    fontWeight: 500,
  }),

  error: (theme: Theme): SxProps<Theme> => ({
    color: theme.palette.status?.error?.text || "#f04438",
    backgroundColor: theme.palette.status?.error?.bg || "#f9eced",
    border: `1px solid ${theme.palette.status?.error?.border || "#f04438"}`,
    borderRadius: theme.shape.borderRadius,
    padding: theme.spacing(0.5, 1),
    fontSize: "12px",
    fontWeight: 500,
  }),

  warning: (theme: Theme): SxProps<Theme> => ({
    color: theme.palette.status?.warning?.text || "#DC6803",
    backgroundColor: theme.palette.status?.warning?.bg || "#fffcf5",
    border: `1px solid ${theme.palette.status?.warning?.border || "#fec84b"}`,
    borderRadius: theme.shape.borderRadius,
    padding: theme.spacing(0.5, 1),
    fontSize: "12px",
    fontWeight: 500,
  }),

  info: (theme: Theme): SxProps<Theme> => ({
    color: theme.palette.status?.info?.text || theme.palette.text.primary,
    backgroundColor: theme.palette.status?.info?.bg || theme.palette.background.main,
    border: `1px solid ${theme.palette.status?.info?.border || "#d0d5dd"}`,
    borderRadius: theme.shape.borderRadius,
    padding: theme.spacing(0.5, 1),
    fontSize: "12px",
    fontWeight: 500,
  }),
};
