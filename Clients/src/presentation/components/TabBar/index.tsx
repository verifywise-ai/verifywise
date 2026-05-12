import React, { useMemo } from "react";
import { Box, SxProps, Theme } from "@mui/material";
import Tab from "@mui/material/Tab";
import TabList from "@mui/lab/TabList";
import { createTabLabelWithCount } from "../../utils/tabUtils";
import * as LucideIcons from "lucide-react";
import { LucideIcon } from "lucide-react";
import VWTooltip from "../VWTooltip";
import { brand } from "../../themes/palette";

export interface TabItem {
  label: string;
  value: string;
  icon?: keyof typeof LucideIcons;
  count?: number;
  isLoading?: boolean;
  disabled?: boolean;
  /** Optional tooltip shown on hover to explain the tab's purpose */
  tooltip?: string;
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
}

// Constants for consistent styling
const TAB_ICON_SIZE = 14;
const TAB_ICON_STROKE_WIDTH = 1.5;
const TAB_ICON_OPACITY = 1;
const TAB_GAP = "34px";
const DEFAULT_INDICATOR_COLOR = `${brand.primary}`;

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
}) => {
  // Memoize styles to prevent unnecessary recalculations
  const standardTabStyle = useMemo<SxProps<Theme>>(
    () => ({
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
      },
      ...tabListSx,
    }),
    [tabListSx],
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
    <Box sx={{ borderBottom: 1, borderColor: "divider" }}>
      <TabList
        onChange={handleChange}
        TabIndicatorProps={{ style: { backgroundColor: indicatorColor } }}
        sx={standardTabListStyle}
        data-joyride-id={dataJoyrideId}
      >
        {tabs.map((tab) => {
          // Dynamically get the icon component from lucide-react
          const IconComponent = tab.icon ? (LucideIcons[tab.icon] as LucideIcon) : undefined;
          const iconElement = IconComponent ? (
            <IconComponent
              size={TAB_ICON_SIZE}
              strokeWidth={TAB_ICON_STROKE_WIDTH}
              opacity={TAB_ICON_OPACITY}
            />
          ) : undefined;

          const tooltipText = tab.tooltip || (tab.disabled ? disabledTabTooltip : "");
          const labelContent = createTabLabelWithCount({
            label: tab.label,
            icon: iconElement,
            count: tab.count,
            isLoading: tab.isLoading,
          });

          // Wrap label content in VWTooltip so Tab remains a direct child of TabList
          const label = tooltipText ? (
            <VWTooltip content={tooltipText} placement="top">
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
