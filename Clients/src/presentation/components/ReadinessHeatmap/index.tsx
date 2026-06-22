import { useMemo } from "react";
import { Box, Typography, Tooltip, Stack } from "@mui/material";
import { ShieldCheck, ShieldAlert, ShieldX, ShieldOff } from "lucide-react";
import { status, accent, text as textColors, background } from "../../themes/palette";
import type { ReadinessLevel, ControlReadinessScore } from "../../../domain/interfaces/i.readiness";

interface ReadinessHeatmapProps {
  controls: ControlReadinessScore[];
  frameworkType: string;
  isLoading?: boolean;
}

const LEVEL_CONFIG: Record<
  ReadinessLevel,
  {
    label: string;
    colors: { bg: string; text: string; border: string };
    Icon: typeof ShieldCheck;
  }
> = {
  ready: { label: "Ready", colors: status.success, Icon: ShieldCheck },
  needs_work: { label: "Needs Work", colors: accent.primary, Icon: ShieldAlert },
  at_risk: { label: "At Risk", colors: status.warning, Icon: ShieldX },
  not_started: { label: "Not Started", colors: status.error, Icon: ShieldOff },
};

const LEVELS: ReadinessLevel[] = ["ready", "needs_work", "at_risk", "not_started"];

function formatFrameworkName(type: string): string {
  const names: Record<string, string> = {
    eu_ai_act: "EU AI Act",
    iso_42001: "ISO 42001",
    iso_27001: "ISO 27001",
    nist_ai_rmf: "NIST AI RMF",
  };
  return names[type] || type.replace(/_/g, " ").toUpperCase();
}

const FIXED_HEIGHT = 340;

export default function ReadinessHeatmap({
  controls,
  frameworkType,
  isLoading,
}: ReadinessHeatmapProps) {
  const counts = useMemo(() => {
    const c: Record<ReadinessLevel, number> = {
      ready: 0,
      needs_work: 0,
      at_risk: 0,
      not_started: 0,
    };
    controls.forEach((ctrl) => {
      c[ctrl.readiness_level]++;
    });
    return c;
  }, [controls]);

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
        <Typography sx={{ fontSize: 13, color: textColors.muted }}>Loading heatmap...</Typography>
      </Box>
    );
  }

  if (!controls || controls.length === 0) {
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
          No readiness data. Run a calculation first.
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
        {formatFrameworkName(frameworkType)} — Control readiness
      </Typography>

      {/* Legend with counts */}
      <Stack direction="row" spacing={2.5} sx={{ mb: 1, flexShrink: 0 }}>
        {LEVELS.map((level) => {
          const { label, colors, Icon } = LEVEL_CONFIG[level];
          const count = counts[level];
          return (
            <Stack key={level} direction="row" alignItems="center" spacing={0.75}>
              <Box
                sx={{
                  width: 20,
                  height: 20,
                  borderRadius: "4px",
                  backgroundColor: colors.bg,
                  border: `1px solid ${colors.border}`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Icon size={11} style={{ color: colors.text }} />
              </Box>
              <Typography sx={{ fontSize: 11, color: textColors.secondary }}>{label}</Typography>
              <Typography
                sx={{
                  fontSize: 11,
                  fontWeight: 700,
                  color: count > 0 ? colors.text : textColors.muted,
                }}
              >
                {count}
              </Typography>
            </Stack>
          );
        })}
      </Stack>

      {/* Scrollable heatmap grid */}
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
        <Box sx={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
          {controls.map((ctrl) => {
            const { colors, label } = LEVEL_CONFIG[ctrl.readiness_level];
            return (
              <Tooltip
                key={ctrl.control_id}
                title={
                  <Box>
                    <Typography sx={{ fontSize: 12, fontWeight: 600 }}>
                      Control {ctrl.control_id}
                    </Typography>
                    <Typography sx={{ fontSize: 11, mt: 0.25 }}>
                      Score: {ctrl.overall_score}/100 ({label})
                    </Typography>
                  </Box>
                }
                arrow
                placement="top"
              >
                <Box
                  sx={{
                    "width": 36,
                    "height": 36,
                    "borderRadius": "6px",
                    "backgroundColor": colors.bg,
                    "border": `1.5px solid ${colors.border}`,
                    "display": "flex",
                    "alignItems": "center",
                    "justifyContent": "center",
                    "cursor": "default",
                    "transition": "all 0.2s ease",
                    "&:hover": {
                      transform: "scale(1.12)",
                      boxShadow: `0 2px 8px ${colors.border}`,
                      borderColor: colors.text,
                      zIndex: 1,
                    },
                  }}
                >
                  <Typography
                    sx={{
                      fontSize: 11,
                      fontWeight: 700,
                      color: colors.text,
                      lineHeight: 1,
                    }}
                  >
                    {ctrl.overall_score}
                  </Typography>
                </Box>
              </Tooltip>
            );
          })}
        </Box>
      </Box>

      {/* Footer */}
      <Typography sx={{ mt: 1.5, fontSize: 11, color: textColors.muted, flexShrink: 0 }}>
        {controls.length} controls evaluated
      </Typography>
    </Box>
  );
}
