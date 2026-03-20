import { createTheme } from "@mui/material/styles";
import {
  text,
  background,
  border,
  status,
  brand,
} from "./palette";

declare module "@mui/material/Button" {
  interface ButtonPropsVariantOverrides {
    group: true;
  }
}

const fontFamilyDefault =
  "'Geist', system-ui, -apple-system, BlinkMacSystemFont, Helvetica, Arial, sans-serif";

const shadow =
  "0px 4px 24px -4px rgba(16, 24, 40, 0.08), 0px 3px 3px -3px rgba(16, 24, 40, 0.03)";

const light = createTheme({
  typography: { fontFamily: fontFamilyDefault, fontSize: 13 },
  spacing: 2,
  palette: {
    primary: { main: brand.primary },
    secondary: { main: "#F4F4F4", dark: "#e3e3e3", contrastText: text.tertiary },
    text: text,
    background: background,
    border: {
      light: border.light,
      dark: border.dark,
    },
    status: {
      info: {
        text: status.info.text,
        main: status.info.text,
        bg: status.info.bg,
        light: status.info.border,
        border: status.info.border,
      },
      success: {
        text: status.success.text,
        main: status.success.text,
        light: status.success.border,
        bg: status.success.bg,
        border: status.success.border,
      },
      error: {
        text: status.error.text,
        main: status.error.text,
        light: status.error.border,
        bg: status.error.bg,
        border: status.error.border,
      },
      warning: {
        text: status.warning.text,
        main: status.warning.text,
        light: status.warning.border,
        bg: status.warning.bg,
        border: status.warning.border,
      },
    },
    other: {
      icon: text.icon,
      line: "#d6d9dd",
      fill: "#e3e3e3",
      grid: "#a2a3a3",
    },
    brand: {
      primary: brand.primary,
      primaryHover: brand.primaryHover,
      primaryLight: brand.primaryLight,
      primaryDark: brand.primaryDark,
    },
    unresolved: { main: "#4e5ba6", light: "#e2eaf7", bg: "#f2f4f7" },
    divider: border.dark,
  },
  shape: {
    borderRadius: 2,
  },
  boxShadow: shadow,
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        body: {},
        // Remove blue focus outline on mouse click; preserve for keyboard navigation
        "*, *::before, *::after": {
          "&:focus:not(:focus-visible)": {
            outline: "none",
          },
        },
        // Remove focus outline on Recharts SVG containers and all SVG elements
        ".recharts-wrapper, .recharts-surface, svg, svg *": {
          outline: "none !important",
        },
      },
    },
    MuiButton: {
      defaultProps: {
        disableElevation: true,
        disableRipple: true,
      },
      styleOverrides: {
        root: ({ theme }) => ({
          variants: [
            {
              props: (props) => props.variant === "group",
              style: {
                color: theme.palette.secondary.contrastText,
                backgroundColor: theme.palette.background.main,
                border: 1,
                borderStyle: "solid",
                borderColor: theme.palette.border.light,
              },
            },
            {
              props: (props) =>
                props.variant === "group" && props.filled === "true",
              style: {
                backgroundColor: theme.palette.secondary.main,
              },
            },
            {
              props: (props) =>
                props.variant === "contained" && props.color === "secondary",
              style: {
                border: 1,
                borderStyle: "solid",
                borderColor: theme.palette.border.light,
              },
            },
          ],
          fontWeight: 400,
          borderRadius: 4,
          boxShadow: "none",
          textTransform: "none",
          "&:focus": {
            outline: "none",
          },
          "&:hover": {
            boxShadow: "none",
          },
        }),
      },
    },
    MuiIconButton: {
      defaultProps: {
        disableRipple: true,
      },
      styleOverrides: {
        root: {
          padding: 4,
          transition: "none",
          "&:hover": {
            backgroundColor: background.fill,
          },
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          marginTop: 4,
          border: 1,
          borderStyle: "solid",
          borderColor: border.light,
          borderRadius: 4,
          boxShadow: shadow,
          backgroundColor: background.main,
        },
      },
    },
    MuiList: {
      styleOverrides: {
        root: {
          padding: 0,
        },
      },
    },
    MuiListItemButton: {
      defaultProps: {
        disableRipple: true,
      },
      styleOverrides: {
        root: {
          transition: "none",
        },
      },
    },
    MuiMenuItem: {
      defaultProps: {
        disableRipple: true,
      },
      styleOverrides: {
        root: {
          borderRadius: 4,
          backgroundColor: "inherit",
          padding: "4px 6px",
          color: text.secondary,
          fontSize: 13,
          margin: 2,
          marginBottom: 0,
          minWidth: 100,
          "&:hover, &.Mui-selected, &.Mui-selected:hover, &.Mui-selected.Mui-focusVisible":
            {
              backgroundColor: background.fill,
            },
        },
      },
    },
    MuiTableCell: {
      styleOverrides: {
        root: {
          borderBottomColor: border.light,
        },
      },
    },
    MuiTableHead: {
      styleOverrides: {
        root: {
          background: `linear-gradient(180deg, ${background.accent} 0%, ${background.hover} 100%)`,
        },
      },
    },
    MuiPagination: {
      styleOverrides: {
        root: {
          backgroundColor: background.main,
          border: 1,
          borderStyle: "solid",
          borderColor: border.light,
          "& button": {
            color: text.tertiary,
            borderRadius: 4,
          },
          "& li:first-of-type button, & li:last-of-type button": {
            border: 1,
            borderStyle: "solid",
            borderColor: border.light,
          },
        },
      },
    },
    MuiPaginationItem: {
      styleOverrides: {
        root: {
          "&:not(.MuiPaginationItem-ellipsis):hover, &.Mui-selected": {
            backgroundColor: background.fill,
          },
        },
      },
    },
    MuiSkeleton: {
      styleOverrides: {
        root: {
          backgroundColor: "#f2f4f7",
        },
      },
    },
    MuiDialog: {
      styleOverrides: {
        paper: {
          backgroundColor: background.modal,
        },
      },
    },
    MuiDrawer: {
      styleOverrides: {
        paper: {
          backgroundColor: background.modal,
        },
      },
    },
    MuiTextField: {
      styleOverrides: {
        root: {
          backgroundColor: background.main,
          "& .MuiOutlinedInput-root": {
            backgroundColor: background.main,
            borderRadius: 2,
            "& .MuiOutlinedInput-notchedOutline": {
              borderColor: border.dark,
              borderWidth: "1px",
            },
            "&:hover .MuiOutlinedInput-notchedOutline": {
              borderColor: border.dark,
            },
            "&.Mui-focused .MuiOutlinedInput-notchedOutline": {
              borderColor: border.dark,
              borderWidth: "1px",
            },
          },
        },
      },
    },
    MuiOutlinedInput: {
      styleOverrides: {
        root: {
          backgroundColor: background.main,
          borderRadius: 2,
          "& .MuiOutlinedInput-notchedOutline": {
            borderColor: border.dark,
            borderWidth: "1px",
          },
          "&:hover .MuiOutlinedInput-notchedOutline": {
            borderColor: border.dark,
          },
          "&.Mui-focused .MuiOutlinedInput-notchedOutline": {
            borderColor: border.dark,
            borderWidth: "1px",
          },
        },
      },
    },
    MuiSelect: {
      styleOverrides: {
        root: {
          backgroundColor: background.main,
        },
      },
    },
    MuiAutocomplete: {
      styleOverrides: {
        inputRoot: {
          backgroundColor: background.main,
        },
      },
    },
    MuiTooltip: {
      styleOverrides: {
        tooltip: {
          fontSize: '13px',
          backgroundColor: "#1F2937",
          padding: '8px 12px',
          borderRadius: '4px',
        },
        arrow: {
          color: "#1F2937",
        },
      },
    },

    MuiButtonBase: {
      defaultProps: {
        disableRipple: true,
      },
    },
    MuiFab: {
      defaultProps: {
        disableRipple: true,
      },
    },
    MuiCheckbox: {
      defaultProps: {
        disableRipple: true,
      },
    },
    MuiButtonGroup: {
      defaultProps: {
        disableRipple: true,
      },
    },
    MuiTab: {
      defaultProps: {
        disableRipple: true,
      },
    },
    MuiToggleButton: {
      defaultProps: {
        disableRipple: true,
      },
    },
    MuiSwitch: {
      defaultProps: {
        disableRipple: true,
      },
    },
    MuiRadio: {
      defaultProps: {
        disableRipple: true,
      },
    },
  },
});

export default light;
