/**
 * This file is currently in use
 */

import {
  Select as MuiSelect,
  SelectChangeEvent,
  Stack,
  Typography,
  useTheme,
  MenuItem,
  Chip,
  Box,
} from "@mui/material";
import { useState } from "react";
import "./index.css";
import { ChevronDown } from "lucide-react";

interface CustomizableMultiSelectProps {
  label: string;
  required?: boolean;
  error?: boolean | string;
  value: string | number | (string | number)[];
  onChange: (
    event: SelectChangeEvent<string | number | (string | number)[]>,
    child: React.ReactNode,
  ) => void;
  items: {
    _id: string | number;
    name: string;
    email?: string;
    surname?: string;
  }[];
  getOptionValue?: (item: {
    _id: string | number;
    name: string;
    email?: string;
    surname?: string;
  }) => string | number;
  placeholder?: string;
  isHidden?: boolean;
  width?: number;
  sx?: object;
}

function CustomizableMultiSelect({
  label = "This is a multi-select",
  required = false,
  error,
  value = [],
  onChange,
  items,
  getOptionValue,
  placeholder,
  isHidden,
  width,
  sx,
}: CustomizableMultiSelectProps) {
  const theme = useTheme();
  const [open, setOpen] = useState(false);

  const itemStyles = {
    fontSize: "var(--env-var-font-size-medium)",
    color: theme.palette.text.tertiary,
    borderRadius: theme.shape.borderRadius,
    margin: theme.spacing(2),
  };

  const handleChipDelete = (id: string | number) => {
    const idStr = String(id);
    const current = (Array.isArray(value) ? value : [value]).filter((v) => String(v) !== idStr) as (
      | string
      | number
    )[];
    const syntheticEvent = {
      target: { value: current, name: "vw-multi-select" },
    } as unknown as SelectChangeEvent<(string | number)[]>;
    onChange(syntheticEvent, null);
  };

  const handleChange = (
    event: SelectChangeEvent<string | number | (string | number)[]>,
    child: React.ReactNode,
  ) => {
    onChange(event, child);
    // Close the dropdown after selection
    setOpen(false);
  };

  const renderValue = (value: unknown) => {
    const selected = value as (string | number)[];
    const selectedItems = items.filter((item) =>
      selected.includes(getOptionValue ? getOptionValue(item) : item._id),
    );
    return (
      <Box
        sx={{
          display: "flex",
          flexWrap: "wrap",
          gap: 0.5,
          alignItems: "flex-start",
          maxHeight: "90px",
          overflowY: "auto",
          width: "100%",
          "&::-webkit-scrollbar": {
            width: "6px",
          },
          "&::-webkit-scrollbar-track": {
            background: "transparent",
          },
          "&::-webkit-scrollbar-thumb": {
            background: "rgba(0, 0, 0, 0.2)",
            borderRadius: "3px",
          },
          "&::-webkit-scrollbar-thumb:hover": {
            background: "rgba(0, 0, 0, 0.3)",
          },
        }}
      >
        {selectedItems.map((item) => {
          const idVal = getOptionValue ? getOptionValue(item) : item._id;
          return (
            <Chip
              key={idVal}
              label={item.name + (item.surname ? " " + item.surname : "")}
              onDelete={() => handleChipDelete(idVal)}
              onMouseDown={(e) => {
                // prevent Select from toggling when interacting with chips
                e.stopPropagation();
              }}
              sx={{
                borderRadius: 4,
                height: 24,
                fontSize: 12,
                backgroundColor: theme.palette.background.accent,
                color: theme.palette.text.primary,
                "& .MuiChip-deleteIcon": {
                  color: theme.palette.action.focus,
                  fontSize: 20,
                },
              }}
            />
          );
        })}
      </Box>
    );
  };

  return (
    <Stack
      className="vw-multi-select"
      gap={theme.spacing(2)}
      sx={{
        width,
        ".MuiOutlinedInput-notchedOutline": {
          border: error
            ? `1px solid ${theme.palette.status.error.border}!important`
            : `1px solid ${theme.palette.border.dark}!important`,
        },
      }}
    >
      {label && (
        <Typography
          className="vw-multi-select-label"
          sx={{
            display: "flex",
            alignItems: "center",
            fontWeight: 500,
            fontSize: 13,
            color: `${theme.palette.text.secondary}`,
          }}
        >
          {label}
          {required && (
            <Box
              component="span"
              className="required"
              sx={{
                ml: theme.spacing(1),
                color: theme.palette.error.text,
              }}
            >
              *
            </Box>
          )}
        </Typography>
      )}
      <MuiSelect
        id="vw-multi-select"
        className="select-component"
        value={value}
        onChange={handleChange}
        open={open}
        onOpen={() => setOpen(true)}
        onClose={() => setOpen(false)}
        multiple
        displayEmpty
        renderValue={renderValue}
        IconComponent={() => <ChevronDown size={16} />}
        error={!!error}
        sx={{
          ...sx,
          "& .MuiOutlinedInput-input": {
            paddingTop: "16.5px",
            paddingBottom: "16.5px",
          },
        }}
        MenuProps={{
          disableScrollLock: true,
          PaperProps: {
            sx: {
              borderRadius: theme.shape.borderRadius,
              boxShadow: theme.boxShadow,
              mt: 1,
              "& .MuiMenuItem-root": {
                fontSize: 13,
                color: theme.palette.text.primary,
                transition: "color 0.2s ease, background-color 0.2s ease",
                "&:hover": {
                  backgroundColor: theme.palette.background.accent,
                  color: theme.palette.primary.main,
                },
                "&.Mui-selected": {
                  backgroundColor: theme.palette.background.accent,
                  "&:hover": {
                    backgroundColor: theme.palette.background.accent,
                    color: theme.palette.primary.main,
                  },
                },
                "& .MuiTouchRipple-root": {
                  display: "none",
                },
              },
            },
          },
        }}
      >
        {placeholder && (
          <MenuItem
            className="select-placeholder"
            value="0"
            sx={{
              display: isHidden ? "none" : "flex",
              visibility: isHidden ? "none" : "visible",
              ...itemStyles,
            }}
          >
            {placeholder}
          </MenuItem>
        )}
        {items
          .filter((item) => {
            const itemValue = getOptionValue ? getOptionValue(item) : item._id;
            const selectedValues = Array.isArray(value) ? value : [value];
            return !selectedValues.map((v) => String(v)).includes(String(itemValue));
          })
          .map((item: { _id: string | number; name: string; email?: string; surname?: string }) => (
            <MenuItem
              value={getOptionValue ? getOptionValue(item) : item._id}
              key={`${item._id}`}
              sx={{
                display: "flex",
                ...itemStyles,
                justifyContent: "space-between",
                flexDirection: "row",
                gap: 1,
              }}
            >
              <span style={{ marginRight: 1 }}>{`${item.name} ${
                item.surname ? item.surname : ""
              }`}</span>
              {item.email && (
                <span
                  style={{ fontSize: 11, color: theme.palette.text.disabled, marginLeft: "4px" }}
                >
                  {`${item.email}`}
                </span>
              )}
            </MenuItem>
          ))}
      </MuiSelect>
      {error && (
        <Typography
          className="input-error"
          color={theme.palette.status.error.text}
          mt={theme.spacing(2)}
          sx={{
            opacity: 0.8,
            fontSize: 11,
          }}
        >
          {error}
        </Typography>
      )}
    </Stack>
  );
}

export default CustomizableMultiSelect;
