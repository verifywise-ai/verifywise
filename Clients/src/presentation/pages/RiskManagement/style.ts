import React from "react";
import singleTheme from "../../themes/v1SingleTheme";
import { background } from "../../themes/palette";

// A. Main Layout
export const riskMainStackStyle = {
  gap: 10,
};

export const riskFilterRowStyle = {
  display: "flex",
  gap: "8px",
  alignItems: "center",
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
  gap: 2,
};

// C. Popover (Insert Risk Mega Dropdown)
export const riskPopoverStyle = {
  mt: 1,
  "& .MuiPopover-paper": {
    borderRadius: singleTheme.borderRadius,
    boxShadow: "0 8px 24px rgba(0, 0, 0, 0.12)",
    overflow: "visible",
    backgroundColor: "background.main",
  },
};

export const riskPopoverContentStyle = {
  p: 2,
  width: "420px",
};

// D. Menu Item (Add New Risk Manually)
export const riskMenuItemStyle = {
  display: "flex",
  alignItems: "center",
  padding: "12px 16px",
  borderRadius: singleTheme.borderRadius,
  cursor: "pointer",
  border: "1px solid rgba(0, 0, 0, 0.08)",
  backgroundColor: "background.main",
  transition: "all 0.2s ease",
  mb: 2,
  "&:hover": {
    backgroundColor: "background.accent",
    border: "1px solid rgba(0, 0, 0, 0.12)",
  },
};

export const riskMenuItemTitleStyle = {
  fontWeight: 600,
  fontSize: singleTheme.fontSizes.medium,
  color: "rgba(0, 0, 0, 0.85)",
};

export const riskMenuItemSubtitleStyle = {
  fontSize: singleTheme.fontSizes.small,
  color: "rgba(0, 0, 0, 0.6)",
};

// E. Divider ("Or Import From")
export const riskDividerContainerStyle = {
  display: "flex",
  alignItems: "center",
  gap: 1.5,
  mb: 2,
};

export const riskDividerLineStyle = {
  flex: 1,
  height: "1px",
  backgroundColor: "rgba(0, 0, 0, 0.08)",
};

export const riskDividerTextStyle = {
  fontSize: singleTheme.fontSizes.small,
  color: "rgba(0, 0, 0, 0.45)",
  textTransform: "uppercase" as const,
  letterSpacing: "0.5px",
};

// F. AI Risk Cards Grid
export const riskCardsGridStyle = (hasPlugin: boolean) => ({
  display: "grid",
  gridTemplateColumns: hasPlugin ? "repeat(3, 1fr)" : "repeat(2, 1fr)",
  gap: 2,
});

// F. AI Risk Cards (deduplicated IBM/MIT)
export const aiRiskCardBaseStyle = {
  background:
    "linear-gradient(135deg, rgba(252, 252, 252, 1) 0%, rgba(248, 248, 248, 1) 100%)",
  borderRadius: singleTheme.borderRadius,
  padding: "20px 16px",
  cursor: "pointer",
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "flex-start",
  gap: 1.5,
  border: "1px solid rgba(0, 0, 0, 0.04)",
  transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
  minHeight: "140px",
  "&:hover": {
    boxShadow: "0 2px 6px rgba(0, 0, 0, 0.06)",
    border: "1px solid rgba(0, 0, 0, 0.08)",
    background:
      "linear-gradient(135deg, rgba(255, 255, 255, 1) 0%, rgba(250, 250, 250, 1) 100%)",
  },
  "&:active": {
    transform: "scale(0.98)",
  },
};

export const aiRiskCardIbmStyle = {
  ...aiRiskCardBaseStyle,
  position: "relative" as const,
};

export const aiRiskCardRecommendedBadgeStyle = {
  position: "absolute",
  top: 8,
  right: 8,
  backgroundColor: "#10B981",
  color: "white",
  fontSize: "9px",
  fontWeight: 600,
  padding: "2px 6px",
  borderRadius: "3px",
  textTransform: "uppercase" as const,
  letterSpacing: "0.5px",
};

export const aiRiskCardLogoStyle: React.CSSProperties = {
  height: 24,
};

export const aiRiskCardTitleStyle = {
  fontWeight: 600,
  fontSize: singleTheme.fontSizes.medium,
  color: "rgba(0, 0, 0, 0.85)",
  textAlign: "center",
};

export const aiRiskCardCaptionStyle = {
  fontSize: singleTheme.fontSizes.small,
  color: "rgba(0, 0, 0, 0.6)",
  textAlign: "center",
  lineHeight: 1.4,
};
