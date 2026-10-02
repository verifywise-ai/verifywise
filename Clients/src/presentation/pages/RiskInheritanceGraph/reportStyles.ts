/**
 * @fileoverview Styles shared by the two read-only report sections on this
 * page — duplicate candidates (F7) and control coverage (F8).
 *
 * The base section tokens (frame, table, error alert, loading container) live
 * in DismissalAnalytics/styles and are imported from there: all three sections
 * are the same kind of panel, and one definition is what keeps them looking
 * like one system. Only what those two need and the sibling does not is here.
 *
 * Spacing is theme.spacing(n) on the app's 2px base: (2)=4px, (4)=8px related
 * items, (8)=16px section, (12)=24px major.
 */

import { SxProps, Theme } from "@mui/material";
import singleTheme from "../../themes/v1SingleTheme";
import { textStyles } from "../../themes/typography";

/**
 * The shared body.cell token is whiteSpace: nowrap, which is right for a name
 * or a status but pushes a list of project names or shared terms off the side
 * of the page. These columns wrap instead.
 */
export const wrapCellSx: SxProps<Theme> = {
  ...singleTheme.tableStyles.primary.body.cell,
  color: "text.secondary",
  whiteSpace: "normal",
  minWidth: 120, // the guide's minimum column width
};

/** The risk's own name — the thing the row is about. 13 / 500 */
export const riskNameSx: SxProps<Theme> = {
  ...textStyles.body,
  color: "text.primary",
  fontWeight: 500,
};

/** Owner, id, and other row metadata under the name. 11 / 400 */
export const riskMetaSx: SxProps<Theme> = {
  ...textStyles.caption,
  color: "text.accent",
  mt: 1, // 2px — the name and its metadata are one block
};

/** Cells whose numbers are read down a column rather than across a row. */
export const numericCellSx: SxProps<Theme> = {
  ...singleTheme.tableStyles.primary.body.cell,
  color: "text.secondary",
  fontVariantNumeric: "tabular-nums",
};

/**
 * Same shape as the sibling's error alert (the guide's alert box: status bg,
 * 1px status border, 4px radius, 12px 16px padding, 16px icon, 12px gap). The
 * colour sits on the container so the lucide icon inherits it via currentColor.
 */
const alertBaseSx = {
  display: "flex",
  alignItems: "center",
  gap: 6, // 12px
  py: 6, // 12px
  px: 8, // 16px
  borderRadius: "4px",
  border: 1,
} as const;

export const infoAlertSx: SxProps<Theme> = {
  ...alertBaseSx,
  borderColor: "status.info.main",
  backgroundColor: "status.info.bg",
  color: "status.info.text",
  mb: 8, // 16px
};

export const successAlertSx: SxProps<Theme> = {
  ...alertBaseSx,
  borderColor: "status.success.main",
  backgroundColor: "status.success.bg",
  color: "status.success.text",
};

export const alertTextSx: SxProps<Theme> = {
  ...textStyles.body,
  color: "inherit",
};

/**
 * Summary tiles. auto-fit rather than a fixed column count so the four figures
 * reflow to one column on a narrow viewport instead of scrolling sideways.
 */
export const summaryGridSx: SxProps<Theme> = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
  gap: 4, // 8px
  mb: 12, // 24px
};

/** The guide's container: 4px radius, 1px border.light, background.main, 16px. */
export const summaryTileSx: SxProps<Theme> = {
  border: 1,
  borderColor: "border.light",
  borderRadius: "4px",
  backgroundColor: "background.main",
  p: 8, // 16px
};

export const summaryLabelSx: SxProps<Theme> = {
  ...textStyles.caption,
  color: "text.tertiary",
};

export const summaryValueSx: SxProps<Theme> = {
  ...textStyles.sectionTitle,
  color: "text.primary",
  fontVariantNumeric: "tabular-nums",
  mt: 1, // 2px
};

/** The figure beside a bar. Same type as row metadata, but on a flex baseline. */
export const metricLabelSx: SxProps<Theme> = {
  ...textStyles.caption,
  color: "text.accent",
  fontVariantNumeric: "tabular-nums",
};
