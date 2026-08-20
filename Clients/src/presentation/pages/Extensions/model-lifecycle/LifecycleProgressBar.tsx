import { Stack, Typography, Box, Tooltip } from "@mui/material";
import { LifecycleProgress } from "./useModelLifecycle";

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
    if (total === 0) return "#E0E4E9";
    if (filled === total) return "#079455";
    if (filled > 0) return "#2E90FA";
    return "#E0E4E9";
  };

  return (
    <Stack sx={{ gap: "12px" }}>
      <Stack direction="row" alignItems="center" justifyContent="space-between">
        <Typography sx={{ fontWeight: 600, fontSize: "14px", color: "#344054" }}>
          Lifecycle Progress
        </Typography>
        <Typography sx={{ fontSize: "13px", color: "#667085" }}>
          {progress.completion_percentage}% complete ({progress.filled_items}/{progress.total_items}{" "}
          items)
        </Typography>
      </Stack>

      <Stack direction="row" sx={{ gap: "6px", width: "100%" }}>
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
                  "borderRadius": 3,
                  "overflow": "hidden",
                  "backgroundColor": "#E0E4E9",
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
                    borderRadius: 3,
                    transition: "width 0.3s ease",
                  }}
                />
              </Box>
            </Tooltip>
          );
        })}
      </Stack>

      <Stack direction="row" sx={{ gap: "6px", width: "100%" }}>
        {phases.map((phase) => (
          <Typography
            key={phase.phase_id}
            sx={{
              flex: 1,
              textAlign: "center",
              fontSize: "11px",
              color: "#667085",
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
