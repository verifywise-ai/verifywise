import { SxProps, Theme } from "@mui/material";
import { commonStyles, flashAnimation } from "../../../ISO/style";
import { border as borderPalette, text } from "../../../../themes/palette";
import { fontSize, textStyles } from "../../../../themes/typography";

// Component styles
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
    color: text.tertiary,
  } as SxProps<Theme>,

  controlRow: (isLast: boolean, isFlashing: boolean) =>
    ({
      "display": "flex",
      "flexDirection": "row",
      "justifyContent": "space-between",
      "alignItems": "center",
      "padding": "16px",
      "borderBottom": isLast ? "none" : `1px solid ${borderPalette.dark}`,
      "cursor": "pointer",
      "fontSize": fontSize.base,
      "animation": isFlashing ? `${flashAnimation} 2s ease-in-out` : "none",
      "&:hover": {
        backgroundColor: isFlashing ? "transparent" : "background.surface",
      },
    }) as SxProps<Theme>,

  controlTitle: {
    ...textStyles.subsectionTitle,
  } as SxProps<Theme>,
};
