import { Box, Typography, LinearProgress } from "@mui/material";
import { TrendingUp } from "lucide-react";
import { status, text as textColors, background } from "../../themes/palette";
import CustomizableSkeleton from "../Skeletons";
import { EmptyState } from "../EmptyState";
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
  if (score >= 60) return status.info.text;
  if (score >= 40) return status.warning.text;
  return status.error.text;
}

const FIXED_HEIGHT = 340;

export default function ReadinessTrend({ data, isLoading }: ReadinessTrendProps) {
  if (isLoading) {
    return (
      <Box sx={{ height: FIXED_HEIGHT }}>
        <CustomizableSkeleton variant="rounded" width="100%" height={FIXED_HEIGHT - 16} />
      </Box>
    );
  }

  if (!data || data.length === 0) {
    return (
      <Box sx={{ height: FIXED_HEIGHT }}>
        <EmptyState
          icon={TrendingUp}
          message="No readiness history available. Run a calculation to start tracking trends."
          fillContainer
          showBorder={false}
        />
      </Box>
    );
  }

  return (
    <Box sx={{ height: FIXED_HEIGHT, display: "flex", flexDirection: "column" }}>
      {/* Fixed header */}
      <Typography
        sx={{
          fontSize: 16,
          fontWeight: 600,
          color: textColors.primary,
          fontFamily: "'Red Hat Display', 'Geist', sans-serif",
          lineHeight: 1.4,
          mb: "12px",
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
          "pr": "4px",
          "display": "flex",
          "flexDirection": "column",
          "gap": "16px",
          // Subtle scrollbar
          "&::-webkit-scrollbar": { width: 4 },
          "&::-webkit-scrollbar-track": { backgroundColor: "transparent" },
          "&::-webkit-scrollbar-thumb": {
            "backgroundColor": background.hover,
            "borderRadius": "4px",
            "&:hover": { backgroundColor: textColors.muted },
          },
        }}
      >
        {data.map((item, idx) => {
          const score = item.avg_score ?? 0;
          const date = item.calculated_at ? displayFormattedDateTime(item.calculated_at) : "";

          return (
            <Box key={idx}>
              <Box sx={{ display: "flex", justifyContent: "space-between", mb: "4px" }}>
                <Typography sx={{ fontSize: 12, color: textColors.secondary, fontWeight: 500 }}>
                  {formatFrameworkName(item.framework_type)}
                </Typography>
                <Typography sx={{ fontSize: 11, color: textColors.accent }}>{date}</Typography>
              </Box>
              <Box sx={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <LinearProgress
                  variant="determinate"
                  value={score}
                  sx={{
                    "flex": 1,
                    "height": 8,
                    "borderRadius": "4px",
                    "backgroundColor": background.hover,
                    "& .MuiLinearProgress-bar": {
                      borderRadius: "4px",
                      backgroundColor: getScoreColor(score),
                    },
                  }}
                />
                <Typography
                  sx={{
                    fontSize: 13,
                    fontWeight: 500,
                    color: getScoreColor(score),
                    minWidth: 32,
                    textAlign: "right",
                  }}
                >
                  {score}
                </Typography>
              </Box>
              {/* Distribution summary */}
              <Box sx={{ display: "flex", gap: "12px", mt: "4px", flexWrap: "wrap" }}>
                <Typography sx={{ fontSize: 11, color: status.success.text }}>
                  {item.ready_count ?? 0} ready
                </Typography>
                <Typography sx={{ fontSize: 11, color: status.info.text }}>
                  {item.needs_work_count ?? 0} needs work
                </Typography>
                <Typography sx={{ fontSize: 11, color: status.warning.text }}>
                  {item.at_risk_count ?? 0} at risk
                </Typography>
                <Typography sx={{ fontSize: 11, color: status.error.text }}>
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
