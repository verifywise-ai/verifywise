import { useMemo, useCallback } from "react";
import { Stack, Typography, Box } from "@mui/material";
import { Check } from "lucide-react";
import { LifecyclePhase, LifecycleProgress } from "./useModelLifecycle";
import { background, brand, icon, text, border } from "../../../themes/palette";
import { textStyles } from "../../../../presentation/themes/typography";

interface LifecycleSidebarProps {
  phases: LifecyclePhase[];
  progress: LifecycleProgress | null;
  activePhaseId: number | null;
  onPhaseSelect: (phaseId: number) => void;
}

export default function LifecycleSidebar({
  phases,
  progress,
  activePhaseId,
  onPhaseSelect,
}: LifecycleSidebarProps) {
  const progressPhases = Array.isArray(progress?.phases) ? progress.phases : [];

  const phaseData = useMemo(() => {
    return (Array.isArray(phases) ? phases : []).map((phase) => {
      const phaseProgress = progressPhases.find((p) => p.phase_id === phase.id);
      return {
        id: phase.id,
        name: phase.name,
        totalItems: phaseProgress?.total_items ?? phase.items?.length ?? 0,
        filledItems: phaseProgress?.filled_items ?? 0,
      };
    });
  }, [phases, progress]);

  const handleClick = useCallback(
    (phaseId: number) => {
      onPhaseSelect(phaseId);
    },
    [onPhaseSelect],
  );

  return (
    <Stack
      sx={{
        width: 280,
        minWidth: 280,
        borderRight: `1px solid border.light`,
        backgroundColor: background.main,
      }}
    >
      <Box sx={{ px: 10, py: 8, borderBottom: `1px solid border.light` }}>
        <Typography sx={{ ...textStyles.cardTitle, color: text.secondary, mb: 2 }}>
          Lifecycle Progress
        </Typography>
        <Typography sx={{ ...textStyles.caption, color: text.secondary }}>
          {progress?.completion_percentage ?? 0}% complete
          {progress ? ` (${progress.filled_items}/${progress.total_items} items)` : ""}
        </Typography>
      </Box>

      <Stack sx={{ py: 4 }}>
        {phaseData.map((phase, index) => {
          const isActive = phase.id === activePhaseId;
          const isComplete = phase.totalItems > 0 && phase.filledItems === phase.totalItems;
          const hasProgress = phase.filledItems > 0;

          return (
            <Stack
              key={phase.id}
              direction="row"
              alignItems="center"
              onClick={() => handleClick(phase.id)}
              sx={{
                "px": 10,
                "py": 4,
                "gap": 6,
                "cursor": "pointer",
                "borderLeft": isActive ? `3px solid ${brand.primary}` : "3px solid transparent",
                "backgroundColor": isActive ? "rgba(19,113,91,0.06)" : "transparent",
                "&:hover": {
                  backgroundColor: isActive ? "rgba(19,113,91,0.06)" : background.alt,
                },
                "transition": "background-color 0.15s ease",
              }}
            >
              <Box
                sx={{
                  width: 24,
                  height: 24,
                  minWidth: 24,
                  borderRadius: "50%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: isComplete || isActive ? brand.primary : background.surface,
                  color: isComplete || isActive ? text.onPrimary : text.secondary,
                  ...textStyles.badge,
                }}
              >
                {isComplete ? <Check size={14} /> : index + 1}
              </Box>

              <Stack sx={{ flex: 1, minWidth: 0 }}>
                <Typography
                  sx={{
                    ...textStyles.body,
                    fontWeight: isActive ? 600 : 400,
                    color: text.secondary,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {phase.name}
                </Typography>
                <Typography
                  sx={{
                    ...textStyles.caption,
                    color: hasProgress ? text.secondary : text.subdued,
                  }}
                >
                  {phase.filledItems}/{phase.totalItems} items
                </Typography>
              </Stack>
            </Stack>
          );
        })}
      </Stack>
    </Stack>
  );
}
