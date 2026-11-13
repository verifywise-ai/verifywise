import React, { useMemo } from "react";
import { Box, SxProps, Theme } from "@mui/material";
import Tab from "@mui/material/Tab";
import TabList from "@mui/lab/TabList";
import { createTabLabelWithCount } from "../../utils/tabUtils";
import { getLucideIcon } from "../../utils/lucideIconMap";
import type * as LucideIcons from "lucide-react";
import VWTooltip from "../VWTooltip";
import VWIcon from "../VWIcon";
import { tabIconName } from "./tabIcons";
import { background, border, brand, icon, radiusPx, text } from "../../themes/palette";
import { isClassicUi } from "../../themes/uiStyle";

export interface TabItem {
  label: string;
  value: string;
  icon?: keyof typeof LucideIcons;
  /** A number, or a short marker such as "–" when the count is not known */
  count?: number | string;
  isLoading?: boolean;
  disabled?: boolean;
  /** Optional tooltip shown on hover to explain the tab's purpose */
  tooltip?: string;
  /** Optional rich tooltip with header and description */
  tooltipContent?: {
    header: string;
    description: string;
  };
}

export interface TabBarProps {
  tabs: TabItem[];
  activeTab: string;
  onChange: (event: React.SyntheticEvent, newValue: string) => void;
  /** Optional custom styles for the tab list container */
  tabListSx?: SxProps<Theme>;
  /** Optional custom styles for individual tabs */
  tabSx?: SxProps<Theme>;
  /** Whether to disable ripple effect on tabs */
  disableRipple?: boolean;
  /** Color for the indicator under active tab */
  indicatorColor?: string;
  /** Optional data attribute for page tours/testing */
  dataJoyrideId?: string;
  /** Optional tooltip message for disabled tabs */
  disabledTabTooltip?: string;
  /** When true, the tab list scrolls horizontally with arrows on overflow. */
  scrollable?: boolean;
}

// Constants for consistent styling
const classicUi = isClassicUi();
const TAB_ICON_SIZE = classicUi ? 14 : 15;
const TAB_ICON_STROKE_WIDTH = 1.5;
const TAB_ICON_OPACITY = 1;
const TAB_GAP = classicUi ? "34px" : "3px";
const DEFAULT_INDICATOR_COLOR = `${brand.primary}`;

/** 1px hairline along the bottom of the bar, drawn inside so MUI's overflow clip keeps it. */
const BAR_LINE = `inset 0 -1px 0 ${border.light}`;

/**
 * Phase 1 tab (style guide §6): raised grey fill, hairline on three sides,
 * 9px top corners; the selected tab is white and joins the page below.
 */
const phase1TabStyle = {
  "textTransform": "none",
  "fontSize": 13,
  "fontWeight": 400,
  "color": text.tertiary,
  "alignItems": "center",
  "justifyContent": "center",
  "padding": "7px 14px 8px",
  "minHeight": "20px",
  "minWidth": "auto",
  "backgroundColor": background.hover,
  "border": `1px solid ${border.light}`,
  "borderBottom": "none",
  "borderRadius": `${radiusPx.tab} ${radiusPx.tab} 0 0`,
  "boxShadow": BAR_LINE,
  "&:hover": { color: text.primary },
  "&.Mui-selected": {
    color: text.primary,
    fontWeight: 500,
    backgroundColor: background.main,
    boxShadow: "none",
  },
  "&.Mui-focusVisible": {
    outline: `2px solid ${brand.primary}`,
    outlineOffset: -2,
  },
} as const;

/**
 * Standardized TabBar component for VerifyWise.
 *
 * Provides consistent styling and behavior across all tabbed interfaces.
 * Automatically handles icons, counts, loading states, and disabled states.
 *
 * @example
 * ```tsx
 * <TabBar
 *   tabs={[
 *     { label: "Profile", value: "profile", icon: "User" },
 *     { label: "Team", value: "team", icon: "Users", count: 5, isLoading: false },
 *     { label: "Settings", value: "settings", icon: "Settings", disabled: true },
 *   ]}
 *   activeTab={activeTab}
 *   onChange={handleTabChange}
 * />
 * ```
 */
const TabBar: React.FC<TabBarProps> = ({
  tabs,
  activeTab,
  onChange,
  tabListSx,
  tabSx,
  disableRipple = true,
  indicatorColor = DEFAULT_INDICATOR_COLOR,
  dataJoyrideId,
  disabledTabTooltip = "This tab is currently unavailable",
  scrollable = false,
}) => {
  // Memoize styles to prevent unnecessary recalculations
  const standardTabStyle = useMemo<SxProps<Theme>>(
    () => ({
      ...(classicUi ? {} : phase1TabStyle),
      ...(classicUi && {
        "textTransform": "none",
        "fontWeight": 400,
        "alignItems": "center",
        "justifyContent": "flex-end",
        "padding": "16px 0 7px",
        "minHeight": "20px",
        "minWidth": "auto",
        "&.Mui-selected": {
          color: indicatorColor,
        },
      }),
      ...tabSx,
    }),
    [indicatorColor, tabSx],
  );

  const getTabStyle = (isDisabled: boolean): SxProps<Theme> => ({
    ...standardTabStyle,
    ...(isDisabled && {
      opacity: 0.38,
      pointerEvents: "auto",
      cursor: "not-allowed",
    }),
  });

  const standardTabListStyle = useMemo<SxProps<Theme>>(
    () => ({
      "minHeight": "20px",
      "& .MuiTabs-flexContainer": {
        columnGap: TAB_GAP,
        // Phase 1: first tab 10px in, bar line under the whole row.
        ...(!classicUi && { paddingLeft: "10px", boxShadow: BAR_LINE }),
      },
      // Phase 1 shows the selected tab by its fill, not an underline.
      ...(!classicUi && { "& .MuiTabs-indicator": { display: "none" } }),
      // Scroll-arrow styling for scrollable variant — matches app tone.
      "& .MuiTabs-scrollButtons": {
        "width": "28px",
        "color": "text.tertiary",
        "alignSelf": "center",
        "transition": "color 120ms ease, opacity 120ms ease",
        "&:hover": { color: indicatorColor },
        "&.Mui-disabled": { opacity: 0 },
      },
      ...tabListSx,
    }),
    [tabListSx, indicatorColor],
  );

  // Validate activeTab exists in tabs array (development warning)
  if (process.env.NODE_ENV === "development") {
    const validValues = tabs.map((t) => t.value);
    if (!validValues.includes(activeTab)) {
      console.warn(
        `TabBar: activeTab "${activeTab}" is not in the tabs array. Valid values: ${validValues.join(", ")}`,
      );
    }
  }

  // Wrap onChange to prevent tab changes for disabled tabs
  const handleChange = (event: React.SyntheticEvent, newValue: string) => {
    const targetTab = tabs.find((tab) => tab.value === newValue);
    if (targetTab?.disabled) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    onChange(event, newValue);
  };

  return (
    <Box sx={classicUi ? { borderBottom: 1, borderColor: "divider" } : undefined}>
      <TabList
        onChange={handleChange}
        TabIndicatorProps={{ style: { backgroundColor: indicatorColor } }}
        sx={standardTabListStyle}
        data-joyride-id={dataJoyrideId}
        {...(scrollable && {
          variant: "scrollable" as const,
          scrollButtons: "auto" as const,
          allowScrollButtonsMobile: true,
        })}
      >
        {tabs.map((tab) => {
          // Look up the icon in the explicit registry (tree-shakeable)
          // Swap only a tab that already has an icon; a tab without one stays text only.
          const vwIcon = classicUi || !tab.icon ? undefined : tabIconName(tab.label, tab.value);
          const IconComponent = tab.icon ? getLucideIcon(tab.icon) : undefined;
          const iconElement = vwIcon ? (
            <VWIcon name={vwIcon} size={TAB_ICON_SIZE} color={icon.default} />
          ) : IconComponent ? (
            <IconComponent
              size={TAB_ICON_SIZE}
              strokeWidth={TAB_ICON_STROKE_WIDTH}
              opacity={TAB_ICON_OPACITY}
              color={classicUi ? undefined : icon.default}
            />
          ) : undefined;

          const fallbackTooltip = tab.tooltip || (tab.disabled ? disabledTabTooltip : "");
          const labelContent = createTabLabelWithCount({
            label: tab.label,
            icon: iconElement,
            count: tab.count,
            isLoading: tab.isLoading,
          });

          // Wrap label content in VWTooltip so Tab remains a direct child of TabList
          const label = tab.tooltipContent ? (
            <VWTooltip
              header={tab.tooltipContent.header}
              content={tab.tooltipContent.description}
              placement="top"
            >
              <span style={{ display: "inline-flex", alignItems: "center" }}>{labelContent}</span>
            </VWTooltip>
          ) : fallbackTooltip ? (
            <VWTooltip content={fallbackTooltip} placement="top">
              <span style={{ display: "inline-flex", alignItems: "center" }}>{labelContent}</span>
            </VWTooltip>
          ) : (
            labelContent
          );

          return (
            <Tab
              key={tab.value}
              label={label}
              value={tab.value}
              sx={getTabStyle(!!tab.disabled)}
              disableRipple={disableRipple}
              onClick={(e) => {
                if (tab.disabled) {
                  e.preventDefault();
                  e.stopPropagation();
                }
              }}
            />
          );
        })}
      </TabList>
    </Box>
  );
};

export default TabBar;
