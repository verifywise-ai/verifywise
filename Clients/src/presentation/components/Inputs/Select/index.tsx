/**
 * A custom select component that wraps Material-UI's Select component.
 *
 * @component
 * @param {Object} props - The properties object.
 * @param {string} props.id - The unique identifier for the select input.
 * @param {string} [props.label] - The label for the select input.
 * @param {string} [props.placeholder] - The placeholder text for the select input.
 * @param {boolean} [props.isHidden] - Flag to determine if the placeholder should be hidden.
 * @param {string | number} props.value - The current value of the select input.
 * @param {Array<{ _id: string | number; name: string }>} props.items - The list of items to display in the select dropdown.
 * @param {function} props.onChange - The callback function to handle changes in the select input.
 * @param {object} [props.sx] - Additional styles to apply to the select component.
 * @param {function} props.getOptionValue - The function to get the value of an option.
 * @param {boolean} [props.disabled] - Flag to determine if the select input is disabled.
 * @returns {JSX.Element} The rendered select component.
 */

import React from "react";
import {
  Divider,
  ListSubheader,
  MenuItem,
  Select as MuiSelect,
  Stack,
  SxProps,
  Theme,
  Typography,
  useTheme,
} from "@mui/material";
import "./index.css";
import { ChevronDown } from "lucide-react";
import { SelectProps } from "../../../types/widget.types";
import { getSelectStyles } from "../../../utils/inputStyles";

function isRecordSx(sx: SxProps<Theme>): sx is Record<string, unknown> {
  return typeof sx === 'object' && sx !== null && !Array.isArray(sx);
}

function Select({
  id,
  label,
  placeholder,
  value,
  items,
  isRequired,
  isOptional,
  optionalLabel,
  error,
  onChange,
  sx,
  getOptionValue,
  disabled,
  customRenderValue,
  isFilterApplied = false,
  dividerAfterIndex,
  dividerLabel,
  dividers,
}: SelectProps) {
  const theme = useTheme();
  const itemStyles = {
    fontSize: "var(--env-var-font-size-medium)",
    color: theme.palette.text.tertiary,
    borderRadius: theme.shape.borderRadius,
    margin: "4px 8px",
  };

  // Extract width, flexGrow, minWidth, maxWidth from sx prop to apply to wrapper Stack
  const extractedLayoutProps = sx && isRecordSx(sx)
    ? {
        width: sx.width as string | number | undefined,
        flexGrow: sx.flexGrow as number | undefined,
        minWidth: sx.minWidth as string | number | undefined,
        maxWidth: sx.maxWidth as string | number | undefined,
      }
    : {};

  // Create a copy of sx without layout props to pass to MuiSelect
  const sxWithoutLayoutProps = sx && isRecordSx(sx)
    ? Object.fromEntries(Object.entries(sx).filter(([key]) => !['width', 'flexGrow', 'minWidth', 'maxWidth'].includes(key)))
    : sx;

  const renderValue = (value: unknown) => {
    const selected = value as string | number;
    const selectedItem = items.find(
      (item) => (getOptionValue ? getOptionValue(item) : item._id) === selected
    );

    let displayText;
    if (customRenderValue && selectedItem) {
      displayText = customRenderValue(value, selectedItem);
    } else {
      displayText = selectedItem
        ? selectedItem.name +
          (selectedItem.surname ? " " + selectedItem.surname : "")
        : placeholder;
    }

    return (
      <Stack direction="row" alignItems="center" spacing={1} sx={{ minWidth: 0 }}>
        {selectedItem?.icon && <selectedItem.icon color={selectedItem.color} size={16} />}
        <span
          style={{
            display: "block",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            minWidth: 0,
            maxWidth: "100%",
          }}
        >
          {displayText}
        </span>
      </Stack>
    );
  };

  return (
    <Stack
      gap={theme.spacing(2)}
      className="select-wrapper"
      sx={extractedLayoutProps}
    >
      {label && (
        <Typography
          component="p"
          variant="body1"
          color={theme.palette.text.secondary}
          fontWeight={500}
          fontSize={"13px"}
          sx={{
            margin: 0,
            height: '22px',
            display: "flex",
            alignItems: "center",
          }}
        >
          {label}
          {isRequired && (
            <Typography
              component="span"
              ml={theme.spacing(1)}
              color={theme.palette.error.text}
            >
              *
            </Typography>
          )}
          {isOptional && (
            <Typography
              component="span"
              fontSize="inherit"
              fontWeight={400}
              ml={theme.spacing(2)}
              sx={{ opacity: 0.6 }}
            >
              {optionalLabel || "(optional)"}
            </Typography>
          )}
        </Typography>
      )}
      <MuiSelect
        className="select-component"
        value={value}
        onChange={onChange}
        displayEmpty
        inputProps={{ id: id }}
        renderValue={renderValue}
        IconComponent={() => (
          <ChevronDown
            size={16}
            style={{
              position: 'absolute',
              right: '12px',
              top: '50%',
              transform: 'translateY(-50%)',
              pointerEvents: 'none',
              color: theme.palette.text.tertiary
            }}
          />
        )}
        disabled={disabled}
        MenuProps={{
          disableScrollLock: true,
          style: { zIndex: 10001 },
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
        sx={{
          fontSize: 13,
          minWidth: "125px",
          width: "100%",
          backgroundColor: isFilterApplied ? theme.palette.background.fill : theme.palette.background.main,
          position: "relative",
          cursor: "pointer",
          ...getSelectStyles(theme, { hasError: !!error }),
          ...sxWithoutLayoutProps,
        }}
      >
        {items.flatMap(
          (item: {
            _id: string | number;
            name: string;
            email?: string;
            surname?: string;
            icon?: React.ComponentType<{ color?: string; size?: number }>;
            color?: string;
          }, index: number) => {
            const menuItem = (
              <MenuItem
                value={getOptionValue ? getOptionValue(item) : item._id}
                key={`${id}-${item._id}`}
                sx={{
                  display: "flex",
                  ...itemStyles,
                  justifyContent: "space-between",
                  flexDirection: "row",
                }}
              >
                <Stack direction="row" alignItems="center" spacing={1}>
                  {item.icon && <item.icon color={item.color} size={16} />}
                  <span>{`${item.name} ${item.surname ? item.surname : ""}`}</span>
                </Stack>
                {item.email && (
                  <span style={{ fontSize: 11, color: theme.palette.text.disabled }}>
                    {item.email}
                  </span>
                )}
              </MenuItem>
            );

            // Check single divider prop
            if (dividerAfterIndex !== undefined && index === dividerAfterIndex) {
              const elements: React.ReactElement[] = [
                <Divider key={`${id}-divider-${index}`} sx={{ my: 0.5 }} />,
              ];
              if (dividerLabel) {
                elements.push(
                  <ListSubheader
                    key={`${id}-divider-label-${index}`}
                    sx={{
                      fontSize: 11,
                      fontWeight: 600,
                      color: theme.palette.text.tertiary,
                      lineHeight: "28px",
                      backgroundColor: "transparent",
                    }}
                  >
                    {dividerLabel}
                  </ListSubheader>
                );
              }
              elements.push(menuItem);
              return elements;
            }

            // Check multi-divider prop
            const dividerEntry = dividers?.find((d) => d.index === index);
            if (dividerEntry) {
              const elements: React.ReactElement[] = [
                <Divider key={`${id}-divider-${index}`} sx={{ my: 0.5 }} />,
              ];
              if (dividerEntry.label) {
                elements.push(
                  <ListSubheader
                    key={`${id}-divider-label-${index}`}
                    sx={{
                      fontSize: 11,
                      fontWeight: 600,
                      color: theme.palette.text.tertiary,
                      lineHeight: "28px",
                      backgroundColor: "transparent",
                    }}
                  >
                    {dividerEntry.label}
                  </ListSubheader>
                );
              }
              elements.push(menuItem);
              return elements;
            }

            return [menuItem];
          }
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

export default Select;
