import { memo, useState } from "react";
import { Link, Box } from "@mui/material";
import { ExternalLink } from "lucide-react";
import { IVWLinkProps } from "../../../types/link.types";

/**
 * VWLink component
 *
 * A customizable link component that wraps Material-UI Link with VerifyWise styling.
 * Supports both URL navigation and button-like onClick behavior (e.g., for modals).
 *
 * Features:
 * - URL navigation with configurable new tab behavior
 * - Button-like onClick behavior for modals/actions
 * - Dashed underline styling (default: enabled)
 * - Link icon appears on hover when URL is provided
 * - Accessibility support with proper rel attributes
 * - Type-safe props interface
 * - Performance optimized with memoization
 *
 * @component
 * @example
 * ```tsx
 * // URL navigation (shows icon on hover)
 * <VWLink url="https://example.com">
 *   Visit Example
 * </VWLink>
 *
 * // Open in new tab
 * <VWLink url="https://example.com" openInNewTab={true}>
 *   Open in New Tab
 * </VWLink>
 *
 * // Button-like behavior (for modals, no icon)
 * <VWLink onClick={(e) => handleOpenModal(e)}>
 *   Open Modal
 * </VWLink>
 *
 * // No underline
 * <VWLink url="/internal-page" showUnderline={false}>
 *   No Underline
 * </VWLink>
 * ```
 */

export const VWLink = memo(function VWLink({
  url,
  children,
  onClick,
  openInNewTab = false,
  showUnderline = true,
  showIcon = true,
  sx,
  className,
  ariaLabel,
  testId,
}: IVWLinkProps) {
  const [isHovered, setIsHovered] = useState(false);

  const linkProps =
    url && openInNewTab
      ? {
          target: "_blank",
          rel: "noopener noreferrer",
        }
      : {};

  // Build component props conditionally
  const componentProps = onClick ? { component: "button" as const } : {};

  return (
    <Box
      component="span"
      sx={{ display: "inline-flex", alignItems: "center", gap: 0.5 }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <Link
        href={url}
        {...componentProps}
        onClick={onClick}
        {...linkProps}
        className={className}
        aria-label={ariaLabel}
        data-testid={testId}
        sx={{
          textDecoration: showUnderline ? "underline" : "none",
          textDecorationStyle: showUnderline ? "dashed" : undefined,
          textUnderlineOffset: "4px",
          color: "brand.primary",
          fontSize: 13,
          fontWeight: 500,
          cursor: "pointer",
          outline: "none !important",
          border: "none !important",
          background: "none",
          padding: 0,
          boxShadow: "none !important",
          "&:hover": {
            textDecoration: showUnderline ? "underline" : "none",
            textDecorationStyle: showUnderline ? "dashed" : undefined,
            color: "brand.primaryHover",
            border: "none !important",
            outline: "none !important",
          },
          "&:focus": {
            outline: "none !important",
            border: "none !important",
            boxShadow: "none !important",
          },
          "&:active": {
            outline: "none !important",
            border: "none !important",
            boxShadow: "none !important",
          },
          "&:focus-visible": {
            outline: "2px solid brand.primary",
            outlineOffset: "2px",
            borderRadius: "2px",
            border: "none !important",
          },
          ...sx,
        }}
      >
        {children}
      </Link>
      {url && isHovered && showIcon && (
        <ExternalLink
          size={14}
          style={{
            color: "brand.primary",
            transition: "opacity 0.2s ease",
          }}
        />
      )}
    </Box>
  );
});

VWLink.displayName = "VWLink";
