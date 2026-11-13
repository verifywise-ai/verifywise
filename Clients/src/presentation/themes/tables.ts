import { background, border, brand, text, radiusPx } from "./palette";
import { isClassicUi } from "./uiStyle";

const fontSizes = {
  small: "11px",
  medium: "13px",
  large: "16px",
};

const classicUi = isClassicUi();

/** Row divider: lighter than the hairline border (phase 1 style guide §7). */
const ROW_DIVIDER = classicUi ? "#eaecf0" : "#EFF1F0";

const headerBackground = classicUi
  ? "linear-gradient(180deg, #f9fafb 0%, #f3f4f6 100%)"
  : background.hover;

const frameBorder = `1px solid ${classicUi ? border.dark : border.light}`;

export const tableStyles = {
  primary: {
    frame: {
      "border": frameBorder,
      "borderRadius": radiusPx.sm,
      "& td, & th": {
        border: 0,
      },
    },
    header: {
      backgroundColors: headerBackground,
      row: {
        textTransform: "uppercase",
        borderBottom: frameBorder,
        background: headerBackground,
      },
      cell: {
        "color": text.tertiary,
        "fontSize": classicUi ? fontSizes.medium : fontSizes.small,
        "fontWeight": classicUi ? 400 : 500,
        "letterSpacing": classicUi ? "normal" : "0.07em",
        "padding": classicUi ? "14px 12px" : "9px 14px",
        "whiteSpace": "nowrap",
        "&:not(:lastChild)": {
          minWidth: "120px",
          width: "120px",
        },
      },
    },
    body: {
      backgroundColor: background.main,
      row: {
        "textTransform": "none",
        "borderBottom": `1px solid ${ROW_DIVIDER}`,
        "backgroundColor": background.main,
        "transition": "background-color 0.2s ease-in-out",
        // Phase 1 drops zebra stripes.
        "&:nth-of-type(even)": {
          backgroundColor: classicUi ? "#fafbfc" : background.main,
        },
        "&:last-child": {
          borderBottom: "none", // Prevent double border with table frame
        },
        "&:hover td": {
          // Also defined in singleTheme.tableColors.rowHover
          backgroundColor: classicUi ? "#f5f5f5" : background.alt,
        },
        "&:hover": {
          cursor: "pointer",
        },
      },
      cell: {
        "fontSize": fontSizes.medium,
        "padding": classicUi ? "14px 12px" : "10px 14px",
        "whiteSpace": "nowrap",
        "&:not(:lastChild)": {
          minWidth: "120px",
          width: "120px",
        },
      },
      button: {
        "fontSize": fontSizes.medium,
        "padding": "2px 8px",
        "textTransform": "none",
        "borderRadius": radiusPx.sm,
        "&:hover": {
          opacity: 0.9,
          backgroundColor: brand.primary,
          color: text.inverse,
          border: `1px solid ${brand.primary}`,
          cursor: "pointer",
        },
      },
    },
    footer: {
      cell: {
        fontSize: fontSizes.small,
        whiteSpace: "nowrap",
        opacity: 0.7,
      },
    },
  },
};
