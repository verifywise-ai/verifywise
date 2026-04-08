import React, { useMemo, useCallback } from "react";
import {
  Breadcrumbs as MUIBreadcrumbs,
  Link,
  Typography,
  Stack,
  useTheme,
} from "@mui/material";
import { useLocation, useNavigate } from "react-router-dom";
import { getRouteMapping, getRouteIcon } from "./routeMapping";

import { ChevronRight as ChevronRightGreyIcon } from "lucide-react";
import { BreadcrumbItemPresentation } from "../../types/breadcrumbs.types";
import { BreadcrumbsProps } from "../../types/breadcrumbs.types";

/**
 * A customizable Breadcrumbs component that wraps Material-UI Breadcrumbs.
 * Supports both manual and auto-generated breadcrumbs from routing.
 *
 * @component
 * @param {BreadcrumbsProps} props - The props for the Breadcrumbs component
 * @returns {JSX.Element} A styled Material-UI Breadcrumbs component
 */
function Breadcrumbs({
  items,
  separator = <ChevronRightGreyIcon size={16} style={{ width: "80%", height: "auto" }} />,
  maxItems = 8,
  sx,
  autoGenerate = false,
  showCurrentPage = true,
  homeLabel = "Home",
  homePath = "/",
  truncateLabels = true,
  maxLabelLength = 20,
  onItemClick,
}: BreadcrumbsProps) {
  const theme = useTheme();
  const location = useLocation();
  const navigate = useNavigate();

  /**
   * Truncate text if it exceeds the maximum length
   * Memoized for performance optimization
   */
  const truncateText = useCallback(
    (text: string): string => {
      if (!truncateLabels || text.length <= maxLabelLength) {
        return text;
      }
      return `${text.substring(0, maxLabelLength)}...`;
    },
    [truncateLabels, maxLabelLength]
  );

  /**
   * Convert route path to readable label
   * Uses centralized route mapping utilities for consistency
   */
  const pathToLabel = useCallback((path: string): string => {
    // Use centralized route mapping logic which handles custom mappings
    return getRouteMapping(path);
  }, []);

  /**
   * Auto-generate breadcrumbs from current route
   */
  const generateBreadcrumbs = useMemo((): BreadcrumbItemPresentation[] => {
    if (!autoGenerate) return [];

    const pathSegments = location.pathname.split("/").filter(Boolean);

    const breadcrumbs: BreadcrumbItemPresentation[] = [];

    // Add home item (skip for module pages that have their own root breadcrumb)
    const skipHome = location.pathname.startsWith("/ai-gateway") ||
                     location.pathname.startsWith("/evals") ||
                     location.pathname.startsWith("/ai-detection") ||
                     location.pathname.startsWith("/shadow-ai");
    if (!skipHome) {
      breadcrumbs.push({
        label: homeLabel,
        path: homePath,
        icon: getRouteIcon(homePath),
      });
    }

    // Build path progressively, skipping numeric-only intermediate segments
    let currentPath = "";
    pathSegments.forEach((segment, index) => {
      currentPath += `/${segment}`;

      // Skip adding current page if showCurrentPage is false and this is the last segment
      if (!showCurrentPage && index === pathSegments.length - 1) {
        return;
      }

      // Skip numeric-only intermediate segments (e.g., "38" in /policies/38/edit)
      // These create 404 breadcrumbs and are not meaningful navigation targets
      if (/^\d+$/.test(segment) && index < pathSegments.length - 1) {
        return;
      }

      // TODO: Hacky fix — /ai-detection/scans is auto-generated from URL segments
      // of /ai-detection/scans/:scanId but has no route. The real fix is to restructure
      // scan detail URLs to /ai-detection/history/:scanId so breadcrumbs work naturally.
      const BREADCRUMB_PATH_REDIRECTS: Record<string, string> = {
        "/ai-detection/scans": "/ai-detection/history",
      };
      const resolvedPath = BREADCRUMB_PATH_REDIRECTS[currentPath] || currentPath;

      breadcrumbs.push({
        label: pathToLabel(currentPath),
        path: resolvedPath,
        icon: getRouteIcon(currentPath),
      });
    });

    return breadcrumbs;
  }, [
    location.pathname,
    autoGenerate,
    homeLabel,
    homePath,
    showCurrentPage,
    pathToLabel,
  ]);

  /**
   * Handle breadcrumb item click
   * Enhanced with error handling
   */
  const handleItemClick = useCallback(
    (item: BreadcrumbItemPresentation, index: number) => {
      if (item.disabled) return;

      // Call custom click handler if provided
      if (onItemClick) {
        onItemClick(item, index);
        return;
      }

      // Default navigation behavior
      if (item.onClick) {
        item.onClick();
      } else if (item.path) {
        navigate(item.path);
      }
    },
    [navigate, onItemClick]
  );

  /**
   * Render breadcrumb item
   * Memoized for better performance
   */
  const renderBreadcrumbItem = useCallback(
    (item: BreadcrumbItemPresentation, index: number, totalItems: number) => {
      const isLast = index === totalItems - 1;
      const isDisabled = item.disabled || isLast;
      const truncatedLabel = truncateText(item.label);
      const isLabelTruncated = truncatedLabel !== item.label;

      const itemContent = (
        <Typography
          variant="body2"
          component="span"
          title={
            isLabelTruncated || item.tooltip
              ? item.tooltip || item.label
              : undefined
          }
          sx={{
            fontSize: "13px",
            fontWeight: isLast ? 500 : 400,
            color: theme.palette.text.secondary,
            cursor: isDisabled ? "default" : "pointer",
            "&:hover": {
              color: isDisabled
                ? theme.palette.text.secondary
                : theme.palette.primary.main,
              backgroundColor: isDisabled
                ? (theme.palette.mode === "dark"
                  ? "rgba(255, 255, 255, 0.06)"
                  : "rgba(0, 0, 0, 0.04)")
                : (theme.palette.mode === "dark"
                  ? "rgba(255, 255, 255, 0.12)"
                  : "rgba(0, 0, 0, 0.08)"),
            },
            transition: "color 0.2s ease, background-color 0.2s ease",
            textDecoration: "none",
            lineHeight: 1.2,
            display: "flex",
            alignItems: "center",
            backgroundColor: theme.palette.mode === "dark"
              ? "rgba(255, 255, 255, 0.06)"
              : "rgba(0, 0, 0, 0.04)",
            padding: "3px 10px",
            borderRadius: "4px",
            gap: "6px",
          }}
        >
          {item.icon && (
            <span style={{ display: "flex", alignItems: "center" }}>
              {item.icon as React.ReactNode}
            </span>
          )}
          {truncatedLabel}
        </Typography>
      );

      if (isDisabled) {
        return (
          <span
            key={item.id || `${item.label}-${index}`}
            role="text"
            aria-current={isLast ? "page" : undefined}
          >
            {itemContent}
          </span>
        );
      }

      return (
        <Link
          key={item.id || `${item.label}-${index}`}
          component="button"
          variant="body2"
          onClick={() => handleItemClick(item, index)}
          role="button"
          tabIndex={0}
          aria-label={`Navigate to ${item.label}`}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              handleItemClick(item, index);
            }
          }}
          sx={{
            textDecoration: "none",
            color: "inherit",
            backgroundColor: "transparent",
            border: "none",
            padding: 0,
            "&:hover": {
              textDecoration: "none",
            },
            "&:focus": {
              outline: "none",
            },
          }}
        >
          {itemContent}
        </Link>
      );
    },
    [truncateText, handleItemClick, theme]
  );

  const breadcrumbItems = items || generateBreadcrumbs;

  // Don't render if no items
  if (breadcrumbItems.length === 0) {
    return null;
  }

  return (
    <Stack
      sx={{
        py: 1,
        px: 0,
        ...sx,
      }}
    >
      <MUIBreadcrumbs
        separator={separator as React.ReactNode}
        maxItems={maxItems}
        aria-label="Page navigation breadcrumbs"
        sx={{
          "& .MuiBreadcrumbs-separator": {
            color: theme.palette.text.disabled,
            ml: 4,
            mr: 2.25,
            fontSize: "14px",
          },
          "& .MuiBreadcrumbs-ol": {
            alignItems: "center",
            flexWrap: "wrap",
            gap: 0,
          },
          "& .MuiBreadcrumbs-li": {
            display: "flex",
            alignItems: "center",
          },
        }}
      >
        {breadcrumbItems.map((item, index) =>
          renderBreadcrumbItem(item as BreadcrumbItemPresentation, index, breadcrumbItems.length)
        )}
      </MUIBreadcrumbs>
    </Stack>
  );
}

Breadcrumbs.displayName = "Breadcrumbs";

export { Breadcrumbs };
