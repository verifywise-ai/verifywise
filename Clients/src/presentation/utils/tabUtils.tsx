import { Box, SxProps, Theme } from "@mui/material";
import { ReactNode } from "react";
import { icon as iconTokens, primitives } from "../themes/palette";
import { fontFamily } from "../themes/typography";
import { isClassicUi } from "../themes/uiStyle";
import { chartTheme } from "../themes/chartTheme";

export interface TabLabelWithCountOptions {
  label: string;
  /** A number, or a short marker such as "–" when the count is not known */
  count?: number | string;
  showZero?: boolean;
  isLoading?: boolean;
  chipSx?: SxProps<Theme>;
  icon?: ReactNode;
}

// Constants for consistent badge styling
const BADGE_MIN_WIDTH = "22px";
const BADGE_HEIGHT = "22px";
const BADGE_FONT_SIZE = "10px";
const BADGE_COLOR = chartTheme.controls.tabBadge.text;
const BADGE_BG_COLOR = chartTheme.controls.tabBadge.bg;
const BADGE_BORDER_RADIUS = "11px";
const MAX_DISPLAY_COUNT = 99;

const classicUi = isClassicUi();

/** Classic: green count pill. */
const classicBadgeSx = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  minWidth: BADGE_MIN_WIDTH,
  height: BADGE_HEIGHT,
  padding: "0 6px",
  fontSize: BADGE_FONT_SIZE,
  fontWeight: 600,
  color: BADGE_COLOR,
  backgroundColor: BADGE_BG_COLOR,
  borderRadius: BADGE_BORDER_RADIUS,
  lineHeight: 1,
} as const;

/**
 * Phase 1: the count is plain Geist Mono 11px, not a green pill. The hand-off
 * names text.accent, but that is 3:1 on white; grey.500 meets 4.5:1 on white
 * and on the raised tab grey.
 */
const phase1CountSx = {
  display: "inline-flex",
  alignItems: "center",
  fontFamily: fontFamily.mono,
  fontSize: "11px",
  fontWeight: 400,
  color: primitives.grey[500],
  lineHeight: 1,
  fontVariantNumeric: "tabular-nums",
} as const;

/**
 * Creates a tab label with an optional count badge.
 *
 * @param options - Configuration options for the tab label
 * @param options.label - The text label for the tab
 * @param options.count - Optional count to display in a chip badge
 * @param options.showZero - Whether to show the chip when count is 0 (default: true)
 * @param options.isLoading - Hide the chip during loading states (default: false)
 * @param options.chipSx - Optional custom styles for the chip
 * @param options.icon - Optional icon to display before the label
 *
 * @returns A ReactNode that can be passed to MUI Tab's label prop
 *
 * @example
 * // Simple usage with count
 * <Tab
 *   label={createTabLabelWithCount({ label: "Vendors", count: 10 })}
 *   value="1"
 * />
 *
 * @example
 * // With loading state
 * <Tab
 *   label={createTabLabelWithCount({
 *     label: "Vendors",
 *     count: vendors.length,
 *     isLoading: isVendorsLoading
 *   })}
 *   value="1"
 * />
 *
 * @example
 * // Tab without count (returns plain string)
 * <Tab label={createTabLabelWithCount({ label: "Settings" })} value="3" />
 * // Or just use a string directly:
 * <Tab label="Settings" value="3" />
 */
export const createTabLabelWithCount = ({
  label,
  count,
  showZero = true,
  isLoading = false,
  chipSx,
  icon,
}: TabLabelWithCountOptions): ReactNode => {
  const shouldShowChip =
    !isLoading && count !== undefined && (showZero || typeof count === "string" || count > 0);

  // Return Box wrapper for consistent alignment across all tabs
  return (
    <Box sx={{ display: "flex", alignItems: "center", gap: 2.5, minHeight: BADGE_HEIGHT }}>
      {icon && (
        <Box
          component="span"
          sx={{
            display: "inline-flex",
            alignItems: "center",
            marginRight: "4px",
            opacity: classicUi ? 0.7 : 1,
            color: classicUi ? undefined : iconTokens.default,
          }}
        >
          {icon}
        </Box>
      )}
      {label}
      {shouldShowChip && (
        <Box
          component="span"
          sx={{
            ...(classicUi ? classicBadgeSx : phase1CountSx),
            ...chipSx, // Allow custom overrides
          }}
        >
          {typeof count === "number" && count > MAX_DISPLAY_COUNT ? `${MAX_DISPLAY_COUNT}+` : count}
        </Box>
      )}
    </Box>
  );
};

/**
 * Shorthand version of createTabLabelWithCount for simple use cases.
 *
 * @param label - The text label for the tab
 * @param count - Optional count to display
 * @returns A ReactNode that can be passed to MUI Tab's label prop
 *
 * @example
 * <Tab label={tabLabelWithCount("Vendors", 10)} value="1" />
 */
export const tabLabelWithCount = (label: string, count?: number): ReactNode =>
  createTabLabelWithCount({ label, count });
