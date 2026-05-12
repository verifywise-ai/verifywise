import { SxProps, Theme } from "@mui/material";

/**
 * Standardized component styles to be used across the application
 * These styles should be preferred over hardcoded inline styles
 */

// Common sizing constants
export const COMPONENT_SIZES = {
  button: {
    small: { height: 28, fontSize: 12 },
    medium: { height: 34, fontSize: 13 },
    large: { height: 40, fontSize: 14 },
  },
  input: {
    small: { height: 32 },
    medium: { height: 40 },
    large: { height: 48 },
  },
  card: {
    padding: {
      small: 12,
      medium: 16,
      large: 24,
    },
  },
} as const;

// Framework tab styles (for ProjectFrameworks component)
export const frameworkStyles = {
  tabContainer: (theme: Theme): SxProps<Theme> => ({
    display: "flex",
    border: `1px solid ${theme.palette.divider}`,
    borderRadius: theme.shape.borderRadius,
    overflow: "hidden",
    height: 43,
    backgroundColor: theme.palette.background.paper,
  }),

  tab:
    (isActive: boolean, isLast: boolean) =>
    (theme: Theme): SxProps<Theme> => ({
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
    }),

  manageButton: (theme: Theme): SxProps<Theme> => ({
    "borderRadius": theme.spacing(1),
    "textTransform": "none",
    "fontWeight": 400,
    "backgroundColor": theme.palette.primary.main,
    "border": `1px solid ${theme.palette.primary.main}`,
    "color": "#fff",
    "fontFamily": theme.typography.fontFamily,
    "fontSize": theme.typography.fontSize,
    "&:hover": {
      backgroundColor: theme.palette.primary.dark || "#10614d",
    },
  }),
};

// Modal styles (standardized across all modals)
export const modalStyles = {
  container: (theme: Theme): SxProps<Theme> => ({
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
  }),

  header: (theme: Theme): SxProps<Theme> => ({
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    borderBottom: `1px solid ${theme.palette.border?.light || "#E5E7EB"}`,
    padding: theme.spacing(1),
    marginBottom: theme.spacing(2),
  }),

  description: (theme: Theme): SxProps<Theme> => ({
    color: theme.palette.text.tertiary,
    marginBottom: theme.spacing(3),
    fontSize: 14,
    textAlign: "left",
  }),

  actions: (theme: Theme): SxProps<Theme> => ({
    display: "flex",
    justifyContent: "flex-end",
    gap: theme.spacing(1),
    marginTop: theme.spacing(2),
  }),
};

// Card styles (standardized for all card components)
export const cardStyles = {
  base: (theme: Theme): SxProps<Theme> => ({
    backgroundColor: theme.palette.background.main,
    border: `1px solid ${theme.palette.border?.dark || "#d0d5dd"}`,
    borderRadius: theme.shape.borderRadius,
    boxShadow: "none",
    padding: theme.spacing(2),
  }),

  stats: (theme: Theme): SxProps<Theme> => ({
    ...cardStyles.base(theme),
    display: "flex",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    width: "100%",
    minWidth: "300px",
    maxWidth: "100%",
    gap: theme.spacing(5),
    padding: theme.spacing(1.25, 3.125),
  }),

  project: (theme: Theme): SxProps<Theme> => ({
    ...cardStyles.base(theme),
    "cursor": "pointer",
    "transition": "all 0.2s ease-in-out",
    "&:hover": {
      backgroundColor: theme.palette.action?.hover || "#fafafa",
      boxShadow: theme.boxShadow,
    },
  }),

  framework: (theme: Theme): SxProps<Theme> => ({
    border: `1.5px solid ${theme.palette.primary.main}`,
    borderRadius: theme.spacing(1),
    backgroundColor: theme.palette.primary.light || "#e3f5e6",
    padding: theme.spacing(2.5),
    transition: "background 0.2s",
  }),
};

// Table styles (standardized for all tables)
export const tableStyles = {
  container: (theme: Theme): SxProps<Theme> => ({
    "border": `1px solid ${theme.palette.border?.light || "#EEEEEE"}`,
    "borderRadius": theme.shape.borderRadius,
    "& td, & th": {
      border: 0,
    },
  }),

  headerRow: (theme: Theme): SxProps<Theme> => ({
    backgroundColor: theme.palette.background.accent,
    textTransform: "uppercase",
    borderBottom: `1px solid ${theme.palette.border?.light || "#EEEEEE"}`,
  }),

  headerCell: (theme: Theme): SxProps<Theme> => ({
    "color": theme.palette.text.tertiary,
    "fontWeight": 400,
    "padding": theme.spacing(1.5, 1.25),
    "whiteSpace": "nowrap",
    "&:not(:last-child)": {
      minWidth: "120px",
      width: "120px",
    },
  }),

  bodyRow: (theme: Theme): SxProps<Theme> => ({
    "backgroundColor": theme.palette.background.main,
    "textTransform": "capitalize",
    "borderBottom": `1px solid ${theme.palette.border?.light || "#EEEEEE"}`,
    "transition": "background-color 0.3s ease-in-out",
    "&:hover td": {
      backgroundColor: theme.palette.action?.hover || "#fafafa",
    },
    "&:hover": {
      cursor: "pointer",
    },
  }),

  bodyCell: (theme: Theme): SxProps<Theme> => ({
    "fontSize": theme.typography.fontSize,
    "padding": theme.spacing(1.5, 1.25),
    "whiteSpace": "nowrap",
    "backgroundColor": theme.palette.background.main,
    "&:not(:last-child)": {
      minWidth: "120px",
      width: "120px",
    },
  }),
};

// Form styles (standardized for all forms)
export const formStyles = {
  container: (theme: Theme): SxProps<Theme> => ({
    display: "flex",
    flexDirection: "column",
    gap: theme.spacing(2),
    padding: theme.spacing(2),
  }),

  fieldGroup: (theme: Theme): SxProps<Theme> => ({
    display: "flex",
    flexDirection: "column",
    gap: theme.spacing(1),
  }),

  inputField: (theme: Theme): SxProps<Theme> => ({
    "& .MuiOutlinedInput-root": {
      "borderRadius": theme.shape.borderRadius,
      "fontSize": theme.typography.fontSize,
      "& fieldset": {
        borderColor: theme.palette.border?.light || "#eaecf0",
      },
      "&:hover fieldset": {
        borderColor: theme.palette.border?.dark || "#d0d5dd",
      },
      "&.Mui-focused fieldset": {
        borderColor: theme.palette.primary.main,
        borderWidth: "1px",
      },
    },
  }),

  selectField: (theme: Theme): SxProps<Theme> => ({
    "& .MuiSelect-select": {
      fontSize: theme.typography.fontSize,
    },
    "& .MuiOutlinedInput-notchedOutline": {
      borderColor: theme.palette.border?.light || "#eaecf0",
    },
    "&:hover .MuiOutlinedInput-notchedOutline": {
      borderColor: theme.palette.border?.dark || "#d0d5dd",
    },
    "&.Mui-focused .MuiOutlinedInput-notchedOutline": {
      borderColor: theme.palette.primary.main,
      borderWidth: "1px",
    },
  }),

  label: (theme: Theme): SxProps<Theme> => ({
    color: theme.palette.text.secondary,
    fontSize: "14px",
    fontWeight: 500,
    marginBottom: theme.spacing(0.5),
  }),

  helperText: (theme: Theme): SxProps<Theme> => ({
    color: theme.palette.text.tertiary,
    fontSize: "12px",
    marginTop: theme.spacing(0.5),
  }),

  errorText: (theme: Theme): SxProps<Theme> => ({
    color: theme.palette.status?.error?.text || "#f04438",
    fontSize: "12px",
    marginTop: theme.spacing(0.5),
  }),
};

// Button styles (standardized button variants)
export const buttonStyles = {
  primary:
    (size: keyof typeof COMPONENT_SIZES.button = "medium") =>
    (theme: Theme): SxProps<Theme> => ({
      ...COMPONENT_SIZES.button[size],
      "backgroundColor": theme.palette.primary.main,
      "border": `1px solid ${theme.palette.primary.main}`,
      "color": "#fff",
      "fontFamily": theme.typography.fontFamily,
      "fontWeight": 400,
      "textTransform": "none",
      "borderRadius": theme.shape.borderRadius,
      "boxShadow": "none",
      "&:hover": {
        backgroundColor: theme.palette.primary.dark || "#10614d",
        boxShadow: "none",
      },
      "&:focus": {
        outline: "none",
      },
    }),

  secondary:
    (size: keyof typeof COMPONENT_SIZES.button = "medium") =>
    (theme: Theme): SxProps<Theme> => ({
      ...COMPONENT_SIZES.button[size],
      "backgroundColor": theme.palette.secondary.main,
      "border": `1px solid ${theme.palette.border?.light || "#eaecf0"}`,
      "color": theme.palette.secondary.contrastText,
      "fontFamily": theme.typography.fontFamily,
      "fontWeight": 400,
      "textTransform": "none",
      "borderRadius": theme.shape.borderRadius,
      "boxShadow": "none",
      "&:hover": {
        backgroundColor: theme.palette.secondary.dark,
        boxShadow: "none",
      },
      "&:focus": {
        outline: "none",
      },
    }),

  outlined:
    (size: keyof typeof COMPONENT_SIZES.button = "medium") =>
    (theme: Theme): SxProps<Theme> => ({
      ...COMPONENT_SIZES.button[size],
      "backgroundColor": "transparent",
      "border": `1px solid ${theme.palette.border?.light || "#eaecf0"}`,
      "color": theme.palette.text.secondary,
      "fontFamily": theme.typography.fontFamily,
      "fontWeight": 400,
      "textTransform": "none",
      "borderRadius": theme.shape.borderRadius,
      "boxShadow": "none",
      "&:hover": {
        backgroundColor: theme.palette.action?.hover || "#f5f5f5",
        boxShadow: "none",
      },
      "&:focus": {
        outline: "none",
      },
    }),

  danger:
    (size: keyof typeof COMPONENT_SIZES.button = "medium") =>
    (theme: Theme): SxProps<Theme> => ({
      ...COMPONENT_SIZES.button[size],
      "backgroundColor": theme.palette.status?.error?.main || "#d32f2f",
      "border": `1px solid ${theme.palette.status?.error?.border || "#f04438"}`,
      "color": "#fff",
      "fontFamily": theme.typography.fontFamily,
      "fontWeight": 400,
      "textTransform": "none",
      "borderRadius": theme.shape.borderRadius,
      "boxShadow": "none",
      "&:hover": {
        backgroundColor: theme.palette.status?.error?.dark || "#932020",
        boxShadow: "none",
      },
      "&:focus": {
        outline: "none",
      },
    }),
};

// Icon styles (standardized icon button styles)
export const iconStyles = {
  button: (theme: Theme): SxProps<Theme> => ({
    "padding": theme.spacing(0.5),
    "transition": "none",
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

  closeButton: (theme: Theme): SxProps<Theme> => ({
    "color": theme.palette.text.tertiary,
    "&:hover": {
      color: theme.palette.text.primary,
      backgroundColor: theme.palette.action?.hover || "#e3f5e6",
    },
    "padding": theme.spacing(0.5),
  }),
};

// Layout styles (common layout patterns)
export const layoutStyles = {
  pageContainer: (theme: Theme): SxProps<Theme> => ({
    width: "100%",
    padding: theme.spacing(2),
  }),

  pageHeader: (theme: Theme): SxProps<Theme> => ({
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: theme.spacing(2),
  }),

  contentContainer: (theme: Theme): SxProps<Theme> => ({
    display: "flex",
    flexDirection: "column",
    gap: theme.spacing(2),
  }),

  flexBetween: (): SxProps<Theme> => ({
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
  }),

  flexCenter: (): SxProps<Theme> => ({
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  }),

  flexStart: (): SxProps<Theme> => ({
    display: "flex",
    alignItems: "center",
    justifyContent: "flex-start",
  }),

  gridContainer: (theme: Theme): SxProps<Theme> => ({
    display: "grid",
    gap: theme.spacing(2),
  }),
};

// Empty state styles
export const emptyStateStyles = {
  container: (theme: Theme): SxProps<Theme> => ({
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
    backgroundColor: "#FFFFFF", // Explicitly ensure white background
  }),

  // Compact version for table placeholders
  tableContainer: (theme: Theme): SxProps<Theme> => ({
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    textAlign: "center",
    padding: theme.spacing(15, 5),
    paddingBottom: theme.spacing(20),
    gap: theme.spacing(10),
    border: "1px solid #EEEEEE",
    borderRadius: "4px",
    minHeight: 200,
    backgroundColor: "#FFFFFF", // Explicitly ensure white background
  }),

  image: (): SxProps<Theme> => ({
    "marginBottom": (theme) => theme.spacing(4),
    "& img": {
      maxWidth: "100%",
      height: "auto",
      objectFit: "contain",
    },
  }),

  description: (theme: Theme): SxProps<Theme> => ({
    marginBottom: theme.spacing(6),
    color: theme.palette.text.secondary,
    fontSize: theme.typography.fontSize,
  }),
};
