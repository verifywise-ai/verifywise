import { SxProps, Theme } from "@mui/material";
import { commonStyles, flashAnimation } from "../../ISO/style";
import { border as borderPalette, text } from "../../../themes/palette";
import { fontSize } from "../../../themes/typography";

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
      "borderBottom": isLast ? "none" : `1px solid ${borderPalette.dark}`,
      "cursor": "pointer",
      "fontSize": fontSize.base,
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
    color: text.secondary,
  } as SxProps<Theme>,

  errorContainer: {
    p: 4,
  } as SxProps<Theme>,
};
