import React, { useMemo } from "react";
import { Box, Typography, Stack, LinearProgress, alpha } from "@mui/material";
import { useNavigate } from "react-router-dom";
import {
  Target,
  Zap,
  ArrowRight,
  XCircle,
  LayoutDashboard,
  BarChart3,
  GitCompareArrows,
} from "lucide-react";
import { IGovernanceScenario } from "../../../domain/interfaces/i.governanceOs";
import {
  useActivationHistory,
  useDeactivateScenario,
  useScenarioProgress,
} from "../../../application/hooks/useGovernanceOs";
import FrameworkChip from "./FrameworkChip";
import GovernanceTooltip from "./GovernanceTooltip";
import { CustomizableButton } from "../button/customizable-button";
import { border as borderPalette, background, text, brand, status } from "../../themes/palette";
import { displayFormattedDate } from "../../tools/isoDateToString";

interface ActiveScenarioPanelProps {
  activeScenario: IGovernanceScenario | null | undefined;
  onActivate: (scenario: IGovernanceScenario) => void;
}

const FRAMEWORK_NAMES: Record<number, string> = {
  1: "EU AI Act",
  2: "ISO 42001",
  3: "ISO 27001",
  4: "NIST AI RMF",
};

const ActiveScenarioPanel: React.FC<ActiveScenarioPanelProps> = ({
  activeScenario,
  onActivate,
}) => {
  const navigate = useNavigate();
  const { data: activations } = useActivationHistory();
  const deactivateMutation = useDeactivateScenario();

  const latestActivation = useMemo(() => {
    if (!activations || !activeScenario) return null;
    return (
      activations.find((a: any) => a.scenario_id === activeScenario.id && a.status === "active") ||
      null
    );
  }, [activations, activeScenario]);

  const { data: progress } = useScenarioProgress(latestActivation?.id || 0);

  if (!activeScenario) {
    return (
      <Box
        sx={{
          border: `1px dashed ${borderPalette.light}`,
          borderRadius: "4px",
          p: "16px",
          background: background.main,
        }}
      >
        <Stack direction="row" gap="16px" alignItems="center">
          <Target size={20} color={text.muted} />
          <Box>
            <Typography sx={{ fontSize: 13, fontWeight: 600, color: text.primary }}>
              No active scenario
            </Typography>
            <Typography sx={{ fontSize: 12, color: text.muted }}>
              Select a scenario below to set your organization&apos;s active governance strategy.
            </Typography>
          </Box>
        </Stack>
      </Box>
    );
  }

  const priorityOrder = activeScenario.priority_order as {
    primary?: number;
    secondary?: number[];
    supplementary?: number[];
  } | null;

  const frameworkIds = [
    priorityOrder?.primary,
    ...(priorityOrder?.secondary || []),
    ...(priorityOrder?.supplementary || []),
  ].filter(Boolean) as number[];

  const activationDate = latestActivation?.activated_at
    ? displayFormattedDate(latestActivation.activated_at)
    : null;

  return (
    <Box
      sx={{
        border: `1px solid ${brand.primary}`,
        borderRadius: "4px",
        p: "16px",
        background: `linear-gradient(135deg, ${background.main} 0%, ${alpha(brand.primary, 0.06)} 100%)`,
      }}
    >
      <Stack
        direction={{ xs: "column", md: "row" }}
        gap="16px"
        justifyContent="space-between"
        alignItems={{ xs: "flex-start", md: "center" }}
      >
        <Stack direction="row" gap="16px" alignItems="flex-start">
          <Box
            sx={{
              width: 36,
              height: 36,
              borderRadius: "50%",
              backgroundColor: alpha(brand.primary, 0.12),
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <Target size={18} color={brand.primary} />
          </Box>
          <Box>
            <Stack direction="row" gap="8px" alignItems="center" sx={{ mb: "4px" }}>
              <Typography sx={{ fontSize: 14, fontWeight: 600, color: text.primary }}>
                Active scenario
              </Typography>
              <Box
                component="span"
                sx={{
                  display: "inline-flex",
                  alignItems: "center",
                  height: 20,
                  px: 1,
                  borderRadius: "4px",
                  fontSize: 11,
                  fontWeight: 500,
                  backgroundColor: alpha(brand.primary, 0.12),
                  color: brand.primary,
                }}
              >
                {latestActivation ? "Activated" : "Selected"}
              </Box>
            </Stack>
            <Typography sx={{ fontSize: 13, color: text.primary, fontWeight: 500 }}>
              {activeScenario.name}
            </Typography>
            {activeScenario.description && (
              <Typography sx={{ fontSize: 12, color: text.accent, mt: "4px" }}>
                {activeScenario.description}
              </Typography>
            )}
            {activationDate && (
              <Typography sx={{ fontSize: 11, color: text.muted, mt: "4px" }}>
                Activated on {activationDate}
                {latestActivation?.tasks_created
                  ? ` · ${latestActivation.tasks_created} task(s) created`
                  : ""}
              </Typography>
            )}
            <GovernanceTooltip
              header="Frameworks"
              description="Frameworks included in this scenario"
            >
              <Stack direction="row" flexWrap="wrap" gap="6px" sx={{ mt: "12px" }}>
                {frameworkIds.map((id) => {
                  const priority =
                    id === priorityOrder?.primary
                      ? "primary"
                      : priorityOrder?.secondary?.includes(id)
                        ? "secondary"
                        : "supplementary";
                  return (
                    <FrameworkChip
                      key={id}
                      frameworkName={FRAMEWORK_NAMES[id] || `Framework ${id}`}
                      priority={priority}
                      size="small"
                    />
                  );
                })}
              </Stack>
            </GovernanceTooltip>
          </Box>
        </Stack>

        <Stack direction="row" gap="8px" sx={{ flexShrink: 0 }}>
          <GovernanceTooltip
            header="View insights"
            description="Open Unified Insights for this active scenario"
          >
            <span>
              <CustomizableButton
                size="small"
                variant="outlined"
                startIcon={<BarChart3 size={14} />}
                endIcon={<ArrowRight size={14} />}
                onClick={() => navigate("/governance/insights")}
                text="View insights"
                sx={{}}
              />
            </span>
          </GovernanceTooltip>
          {latestActivation && (
            <GovernanceTooltip
              header="Deactivate scenario"
              description="Stop the active scenario and remove its generated tasks"
            >
              <span>
                <CustomizableButton
                  size="small"
                  variant="outlined"
                  color="error"
                  startIcon={<XCircle size={14} />}
                  text="Deactivate"
                  onClick={() => deactivateMutation.mutate(latestActivation.id)}
                  isDisabled={deactivateMutation.isPending}
                  sx={{}}
                />
              </span>
            </GovernanceTooltip>
          )}
          <GovernanceTooltip
            header="Activate scenario"
            description="Create tasks for the selected projects based on this scenario"
          >
            <span>
              <CustomizableButton
                variant="contained"
                size="small"
                startIcon={<Zap size={14} />}
                endIcon={<ArrowRight size={14} />}
                onClick={() => onActivate(activeScenario)}
                text={latestActivation ? "Re-activate" : "Activate now"}
                sx={{}}
              />
            </span>
          </GovernanceTooltip>
        </Stack>
      </Stack>

      {/* Framework progress */}
      {progress && progress.length > 0 && (
        <Box sx={{ mt: "16px", pt: "16px", borderTop: `1px solid ${borderPalette.light}` }}>
          <GovernanceTooltip
            header="Task progress"
            description="Completion status of tasks grouped by framework"
          >
            <Typography sx={{ fontSize: 12, fontWeight: 600, color: text.primary, mb: "12px" }}>
              Task progress by framework
            </Typography>
          </GovernanceTooltip>
          <Stack gap="12px">
            {progress.map((fw: any) => {
              const percent =
                fw.totalTasks > 0 ? Math.round((fw.completedTasks / fw.totalTasks) * 100) : 0;
              return (
                <Box key={fw.frameworkId}>
                  <Stack
                    direction="row"
                    justifyContent="space-between"
                    alignItems="center"
                    sx={{ mb: "4px" }}
                  >
                    <Typography sx={{ fontSize: 12, color: text.primary }}>
                      {fw.frameworkName}
                    </Typography>
                    <Typography sx={{ fontSize: 11, color: text.muted }}>
                      {fw.completedTasks}/{fw.totalTasks} done
                      {fw.inProgressTasks > 0 ? ` · ${fw.inProgressTasks} in progress` : ""}
                    </Typography>
                  </Stack>
                  <LinearProgress
                    variant="determinate"
                    value={percent}
                    sx={{
                      "height": 6,
                      "borderRadius": "4px",
                      "backgroundColor": background.hover,
                      "& .MuiLinearProgress-bar": {
                        backgroundColor:
                          percent >= 70
                            ? status.success.text
                            : percent >= 40
                              ? status.warning.text
                              : status.error.text,
                        borderRadius: "4px",
                      },
                    }}
                  />
                </Box>
              );
            })}
          </Stack>
        </Box>
      )}

      {/* Quick actions / guidance */}
      <Box sx={{ mt: "16px", pt: "16px", borderTop: `1px solid ${borderPalette.light}` }}>
        <Typography sx={{ fontSize: 12, fontWeight: 600, color: text.primary, mb: "8px" }}>
          Continue your governance workflow
        </Typography>
        <Stack direction="row" gap="8px" flexWrap="wrap" useFlexGap>
          <CustomizableButton
            size="small"
            variant="outlined"
            startIcon={<LayoutDashboard size={14} />}
            endIcon={<ArrowRight size={14} />}
            onClick={() => navigate("/")}
            text="Dashboard"
            sx={{}}
          />
          <CustomizableButton
            size="small"
            variant="outlined"
            startIcon={<BarChart3 size={14} />}
            endIcon={<ArrowRight size={14} />}
            onClick={() => navigate("/governance/insights")}
            text="Unified Insights"
            sx={{}}
          />
          <CustomizableButton
            size="small"
            variant="outlined"
            startIcon={<GitCompareArrows size={14} />}
            endIcon={<ArrowRight size={14} />}
            onClick={() => navigate("/governance/framework-mapper")}
            text="Framework Mapper"
            sx={{}}
          />
        </Stack>
      </Box>
    </Box>
  );
};

export default ActiveScenarioPanel;
