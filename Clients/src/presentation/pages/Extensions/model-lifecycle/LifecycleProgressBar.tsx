import { Stack, Typography, Box, Tooltip } from "@mui/material";
import { LifecycleProgress } from "./useModelLifecycle";
import { accent, background, status, text, radiusPx } from "../../../themes/palette";
import { textStyles } from "../../../themes";

interface LifecycleProgressBarProps {
  progress: LifecycleProgress | null;
  onPhaseClick?: (phaseId: number) => void;
}

export default function LifecycleProgressBar({
  progress,
  onPhaseClick,
}: LifecycleProgressBarProps) {
  const phases = Array.isArray(progress?.phases) ? progress.phases : [];
  if (!progress || phases.length === 0) {
    return null;
  }

  const getPhaseColor = (filled: number, total: number) => {
    if (total === 0) return text.subdued;
    if (filled === total) return status.success.strong;
    if (filled > 0) return accent.blue.text;
    return text.subdued;
  };

  return (
    <Stack sx={{ gap: 6 }}>
      <Stack direction="row" alignItems="center" justifyContent="space-between">
        <Typography sx={{ ...textStyles.cardTitle, color: text.secondary }}>
          Lifecycle Progress
        </Typography>
        <Typography sx={{ ...textStyles.caption, color: text.secondary }}>
          {progress.completion_percentage}% complete ({progress.filled_items}/{progress.total_items}{" "}
          items)
        </Typography>
      </Stack>

      <Stack direction="row" sx={{ gap: 3, width: "100%" }}>
        {phases.map((phase) => {
          const pct = phase.total_items > 0 ? (phase.filled_items / phase.total_items) * 100 : 0;
          const color = getPhaseColor(phase.filled_items, phase.total_items);

          return (
            <Tooltip
              key={phase.phase_id}
              title={`${phase.phase_name}: ${phase.filled_items}/${phase.total_items} items`}
              arrow
            >
              <Box
                onClick={() => onPhaseClick?.(phase.phase_id)}
                sx={{
                  "flex": 1,
                  "height": 8,
                  "borderRadius": radiusPx.md,
                  "overflow": "hidden",
                  "backgroundColor": background.main,
                  "cursor": onPhaseClick ? "pointer" : "default",
                  "&:hover": onPhaseClick ? { opacity: 0.8 } : {},
                  "position": "relative",
                }}
              >
                <Box
                  sx={{
                    width: `${pct}%`,
                    height: "100%",
                    backgroundColor: color,
                    borderRadius: radiusPx.md,
                    transition: "width 0.3s ease",
                  }}
                />
              </Box>
            </Tooltip>
          );
        })}
      </Stack>

      <Stack direction="row" sx={{ gap: 3, width: "100%" }}>
        {phases.map((phase) => (
          <Typography
            key={phase.phase_id}
            sx={{
              flex: 1,
              textAlign: "center",
              ...textStyles.caption,
              color: text.secondary,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              cursor: onPhaseClick ? "pointer" : "default",
            }}
            onClick={() => onPhaseClick?.(phase.phase_id)}
          >
            {phase.phase_name}
          </Typography>
        ))}
      </Stack>
    </Stack>
  );
}
