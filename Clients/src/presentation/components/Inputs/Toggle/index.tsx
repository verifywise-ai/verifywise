import { Switch, SwitchProps, useTheme } from "@mui/material";
import { getToggleStyles } from "./styles";

export interface ToggleProps extends SwitchProps {
  /**
   * Accessible name for the switch. A toggle sitting next to a plain
   * <Typography> caption has no programmatic label, so screen readers announce
   * it as an unnamed checkbox. Set through slotProps.input rather than
   * inputProps, which MUI 7 deprecated and no longer forwards.
   */
  ariaLabel?: string;
}

/**
 * Custom Toggle component styled to match the application's color scheme and Checkbox style.
 * @param {ToggleProps} props - Props for the MUI Switch component, plus ariaLabel.
 */
function Toggle({ ariaLabel, ...props }: ToggleProps) {
  const theme = useTheme();
  return (
    <Switch
      disableRipple
      slotProps={ariaLabel ? { input: { "aria-label": ariaLabel } } : undefined}
      {...props}
      sx={getToggleStyles(theme)}
    />
  );
}

export default Toggle;
