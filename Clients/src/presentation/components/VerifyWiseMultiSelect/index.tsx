import React, { useState, useRef } from "react";
import {
  Box,
  Typography,
  Menu,
  MenuItem,
  useTheme,
} from "@mui/material";
import { ChevronDown, Eye } from "lucide-react";
import Checkbox from "../Inputs/Checkbox";
import { brand, background, status } from "../../themes/palette";

export interface VerifyWiseMultiSelectOption {
  value: string;
  label: string;
}

export interface VerifyWiseMultiSelectProps {
  options: VerifyWiseMultiSelectOption[];
  selectedValues: string[];
  onChange: (values: string[]) => void;
  placeholder?: string;
  icon?: React.ReactNode;
  minWidth?: number;
  height?: number;
  width?: number;
}

const VerifyWiseMultiSelect: React.FC<VerifyWiseMultiSelectProps> = ({
  options,
  selectedValues,
  onChange,
  placeholder = "Select options",
  icon,
  minWidth = 140,
  height = 28,
  width,
}) => {
  const theme = useTheme();
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const buttonRef = useRef<HTMLDivElement>(null);
  const isOpen = Boolean(anchorEl);

  const handleClick = (event: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget);
  };

  const handleClose = () => {
    setAnchorEl(null);
  };

  const handleOptionToggle = (value: string) => {
    const newSelectedValues = selectedValues.includes(value)
      ? selectedValues.filter((v) => v !== value)
      : [...selectedValues, value];
    onChange(newSelectedValues);
  };

  // Standardized color palette
  const colors = {
    primary: `${brand.primary}`,
    primaryHover: "#0f604d",
    secondary: `${status.default.text}`,
    secondaryHover: "#4B5563",
    background: `${background.surface}`,
  };

  return (
    <Box>
      {/* Trigger Button */}
      <Box
        ref={buttonRef}
        onClick={handleClick}
        sx={{
          minWidth,
          width,
          height: height || 32, // Default to medium size
          minHeight: height || 32,
          backgroundColor: colors.secondary, // Consistent secondary color
          color: `${background.main}`,
          borderRadius: "4px",
          border: "none",
          display: "flex",
          alignItems: "center",
          padding: height === 28 ? "6px 12px" : "8px 16px", // Consistent padding based on size
          cursor: "pointer",
          userSelect: "none",
          transition: "all 0.2s ease",
          fontSize: height === 28 ? "12px" : "13px", // Consistent font size based on size
          fontWeight: 500,
          "&:hover": {
            backgroundColor: colors.secondaryHover,
            boxShadow: "0px 2px 4px rgba(107, 114, 128, 0.2)",
          },
          "&:active": {
            backgroundColor: colors.secondaryHover,
            boxShadow: "none",
          },
          "& .MuiSelect-icon": {
            color: `${background.main}`,
            right: 6,
            top: "50%",
            transform: "translateY(-50%)",
            position: "absolute",
          },
        }}
      >
        <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, flex: 1 }}>
          {icon || <Eye size={14} strokeWidth={1.5} />}
          <Typography
            sx={{
              fontSize: height === 28 ? "12px" : "13px", // Consistent font size based on height
              fontWeight: 500,
              color: `${background.main}`,
            }}
          >
            {placeholder}
          </Typography>
        </Box>
        <ChevronDown
          size={14}
          strokeWidth={1.5}
          style={{ color: `${background.main}`, marginLeft: "auto" }}
        />
      </Box>

      {/* Dropdown Menu */}
      <Menu
        anchorEl={anchorEl}
        open={isOpen}
        onClose={handleClose}
        disableScrollLock={true}
        PaperProps={{
          sx: {
            borderRadius: theme.shape.borderRadius || 4,
            boxShadow: "0px 4px 12px rgba(0, 0, 0, 0.15)",
            mt: 0.5,
            width: buttonRef.current?.offsetWidth || minWidth,
            py: 0.5,
          },
        }}
        MenuListProps={{
          sx: {
            py: 0.5,
          },
        }}
      >
        {options.map((option) => (
          <MenuItem
            key={option.value}
            onClick={() => handleOptionToggle(option.value)}
            sx={{
              py: 1,
              px: 2,
              minHeight: "auto",
              fontSize: "13px",
              transition: "all 0.15s ease",
              "&:hover": {
                backgroundColor: colors.background, // Standardized hover color
              },
              "&:active": {
                backgroundColor: `${status.default.border}`, // Slightly darker on active
              },
            }}
          >
            <Box sx={{ display: "flex", alignItems: "center", gap: 2, width: "100%" }}>
              <Checkbox
                id={`multiselect-${option.value}`}
                isChecked={selectedValues.includes(option.value)}
                value={option.value}
                onChange={() => {}}
                size="small"
                sx={{ padding: 0 }}
              />
              <Typography
                sx={{
                  fontSize: "13px",
                  color: theme.palette.text.primary,
                  flexGrow: 1,
                }}
              >
                {option.label}
              </Typography>
            </Box>
          </MenuItem>
        ))}
      </Menu>
    </Box>
  );
};

export default VerifyWiseMultiSelect;