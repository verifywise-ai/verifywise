import { FC, useState, useEffect, useRef, useContext } from "react";
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
import { Link as RouterLink } from "react-router-dom";
import {
  PanelLeftClose,
  PanelLeftOpen,
  Heart,
  ChevronDown,
  FolderKanban,
  Plus,
  LayoutGrid,
} from "lucide-react";
import { brand, background, border as borderPalette } from "../../themes/palette";;
import { toggleSidebar } from "../../../application/redux/ui/uiSlice";
import "../Layout/icon-shake.css";
import { VerifyWiseContext } from "../../../application/contexts/VerifyWise.context";
import VerifyWiseLogo from "../../assets/imgs/verifywise-logo.svg";
import SidebarFooter from "./SidebarFooter";
import { FlyingHearts } from "../FlyingHearts";

declare const __APP_VERSION__: string;

// Types for menu items
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
  openUserGuide?: () => void;
  openReleaseNotes?: () => void;
  /** Only show demo data options to admins */
  isAdmin?: boolean;

  // Enable flying hearts Easter egg (only for main sidebar)
  enableFlyingHearts?: boolean;
}

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
  openUserGuide,
  openReleaseNotes,
  isAdmin = false,
  enableFlyingHearts = false,
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

  // Delayed collapsed state for smooth animation
  const [delayedCollapsed, setDelayedCollapsed] = useState(collapsed);

  // Project selector menu state
  const [projectMenuAnchor, setProjectMenuAnchor] =
    useState<null | HTMLElement>(null);
  const projectMenuOpen = Boolean(projectMenuAnchor);

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
      return (
        item.id === activeItemId ||
        item.value === activeItemId ||
        item.path === activeItemId
      );
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
  const renderMenuItem = (item: SidebarMenuItem, showTooltip = true) => {
    const isActive = checkIsActive(item);
    const isDisabled = item.disabled;

    return (
      <Tooltip
        key={item.id}
        placement="right"
        title={collapsed && showTooltip ? item.label : ""}
        slotProps={{
          popper: {
            modifiers: [{ name: "offset", options: { offset: [0, -16] } }],
          },
        }}
        disableInteractive
      >
        {isDisabled ? (
          <span style={{ display: "inline-block" }}>
            <ListItemButton
              disableRipple={
                theme.components?.MuiListItemButton?.defaultProps?.disableRipple
              }
              className={isActive ? "selected-path" : "unselected"}
              onClick={() => handleItemClick(item)}
              disabled={isDisabled}
              sx={{
                height: "32px",
                gap: collapsed ? 0 : theme.spacing(4),
                borderRadius: theme.shape.borderRadius,
                px: theme.spacing(4),
                justifyContent: collapsed ? "center" : "flex-start",
                opacity: isDisabled ? 0.5 : 1,
                cursor: isDisabled ? "not-allowed" : "pointer",
                "& .MuiListItemText-root": {
                  display: collapsed ? "none" : "block",
                },
                background:
                  isActive && !isDisabled
                    ? "linear-gradient(135deg, #F7F7F7 0%, #F2F2F2 100%)"
                    : "transparent",
                border:
                  isActive && !isDisabled
                    ? "1px solid #E8E8E8"
                    : "1px solid transparent",
                "&:hover": {
                  background: isDisabled
                    ? "transparent"
                    : isActive
                    ? "linear-gradient(135deg, #F7F7F7 0%, #F2F2F2 100%)"
                    : "#FAFAFA",
                  border: isDisabled
                    ? "1px solid transparent"
                    : isActive
                    ? "1px solid #E8E8E8"
                    : "1px solid transparent",
                },
                "&:hover svg": isDisabled
                  ? {}
                  : {
                      color: `${brand.primary} !important`,
                      stroke: `${brand.primary} !important`,
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
              <ListItemIcon
                sx={{
                  minWidth: 0,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: "16px",
                  mr: 0,
                  "& svg": {
                    color: isDisabled
                      ? `${theme.palette.text.disabled} !important`
                      : isActive
                      ? `${brand.primary} !important`
                      : `${theme.palette.text.tertiary} !important`,
                    stroke: isDisabled
                      ? `${theme.palette.text.disabled} !important`
                      : isActive
                      ? `${brand.primary} !important`
                      : `${theme.palette.text.tertiary} !important`,
                    transition: "color 0.2s ease, stroke 0.2s ease",
                  },
                  "& svg path": {
                    stroke: isDisabled
                      ? `${theme.palette.text.disabled} !important`
                      : isActive
                      ? `${brand.primary} !important`
                      : `${theme.palette.text.tertiary} !important`,
                  },
                }}
              >
                {item.icon}
              </ListItemIcon>
              {!delayedCollapsed && (
                <ListItemText
                  sx={{
                    "& .MuiListItemText-primary": {
                      fontSize: "13px",
                      fontWeight: isActive ? 600 : 400,
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
              {!collapsed &&
                item.count !== undefined &&
                item.count > 0 &&
                !isDisabled && (
                  <Chip
                    label={item.count > 99 ? "99+" : item.count}
                    size="small"
                    sx={{
                      height: "18px",
                      fontSize: "10px",
                      fontWeight: 500,
                      backgroundColor: isActive ? "#f8fafc" : "#e2e8f0",
                      color: "#475569",
                      borderRadius: "9px",
                      minWidth: "18px",
                      maxWidth: "36px",
                      "& .MuiChip-label": {
                        px: "6px",
                        py: 0,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      },
                      ml: "auto",
                    }}
                  />
                )}
            </ListItemButton>
          </span>
        ) : (
          <ListItemButton
            disableRipple={
              theme.components?.MuiListItemButton?.defaultProps?.disableRipple
            }
            className={isActive ? "selected-path" : "unselected"}
            onClick={() => handleItemClick(item)}
            disabled={isDisabled}
            sx={{
              height: "32px",
              gap: collapsed ? 0 : theme.spacing(4),
              borderRadius: theme.shape.borderRadius,
              px: theme.spacing(4),
              justifyContent: collapsed ? "center" : "flex-start",
              opacity: isDisabled ? 0.5 : 1,
              cursor: isDisabled ? "not-allowed" : "pointer",
              "& .MuiListItemText-root": {
                display: collapsed ? "none" : "block",
              },
              background:
                isActive && !isDisabled
                  ? "linear-gradient(135deg, #F7F7F7 0%, #F2F2F2 100%)"
                  : "transparent",
              border:
                isActive && !isDisabled
                  ? "1px solid #E8E8E8"
                  : "1px solid transparent",
              "&:hover": {
                background: isDisabled
                  ? "transparent"
                  : isActive
                  ? "linear-gradient(135deg, #F7F7F7 0%, #F2F2F2 100%)"
                  : "#FAFAFA",
                border: isDisabled
                  ? "1px solid transparent"
                  : isActive
                  ? "1px solid #E8E8E8"
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
            <ListItemIcon
              sx={{
                minWidth: 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: "16px",
                mr: 0,
                "& svg": {
                  color: isDisabled
                    ? `${theme.palette.text.disabled} !important`
                    : isActive
                    ? `${brand.primary} !important`
                    : `${theme.palette.text.tertiary} !important`,
                  stroke: isDisabled
                    ? `${theme.palette.text.disabled} !important`
                    : isActive
                    ? `${brand.primary} !important`
                    : `${theme.palette.text.tertiary} !important`,
                  transition: "color 0.2s ease, stroke 0.2s ease",
                },
                "& svg path": {
                  stroke: isDisabled
                    ? `${theme.palette.text.disabled} !important`
                    : isActive
                    ? `${brand.primary} !important`
                    : `${theme.palette.text.tertiary} !important`,
                },
              }}
            >
              {item.icon}
            </ListItemIcon>
            {!delayedCollapsed && (
              <ListItemText
                sx={{
                  "& .MuiListItemText-primary": {
                    fontSize: "13px",
                    fontWeight: isActive ? 600 : 400,
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
            {!collapsed &&
              item.count !== undefined &&
              item.count > 0 &&
              !isDisabled && (
                <Chip
                  label={item.count > 99 ? "99+" : item.count}
                  size="small"
                  sx={{
                    height: "18px",
                    fontSize: "10px",
                    fontWeight: 500,
                    backgroundColor: isActive ? "#f8fafc" : "#e2e8f0",
                    color: "#475569",
                    borderRadius: "9px",
                    minWidth: "18px",
                    maxWidth: "36px",
                    "& .MuiChip-label": {
                      px: "6px",
                      py: 0,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    },
                    ml: "auto",
                  }}
                />
              )}
          </ListItemButton>
        )}
      </Tooltip>
    );
  };

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
        pt={theme.spacing(6)}
        pb={theme.spacing(12)}
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
                    sx={{
                      position: "absolute",
                      top: "-16px",
                      left: "50%",
                      transform: "translateX(-50%)",
                      padding: 0,
                      zIndex: 10,
                      "&:hover": { backgroundColor: "transparent" },
                      animation: heartReturning
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
                      color="#FF1493"
                      strokeWidth={1.5}
                      fill="#FF1493"
                    />
                  </IconButton>
                </Tooltip>
              )}
              <RouterLink
                to="/"
                style={{ display: "flex", alignItems: "center" }}
              >
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
            disableRipple={
              theme.components?.MuiListItemButton?.defaultProps?.disableRipple
            }
            sx={{
              position: "absolute",
              right: delayedCollapsed ? "50%" : 0,
              transform: delayedCollapsed ? "translateX(50%)" : "none",
              top: 0,
              bottom: 0,
              display: "flex",
              alignItems: "center",
              p: theme.spacing(2),
              borderRadius: theme.shape.borderRadius,
              transition:
                "right 0.65s cubic-bezier(0.36, -0.01, 0, 0.77), transform 0.65s cubic-bezier(0.36, -0.01, 0, 0.77)",
              "& svg": {
                opacity: 0.9,
                "& path": { stroke: theme.palette.text.tertiary },
              },
              "&:focus": { outline: "none" },
              "&:hover": { backgroundColor: "#F9F9F9" },
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
          px: theme.spacing(8),
          flex: 1,
          overflowY: "auto",
          overflowX: "hidden",
          "&::-webkit-scrollbar": { width: "4px" },
          "&::-webkit-scrollbar-track": { background: "transparent" },
          "&::-webkit-scrollbar-thumb": {
            background: theme.palette.border?.light || borderPalette.light,
            borderRadius: "2px",
          },
          "&::-webkit-scrollbar-thumb:hover": {
            background: theme.palette.border?.dark || borderPalette.dark,
          },
        }}
      >
        {/* Project Selector (for Evals sidebar) */}
        {projectSelector && !delayedCollapsed && (
          <Box sx={{ mb: theme.spacing(4) }}>
            <Box
              onClick={(e) => setProjectMenuAnchor(e.currentTarget)}
              sx={{
                display: "flex",
                alignItems: "center",
                gap: 1,
                px: "12px",
                height: "34px",
                borderRadius: theme.shape.borderRadius,
                cursor: "pointer",
                backgroundColor: theme.palette.background.main,
                border: `1px solid ${theme.palette.border?.dark || borderPalette.dark}`,
                transition: "all 0.2s ease",
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
                  borderRadius: "8px",
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
                    display: "flex",
                    alignItems: "center",
                    fontSize: "13px",
                    py: 1.25,
                    px: 2,
                    mx: 1,
                    borderRadius: "6px",
                    color: theme.palette.text.secondary,
                    cursor: "pointer",
                    transition: "all 0.15s ease",
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
                        const isSelected =
                          project.id === projectSelector.currentProject?.id;
                        return (
                          <Box
                            key={project.id}
                            onClick={() => {
                              projectSelector.onProjectChange(project.id);
                              setProjectMenuAnchor(null);
                            }}
                            sx={{
                              display: "flex",
                              alignItems: "center",
                              fontSize: "13px",
                              py: 1.25,
                              px: 2,
                              mx: 1,
                              borderRadius: "6px",
                              cursor: "pointer",
                              backgroundColor: isSelected ? "#f0fdf4" : "transparent",
                              borderLeft: isSelected ? `3px solid ${brand.primary}` : "3px solid transparent",
                              color: theme.palette.text.primary,
                              fontWeight: isSelected ? 500 : 400,
                              transition: "all 0.15s ease",
                              "&:hover": {
                                backgroundColor: isSelected ? "#f0fdf4" : "background.hover",
                              },
                            }}
                          >
                            <FolderKanban 
                              size={15} 
                              style={{ 
                                marginRight: 10, 
                                opacity: isSelected ? 1 : 0.6,
                                color: isSelected ? brand.primary : "inherit"
                              }} 
                            />
                            <Box sx={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
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
                    display: "flex",
                    alignItems: "center",
                    fontSize: "13px",
                    fontWeight: 500,
                    py: 1.25,
                    px: 2,
                    mx: 1,
                    mt: projectSelector.allProjects.length === 0 ? 0.5 : 0,
                    borderRadius: "6px",
                    color: brand.primary,
                    cursor: "pointer",
                    transition: "all 0.15s ease",
                    "&:hover": {
                      backgroundColor: "#f0fdf4",
                    },
                  }}
                >
                  <Plus size={15} style={{ marginRight: 10 }} />
                  New project
                </Box>
              </Box>
            </Popover>
          </Box>
        )}

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
        {menuGroups.map((group) => (
          <Box key={group.name}>
            <Typography
              variant="overline"
              className="sidebar-group-header"
              sx={{
                px: theme.spacing(4),
                pt: theme.spacing(4.5),
                pb: theme.spacing(1.5),
                mt: theme.spacing(3),
                color: "#a0a0a0 !important",
                fontSize: "11px !important",
                fontWeight: 400,
                letterSpacing: "0.5px",
                textTransform: "uppercase",
                display: collapsed ? "none" : "block",
              }}
            >
              {group.name}
            </Typography>
            {group.items.map((item) => renderMenuItem(item))}
          </Box>
        ))}

        {/* Recent Sections - right after menu items */}
        {recentSections.map(
          (section) =>
            !delayedCollapsed &&
            section.items.length > 0 && (
              <Box key={section.title} sx={{ mt: theme.spacing(4) }}>
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
                      height: "30px",
                      borderRadius: "4px",
                      px: theme.spacing(4),
                      mb: 0.25,
                      "&:hover": { backgroundColor: "#F9F9F9" },
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
            )
        )}
      </List>

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
          openUserGuide={openUserGuide}
          openReleaseNotes={openReleaseNotes}
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
