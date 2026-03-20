import { FC } from "react";
import { Box, Stack, Typography, useTheme } from "@mui/material";
import { IQuantitativeRiskFields } from "../../../domain/interfaces/i.quantitativeRisk";
import {
  computeDerivedFields,
  formatCurrency,
  formatPercentage,
} from "../../tools/fairCalculator";
import { background, border as borderPalette, text } from "../../themes/palette";

interface ALESummaryCardProps {
  fields: Partial<IQuantitativeRiskFields>;
}

/**
 * Live ALE summary card that shows computed FAIR values.
 * Recalculates on every render from the current field values.
 */
const ALESummaryCard: FC<ALESummaryCardProps> = ({ fields }) => {
  const theme = useTheme();
  const derived = computeDerivedFields(fields);
  const currency = fields.currency || "USD";

  const hasData = derived.ale_estimate != null;

  const metrics = [
    {
      label: "Total Loss (PERT)",
      value: formatCurrency(derived.total_loss_likely, currency),
    },
    {
      label: "Annualized Loss (ALE)",
      value: formatCurrency(derived.ale_estimate, currency),
      highlight: true,
    },
    {
      label: "Residual ALE",
      value: formatCurrency(derived.residual_ale, currency),
    },
    {
      label: "ROI",
      value: formatPercentage(derived.roi_percentage),
      color:
        derived.roi_percentage != null && derived.roi_percentage > 0
          ? theme.palette.success.main
          : derived.roi_percentage != null && derived.roi_percentage < 0
          ? theme.palette.error.main
          : undefined,
    },
  ];

  if (!hasData) {
    return (
      <Box
        sx={{
          p: "16px",
          maxWidth: "985px",
          borderRadius: "4px",
          border: `1px dashed ${borderPalette.light}`,
          background: `linear-gradient(135deg, ${background.main} 0%, ${background.gradientStop} 100%)`,
        }}
      >
        <Typography
          sx={{
            fontSize: 13,
            color: text.tertiary,
            textAlign: "center",
          }}
        >
          Enter frequency and loss values to see the ALE calculation
        </Typography>
      </Box>
    );
  }

  return (
    <Box
      sx={{
        p: "16px",
        maxWidth: "985px",
        borderRadius: "4px",
        border: `1px solid ${borderPalette.light}`,
        background: `linear-gradient(135deg, ${background.main} 0%, ${background.gradientStop} 100%)`,
        boxShadow: "0 1px 3px 0 rgba(0, 0, 0, 0.05)",
      }}
    >
      <Typography
        sx={{
          fontSize: 14,
          fontWeight: 600,
          color: text.primary,
          mb: "12px",
        }}
      >
        Risk Exposure Summary
      </Typography>
      <Stack direction="row" sx={{ gap: "24px", flexWrap: "wrap" }}>
        {metrics.map((metric) => (
          <Stack key={metric.label} sx={{ minWidth: 140 }}>
            <Typography
              sx={{
                fontSize: 11,
                color: text.tertiary,
                textTransform: "uppercase",
                letterSpacing: 0.5,
                mb: "4px",
              }}
            >
              {metric.label}
            </Typography>
            <Typography
              sx={{
                fontSize: 18,
                fontWeight: 700,
                color: metric.color || text.primary,
              }}
            >
              {metric.value}
            </Typography>
          </Stack>
        ))}
      </Stack>
    </Box>
  );
};

export default ALESummaryCard;
