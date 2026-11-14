import { FC, ReactNode, useState, useEffect, useRef, useContext } from "react";
import {
  Box,
  IconButton,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Stack,
  Tooltip,
  Typography,
  Chip,
  Popover,
} from "@mui/material";
import { useTheme } from "@mui/material";
import { useDispatch, useSelector } from "react-redux";
import { Link as RouterLink } from "react-router";
import {
  PanelLeftClose,
  PanelLeftOpen,
  Heart,
  ChevronDown,
  ChevronRight,
  FolderKanban,
  Plus,
  LayoutGrid,
} from "lucide-react";
import {
  brand,
  background,
  border as borderPalette,
  icon as iconPalette,
  primitives,
  text as textPalette,
  palette as vwPalette,
  radiusPx,
} from "../../themes/palette";
import { chartTheme } from "../../themes/chartTheme";
import { isClassicUi } from "../../themes/uiStyle";
import { toggleSidebar } from "../../../application/redux/ui/uiSlice";
import "../Layout/icon-shake.css";
import { VerifyWiseContext } from "../../../application/contexts/VerifyWise.context";
import VerifyWiseLogo from "../../assets/imgs/verifywise-logo.svg";
import SidebarFooter from "./SidebarFooter";
import { FlyingHearts } from "../FlyingHearts";

declare const __APP_VERSION__: string;

// Types for menu items

const classicUi = isClassicUi();
// Phase 1 (style guide §10): green.50 hover, green.100 selected, no border,
// icons in icon.default. Classic keeps the grey gradient.
const NAV_ACTIVE_BG = classicUi
  ? `linear-gradient(135deg, ${vwPalette.background.hover} 0%, ${vwPalette.background.hover} 100%)`
  : background.selected;
const NAV_ACTIVE_BORDER = classicUi
  ? `1px solid ${vwPalette.border.light}`
  : "1px solid transparent";
const NAV_HOVER_BG = classicUi ? vwPalette.background.alt : primitives.green[50];
const NAV_ICON_DEFAULT = classicUi ? textPalette.tertiary : iconPalette.default;
const NAV_ACTIVE_WEIGHT = classicUi ? 600 : 500;

export interface SidebarMenuItem {
  id: string;
  label: string;
  icon: React.ReactNode;
  path?: string;
  value?: string;
  count?: number;
  disabled?: boolean;
  highlightPaths?: string[];
  onClick?: () => void;
  dividerAfter?: boolean;
}

export interface SidebarMenuGroup {
  name: string;
  items: SidebarMenuItem[];
  /** When true, group is collapsible with a toggle chevron. Defaults to false. */
  collapsible?: boolean;
  /** Initial collapsed state when collapsible is true. Defaults to true (collapsed). */
  defaultCollapsed?: boolean;
}

export interface RecentSection {
  title: string;
  items: { id: string; name: string; onClick: () => void }[];
}

export interface ProjectSelectorConfig {
  currentProject: { id: string; name: string } | null;
  allProjects: { id: string; name: string }[];
  onProjectChange: (projectId: string) => void;
}

export interface SidebarShellProps {
  // Menu configuration
  topItems?: SidebarMenuItem[];
  menuGroups?: SidebarMenuGroup[];
  flatItems?: SidebarMenuItem[];
  recentSections?: RecentSection[];

  // Project selector (for Evals sidebar)
  projectSelector?: ProjectSelectorConfig;

  // Active state
  activeItemId?: string;
  isItemActive?: (item: SidebarMenuItem) => boolean;

  // Callbacks
  onItemClick?: (item: SidebarMenuItem) => void;

  // Footer props
  hasDemoData?: boolean;
  onOpenCreateDemoData?: () => void;
  onOpenDeleteDemoData?: () => void;
  onDismissDemoDataButton?: () => void;
  showDemoDataButton?: boolean;
  showReadyToSubscribe?: boolean;
  /** Only show demo data options to admins */
  isAdmin?: boolean;

  // Enable flying hearts Easter egg (only for main sidebar)
  enableFlyingHearts?: boolean;

  /** Custom navigation rendered in the menu after the built-in sections (unified sidebar). */
  navContent?: ReactNode;
  /**
   * Navigation pinned below the scrolling menu, just above the footer
   * (unified sidebar: the Workspace group). Absent: nothing is rendered.
   */
  footerNav?: ReactNode;
  /** Scrollbar thumb colour of the menu. Absent: today's border.light thumb. */
  navScrollbarThumb?: string;
}

const COUNT_CHIP_SX = (isActive: boolean) => ({
  "height": "18px",
  "fontSize": "10px",
  "fontWeight": 500,
  "backgroundColor": isActive ? vwPalette.background.alt : vwPalette.border.light,
  "color": vwPalette.text.tertiary,
  "borderRadius": radiusPx.pill,
  "minWidth": "18px",
  "maxWidth": "36px",
  "& .MuiChip-label": {
    px: "6px",
    py: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  "ml": "auto",
});

export interface SidebarItemRowProps {
  item: SidebarMenuItem;
  isActive: boolean;
  collapsed: boolean;
  onClick: () => void;
  /** Label tooltip when the sidebar is collapsed. Defaults to true. */
  showTooltip?: boolean;
  /** Icon colour when the row is neither selected nor disabled. Defaults to the nav icon colour. */
  iconColor?: string;
  /** Rendered at the end of the row (expanded sidebar only), e.g. a chevron. */
  endAdornment?: ReactNode;
  /** Set on rows that open a list of sub-items. */
  ariaExpanded?: boolean;
  ariaControls?: string;
  /** Left padding override, e.g. for sub-items without an icon. */
  paddingLeft?: string;
  /** Tooltip shown on hover in any sidebar state, e.g. why the row is disabled. */
  tooltip?: string;
  testId?: string;
}

/**
 * One sidebar row: icon, label and count chip, selected/hover/disabled
 * styling. SidebarShell renders its items with it; the unified sidebar uses
 * the optional props for part-coloured icons, chevrons and sub-items.
 */
export const SidebarItemRow: FC<SidebarItemRowProps> = ({
  item,
  isActive,
  collapsed,
  onClick,
  showTooltip = true,
  iconColor = NAV_ICON_DEFAULT,
  endAdornment,
  ariaExpanded,
  ariaControls,
  paddingLeft,
  tooltip,
  testId,
}) => {
  const theme = useTheme();
  const isDisabled = item.disabled;
  // WCAG 2.5.3 (label-content-name-mismatch): when the count chip is
  // rendered, its text is visible inside the button, so the accessible name
  // must contain it. Axe 4.14+ enforces this rule.
  const count = item.count ?? 0;
  const showsCountChip = !collapsed && count > 0 && !isDisabled;
  const accessibleLabel = showsCountChip
    ? `${item.label} ${count > 99 ? "99+" : count}`
    : item.label;
  const iconTone = isDisabled
    ? `${theme.palette.text.disabled} !important`
    : isActive
      ? `${brand.primary} !important`
      : `${iconColor} !important`;

  const tooltipSlotProps = {
    popper: {
      modifiers: [{ name: "offset", options: { offset: [0, -16] } }],
    },
  };

  const button = (
    <ListItemButton
      disableRipple={theme.components?.MuiListItemButton?.defaultProps?.disableRipple}
      className={isActive ? "selected-path" : "unselected"}
      onClick={onClick}
      disabled={isDisabled}
      aria-label={accessibleLabel}
      aria-expanded={ariaExpanded}
      aria-controls={ariaControls}
      data-testid={testId}
      sx={{
        "height": "32px",
        "gap": collapsed ? 0 : theme.spacing(4),
        "borderRadius": theme.shape.borderRadius,
        "px": theme.spacing(4),
        ...(paddingLeft && !collapsed ? { pl: paddingLeft } : {}),
        "justifyContent": collapsed ? "center" : "flex-start",
        "opacity": isDisabled ? 0.5 : 1,
        "cursor": isDisabled ? "not-allowed" : "pointer",
        "& .MuiListItemText-root": {
          display: collapsed ? "none" : "block",
        },
        "background": isActive && !isDisabled ? NAV_ACTIVE_BG : "transparent",
        "border": isActive && !isDisabled ? NAV_ACTIVE_BORDER : "1px solid transparent",
        "&:hover": {
          background: isDisabled ? "transparent" : isActive ? NAV_ACTIVE_BG : NAV_HOVER_BG,
          border: isDisabled
            ? "1px solid transparent"
            : isActive
              ? NAV_ACTIVE_BORDER
              : "1px solid transparent",
        },
        "&:hover svg": isDisabled
          ? {}
          : {
              color: `${brand.primary} !important`,
              stroke: `${brand.primary} !important`,
              animation: "icon-shake 400ms ease-in-out",
            },
        "&:hover svg path": isDisabled
          ? {}
          : {
              stroke: `${brand.primary} !important`,
            },
        "&.Mui-disabled": {
          opacity: 0.5,
        },
      }}
    >
      {item.icon && (
        <ListItemIcon
          sx={{
            "minWidth": 0,
            "display": "flex",
            "alignItems": "center",
            "justifyContent": "center",
            "width": "16px",
            "mr": 0,
            "& svg": {
              color: iconTone,
              stroke: iconTone,
              transition: "color 0.2s ease, stroke 0.2s ease",
            },
            "& svg path": {
              stroke: iconTone,
            },
          }}
        >
          {item.icon}
        </ListItemIcon>
      )}
      {!collapsed && (
        <ListItemText
          sx={{
            "& .MuiListItemText-primary": {
              fontSize: "13px",
              fontWeight: isActive ? NAV_ACTIVE_WEIGHT : 400,
              color: isDisabled
                ? theme.palette.text.disabled
                : isActive
                  ? theme.palette.text.primary
                  : theme.palette.text.secondary,
            },
          }}
        >
          {item.label}
        </ListItemText>
      )}
      {/* Whitespace text node inside the fragment: keeps the label and the
          count chip as separate words for axe's label-content-name-mismatch
          tokenization (WCAG 2.5.3). React emits no inter-element whitespace,
          so without it the visible text joins into "Tasks12" while the
          accessible name is "Tasks 12", and the tokens no longer match. */}
      {!collapsed && item.count !== undefined && item.count > 0 && !isDisabled && (
        <>
          {" "}
          <Chip
            label={item.count > 99 ? "99+" : item.count}
            size="small"
            sx={COUNT_CHIP_SX(isActive)}
          />
        </>
      )}
      {!collapsed && endAdornment}
    </ListItemButton>
  );

  // A disabled button gets no pointer events; the span carries the tooltip.
  // With a `tooltip` (unified sidebar) the span keeps the row full width;
  // without one (classic sidebars) it stays inline-block as before.
  const menuItemContent = isDisabled ? (
    <span style={tooltip ? { display: "block", width: "100%" } : { display: "inline-block" }}>
      {button}
    </span>
  ) : (
    button
  );

  if (tooltip || (collapsed && showTooltip)) {
    return (
      <Tooltip
        placement="right"
        title={tooltip ?? item.label}
        slotProps={tooltipSlotProps}
        disableInteractive
      >
        {menuItemContent}
      </Tooltip>
    );
  }

  return (
    <Box component="span" sx={{ display: "block" }}>
      {menuItemContent}
    </Box>
  );
};

/** Evals project picker: current project, all projects, new project. */
export const SidebarProjectSelector: FC<ProjectSelectorConfig> = (projectSelector) => {
  const theme = useTheme();
  const [projectMenuAnchor, setProjectMenuAnchor] = useState<null | HTMLElement>(null);
  const projectMenuOpen = Boolean(projectMenuAnchor);

  return (
    <Box sx={{ mb: theme.spacing(4) }}>
      <Box
        onClick={(e) => setProjectMenuAnchor(e.currentTarget)}
        sx={{
          "display": "flex",
          "alignItems": "center",
          "gap": 1,
          "px": "12px",
          "height": "34px",
          "borderRadius": theme.shape.borderRadius,
          "cursor": "pointer",
          "backgroundColor": theme.palette.background.main,
          "border": `1px solid ${theme.palette.border?.dark || borderPalette.dark}`,
          "transition": "all 0.2s ease",
          "&:hover": {
            borderColor: brand.primary,
          },
        }}
      >
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography
            sx={{
              fontSize: "13px",
              fontWeight: 400,
              color: theme.palette.text.secondary,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {projectSelector.currentProject?.name || "Select project"}
          </Typography>
        </Box>
        <ChevronDown size={16} color={theme.palette.text.tertiary} />
      </Box>
      <Popover
        open={projectMenuOpen}
        anchorEl={projectMenuAnchor}
        onClose={() => setProjectMenuAnchor(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "left" }}
        transformOrigin={{ vertical: "top", horizontal: "left" }}
        sx={{
          "& .MuiPopover-paper": {
            minWidth: 220,
            maxWidth: 280,
            maxHeight: 360,
            boxShadow: "0 4px 16px rgba(0,0,0,0.12)",
            borderRadius: radiusPx.lg,
            border: `1px solid ${borderPalette.light}`,
            mt: 1,
            overflow: "hidden",
          },
        }}
      >
        <Box sx={{ py: 1 }}>
          {/* All projects option */}
          <Box
            onClick={() => {
              projectSelector.onProjectChange("all_projects");
              setProjectMenuAnchor(null);
            }}
            sx={{
              "display": "flex",
              "alignItems": "center",
              "fontSize": "13px",
              "py": 1.25,
              "px": 2,
              "mx": 1,
              "borderRadius": radiusPx.md,
              "color": theme.palette.text.secondary,
              "cursor": "pointer",
              "transition": "all 0.15s ease",
              "&:hover": {
                backgroundColor: background.hover,
                color: theme.palette.text.primary,
              },
            }}
          >
            <LayoutGrid size={15} style={{ marginRight: 10, opacity: 0.7 }} />
            All projects
          </Box>

          {/* Projects section */}
          {projectSelector.allProjects.length > 0 && (
            <>
              <Box
                sx={{
                  borderTop: `1px solid ${borderPalette.light}`,
                  mx: 2,
                  my: 1,
                }}
              />
              <Typography
                sx={{
                  fontSize: "11px",
                  fontWeight: 600,
                  color: theme.palette.text.tertiary,
                  textTransform: "uppercase",
                  letterSpacing: "0.5px",
                  px: 3,
                  py: 0.75,
                }}
              >
                Projects
              </Typography>
              <Box sx={{ maxHeight: 160, overflowY: "auto" }}>
                {projectSelector.allProjects.map((project) => {
                  const isSelected = project.id === projectSelector.currentProject?.id;
                  return (
                    <Box
                      key={project.id}
                      onClick={() => {
                        projectSelector.onProjectChange(project.id);
                        setProjectMenuAnchor(null);
                      }}
                      sx={{
                        "display": "flex",
                        "alignItems": "center",
                        "fontSize": "13px",
                        "py": 1.25,
                        "px": 2,
                        "mx": 1,
                        "borderRadius": radiusPx.md,
                        "cursor": "pointer",
                        "backgroundColor": isSelected ? vwPalette.status.success.bg : "transparent",
                        "borderLeft": isSelected
                          ? `3px solid ${brand.primary}`
                          : "3px solid transparent",
                        "color": theme.palette.text.primary,
                        "fontWeight": isSelected ? 500 : 400,
                        "transition": "all 0.15s ease",
                        "&:hover": {
                          backgroundColor: isSelected
                            ? vwPalette.status.success.bg
                            : "background.hover",
                        },
                      }}
                    >
                      <FolderKanban
                        size={15}
                        style={{
                          marginRight: 10,
                          opacity: isSelected ? 1 : 0.6,
                          color: isSelected ? brand.primary : "inherit",
                        }}
                      />
                      <Box
                        sx={{
                          flex: 1,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {project.name}
                      </Box>
                    </Box>
                  );
                })}
              </Box>
            </>
          )}

          {/* New project option */}
          {projectSelector.allProjects.length > 0 && (
            <Box
              sx={{
                borderTop: `1px solid ${borderPalette.light}`,
                mx: 2,
                mt: 1,
                mb: 0.5,
              }}
            />
          )}
          <Box
            onClick={() => {
              projectSelector.onProjectChange("create_new");
              setProjectMenuAnchor(null);
            }}
            sx={{
              "display": "flex",
              "alignItems": "center",
              "fontSize": "13px",
              "fontWeight": 500,
              "py": 1.25,
              "px": 2,
              "mx": 1,
              "mt": projectSelector.allProjects.length === 0 ? 0.5 : 0,
              "borderRadius": radiusPx.md,
              "color": brand.primary,
              "cursor": "pointer",
              "transition": "all 0.15s ease",
              "&:hover": {
                backgroundColor: vwPalette.status.success.bg,
              },
            }}
          >
            <Plus size={15} style={{ marginRight: 10 }} />
            New project
          </Box>
        </Box>
      </Popover>
    </Box>
  );
};

/** A "Recent …" list (up to three entries); renders nothing when empty. */
export const SidebarRecentSection: FC<{ section: RecentSection }> = ({ section }) => {
  const theme = useTheme();
  if (section.items.length === 0) return null;
  return (
    <Box sx={{ mt: theme.spacing(4) }}>
      <Typography
        sx={{
          fontSize: "10px",
          fontWeight: 500,
          color: theme.palette.text.disabled,
          textTransform: "uppercase",
          letterSpacing: "0.5px",
          mb: 0.5,
          px: theme.spacing(4),
        }}
      >
        {section.title}
      </Typography>
      {section.items.slice(0, 3).map((item) => (
        <ListItemButton
          key={item.id}
          onClick={item.onClick}
          disableRipple
          sx={{
            "height": "30px",
            "borderRadius": radiusPx.sm,
            "px": theme.spacing(4),
            "mb": 0.25,
            "&:hover": { backgroundColor: vwPalette.background.alt },
          }}
        >
          <ListItemText
            sx={{
              "& .MuiListItemText-primary": {
                fontSize: "12px",
                color: theme.palette.text.secondary,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              },
            }}
          >
            {item.name}
          </ListItemText>
        </ListItemButton>
      ))}
    </Box>
  );
};

const SidebarShell: FC<SidebarShellProps> = ({
  topItems = [],
  menuGroups = [],
  flatItems = [],
  recentSections = [],
  projectSelector,
  activeItemId,
  isItemActive,
  onItemClick,
  hasDemoData = false,
  onOpenCreateDemoData,
  onOpenDeleteDemoData,
  onDismissDemoDataButton,
  showDemoDataButton = true,
  showReadyToSubscribe = false,
  isAdmin = false,
  enableFlyingHearts = false,
  navContent,
  footerNav,
  navScrollbarThumb,
}) => {
  const theme = useTheme();
  const dispatch = useDispatch();

  // Heart icon state (Easter egg)
  const [showHeartIcon, setShowHeartIcon] = useState(false);
  const [showFlyingHearts, setShowFlyingHearts] = useState(false);
  const [heartReturning, setHeartReturning] = useState(false);
  const heartTimerRef = useRef<NodeJS.Timeout | null>(null);

  // VerifyWiseContext available for future use
  useContext(VerifyWiseContext);

  const collapsed = useSelector((state: any) => state.ui?.sidebar?.collapsed);

  // Collapsible group state: track which groups are collapsed by name
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {};
    menuGroups.forEach((g) => {
      if (g.collapsible) {
        initial[g.name] = g.defaultCollapsed !== false; // default collapsed
      }
    });
    return initial;
  });

  const toggleGroup = (name: string) => {
    setCollapsedGroups((prev) => ({ ...prev, [name]: !prev[name] }));
  };

  // Delayed collapsed state for smooth animation
  const [delayedCollapsed, setDelayedCollapsed] = useState(collapsed);

  useEffect(() => {
    if (collapsed) {
      setDelayedCollapsed(true);
      return;
    } else {
      const timer = setTimeout(() => {
        setDelayedCollapsed(false);
      }, 650);
      return () => clearTimeout(timer);
    }
  }, [collapsed]);

  // Heart hover handler
  const handleLogoHover = () => {
    if (!enableFlyingHearts) return;
    setShowHeartIcon(true);
    setHeartReturning(false);

    if (heartTimerRef.current) {
      clearTimeout(heartTimerRef.current);
    }

    heartTimerRef.current = setTimeout(() => {
      setHeartReturning(true);
      setTimeout(() => {
        setShowHeartIcon(false);
        setHeartReturning(false);
      }, 500);
    }, 5000);
  };

  const handleHeartClick = () => {
    setShowFlyingHearts(true);
    setTimeout(() => {
      setHeartReturning(true);
      setTimeout(() => {
        setShowHeartIcon(false);
        setHeartReturning(false);
      }, 500);
    }, 1500);
  };

  useEffect(() => {
    return () => {
      if (heartTimerRef.current) {
        clearTimeout(heartTimerRef.current);
      }
    };
  }, []);

  // Check if item is active
  const checkIsActive = (item: SidebarMenuItem): boolean => {
    if (isItemActive) {
      return isItemActive(item);
    }
    if (activeItemId) {
      return item.id === activeItemId || item.value === activeItemId || item.path === activeItemId;
    }
    return false;
  };

  // Handle item click
  const handleItemClick = (item: SidebarMenuItem) => {
    if (item.disabled) return;
    if (item.onClick) {
      item.onClick();
    }
    if (onItemClick) {
      onItemClick(item);
    }
  };

  // Render a single menu item
  const renderMenuItem = (item: SidebarMenuItem, showTooltip = true) => (
    <SidebarItemRow
      key={item.id}
      item={item}
      isActive={checkIsActive(item)}
      collapsed={collapsed}
      showTooltip={showTooltip}
      onClick={() => handleItemClick(item)}
    />
  );

  return (
    <Stack
      component="aside"
      className={`sidebar-menu ${collapsed ? "collapsed" : "expanded"}`}
      py={theme.spacing(6)}
      gap={theme.spacing(2)}
      sx={{
        width: collapsed ? "78px" : "260px",
        minWidth: collapsed ? "78px" : "260px",
        maxWidth: collapsed ? "78px" : "260px",
        flexShrink: 0,
        height: "100vh",
        overflowY: "auto",
        overflowX: "hidden",
        border: "none",
        borderRight: `1px solid ${theme.palette.border?.dark || borderPalette.dark}`,
        borderRadius: 0,
        backgroundColor: theme.palette.background.main,
        transition:
          "width 650ms cubic-bezier(0.36, -0.01, 0, 0.77), min-width 650ms cubic-bezier(0.36, -0.01, 0, 0.77), max-width 650ms cubic-bezier(0.36, -0.01, 0, 0.77)",
      }}
    >
      {/* Logo Header */}
      <Stack
        pt="4px"
        pb="8px"
        sx={{
          position: "relative",
          pl: delayedCollapsed
            ? theme.spacing(8)
            : `calc(${theme.spacing(8)} + ${theme.spacing(4)})`,
          pr: theme.spacing(8),
        }}
      >
        <Stack
          direction="row"
          alignItems="center"
          justifyContent={delayedCollapsed ? "center" : "flex-start"}
          gap={theme.spacing(2)}
          className="app-title"
          sx={{ position: "relative", height: "20px" }}
        >
          {!delayedCollapsed && (
            <Box
              onMouseEnter={handleLogoHover}
              sx={{
                position: "relative",
                display: "flex",
                alignItems: "center",
              }}
            >
              {/* Heart Icon Easter Egg */}
              {enableFlyingHearts && showHeartIcon && (
                <Tooltip title="Spread some love!">
                  <IconButton
                    onClick={handleHeartClick}
                    aria-label="Spread some love"
                    sx={{
                      "position": "absolute",
                      "top": "-16px",
                      "left": "50%",
                      "transform": "translateX(-50%)",
                      "padding": 0,
                      "zIndex": 10,
                      "&:hover": { backgroundColor: "transparent" },
                      "animation": heartReturning
                        ? "slideDownBehind 0.5s ease-in forwards"
                        : "slideUpFromBehind 0.5s ease-out",
                      "@keyframes slideUpFromBehind": {
                        "0%": {
                          opacity: 0,
                          transform: "translateX(-50%) translateY(28px)",
                          zIndex: -1,
                        },
                        "60%": { zIndex: -1 },
                        "70%": { opacity: 1, zIndex: 10 },
                        "100%": {
                          opacity: 1,
                          transform: "translateX(-50%) translateY(0)",
                          zIndex: 10,
                        },
                      },
                      "@keyframes slideDownBehind": {
                        "0%": {
                          opacity: 1,
                          transform: "translateX(-50%) translateY(0)",
                          zIndex: 10,
                        },
                        "30%": { opacity: 0.7, zIndex: 10 },
                        "40%": { zIndex: -1 },
                        "100%": {
                          opacity: 0,
                          transform: "translateX(-50%) translateY(28px)",
                          zIndex: -1,
                        },
                      },
                    }}
                  >
                    <Heart
                      size={14}
                      color={chartTheme.entity.heart}
                      strokeWidth={1.5}
                      fill={chartTheme.entity.heart}
                    />
                  </IconButton>
                </Tooltip>
              )}
              <RouterLink to="/" style={{ display: "flex", alignItems: "center" }}>
                <img
                  src={VerifyWiseLogo}
                  alt="VerifyWise"
                  height={20}
                  className="dark-mode-keep-inverted"
                  style={{ position: "relative", zIndex: 1, display: "block" }}
                />
              </RouterLink>
              <span
                style={{
                  fontSize: "8px",
                  marginLeft: "4px",
                  opacity: 0.6,
                  fontWeight: 400,
                }}
              >
                {__APP_VERSION__}
              </span>
            </Box>
          )}
          {/* Sidebar Toggle Button */}
          <IconButton
            disableRipple={theme.components?.MuiListItemButton?.defaultProps?.disableRipple}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            sx={{
              "position": "absolute",
              "right": delayedCollapsed ? "50%" : 0,
              "transform": delayedCollapsed ? "translateX(50%)" : "none",
              "top": 0,
              "bottom": 0,
              "display": "flex",
              "alignItems": "center",
              "p": theme.spacing(2),
              "borderRadius": theme.shape.borderRadius,
              "transition":
                "right 0.65s cubic-bezier(0.36, -0.01, 0, 0.77), transform 0.65s cubic-bezier(0.36, -0.01, 0, 0.77)",
              "& svg": {
                "opacity": 0.9,
                "& path": { stroke: theme.palette.text.tertiary },
              },
              "&:hover": { backgroundColor: vwPalette.background.alt },
              "&:hover svg path": { stroke: brand.primary },
            }}
            onClick={() => dispatch(toggleSidebar())}
          >
            {collapsed ? (
              <PanelLeftOpen size={16} strokeWidth={1.5} />
            ) : (
              <PanelLeftClose size={16} strokeWidth={1.5} />
            )}
          </IconButton>
        </Stack>
      </Stack>

      {/* Menu */}
      <List
        component="nav"
        disablePadding
        sx={{
          "px": theme.spacing(8),
          "flex": 1,
          "overflowY": "auto",
          "overflowX": "hidden",
          "&::-webkit-scrollbar": { width: "4px" },
          "&::-webkit-scrollbar-track": { background: "transparent" },
          "&::-webkit-scrollbar-thumb": {
            background: navScrollbarThumb ?? (theme.palette.border?.light || borderPalette.light),
            borderRadius: "2px",
          },
          "&::-webkit-scrollbar-thumb:hover": {
            background: theme.palette.border?.dark || borderPalette.dark,
          },
        }}
      >
        {/* Project Selector (for Evals sidebar) */}
        {projectSelector && !delayedCollapsed && <SidebarProjectSelector {...projectSelector} />}

        {/* Top Items */}
        {topItems.map((item) => renderMenuItem(item))}

        {/* Flat Items (no groups) */}
        {flatItems.map((item) => (
          <Box key={item.id}>
            {renderMenuItem(item)}
            {item.dividerAfter && (
              <Box
                sx={{
                  my: 1.5,
                  mx: theme.spacing(4),
                  borderTop: `1px solid ${borderPalette.light}`,
                }}
              />
            )}
          </Box>
        ))}

        {/* Grouped Items */}
        {menuGroups.map((group) => {
          const isCollapsible = group.collapsible && !collapsed;
          const isGroupCollapsed = isCollapsible && collapsedGroups[group.name];

          return (
            <Box key={group.name}>
              <Box
                onClick={isCollapsible ? () => toggleGroup(group.name) : undefined}
                sx={{
                  "display": collapsed ? "none" : "flex",
                  "alignItems": "center",
                  "justifyContent": "space-between",
                  "px": theme.spacing(4),
                  "pt": theme.spacing(4.5),
                  "pb": theme.spacing(1.5),
                  "mt": theme.spacing(3),
                  "cursor": isCollapsible ? "pointer" : "default",
                  "userSelect": "none",
                  "&:hover": isCollapsible ? { opacity: 0.8 } : {},
                }}
              >
                <Typography
                  variant="overline"
                  className="sidebar-group-header"
                  sx={{
                    color: `${vwPalette.text.disabled} !important`,
                    fontSize: "11px !important",
                    fontWeight: 400,
                    letterSpacing: "0.5px",
                    textTransform: "uppercase",
                    lineHeight: 1,
                  }}
                >
                  {group.name}
                </Typography>
                {isCollapsible &&
                  (isGroupCollapsed ? (
                    <ChevronRight size={14} color={vwPalette.text.disabled} />
                  ) : (
                    <ChevronDown size={14} color={vwPalette.text.disabled} />
                  ))}
              </Box>
              {!isGroupCollapsed &&
                group.items.map((item) => (
                  <Box key={item.id}>
                    {renderMenuItem(item)}
                    {item.dividerAfter && !collapsed && (
                      <Box
                        sx={{
                          my: 1.5,
                          mx: theme.spacing(4),
                          borderTop: `1px solid ${borderPalette.light}`,
                        }}
                      />
                    )}
                  </Box>
                ))}
            </Box>
          );
        })}

        {/* Recent Sections - right after menu items */}
        {!delayedCollapsed &&
          recentSections.map((section) => (
            <SidebarRecentSection key={section.title} section={section} />
          ))}

        {/* Custom navigation (the unified sidebar renders its own groups here) */}
        {navContent}
      </List>

      {/* Pinned navigation: stays above the footer; the menu scrolls instead */}
      {footerNav && (
        <Box data-testid="sidebar-footer-nav" sx={{ px: theme.spacing(8), flexShrink: 0 }}>
          {footerNav}
        </Box>
      )}

      {/* Shared Footer */}
      <SidebarFooter
        collapsed={collapsed}
        delayedCollapsed={delayedCollapsed}
        hasDemoData={hasDemoData}
        onOpenCreateDemoData={onOpenCreateDemoData}
        onOpenDeleteDemoData={onOpenDeleteDemoData}
        onDismissDemoDataButton={onDismissDemoDataButton}
        showDemoDataButton={showDemoDataButton}
        showReadyToSubscribe={showReadyToSubscribe}
        isAdmin={isAdmin}
      />

      {/* Flying Hearts Animation */}
      {enableFlyingHearts && showFlyingHearts && (
        <FlyingHearts onComplete={() => setShowFlyingHearts(false)} />
      )}
    </Stack>
  );
};

export default SidebarShell;
