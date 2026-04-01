import { SxProps, Theme } from "@mui/material";
import {
  commonStyles,
  flashAnimation,
  getStatusColor,
} from "../../../ISO/style";
import { border as borderPalette } from "../../../../themes/palette";

// Component styles
export const styles = {
  container: commonStyles.container,
  title: commonStyles.title,
  accordion: commonStyles.accordion,
  accordionSummary: commonStyles.accordionSummary,
  expandIcon: commonStyles.expandIcon,

  subClauseRow: (isLast: boolean, isFlashing: boolean) =>
    ({
      display: "flex",
      flexDirection: "row",
      justifyContent: "space-between",
      padding: "16px",
      borderBottom: isLast ? "none" : `1px solid ${borderPalette.dark}`,
      cursor: "pointer",
      fontSize: 13,
      animation: isFlashing ? `${flashAnimation} 2s ease-in-out` : "none",
      "&:hover": {
        backgroundColor: isFlashing ? "transparent" : "background.surface",
      },
      alignItems: "center",
    } as SxProps<Theme>),

  statusBadge: (status: string) =>
    ({
      borderRadius: "4px",
      padding: "5px",
      backgroundColor: getStatusColor(status),
      color: "background.main",
    } as SxProps<Theme>),

  loadingContainer: {
    padding: "16px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  } as SxProps<Theme>,

  noSubClausesContainer: {
    padding: "16px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    color: "#666",
  } as SxProps<Theme>,

  controlRow: (isLast: boolean, isFlashing: boolean) =>
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

  controlTitle: {
    fontSize: 13,
    fontWeight: 600,
  } as SxProps<Theme>,
};
