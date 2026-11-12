import { Box, List, ListItemButton, ListItemIcon, ListItemText, Tooltip } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import { LucideIcon } from "lucide-react";
import { SIDEBAR_TEXT_SECONDARY } from "../Sidebar/sidebarTokens";

export interface SectionItem {
  id: string;
  label: string;
  Icon: LucideIcon;
  /** Shown but not selectable. */
  disabled?: boolean;
  /** Hover text, shown to the right of the item. */
  tooltip?: string;
  /** Hover text while the item is disabled, saying why. Falls back to `tooltip`. */
  disabledTooltip?: string;
}

interface SectionSidebarProps {
  sections: SectionItem[];
  activeSection: string;
  onSelect: (sectionId: string) => void;
  width?: number;
  stickyTop?: number;
}

const SectionSidebar = ({
  sections,
  activeSection,
  onSelect,
  width = 240,
  stickyTop = 80,
}: SectionSidebarProps) => {
  const theme = useTheme();

  return (
    <Box
      sx={{
        width,
        flexShrink: 0,
        position: "sticky",
        top: stickyTop,
        alignSelf: "flex-start",
        display: { xs: "none", md: "block" },
        backgroundColor: theme.palette.background.main,
        border: `1px solid ${theme.palette.border?.dark || "#d0d5dd"}`,
        borderRadius: "4px",
        padding: "12px 0",
      }}
    >
      <List component="nav" disablePadding sx={{ padding: "0 16px" }}>
        {sections.map((section) => {
          const isActive = activeSection === section.id;
          const SectionIcon = section.Icon;

          const item = (
            <ListItemButton
              key={section.id}
              disableRipple={theme.components?.MuiListItemButton?.defaultProps?.disableRipple}
              className={isActive ? "selected-path" : "unselected"}
              onClick={() => onSelect(section.id)}
              disabled={section.disabled}
              aria-current={isActive ? "page" : undefined}
              sx={{
                "height": "32px",
                "gap": "8px",
                "borderRadius": theme.shape.borderRadius,
                "padding": "0 8px",
                "justifyContent": "flex-start",
                "background": isActive
                  ? "linear-gradient(135deg, #F7F7F7 0%, #F2F2F2 100%)"
                  : "transparent",
                "border": isActive ? "1px solid #E8E8E8" : "1px solid transparent",
                "&:hover": {
                  background: isActive
                    ? "linear-gradient(135deg, #F7F7F7 0%, #F2F2F2 100%)"
                    : "#FAFAFA",
                  border: isActive ? "1px solid #E8E8E8" : "1px solid transparent",
                },
                "&:hover svg": {
                  color: "#13715B !important",
                  stroke: "#13715B !important",
                  animation: "icon-shake 400ms ease-in-out",
                },
                "&:hover svg path": {
                  stroke: "#13715B !important",
                },
              }}
            >
              <ListItemIcon
                sx={{
                  "minWidth": 0,
                  "display": "flex",
                  "alignItems": "center",
                  "justifyContent": "center",
                  "width": "16px",
                  "marginRight": 0,
                  "& svg": {
                    color: isActive
                      ? "#13715B !important"
                      : `${theme.palette.text.tertiary} !important`,
                    stroke: isActive
                      ? "#13715B !important"
                      : `${theme.palette.text.tertiary} !important`,
                    transition: "color 0.2s ease, stroke 0.2s ease",
                  },
                  "& svg path": {
                    stroke: isActive
                      ? "#13715B !important"
                      : `${theme.palette.text.tertiary} !important`,
                  },
                }}
              >
                <SectionIcon size={16} strokeWidth={1.5} />
              </ListItemIcon>
              <ListItemText
                primary={section.label}
                sx={{
                  "& .MuiListItemText-primary": {
                    fontSize: "13px",
                    fontWeight: isActive ? 600 : 400,
                    color: isActive ? theme.palette.text.primary : SIDEBAR_TEXT_SECONDARY,
                  },
                }}
              />
            </ListItemButton>
          );

          const hint = section.disabled
            ? (section.disabledTooltip ?? section.tooltip)
            : section.tooltip;
          if (!hint) return item;
          return (
            <Tooltip key={section.id} title={hint} placement="right" enterDelay={500} describeChild>
              {/* A disabled button fires no events, so the span carries the hover. */}
              <span style={{ display: "block" }}>{item}</span>
            </Tooltip>
          );
        })}
      </List>
    </Box>
  );
};

export default SectionSidebar;
