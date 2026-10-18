/**
 * Layout styles the bias audit pages share: the bordered card, the
 * content-beside-education grid, section titles and the table cells.
 */
import { palette } from "../../themes/palette";

export const cardSx = {
  border: `1px solid ${palette.border.dark}`,
  borderRadius: "4px",
  backgroundColor: palette.background.main,
  p: "16px",
} as const;

/** A bordered frame for a table that scrolls sideways on narrow screens. */
export const tableFrameSx = {
  border: `1px solid ${palette.border.dark}`,
  borderRadius: "4px",
  overflowX: "auto",
} as const;

/** Content on the left, its education panel on the right; stacked below `lg`. */
export const twoColumnSx = {
  display: "grid",
  gridTemplateColumns: { xs: "1fr", lg: "3fr 2fr" },
  gap: "16px",
  alignItems: "start",
} as const;

export const titleSx = { fontSize: 15, fontWeight: 600, color: palette.text.primary } as const;
export const cellSx = { fontSize: 13, color: palette.text.secondary, py: "8px" } as const;
export const headSx = {
  fontSize: 12,
  fontWeight: 600,
  color: palette.text.tertiary,
  py: "8px",
} as const;
