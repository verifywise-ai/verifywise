import { FC, useCallback } from "react";
import { Stack, Slider, Typography, useTheme } from "@mui/material";
import Field from "../Inputs/Field";

interface MitigationROIProps {
  controlEffectiveness: number | null | undefined;
  mitigationCostAnnual: number | null | undefined;
  onControlEffectivenessChange: (value: number | null) => void;
  onMitigationCostChange: (value: number | null) => void;
  disabled?: boolean;
}

/**
 * Control effectiveness slider + mitigation cost input for ROI calculation.
 */
const MitigationROI: FC<MitigationROIProps> = ({
  controlEffectiveness,
  mitigationCostAnnual,
  onControlEffectivenessChange,
  onMitigationCostChange,
  disabled = false,
}) => {
  const theme = useTheme();

  const handleSliderChange = useCallback(
    (_: Event, value: number | number[]) => {
      onControlEffectivenessChange(value as number);
    },
    [onControlEffectivenessChange]
  );

  const handleCostChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const val = event.target.value;
      onMitigationCostChange(val === "" ? null : parseFloat(val));
    },
    [onMitigationCostChange]
  );

  return (
    <Stack sx={{ gap: "16px", maxWidth: "985px" }}>
      <Stack sx={{ gap: "4px" }}>
        <Typography
          sx={{
            fontSize: 13,
            fontWeight: 600,
            color: theme.palette.text.primary,
          }}
        >
          Mitigation & ROI
        </Typography>
        <Typography
          sx={{
            fontSize: 13,
            color: theme.palette.text.tertiary,
            lineHeight: 1.5,
          }}
        >
          Estimate how effective your controls are and the annual cost of
          mitigation to calculate return on investment.
        </Typography>
      </Stack>

      {/* Control Effectiveness Slider */}
      <Stack sx={{ gap: 1 }}>
        <Stack
          direction="row"
          sx={{ justifyContent: "space-between", alignItems: "center" }}
        >
          <Typography
            sx={{
              fontSize: 13,
              fontWeight: 500,
              color: theme.palette.text.secondary,
            }}
          >
            Control effectiveness
          </Typography>
          <Typography
            sx={{
              fontSize: 13,
              fontWeight: 600,
              color: theme.palette.primary.main,
            }}
          >
            {controlEffectiveness != null
              ? `${controlEffectiveness}%`
              : "Not set"}
          </Typography>
        </Stack>
        <Slider
          value={controlEffectiveness ?? 0}
          onChange={handleSliderChange}
          min={0}
          max={100}
          step={1}
          disabled={disabled}
          valueLabelDisplay="auto"
          valueLabelFormat={(v) => `${v}%`}
          sx={{
            mx: "8px",
            color: theme.palette.primary.main,
            "& .MuiSlider-thumb": {
              width: 16,
              height: 16,
            },
          }}
        />
        <Stack
          direction="row"
          sx={{ justifyContent: "space-between" }}
        >
          <Typography
            sx={{ fontSize: 11, color: theme.palette.text.tertiary }}
          >
            0% (No control)
          </Typography>
          <Typography
            sx={{ fontSize: 11, color: theme.palette.text.tertiary }}
          >
            100% (Full control)
          </Typography>
        </Stack>
      </Stack>

      {/* Mitigation Cost */}
      <Field
        id="mitigation-cost-input"
        label="Annual mitigation cost ($)"
        placeholder="e.g. 50000"
        type="number"
        value={
          mitigationCostAnnual != null ? String(mitigationCostAnnual) : ""
        }
        onChange={handleCostChange}
        disabled={disabled}
        sx={{ width: "323px" }}
      />
    </Stack>
  );
};

export default MitigationROI;
