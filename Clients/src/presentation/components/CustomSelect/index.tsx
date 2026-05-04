/**
 * CustomSelect Component
 *
 * A reusable selection component that can be used across different features.
 * Uses the standard Select component with configurable options and handlers.
 *
 * Features:
 * - Fully configurable options
 * - Interactive updates with loading states
 * - Consistent styling with design system
 * - Error handling and validation
 * - Reusable for status, sort, filter, or any selection needs
 *
 * @component
 * @example
 * ```tsx
 * // For status updates
 * <CustomSelect
 *   currentValue="In Progress"
 *   onValueChange={handleStatusUpdate}
 *   options={["Open", "In Progress", "Completed"]}
 * />
 *
 * // For sorting
 * <CustomSelect
 *   currentValue="newest"
 *   onValueChange={handleSortChange}
 *   options={["newest", "oldest", "priority"]}
 * />
 * ```
 */

import React, { useState } from "react";
import { SelectChangeEvent } from "@mui/material";
import Select from "../Inputs/Select";
import { CustomSelectProps } from "src/domain/types/widget.types";

function CustomSelectInner({
  currentValue,
  onValueChange,
  options,
  disabled = false,
  size = "small",
  sx = {},
}: CustomSelectProps) {
  const [isUpdating, setIsUpdating] = useState(false);

  const handleChange = async (event: SelectChangeEvent<string | number>) => {
    const newValue = event.target.value as string;
    if (newValue === currentValue || isUpdating || disabled) return;

    setIsUpdating(true);
    try {
      const success = await onValueChange(newValue);
      if (!success) {
        console.error("Failed to update value");
      }
    } catch (error) {
      console.error("Error updating value:", error);
    } finally {
      setIsUpdating(false);
    }
  };

  const selectItems = (options ?? []).map((option) => {
    if (typeof option === "string") {
      return {
        _id: option,
        name: option,
      };
    } else {
      return {
        _id: option.value,
        name: option.label,
        icon: option.icon,
        color: option.color,
      };
    }
  });

  return (
    <Select
      id={`custom-select-${Date.now()}`}
      value={currentValue}
      items={selectItems}
      onChange={handleChange}
      getOptionValue={(item) => item._id}
      disabled={disabled || isUpdating}
      sx={{
        minWidth: size === "small" ? 120 : 140,
        "& .MuiOutlinedInput-root": {
          height: "34px",
        },
        ...sx,
      }}
    />
  );
}

export const CustomSelect = React.memo(CustomSelectInner);
CustomSelect.displayName = "CustomSelect";
