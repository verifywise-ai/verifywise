import { SxProps, Theme } from "@mui/material";
import { keyframes } from "@mui/system";

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
    marginTop: "9px",
    border: "1px solid #d0d5dd",
    width: "100%",
    marginLeft: "1.5px",
    borderRadius: "4px",
    overflow: "hidden",
    position: "relative",
    margin: 0,
    padding: 0,
    boxShadow: "none",
    ".MuiAccordionDetails-root": {
      padding: 0,
      margin: 0,
    },
  } as SxProps<Theme>,

  accordionSummary: {
    backgroundColor: "#fafafa",
    flexDirection: "row-reverse",
  } as SxProps<Theme>,

  expandIcon: (expanded: boolean) => ({
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
  switch (
    normalizedStatus.charAt(0).toUpperCase() +
    normalizedStatus.slice(1).toLowerCase()
  ) {
    case "Not Started":
      return "#4B5563";
    case "Draft":
      return "#D97706";
    case "In progress":
      return "#2563EB";
    case "Awaiting review":
      return "#7C3AED";
    case "Awaiting approval":
      return "#4F46E5";
    case "Implemented":
      return "#059669";
    case "Done":
      return "#059669";
    case "Audited":
      return "#0D9488";
    case "Needs rework":
      return "#EA580C";
    default:
      return "#4B5563"; // Default to "Not Started" color
  }
}
