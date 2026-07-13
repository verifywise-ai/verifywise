import { Box, Typography, LinearProgress } from "@mui/material";
import { status, accent, text as textColors, background } from "../../themes/palette";
import type { FrameworkReadinessScore } from "../../../domain/interfaces/i.readiness";
import { displayFormattedDateTime } from "../../tools/isoDateToString";

interface ReadinessTrendProps {
  data: FrameworkReadinessScore[];
  isLoading?: boolean;
}

function formatFrameworkName(type: string): string {
  const names: Record<string, string> = {
    eu_ai_act: "EU AI Act",
    iso_42001: "ISO 42001",
    iso_27001: "ISO 27001",
    nist_ai_rmf: "NIST AI RMF",
  };
  return names[type] || type.replace(/_/g, " ").toUpperCase();
}

function getScoreColor(score: number) {
  if (score >= 80) return status.success.text;
  if (score >= 60) return accent.primary.text;
  if (score >= 40) return status.warning.text;
  return status.error.text;
}

const FIXED_HEIGHT = 340;

export default function ReadinessTrend({ data, isLoading }: ReadinessTrendProps) {
  if (isLoading) {
    return (
      <Box sx={{ p: 2, height: FIXED_HEIGHT, display: "flex", alignItems: "center" }}>
        <LinearProgress sx={{ width: "100%" }} />
      </Box>
    );
  }

  if (!data || data.length === 0) {
    return (
      <Box
        sx={{
          height: FIXED_HEIGHT,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          p: 3,
          textAlign: "center",
          backgroundColor: background.accent,
          borderRadius: 2,
        }}
      >
        <Typography sx={{ fontSize: 13, color: textColors.tertiary }}>
          No readiness history available. Run a calculation to start tracking trends.
        </Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ height: FIXED_HEIGHT, display: "flex", flexDirection: "column" }}>
      {/* Fixed header */}
      <Typography
        sx={{
          fontSize: 15,
          fontWeight: 600,
          color: textColors.primary,
          mb: 1,
          px: 0.5,
          flexShrink: 0,
        }}
      >
        Readiness trend
      </Typography>

      {/* Scrollable list */}
      <Box
        sx={{
          "flex": 1,
          "overflowY": "auto",
          "overflowX": "hidden",
          "pr": 0.5,
          // Subtle scrollbar
          "&::-webkit-scrollbar": { width: 4 },
          "&::-webkit-scrollbar-track": { backgroundColor: "transparent" },
          "&::-webkit-scrollbar-thumb": {
            "backgroundColor": background.hover,
            "borderRadius": 2,
            "&:hover": { backgroundColor: textColors.muted },
          },
        }}
      >
        {data.map((item, idx) => {
          const score = item.avg_score ?? 0;
          const date = item.calculated_at ? displayFormattedDateTime(item.calculated_at) : "";

          return (
            <Box key={idx} sx={{ mb: 2, px: 0.5 }}>
              <Box sx={{ display: "flex", justifyContent: "space-between", mb: 0.5 }}>
                <Typography sx={{ fontSize: 12, color: textColors.secondary, fontWeight: 500 }}>
                  {formatFrameworkName(item.framework_type)}
                </Typography>
                <Typography sx={{ fontSize: 11, color: textColors.muted }}>{date}</Typography>
              </Box>
              <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                <LinearProgress
                  variant="determinate"
                  value={score}
                  sx={{
                    "flex": 1,
                    "height": 8,
                    "borderRadius": 4,
                    "backgroundColor": background.hover,
                    "& .MuiLinearProgress-bar": {
                      borderRadius: 4,
                      backgroundColor: getScoreColor(score),
                    },
                  }}
                />
                <Typography
                  sx={{
                    fontSize: 13,
                    fontWeight: 700,
                    color: getScoreColor(score),
                    minWidth: 32,
                    textAlign: "right",
                  }}
                >
                  {score}
                </Typography>
              </Box>
              {/* Distribution summary */}
              <Box sx={{ display: "flex", gap: 1.5, mt: 0.5 }}>
                <Typography sx={{ fontSize: 10, color: status.success.text }}>
                  {item.ready_count ?? 0} ready
                </Typography>
                <Typography sx={{ fontSize: 10, color: accent.primary.text }}>
                  {item.needs_work_count ?? 0} needs work
                </Typography>
                <Typography sx={{ fontSize: 10, color: status.warning.text }}>
                  {item.at_risk_count ?? 0} at risk
                </Typography>
                <Typography sx={{ fontSize: 10, color: status.error.text }}>
                  {item.not_started_count ?? 0} not started
                </Typography>
              </Box>
            </Box>
          );
        })}
      </Box>
    </Box>
  );
}
