import { SxProps, Theme, keyframes } from "@mui/material";

/**
 * Flash animation for saved rows
 * Green pulse effect to indicate successful save
 */
export const flashAnimation = keyframes`
  0% {
    background-color: transparent;
  }
  50% {
    background-color: rgba(82, 171, 67, 0.2);
  }
  100% {
    background-color: transparent;
  }
`;

/**
 * Get priority colors based on priority level
 * Follows StyleGuide semantic color scheme
 */
export const getPriorityColors = (priority: string): { bg: string; text: string } => {
  switch (priority?.toLowerCase()) {
    case "high priority":
      return { bg: "#FEE2E2", text: "#EF4444" }; // Error/Critical
    case "medium priority":
      return { bg: "#FEF3C7", text: "#F59E0B" }; // Warning/Pending
    case "low priority":
      return { bg: "background.hover", text: "status.default.text" }; // Neutral
    default:
      return { bg: "background.hover", text: "status.default.text" }; // Neutral
  }
};

/**
 * Shared styles for EU AI Act components
 * Follows ISO42001/ISO27001 styling patterns
 */
export const styles = {
  /**
   * Accordion container styling
   * Matches ISO accordion pattern with border, radius, and no shadow
   */
  accordion: {
    marginTop: "9px",
    border: "1px solid #d0d5dd",
    width: "100%",
    borderRadius: "4px",
    overflow: "hidden",
    position: "relative",
    margin: 0,
    padding: 0,
    boxShadow: "none",
    ".MuiAccordionDetails-root": { padding: 0, margin: 0 },
  } as SxProps<Theme>,

  /**
   * Accordion summary (header) styling
   * Light background (#fafafa) with reverse flex direction for icon on left
   */
  accordionSummary: {
    backgroundColor: "#fafafa",
    flexDirection: "row-reverse",
    paddingLeft: "16px",
    paddingRight: "16px",
    paddingY: "12px",
    "&:hover": { backgroundColor: "background.surface" },
  } as SxProps<Theme>,

  /**
   * Expand/collapse arrow icon styling
   * Rotates 90 degrees when expanded
   */
  expandIcon: (expanded: boolean) =>
    ({
      transform: expanded ? "rotate(90deg)" : "rotate(0deg)",
      transition: "transform 300ms ease",
      marginRight: "8px",
      flexShrink: 0,
    } as SxProps<Theme>),

  /**
   * Question row styling
   * Matches ISO pattern with proper spacing, borders, and flash animation
   */
  questionRow: (isLast: boolean, isFlashing: boolean) =>
    ({
      display: "flex",
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      padding: "16px",
      borderBottom: isLast ? "none" : "1px solid #d0d5dd",
      cursor: "pointer",
      fontSize: 13,
      animation: isFlashing ? `${flashAnimation} 2s ease-in-out` : "none",
      "&:hover": {
        backgroundColor: isFlashing ? "transparent" : "background.surface",
      },
    } as SxProps<Theme>),

  /**
   * Question text styling
   * Truncates with ellipsis, proper color and spacing
   */
  questionText: {
    fontSize: 13,
    color: "text.secondary",
    flex: 1,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    marginRight: "16px",
  } as SxProps<Theme>,
};
