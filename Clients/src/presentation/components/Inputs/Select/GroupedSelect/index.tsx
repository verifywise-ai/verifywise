/**
 * GroupedSelect - A VerifyWise select component that supports grouped options with custom rendering
 *
 * @component
 * @example
 * <GroupedSelect
 *   id="dataset-select"
 *   value={selectedDataset}
 *   onChange={(value) => setSelectedDataset(value)}
 *   placeholder="Select a dataset"
 *   groups={[
 *     {
 *       label: "My Datasets",
 *       items: myDatasets.map(ds => ({ value: ds.path, label: ds.name, description: `${ds.count} items` }))
 *     },
 *     {
 *       label: "Templates",
 *       items: templates.map(t => ({ value: t.path, label: t.name }))
 *     }
 *   ]}
 * />
 */

import React from "react";
import {
  Select as MuiSelect,
  MenuItem,
  Stack,
  Typography,
  useTheme,
  ListSubheader,
} from "@mui/material";
import { ChevronDown } from "lucide-react";
import { getSelectStyles } from "../../../../utils/inputStyles";

export interface GroupedSelectItem {
  value: string | number;
  label: string;
  description?: string;
  icon?: React.ReactNode;
}

export interface GroupedSelectGroup {
  label: string;
  icon?: React.ReactNode;
  color?: string;
  items: GroupedSelectItem[];
}

interface GroupedSelectProps {
  id: string;
  value: string | number;
  onChange: (value: string | number) => void;
  groups: GroupedSelectGroup[];
  placeholder?: string;
  label?: string;
  isRequired?: boolean;
  error?: string;
  disabled?: boolean;
  loading?: boolean;
  loadingText?: string;
  emptyText?: string;
}

function GroupedSelect({
  id,
  value,
  onChange,
  groups,
  placeholder = "Select an option",
  label,
  isRequired,
  error,
  disabled,
  loading,
  loadingText = "Loading...",
  emptyText = "No options available",
}: GroupedSelectProps) {
  const theme = useTheme();

  const allItems = groups.flatMap((g) => g.items);
  const hasItems = allItems.length > 0;

  const renderValue = (selected: unknown) => {
    if (!selected || selected === "") {
      return (
        <Typography sx={{ color: theme.palette.text.disabled, fontSize: 13 }}>
          {loading ? loadingText : placeholder}
        </Typography>
      );
    }

    const item = allItems.find((i) => i.value === selected);
    if (!item) return placeholder;

    return (
      <Stack direction="row" alignItems="center" spacing={1}>
        {item.icon}
        <Typography sx={{ fontSize: 13, fontWeight: 500 }}>{item.label}</Typography>
      </Stack>
    );
  };

  return (
    <Stack gap={theme.spacing(2)}>
      {label && (
        <Typography
          component="p"
          variant="body1"
          color={theme.palette.text.secondary}
          fontWeight={500}
          fontSize="13px"
          sx={{
            margin: 0,
            height: "22px",
            display: "flex",
            alignItems: "center",
          }}
        >
          {label}
          {isRequired && (
            <Typography component="span" ml={theme.spacing(1)} color={theme.palette.error.text}>
              *
            </Typography>
          )}
        </Typography>
      )}
      <MuiSelect
        id={id}
        value={value || ""}
        onChange={(e) => onChange(e.target.value)}
        displayEmpty
        disabled={disabled || loading}
        renderValue={renderValue}
        IconComponent={() => (
          <ChevronDown
            size={16}
            style={{
              position: "absolute",
              right: "12px",
              top: "50%",
              transform: "translateY(-50%)",
              pointerEvents: "none",
              color: theme.palette.text.tertiary,
            }}
          />
        )}
        MenuProps={{
          disableScrollLock: true,
          PaperProps: {
            sx: {
              maxHeight: 280,
              overflowY: "auto",
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
        sx={{
          fontSize: 13,
          width: "100%",
          height: 34,
          backgroundColor: theme.palette.background.main,
          position: "relative",
          cursor: "pointer",
          ...getSelectStyles(theme, { hasError: !!error }),
        }}
      >
        {/* Placeholder item */}
        <MenuItem value="" disabled sx={{ display: "none" }}>
          <Typography sx={{ color: theme.palette.text.disabled, fontSize: 13 }}>
            {loading ? loadingText : placeholder}
          </Typography>
        </MenuItem>

        {/* Grouped items */}
        {groups.map((group, groupIndex) => {
          if (group.items.length === 0) return null;

          return [
            <ListSubheader
              key={`group-${groupIndex}`}
              sx={{
                position: "relative",
                backgroundColor: theme.palette.background.paper,
                lineHeight: "32px",
                py: 0.5,
                mt: groupIndex > 0 ? 1 : 0,
              }}
            >
              <Typography
                sx={{
                  fontSize: 11,
                  fontWeight: 700,
                  color: group.color || theme.palette.text.secondary,
                  textTransform: "uppercase",
                }}
              >
                {group.label}
              </Typography>
            </ListSubheader>,
            ...group.items.map((item) => (
              <MenuItem
                key={`${groupIndex}-${item.value}`}
                value={item.value}
                sx={{
                  pl: 2,
                  borderRadius: theme.shape.borderRadius,
                  mx: 1,
                  my: 0.25,
                }}
              >
                <Stack
                  direction="row"
                  alignItems="center"
                  justifyContent="space-between"
                  sx={{ width: "100%" }}
                >
                  <Typography sx={{ fontSize: 13, fontWeight: 500 }}>{item.label}</Typography>
                  {item.description && (
                    <Typography sx={{ fontSize: 11, color: theme.palette.text.disabled }}>
                      {item.description}
                    </Typography>
                  )}
                </Stack>
              </MenuItem>
            )),
          ];
        })}

        {/* Empty state */}
        {!hasItems && !loading && (
          <MenuItem disabled>
            <Typography
              sx={{ fontSize: 13, color: theme.palette.text.disabled, fontStyle: "italic" }}
            >
              {emptyText}
            </Typography>
          </MenuItem>
        )}
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

export default GroupedSelect;
