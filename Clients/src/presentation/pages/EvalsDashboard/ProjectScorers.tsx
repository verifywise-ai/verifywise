import { useEffect, useMemo, useState, useCallback } from "react";
import {
  Box,
  Stack,
} from "@mui/material";
import { CustomizableButton } from "../../components/button/customizable-button";
import { Plus } from "lucide-react";
import SearchBox from "../../components/Search/SearchBox";
import { FilterBy, type FilterColumn } from "../../components/Table/FilterBy";
import { GroupBy } from "../../components/Table/GroupBy";
import { useFilterBy } from "../../../application/hooks/useFilterBy";
import {
  listScorers,
  createScorer,
  updateScorer,
  deleteScorer,
  type DeepEvalScorer,
} from "../../../application/repository/deepEval.repository";
import Alert from "../../components/Alert";
import StandardModal from "../../components/Modals/StandardModal";
import CreateScorerModal, { type ScorerConfig } from "./CreateScorerModal";
import ScorersTable, { type ScorerRow } from "../../components/Table/ScorersTable";
import { PageHeader } from "../../components/Layout/PageHeader";
import HelperIcon from "../../components/HelperIcon";
import TipBox from "../../components/TipBox";
import { useAuth } from "../../../application/hooks/useAuth";
import allowedRoles from "../../../application/constants/permissions";
import { palette } from "../../themes/palette";

export interface ProjectScorersProps {
  projectId: string;
  orgId?: string | null;
}

interface AlertState {
  variant: "success" | "error";
  body: string;
}

export default function ProjectScorers({ projectId, orgId }: ProjectScorersProps) {
  const [scorers, setScorers] = useState<DeepEvalScorer[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [alert, setAlert] = useState<AlertState | null>(null);

  // RBAC permissions
  const { userRoleName } = useAuth();
  const canCreateScorer = allowedRoles.evals.createScorer.includes(userRoleName);
  const canEditScorer = allowedRoles.evals.editScorer.includes(userRoleName);
  const canDeleteScorer = allowedRoles.evals.deleteScorer.includes(userRoleName);

  // Edit modal state - using comprehensive CreateScorerModal
  const [editScorerModalOpen, setEditScorerModalOpen] = useState(false);
  const [editingScorer, setEditingScorer] = useState<DeepEvalScorer | null>(null);
  const [editInitialConfig, setEditInitialConfig] = useState<Partial<ScorerConfig> | undefined>(undefined);

  // Delete confirmation modal state
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [scorerToDelete, setScorerToDelete] = useState<DeepEvalScorer | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // New comprehensive create scorer modal
  const [createScorerModalOpen, setCreateScorerModalOpen] = useState(false);

  const loadScorers = useCallback(async () => {
    try {
      setLoading(true);
      const res = await listScorers({ org_id: orgId || undefined });
      setScorers(res.scorers || []);
    } catch (err) {
      console.error("Failed to load scorers", err);
      setAlert({ variant: "error", body: "Failed to load scorers" });
      setTimeout(() => setAlert(null), 4000);
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  useEffect(() => {
    if (!projectId && !orgId) return;
    void loadScorers();
  }, [projectId, orgId, loadScorers]);

  const filterColumns: FilterColumn[] = useMemo(
    () => [
      { id: "name", label: "Scorer name", type: "text" },
      { id: "metricKey", label: "Metric key", type: "text" },
      {
        id: "type",
        label: "Type",
        type: "select",
        options: [
          { value: "llm", label: "LLM" },
          { value: "builtin", label: "Builtin" },
          { value: "custom", label: "Custom" },
        ],
      },
    ],
    []
  );

  const getFieldValue = useCallback(
    (
      s: DeepEvalScorer,
      fieldId: string
    ): string | number | Date | null | undefined => {
      switch (fieldId) {
        case "name":
          return s.name;
        case "metricKey":
          return s.metricKey;
        case "type":
          return s.type;
        default:
          return "";
      }
    },
    []
  );

  const { filterData, handleFilterChange } =
    useFilterBy<DeepEvalScorer>(getFieldValue);

  const filteredScorers = useMemo(() => {
    const afterFilter = filterData(scorers);
    if (!searchTerm.trim()) return afterFilter;
    const q = searchTerm.toLowerCase();
    return afterFilter.filter((s) =>
      [s.name, s.metricKey, s.type]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(q)
    );
  }, [scorers, filterData, searchTerm]);

  // Convert DeepEvalScorer to ScorerRow for the table
  const scorerRows: ScorerRow[] = useMemo(() => {
    return filteredScorers.map((scorer) => ({
      id: scorer.id,
      name: scorer.name,
      type: scorer.type,
      metricKey: scorer.metricKey,
      enabled: scorer.enabled,
      defaultThreshold: scorer.defaultThreshold,
      config: scorer.config,
      createdAt: scorer.createdAt,
      updatedAt: scorer.updatedAt,
    }));
  }, [filteredScorers]);

  // Helper to open edit modal for a scorer
  const openEditModal = useCallback((scorer: DeepEvalScorer) => {
    try {
      const scorerConfig = typeof scorer.config === 'object' && scorer.config !== null ? scorer.config : {};
      
      // Convert scorer to ScorerConfig format for the comprehensive modal
      const judgeModel = scorerConfig.judgeModel;
      const provider = typeof judgeModel === 'object' ? judgeModel?.provider : scorerConfig.provider || "openai";
      const model = typeof judgeModel === 'object' ? judgeModel?.name : (typeof judgeModel === 'string' ? judgeModel : scorerConfig.model || "");
      const modelParams = typeof judgeModel === 'object' && judgeModel?.params ? {
        temperature: judgeModel.params.temperature ?? 0,
        maxTokens: judgeModel.params.max_tokens ?? 256,
        topP: judgeModel.params.top_p ?? 1,
      } : scorerConfig.modelParams || { temperature: 0, maxTokens: 256, topP: 1 };
      const endpointUrl = typeof judgeModel === 'object' ? judgeModel?.endpointUrl : undefined;
      const apiKey = typeof judgeModel === 'object' ? judgeModel?.apiKey : undefined;

      setEditInitialConfig({
        name: scorer.name || "",
        slug: scorer.metricKey || "",
        provider: provider || "",
        model: model || "",
        modelParams,
        messages: scorerConfig.messages || [
          {
            role: "system",
            content: "You are an AI evaluator. Assess the quality of the AI response based on accuracy and relevance to the input.",
          },
          {
            role: "user",
            content: "Input: {{input}}\n\nAI Response: {{output}}\n\nExpected Answer: {{expected}}\n\nEvaluate whether the AI response is satisfactory. Reply with JSON only, in this exact format: {\"verdict\": \"PASS\", \"reason\": \"brief explanation\"}",
          },
        ],
        useChainOfThought: scorerConfig.useChainOfThought ?? true,
        choiceScores: scorerConfig.choiceScores || [{ label: "", score: 0 }],
        passThreshold: scorer.defaultThreshold ?? 0.5,
        endpointUrl: endpointUrl || "",
        apiKey: apiKey || "",
        inputSchema: scorerConfig.inputSchema || `{
          "input": "",
          "output": "",
          "expected": "",
          "metadata": {}
        }`,
      });
      
      setEditingScorer(scorer);
      setEditScorerModalOpen(true);
    } catch (err) {
      console.error("Error opening scorer edit modal:", err);
      setAlert({ variant: "error", body: "Failed to open scorer for editing" });
      setTimeout(() => setAlert(null), 4000);
    }
  }, []);

  // Row click handler - opens edit modal
  const handleRowClick = useCallback((row: ScorerRow) => {
    const scorer = scorers.find((s) => s.id === row.id);
    if (scorer) {
      openEditModal(scorer);
    }
  }, [scorers, openEditModal]);

  // Edit handler from menu
  const handleEdit = useCallback((row: ScorerRow) => {
    const scorer = scorers.find((s) => s.id === row.id);
    if (scorer) {
      openEditModal(scorer);
    }
  }, [scorers, openEditModal]);

  // Delete handler from menu
  const handleDelete = useCallback((row: ScorerRow) => {
    const scorer = scorers.find((s) => s.id === row.id);
    if (scorer) {
      setScorerToDelete(scorer);
      setDeleteModalOpen(true);
    }
  }, [scorers]);

  const handleConfirmDelete = async () => {
    if (!scorerToDelete) return;
    setIsDeleting(true);
    try {
      await deleteScorer(scorerToDelete.id);
      setAlert({ variant: "success", body: "Scorer deleted" });
      setTimeout(() => setAlert(null), 3000);
      setDeleteModalOpen(false);
      setScorerToDelete(null);
      void loadScorers();
    } catch (err) {
      console.error("Failed to delete scorer", err);
      setAlert({ variant: "error", body: "Failed to delete scorer" });
      setTimeout(() => setAlert(null), 4000);
    } finally {
      setIsDeleting(false);
    }
  };

  // Edit scorer submit (using comprehensive modal)
  const handleEditScorerSubmit = async (config: ScorerConfig) => {
    if (!editingScorer) return;
    try {
      await updateScorer(editingScorer.id, {
        name: config.name,
        description: `LLM scorer using ${config.provider}/${config.model}`,
        metricKey: config.slug,
        type: "llm",
        enabled: true,
        defaultThreshold: config.passThreshold,
        weight: 1.0,
        config: {
          provider: config.provider,
          judgeModel: {
            name: config.model,
            provider: config.provider,
            params: {
              temperature: config.modelParams.temperature,
              max_tokens: config.modelParams.maxTokens,
              top_p: config.modelParams.topP,
            },
            ...(config.provider === "self-hosted" && config.endpointUrl
              ? { endpointUrl: config.endpointUrl } : {}),
            ...(config.provider === "self-hosted" && config.apiKey
              ? { apiKey: config.apiKey } : {}),
          },
          messages: config.messages,
          useChainOfThought: config.useChainOfThought,
          choiceScores: config.choiceScores,
          inputSchema: config.inputSchema,
          modelParams: config.modelParams,
        },
      });
      setAlert({ variant: "success", body: "Scorer updated successfully" });
      setTimeout(() => setAlert(null), 3000);
      setEditScorerModalOpen(false);
      setEditingScorer(null);
      setEditInitialConfig(undefined);
      void loadScorers();
    } catch (err) {
      console.error("Failed to update scorer", err);
      setAlert({ variant: "error", body: "Failed to update scorer" });
      setTimeout(() => setAlert(null), 4000);
      throw err; // Re-throw so modal knows it failed
    }
  };

  // Create scorer - opens the comprehensive modal
  const handleCreateScorer = () => {
    setCreateScorerModalOpen(true);
  };

  // Handle submit from the new comprehensive scorer modal
  const handleNewScorerSubmit = async (config: ScorerConfig) => {
    try {
      await createScorer({
        orgId: orgId || undefined,
        name: config.name,
        description: `LLM scorer using ${config.provider}/${config.model}`,
        metricKey: config.slug,
        type: "llm",
        enabled: true,
        defaultThreshold: config.passThreshold,
        weight: 1.0,
        config: {
          provider: config.provider,
          judgeModel: {
            provider: config.provider,
            name: config.model,
            params: {
              temperature: config.modelParams.temperature,
              max_tokens: config.modelParams.maxTokens,
              top_p: config.modelParams.topP,
            },
            ...(config.provider === "self-hosted" && config.endpointUrl
              ? { endpointUrl: config.endpointUrl } : {}),
            ...(config.provider === "self-hosted" && config.apiKey
              ? { apiKey: config.apiKey } : {}),
          },
          messages: config.messages,
          useChainOfThought: config.useChainOfThought,
          choiceScores: config.choiceScores,
          inputSchema: config.inputSchema,
        },
      });
      setAlert({ variant: "success", body: "Scorer created successfully" });
      setTimeout(() => setAlert(null), 3000);
      setCreateScorerModalOpen(false);
      void loadScorers();
    } catch (err) {
      console.error("Failed to create scorer", err);
      setAlert({ variant: "error", body: "Failed to create scorer" });
      setTimeout(() => setAlert(null), 4000);
      throw err; // Re-throw so the modal knows it failed
    }
  };

  return (
    <Stack sx={{ width: "100%" }}>
      {alert && <Alert variant={alert.variant} body={alert.body} />}

      <PageHeader
        title="Scorers"
        description="Define custom LLM judges to evaluate model outputs using your own domain-specific criteria and prompts."
        rightContent={<HelperIcon articlePath="llm-evals/configuring-scorers" />}
      />
      <Box sx={{ mt: "18px" }}>
        <TipBox entityName="evals-scorers" />
      </Box>

      {/* Controls row */}
      <Stack
        direction="row"
        justifyContent="space-between"
        alignItems="center"
        sx={{ marginBottom: "18px" }}
        gap={2}
      >
        <Stack direction="row" alignItems="center" gap={2}>
          <FilterBy columns={filterColumns} onFilterChange={handleFilterChange} />
          <GroupBy
            options={[
              { id: "type", label: "Type" },
              { id: "metricKey", label: "Metric key" },
            ]}
            onGroupChange={() => {}}
          />
          <SearchBox
            placeholder="Search scorers..."
            value={searchTerm}
            onChange={setSearchTerm}
            inputProps={{ "aria-label": "Search scorers" }}
            fullWidth={false}
          />
        </Stack>
        <CustomizableButton
          variant="contained"
          text="New scorer"
          icon={<Plus size={16} />}
          sx={{
            backgroundColor: palette.brand.primary,
            border: `1px solid ${palette.brand.primary}`,
            gap: 2,
          }}
          onClick={handleCreateScorer}
          isDisabled={loading || !canCreateScorer}
        />
      </Stack>

      {/* Scorers table */}
      <Box mb={4}>
        <ScorersTable
          rows={scorerRows}
          onRowClick={canEditScorer ? handleRowClick : undefined}
          onEdit={canEditScorer ? handleEdit : undefined}
          onDelete={canDeleteScorer ? handleDelete : undefined}
          loading={loading}
        />
      </Box>

      {/* Edit Scorer Modal - uses comprehensive CreateScorerModal */}
      <CreateScorerModal
        isOpen={editScorerModalOpen}
        onClose={() => {
          setEditScorerModalOpen(false);
          setEditingScorer(null);
          setEditInitialConfig(undefined);
        }}
        onSubmit={handleEditScorerSubmit}
        initialConfig={editInitialConfig}
        projectId={projectId}
      />

      {/* Delete Confirmation Modal */}
      <StandardModal
        isOpen={deleteModalOpen}
        onClose={() => {
          setDeleteModalOpen(false);
          setScorerToDelete(null);
        }}
        title="Delete scorer"
        description={`Are you sure you want to delete "${scorerToDelete?.name || "this scorer"}"? This action cannot be undone.`}
        onSubmit={handleConfirmDelete}
        submitButtonText="Delete"
        isSubmitting={isDeleting}
        submitButtonColor={palette.status.error.text}
      />

      {/* New Comprehensive Scorer Modal */}
      <CreateScorerModal
        isOpen={createScorerModalOpen}
        onClose={() => setCreateScorerModalOpen(false)}
        onSubmit={handleNewScorerSubmit}
        projectId={projectId}
      />
    </Stack>
  );
}
