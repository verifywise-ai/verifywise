import { SxProps, Theme } from "@mui/material";
import { keyframes } from "@mui/system";
import { palette, radiusPx } from "../../themes/palette";

// Animation
export const flashAnimation = keyframes`
  0% {
    background-color: transparent;
  }
  50% {
    background-color: rgba(82, 171, 67, 0.2); // Light green color
  }
  100% {
    background-color: transparent;
  }
`;

// Common styles
export const commonStyles = {
  container: {
    marginTop: "14px",
    gap: "20px",
  } as SxProps<Theme>,

  title: {
    color: "text.primary",
    fontWeight: 600,
    mb: "6px",
    fontSize: 16,
  } as SxProps<Theme>,

  accordion: {
    "marginTop": "9px",
    "border": `1px solid ${palette.border.dark}`,
    "width": "100%",
    "marginLeft": "1.5px",
    "borderRadius": radiusPx.sm,
    "overflow": "hidden",
    "position": "relative",
    "margin": 0,
    "padding": 0,
    "boxShadow": "none",
    ".MuiAccordionDetails-root": {
      padding: 0,
      margin: 0,
    },
  } as SxProps<Theme>,

  accordionSummary: {
    backgroundColor: palette.background.alt,
    flexDirection: "row-reverse",
  } as SxProps<Theme>,

  expandIcon: (expanded: boolean) =>
    ({
      transform: expanded ? "rotate(90deg)" : "rotate(0deg)",
      transition: "transform 0.5s ease-in",
    }) as SxProps<Theme>,
};

/**
 * Get the color associated with a status
 * @param status The status string to get the color for
 * @returns The hex color code for the status
 */
export function getStatusColor(status: string): string {
  const normalizedStatus = status?.trim() || "Not Started";
  switch (normalizedStatus.charAt(0).toUpperCase() + normalizedStatus.slice(1).toLowerCase()) {
    case "Not Started":
      return palette.text.tertiary;
    case "Draft":
      return palette.text.accent;
    case "In progress":
      return palette.riskMark.medium;
    case "Awaiting review":
      return palette.status.info.text;
    case "Awaiting approval":
      return palette.accent.indigo.text;
    case "Implemented":
      return palette.status.success.text;
    case "Done":
      return palette.status.success.text;
    case "Audited":
      return palette.accent.teal.text;
    case "Needs rework":
      return palette.riskMark.high;
    default:
      return palette.text.tertiary; // Default to "Not Started" color
  }
}
