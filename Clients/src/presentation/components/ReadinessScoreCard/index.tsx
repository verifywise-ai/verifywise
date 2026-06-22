import { Box, Typography, LinearProgress, Stack, Tooltip } from "@mui/material";
import { status, accent, text as textColors, border, background } from "../../themes/palette";
import type { ReadinessLevel } from "../../../domain/interfaces/i.readiness";

interface ReadinessScoreCardProps {
  frameworkType: string;
  overallScore: number | null;
  readinessLevel?: ReadinessLevel;
  totalControls?: number | null;
  readyCount?: number | null;
  needsWorkCount?: number | null;
  atRiskCount?: number | null;
  notStartedCount?: number | null;
  breakdown?: {
    evidence_quality: number;
    evidence_count: number;
    evidence_recency: number;
    task_completion: number;
    risk_mitigation: number;
  } | null;
  isLoading?: boolean;
}

function getLevelColor(level: ReadinessLevel | undefined) {
  switch (level) {
    case "ready":
      return status.success;
    case "needs_work":
      return accent.primary;
    case "at_risk":
      return status.warning;
    case "not_started":
      return status.error;
    default:
      return { bg: background.hover, text: textColors.tertiary, border: border.light };
  }
}

function getLevelLabel(level: ReadinessLevel | undefined) {
  switch (level) {
    case "ready":
      return "Ready";
    case "needs_work":
      return "Needs Work";
    case "at_risk":
      return "At Risk";
    case "not_started":
      return "Not Started";
    default:
      return "Unknown";
  }
}

function classifyScore(score: number): ReadinessLevel {
  if (score >= 80) return "ready";
  if (score >= 60) return "needs_work";
  if (score >= 30) return "at_risk";
  return "not_started";
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

const dimensionLabels: Record<string, string> = {
  evidence_quality: "Evidence Quality",
  evidence_count: "Evidence Count",
  evidence_recency: "Evidence Recency",
  task_completion: "Task Completion",
  risk_mitigation: "Risk Mitigation",
};

const dimensionWeights: Record<string, number> = {
  evidence_quality: 30,
  evidence_count: 20,
  evidence_recency: 15,
  task_completion: 20,
  risk_mitigation: 15,
};

export default function ReadinessScoreCard({
  frameworkType,
  overallScore,
  readinessLevel,
  totalControls,
  readyCount,
  needsWorkCount,
  atRiskCount,
  notStartedCount,
  breakdown,
  isLoading,
}: ReadinessScoreCardProps) {
  if (isLoading) {
    return (
      <Box sx={{ p: 2 }}>
        <LinearProgress />
      </Box>
    );
  }

  const score = overallScore ?? 0;
  const level = readinessLevel ?? classifyScore(score);
  const colors = getLevelColor(level);
  const label = getLevelLabel(level);

  return (
    <Box
      sx={{
        p: 2.5,
        borderRadius: 2,
        border: `1px solid ${border.light}`,
        backgroundColor: background.main,
      }}
    >
      {/* Header */}
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 2 }}>
        <Typography sx={{ fontSize: 15, fontWeight: 600, color: textColors.primary }}>
          {formatFrameworkName(frameworkType)}
        </Typography>
        <Tooltip title={`Readiness: ${label} (${score}/100)`} arrow>
          <Box
            sx={{
              display: "inline-flex",
              alignItems: "center",
              gap: 0.5,
              backgroundColor: colors.bg,
              color: colors.text,
              border: `1px solid ${colors.border}`,
              borderRadius: "6px",
              padding: "4px 10px",
              cursor: "default",
            }}
          >
            <Typography sx={{ fontSize: 16, fontWeight: 700, lineHeight: 1.2 }}>{score}</Typography>
            <Typography
              sx={{ fontSize: 11, fontWeight: 500, lineHeight: 1.2, textTransform: "uppercase" }}
            >
              {label}
            </Typography>
          </Box>
        </Tooltip>
      </Box>

      {/* Overall progress bar */}
      <LinearProgress
        variant="determinate"
        value={score}
        sx={{
          "height": 8,
          "borderRadius": 4,
          "mb": 2,
          "backgroundColor": background.hover,
          "& .MuiLinearProgress-bar": {
            borderRadius: 4,
            backgroundColor: colors.text,
          },
        }}
      />

      {/* Control counts */}
      {totalControls !== undefined && totalControls !== null && totalControls > 0 && (
        <Box sx={{ display: "flex", gap: 1, mb: 2, flexWrap: "wrap" }}>
          {[
            { label: "Ready", count: readyCount, color: status.success },
            { label: "Needs Work", count: needsWorkCount, color: accent.primary },
            { label: "At Risk", count: atRiskCount, color: status.warning },
            { label: "Not Started", count: notStartedCount, color: status.error },
          ].map((item) => (
            <Box
              key={item.label}
              sx={{
                display: "flex",
                alignItems: "center",
                gap: 0.5,
                backgroundColor: item.color.bg,
                borderRadius: "4px",
                padding: "2px 8px",
              }}
            >
              <Typography sx={{ fontSize: 11, fontWeight: 600, color: item.color.text }}>
                {item.count ?? 0}
              </Typography>
              <Typography sx={{ fontSize: 10, color: item.color.text }}>{item.label}</Typography>
            </Box>
          ))}
        </Box>
      )}

      {/* Dimension breakdown */}
      {breakdown && (
        <Stack spacing={1}>
          {Object.entries(breakdown).map(([key, value]) => (
            <Box key={key}>
              <Box sx={{ display: "flex", justifyContent: "space-between", mb: 0.3 }}>
                <Typography sx={{ fontSize: 11, color: textColors.secondary }}>
                  {dimensionLabels[key] || key} ({dimensionWeights[key]}%)
                </Typography>
                <Typography sx={{ fontSize: 11, fontWeight: 600, color: textColors.primary }}>
                  {value}
                </Typography>
              </Box>
              <LinearProgress
                variant="determinate"
                value={value}
                sx={{
                  "height": 4,
                  "borderRadius": 2,
                  "backgroundColor": background.hover,
                  "& .MuiLinearProgress-bar": {
                    borderRadius: 2,
                    backgroundColor:
                      value >= 80
                        ? status.success.text
                        : value >= 60
                          ? accent.primary.text
                          : value >= 40
                            ? status.warning.text
                            : status.error.text,
                  },
                }}
              />
            </Box>
          ))}
        </Stack>
      )}
    </Box>
  );
}
