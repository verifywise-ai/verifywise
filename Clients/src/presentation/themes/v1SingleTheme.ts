/**
 * This file has similar use as our main theme files, but it is temporary, with purpose of gathering
 * all the similar values, merging them and then adding them to the main theme files
 */

import { alertStyles } from "./alerts";
import { tableStyles } from "./tables";
import { brand, button as buttonTokens } from "./palette";

const textColors = {
  theme: "#0f604d",
  error: "#DB504A",
};

const effects = {
  rippleEffect: false,
};

const shadowEffect = {
  NoShadow: "none",
  primary: "0px 4px 24px -4px rgba(16, 24, 40, 0.08), 0px 3px 3px -3px rgba(16, 24, 40, 0.03)",
};

const fontSizes = {
  small: "11px",
  medium: "13px",
  large: "16px",
};

// Standardized button sizes
const buttonSizes = {
  small: {
    height: 28,
    fontSize: "12px",
    padding: "6px 12px",
    minHeight: 28,
  },
  medium: {
    height: 32,
    fontSize: "13px",
    padding: "8px 16px",
    minHeight: 32,
  },
  large: {
    height: 40,
    fontSize: "14px",
    padding: "10px 20px",
    minHeight: 40,
  },
};

// Primary and secondary button colors come from the design tokens.
const primaryButton = buttonTokens.primary;
const secondaryButton = buttonTokens.secondary;

// Standardized color palette (success, warning, error, info)
const colors = {
  success: "#059669",
  successHover: "#047857",
  warning: "#D97706",
  warningHover: "#B45309",
  error: "#DB504A",
  errorHover: "#B91C1C",
  info: "#3B82F6",
  infoHover: "#2563EB",
};

// Flash indicator colors for table row updates
const flashColors = {
  background: "rgba(5, 150, 105, 0.1)",
  backgroundHover: "rgba(5, 150, 105, 0.15)",
};

// Table colors for consistent styling
const tableColors = {
  rowHover: "#f5f5f5",
  rowAlternate: "#fafbfc",
  sortedColumn: "#f5f5f5",
  sortedColumnFirst: "#e8e8e8",
};

const buttons = {
  // Primary buttons - main actions
  primary: {
    contained: {
      ...buttonSizes.medium,
      "backgroundColor": primaryButton.contained.bg.default,
      "color": primaryButton.contained.text.default,
      "boxShadow": "none",
      "textTransform": "inherit",
      "borderRadius": "4px",
      "border": "none",
      "fontWeight": 500,
      "transition": "all 0.2s ease",
      "&:hover": {
        backgroundColor: primaryButton.contained.bg.hover,
        boxShadow: "none",
      },
      "&.Mui-disabled": {
        backgroundColor: primaryButton.contained.bg.disabled,
        color: primaryButton.contained.text.disabled,
      },
    },
    outlined: {
      ...buttonSizes.medium,
      "backgroundColor": "transparent",
      "color": primaryButton.outlined.text.default,
      "border": `1px solid ${primaryButton.outlined.border.default}`,
      "boxShadow": "none",
      "textTransform": "inherit",
      "borderRadius": "4px",
      "fontWeight": 500,
      "transition": "all 0.2s ease",
      "&:hover": {
        backgroundColor: `${primaryButton.outlined.text.default}08`,
        borderColor: primaryButton.outlined.border.hover,
        boxShadow: "none",
      },
      "&.Mui-disabled": {
        borderColor: primaryButton.outlined.border.disabled,
        color: primaryButton.outlined.text.disabled,
      },
    },
    text: {
      ...buttonSizes.medium,
      "backgroundColor": "transparent",
      "color": primaryButton.text.text.default,
      "border": "none",
      "boxShadow": "none",
      "textTransform": "inherit",
      "borderRadius": "4px",
      "fontWeight": 500,
      "transition": "all 0.2s ease",
      "&:hover": {
        backgroundColor: `${primaryButton.text.text.default}08`,
        boxShadow: "none",
      },
      "&.Mui-disabled": {
        color: primaryButton.text.text.disabled,
      },
    },
  },
  // Secondary buttons - utility actions
  secondary: {
    contained: {
      ...buttonSizes.medium,
      "backgroundColor": secondaryButton.contained.bg.default,
      "color": secondaryButton.contained.text.default,
      "boxShadow": "none",
      "textTransform": "inherit",
      "borderRadius": "4px",
      "border": "none",
      "fontWeight": 500,
      "transition": "all 0.2s ease",
      "&:hover": {
        backgroundColor: secondaryButton.contained.bg.hover,
        boxShadow: "none",
      },
      "&.Mui-disabled": {
        backgroundColor: secondaryButton.contained.bg.disabled,
        color: secondaryButton.contained.text.disabled,
      },
    },
    outlined: {
      ...buttonSizes.medium,
      "backgroundColor": "transparent",
      "color": secondaryButton.outlined.text.default,
      "border": `1px solid ${secondaryButton.outlined.border.default}`,
      "boxShadow": "none",
      "textTransform": "inherit",
      "borderRadius": "4px",
      "fontWeight": 500,
      "transition": "all 0.2s ease",
      "&:hover": {
        backgroundColor: `${secondaryButton.outlined.bg.hover}`,
        borderColor: secondaryButton.outlined.border.hover,
      },
    },
    text: {
      ...buttonSizes.medium,
      "backgroundColor": "transparent",
      "color": secondaryButton.text.text.default,
      "border": "none",
      "boxShadow": "none",
      "textTransform": "inherit",
      "borderRadius": "4px",
      "fontWeight": 500,
      "transition": "all 0.2s ease",
      "&:hover": {
        backgroundColor: `${secondaryButton.text.text.default}08`,
      },
    },
  },
  // Success buttons
  success: {
    contained: {
      ...buttonSizes.medium,
      "backgroundColor": colors.success,
      "color": "#fff",
      "boxShadow": "none",
      "textTransform": "inherit",
      "borderRadius": "4px",
      "border": "none",
      "fontWeight": 500,
      "transition": "all 0.2s ease",
      "&:hover": {
        backgroundColor: colors.successHover,
        boxShadow: "none",
      },
      "&:active": {
        backgroundColor: colors.successHover,
        boxShadow: "none",
      },
    },
    outlined: {
      ...buttonSizes.medium,
      "backgroundColor": "transparent",
      "color": colors.success,
      "border": `1px solid ${colors.success}`,
      "boxShadow": "none",
      "textTransform": "inherit",
      "borderRadius": "4px",
      "fontWeight": 500,
      "transition": "all 0.2s ease",
      "&:hover": {
        backgroundColor: `${colors.success}08`,
        borderColor: colors.successHover,
      },
    },
    text: {
      ...buttonSizes.medium,
      "backgroundColor": "transparent",
      "color": colors.success,
      "border": "none",
      "boxShadow": "none",
      "textTransform": "inherit",
      "borderRadius": "4px",
      "fontWeight": 500,
      "transition": "all 0.2s ease",
      "&:hover": {
        backgroundColor: `${colors.success}08`,
      },
    },
  },
  // Warning buttons
  warning: {
    contained: {
      ...buttonSizes.medium,
      "backgroundColor": colors.warning,
      "color": "#fff",
      "boxShadow": "none",
      "textTransform": "inherit",
      "borderRadius": "4px",
      "border": "none",
      "fontWeight": 500,
      "transition": "all 0.2s ease",
      "&:hover": {
        backgroundColor: colors.warningHover,
        boxShadow: "none",
      },
    },
    outlined: {
      ...buttonSizes.medium,
      "backgroundColor": "transparent",
      "color": colors.warning,
      "border": `1px solid ${colors.warning}`,
      "boxShadow": "none",
      "textTransform": "inherit",
      "borderRadius": "4px",
      "fontWeight": 500,
      "transition": "all 0.2s ease",
      "&:hover": {
        backgroundColor: `${colors.warning}08`,
        borderColor: colors.warningHover,
      },
    },
    text: {
      ...buttonSizes.medium,
      "backgroundColor": "transparent",
      "color": colors.warning,
      "border": "none",
      "boxShadow": "none",
      "textTransform": "inherit",
      "borderRadius": "4px",
      "fontWeight": 500,
      "transition": "all 0.2s ease",
      "&:hover": {
        backgroundColor: `${colors.warning}08`,
      },
    },
  },
  // Error buttons (destructive actions)
  error: {
    contained: {
      ...buttonSizes.medium,
      "backgroundColor": colors.error,
      "color": "#fff",
      "boxShadow": "none",
      "textTransform": "inherit",
      "borderRadius": "4px",
      "border": "none",
      "fontWeight": 500,
      "transition": "all 0.2s ease",
      "&:hover": {
        backgroundColor: colors.errorHover,
        boxShadow: "none",
      },
      "&:active": {
        backgroundColor: colors.errorHover,
        boxShadow: "none",
      },
    },
    outlined: {
      ...buttonSizes.medium,
      "backgroundColor": "transparent",
      "color": colors.error,
      "border": `1px solid ${colors.error}`,
      "boxShadow": "none",
      "textTransform": "inherit",
      "borderRadius": "4px",
      "fontWeight": 500,
      "transition": "all 0.2s ease",
      "&:hover": {
        backgroundColor: `${colors.error}08`,
        borderColor: colors.errorHover,
      },
    },
    text: {
      ...buttonSizes.medium,
      "backgroundColor": "transparent",
      "color": colors.error,
      "border": "none",
      "boxShadow": "none",
      "textTransform": "inherit",
      "borderRadius": "4px",
      "fontWeight": 500,
      "transition": "all 0.2s ease",
      "&:hover": {
        backgroundColor: `${colors.error}08`,
      },
    },
  },
  // Info buttons
  info: {
    contained: {
      ...buttonSizes.medium,
      "backgroundColor": colors.info,
      "color": "#fff",
      "boxShadow": "none",
      "textTransform": "inherit",
      "borderRadius": "4px",
      "border": "none",
      "fontWeight": 500,
      "transition": "all 0.2s ease",
      "&:hover": {
        backgroundColor: colors.infoHover,
        boxShadow: "none",
      },
    },
    outlined: {
      ...buttonSizes.medium,
      "backgroundColor": "transparent",
      "color": colors.info,
      "border": `1px solid ${colors.info}`,
      "boxShadow": "none",
      "textTransform": "inherit",
      "borderRadius": "4px",
      "fontWeight": 500,
      "transition": "all 0.2s ease",
      "&:hover": {
        backgroundColor: `${colors.info}08`,
        borderColor: colors.infoHover,
      },
    },
    text: {
      ...buttonSizes.medium,
      "backgroundColor": "transparent",
      "color": colors.info,
      "border": "none",
      "boxShadow": "none",
      "textTransform": "inherit",
      "borderRadius": "4px",
      "fontWeight": 500,
      "transition": "all 0.2s ease",
      "&:hover": {
        backgroundColor: `${colors.info}08`,
      },
    },
  },
};

const textStyles = {
  pageTitle: {
    color: "#1A1919",
    fontSize: fontSizes.large,
    fontWeight: 600,
  },
  pageDescription: {
    color: "#344054",
    fontSize: fontSizes.medium,
  },
};

const dropDownStyles = {
  primary: {
    "width": 190,
    "& ul": { p: "5px" },
    "& li": {
      "m": 0,
      "fontSize": 13,
      "& .MuiTouchRipple-root": {
        display: "none",
      },
    },
    "& li:hover": { borderRadius: 4 },
    "boxShadow": shadowEffect.primary,
  },
};

const iconButtons = {
  "&:focus:not(:focus-visible)": {
    outline: "none",
  },
  "&:focus-visible": {
    outline: `2px solid ${brand.primary}`,
    outlineOffset: 1,
  },
  "& svg path": {
    stroke: "#667085",
  },
  "&:hover": {
    backgroundColor: "transparent",
  },
};

const iconButtonsRectangle = {
  "height": "34px",
  "width": "34px",
  "padding": "8px",
  "borderRadius": "4px",
  "border": "1px solid #E2E4E9",
  "backgroundColor": "#ffffff",
  "iconColor": "#667085",
  "iconColorDisabled": "#d1d5db",
  "&:focus:not(:focus-visible)": {
    outline: "none",
  },
  "&:focus-visible": {
    outline: `2px solid ${brand.primary}`,
    outlineOffset: 1,
  },
  "& svg path": {
    stroke: "#667085",
  },
  "&:hover": {
    backgroundColor: "#f9fafb",
  },
  "&:disabled": {
    backgroundColor: "transparent",
    borderColor: "#E2E4E9",
  },
};

const singleTheme = {
  effects,
  shadowEffect,
  textTransform: "inherit",
  buttons,
  borderRadius: "4px",
  fontSizes,
  textStyles,
  tableStyles,
  dropDownStyles,
  iconButtons,
  iconButtonsRectangle,
  alertStyles,
  textColors,
  flashColors,
  tableColors,
};

export default singleTheme;
