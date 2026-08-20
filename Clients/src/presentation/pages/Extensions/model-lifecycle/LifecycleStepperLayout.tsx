import { useState, useEffect, useMemo, useCallback } from "react";
import { Box, Stack, CircularProgress, Typography } from "@mui/material";
import { LifecyclePhase, LifecycleProgress } from "./useModelLifecycle";
import LifecycleSidebar from "./LifecycleSidebar";
import LifecyclePhaseContent from "./LifecyclePhaseContent";

interface LifecycleStepperLayoutProps {
  phases: LifecyclePhase[];
  progress: LifecycleProgress | null;
  modelId: number;
  loading: boolean;
  onValueChanged: () => void;
}

export default function LifecycleStepperLayout({
  phases,
  progress,
  modelId,
  loading,
  onValueChanged,
}: LifecycleStepperLayoutProps) {
  const [activePhaseId, setActivePhaseId] = useState<number | null>(null);

  useEffect(() => {
    if (phases.length > 0 && activePhaseId === null) {
      setActivePhaseId(phases[0].id);
    }
  }, [phases, activePhaseId]);

  const activePhase = useMemo(
    () => phases.find((p) => p.id === activePhaseId) ?? null,
    [phases, activePhaseId],
  );

  const handlePhaseSelect = useCallback((phaseId: number) => {
    setActivePhaseId(phaseId);
  }, []);

  if (loading && phases.length === 0) {
    return (
      <Stack alignItems="center" sx={{ py: 4 }}>
        <CircularProgress size={24} />
      </Stack>
    );
  }

  if (phases.length === 0) {
    return (
      <Typography sx={{ textAlign: "center", color: "#667085", py: 4 }}>
        No lifecycle phases configured. Contact an administrator to set up the model lifecycle.
      </Typography>
    );
  }

  return (
    <Box
      sx={{
        border: "1px solid #E0E4E9",
        borderRadius: "4px",
        backgroundColor: "#fff",
        overflow: "hidden",
        display: "flex",
        flexDirection: { xs: "column", md: "row" },
        minHeight: 400,
      }}
    >
      <LifecycleSidebar
        phases={phases}
        progress={progress}
        activePhaseId={activePhaseId}
        onPhaseSelect={handlePhaseSelect}
      />
      <Box sx={{ flex: 1, display: "flex", minWidth: 0 }}>
        {activePhase ? (
          <LifecyclePhaseContent
            phase={activePhase}
            modelId={modelId}
            onValueChanged={onValueChanged}
          />
        ) : (
          <Stack alignItems="center" justifyContent="center" sx={{ flex: 1, p: "24px" }}>
            <Typography sx={{ color: "#667085" }}>Select a phase from the sidebar</Typography>
          </Stack>
        )}
      </Box>
    </Box>
  );
}
