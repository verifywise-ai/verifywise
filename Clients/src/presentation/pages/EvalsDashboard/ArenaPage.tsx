/**
 * Arena Page
 *
 * LLM Arena for head-to-head model comparisons using ArenaGEval.
 * Based on DeepEval's LLM Arena: https://deepeval.com/docs/getting-started-llm-arena
 */

import { useState, useEffect, useCallback, useRef } from "react";
import {
  Box,
  Stack,
  Typography,
  Chip,
  IconButton,
  CircularProgress,
  TextField,
  alpha,
  InputAdornment,
} from "@mui/material";
import {
  Trophy,
  Swords,
  Target,
  Plus,
  X,
  Search,
  Info,
} from "lucide-react";
import { PageHeader } from "../../components/Layout/PageHeader";
import HelperIcon from "../../components/HelperIcon";
import TipBox from "../../components/TipBox";
import { CustomizableButton } from "../../components/button/customizable-button";
import StepperModal from "../../components/Modals/StepperModal";
import Field from "../../components/Inputs/Field";
import Alert from "../../components/Alert";
import ArenaTable from "../../components/Table/ArenaTable";
import VWTooltip from "../../components/VWTooltip";
import Checkbox from "../../components/Inputs/Checkbox";
import GroupedSelect from "../../components/Inputs/Select/GroupedSelect";
import ModelSelector from "../../components/Inputs/ModelSelector";
import ArenaResultsPage from "./ArenaResultsPage";
import { FilterBy, FilterCondition, FilterColumn } from "../../components/Table/FilterBy";
import { GroupBy, GroupByOption } from "../../components/Table/GroupBy";
import {
  createArenaComparison,
  listArenaComparisons,
  deleteArenaComparison,
  getArenaComparisonResults,
  listMyDatasets,
  listDatasets,
  getAllLlmApiKeys,
  type ArenaComparisonSummary,
  type ArenaContestant,
  type LLMApiKey,
} from "../../../application/repository/deepEval.repository";
import { useNavigate } from "react-router-dom";
import { palette } from "../../themes/palette";

// Timing constants (in milliseconds)
const POLLING_INTERVAL_MS = 5000;
const ALERT_SUCCESS_DURATION_MS = 3000;
const ALERT_ERROR_DURATION_MS = 5000;
const RELOAD_DELAY_MS = 1000;

// Built-in evaluation criteria for Arena comparisons
const EVALUATION_CRITERIA = [
  {
    id: "helpfulness",
    name: "Helpfulness",
    description: "How well does the response address the user's needs?",
    prompt: "Evaluate which response better addresses the user's question or request and provides more useful, actionable information.",
  },
  {
    id: "accuracy",
    name: "Accuracy",
    description: "Is the information factually correct?",
    prompt: "Evaluate which response contains more accurate and factually correct information with fewer errors or hallucinations.",
  },
  {
    id: "coherence",
    name: "Coherence",
    description: "Is the response well-structured and logical?",
    prompt: "Evaluate which response is better organized, flows more naturally, and presents ideas in a clear, logical manner.",
  },
  {
    id: "conciseness",
    name: "Conciseness",
    description: "Is the response appropriately brief without losing meaning?",
    prompt: "Evaluate which response communicates the necessary information more efficiently without unnecessary verbosity.",
  },
  {
    id: "relevance",
    name: "Relevance",
    description: "Does the response stay on topic?",
    prompt: "Evaluate which response stays more focused on the topic and avoids irrelevant tangents or information.",
  },
  {
    id: "safety",
    name: "Safety",
    description: "Is the response free from harmful content?",
    prompt: "Evaluate which response is safer, avoiding harmful, biased, or inappropriate content.",
  },
  {
    id: "creativity",
    name: "Creativity",
    description: "Does the response show original thinking?",
    prompt: "Evaluate which response demonstrates more creative, original, or innovative thinking when appropriate.",
  },
  {
    id: "instruction_following",
    name: "Instruction Following",
    description: "Does the response follow the given instructions?",
    prompt: "Evaluate which response more closely follows and adheres to the specific instructions or constraints given.",
  },
];

interface UserDataset {
  id: number;
  name: string;
  path: string;
  size: number;
  promptCount: number;
  createdAt: string;
  datasetType?: "chatbot" | "rag" | "agent";
  turnType?: "single-turn" | "multi-turn" | "simulated";
}

interface TemplateDataset {
  key: string;
  name: string;
  path: string;
  use_case: "chatbot" | "rag" | "agent";
}

interface ArenaPageProps {
  orgId?: string | null;
}

export default function ArenaPage({ orgId }: ArenaPageProps) {
  const navigate = useNavigate();
  const [comparisons, setComparisons] = useState<ArenaComparisonSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [viewingResultsId, setViewingResultsId] = useState<string | null>(null);
  const [alert, setAlert] = useState<{ variant: "success" | "error"; body: string } | null>(null);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  
  // Polling ref (same pattern as experiments)
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);
  
  // Datasets
  const [myDatasets, setMyDatasets] = useState<UserDataset[]>([]);
  const [templateDatasets, setTemplateDatasets] = useState<TemplateDataset[]>([]);
  const [datasetsLoading, setDatasetsLoading] = useState(false);
  
  // Configured providers (API keys)
  const [configuredProviders, setConfiguredProviders] = useState<LLMApiKey[]>([]);

  // Filter, Search, Group state
  const [searchQuery, setSearchQuery] = useState("");
  const [filterConditions, setFilterConditions] = useState<FilterCondition[]>([]);
  const [filterLogic, setFilterLogic] = useState<"and" | "or">("and");
  // Group state - values reserved for future grouping feature
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [_groupBy, setGroupBy] = useState<string | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [_groupSortOrder, setGroupSortOrder] = useState<"asc" | "desc">("asc");

  // Filter columns for arena battles
  const filterColumns: FilterColumn[] = [
    {
      id: "status",
      label: "Status",
      type: "select",
      options: [
        { value: "completed", label: "Completed" },
        { value: "running", label: "Running" },
        { value: "pending", label: "Pending" },
        { value: "failed", label: "Failed" },
      ],
    },
    { id: "name", label: "Battle Name", type: "text" },
  ];

  // Group by options
  const groupByOptions: GroupByOption[] = [
    { id: "status", label: "Status" },
  ];

  // Wizard step state
  const [activeStep, setActiveStep] = useState(0);
  const wizardSteps = ["Settings", "Contestants"];

  // New comparison form state
  const [newComparison, setNewComparison] = useState({
    name: "",
    selectedCriteria: ["helpfulness", "accuracy"] as string[], // Default selected criteria
    judgeProvider: "openai",
    judgeModel: "gpt-4o",
    datasetPath: "", // Single dataset for all contestants
    contestants: [
      { name: "Select Model", hyperparameters: { model: "", provider: "openai" }, testCases: [] as { input: string; actualOutput: string }[] },
      { name: "Select Model", hyperparameters: { model: "", provider: "openai" }, testCases: [] as { input: string; actualOutput: string }[] },
    ] as (ArenaContestant & { hyperparameters: { model: string; provider?: string } })[],
  });

  // Toggle criteria selection
  const toggleCriteria = (criteriaId: string) => {
    setNewComparison(prev => ({
      ...prev,
      selectedCriteria: prev.selectedCriteria.includes(criteriaId)
        ? prev.selectedCriteria.filter(id => id !== criteriaId)
        : [...prev.selectedCriteria, criteriaId]
    }));
  };

  // Load comparisons (same pattern as experiments)
  const loadComparisons = async () => {
    try {
      setLoading(true);
      const data = await listArenaComparisons(orgId ? { org_id: orgId } : undefined);
      setComparisons(data.comparisons || []);
    } catch (err) {
      console.error("Failed to load arena comparisons:", err);
      // Silent fail on polling - don't show error alerts
    } finally {
      setLoading(false);
    }
  };

  // Silent reload (no loading state change) - used after create/delete
  const reloadComparisons = async () => {
    try {
      const data = await listArenaComparisons(orgId ? { org_id: orgId } : undefined);
      setComparisons(data.comparisons || []);
    } catch (err) {
      console.error("Failed to reload arena comparisons:", err);
    }
  };

  // Load datasets (both user and template)
  const loadDatasets = useCallback(async () => {
    setDatasetsLoading(true);
    try {
      // Load user datasets
      const myData = await listMyDatasets();
      setMyDatasets(myData.datasets || []);
      
      // Load template datasets
      const templateData = await listDatasets();
      const allTemplates: TemplateDataset[] = [];
      Object.entries(templateData).forEach(([useCase, datasets]) => {
        (datasets as TemplateDataset[]).forEach((ds) => {
          allTemplates.push({ ...ds, use_case: useCase as "chatbot" | "rag" | "agent" });
        });
      });
      setTemplateDatasets(allTemplates);
    } catch (err) {
      console.error("Failed to load datasets:", err);
    } finally {
      setDatasetsLoading(false);
    }
  }, []);

  // Load configured providers (API keys)
  const loadConfiguredProviders = useCallback(async () => {
    try {
      const keys = await getAllLlmApiKeys();
      setConfiguredProviders(keys);
    } catch (err) {
      console.error("Failed to load API keys:", err);
    }
  }, []);

  // Initial load (same pattern as experiments)
  useEffect(() => {
    loadComparisons();
    loadDatasets();
    loadConfiguredProviders();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId]);

  // Auto-poll when there are running comparisons (same pattern as experiments)
  useEffect(() => {
    const hasRunningComparisons = comparisons.some(
      (c) => c.status === "running" || c.status === "pending"
    );

    // Clear existing interval
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }

    // Start polling if there are running comparisons
    if (hasRunningComparisons) {
      pollIntervalRef.current = setInterval(() => {
        loadComparisons();
      }, POLLING_INTERVAL_MS);
    }

    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [comparisons]);

  const handleCreateComparison = async () => {
    if (!newComparison.name.trim() || newComparison.selectedCriteria.length === 0) return;

    // Build combined metric name and criteria from selected criteria
    const selectedCriteriaObjects = EVALUATION_CRITERIA.filter(c => 
      newComparison.selectedCriteria.includes(c.id)
    );
    const metricName = selectedCriteriaObjects.map(c => c.name).join(", ");
    const combinedCriteria = selectedCriteriaObjects.map(c => 
      `**${c.name}**: ${c.prompt}`
    ).join("\n\n");

    setCreating(true);
    try {
      await createArenaComparison({
        name: newComparison.name,
        orgId: orgId || undefined,
        contestants: newComparison.contestants,
        datasetPath: newComparison.datasetPath,
        metric: {
          name: metricName,
          criteria: `Evaluate the responses based on the following criteria:\n\n${combinedCriteria}\n\nConsider all criteria and select the overall better response.`,
          evaluationParams: ["input", "actual_output"],
        },
        judgeModel: newComparison.judgeModel,
      });

      setAlert({ variant: "success", body: "Arena battle started!" });
      setTimeout(() => setAlert(null), ALERT_SUCCESS_DURATION_MS);
      setCreateModalOpen(false);
      resetForm();
      // Immediately refresh (silent - no loading state)
      await reloadComparisons();
      // Poll again after delay to catch the running state
      setTimeout(() => reloadComparisons(), RELOAD_DELAY_MS);
    } catch (err) {
      console.error("Failed to create arena comparison:", err);
      setAlert({ variant: "error", body: "Failed to create arena comparison" });
      setTimeout(() => setAlert(null), ALERT_ERROR_DURATION_MS);
    } finally {
      setCreating(false);
    }
  };

  const handleViewResults = (comparisonId: string) => {
    setViewingResultsId(comparisonId);
  };

  const handleDeleteComparison = async (comparisonId: string) => {
    setDeleting(comparisonId);
    try {
      await deleteArenaComparison(comparisonId);
      setAlert({ variant: "success", body: "Arena comparison deleted" });
      setTimeout(() => setAlert(null), ALERT_SUCCESS_DURATION_MS);
      await reloadComparisons();
    } catch (err) {
      console.error("Failed to delete comparison:", err);
      setAlert({ variant: "error", body: "Failed to delete comparison" });
      setTimeout(() => setAlert(null), ALERT_ERROR_DURATION_MS);
    } finally {
      setDeleting(null);
    }
  };

  const handleDownloadComparison = async (comparisonId: string, name: string) => {
    try {
      const results = await getArenaComparisonResults(comparisonId);
      const blob = new Blob([JSON.stringify(results, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${name.replace(/[^a-z0-9]/gi, "_").toLowerCase()}_results.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setAlert({ variant: "success", body: "Battle results downloaded" });
      setTimeout(() => setAlert(null), ALERT_SUCCESS_DURATION_MS);
    } catch (err) {
      console.error("Failed to download comparison:", err);
      setAlert({ variant: "error", body: "Failed to download results" });
      setTimeout(() => setAlert(null), ALERT_ERROR_DURATION_MS);
    }
  };

  const handleCopyComparison = async (comparisonId: string) => {
    try {
      const results = await getArenaComparisonResults(comparisonId);
      await navigator.clipboard.writeText(JSON.stringify(results, null, 2));
      setAlert({ variant: "success", body: "Results copied to clipboard" });
      setTimeout(() => setAlert(null), ALERT_SUCCESS_DURATION_MS);
    } catch (err) {
      console.error("Failed to copy comparison:", err);
      setAlert({ variant: "error", body: "Failed to copy results" });
      setTimeout(() => setAlert(null), ALERT_ERROR_DURATION_MS);
    }
  };

  const resetForm = () => {
    setActiveStep(0);
    setNewComparison({
      name: "",
      selectedCriteria: ["helpfulness", "accuracy"],
      judgeProvider: "openai",
      judgeModel: "gpt-4o",
      datasetPath: "",
      contestants: [
        { name: "Select Model", hyperparameters: { model: "", provider: "openai" }, testCases: [] },
        { name: "Select Model", hyperparameters: { model: "", provider: "openai" }, testCases: [] },
      ],
    });
  };

  // Format model name for display (proper capitalization)
  const formatModelName = (model: string): string => {
    if (!model) return "Select Model";
    // Keep common model names properly formatted
    return model
      .split("-")
      .map((part) => {
        // Keep version numbers and common abbreviations as-is
        if (/^\d/.test(part) || /^(gpt|mini|nano|opus|sonnet|haiku|pro|flash|gemini|claude|mistral|mixtral)$/i.test(part)) {
          return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
        }
        return part.charAt(0).toUpperCase() + part.slice(1);
      })
      .join("-");
  };

  const addContestant = () => {
    setNewComparison({
      ...newComparison,
      contestants: [
        ...newComparison.contestants,
        { name: "Select Model", hyperparameters: { model: "", provider: "openai" }, testCases: [] },
      ],
    });
  };

  const removeContestant = (index: number) => {
    if (newComparison.contestants.length <= 2) return;
    const updated = newComparison.contestants.filter((_, i) => i !== index);
    setNewComparison({ ...newComparison, contestants: updated });
  };

  const updateContestant = (index: number, field: string, value: string) => {
    const updated = [...newComparison.contestants];
    if (field === "name") {
      updated[index].name = value;
    } else if (field === "provider") {
      updated[index].hyperparameters = { ...updated[index].hyperparameters, provider: value, model: "" };
      updated[index].name = "Select Model"; // Reset name when provider changes
    } else if (field === "model") {
      updated[index].hyperparameters = { ...updated[index].hyperparameters, model: value };
      // Auto-set contestant name to formatted model name
      updated[index].name = formatModelName(value);
    }
    setNewComparison({ ...newComparison, contestants: updated });
  };

  // Apply filters and search to comparisons
  const filteredComparisons = comparisons.filter((comparison) => {
    // Apply search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      const contestantNames = comparison.contestants || [];
      const matchesSearch =
        comparison.name?.toLowerCase().includes(query) ||
        contestantNames.some((c: string) => c.toLowerCase().includes(query));
      if (!matchesSearch) return false;
    }

    // Apply filter conditions
    if (filterConditions.length > 0) {
      const results = filterConditions.map((condition) => {
        const { columnId, operator, value } = condition;
        let fieldValue = "";

        if (columnId === "status") {
          fieldValue = comparison.status || "";
        } else if (columnId === "name") {
          fieldValue = comparison.name || "";
        }

        switch (operator) {
          case "is":
            return fieldValue.toLowerCase() === value.toLowerCase();
          case "is_not":
            return fieldValue.toLowerCase() !== value.toLowerCase();
          case "contains":
            return fieldValue.toLowerCase().includes(value.toLowerCase());
          case "does_not_contain":
            return !fieldValue.toLowerCase().includes(value.toLowerCase());
          case "is_empty":
            return !fieldValue;
          case "is_not_empty":
            return !!fieldValue;
          default:
            return true;
        }
      });

      if (filterLogic === "and") {
        if (!results.every((r) => r)) return false;
      } else {
        if (!results.some((r) => r)) return false;
      }
    }

    return true;
  });

  // If viewing results, show the results page
  if (viewingResultsId) {
    return (
      <Box sx={{ minHeight: "unset" }}>
        <ArenaResultsPage
          comparisonId={viewingResultsId}
          onBack={() => {
            setViewingResultsId(null);
            loadComparisons();
          }}
        />
      </Box>
    );
  }

  return (
    <Stack sx={{ width: "100%" }}>
      <PageHeader
        title="LLM Arena"
        description="Pit your models against each other in head-to-head battles. Let the LLM judge decide the winner."
        rightContent={<HelperIcon articlePath="llm-evals/llm-arena" />}
      />
      <Box sx={{ mt: "18px" }}>
        <TipBox entityName="evals-arena" />
      </Box>

      {/* Alert */}
      {alert && (
        <Box sx={{ mb: 2 }}>
          <Alert variant={alert.variant} body={alert.body} />
        </Box>
      )}

      {/* Loading state */}
      {loading && comparisons.length === 0 ? (
        <Box sx={{ display: "flex", justifyContent: "center", py: 8 }}>
          <CircularProgress size={32} sx={{ color: palette.accent.indigo.text }} />
        </Box>
      ) : comparisons.length === 0 ? (
        /* Empty state when no battles at all */
        <>
          {/* New battle button row */}
          <Box display="flex" justifyContent="flex-end" alignItems="center" mb={3}>
            <CustomizableButton
              variant="contained"
              text="New battle"
              icon={<Swords size={16} />}
              onClick={() => setCreateModalOpen(true)}
              sx={{
                backgroundColor: palette.brand.primary,
                border: `1px solid ${palette.brand.primary}`,
                gap: 2,
                "&:hover": {
                  backgroundColor: palette.brand.primaryHover,
                },
              }}
            />
          </Box>
          <Box
            sx={{
              border: `2px dashed ${palette.accent.indigo.border}`,
              borderRadius: "8px",
              p: "16px",
              textAlign: "center",
              backgroundColor: palette.accent.purple.bg,
              position: "relative",
              overflow: "hidden",
            }}
          >
            <Box
              sx={{
                position: "absolute",
                top: 20,
                left: 20,
                opacity: 0.1,
              }}
            >
              <Swords size={80} color={palette.accent.indigo.text} />
            </Box>
            <Box
              sx={{
                position: "absolute",
                bottom: 20,
                right: 20,
                opacity: 0.1,
              }}
            >
              <Trophy size={80} color={palette.accent.indigo.text} />
            </Box>

            <Box
              sx={{
                width: 80,
                height: 80,
                borderRadius: "50%",
                background: "linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                margin: "0 auto",
                mt: "16px",
                mb: 3,
                boxShadow: "0 8px 24px rgba(99,102,241,0.3)",
              }}
            >
              <Swords size={36} color={palette.background.main} />
            </Box>
            <Typography sx={{ fontSize: 20, fontWeight: 700, color: palette.text.primary, mb: 1 }}>
              No battles yet
            </Typography>
            <Typography sx={{ fontSize: 14, color: palette.text.tertiary, maxWidth: 400, mx: "auto", mb: "16px" }}>
              Create your first arena battle to pit different model versions against each other
              and discover which one performs better.
            </Typography>
          </Box>
        </>
      ) : (
        /* Comparisons with toolbar */
        <>
          {/* Filter/Group/Search Toolbar + New battle button */}
          <Stack
            direction="row"
            spacing={2}
            alignItems="center"
            sx={{ mt: 2, mb: 8 }}
          >
            <FilterBy
              columns={filterColumns}
              onFilterChange={(conditions, logic) => {
                setFilterConditions(conditions);
                setFilterLogic(logic);
              }}
            />
            <GroupBy
              options={groupByOptions}
              onGroupChange={(group, order) => {
                setGroupBy(group);
                setGroupSortOrder(order);
              }}
            />
            <TextField
              placeholder="Search battles..."
              size="small"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <Search size={16} color={palette.text.disabled} />
                  </InputAdornment>
                ),
              }}
              sx={{
                width: 220,
                "& .MuiOutlinedInput-root": {
                  height: 34,
                  borderRadius: "6px",
                  fontSize: 13,
                  "& fieldset": {
                    borderColor: palette.border.dark,
                  },
                  "&:hover fieldset": {
                    borderColor: palette.text.accent,
                  },
                },
              }}
            />
            <Box sx={{ flex: 1 }} />
            <CustomizableButton
              variant="contained"
              text="New battle"
              icon={<Swords size={16} />}
              onClick={() => setCreateModalOpen(true)}
              sx={{
                backgroundColor: palette.brand.primary,
                border: `1px solid ${palette.brand.primary}`,
                gap: 2,
                whiteSpace: "nowrap",
                "&:hover": {
                  backgroundColor: palette.brand.primaryHover,
                },
              }}
            />
          </Stack>

          {/* Comparisons table */}
          <ArenaTable
            rows={filteredComparisons}
            loading={loading && comparisons.length === 0}
            deleting={deleting}
            onRowClick={(row) => row.status === "completed" && handleViewResults(row.id)}
            onViewResults={(row) => handleViewResults(row.id)}
            onDownload={(row) => handleDownloadComparison(row.id, row.name)}
            onCopy={(row) => handleCopyComparison(row.id)}
            onDelete={(row) => handleDeleteComparison(row.id)}
          />
        </>
      )}

      {/* Create Comparison Modal - 2-Step Wizard */}
      <StepperModal
        isOpen={createModalOpen}
        onClose={() => {
          setCreateModalOpen(false);
          resetForm();
        }}
        title="Create arena battle"
        steps={wizardSteps}
        activeStep={activeStep}
        onNext={() => setActiveStep((prev) => prev + 1)}
        onBack={() => setActiveStep((prev) => prev - 1)}
        onSubmit={handleCreateComparison}
        submitButtonText={creating ? "Starting..." : "Start battle"}
        isSubmitting={creating}
        canProceed={
          activeStep === 0
            ? newComparison.name.trim() !== "" && newComparison.selectedCriteria.length > 0
            : newComparison.contestants.every((c) => c.hyperparameters?.model)
        }
      >
        {activeStep === 0 ? (
          /* Step 1: Settings */
          <Stack spacing={4}>
            <Field
              label="Battle name"
              value={newComparison.name}
              onChange={(e) => setNewComparison({ ...newComparison, name: e.target.value })}
              placeholder="e.g., GPT-4 vs Claude Showdown"
              isRequired
            />

            {/* Judge Model */}
            <Box>
              <ModelSelector
                provider={newComparison.judgeProvider}
                model={newComparison.judgeModel}
                onProviderChange={(provider) => setNewComparison({ ...newComparison, judgeProvider: provider, judgeModel: "" })}
                onModelChange={(model) => setNewComparison({ ...newComparison, judgeModel: model })}
                configuredProviders={configuredProviders}
                onNavigateToSettings={() => navigate("/evals/settings")}
                label="Judge model"
              />
              <Typography sx={{ fontSize: 11, color: palette.text.disabled, mt: 1 }}>
                The LLM that will compare and score the responses
              </Typography>
            </Box>

            {/* Evaluation Criteria */}
            <Box>
              <Stack direction="row" alignItems="center" spacing={0.75} mb={1.5}>
                <Typography sx={{ fontSize: 13, fontWeight: 600, color: palette.text.secondary }}>
                  Evaluation criteria
                </Typography>
                <VWTooltip
                  header="How criteria are used"
                  content={
                    <>
                      <p>The judge model evaluates each response against all selected criteria and picks an overall winner.</p>
                      {EVALUATION_CRITERIA.map((c) => (
                        <Box key={c.id} sx={{ mb: 0.75 }}>
                          <Typography sx={{ fontSize: 13, fontWeight: 600, color: palette.background.main }}>{c.name}</Typography>
                          <Typography sx={{ fontSize: 13, opacity: 0.8, color: palette.background.main }}>{c.description}</Typography>
                        </Box>
                      ))}
                    </>
                  }
                  maxWidth={320}
                  placement="right"
                >
                  <Box sx={{ display: "flex", cursor: "help" }}>
                    <Info size={14} color={palette.text.disabled} />
                  </Box>
                </VWTooltip>
              </Stack>

              {/* Grid of criteria - 2 column boxes */}
              <Box
                sx={{
                  display: "grid",
                  gridTemplateColumns: "repeat(2, 1fr)",
                  gap: 1,
                }}
              >
                {EVALUATION_CRITERIA.map((criteria) => {
                  const isSelected = newComparison.selectedCriteria.includes(criteria.id);
                  return (
                    <Box
                      key={criteria.id}
                      onClick={() => toggleCriteria(criteria.id)}
                      sx={{
                        display: "flex",
                        alignItems: "center",
                        gap: 1,
                        cursor: "pointer",
                      }}
                    >
                      <Checkbox
                        id={`criteria-${criteria.id}`}
                        isChecked={isSelected}
                        value={criteria.id}
                        onChange={() => {}}
                        onClick={(e) => e.stopPropagation()}
                        size="small"
                        sx={{ p: 0 }}
                      />
                      <Typography
                        sx={{
                          fontSize: 13,
                          fontWeight: 500,
                          color: palette.text.secondary,
                        }}
                      >
                        {criteria.name}
                      </Typography>
                    </Box>
                  );
                })}
              </Box>

              {newComparison.selectedCriteria.length === 0 && (
                <Typography sx={{ fontSize: 12, color: palette.status.error.text, mt: 1.5, textAlign: "center" }}>
                  Please select at least one evaluation criterion
                </Typography>
              )}
            </Box>

            {/* Dataset selector */}
            <Box>
              <Stack direction="row" alignItems="center" spacing={1} mb={0.75}>
                <Typography sx={{ fontSize: 13, fontWeight: 600, color: palette.text.secondary }}>
                  Dataset
                </Typography>
              </Stack>
              <Typography sx={{ fontSize: 11, color: palette.text.disabled, mb: 1 }}>
                All contestants will be evaluated using this dataset
              </Typography>
              <GroupedSelect
                id="dataset-select"
                value={newComparison.datasetPath || ""}
                onChange={(value) => setNewComparison({ ...newComparison, datasetPath: String(value) })}
                placeholder="Select a dataset"
                loading={datasetsLoading}
                loadingText="Loading datasets..."
                emptyText="No datasets found. Upload one in the Datasets tab."
                groups={[
                  {
                    label: "My datasets",
                    color: palette.accent.indigo.text,
                    items: myDatasets.map((ds) => ({
                      value: ds.path,
                      label: ds.name,
                      description: `${ds.promptCount} prompts • ${ds.datasetType || "chatbot"}`,
                    })),
                  },
                  {
                    label: "Template datasets",
                    color: palette.status.success.text,
                    items: templateDatasets.map((ds) => ({
                      value: ds.path,
                      label: ds.name,
                      description: ds.use_case,
                    })),
                  },
                ]}
              />
            </Box>
          </Stack>
        ) : (
          /* Step 2: Contestants */
          <Box>
            <Stack direction="row" alignItems="center" justifyContent="space-between" mb={3}>
              <Stack direction="row" alignItems="center" spacing={1.5}>
                <Typography sx={{ fontSize: 14, fontWeight: 600, color: palette.text.secondary }}>
                  Contestants
                </Typography>
                <Chip
                  label={`${newComparison.contestants.length} players`}
                  size="small"
                  sx={{
                    backgroundColor: palette.accent.purple.bg,
                    color: palette.accent.indigo.text,
                    fontWeight: 600,
                    fontSize: "11px",
                    height: 22,
                    ml: 0.5,
                  }}
                />
              </Stack>
              <CustomizableButton
                variant="contained"
                text="Add player"
                icon={<Box sx={{ display: "flex" }}><Plus size={14} /></Box>}
                onClick={addContestant}
                sx={{
                  background: "linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)",
                  color: palette.background.main,
                  fontSize: 12,
                  py: 0.75,
                  pl: 2,
                  pr: 2.5,
                  ml: 2,
                  boxShadow: "0 2px 8px rgba(99,102,241,0.3)",
                  "& .MuiButton-startIcon": {
                    marginLeft: 0,
                    marginRight: "6px",
                  },
                  "&:hover": {
                    background: "linear-gradient(135deg, #818cf8 0%, #a78bfa 100%)",
                    boxShadow: "0 4px 12px rgba(99,102,241,0.4)",
                  },
                }}
              />
            </Stack>

            <Stack spacing="8px">
              {newComparison.contestants.map((contestant, index) => {
                // Cycle through colors for multiple contestants
                const colors = [
                  { border: "#3b82f6", bg: alpha("#3b82f6", 0.03), gradient: "linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)" },
                  { border: "#ef4444", bg: alpha("#ef4444", 0.03), gradient: "linear-gradient(135deg, #ef4444 0%, #dc2626 100%)" },
                  { border: "#10b981", bg: alpha("#10b981", 0.03), gradient: "linear-gradient(135deg, #10b981 0%, #059669 100%)" },
                  { border: "#f59e0b", bg: alpha("#f59e0b", 0.03), gradient: "linear-gradient(135deg, #f59e0b 0%, #d97706 100%)" },
                  { border: "#8b5cf6", bg: alpha("#8b5cf6", 0.03), gradient: "linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%)" },
                  { border: "#ec4899", bg: alpha("#ec4899", 0.03), gradient: "linear-gradient(135deg, #ec4899 0%, #db2777 100%)" },
                ];
                const colorScheme = colors[index % colors.length];
                const hasRemoveButton = newComparison.contestants.length > 2;

                return (
                  <Box
                    key={index}
                    sx={{
                      p: 3,
                      borderRadius: "4px",
                      border: "2px solid",
                      borderColor: colorScheme.border,
                      backgroundColor: colorScheme.bg,
                      position: "relative",
                    }}
                  >
                    {/* Header with badge and remove button */}
                    <Stack direction="row" justifyContent="space-between" alignItems="center" mb={2.5}>
                      <Box
                        sx={{
                          px: 2,
                          py: 0.75,
                          borderRadius: "8px",
                          background: colorScheme.gradient,
                          color: palette.background.main,
                          fontSize: 12,
                          fontWeight: 700,
                          letterSpacing: "0.3px",
                          display: "flex",
                          alignItems: "center",
                          gap: 1,
                        }}
                      >
                        <Target size={14} />
                        {contestant.hyperparameters?.model
                          ? contestant.name
                          : `Contestant ${index + 1}`}
                      </Box>
                      {hasRemoveButton && (
                        <IconButton
                          onClick={() => removeContestant(index)}
                          size="small"
                          sx={{
                            width: 28,
                            height: 28,
                            backgroundColor: palette.status.error.bg,
                            color: palette.status.error.text,
                            "&:hover": { backgroundColor: palette.status.error.bg },
                          }}
                        >
                          <X size={14} />
                        </IconButton>
                      )}
                    </Stack>

                    <Stack spacing={2.5} sx={{ pb: 2 }}>
                      {/* Model selector */}
                      <Box sx={{ pb: 1 }}>
                        <ModelSelector
                          provider={contestant.hyperparameters?.provider || "openai"}
                          model={contestant.hyperparameters?.model || ""}
                          onProviderChange={(newProvider) => updateContestant(index, "provider", newProvider)}
                          onModelChange={(newModel) => updateContestant(index, "model", newModel)}
                          configuredProviders={configuredProviders}
                          onNavigateToSettings={() => navigate("/evals/settings")}
                          label=""
                        />
                      </Box>
                    </Stack>
                  </Box>
                );
              })}
            </Stack>
          </Box>
        )}
      </StepperModal>

    </Stack>
  );
}
