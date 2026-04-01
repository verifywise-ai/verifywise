import React from "react";
import {
  FormControl,
  InputLabel,
  Select as MuiSelect,
  MenuItem,
} from "@mui/material";
import { SelectProps } from "../../../types/widget.types";

const Select: React.FC<SelectProps> = ({
  id,
  label,
  placeholder,
  value,
  items,
  onChange,
  sx = {},
  disabled = false,
  error,
  isRequired = false,
  isHidden = false,
}) => {
  if (isHidden) return null;

  return (
    <FormControl
      size="small"
      sx={{ minWidth: 140, ...sx }}
      error={!!error}
      required={isRequired}
    >
      <InputLabel id={`${id}-label`}>
        {label}
        {isRequired && " *"}
      </InputLabel>
      <MuiSelect
        labelId={`${id}-label`}
        id={id}
        value={value}
        label={label}
        onChange={onChange}
        disabled={disabled}
        displayEmpty={!!placeholder}
      >
        {placeholder && (
          <MenuItem value="" disabled>
            {placeholder}
          </MenuItem>
        )}
        {items.map((item) => (
          <MenuItem key={item._id} value={item._id}>
            {item.name}
          </MenuItem>
        ))}
      </MuiSelect>
      {error && (
        <div
          style={{ color: "status.error.text", fontSize: "0.75rem", marginTop: "4px" }}
        >
          {error}
        </div>
      )}
    </FormControl>
  );
};

export default Select;
