import React from "react";
import { IconButton, Tooltip } from "@mui/material";
import { Share2 } from "lucide-react";
import { brand, background, border as borderPalette, status } from "../../themes/palette";

/**
 * Props for the ShareButton component
 */
export interface ShareButtonProps {
  /** Callback when the button is clicked */
  onClick: (event: React.MouseEvent<HTMLButtonElement>) => void;
  /** Whether the button is disabled */
  disabled?: boolean;
  /** Size of the button */
  size?: "small" | "medium" | "large";
  /** Tooltip text */
  tooltip?: string;
}

/**
 * ShareButton component - Trigger button for the ShareViewDropdown
 * Displays a share icon button with consistent styling
 */
const ShareButton: React.FC<ShareButtonProps> = ({
  onClick,
  disabled = false,
  size = "medium",
  tooltip = "Share view",
}) => {
  const iconSize = size === "small" ? 14 : size === "large" ? 20 : 16;

  const button = (
    <IconButton
      onClick={onClick}
      disabled={disabled}
      size={size}
      aria-label={tooltip}
      sx={{
        "color": `${brand.primary}`,
        "backgroundColor": "transparent",
        "border": `1px solid ${borderPalette.dark}`,
        "borderRadius": "4px",
        "padding": size === "small" ? "6px" : size === "large" ? "10px" : "6px",
        "width": size === "small" ? "32px" : size === "large" ? "44px" : "34px",
        "height": size === "small" ? "32px" : size === "large" ? "44px" : "34px",
        "&:hover": {
          backgroundColor: "rgba(19, 113, 91, 0.08)",
          borderColor: `${brand.primary}`,
        },
        "&:disabled": {
          color: "#d1d5db",
          borderColor: `${status.default.border}`,
          backgroundColor: `${background.accent}`,
        },
        "transition": "all 0.2s ease",
      }}
    >
      <Share2 size={iconSize} strokeWidth={1.5} />
    </IconButton>
  );

  // Tooltip copies its text onto its child as aria-label, which is not a valid
  // attribute on a generic <span> — and the button underneath was left with no
  // accessible name at all. The wrapper only exists so the tooltip still fires
  // for a disabled button, which cannot receive events itself, so it is used
  // only in that case. The button's own aria-label survives either way:
  // Tooltip spreads the child's props last.
  return (
    <Tooltip title={tooltip} arrow>
      {disabled ? <span>{button}</span> : button}
    </Tooltip>
  );
};

export default ShareButton;
