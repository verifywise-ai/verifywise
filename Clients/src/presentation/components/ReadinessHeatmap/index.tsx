import { useMemo } from "react";
import { Box, Typography, Tooltip, Stack } from "@mui/material";
import { ShieldCheck, ShieldAlert, ShieldX, ShieldOff } from "lucide-react";
import { status, text as textColors, background } from "../../themes/palette";
import Chip from "../Chip";
import CustomizableSkeleton from "../Skeletons";
import { EmptyState } from "../EmptyState";
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
  needs_work: { label: "Needs work", colors: status.info, Icon: ShieldAlert },
  at_risk: { label: "At risk", colors: status.warning, Icon: ShieldX },
  not_started: { label: "Not started", colors: status.error, Icon: ShieldOff },
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
      <Box sx={{ height: FIXED_HEIGHT }}>
        <CustomizableSkeleton variant="rounded" width="100%" height={FIXED_HEIGHT - 16} />
      </Box>
    );
  }

  if (!controls || controls.length === 0) {
    return (
      <Box sx={{ height: FIXED_HEIGHT }}>
        <EmptyState
          icon={ShieldCheck}
          message="No readiness data. Run a calculation first."
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
        {formatFrameworkName(frameworkType)} — Control readiness
      </Typography>

      {/* Legend with counts */}
      <Stack direction="row" sx={{ gap: "8px", mb: "12px", flexWrap: "wrap", flexShrink: 0 }}>
        {LEVELS.map((level) => {
          const { label, colors, Icon } = LEVEL_CONFIG[level];
          return (
            <Chip
              key={level}
              label={`${label} ${counts[level]}`}
              icon={<Icon size={14} />}
              size="small"
              uppercase={false}
              backgroundColor={colors.bg}
              textColor={colors.text}
            />
          );
        })}
      </Stack>

      {/* Scrollable heatmap grid */}
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
        <Box sx={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
          {controls.map((ctrl) => {
            const { colors, label } = LEVEL_CONFIG[ctrl.readiness_level];
            return (
              <Tooltip
                key={ctrl.control_id}
                title={
                  <Box>
                    <Typography sx={{ fontSize: 13, fontWeight: 500 }}>
                      Control {ctrl.control_id}
                    </Typography>
                    <Typography sx={{ fontSize: 11, mt: "4px" }}>
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
                    "borderRadius": "4px",
                    "backgroundColor": colors.bg,
                    "border": `1px solid ${colors.border}`,
                    "display": "flex",
                    "alignItems": "center",
                    "justifyContent": "center",
                    "cursor": "default",
                    "transition": "border-color 0.2s ease",
                    "&:hover": {
                      borderColor: colors.text,
                    },
                  }}
                >
                  <Typography
                    sx={{
                      fontSize: 11,
                      fontWeight: 500,
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
      <Typography sx={{ mt: "12px", fontSize: 11, color: textColors.accent, flexShrink: 0 }}>
        {controls.length} controls evaluated
      </Typography>
    </Box>
  );
}
