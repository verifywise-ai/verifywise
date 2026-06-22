import React, { useState, useMemo } from "react";
import {
  Box,
  IconButton,
  Menu,
  MenuItem,
  ListItemIcon,
  ListItemText,
  Checkbox,
  Typography,
  Tooltip,
  Divider,
} from "@mui/material";
import Tab from "@mui/material/Tab";
import TabList from "@mui/lab/TabList";
import { Plus, X } from "lucide-react";
import * as LucideIcons from "lucide-react";
import { LucideIcon } from "lucide-react";
import { brand } from "../../themes/palette";
import { text, border, background } from "../../themes/palette";

export interface DashboardTabConfig {
  id: string;
  label: string;
  icon: keyof typeof LucideIcons;
  description?: string;
  removable?: boolean; // false = always visible (like Overview)
}

export interface DashboardTabsProps {
  availableTabs: DashboardTabConfig[];
  activeTabs: string[]; // IDs of currently shown tabs
  activeTab: string;
  onTabChange: (tabId: string) => void;
  onTabsChange: (tabIds: string[]) => void;
}

const INDICATOR_COLOR = `${brand.primary}`;

const DashboardTabs: React.FC<DashboardTabsProps> = ({
  availableTabs,
  activeTabs,
  activeTab,
  onTabChange,
  onTabsChange,
}) => {
  const [menuAnchor, setMenuAnchor] = useState<null | HTMLElement>(null);
  const menuOpen = Boolean(menuAnchor);

  const visibleTabs = useMemo(
    () => availableTabs.filter((t) => activeTabs.includes(t.id)),
    [availableTabs, activeTabs],
  );

  const handleTabChange = (_event: React.SyntheticEvent, newValue: string) => {
    if (newValue === "__add__") return;
    onTabChange(newValue);
  };

  const handleAddClick = (event: React.MouseEvent<HTMLElement>) => {
    setMenuAnchor(event.currentTarget);
  };

  const handleMenuClose = () => {
    setMenuAnchor(null);
  };

  const handleToggleTab = (tabId: string) => {
    const tab = availableTabs.find((t) => t.id === tabId);
    if (tab && tab.removable === false) return; // can't remove fixed tabs

    if (activeTabs.includes(tabId)) {
      // Remove tab
      const newTabs = activeTabs.filter((id) => id !== tabId);
      onTabsChange(newTabs);
      // If we removed the active tab, switch to first
      if (activeTab === tabId && newTabs.length > 0) {
        onTabChange(newTabs[0]);
      }
    } else {
      // Add tab
      onTabsChange([...activeTabs, tabId]);
    }
  };

  const handleRemoveTab = (e: React.MouseEvent, tabId: string) => {
    e.stopPropagation();
    const tab = availableTabs.find((t) => t.id === tabId);
    if (tab && tab.removable === false) return;

    const newTabs = activeTabs.filter((id) => id !== tabId);
    onTabsChange(newTabs);
    if (activeTab === tabId && newTabs.length > 0) {
      onTabChange(newTabs[0]);
    }
  };

  return (
    <Box sx={{ borderBottom: 1, borderColor: "divider", display: "flex", alignItems: "flex-end" }}>
      <TabList
        onChange={handleTabChange}
        TabIndicatorProps={{ style: { backgroundColor: INDICATOR_COLOR } }}
        sx={{
          "minHeight": "20px",
          "flex": 1,
          "& .MuiTabs-flexContainer": { columnGap: "24px" },
        }}
      >
        {visibleTabs.map((tab) => {
          const IconComponent = LucideIcons[tab.icon] as LucideIcon;
          return (
            <Tab
              key={tab.id}
              value={tab.id}
              disableRipple
              sx={{
                "textTransform": "none",
                "fontWeight": 400,
                "padding": "16px 0 7px",
                "minHeight": "20px",
                "minWidth": "auto",
                "&.Mui-selected": { color: INDICATOR_COLOR },
              }}
              label={
                <Box sx={{ display: "flex", alignItems: "center", gap: 0.75 }}>
                  {IconComponent && <IconComponent size={14} strokeWidth={1.5} />}
                  <span>{tab.label}</span>
                  {tab.removable !== false && activeTab === tab.id && (
                    <Tooltip title="Hide tab">
                      <Box
                        component="span"
                        onClick={(e: React.MouseEvent) => handleRemoveTab(e, tab.id)}
                        sx={{
                          "display": "inline-flex",
                          "alignItems": "center",
                          "ml": 0.5,
                          "borderRadius": "50%",
                          "padding": "1px",
                          "cursor": "pointer",
                          "opacity": 0.5,
                          "&:hover": { opacity: 1, backgroundColor: "rgba(0,0,0,0.08)" },
                        }}
                      >
                        <X size={12} />
                      </Box>
                    </Tooltip>
                  )}
                </Box>
              }
            />
          );
        })}
      </TabList>

      {/* Add tab button */}
      <Tooltip title="Add or hide dashboard tabs">
        <IconButton
          onClick={handleAddClick}
          size="small"
          sx={{
            "mb": "4px",
            "width": 28,
            "height": 28,
            "border": `1px dashed ${border.light}`,
            "borderRadius": "6px",
            "color": text.secondary,
            "&:hover": { backgroundColor: background.hover, color: brand.primary },
          }}
        >
          <Plus size={16} />
        </IconButton>
      </Tooltip>

      {/* Tab picker menu */}
      <Menu
        anchorEl={menuAnchor}
        open={menuOpen}
        onClose={handleMenuClose}
        PaperProps={{
          elevation: 3,
          sx: {
            minWidth: 280,
            maxHeight: 400,
            mt: 1,
            borderRadius: "8px",
            border: `1px solid ${border.light}`,
            boxShadow: "0px 4px 16px rgba(0, 0, 0, 0.08)",
          },
        }}
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
        transformOrigin={{ vertical: "top", horizontal: "right" }}
      >
        <Box sx={{ px: 2, py: 1.5 }}>
          <Typography
            sx={{
              fontSize: 14,
              fontWeight: 600,
              color: text.primary,
              fontFamily: "'Red Hat Display', 'Geist', sans-serif",
            }}
          >
            Dashboard tabs
          </Typography>
          <Typography sx={{ fontSize: 11, color: text.accent, mt: 0.25 }}>
            Select which tabs to show
          </Typography>
        </Box>
        <Divider sx={{ borderColor: border.light }} />
        {availableTabs.map((tab) => {
          const IconComponent = LucideIcons[tab.icon] as LucideIcon;
          const isActive = activeTabs.includes(tab.id);
          const isFixed = tab.removable === false;

          return (
            <MenuItem
              key={tab.id}
              onClick={() => !isFixed && handleToggleTab(tab.id)}
              disabled={isFixed}
              sx={{
                "py": 1,
                "px": 2,
                "&:hover": { backgroundColor: background.hover },
                "&.Mui-disabled": { opacity: 0.7 },
              }}
            >
              <Checkbox
                checked={isActive}
                disabled={isFixed}
                size="small"
                sx={{
                  "p": 0,
                  "mr": 1.5,
                  "color": border.dark,
                  "&.Mui-checked": { color: brand.primary },
                  "&.Mui-disabled.Mui-checked": { color: brand.primary, opacity: 0.7 },
                }}
              />
              <ListItemIcon sx={{ minWidth: 28, color: isActive ? brand.primary : text.icon }}>
                {IconComponent && <IconComponent size={16} strokeWidth={1.5} />}
              </ListItemIcon>
              <ListItemText
                primary={tab.label}
                secondary={tab.description}
                primaryTypographyProps={{
                  fontSize: 13,
                  fontWeight: isActive ? 500 : 400,
                  color: isActive ? text.primary : text.secondary,
                }}
                secondaryTypographyProps={{
                  fontSize: 10,
                  color: text.accent,
                  mt: 0.25,
                }}
              />
            </MenuItem>
          );
        })}
      </Menu>
    </Box>
  );
};

export default DashboardTabs;
