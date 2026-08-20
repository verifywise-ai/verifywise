import { FC, ReactNode } from "react";
import { List, ListItemButton, ListItemIcon, ListItemText } from "@mui/material";
import { useTheme } from "@mui/material";
import { Link as RouterLink } from "react-router";
import { brand } from "../../themes/palette";

/**
 * A single item in a {@link SectionNav}.
 */
export interface SectionNavItem {
  /** Stable identifier, compared against `activeId` to mark the active row. */
  id: string;
  /** Visible label. */
  label: string;
  /** Optional leading icon (typically a 16px lucide-react icon). */
  icon?: ReactNode;
  /** Disable the row. */
  disabled?: boolean;
}

export interface SectionNavProps {
  /** Rows to render, in display order. */
  items: SectionNavItem[];
  /** Id of the currently active row. */
  activeId: string;
  /**
   * Routing mode: return the href for an item and each row renders as a router
   * link, so navigation updates the URL. Takes precedence over `onSelect`.
   */
  getHref?: (id: string) => string;
  /** Callback mode: called with the item id when a row is clicked. */
  onSelect?: (id: string) => void;
  /** Accessible label for the navigation landmark. */
  ariaLabel?: string;
  /** Fixed width for the nav column. Defaults to 240px. */
  width?: number | string;
}

/**
 * Vertical section navigation styled to match the application sidebar rows
 * (see `SidebarShell`). Unlike the sidebar it is a lightweight, non-collapsible,
 * in-page nav with no Redux, logo, or footer. Use it for a page's secondary
 * section switcher, either URL-driven (`getHref`) or state-driven (`onSelect`).
 */
const SectionNav: FC<SectionNavProps> = ({
  items,
  activeId,
  getHref,
  onSelect,
  ariaLabel = "Sections",
  width = 240,
}) => {
  const theme = useTheme();

  return (
    <List
      component="nav"
      aria-label={ariaLabel}
      disablePadding
      sx={{
        width,
        flexShrink: 0,
        display: "flex",
        flexDirection: "column",
        gap: "4px",
      }}
    >
      {items.map((item) => {
        const isActive = item.id === activeId;
        const isDisabled = item.disabled;

        // Routing mode: the row is a router link and navigation is handled by
        // the href. Callback mode: the row fires `onSelect`. `getHref` takes
        // precedence, and we must NOT also call `onSelect` in that case, or the
        // click would navigate twice and race.
        const useHref = Boolean(getHref) && !isDisabled;
        const linkProps = useHref ? { component: RouterLink, to: getHref!(item.id) } : {};

        return (
          <ListItemButton
            key={item.id}
            {...linkProps}
            disableRipple={theme.components?.MuiListItemButton?.defaultProps?.disableRipple}
            className={isActive ? "selected-path" : "unselected"}
            onClick={() => {
              if (isDisabled || useHref) return;
              onSelect?.(item.id);
            }}
            disabled={isDisabled}
            aria-current={isActive ? "page" : undefined}
            aria-label={item.label}
            sx={{
              "height": "32px",
              "gap": theme.spacing(4),
              "borderRadius": theme.shape.borderRadius,
              "px": theme.spacing(4),
              "justifyContent": "flex-start",
              "opacity": isDisabled ? 0.5 : 1,
              "cursor": isDisabled ? "not-allowed" : "pointer",
              "background":
                isActive && !isDisabled
                  ? "linear-gradient(135deg, #F7F7F7 0%, #F2F2F2 100%)"
                  : "transparent",
              "border": isActive && !isDisabled ? "1px solid #E8E8E8" : "1px solid transparent",
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
            )}
            <ListItemText
              sx={{
                "my": 0,
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
          </ListItemButton>
        );
      })}
    </List>
  );
};

export default SectionNav;
