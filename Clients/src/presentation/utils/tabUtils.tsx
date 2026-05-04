import { Box, SxProps, Theme } from "@mui/material";
import { ReactNode } from "react";

export interface TabLabelWithCountOptions {
  label: string;
  count?: number;
  showZero?: boolean;
  isLoading?: boolean;
  chipSx?: SxProps<Theme>;
  icon?: ReactNode;
}

// Constants for consistent badge styling
const BADGE_MIN_WIDTH = "22px";
const BADGE_HEIGHT = "22px";
const BADGE_FONT_SIZE = "10px";
const BADGE_COLOR = "#047857";
const BADGE_BG_COLOR = "#D1FAE5";
const BADGE_BORDER_RADIUS = "11px";
const MAX_DISPLAY_COUNT = 99;

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
  const shouldShowChip = !isLoading && count !== undefined && (showZero || count > 0);

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
            opacity: 0.7,
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
            ...chipSx, // Allow custom overrides
          }}
        >
          {count > MAX_DISPLAY_COUNT ? `${MAX_DISPLAY_COUNT}+` : count}
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
