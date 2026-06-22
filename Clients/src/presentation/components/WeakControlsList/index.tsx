import { Box, Typography, Stack, LinearProgress } from "@mui/material";
import Chip from "../Chip";
import { AlertTriangle, ArrowDown, CheckCircle2, Lightbulb } from "lucide-react";
import {
  status,
  accent,
  text as textColors,
  border as borderPalette,
  background,
} from "../../themes/palette";

interface WeakControl {
  control_id: number;
  framework_type: string;
  overall_score: number;
  readiness_level: string;
  priority?: string;
  recommendations?: string[];
}

interface WeakControlsListProps {
  controls: WeakControl[];
  isLoading?: boolean;
  maxItems?: number;
}

function getPriorityConfig(score: number) {
  if (score < 30) return { label: "Critical", colors: status.error, Icon: AlertTriangle };
  if (score < 60) return { label: "High", colors: status.warning, Icon: ArrowDown };
  return { label: "Medium", colors: accent.primary, Icon: CheckCircle2 };
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

export default function WeakControlsList({
  controls,
  isLoading,
  maxItems = 10,
}: WeakControlsListProps) {
  if (isLoading) {
    return (
      <Box
        sx={{
          height: FIXED_HEIGHT,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Typography sx={{ fontSize: 13, color: textColors.muted }}>Loading...</Typography>
      </Box>
    );
  }

  if (!controls || controls.length === 0) {
    return (
      <Box
        sx={{
          height: FIXED_HEIGHT,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          p: 3,
          textAlign: "center",
          backgroundColor: background.accent,
          borderRadius: 2,
        }}
      >
        <CheckCircle2
          size={28}
          strokeWidth={1.5}
          style={{ color: status.success.text, marginBottom: 8 }}
        />
        <Typography sx={{ fontSize: 13, color: textColors.tertiary }}>
          No weak controls found. Your compliance posture looks strong!
        </Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ height: FIXED_HEIGHT, display: "flex", flexDirection: "column" }}>
      {/* Header */}
      <Typography
        sx={{
          fontSize: 15,
          fontWeight: 600,
          color: textColors.primary,
          fontFamily: "'Red Hat Display', 'Geist', sans-serif",
          mb: 1,
          flexShrink: 0,
        }}
      >
        Weakest controls
      </Typography>

      {/* Scrollable list */}
      <Box
        sx={{
          "flex": 1,
          "overflowY": "auto",
          "overflowX": "hidden",
          "pr": 0.5,
          "&::-webkit-scrollbar": { width: 4 },
          "&::-webkit-scrollbar-track": { backgroundColor: "transparent" },
          "&::-webkit-scrollbar-thumb": {
            "backgroundColor": background.hover,
            "borderRadius": 2,
            "&:hover": { backgroundColor: textColors.muted },
          },
        }}
      >
        <Stack spacing={1.5}>
          {controls.slice(0, maxItems).map((ctrl, i) => {
            const priority = getPriorityConfig(ctrl.overall_score);

            const recs: string[] = ctrl.recommendations
              ? typeof ctrl.recommendations === "string"
                ? JSON.parse(ctrl.recommendations as unknown as string)
                : ctrl.recommendations
              : [];

            return (
              <Box
                key={`${ctrl.control_id}-${i}`}
                sx={{
                  "p": 2,
                  "borderRadius": "8px",
                  "border": `1px solid ${borderPalette.light}`,
                  "backgroundColor": background.main,
                  "transition": "all 0.2s ease",
                  "&:hover": {
                    borderColor: priority.colors.border,
                    backgroundColor: priority.colors.bg,
                  },
                }}
              >
                {/* Top row: control info + score */}
                <Stack
                  direction="row"
                  justifyContent="space-between"
                  alignItems="center"
                  sx={{ mb: 1 }}
                >
                  <Stack direction="row" alignItems="center" spacing={1.5}>
                    {/* Priority icon */}
                    <Box
                      sx={{
                        width: 28,
                        height: 28,
                        borderRadius: "6px",
                        backgroundColor: priority.colors.bg,
                        border: `1px solid ${priority.colors.border}`,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        flexShrink: 0,
                      }}
                    >
                      <priority.Icon size={14} style={{ color: priority.colors.text }} />
                    </Box>
                    <Box>
                      <Typography
                        sx={{
                          fontSize: 13,
                          fontWeight: 600,
                          color: textColors.primary,
                          lineHeight: 1.2,
                        }}
                      >
                        Control #{ctrl.control_id}
                      </Typography>
                      <Typography sx={{ fontSize: 11, color: textColors.muted }}>
                        {formatFrameworkName(ctrl.framework_type)}
                      </Typography>
                    </Box>
                  </Stack>

                  <Stack direction="row" alignItems="center" spacing={1.25}>
                    <Chip
                      label={priority.label}
                      size="small"
                      backgroundColor={priority.colors.bg}
                      textColor={priority.colors.text}
                      uppercase={false}
                    />
                    <Typography
                      sx={{
                        fontSize: 18,
                        fontWeight: 700,
                        color: getScoreColor(ctrl.overall_score),
                      }}
                    >
                      {ctrl.overall_score}
                    </Typography>
                  </Stack>
                </Stack>

                {/* Score bar */}
                <LinearProgress
                  variant="determinate"
                  value={ctrl.overall_score}
                  sx={{
                    "height": 4,
                    "borderRadius": 2,
                    "mb": recs.length > 0 ? 1.25 : 0,
                    "backgroundColor": background.hover,
                    "& .MuiLinearProgress-bar": {
                      borderRadius: 2,
                      backgroundColor: getScoreColor(ctrl.overall_score),
                    },
                  }}
                />

                {/* Recommendations */}
                {recs.length > 0 && (
                  <Stack spacing={0.5}>
                    {recs.slice(0, 3).map((rec, j) => (
                      <Stack key={j} direction="row" alignItems="flex-start" spacing={1}>
                        <Lightbulb
                          size={12}
                          style={{
                            color: accent.amber.text,
                            marginTop: 2,
                            flexShrink: 0,
                          }}
                        />
                        <Typography
                          sx={{
                            fontSize: 11,
                            color: textColors.secondary,
                            lineHeight: 1.5,
                          }}
                        >
                          {rec}
                        </Typography>
                      </Stack>
                    ))}
                  </Stack>
                )}
              </Box>
            );
          })}
        </Stack>
      </Box>
    </Box>
  );
}
