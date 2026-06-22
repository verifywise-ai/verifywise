import React, { memo, useCallback } from "react";
import { Button, CircularProgress, Box } from "@mui/material";
import { ButtonProps, SxProps, Theme } from "@mui/material";
import singleTheme from "../../../themes/v1SingleTheme";
import { CustomizableButtonProps } from "../../../types/button.types";

/** Size dimensions applied after theme appearance (medium matches app standard 34px). */
const BUTTON_SIZE_STYLES: Record<"small" | "medium", SxProps<Theme>> = {
  small: {
    height: 28,
    minHeight: 28,
    fontSize: "12px",
    padding: "6px 12px",
  },
  medium: {
    height: 34,
    minHeight: 34,
    fontSize: "13px",
    padding: "10px 16px",
  },
};

/** Compact square sizing for icon-only buttons (matches small/medium heights). */
const ICON_ONLY_SIZE_STYLES: Record<"small" | "medium", SxProps<Theme>> = {
  small: {
    minWidth: 0,
    width: 28,
    height: 28,
    minHeight: 28,
    padding: "5px",
  },
  medium: {
    minWidth: 0,
    width: 34,
    height: 34,
    minHeight: 34,
    padding: "5px",
  },
};

/**
 * CustomizableButton component
 *
 * A highly customizable button component that extends Material-UI Button with additional features.
 * Supports various styles, loading states, icons, and accessibility features.
 *
 * Features:
 * - Theme-based styling with customizable variants
 * - Loading state with spinner
 * - Icon positioning with proper spacing
 * - Icon-only mode for compact toolbar/close actions
 * - Full accessibility support with ARIA attributes
 * - Keyboard navigation support
 * - Performance optimized with memoization
 *
 * @component
 * @example
 * ```tsx
 * <CustomizableButton
 *   variant="contained"
 *   size="medium"
 *   color="primary"
 *   loading={false}
 *   startIcon={<SaveIcon />}
 *   onClick={handleSave}
 *   ariaLabel="Save document"
 * >
 *   Save Document
 * </CustomizableButton>
 * ```
 */

/**
 * CustomizableButton component implementation
 */
const CustomizableButton = memo(
  React.forwardRef<HTMLButtonElement, CustomizableButtonProps>(function CustomizableButton(
    {
      variant = "contained",
      size = "medium",
      isDisabled: isDisabledProp = false,
      disabled: disabledAlias,
      isLink = false,
      color = "primary",
      onClick,
      sx,
      text,
      icon,
      startIcon,
      endIcon,
      children,
      loading = false,
      loadingIndicator,
      ariaLabel,
      ariaDescribedBy,
      testId,
      type = "button",
      fullWidth = false,
      className,
      title,
      indicator,
      textColor,
      iconOnly = false,
      ...rest
    },
    ref,
  ) {
    // Merge disabled alias with isDisabled
    const isDisabled = isDisabledProp || disabledAlias || false;

    // Handle click events with error boundary
    const handleClick = useCallback(
      (event: React.MouseEvent<HTMLButtonElement>) => {
        if (loading || isDisabled) {
          event.preventDefault();
          return;
        }

        onClick?.(event);
      },
      [onClick, loading, isDisabled],
    );

    // Handle keyboard events for accessibility
    const handleKeyDown = useCallback(
      (event: React.KeyboardEvent<HTMLButtonElement>) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          if (!loading && !isDisabled) {
            // For keyboard accessibility, call handleClick directly
            // We need to create a proper synthetic event to avoid TypeScript errors
            handleClick(event as unknown as React.MouseEvent<HTMLButtonElement>);
          }
        }
      },
      [handleClick, loading, isDisabled],
    );

    const sizeKey = size === "small" ? "small" : "medium";

    // Get theme-based appearance - ensure proper typing for MUI sx prop
    const appearance = (singleTheme.buttons?.[color]?.[variant] || {}) as SxProps<Theme>;

    const iconContent = children || startIcon || icon;
    const buttonText = iconOnly ? null : children || text || "CustomizableButton";
    const resolvedStartIcon = iconOnly ? undefined : startIcon || icon;
    const resolvedEndIcon = iconOnly ? undefined : endIcon;
    const showCenteredSpinner =
      loading && (iconOnly ? !iconContent : !resolvedStartIcon && !resolvedEndIcon);

    // Custom loading indicator or default spinner
    const spinner = loadingIndicator || (
      <CircularProgress
        size={16}
        color="inherit"
        sx={{ mr: !iconOnly && (resolvedStartIcon || resolvedEndIcon) ? 1 : 0 }}
      />
    );

    const { selectionFollowsFocus, ...filteredRest } = rest as Record<string, unknown>;

    return (
      <Button
        ref={ref}
        className={className}
        disableRipple
        variant={variant as ButtonProps["variant"]}
        size={size as ButtonProps["size"]}
        disabled={isDisabled || loading}
        color={color as ButtonProps["color"]}
        onClick={handleClick}
        onKeyDown={handleKeyDown}
        type={type}
        fullWidth={fullWidth}
        title={title}
        aria-label={ariaLabel}
        aria-describedby={ariaDescribedBy}
        aria-disabled={isDisabled || loading}
        data-testid={testId}
        sx={[
          appearance,
          iconOnly ? ICON_ONLY_SIZE_STYLES[sizeKey] : BUTTON_SIZE_STYLES[sizeKey],
          {
            "position": "relative",
            ...(iconOnly && {
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
            }),
            "&.Mui-disabled": {
              pointerEvents: loading ? "none" : "auto",
            },
          },
          ...(Array.isArray(sx) ? sx : [sx]),
        ]}
        disableElevation={variant === "contained" && !isLink}
        startIcon={
          iconOnly ? undefined : loading && (resolvedStartIcon || resolvedEndIcon) ? (
            <Box component="span" sx={{ display: "flex", alignItems: "center" }}>
              {spinner}
            </Box>
          ) : (
            (resolvedStartIcon as React.ReactNode)
          )
        }
        endIcon={!loading && !iconOnly ? (resolvedEndIcon as React.ReactNode) : undefined}
        {...filteredRest}
      >
        {showCenteredSpinner && (
          <Box
            component="span"
            sx={{
              position: "absolute",
              left: "50%",
              top: "50%",
              transform: "translate(-50%, -50%)",
            }}
          >
            {spinner}
          </Box>
        )}
        <Box
          component="span"
          sx={{
            opacity: showCenteredSpinner ? 0 : 1,
            transition: "opacity 0.2s ease",
            ...(iconOnly && {
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
            }),
          }}
        >
          {iconOnly ? (iconContent as React.ReactNode) : (buttonText as React.ReactNode)}
        </Box>
      </Button>
    );
  }),
);

CustomizableButton.displayName = "CustomizableButton";

export { CustomizableButton };
