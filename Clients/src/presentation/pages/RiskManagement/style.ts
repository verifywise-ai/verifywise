import React from "react";
import singleTheme from "../../themes/v1SingleTheme";
import { background, palette as vwPalette } from "../../themes/palette";

// A. Main Layout
export const riskMainStackStyle = {
  gap: 10,
};

/**
 * Toolbar: filters, Columns and Search on the left take the room that's left
 * and wrap inside it; the actions on the right keep their width and stay at
 * the top right. On a narrow screen the actions move to their own line,
 * still right-aligned, instead of being squeezed.
 */
export const riskToolbarStyle = {
  flexWrap: "wrap",
  alignItems: "flex-start",
  justifyContent: "space-between",
  columnGap: "16px",
  rowGap: "8px",
};

export const riskFilterRowStyle = {
  display: "flex",
  flexWrap: "wrap",
  gap: "8px",
  alignItems: "center",
  flex: "1 1 0",
  minWidth: "min(320px, 100%)",
};

/** Columns and Search wrap to the next line together, never apart. */
export const riskViewControlsStyle = {
  display: "flex",
  gap: "8px",
  alignItems: "center",
};

export const riskActionsStyle = {
  gap: "8px",
  alignItems: "center",
  flexShrink: 0,
  marginLeft: "auto",
};

// B. Toolbar Buttons
export const analyticsIconButtonStyle = {
  ...singleTheme.iconButtonsRectangle,
  "&:hover": {
    backgroundColor: `${background.accent}`,
  },
};

export const addNewRiskButtonStyle = {
  backgroundColor: singleTheme.buttons.primary.contained.backgroundColor,
  border: `1px solid ${singleTheme.buttons.primary.contained.backgroundColor}`,
  gap: "4px",
};

// C. Popover (Insert Risk Mega Dropdown)
export const riskPopoverStyle = {
  "mt": 1,
  "& .MuiPopover-paper": {
    borderRadius: singleTheme.borderRadius,
    boxShadow: "0 8px 24px rgba(0, 0, 0, 0.12)",
    overflow: "visible",
    backgroundColor: "background.main",
  },
};

export const riskPopoverContentStyle = {
  p: 1,
  width: "440px",
  display: "flex",
  flexDirection: "column",
  gap: "4px",
};

// D. Uniform list row (used by Manual, IBM, MIT, and plugin items)
export const riskMenuItemStyle = {
  "display": "flex",
  "alignItems": "center",
  "gap": "12px",
  "padding": "12px 14px",
  "borderRadius": singleTheme.borderRadius,
  "cursor": "pointer",
  "border": "1px solid transparent",
  "backgroundColor": "transparent",
  "transition": "background-color 0.15s ease, border-color 0.15s ease",
  "position": "relative" as const,
  "&:hover": {
    backgroundColor: "rgba(19, 113, 91, 0.04)",
    border: "1px solid rgba(19, 113, 91, 0.12)",
  },
  "&:focus-visible": {
    outline: "none",
    backgroundColor: "rgba(19, 113, 91, 0.04)",
    border: "1px solid rgba(19, 113, 91, 0.24)",
  },
};

export const riskMenuItemTextWrapStyle = {
  flex: 1,
  minWidth: 0,
  display: "flex",
  flexDirection: "column",
  gap: "2px",
};

export const riskMenuItemTitleRowStyle = {
  display: "flex",
  alignItems: "center",
  gap: "8px",
};

export const riskMenuItemTitleStyle = {
  fontWeight: 600,
  fontSize: singleTheme.fontSizes.medium,
  color: "rgba(0, 0, 0, 0.85)",
};

export const riskMenuItemSubtitleStyle = {
  fontSize: singleTheme.fontSizes.small,
  color: "rgba(0, 0, 0, 0.6)",
  lineHeight: 1.4,
};

export const riskMenuItemLogoStyle: React.CSSProperties = {
  height: 18,
  width: "auto",
  flexShrink: 0,
  opacity: 0.75,
};

export const riskMenuItemRecommendedBadgeStyle = {
  backgroundColor: vwPalette.brand.primary,
  color: "white",
  fontSize: "9px",
  fontWeight: 600,
  padding: "2px 6px",
  borderRadius: "3px",
  textTransform: "uppercase" as const,
  letterSpacing: "0.5px",
  lineHeight: 1.2,
};
