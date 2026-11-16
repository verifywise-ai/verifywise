import { useMemo, useCallback } from "react";
import { Stack, Typography, Box } from "@mui/material";
import { Check } from "lucide-react";
import { LifecyclePhase, LifecycleProgress } from "./useModelLifecycle";
import { background, border, brand, text } from "../../../themes/palette";
import { textStyles } from "../../../../presentation/themes/typography";
import useTranslation from "../../../../application/hooks/useTranslation";
import { fill } from "../../../../i18n/fill";

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
  const { t } = useTranslation();
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
        borderRight: `1px solid ${border.light}`,
        backgroundColor: background.main,
      }}
    >
      <Box sx={{ px: "20px", py: "16px", borderBottom: `1px solid ${border.light}` }}>
        <Typography sx={{ ...textStyles.cardTitle, color: text.secondary, mb: "4px" }}>
          Lifecycle progress
        </Typography>
        <Typography sx={{ ...textStyles.caption, color: text.secondary }}>
          {progress
            ? fill(t("{percent}% complete ({filled}/{total} items)"), {
                percent: progress.completion_percentage,
                filled: progress.filled_items,
                total: progress.total_items,
              })
            : fill(t("{percent}% complete"), { percent: 0 })}
        </Typography>
      </Box>

      <Stack sx={{ py: "8px" }}>
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
                "px": "20px",
                "py": "8px",
                "gap": "12px",
                "cursor": "pointer",
                "borderLeft": isActive ? `3px solid ${brand.primary}` : "3px solid transparent",
                "backgroundColor": isActive ? background.selected : "transparent",
                "&:hover": {
                  backgroundColor: isActive ? background.selected : background.alt,
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
                  color: isComplete || isActive ? text.inverse : text.secondary,
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
