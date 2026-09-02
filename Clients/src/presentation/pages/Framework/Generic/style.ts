import { SxProps, Theme } from "@mui/material";
import { commonStyles, flashAnimation } from "../../ISO/style";

/**
 * Mirrors Servers/../pages/Framework/ISO27001/Clause/style.ts so the
 * generic-framework page reads visually identical to ISO 27001.
 */
export const styles = {
  container: commonStyles.container,
  title: commonStyles.title,
  accordion: commonStyles.accordion,
  accordionSummary: commonStyles.accordionSummary,
  expandIcon: commonStyles.expandIcon,

  subClauseRow: (isLast: boolean, isFlashing: boolean) =>
    ({
      "display": "flex",
      "flexDirection": "row",
      "justifyContent": "space-between",
      "padding": "16px",
      "borderBottom": isLast ? "none" : "1px solid #d0d5dd",
      "cursor": "pointer",
      "fontSize": 13,
      "animation": isFlashing ? `${flashAnimation} 2s ease-in-out` : "none",

      "&:hover": {
        backgroundColor: isFlashing ? "transparent" : "background.surface",
      },

      "alignItems": "center",
    }) as SxProps<Theme>,

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

  errorContainer: {
    p: 4,
  } as SxProps<Theme>,
};
