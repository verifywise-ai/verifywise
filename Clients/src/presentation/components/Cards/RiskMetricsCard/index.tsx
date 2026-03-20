import { Typography, Box, Grid } from "@mui/material";
import type { GridProps } from "@mui/material";
import { Gauge as SpeedGreenIcon } from "lucide-react";

import { RiskMetrics } from "../../../../domain/interfaces/i.riskSummary";
import { background, status } from "../../../themes/palette";

interface RiskMetricsCardProps {
  metrics: RiskMetrics;
  velocity?: {
    newRisksThisWeek: number;
    resolvedRisksThisWeek: number;
    overdueRisks: number;
  };
}

const metricBoxStyle = {
  p: 2,
  backgroundColor: `${background.main}`,
  border: `1px solid ${status.default.border}`,
  borderRadius: 2,
  textAlign: "center",
  height: "100%",
  minHeight: "140px",
  display: "flex",
  flexDirection: "column",
  justifyContent: "center",
};

const gridItemProps = {
  item: true,
  xs: 3,
  sm: 3,
} as GridProps & { item: boolean; xs: number; sm: number };

export function RiskMetricsCard({ metrics, velocity }: RiskMetricsCardProps) {
  const getVelocityColor = (velocity: number): string => {
    if (velocity > 0) return "#EF4444"; // Red - increasing risks
    if (velocity < 0) return "#10B981"; // Green - decreasing risks
    return `${status.default.text}`; // Gray - stable
  };

  const getVelocityDirection = (velocity: number): string => {
    if (velocity > 0) return "↗";
    if (velocity < 0) return "↘";
    return "→";
  };

  return (
    <Box sx={{ width: "100%", height: "100%", display: "flex", flexDirection: "column" }}>
      <Typography
        variant="h6"
        sx={{
          fontSize: 16,
          fontWeight: 600,
          marginBottom: 2,
          color: "#111827",
          display: "flex",
          alignItems: "center",
          gap: 1,
        }}
      >
        <SpeedGreenIcon size={18} />
        Risk Intelligence
      </Typography>

      <Grid container spacing={2} sx={{ flex: 1, width: "100%", height: "100%" }}>
        {/* Risk Velocity */}
        <Grid {...gridItemProps} sx={{ height: "100%" }}>
          <Box sx={metricBoxStyle}>
            <Typography
              variant="caption"
              sx={{
                color: `${status.default.text}`,
                fontWeight: 500,
                mb: 1,
                fontSize: 11,
                textTransform: "uppercase",
                letterSpacing: "0.5px"
              }}
            >
              Risk Velocity
            </Typography>
            <Typography
              variant="h6"
              sx={{
                fontWeight: 700,
                color: getVelocityColor(metrics.riskVelocity),
                fontSize: 18,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 0.5
              }}
            >
              {getVelocityDirection(metrics.riskVelocity)} {Math.abs(metrics.riskVelocity)}/week
            </Typography>
          </Box>
        </Grid>

        {/* Mitigation Progress */}
        <Grid {...gridItemProps} sx={{ height: "100%" }}>
          <Box sx={metricBoxStyle}>
            <Typography
              variant="caption"
              sx={{
                color: `${status.default.text}`,
                fontWeight: 500,
                mb: 1,
                fontSize: 11,
                textTransform: "uppercase",
                letterSpacing: "0.5px"
              }}
            >
              Mitigation Progress
            </Typography>
            <Typography
              variant="h6"
              sx={{
                fontWeight: 700,
                color: "#111827",
                fontSize: 18
              }}
            >
              {metrics.mitigationProgress}%
            </Typography>
          </Box>
        </Grid>

        {/* New This Week */}
        {velocity && (
          <Grid {...gridItemProps} sx={{ height: "100%" }}>
            <Box sx={metricBoxStyle}>
              <Typography
                variant="caption"
                sx={{
                  color: `${status.default.text}`,
                  fontWeight: 500,
                  mb: 1,
                  fontSize: 11,
                  textTransform: "uppercase",
                  letterSpacing: "0.5px"
                }}
              >
                New This Week
              </Typography>
              <Typography
                variant="h6"
                sx={{
                  fontWeight: 700,
                  color: "#111827",
                  fontSize: 18
                }}
              >
                {velocity.newRisksThisWeek}
              </Typography>
            </Box>
          </Grid>
        )}

        {/* Resolved This Week */}
        {velocity && (
          <Grid {...gridItemProps} sx={{ height: "100%" }}>
            <Box sx={metricBoxStyle}>
              <Typography
                variant="caption"
                sx={{
                  color: `${status.default.text}`,
                  fontWeight: 500,
                  mb: 1,
                  fontSize: 11,
                  textTransform: "uppercase",
                  letterSpacing: "0.5px"
                }}
              >
                Resolved This Week
              </Typography>
              <Typography
                variant="h6"
                sx={{
                  fontWeight: 700,
                  color: "#111827",
                  fontSize: 18
                }}
              >
                {velocity.resolvedRisksThisWeek}
              </Typography>
            </Box>
          </Grid>
        )}
      </Grid>
    </Box>
  );
}
