import React from "react";
import { ToggleButton, ToggleButtonGroup, useTheme, Stack } from "@mui/material";
import { Globe, Lock, Eye } from "lucide-react";

export type VisibilityValue = "public" | "private";
export type VisibilityFilterValue = "all" | "public" | "private";

interface VisibilityChipsProps {
  value: VisibilityFilterValue;
  onChange: (value: VisibilityFilterValue) => void;
}

const OPTIONS: { value: VisibilityFilterValue; label: string; Icon: typeof Eye }[] = [
  { value: "all", label: "All", Icon: Eye },
  { value: "public", label: "Public", Icon: Globe },
  { value: "private", label: "Private", Icon: Lock },
];

/**
 * Visibility selector using MUI ToggleButtonGroup — matches the app-wide
 * button group pattern (same styling family as ViewToggle).
 */
export function VisibilityChips({ value, onChange }: VisibilityChipsProps) {
  const theme = useTheme();

  const handleChange = (
    _event: React.MouseEvent<HTMLElement>,
    newValue: VisibilityFilterValue | null,
  ) => {
    if (newValue !== null) {
      onChange(newValue);
    }
  };

  return (
    <ToggleButtonGroup
      value={value}
      exclusive
      onChange={handleChange}
      size="small"
      sx={{
        "height": "34px",
        "& .MuiToggleButton-root": {
          "border": `1px solid ${theme.palette.border.dark}`,
          "color": theme.palette.text.tertiary,
          "padding": "6px 12px",
          "height": "34px",
          "textTransform": "none",
          "fontSize": 13,
          "fontWeight": 500,
          "&.Mui-selected": {
            "backgroundColor": "brand.primary",
            "color": theme.palette.background.main,
            "&:hover": {
              backgroundColor: "brand.primary",
            },
          },
          "&:hover": {
            backgroundColor: theme.palette.background.accent,
          },
        },
      }}
    >
      {OPTIONS.map((opt) => (
        <ToggleButton key={opt.value} value={opt.value} disableRipple>
          <Stack direction="row" alignItems="center" spacing={0.75}>
            <opt.Icon size={14} />
            <span>{opt.label}</span>
          </Stack>
        </ToggleButton>
      ))}
    </ToggleButtonGroup>
  );
}

// Keep backward-compatible exports
export { VisibilityChips as VisibilityFilter };
export { VisibilityChips as VisibilityToggle };
export default VisibilityChips;
