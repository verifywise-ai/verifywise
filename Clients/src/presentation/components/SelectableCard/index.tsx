import React from "react";
import { Box, Typography } from "@mui/material";
import { Check } from "lucide-react";
import { brand, text, background, status } from "../../themes/palette";

export interface SelectableCardProps {
  /** Whether this card is currently selected */
  isSelected: boolean;
  /** Click handler */
  onClick: () => void;
  /** Icon element to display on the left */
  icon: React.ReactNode;
  /** Card title */
  title: string;
  /** Card description */
  description: string;
  /** Optional chip/badge to display */
  chip?: React.ReactNode;
  /** Accent color for selection state (default: `${brand.primary}`) */
  accentColor?: string;
  /** Whether the card is disabled */
  disabled?: boolean;
}

/**
 * A reusable selectable card component for option selection UIs.
 * Shows a checkmark when selected and highlights with the accent color.
 *
 * @example
 * <SelectableCard
 *   isSelected={selectedOption === "option1"}
 *   onClick={() => setSelectedOption("option1")}
 *   icon={<Database size={14} color={selectedOption === "option1" ? `${brand.primary}` : `${text.disabled}`} />}
 *   title="Option 1"
 *   description="Description for option 1"
 * />
 */
const SelectableCard = ({
  isSelected,
  onClick,
  icon,
  title,
  description,
  chip,
  accentColor = `${brand.primary}`,
  disabled = false,
}: SelectableCardProps) => (
  <Box
    onClick={disabled ? undefined : onClick}
    sx={{
      p: "8px",
      border: "1px solid",
      borderColor: disabled ? `${status.default.border}` : isSelected ? accentColor : `${status.default.border}`,
      borderRadius: "4px",
      cursor: disabled ? "not-allowed" : "pointer",
      backgroundColor: disabled ? `${background.accent}` : isSelected ? (accentColor === "#6366F1" ? "#EEF2FF" : "#F0FDF4") : `${background.main}`,
      opacity: disabled ? 0.6 : 1,
      display: "flex",
      alignItems: "center",
      gap: "8px",
      transition: "all 0.15s ease",
      "&:hover": disabled ? {} : {
        borderColor: accentColor,
        backgroundColor: isSelected ? (accentColor === "#6366F1" ? "#EEF2FF" : "#F0FDF4") : `${background.accent}`,
      },
    }}
  >
    {icon}
    <Box sx={{ flex: 1 }}>
      <Typography sx={{ fontSize: "13px", fontWeight: 500, color: disabled ? `${text.disabled}` : "#374151" }}>{title}</Typography>
      <Typography sx={{ fontSize: "11px", color: disabled ? "#D1D5DB" : `${text.disabled}` }}>{description}</Typography>
    </Box>
    {chip}
    {isSelected && !disabled && <Check size={14} color={accentColor} />}
  </Box>
);

export default SelectableCard;
