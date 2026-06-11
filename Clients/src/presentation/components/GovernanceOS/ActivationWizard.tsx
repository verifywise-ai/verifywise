import React, { useEffect, useMemo, useState } from "react";
import { Box, Typography, Stack, Alert } from "@mui/material";
import { Zap, Info } from "lucide-react";
import StepperModal from "../Modals/StepperModal";
import Checkbox from "../Inputs/Checkbox";
import Select from "../Inputs/Select";
import { IGovernanceScenario } from "../../../domain/interfaces/i.governanceOs";
import { Project } from "../../../domain/types/Project";
import { User } from "../../../domain/types/User";
import { border as borderPalette, background, text } from "../../themes/palette";

interface ActivationWizardProps {
  open: boolean;
  scenario: IGovernanceScenario | null;
  projects: Project[];
  users: User[];
  isLoading: boolean;
  onClose: () => void;
  onActivate: (params: {
    projectIds: number[];
    ownerAssignments: Record<number, number | undefined>;
  }) => void;
}

const STEPS = ["Select projects", "Assign owners", "Review & activate"];

const FRAMEWORK_NAMES: Record<number, string> = {
  1: "EU AI Act",
  2: "ISO 42001",
  3: "ISO 27001",
  4: "NIST AI RMF",
};

const ActivationWizard: React.FC<ActivationWizardProps> = ({
  open,
  scenario,
  projects,
  users,
  isLoading,
  onClose,
  onActivate,
}) => {
  const [activeStep, setActiveStep] = useState(0);
  const [selectedProjectIds, setSelectedProjectIds] = useState<number[]>([]);
  const [ownerAssignments, setOwnerAssignments] = useState<Record<number, number | undefined>>({});

  useEffect(() => {
    if (open && scenario) {
      setActiveStep(0);
      setSelectedProjectIds([]);
      setOwnerAssignments({});
    }
  }, [open, scenario?.id]);

  const frameworkIds = useMemo(() => {
    if (!scenario) return [];
    const priorityOrder = scenario.priority_order as {
      primary?: number;
      secondary?: number[];
      supplementary?: number[];
    } | null;
    const ids = new Set<number>();
    if (priorityOrder?.primary) ids.add(priorityOrder.primary);
    priorityOrder?.secondary?.forEach((id) => ids.add(id));
    priorityOrder?.supplementary?.forEach((id) => ids.add(id));
    return Array.from(ids);
  }, [scenario]);

  const toggleProject = (projectId: number) => {
    setSelectedProjectIds((prev) =>
      prev.includes(projectId) ? prev.filter((id) => id !== projectId) : [...prev, projectId],
    );
  };

  const handleOwnerChange = (frameworkId: number, userId: string) => {
    setOwnerAssignments((prev) => ({
      ...prev,
      [frameworkId]: userId === "" ? undefined : Number(userId),
    }));
  };

  const canProceed = useMemo(() => {
    if (activeStep === 0) return selectedProjectIds.length > 0;
    if (activeStep === 1) {
      return frameworkIds.every((id) => ownerAssignments[id] && ownerAssignments[id] > 0);
    }
    return true;
  }, [activeStep, selectedProjectIds, ownerAssignments, frameworkIds]);

  const handleNext = () => {
    if (activeStep < STEPS.length - 1) setActiveStep((s) => s + 1);
  };

  const handleBack = () => {
    if (activeStep > 0) setActiveStep((s) => s - 1);
  };

  const handleSubmit = () => {
    onActivate({
      projectIds: selectedProjectIds,
      ownerAssignments,
    });
  };

  const selectedProjects = projects.filter((p) => selectedProjectIds.includes(p.id));

  const renderStepContent = () => {
    if (!scenario) return null;

    if (activeStep === 0) {
      return (
        <Stack gap="16px">
          <Alert severity="info" icon={<Info size={18} />}>
            <Typography sx={{ fontSize: 13 }}>
              Choose the projects where this scenario should be activated. A task set will be
              created for each selected project based on the scenario&apos;s framework priority
              order.
            </Typography>
          </Alert>

          {projects.length === 0 ? (
            <Alert severity="info">No approved projects available. Create a project first.</Alert>
          ) : (
            <Box
              sx={{
                border: `1px solid ${borderPalette.light}`,
                borderRadius: "4px",
                maxHeight: 320,
                overflow: "auto",
              }}
            >
              {projects.map((project, idx) => (
                <Box
                  key={project.id}
                  sx={{
                    "display": "flex",
                    "alignItems": "center",
                    "justifyContent": "space-between",
                    "px": "16px",
                    "py": "12px",
                    "borderBottom":
                      idx < projects.length - 1 ? `1px solid ${borderPalette.light}` : "none",
                    "backgroundColor": selectedProjectIds.includes(project.id)
                      ? background.accent
                      : background.main,
                    "&:hover": { backgroundColor: background.accent },
                  }}
                >
                  <Box>
                    <Typography sx={{ fontSize: 13, fontWeight: 500, color: text.primary }}>
                      {project.project_title}
                    </Typography>
                    {project.description && (
                      <Typography sx={{ fontSize: 12, color: text.muted }}>
                        {project.description}
                      </Typography>
                    )}
                  </Box>
                  <Checkbox
                    id={`project-${project.id}`}
                    isChecked={selectedProjectIds.includes(project.id)}
                    value={String(project.id)}
                    onChange={() => toggleProject(project.id)}
                  />
                </Box>
              ))}
            </Box>
          )}

          <Box sx={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <Typography sx={{ fontSize: 12, color: text.muted }}>
              {selectedProjectIds.length} project(s) selected
            </Typography>
          </Box>
        </Stack>
      );
    }

    if (activeStep === 1) {
      return (
        <Stack gap="16px">
          <Alert severity="info" icon={<Info size={18} />}>
            <Typography sx={{ fontSize: 13 }}>
              Assign an owner for each framework. These owners will be set as assignees on the tasks
              created during activation and will be responsible for implementing the framework
              controls.
            </Typography>
          </Alert>

          <Box
            sx={{
              border: `1px solid ${borderPalette.light}`,
              borderRadius: "4px",
              p: "16px",
              background: background.main,
            }}
          >
            <Stack gap="16px">
              {frameworkIds.map((fwId) => (
                <Box key={fwId}>
                  <Typography
                    sx={{ fontSize: 12, fontWeight: 500, color: text.primary, mb: "4px" }}
                  >
                    {FRAMEWORK_NAMES[fwId] || `Framework ${fwId}`}
                  </Typography>
                  <Select
                    id={`owner-fw-${fwId}`}
                    label="Owner"
                    placeholder="Select owner"
                    value={ownerAssignments[fwId] ? String(ownerAssignments[fwId]) : ""}
                    items={users.map((u) => ({
                      _id: String(u.id),
                      name: `${u.name} ${u.surname}`,
                    }))}
                    onChange={(e) => handleOwnerChange(fwId, e.target.value as string)}
                    sx={{ minWidth: 260 }}
                  />
                </Box>
              ))}
            </Stack>
          </Box>

          {users.length === 0 && (
            <Alert severity="warning">
              No users available to assign. Invite team members before activating.
            </Alert>
          )}
        </Stack>
      );
    }

    return (
      <Stack gap="16px">
        <Alert severity="info" icon={<Zap size={18} />}>
          <Typography sx={{ fontSize: 13 }}>
            You are about to activate <strong>{scenario.name}</strong>. This will create real tasks
            across <strong>{selectedProjects.length}</strong> project(s) and assign them to the
            selected owners.
          </Typography>
        </Alert>

        <Box
          sx={{
            border: `1px solid ${borderPalette.light}`,
            borderRadius: "4px",
            p: "16px",
            background: background.main,
          }}
        >
          <Typography sx={{ fontSize: 13, fontWeight: 600, color: text.primary, mb: "16px" }}>
            Activation summary
          </Typography>

          <Stack gap="16px">
            <Box>
              <Typography sx={{ fontSize: 11, color: text.muted, mb: "4px" }}>Scenario</Typography>
              <Typography sx={{ fontSize: 13, color: text.primary }}>{scenario.name}</Typography>
            </Box>

            <Box>
              <Typography sx={{ fontSize: 11, color: text.muted, mb: "4px" }}>
                Projects ({selectedProjects.length})
              </Typography>
              <Typography sx={{ fontSize: 13, color: text.primary }}>
                {selectedProjects.map((p) => p.project_title).join(", ") || "—"}
              </Typography>
            </Box>

            <Box>
              <Typography sx={{ fontSize: 11, color: text.muted, mb: "4px" }}>
                Framework owners
              </Typography>
              <Stack gap="4px">
                {frameworkIds.map((fwId) => {
                  const user = users.find((u) => u.id === ownerAssignments[fwId]);
                  return (
                    <Typography key={fwId} sx={{ fontSize: 13, color: text.primary }}>
                      {FRAMEWORK_NAMES[fwId] || `Framework ${fwId}`}:{" "}
                      {user ? `${user.name} ${user.surname}` : "—"}
                    </Typography>
                  );
                })}
              </Stack>
            </Box>

            <Box>
              <Typography sx={{ fontSize: 11, color: text.muted, mb: "4px" }}>
                Staggered due dates
              </Typography>
              <Stack gap="4px">
                <Typography sx={{ fontSize: 13, color: text.primary }}>
                  Primary framework: 14 days
                </Typography>
                <Typography sx={{ fontSize: 13, color: text.primary }}>
                  Secondary framework(s): 30 days
                </Typography>
                <Typography sx={{ fontSize: 13, color: text.primary }}>
                  Supplementary framework(s): 60 days
                </Typography>
              </Stack>
            </Box>
          </Stack>
        </Box>
      </Stack>
    );
  };

  return (
    <StepperModal
      isOpen={open && !!scenario}
      onClose={onClose}
      title={`Activate scenario: ${scenario?.name || ""}`}
      steps={STEPS}
      activeStep={activeStep}
      onNext={handleNext}
      onBack={handleBack}
      onSubmit={handleSubmit}
      canProceed={canProceed && !isLoading}
      isSubmitting={isLoading}
      submitButtonText="Activate scenario"
      maxWidth="720px"
    >
      {renderStepContent()}
    </StepperModal>
  );
};

export default ActivationWizard;
