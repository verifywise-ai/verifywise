import { useState } from "react";
import {
  Box,
  Typography,
  Stack,
  CircularProgress,
  Divider,
  Alert,
  SelectChangeEvent,
} from "@mui/material";
import { Compass, Plus } from "lucide-react";
import Select from "../../components/Inputs/Select";
import ScenarioCard from "../../components/GovernanceOS/ScenarioCard";
import { EmptyState } from "../../components/EmptyState";
import ConfirmationModal from "../../components/Dialogs/ConfirmationModal";
import { CustomizableButton } from "../../components/button/customizable-button";
import {
  useScenarios,
  useCreateScenario,
  useUpdateScenario,
  useDeleteScenario,
  useGovernanceRecommendations,
  useGovernancePreferences,
  useUpdatePreferences,
  useActivateScenario,
  useSimulateScenario,
} from "../../../application/hooks/useGovernanceOs";
import { useProjects } from "../../../application/hooks/useProjects";
import useUsers from "../../../application/hooks/useUsers";
import {
  IRecommendationRequest,
  IGovernanceScenario,
} from "../../../domain/interfaces/i.governanceOs";
import { border as borderPalette, background } from "../../themes/palette";
import ScenarioFormModal from "./ScenarioBuilderModule/ScenarioFormModal";
import ActivationWizard from "../../components/GovernanceOS/ActivationWizard";
import WhatIfSimulator from "../../components/GovernanceOS/WhatIfSimulator";
import ScenarioComparison from "../../components/GovernanceOS/ScenarioComparison";
import ActiveScenarioPanel from "../../components/GovernanceOS/ActiveScenarioPanel";
import ActivationHistory from "../../components/GovernanceOS/ActivationHistory";

const INDUSTRIES = [
  { _id: "technology", name: "Technology" },
  { _id: "healthcare", name: "Healthcare" },
  { _id: "finance", name: "Financial Services" },
  { _id: "public_sector", name: "Public Sector" },
  { _id: "manufacturing", name: "Manufacturing" },
  { _id: "education", name: "Education" },
  { _id: "energy", name: "Energy" },
  { _id: "retail", name: "Retail" },
];

const REGIONS = [
  { _id: "eu", name: "European Union" },
  { _id: "us", name: "United States" },
  { _id: "global", name: "Global" },
  { _id: "apac", name: "Asia-Pacific" },
  { _id: "uk", name: "United Kingdom" },
];

const RISK_LEVELS = [
  { _id: "high", name: "High Risk" },
  { _id: "limited", name: "Limited Risk" },
  { _id: "minimal", name: "Minimal Risk" },
];

const USE_CASE_TYPES = [
  { _id: "high_risk_ai", name: "High-Risk AI System" },
  { _id: "general_purpose_ai", name: "General-Purpose AI" },
  { _id: "limited_risk", name: "Limited Risk AI" },
];

const ScenarioBuilder = () => {
  const { data: scenarios, isLoading: scenariosLoading } = useScenarios();
  const { data: preferences } = useGovernancePreferences();
  const updatePreferencesMutation = useUpdatePreferences();
  const recommendMutation = useGovernanceRecommendations();
  const createScenarioMutation = useCreateScenario();
  const updateScenarioMutation = useUpdateScenario();
  const deleteScenarioMutation = useDeleteScenario();
  const activateScenarioMutation = useActivateScenario();
  const simulateScenarioMutation = useSimulateScenario();
  const { approvedProjects, isLoading: projectsLoading } = useProjects();
  const { users, loading: usersLoading } = useUsers();

  const [formModalOpen, setFormModalOpen] = useState(false);
  const [editingScenario, setEditingScenario] = useState<IGovernanceScenario | null>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [scenarioToDelete, setScenarioToDelete] = useState<IGovernanceScenario | null>(null);

  const [formData, setFormData] = useState<IRecommendationRequest>({
    industry: "",
    region: "",
    riskLevel: "",
    useCaseType: "",
    deploymentScale: "",
  });

  const [activationWizardOpen, setActivationWizardOpen] = useState(false);
  const [activatingScenario, setActivatingScenario] = useState<IGovernanceScenario | null>(null);
  const [compareSelectedIds, setCompareSelectedIds] = useState<number[]>([]);

  const selectedScenarioId = preferences?.selected_scenario_id ?? null;

  const handleRecommend = () => {
    recommendMutation.mutate(formData);
  };

  const handleSelectScenario = (scenario: IGovernanceScenario) => {
    updatePreferencesMutation.mutate({ selected_scenario_id: scenario.id });
  };

  const handleCreateScenario = () => {
    setEditingScenario(null);
    setFormModalOpen(true);
  };

  const handleEditScenario = (scenario: IGovernanceScenario) => {
    setEditingScenario(scenario);
    setFormModalOpen(true);
  };

  const handleDeleteScenario = (scenario: IGovernanceScenario) => {
    setScenarioToDelete(scenario);
    setDeleteConfirmOpen(true);
  };

  const confirmDelete = () => {
    if (scenarioToDelete) {
      deleteScenarioMutation.mutate(scenarioToDelete.id);
      setDeleteConfirmOpen(false);
      setScenarioToDelete(null);
    }
  };

  const handleFormSubmit = (data: Partial<IGovernanceScenario>) => {
    if (editingScenario) {
      updateScenarioMutation.mutate(
        { id: editingScenario.id, body: data },
        { onSuccess: () => setFormModalOpen(false) },
      );
    } else {
      createScenarioMutation.mutate(data, { onSuccess: () => setFormModalOpen(false) });
    }
  };

  const handleActivateClick = (scenario: IGovernanceScenario) => {
    setActivatingScenario(scenario);
    setActivationWizardOpen(true);
  };

  const handleActivate = ({
    projectIds,
    ownerAssignments,
  }: {
    projectIds: number[];
    ownerAssignments: Record<number, number | undefined>;
  }) => {
    if (!activatingScenario) return;
    activateScenarioMutation.mutate(
      {
        id: activatingScenario.id,
        body: { projectIds, ownerAssignments },
      },
      {
        onSuccess: () => {
          setActivationWizardOpen(false);
          setActivatingScenario(null);
        },
      },
    );
  };

  const canRecommend =
    formData.industry || formData.region || formData.riskLevel || formData.useCaseType;

  return (
    <Stack gap="16px">
      <ActiveScenarioPanel
        activeScenario={scenarios?.find((s) => s.id === selectedScenarioId)}
        onActivate={handleActivateClick}
      />

      <ActivationHistory />

      {/* Recommendation form */}
      <Box
        sx={{
          border: `1px solid ${borderPalette.dark}`,
          borderRadius: "4px",
          p: "16px",
          background: `linear-gradient(135deg, ${background.main} 0%, ${background.gradientStop} 100%)`,
        }}
      >
        <Typography sx={{ mb: "16px", fontSize: 14, fontWeight: 600 }}>
          Get Recommendations
        </Typography>
        <Stack direction="row" gap="16px" flexWrap="wrap" useFlexGap alignItems="flex-end">
          <Select
            id="industry-select"
            label="Industry"
            placeholder="Any"
            value={formData.industry || ""}
            items={INDUSTRIES}
            onChange={(e: SelectChangeEvent<string | number>) =>
              setFormData({ ...formData, industry: e.target.value as string })
            }
            sx={{ minWidth: 170 }}
          />

          <Select
            id="region-select"
            label="Region"
            placeholder="Any"
            value={formData.region || ""}
            items={REGIONS}
            onChange={(e: SelectChangeEvent<string | number>) =>
              setFormData({ ...formData, region: e.target.value as string })
            }
            sx={{ minWidth: 170 }}
          />

          <Select
            id="risk-level-select"
            label="Risk Level"
            placeholder="Any"
            value={formData.riskLevel || ""}
            items={RISK_LEVELS}
            onChange={(e: SelectChangeEvent<string | number>) =>
              setFormData({ ...formData, riskLevel: e.target.value as string })
            }
            sx={{ minWidth: 170 }}
          />

          <Select
            id="use-case-type-select"
            label="Use Case Type"
            placeholder="Any"
            value={formData.useCaseType || ""}
            items={USE_CASE_TYPES}
            onChange={(e: SelectChangeEvent<string | number>) =>
              setFormData({ ...formData, useCaseType: e.target.value as string })
            }
            sx={{ minWidth: 170 }}
          />

          <CustomizableButton
            variant="contained"
            onClick={handleRecommend}
            isDisabled={recommendMutation.isPending || !canRecommend}
            text={recommendMutation.isPending ? "Getting..." : "Get Recommendations"}
            sx={{ alignSelf: "flex-end", minWidth: 140 }}
          />
        </Stack>
      </Box>

      {/* Recommendation results */}
      {recommendMutation.data && recommendMutation.data.length > 0 && (
        <Stack gap="16px">
          <Typography sx={{ fontSize: 14, fontWeight: 600 }}>Recommended Scenarios</Typography>
          <Stack gap="8px">
            {recommendMutation.data.map((result) => (
              <ScenarioCard
                key={result.scenario.id}
                scenario={result.scenario}
                score={result.score}
                matchedRules={result.matchedRules}
                isSelected={selectedScenarioId === result.scenario.id}
                onSelect={handleSelectScenario}
                onActivate={handleActivateClick}
              />
            ))}
          </Stack>
        </Stack>
      )}

      {recommendMutation.data && recommendMutation.data.length === 0 && (
        <Alert severity="info">
          No strong matches found. Try adjusting your criteria or browse the scenarios below.
        </Alert>
      )}

      <WhatIfSimulator
        scenarios={scenarios || []}
        result={simulateScenarioMutation.data || null}
        isSimulating={simulateScenarioMutation.isPending}
        error={simulateScenarioMutation.error}
        onSimulate={(body) => simulateScenarioMutation.mutate(body)}
      />

      <ScenarioComparison
        scenarios={scenarios || []}
        selectedIds={compareSelectedIds}
        onChangeSelectedIds={setCompareSelectedIds}
      />

      <Divider />

      {/* All scenarios */}
      <Stack gap="16px">
        <Stack direction="row" justifyContent="space-between" alignItems="center">
          <Typography sx={{ fontSize: 14, fontWeight: 600 }}>All Governance Scenarios</Typography>
          <CustomizableButton
            variant="outlined"
            size="small"
            startIcon={<Plus size={14} />}
            onClick={handleCreateScenario}
            text="New Scenario"
          />
        </Stack>

        {scenariosLoading ? (
          <Stack alignItems="center" sx={{ py: "48px" }}>
            <CircularProgress size={32} />
          </Stack>
        ) : !scenarios || scenarios.length === 0 ? (
          <EmptyState message="No governance scenarios available." icon={Compass} showBorder />
        ) : (
          <Stack gap="8px">
            {scenarios.map((scenario) => (
              <ScenarioCard
                key={scenario.id}
                scenario={scenario}
                isSelected={selectedScenarioId === scenario.id}
                onSelect={handleSelectScenario}
                onEdit={handleEditScenario}
                onDelete={handleDeleteScenario}
                onActivate={handleActivateClick}
              />
            ))}
          </Stack>
        )}
      </Stack>
      <ScenarioFormModal
        open={formModalOpen}
        scenario={editingScenario}
        onClose={() => setFormModalOpen(false)}
        onSubmit={handleFormSubmit}
        isSubmitting={createScenarioMutation.isPending || updateScenarioMutation.isPending}
      />

      <ConfirmationModal
        isOpen={deleteConfirmOpen}
        onCancel={() => setDeleteConfirmOpen(false)}
        onProceed={confirmDelete}
        title="Delete Scenario"
        body={`Are you sure you want to delete "${scenarioToDelete?.name}"? This action cannot be undone.`}
        proceedText="Delete"
        cancelText="Cancel"
        proceedButtonVariant="contained"
        proceedButtonColor="error"
        isLoading={deleteScenarioMutation.isPending}
      />

      <ActivationWizard
        open={activationWizardOpen}
        scenario={activatingScenario}
        projects={approvedProjects || []}
        users={users || []}
        isLoading={activateScenarioMutation.isPending || projectsLoading || usersLoading}
        onClose={() => {
          setActivationWizardOpen(false);
          setActivatingScenario(null);
        }}
        onActivate={handleActivate}
      />
    </Stack>
  );
};

export default ScenarioBuilder;
