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
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      style={{ width: size, height: size, display: "block", flexShrink: 0 }}
    >
      <rect
        x="3"
        y="3"
        width="18"
        height="18"
        rx="4"
        stroke="#D0D5DD"
        strokeWidth="1.5"
        fill="white"
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
      style={{ width: size, height: size, display: "block", flexShrink: 0 }}
    >
      <rect x="3" y="3" width="18" height="18" rx="4" fill={theme.palette.primary.main} />
      <path
        d="M8 12.5L10.5 15L16 9"
        stroke="white"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IndeterminateSquare({ size = 24 }: { size?: number }) {
  const theme = useTheme();
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      style={{ width: size, height: size, display: "block", flexShrink: 0 }}
    >
      <rect x="3" y="3" width="18" height="18" rx="4" fill={theme.palette.primary.main} />
      <path d="M8 12h8" stroke="white" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function Checkbox({
  id,
  label,
  ariaLabel,
  size = "medium",
  isChecked,
  isIndeterminate,
  value,
  onChange,
  onClick,
  isDisabled,
  sx: customSx,
}: CheckboxProps) {
  const sizes: Record<"small" | "medium" | "large", number> = {
    small: 16,
    medium: 20,
    large: 24,
  };
  const theme = useTheme();
  const iconSize = sizes[size];

  const checkboxElement = (
    <MuiCheckbox
      disableRipple
      checked={isChecked}
      indeterminate={isIndeterminate}
      checkedIcon={<FilledCheckSquare size={iconSize} />}
      indeterminateIcon={<IndeterminateSquare size={iconSize} />}
      icon={<SoftSquare size={iconSize} />}
      value={value}
      onChange={onChange}
      onClick={onClick}
      disabled={isDisabled}
      inputProps={{
        "aria-label": ariaLabel || label || "controlled checkbox",
        "id": id,
      }}
      sx={{
        "borderRadius": theme.shape.borderRadius,
        "&:hover": { backgroundColor: "transparent" },
        "& .MuiTouchRipple-root": { display: "none" },
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
        "borderRadius": theme.shape.borderRadius,
        "p": theme.spacing(2.5),
        "m": theme.spacing(-2.5),
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
