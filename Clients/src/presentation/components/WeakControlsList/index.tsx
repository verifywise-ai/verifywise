import { Box, Typography, Stack, LinearProgress } from "@mui/material";
import Chip from "../Chip";
import CustomizableSkeleton from "../Skeletons";
import { EmptyState } from "../EmptyState";
import { AlertTriangle, ArrowDown, CheckCircle, Lightbulb } from "lucide-react";
import {
  status,
  risk,
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

/**
 * Priority colors mirror the risk palette that Chip auto-derives from the same
 * labels, so the badge and its icon always agree.
 */
function getPriorityConfig(score: number) {
  if (score < 30) return { label: "Critical", colors: risk.critical, Icon: AlertTriangle };
  if (score < 60) return { label: "High", colors: risk.high, Icon: ArrowDown };
  return { label: "Medium", colors: risk.medium, Icon: CheckCircle };
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

export default function WeakControlsList({
  controls,
  isLoading,
  maxItems = 10,
}: WeakControlsListProps) {
  if (isLoading) {
    return (
      <Box sx={{ height: FIXED_HEIGHT }}>
        <CustomizableSkeleton variant="rounded" width="100%" height={FIXED_HEIGHT - 16} />
      </Box>
    );
  }

  if (!controls || controls.length === 0) {
    return (
      <Box sx={{ height: FIXED_HEIGHT }}>
        <EmptyState
          icon={CheckCircle}
          message="No weak controls found. Your compliance posture looks strong!"
          fillContainer
          showBorder={false}
        />
      </Box>
    );
  }

  return (
    <Box sx={{ height: FIXED_HEIGHT, display: "flex", flexDirection: "column" }}>
      {/* Header */}
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
        Weakest controls
      </Typography>

      {/* Scrollable list */}
      <Box
        sx={{
          "flex": 1,
          "overflowY": "auto",
          "overflowX": "hidden",
          "pr": "4px",
          "&::-webkit-scrollbar": { width: 4 },
          "&::-webkit-scrollbar-track": { backgroundColor: "transparent" },
          "&::-webkit-scrollbar-thumb": {
            "backgroundColor": background.hover,
            "borderRadius": "4px",
            "&:hover": { backgroundColor: textColors.muted },
          },
        }}
      >
        <Stack sx={{ gap: "8px" }}>
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
                  "padding": "12px 16px",
                  "borderRadius": "4px",
                  "border": `1px solid ${borderPalette.light}`,
                  "backgroundColor": background.main,
                  "transition": "background-color 0.2s ease, border-color 0.2s ease",
                  "&:hover": {
                    borderColor: priority.colors.border,
                    backgroundColor: priority.colors.bg,
                  },
                }}
              >
                {/* Top row: control info + score */}
                <Stack
                  direction="row"
                  sx={{
                    justifyContent: "space-between",
                    alignItems: "center",
                    mb: "8px",
                    gap: "8px",
                  }}
                >
                  <Stack
                    direction="row"
                    sx={{
                      alignItems: "center",
                      gap: "8px",
                    }}
                  >
                    {/* Priority icon */}
                    <Box
                      sx={{
                        width: 28,
                        height: 28,
                        borderRadius: "4px",
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
                          fontWeight: 500,
                          color: textColors.primary,
                          lineHeight: 1.4,
                        }}
                      >
                        Control #{ctrl.control_id}
                      </Typography>
                      <Typography sx={{ fontSize: 11, color: textColors.accent }}>
                        {formatFrameworkName(ctrl.framework_type)}
                      </Typography>
                    </Box>
                  </Stack>

                  <Stack
                    direction="row"
                    sx={{
                      alignItems: "center",
                      gap: "8px",
                    }}
                  >
                    <Chip label={priority.label} size="small" uppercase={false} />
                    <Typography
                      sx={{
                        fontSize: 16,
                        fontWeight: 600,
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
                    "borderRadius": "4px",
                    "mb": recs.length > 0 ? "8px" : 0,
                    "backgroundColor": background.hover,
                    "& .MuiLinearProgress-bar": {
                      borderRadius: "4px",
                      backgroundColor: getScoreColor(ctrl.overall_score),
                    },
                  }}
                />

                {/* Recommendations */}
                {recs.length > 0 && (
                  <Stack sx={{ gap: "4px" }}>
                    {recs.slice(0, 3).map((rec, j) => (
                      <Stack
                        key={j}
                        direction="row"
                        sx={{
                          alignItems: "flex-start",
                          gap: "4px",
                        }}
                      >
                        <Lightbulb
                          size={14}
                          style={{
                            color: textColors.icon,
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
