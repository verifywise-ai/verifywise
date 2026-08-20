import { useMemo, useCallback } from "react";
import { Stack, Typography, Box } from "@mui/material";
import { Check } from "lucide-react";
import { LifecyclePhase, LifecycleProgress } from "./useModelLifecycle";

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
        borderRight: "1px solid #E0E4E9",
        backgroundColor: "#FCFCFD",
      }}
    >
      <Box sx={{ px: "20px", py: "16px", borderBottom: "1px solid #E0E4E9" }}>
        <Typography sx={{ fontWeight: 600, fontSize: "13px", color: "#344054", mb: "4px" }}>
          Lifecycle Progress
        </Typography>
        <Typography sx={{ fontSize: "12px", color: "#667085" }}>
          {progress?.completion_percentage ?? 0}% complete
          {progress ? ` (${progress.filled_items}/${progress.total_items} items)` : ""}
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
                "py": "10px",
                "gap": "12px",
                "cursor": "pointer",
                "borderLeft": isActive ? "3px solid #13715B" : "3px solid transparent",
                "backgroundColor": isActive ? "rgba(19,113,91,0.06)" : "transparent",
                "&:hover": {
                  backgroundColor: isActive ? "rgba(19,113,91,0.06)" : "#F9FAFB",
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
                  backgroundColor: isComplete || isActive ? "#13715B" : "#E0E4E9",
                  color: isComplete || isActive ? "#fff" : "#667085",
                  fontSize: "11px",
                  fontWeight: 600,
                }}
              >
                {isComplete ? <Check size={14} /> : index + 1}
              </Box>

              <Stack sx={{ flex: 1, minWidth: 0 }}>
                <Typography
                  sx={{
                    fontSize: "13px",
                    fontWeight: isActive ? 600 : 400,
                    color: "#344054",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {phase.name}
                </Typography>
                <Typography
                  sx={{
                    fontSize: "11px",
                    color: hasProgress ? "#475467" : "#667085",
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
