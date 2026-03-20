import { Box, Stack, Typography, Divider } from "@mui/material";
import { DASHBOARD_COLORS, TEXT_STYLES } from "../../styles/colors";
import type { IPortfolioSummary } from "../../../domain/interfaces/i.quantitativeRisk";

const C = DASHBOARD_COLORS;

function formatCurrency(value: number): string {
  if (value >= 1_000_000) {
    return `$${(value / 1_000_000).toFixed(1)}M`;
  }
  if (value >= 1_000) {
    return `$${(value / 1_000).toFixed(0)}K`;
  }
  return `$${value.toFixed(0)}`;
}

interface MetricRowProps {
  label: string;
  value: string;
  color?: string;
}

function MetricRow({ label, value, color }: MetricRowProps) {
  return (
    <Stack direction="row" justifyContent="space-between" alignItems="center">
      <Typography sx={{ fontSize: 13, color: C.textSecondary }}>{label}</Typography>
      <Typography sx={{ fontSize: 14, fontWeight: 600, color: color || C.textPrimary }}>
        {value}
      </Typography>
    </Stack>
  );
}

interface PortfolioExposureCardProps {
  portfolio: IPortfolioSummary;
}

export function PortfolioExposureCard({ portfolio }: PortfolioExposureCardProps) {
  const reductionPct =
    portfolio.total_ale > 0
      ? ((portfolio.risk_reduction / portfolio.total_ale) * 100).toFixed(0)
      : "0";

  return (
    <Stack gap="12px">
      {/* Main ALE figure */}
      <Box sx={{ textAlign: "center", py: 1 }}>
        <Typography sx={{ fontSize: 11, color: C.textSecondary, mb: 0.5 }}>
          Total AI portfolio exposure
        </Typography>
        <Typography sx={{ fontSize: 28, fontWeight: 700, color: C.critical }}>
          {formatCurrency(portfolio.total_ale)}
        </Typography>
      </Box>

      <Divider />

      {/* Breakdown */}
      <Stack gap="8px">
        <MetricRow
          label="Residual exposure"
          value={formatCurrency(portfolio.total_residual_ale)}
          color={C.medium}
        />
        <MetricRow
          label="Risk reduction"
          value={`${formatCurrency(portfolio.risk_reduction)} (${reductionPct}%)`}
          color={C.completed}
        />
        <MetricRow
          label="Mitigation cost"
          value={formatCurrency(portfolio.total_mitigation_cost)}
        />
        <MetricRow
          label="Overall ROI"
          value={
            portfolio.overall_roi != null
              ? `${portfolio.overall_roi.toFixed(0)}%`
              : "N/A"
          }
          color={
            portfolio.overall_roi != null && portfolio.overall_roi > 0
              ? C.completed
              : C.textSecondary
          }
        />
      </Stack>

      <Divider />

      {/* Risk count */}
      <Stack direction="row" justifyContent="center" alignItems="center" gap={1}>
        <Typography sx={TEXT_STYLES.legendItem}>
          Based on {portfolio.risk_count} quantified risk{portfolio.risk_count !== 1 ? "s" : ""}
        </Typography>
      </Stack>
    </Stack>
  );
}
