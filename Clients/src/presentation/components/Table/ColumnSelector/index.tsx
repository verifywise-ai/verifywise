/**
 * @fileoverview Reusable Column Selector Component
 *
 * A dropdown menu for selecting which columns to display in any table.
 * Works with the useColumnVisibility hook.
 *
 * @module presentation/components/Table/ColumnSelector
 *
 * @example
 * const { visibleColumns, allColumns, toggleColumn, resetToDefaults } = useColumnVisibility({
 *   tableId: "my-table",
 *   columns: MY_COLUMNS,
 * });
 *
 * <ColumnSelector
 *   columns={allColumns}
 *   visibleColumns={visibleColumns}
 *   onToggleColumn={toggleColumn}
 *   onResetToDefaults={resetToDefaults}
 * />
 */

import React, { useState } from "react";
import {
  Box,
  Button,
  Checkbox,
  Popover,
  Typography,
  Stack,
  Divider,
} from "@mui/material";
import { Columns } from "lucide-react";
import { ColumnConfig } from "../../../../application/hooks/useColumnVisibility";
import { brand, text, background, border as borderPalette } from "../../../themes/palette";

interface ColumnSelectorProps<TKey extends string = string> {
  /** All available column configurations */
  columns: ColumnConfig<TKey>[];
  /** Set of currently visible column keys */
  visibleColumns: Set<TKey>;
  /** Callback when a column is toggled */
  onToggleColumn: (column: TKey) => void;
  /** Callback to reset to default visibility */
  onResetToDefaults: () => void;
  /** Optional button text (default: "Columns") */
  buttonText?: string;
  /** Optional button variant */
  variant?: "text" | "outlined" | "contained";
}

/**
 * Reusable Column Selector Component
 *
 * Renders a button that opens a popover with checkboxes for each column.
 * Columns marked as alwaysVisible cannot be unchecked.
 */
export function ColumnSelector<TKey extends string = string>({
  columns,
  visibleColumns,
  onToggleColumn,
  onResetToDefaults,
  buttonText = "Columns",
  variant = "outlined",
}: ColumnSelectorProps<TKey>): React.ReactElement {
  const [anchorEl, setAnchorEl] = useState<HTMLButtonElement | null>(null);

  const handleClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    setAnchorEl(event.currentTarget);
  };

  const handleClose = () => {
    setAnchorEl(null);
  };

  const open = Boolean(anchorEl);

  return (
    <>
      <Button
        onClick={handleClick}
        variant={variant}
        startIcon={<Columns size={16} />}
        sx={{
          height: 34,
          minWidth: 100,
          padding: "6px 12px",
          borderRadius: "4px",
          border: variant === "outlined" ? `1px solid ${borderPalette.dark}` : undefined,
          backgroundColor: variant === "outlined" ? "white" : undefined,
          color: `${text.secondary}`,
          fontSize: 13,
          fontWeight: 500,
          textTransform: "none",
          "&:hover": {
            backgroundColor: variant === "outlined" ? `${background.accent}` : undefined,
            borderColor: variant === "outlined" ? `${text.muted}` : undefined,
          },
        }}
      >
        {buttonText}
      </Button>

      <Popover
        open={open}
        anchorEl={anchorEl}
        onClose={handleClose}
        anchorOrigin={{
          vertical: "bottom",
          horizontal: "right",
        }}
        transformOrigin={{
          vertical: "top",
          horizontal: "right",
        }}
        slotProps={{
          paper: {
            sx: {
              mt: 1,
              minWidth: 220,
              maxWidth: 280,
              boxShadow: "0px 4px 16px rgba(0, 0, 0, 0.1)",
              borderRadius: "4px",
              border: "1px solid #E0E4E9",
            },
          },
        }}
      >
        <Box sx={{ padding: "12px 16px" }}>
          <Typography
            sx={{
              fontSize: 13,
              fontWeight: 600,
              color: "#101828",
              mb: 0.5,
            }}
          >
            Show columns
          </Typography>
          <Typography
            sx={{
              fontSize: 12,
              color: `${text.icon}`,
            }}
          >
            Select which columns to display
          </Typography>
        </Box>

        <Divider />

        <Stack sx={{ padding: "8px 0", maxHeight: 300, overflowY: "auto" }}>
          {columns.map((column) => (
            <Box
              key={column.key}
              onClick={() => {
                if (!column.alwaysVisible) {
                  onToggleColumn(column.key);
                }
              }}
              sx={{
                display: "flex",
                alignItems: "center",
                padding: "6px 16px",
                cursor: column.alwaysVisible ? "not-allowed" : "pointer",
                opacity: column.alwaysVisible ? 0.6 : 1,
                "&:hover": {
                  backgroundColor: column.alwaysVisible
                    ? "transparent"
                    : `${background.accent}`,
                },
              }}
            >
              <Checkbox
                checked={visibleColumns.has(column.key)}
                disabled={column.alwaysVisible}
                onClick={(e) => e.stopPropagation()}
                onChange={() => {
                  if (!column.alwaysVisible) {
                    onToggleColumn(column.key);
                  }
                }}
                size="small"
                sx={{
                  padding: 0,
                  marginRight: 1.5,
                  color: `${borderPalette.dark}`,
                  "&.Mui-checked": {
                    color: `${brand.primary}`,
                  },
                  "&.Mui-disabled": {
                    color: `${borderPalette.dark}`,
                  },
                }}
              />
              <Typography
                sx={{
                  fontSize: 13,
                  color: `${text.secondary}`,
                }}
              >
                {column.label}
              </Typography>
              {column.alwaysVisible && (
                <Typography
                  sx={{
                    fontSize: 11,
                    color: `${text.muted}`,
                    ml: "auto",
                  }}
                >
                  Required
                </Typography>
              )}
            </Box>
          ))}
        </Stack>

        <Divider />

        <Box sx={{ padding: "8px 16px" }}>
          <Button
            onClick={() => {
              onResetToDefaults();
              handleClose();
            }}
            fullWidth
            sx={{
              fontSize: 13,
              fontWeight: 500,
              color: `${text.icon}`,
              textTransform: "none",
              padding: "6px 12px",
              borderRadius: "4px",
              "&:hover": {
                backgroundColor: `${background.accent}`,
                color: `${text.secondary}`,
              },
            }}
          >
            Reset to defaults
          </Button>
        </Box>
      </Popover>
    </>
  );
}

export default ColumnSelector;
