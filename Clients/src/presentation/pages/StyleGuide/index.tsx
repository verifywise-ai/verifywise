import React, { useState, useMemo } from "react";
import {
  Box,
  Stack,
  Typography,
  useTheme,
  TextField,
  InputAdornment,
  Divider,
} from "@mui/material";
import { useNavigate, useParams } from "react-router-dom";
import {
  TextCursorInput,
  ToggleLeft,
  Square,
  Table2,
  LayoutGrid,
  Palette,
  Type,
  Layers,
  MousePointer2,
  Bell,
  Navigation,
  ChevronLeft,
  Tag,
  BoxSelect,
  Loader,
  MessageCircle,
  UserCircle,
  PanelTop,
  Search,
  Space,
  Image,
  Sparkles,
  Play,
  Monitor,
  Layers2,
  ThumbsUp,
  Accessibility,
  FolderTree,
  Code2,
} from "lucide-react";
import FormInputsSection from "./sections/FormInputsSection";
import ButtonsSection from "./sections/ButtonsSection";
import ColorsSection from "./sections/ColorsSection";
import TypographySection from "./sections/TypographySection";
import TablesSection from "./sections/TablesSection";
import CardsSection from "./sections/CardsSection";
import ModalsSection from "./sections/ModalsSection";
import TogglesSection from "./sections/TogglesSection";
import StatusSection from "./sections/StatusSection";
import AlertsSection from "./sections/AlertsSection";
import BreadcrumbsSection from "./sections/BreadcrumbsSection";
import PaginationSection from "./sections/PaginationSection";
import TagsSection from "./sections/TagsSection";
import EmptyStatesSection from "./sections/EmptyStatesSection";
import LoadingStatesSection from "./sections/LoadingStatesSection";
import TooltipsSection from "./sections/TooltipsSection";
import AvatarsSection from "./sections/AvatarsSection";
import TabsSection from "./sections/TabsSection";
import SpacingLayoutSection from "./sections/SpacingLayoutSection";
import IconsSection from "./sections/IconsSection";
import ShadowsSection from "./sections/ShadowsSection";
import AnimationsSection from "./sections/AnimationsSection";
import BreakpointsSection from "./sections/BreakpointsSection";
import ZIndexSection from "./sections/ZIndexSection";
import DosAndDontsSection from "./sections/DosAndDontsSection";
import AccessibilitySection from "./sections/AccessibilitySection";
import FileStructureSection from "./sections/FileStructureSection";
import CommonPatternsSection from "./sections/CommonPatternsSection";

interface NavItem {
  id: string;
  label: string;
  icon: React.ReactNode;
  component: React.ReactNode;
  category: "components" | "foundations" | "resources";
  keywords: string[];
}

type TopTab = "design-system" | "resources";

const StyleGuide: React.FC = () => {
  const theme = useTheme();
  const navigate = useNavigate();
  const { section } = useParams<{ section?: string }>();
  const [searchQuery, setSearchQuery] = useState("");

  const activeSection = section || "form-inputs";

  const navItems: NavItem[] = [
    // Components
    {
      id: "form-inputs",
      label: "Form inputs",
      icon: <TextCursorInput size={18} />,
      component: <FormInputsSection />,
      category: "components",
      keywords: ["input", "text", "select", "dropdown", "field", "form", "search"],
    },
    {
      id: "buttons",
      label: "Buttons",
      icon: <MousePointer2 size={18} />,
      component: <ButtonsSection />,
      category: "components",
      keywords: ["button", "click", "action", "submit", "primary", "secondary"],
    },
    {
      id: "tables",
      label: "Tables",
      icon: <Table2 size={18} />,
      component: <TablesSection />,
      category: "components",
      keywords: ["table", "data", "grid", "list", "row", "column", "cell"],
    },
    {
      id: "cards",
      label: "Cards & containers",
      icon: <LayoutGrid size={18} />,
      component: <CardsSection />,
      category: "components",
      keywords: ["card", "container", "box", "panel", "wrapper"],
    },
    {
      id: "modals",
      label: "Modals & drawers",
      icon: <Layers size={18} />,
      component: <ModalsSection />,
      category: "components",
      keywords: ["modal", "dialog", "drawer", "popup", "overlay", "sheet"],
    },
    {
      id: "toggles",
      label: "Toggles & checkboxes",
      icon: <ToggleLeft size={18} />,
      component: <TogglesSection />,
      category: "components",
      keywords: ["toggle", "switch", "checkbox", "radio", "check"],
    },
    {
      id: "status",
      label: "Status indicators",
      icon: <Square size={18} />,
      component: <StatusSection />,
      category: "components",
      keywords: ["status", "badge", "indicator", "state", "progress"],
    },
    {
      id: "alerts",
      label: "Alerts & toasts",
      icon: <Bell size={18} />,
      component: <AlertsSection />,
      category: "components",
      keywords: [
        "alert",
        "toast",
        "notification",
        "message",
        "snackbar",
        "error",
        "success",
        "warning",
      ],
    },
    {
      id: "breadcrumbs",
      label: "Breadcrumbs",
      icon: <Navigation size={18} />,
      component: <BreadcrumbsSection />,
      category: "components",
      keywords: ["breadcrumb", "navigation", "path", "trail"],
    },
    {
      id: "pagination",
      label: "Pagination",
      icon: <ChevronLeft size={18} />,
      component: <PaginationSection />,
      category: "components",
      keywords: ["pagination", "page", "next", "previous", "table"],
    },
    {
      id: "tags",
      label: "Tags & chips",
      icon: <Tag size={18} />,
      component: <TagsSection />,
      category: "components",
      keywords: ["tag", "chip", "label", "badge", "policy"],
    },
    {
      id: "empty-states",
      label: "Empty states",
      icon: <BoxSelect size={18} />,
      component: <EmptyStatesSection />,
      category: "components",
      keywords: ["empty", "no data", "placeholder", "skeleton"],
    },
    {
      id: "loading-states",
      label: "Loading states",
      icon: <Loader size={18} />,
      component: <LoadingStatesSection />,
      category: "components",
      keywords: ["loading", "spinner", "skeleton", "progress", "loader"],
    },
    {
      id: "tooltips",
      label: "Tooltips",
      icon: <MessageCircle size={18} />,
      component: <TooltipsSection />,
      category: "components",
      keywords: ["tooltip", "hint", "hover", "popover", "info"],
    },
    {
      id: "avatars",
      label: "Avatars",
      icon: <UserCircle size={18} />,
      component: <AvatarsSection />,
      category: "components",
      keywords: ["avatar", "user", "profile", "image", "initials"],
    },
    {
      id: "tabs",
      label: "Tabs",
      icon: <PanelTop size={18} />,
      component: <TabsSection />,
      category: "components",
      keywords: ["tab", "tabbar", "navigation", "panel"],
    },
    // Foundations
    {
      id: "colors",
      label: "Colors",
      icon: <Palette size={18} />,
      component: <ColorsSection />,
      category: "foundations",
      keywords: ["color", "palette", "theme", "primary", "secondary", "status"],
    },
    {
      id: "typography",
      label: "Typography",
      icon: <Type size={18} />,
      component: <TypographySection />,
      category: "foundations",
      keywords: ["font", "text", "typography", "heading", "size", "weight"],
    },
    {
      id: "spacing",
      label: "Spacing & layout",
      icon: <Space size={18} />,
      component: <SpacingLayoutSection />,
      category: "foundations",
      keywords: ["spacing", "padding", "margin", "gap", "layout", "flex", "grid"],
    },
    {
      id: "icons",
      label: "Icons",
      icon: <Image size={18} />,
      component: <IconsSection />,
      category: "foundations",
      keywords: ["icon", "lucide", "svg", "symbol"],
    },
    {
      id: "shadows",
      label: "Shadows & elevation",
      icon: <Sparkles size={18} />,
      component: <ShadowsSection />,
      category: "foundations",
      keywords: ["shadow", "elevation", "depth", "box-shadow", "border"],
    },
    {
      id: "animations",
      label: "Animations",
      icon: <Play size={18} />,
      component: <AnimationsSection />,
      category: "foundations",
      keywords: ["animation", "transition", "motion", "keyframe", "ease"],
    },
    {
      id: "breakpoints",
      label: "Breakpoints",
      icon: <Monitor size={18} />,
      component: <BreakpointsSection />,
      category: "foundations",
      keywords: ["breakpoint", "responsive", "mobile", "tablet", "desktop", "media query"],
    },
    {
      id: "z-index",
      label: "Z-Index",
      icon: <Layers2 size={18} />,
      component: <ZIndexSection />,
      category: "foundations",
      keywords: ["z-index", "layer", "stack", "overlay", "modal"],
    },
    // Resources
    {
      id: "dos-and-donts",
      label: "Do's and don'ts",
      icon: <ThumbsUp size={18} />,
      component: <DosAndDontsSection />,
      category: "resources",
      keywords: ["do", "dont", "best practice", "guideline", "rule"],
    },
    {
      id: "accessibility",
      label: "Accessibility",
      icon: <Accessibility size={18} />,
      component: <AccessibilitySection />,
      category: "resources",
      keywords: ["accessibility", "a11y", "wcag", "aria", "screen reader", "keyboard"],
    },
    {
      id: "file-structure",
      label: "File structure",
      icon: <FolderTree size={18} />,
      component: <FileStructureSection />,
      category: "resources",
      keywords: ["file", "folder", "structure", "organization", "architecture"],
    },
    {
      id: "common-patterns",
      label: "Common patterns",
      icon: <Code2 size={18} />,
      component: <CommonPatternsSection />,
      category: "resources",
      keywords: ["pattern", "recipe", "example", "template", "code"],
    },
  ];

  // Determine active top tab based on the current section
  const resourceIds = navItems
    .filter((item) => item.category === "resources")
    .map((item) => item.id);
  const activeTopTab: TopTab = resourceIds.includes(activeSection) ? "resources" : "design-system";

  const handleNavClick = (id: string) => {
    navigate(`/style-guide/${id}`);
  };

  const handleTopTabClick = (tab: TopTab) => {
    if (tab === "resources") {
      navigate("/style-guide/dos-and-donts");
    } else {
      navigate("/style-guide/form-inputs");
    }
  };

  const activeItem = navItems.find((item) => item.id === activeSection);

  // Filter items based on search (only for design system tab)
  const filteredItems = useMemo(() => {
    const designSystemItems = navItems.filter((item) => item.category !== "resources");
    if (!searchQuery.trim()) return designSystemItems;
    const query = searchQuery.toLowerCase();
    return designSystemItems.filter(
      (item) =>
        item.label.toLowerCase().includes(query) ||
        item.keywords.some((kw) => kw.toLowerCase().includes(query)),
    );
  }, [searchQuery, navItems]);

  // Group by category (for design system sidebar)
  const componentItems = filteredItems.filter((item) => item.category === "components");
  const foundationItems = filteredItems.filter((item) => item.category === "foundations");

  // Resources for top tab content
  const resourceItems = navItems.filter((item) => item.category === "resources");

  const renderNavItem = (item: NavItem) => (
    <Box
      key={item.id}
      onClick={() => handleNavClick(item.id)}
      sx={{
        display: "flex",
        alignItems: "center",
        gap: "6px",
        p: "5px 10px",
        borderRadius: "4px",
        cursor: "pointer",
        backgroundColor: activeSection === item.id ? theme.palette.background.fill : "transparent",
        color:
          activeSection === item.id ? theme.palette.primary.main : theme.palette.text.secondary,
        fontWeight: activeSection === item.id ? 500 : 400,
        transition: "background-color 150ms ease",
        "&:hover": {
          backgroundColor: theme.palette.background.fill,
        },
        "& svg": {
          width: 14,
          height: 14,
        },
      }}
    >
      {item.icon}
      <Typography
        sx={{
          fontSize: 12,
          fontWeight: "inherit",
          color: "inherit",
        }}
      >
        {item.label}
      </Typography>
    </Box>
  );

  return (
    <Box sx={{ display: "flex", flexDirection: "column", height: "100vh", overflow: "hidden" }}>
      {/* Top Tabbar */}
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          px: "20px",
          borderBottom: `1px solid ${theme.palette.border.light}`,
          backgroundColor: theme.palette.background.main,
        }}
      >
        <Box sx={{ display: "flex", alignItems: "center", gap: "4px" }}>
          {[
            { id: "design-system" as TopTab, label: "Design system" },
            { id: "resources" as TopTab, label: "Resources" },
          ].map((tab) => (
            <Box
              key={tab.id}
              onClick={() => handleTopTabClick(tab.id)}
              sx={{
                px: "16px",
                py: "12px",
                cursor: "pointer",
                borderBottom:
                  activeTopTab === tab.id
                    ? `2px solid ${theme.palette.primary.main}`
                    : "2px solid transparent",
                color:
                  activeTopTab === tab.id
                    ? theme.palette.primary.main
                    : theme.palette.text.secondary,
                fontWeight: activeTopTab === tab.id ? 500 : 400,
                transition: "all 150ms ease",
                "&:hover": {
                  color: theme.palette.primary.main,
                },
              }}
            >
              <Typography
                sx={{
                  fontSize: 13,
                  fontWeight: "inherit",
                  color: "inherit",
                }}
              >
                {tab.label}
              </Typography>
            </Box>
          ))}
        </Box>
        <Box sx={{ display: "flex", alignItems: "center", gap: "16px" }}>
          <TextField
            placeholder="Search..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            size="small"
            sx={{
              width: 200,
              "& .MuiOutlinedInput-root": {
                borderRadius: "4px",
                fontSize: 12,
                backgroundColor: theme.palette.background.main,
              },
              "& .MuiOutlinedInput-input": {
                py: "6px",
              },
            }}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <Search size={12} color={theme.palette.text.tertiary} />
                </InputAdornment>
              ),
            }}
          />
          <Typography
            sx={{
              fontSize: 11,
              color: theme.palette.text.accent,
            }}
          >
            Dev only
          </Typography>
        </Box>
      </Box>

      {/* Main Content Area */}
      <Box sx={{ display: "flex", flex: 1, overflow: "hidden" }}>
        {activeTopTab === "design-system" ? (
          <>
            {/* Sidebar Navigation (Design System) */}
            <Box
              sx={{
                width: 220,
                minWidth: 220,
                borderRight: `1px solid ${theme.palette.border.light}`,
                backgroundColor: theme.palette.background.alt,
                display: "flex",
                flexDirection: "column",
              }}
            >
              <Stack sx={{ px: "8px", py: "8px", flex: 1, overflowY: "auto" }}>
                {/* Components Section */}
                {componentItems.length > 0 && (
                  <>
                    <Typography
                      sx={{
                        fontSize: 9,
                        fontWeight: 600,
                        color: theme.palette.text.tertiary,
                        textTransform: "uppercase",
                        letterSpacing: "0.5px",
                        px: "10px",
                        py: "6px",
                        mt: "2px",
                      }}
                    >
                      Components
                    </Typography>
                    {componentItems.map(renderNavItem)}
                  </>
                )}

                {/* Foundations Section */}
                {foundationItems.length > 0 && (
                  <>
                    <Divider sx={{ my: "8px" }} />
                    <Typography
                      sx={{
                        fontSize: 9,
                        fontWeight: 600,
                        color: theme.palette.text.tertiary,
                        textTransform: "uppercase",
                        letterSpacing: "0.5px",
                        px: "10px",
                        py: "6px",
                      }}
                    >
                      Foundations
                    </Typography>
                    {foundationItems.map(renderNavItem)}
                  </>
                )}

                {/* No results */}
                {filteredItems.length === 0 && (
                  <Typography
                    sx={{
                      fontSize: 12,
                      color: theme.palette.text.tertiary,
                      textAlign: "center",
                      py: "24px",
                    }}
                  >
                    No sections found
                  </Typography>
                )}
              </Stack>
            </Box>

            {/* Main Content (Design System) */}
            <Box
              sx={{
                flex: 1,
                overflowY: "auto",
                backgroundColor: theme.palette.background.main,
              }}
            >
              {activeItem?.component}
            </Box>
          </>
        ) : (
          <>
            {/* Sidebar Navigation (Resources) */}
            <Box
              sx={{
                width: 220,
                minWidth: 220,
                borderRight: `1px solid ${theme.palette.border.light}`,
                backgroundColor: theme.palette.background.alt,
                display: "flex",
                flexDirection: "column",
              }}
            >
              <Box sx={{ p: "12px 16px" }}>
                <Typography
                  variant="h6"
                  sx={{
                    fontWeight: 600,
                    fontSize: 14,
                    color: theme.palette.text.primary,
                  }}
                >
                  Resources
                </Typography>
                <Typography
                  variant="body2"
                  sx={{
                    fontSize: 11,
                    color: theme.palette.text.tertiary,
                    mt: "2px",
                  }}
                >
                  Guidelines and patterns
                </Typography>
              </Box>

              <Stack sx={{ px: "8px", pb: "8px", flex: 1, overflowY: "auto" }}>
                {resourceItems.map(renderNavItem)}
              </Stack>
            </Box>

            {/* Main Content (Resources) */}
            <Box
              sx={{
                flex: 1,
                overflowY: "auto",
                backgroundColor: theme.palette.background.main,
              }}
            >
              {activeItem?.component}
            </Box>
          </>
        )}
      </Box>
    </Box>
  );
};

export default StyleGuide;
