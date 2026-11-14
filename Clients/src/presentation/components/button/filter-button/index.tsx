/**
 * FilterButton Component
 *
 * A reusable filter button component that shows active filter state
 * and provides consistent styling across the application.
 */

import React, { memo } from "react";
import { Box, useTheme } from "@mui/material";
import { CustomizableButton } from "../customizable-button";
import { FilterButtonProps } from "../../../types/button.types";
import { radiusPx } from "../../../themes/palette";

const FilterIcon: React.FC<{ size?: number }> = ({ size = 18 }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path
      d="M6 12H18M3 6H21M9 18H15"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const FilterButton = memo(function FilterButton({
  isOpen,
  hasActiveFilters,
  activeFilterCount,
  onClick,
  disabled = false,
  sx = {},
}: FilterButtonProps) {
  const theme = useTheme();
  return (
    <Box
      sx={{
        position: "relative",
        display: "inline-flex",
        alignItems: "center",
        gap: 1,
      }}
    >
      <CustomizableButton
        variant="outlined"
        icon={<FilterIcon />}
        text="Filters"
        onClick={onClick}
        isDisabled={disabled}
        sx={{
          backgroundColor: isOpen ? theme.palette.action.hover : "transparent",
          height: "34px",
          minHeight: "34px",
          ...sx,
        }}
      />
      {hasActiveFilters && (
        <Box
          sx={{
            backgroundColor: theme.palette.primary.main,
            color: theme.palette.primary.contrastText,
            px: 1,
            py: 0.2,
            borderRadius: radiusPx.pill,
            fontSize: "11px",
            fontWeight: 600,
            minWidth: "20px",
            height: "20px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            ml: 0.5,
          }}
        >
          {activeFilterCount !== undefined ? activeFilterCount : "Active"}
        </Box>
      )}
    </Box>
  );
});

FilterButton.displayName = "FilterButton";

export { FilterButton };
