/**
 * Checkbox component using Material-UI's Checkbox and FormControlLabel.
 *
 * @component
 * @param {string} id - The unique identifier for the checkbox input.
 * @param {string} [label] - The label displayed next to the checkbox (optional for table usage).
 * @param {"small" | "medium" | "large"} [size="medium"] - The size of the checkbox.
 * @param {boolean} isChecked - The checked state of the checkbox.
 * @param {string} value - The value of the checkbox input.
 * @param {function} onChange - The function to call when the checkbox state changes.
 * @param {function} [onClick] - Optional onClick handler (for tables to prevent row click).
 * @param {boolean} [isDisabled] - Whether the checkbox is disabled.
 *
 * @returns {JSX.Element} The rendered Checkbox component.
 */

import { FormControlLabel, Checkbox as MuiCheckbox, useTheme } from "@mui/material";
import "./index.css";

import { CheckboxProps } from "../../../types/widget.types";

// Soft unchecked square icon with thin border
function SoftSquare({ size = 24 }: { size?: number }) {
  const theme = useTheme();
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect
        x="3.5"
        y="3.5"
        width="17"
        height="17"
        rx="2"
        stroke={theme.palette.text.accent}
        strokeWidth="1"
        fill="none"
      />
    </svg>
  );
}

// Custom filled checkbox icon matching Lucide's Square dimensions
function FilledCheckSquare({ size = 24 }: { size?: number }) {
  const theme = useTheme();
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect x="3" y="3" width="18" height="18" rx="2" fill={theme.palette.primary.main} />
      <path
        d="M9 12l2 2 4-4"
        stroke="white"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function Checkbox({
  id,
  label,
  size = "medium",
  isChecked,
  value,
  onChange,
  onClick,
  isDisabled,
  sx: customSx,
}: CheckboxProps) {
  const sizes: { [key in "small" | "medium" | "large"]: string } = {
    small: "20px",
    medium: "24px",
    large: "28px",
  };
  const theme = useTheme();

  const checkboxElement = (
    <MuiCheckbox
      disableRipple
      checked={isChecked}
      checkedIcon={<FilledCheckSquare size={16} />}
      icon={<SoftSquare size={16} />}
      value={value}
      onChange={onChange}
      onClick={onClick}
      disabled={isDisabled}
      inputProps={{
        "aria-label": label || "controlled checkbox",
        id: id,
      }}
      sx={{
        borderRadius: theme.shape.borderRadius,
        "&:hover": { backgroundColor: "transparent" },
        "& svg": { width: sizes[size], height: sizes[size] },
        "& .MuiTouchRipple-root": {
          display: "none",
        },
        ...customSx,
      }}
      size={size}
    />
  );

  // If no label, return just the checkbox (for table usage)
  if (!label) {
    return checkboxElement;
  }

  // Otherwise, wrap with FormControlLabel
  return (
    <FormControlLabel
      className="checkbox-wrapper"
      control={checkboxElement}
      label={label}
      disabled={isDisabled}
      sx={{
        borderRadius: theme.shape.borderRadius,
        p: theme.spacing(2.5),
        m: theme.spacing(-2.5),
        "& .MuiButtonBase-root": {
          width: theme.spacing(10),
          p: 0,
          mr: theme.spacing(3),
        },
        "&:hover": {
          backgroundColor: "transparent",
        },
        "& span.MuiTypography-root": {
          fontSize: 13,
          color: theme.palette.text.tertiary,
        },
        "& .MuiFormControlLabel-root:hover": {
          backgroundColor: "transparent",
        },
      }}
    />
  );
}

export default Checkbox;
