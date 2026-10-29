/**
 * Layout styles the bias audit pages share: the bordered card, section
 * titles, helper text and the table cells.
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

export const titleSx = { fontSize: 15, fontWeight: 600, color: palette.text.primary } as const;
/** Body copy under a title, and the reason a button is disabled. */
export const helperSx = { fontSize: 13, color: palette.text.tertiary } as const;
/** A short label above a value. */
export const labelSx = { fontSize: 12, color: palette.text.tertiary } as const;
export const cellSx = { fontSize: 13, color: palette.text.secondary, py: "8px" } as const;
export const headSx = {
  fontSize: 12,
  fontWeight: 600,
  color: palette.text.tertiary,
  py: "8px",
} as const;
