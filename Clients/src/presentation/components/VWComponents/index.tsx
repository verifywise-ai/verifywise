/**
 * VerifyWise-styled components for plugin UI consistency
 * These replicate the styling of VerifyWise's internal components
 */

import React, { forwardRef, useState } from "react";
import {
  Stack,
  TextField,
  Typography,
  Select as MuiSelect,
  MenuItem,
  Switch,
  InputAdornment,
  IconButton,
  TextFieldProps,
  SelectChangeEvent,
} from "@mui/material";
import { ChevronDown, Eye, EyeOff } from "lucide-react";

// ============================================
// Theme colors (matching VerifyWise theme)
// ============================================
const colors = {
  primary: "#13715B",
  primaryLight: "#13715B",
  primaryRing: "#13715B1A",
  border: {
    dark: "#D0D5DD",
    light: "#E5E7EB",
  },
  text: {
    primary: "#344054",
    secondary: "#475467",
    tertiary: "#667085",
  },
  background: {
    main: "#FFFFFF",
    fill: "#F9FAFB",
    accent: "#F3F4F6",
  },
  error: {
    main: "#D92D20",
    border: "#FDA29B",
  },
};

// ============================================
// Input Styles (matching inputStyles.ts)
// ============================================
const getInputStyles = (hasError = false) => ({
  "& fieldset": {
    borderColor: hasError ? colors.error.border : colors.border.dark,
    borderRadius: "4px",
    transition: "border-color 150ms ease-in-out, box-shadow 150ms ease-in-out",
  },
  "&:not(:has(.Mui-disabled)):not(:has(.Mui-focused)) .MuiOutlinedInput-root:hover fieldset": {
    borderColor: hasError ? colors.error.border : colors.primaryLight,
  },
  "& .MuiOutlinedInput-root.Mui-focused fieldset": {
    borderColor: hasError ? colors.error.border : `${colors.primary} !important`,
    borderWidth: "2px",
    ...(hasError ? {} : { boxShadow: `0 0 0 3px ${colors.primaryRing}` }),
  },
  "& .MuiOutlinedInput-root.Mui-disabled": {
    "backgroundColor": colors.background.fill,
    "cursor": "not-allowed",
    "& fieldset": {
      borderColor: colors.border.light,
    },
  },
});

const getSelectStyles = (hasError = false) => ({
  "& .MuiOutlinedInput-notchedOutline": {
    borderColor: hasError ? colors.error.border : colors.border.dark,
    borderRadius: "4px",
    transition: "border-color 150ms ease-in-out, box-shadow 150ms ease-in-out",
  },
  "&:not(.Mui-disabled):hover .MuiOutlinedInput-notchedOutline": {
    borderColor: hasError ? colors.error.border : colors.primaryLight,
  },
  "&.Mui-focused .MuiOutlinedInput-notchedOutline": {
    borderColor: hasError ? colors.error.border : `${colors.primary} !important`,
    borderWidth: "2px",
    ...(hasError ? {} : { boxShadow: `0 0 0 3px ${colors.primaryRing}` }),
  },
  "&.Mui-disabled": {
    "backgroundColor": colors.background.fill,
    "cursor": "not-allowed",
    "& .MuiOutlinedInput-notchedOutline": {
      borderColor: colors.border.light,
    },
  },
});

// ============================================
// VWField - Text input matching VerifyWise Field
// ============================================
interface VWFieldProps {
  id?: string;
  label?: string;
  type?: string;
  value?: string | number;
  onChange?: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onBlur?: (event: React.FocusEvent<HTMLInputElement>) => void;
  placeholder?: string;
  disabled?: boolean;
  error?: string;
  isRequired?: boolean;
  isOptional?: boolean;
  optionalLabel?: string;
  width?: number | string;
  rows?: number;
  helperText?: string;
  InputProps?: TextFieldProps["InputProps"];
  sx?: any;
}

export const VWField = forwardRef<HTMLInputElement, VWFieldProps>(
  (
    {
      type = "text",
      id,
      label,
      isRequired,
      isOptional,
      optionalLabel,
      placeholder,
      value,
      onChange,
      onBlur,
      error,
      disabled,
      width,
      sx,
      rows,
      helperText,
      InputProps: inputPropsOverride,
    },
    ref,
  ) => {
    const [isVisible, setVisible] = useState(false);

    return (
      <Stack
        gap={1}
        sx={{
          ...getInputStyles(!!error),
          width: width,
          ...(sx || {}),
        }}
      >
        {label && (
          <Typography
            component="p"
            color={colors.text.secondary}
            fontWeight={500}
            fontSize="13px"
            sx={{ margin: 0, height: "22px" }}
          >
            {label}
            {isRequired && (
              <Typography component="span" ml={0.5} color={colors.error.main}>
                *
              </Typography>
            )}
            {isOptional && (
              <Typography
                component="span"
                fontSize="inherit"
                fontWeight={400}
                ml={1}
                sx={{ opacity: 0.6 }}
              >
                {optionalLabel || "(optional)"}
              </Typography>
            )}
          </Typography>
        )}
        <TextField
          type={type === "password" ? (isVisible ? "text" : type) : type}
          id={id}
          placeholder={placeholder}
          multiline={type === "description" || (rows !== undefined && rows > 1)}
          rows={type === "description" ? rows || 4 : rows || 1}
          value={value}
          onChange={onChange}
          onBlur={onBlur}
          disabled={disabled}
          inputRef={ref}
          helperText={helperText}
          size="small"
          fullWidth
          inputProps={{
            sx: {
              color: colors.text.secondary,
              fontSize: 13,
              padding: "8px 12px",
            },
          }}
          InputProps={{
            ...inputPropsOverride,
            endAdornment:
              inputPropsOverride?.endAdornment ||
              (type === "password" && (
                <InputAdornment position="end">
                  <IconButton
                    aria-label="toggle password visibility"
                    onClick={() => setVisible((show) => !show)}
                    tabIndex={-1}
                    sx={{
                      "color": colors.border.dark,
                      "padding": 0.5,
                      "&:focus": { outline: "none" },
                    }}
                  >
                    {!isVisible ? <EyeOff size={16} /> : <Eye size={16} />}
                  </IconButton>
                </InputAdornment>
              )),
          }}
          sx={{ fontSize: 13 }}
        />
        {error && (
          <Typography
            component="span"
            color={colors.error.main}
            mt={0.5}
            sx={{ opacity: 0.8, fontSize: 11 }}
          >
            {error}
          </Typography>
        )}
      </Stack>
    );
  },
);

VWField.displayName = "VWField";

// ============================================
// VWSelect - Dropdown matching VerifyWise Select
// ============================================
interface SelectItem {
  _id: string | number;
  name: string;
  email?: string;
  surname?: string;
}

interface VWSelectProps {
  id: string;
  label?: string;
  placeholder?: string;
  value: string | number;
  items: SelectItem[];
  onChange: (event: SelectChangeEvent<string | number>) => void;
  isRequired?: boolean;
  error?: string;
  disabled?: boolean;
  width?: number | string;
  sx?: any;
}

export const VWSelect: React.FC<VWSelectProps> = ({
  id,
  label,
  placeholder,
  value,
  items,
  onChange,
  isRequired,
  error,
  disabled,
  width,
  sx,
}) => {
  const renderValue = (selected: unknown) => {
    const selectedValue = selected as string | number;
    const selectedItem = items.find((item) => item._id === selectedValue);

    return (
      <span
        style={{
          display: "block",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          color: selectedItem ? colors.text.primary : colors.text.tertiary,
        }}
      >
        {selectedItem
          ? `${selectedItem.name}${selectedItem.surname ? " " + selectedItem.surname : ""}`
          : placeholder || "Select..."}
      </span>
    );
  };

  return (
    <Stack gap={1} sx={{ width: width }}>
      {label && (
        <Typography
          component="p"
          color={colors.text.secondary}
          fontWeight={500}
          fontSize="13px"
          sx={{ margin: 0, height: "22px", display: "flex", alignItems: "center" }}
        >
          {label}
          {isRequired && (
            <Typography component="span" ml={0.5} color={colors.error.main}>
              *
            </Typography>
          )}
        </Typography>
      )}
      <MuiSelect
        value={value}
        onChange={onChange}
        displayEmpty
        inputProps={{ id }}
        renderValue={renderValue}
        size="small"
        IconComponent={() => (
          <ChevronDown
            size={16}
            style={{
              position: "absolute",
              right: "12px",
              top: "50%",
              transform: "translateY(-50%)",
              pointerEvents: "none",
              color: colors.text.tertiary,
            }}
          />
        )}
        disabled={disabled}
        MenuProps={{
          disableScrollLock: true,
          PaperProps: {
            sx: {
              "borderRadius": "4px",
              "boxShadow": "0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)",
              "mt": 1,
              "& .MuiMenuItem-root": {
                "fontSize": 13,
                "color": colors.text.primary,
                "transition": "color 0.2s ease, background-color 0.2s ease",
                "&:hover": {
                  backgroundColor: colors.background.accent,
                  color: colors.primary,
                },
                "&.Mui-selected": {
                  "backgroundColor": colors.background.accent,
                  "&:hover": {
                    backgroundColor: colors.background.accent,
                    color: colors.primary,
                  },
                },
              },
            },
          },
        }}
        sx={{
          fontSize: 13,
          minWidth: "125px",
          width: "100%",
          backgroundColor: colors.background.main,
          ...getSelectStyles(!!error),
          ...sx,
        }}
      >
        {items.map((item) => (
          <MenuItem
            value={item._id}
            key={`${id}-${item._id}`}
            sx={{
              fontSize: 13,
              color: colors.text.tertiary,
              borderRadius: "4px",
              margin: "4px 8px",
            }}
          >
            {`${item.name}${item.surname ? " " + item.surname : ""}`}
          </MenuItem>
        ))}
      </MuiSelect>
      {error && (
        <Typography color={colors.error.main} mt={0.5} sx={{ opacity: 0.8, fontSize: 11 }}>
          {error}
        </Typography>
      )}
    </Stack>
  );
};

// ============================================
// VWToggle - Switch matching VerifyWise Toggle
// ============================================
interface VWToggleProps {
  checked: boolean;
  onChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  disabled?: boolean;
  label?: string;
  description?: string;
}

export const VWToggle: React.FC<VWToggleProps> = ({
  checked,
  onChange,
  disabled,
  label,
  description,
}) => {
  const toggleStyles = {
    "width": 36,
    "height": 22,
    "padding": "2px 0",
    "marginRight": 1,
    "display": "flex",
    "alignItems": "center",
    "& .MuiSwitch-switchBase": {
      "padding": "2px",
      "&.Mui-checked": {
        "transform": "translateX(14px)",
        "color": "#fff",
        "& + .MuiSwitch-track": {
          backgroundColor: colors.primary,
          opacity: 1,
          border: 0,
        },
      },
    },
    "& .MuiSwitch-thumb": {
      boxShadow: "0 2px 4px 0 rgb(0 35 11 / 20%)",
      width: 14,
      height: 14,
      borderRadius: "4px !important",
      backgroundColor: "#fff",
      margin: 0,
    },
    "& .MuiSwitch-track": {
      borderRadius: "4px !important",
      backgroundColor: colors.border.light,
      opacity: 1,
      transition: "background-color 200ms",
    },
  };

  if (label || description) {
    return (
      <Stack direction="row" alignItems="flex-start" gap={1.5}>
        <Switch
          checked={checked}
          onChange={onChange}
          disabled={disabled}
          disableRipple
          sx={toggleStyles}
        />
        <Stack>
          {label && (
            <Typography fontSize={13} fontWeight={500} color={colors.text.primary}>
              {label}
            </Typography>
          )}
          {description && (
            <Typography fontSize={12} color={colors.text.tertiary}>
              {description}
            </Typography>
          )}
        </Stack>
      </Stack>
    );
  }

  return (
    <Switch
      checked={checked}
      onChange={onChange}
      disabled={disabled}
      disableRipple
      sx={toggleStyles}
    />
  );
};

// ============================================
// VWButton - Button matching VerifyWise styling
// ============================================
interface VWButtonProps {
  children: React.ReactNode;
  onClick?: () => void;
  variant?: "primary" | "secondary" | "outline";
  disabled?: boolean;
  loading?: boolean;
  startIcon?: React.ReactNode;
  fullWidth?: boolean;
  sx?: any;
}

export const VWButton: React.FC<VWButtonProps> = ({
  children,
  onClick,
  variant = "primary",
  disabled,
  loading,
  startIcon,
  fullWidth,
  sx,
}) => {
  const baseStyles = {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 1,
    padding: "8px 16px",
    borderRadius: "4px",
    fontSize: 13,
    fontWeight: 500,
    cursor: disabled || loading ? "not-allowed" : "pointer",
    transition: "all 150ms ease-in-out",
    border: "none",
    outline: "none",
    width: fullWidth ? "100%" : "auto",
    opacity: disabled || loading ? 0.6 : 1,
  };

  const variantStyles = {
    primary: {
      "backgroundColor": colors.primary,
      "color": "#fff",
      "&:hover:not(:disabled)": {
        backgroundColor: "#0F5C4A",
      },
    },
    secondary: {
      "backgroundColor": colors.background.fill,
      "color": colors.text.primary,
      "border": `1px solid ${colors.border.dark}`,
      "&:hover:not(:disabled)": {
        backgroundColor: colors.background.accent,
      },
    },
    outline: {
      "backgroundColor": "transparent",
      "color": colors.primary,
      "border": `1px solid ${colors.primary}`,
      "&:hover:not(:disabled)": {
        backgroundColor: colors.primaryRing,
      },
    },
  };

  return (
    <Stack
      component="button"
      direction="row"
      onClick={disabled || loading ? undefined : onClick}
      sx={{
        ...baseStyles,
        ...variantStyles[variant],
        ...sx,
      }}
    >
      {startIcon && <span style={{ display: "flex" }}>{startIcon}</span>}
      {loading ? "Loading..." : children}
    </Stack>
  );
};

export default {
  VWField,
  VWSelect,
  VWToggle,
  VWButton,
};
