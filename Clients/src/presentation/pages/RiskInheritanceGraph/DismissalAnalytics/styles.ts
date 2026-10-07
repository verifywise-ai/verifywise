/**
 * @fileoverview Dismissal Analytics styles (MUI sx objects).
 *
 * Type comes from themes/typography's textStyles, which is the style guide's
 * Typography table in code — the guide forbids MUI Typography variants, and a
 * raw theme.typography.body2.fontSize is MUI's scale, not VerifyWise's.
 * Spacing is theme.spacing(n) with the app's 2px base unit: (2)=4px icon gap,
 * (4)=8px related items, (8)=16px section, (12)=24px major.
 */

import { SxProps, Theme } from "@mui/material";
import singleTheme from "../../../themes/v1SingleTheme";
import { textStyles } from "../../../themes/typography";

/**
 * MUI's Accordion is a Paper: it ships an elevation shadow and a ::before
 * divider. The guide's containers are border-only at 4px.
 */
export const sectionSx: SxProps<Theme> = {
  "mt": 4,
  "border": 1,
  "borderColor": "border.light",
  "borderRadius": "4px",
  "boxShadow": "none",
  "&:before": { display: "none" },
};

/** Card / panel title. 16 / 600 */
export const summaryTitleSx: SxProps<Theme> = {
  ...textStyles.cardTitle,
  color: "text.primary",
};

/** Panel title and its one-line description on one row; wraps on narrow screens. */
export const summaryHeaderSx: SxProps<Theme> = {
  display: "flex",
  alignItems: "baseline",
  flexWrap: "wrap",
  columnGap: 6, // 12px — title to description
  rowGap: 2,
};

/** One-line explanation beside the panel title. 13 / 400 / text.secondary */
export const summaryDescriptionSx: SxProps<Theme> = {
  ...textStyles.body,
  color: "text.secondary",
};

/** Nested heading under the panel. 14 / 600 */
export const blockHeadingSx: SxProps<Theme> = {
  ...textStyles.subsectionTitle,
  color: "text.primary",
  mt: 12, // 24px — section to section
  mb: 4, // 8px — title to subtitle
};

/** Hints and footnotes. 11 / 400 / text.accent */
export const captionSx: SxProps<Theme> = {
  ...textStyles.caption,
  color: "text.accent",
  mb: 8, // 16px — section header to content
};

export const tableSx: SxProps<Theme> = {
  ...singleTheme.tableStyles.primary.frame,
  mb: 8,
};

export const tableHeadRowSx: SxProps<Theme> = singleTheme.tableStyles.primary.header.row;

export const tableHeadCellSx = singleTheme.tableStyles.primary.header.cell;

export const tableBodyRowSx: SxProps<Theme> = {
  ...singleTheme.tableStyles.primary.body.row,
  // The shared token ends with cursor:pointer; these rows are read-only and
  // must not claim to be clickable. Zebra, borders and hover stay the token's.
  "&:hover": { cursor: "default" },
};

export const tableBodyCellSx = {
  ...singleTheme.tableStyles.primary.body.cell,
  // The token sets size and padding but no colour; the guide's "Table cell"
  // type row is 13 / 400 / text.secondary.
  color: "text.secondary",
};

/**
 * Recent notes are repeated rows of the same shape as the tables above, so they
 * take the same frame token. They are not a Table: body.cell is whiteSpace:
 * nowrap, which would push a long note off the page instead of wrapping it.
 */
export const notesFrameSx: SxProps<Theme> = {
  ...singleTheme.tableStyles.primary.frame,
  px: 8, // 16px
  mb: 8,
};

export const rateCellSx: SxProps<Theme> = {
  display: "flex",
  alignItems: "center",
  gap: 4, // 8px — related items
  minWidth: 120, // the guide's minimum column width
};

export const barTrackSx: SxProps<Theme> = {
  flex: 1,
  height: 6,
  borderRadius: "4px",
  bgcolor: "other.fill",
  overflow: "hidden",
};

export const barFillSx = (percent: number): SxProps<Theme> => ({
  height: "100%",
  width: `${Math.min(100, Math.max(0, percent))}%`,
  bgcolor: "status.warning.main",
  borderRadius: "4px",
});

/** A group header is metadata about the rows below it, not a heading. 12 / 400 */
export const groupHeaderSx: SxProps<Theme> = {
  ...textStyles.bodySmall,
  color: "text.tertiary",
  mt: 8, // 16px
  mb: 4, // 8px
};

export const noteItemSx: SxProps<Theme> = {
  "py": 4, // 8px — list item
  "borderBottom": 1,
  // border.light (#eaecf0) is the guide's "Card borders, table rows" colour,
  // and the same one tableStyles.body.row draws between rows.
  "borderColor": "border.light",
  // Mirrors the token's own &:last-child rule: no double border against the frame.
  "&:last-of-type": { borderBottom: "none" },
};

export const noteMetaSx: SxProps<Theme> = {
  ...textStyles.caption,
  color: "text.accent",
};

export const noteTextSx: SxProps<Theme> = {
  ...textStyles.body,
  color: "text.secondary",
  mt: 2, // 4px
};

export const stateContainerSx: SxProps<Theme> = {
  display: "flex",
  justifyContent: "center",
  alignItems: "center",
  py: 12, // 24px
};

/**
 * The guide's alert box (Cards & containers): status bg, 1px status border,
 * 4px radius, 12px 16px padding, a 16px icon with a 12px gap, 13px text.
 * The colour is set on the container so the lucide icon inherits it through
 * currentColor — no theme lookup, which also keeps it safe under a bare theme.
 */
export const errorAlertSx: SxProps<Theme> = {
  display: "flex",
  alignItems: "center",
  gap: 6, // 12px
  py: 6, // 12px
  px: 8, // 16px
  borderRadius: "4px",
  border: 1,
  borderColor: "status.error.main",
  backgroundColor: "status.error.bg",
  color: "status.error.text",
};

export const errorTextSx: SxProps<Theme> = {
  ...textStyles.body,
  color: "inherit",
};
