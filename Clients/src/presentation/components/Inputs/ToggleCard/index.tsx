import React from "react";
import { Box, Stack, FormControlLabel, useTheme } from "@mui/material";
import Toggle from "../Toggle";
import {
  CardActive,
  CardDisabled,
  getFormControlLabelStyles,
} from "../../../pages/AITrustCenter/Overview/styles";

interface ToggleCardProps {
  label: string;
  checked: boolean;
  onToggle: (event: React.ChangeEvent<HTMLInputElement>, checked: boolean) => void;
  children: React.ReactNode;
  disabled?: boolean;
}

function ToggleCard({ label, checked, onToggle, children, disabled }: ToggleCardProps) {
  const theme = useTheme();
  const formControlLabelStyles = getFormControlLabelStyles(theme);
  const CardComponent = checked ? CardActive : CardDisabled;

  return (
    <Stack minWidth={280} maxWidth="100%" flex={1} sx={{ overflow: "hidden" }}>
      <Box display="flex" alignItems="center" mb={1}>
        <FormControlLabel
          control={<Toggle checked={checked} onChange={onToggle} disabled={disabled} />}
          label={label}
          sx={formControlLabelStyles}
        />
      </Box>
      <CardComponent>{children}</CardComponent>
    </Stack>
  );
}

export default ToggleCard;
