import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { Box, Card, CardContent, Typography, Stack, FormControl, Select, MenuItem } from "@mui/material";
import { Play, Clock } from "lucide-react";
import {
  getAllExperiments,
  createExperiment,
  deleteExperiment,
  getExperiment,
  validateModel,
  type Experiment,
} from "../../../application/repository/deepEval.repository";
import Alert from "../../components/Alert";
import ConfirmationModal from "../../components/Dialogs/ConfirmationModal";
import NewExperimentModal from "./NewExperimentModal";
import { CustomizableButton } from "../../components/button/customizable-button";
import { useNavigate } from "react-router-dom";
import EvaluationTable from "../../components/Table/EvaluationTable";
import PerformanceChart, { TIME_RANGE_OPTIONS, type TimeRange } from "./components/PerformanceChart";
import type { IEvaluationRow } from "../../types/interfaces/i.table";
import SearchBox from "../../components/Search/SearchBox";
import { FilterBy, type FilterColumn } from "../../components/Table/FilterBy";
import { GroupBy } from "../../components/Table/GroupBy";
import { GroupedTableView } from "../../components/Table/GroupedTableView";
import { useTableGrouping, useGroupByState } from "../../../application/hooks/useTableGrouping";
import { useFilterBy } from "../../../application/hooks/useFilterBy";
import HelperIcon from "../../components/HelperIcon";
import TipBox from "../../components/TipBox";
import { useAuth } from "../../../application/hooks/useAuth";
import allowedRoles from "../../../application/constants/permissions";

interface ProjectExperimentsProps {
  projectId: string;
  orgId?: string | null;
  onViewExperiment?: (experimentId: string) => void;
  /** Project's use case for the experiment modal (required) */
  useCase: "chatbot" | "rag" | "agent";
}

interface ExperimentWithMetrics extends Experiment {
  avgMetrics?: Record<string, number>;
  sampleCount?: number;
}

interface AlertState {
  variant: "success" | "error";
  body: string;
}

/**
 * Shortens model names by removing date suffixes for cleaner display
 * e.g., "claude-sonnet-4-20250514" → "claude-sonnet-4"
 *       "claude-3-5-haiku-20241022" → "claude-3-5-haiku"
 *       "gpt-4o-2024-05-13" → "gpt-4o"
 */
function shortenModelName(modelName: string): string {
  if (!modelName) return modelName;
  // Remove date patterns like -20250514 or -2024-05-13 from the end
  return modelName.replace(/-\d{8}$/, '').replace(/-\d{4}-\d{2}-\d{2}$/, '');
}

export default function ProjectExperiments({ projectId, orgId, onViewExperiment, useCase }: ProjectExperimentsProps) {
  const navigate = useNavigate();
  const [experiments, setExperiments] = useState<ExperimentWithMetrics[]>([]);
  const [, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(0);
  const [newEvalModalOpen, setNewEvalModalOpen] = useState(false);
  const [alert, setAlert] = useState<AlertState | null>(null);
  const [apiKeyWarning, setApiKeyWarning] = useState<{
    message: string;
    pendingExperiment: ExperimentWithMetrics;
  } | null>(null);
  const [rerunConfirm, setRerunConfirm] = useState<{
    experiment: ExperimentWithMetrics;
    promptCount: number;
  } | null>(null);
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [chartRefreshKey, setChartRefreshKey] = useState(0);
  const [chartTimeRange, setChartTimeRange] = useState<TimeRange>("all");
  const prevRunningIdsRef = useRef<Set<string>>(new Set());

  // RBAC permissions
  const { userRoleName } = useAuth();
  const canCreateExperiment = allowedRoles.evals.createExperiment.includes(userRoleName);
  const canDeleteExperiment = allowedRoles.evals.deleteExperiment.includes(userRoleName);

  // GroupBy state
  const { groupBy, groupSortOrder, handleGroupChange } = useGroupByState();

  // Helper function to estimate experiment duration based on prompt count
  // Each prompt takes ~20-30 seconds (model call + judge evaluations for each metric)
  const getEstimatedTimeRange = (promptCount: number): string => {
    if (promptCount <= 0) return "unknown";
    if (promptCount <= 3) return "~1-2 minutes";
    if (promptCount <= 5) return "~2-3 minutes";
    if (promptCount <= 10) return "~4-6 minutes";
    if (promptCount <= 20) return "~7-12 minutes";
    if (promptCount <= 30) return "~12-18 minutes";
    if (promptCount <= 50) return "~18-30 minutes";
    return "~30+ minutes";
  };

  useEffect(() => {
    loadExperiments();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  // Auto-poll when there are running experiments
  useEffect(() => {
    const hasRunningExperiments = experiments.some(
      (exp) => exp.status === "running" || exp.status === "pending"
    );

    // Clear existing interval
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }

    // Start polling if there are running experiments
    if (hasRunningExperiments) {
      pollIntervalRef.current = setInterval(() => {
        loadExperiments();
      }, 5000); // Poll every 5 seconds for faster updates
    }

    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [experiments]);

  // Detect when running experiments complete and refresh the chart + notify user
  useEffect(() => {
    const currentRunningIds = new Set(
      experiments
        .filter((exp) => exp.status === "running" || exp.status === "pending")
        .map((exp) => exp.id)
    );

    // Check if any previously running experiments are now completed or failed
    const prevRunning = prevRunningIdsRef.current;
    let anyCompleted = false;
    const completedExps: { name: string; status: string }[] = [];
    
    prevRunning.forEach((id) => {
      if (!currentRunningIds.has(id)) {
        // This experiment was running but is no longer running (completed or failed)
        const exp = experiments.find((e) => e.id === id);
        if (exp && (exp.status === "completed" || exp.status === "failed")) {
          anyCompleted = true;
          completedExps.push({ 
            name: exp.name || exp.id, 
            status: exp.status 
          });
        }
      }
    });

    // Update the ref with current running IDs
    prevRunningIdsRef.current = currentRunningIds;

    // If any experiment just completed/failed, refresh the chart and show notification
    if (anyCompleted) {
      setChartRefreshKey((prev) => prev + 1);
      
      // Show notification for each completed/failed experiment
      completedExps.forEach((exp) => {
        if (exp.status === "completed") {
          setAlert({ variant: "success", body: `Experiment "${exp.name}" completed successfully` });
          // Auto-dismiss success alerts after 5 seconds
          setTimeout(() => setAlert(null), 5000);
        } else {
          setAlert({ variant: "error", body: `Experiment "${exp.name}" failed. Check logs for details.` });
          setTimeout(() => setAlert(null), 20000);
        }
      });
    }
  }, [experiments]);

  const loadExperiments = async () => {
    try {
      setLoading(true);
      const data = await getAllExperiments({
        project_id: projectId
      });

      // Use pre-computed avg_scores from experiment results (no need to fetch logs)
      const experimentsWithMetrics = (data.experiments || []).map((exp: Experiment) => {
        // Get prompt count from config or results
        const sampleCount = exp.results?.total_prompts || 
                           exp.config?.dataset?.count || 
                                    exp.config?.dataset?.prompts?.length || 
                                    0;
          
        // Use pre-computed avg_scores from results (computed when experiment completes)
        // This eliminates N individual log requests!
        const avgMetrics = exp.results?.avg_scores || {};

            return {
              ...exp,
              avgMetrics,
          sampleCount,
            };
      });

      setExperiments(experimentsWithMetrics);
    } catch (err) {
      console.error("Failed to load experiments:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleViewExperiment = (row: IEvaluationRow) => {
    if (onViewExperiment) {
      onViewExperiment(row.id);
    } else {
      navigate(`/evals/${projectId}/experiment/${row.id}`);
    }
  };

  const executeRerun = async (originalExp: ExperimentWithMetrics) => {
    try {
      const baseConfig = originalExp.config || {};

      const now = new Date();
      const dateStr = now.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      });
      const timeStr = now.toLocaleTimeString("en-US", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: true,
      });
      const nextName = `${originalExp.name || "Eval"} (rerun ${dateStr}, ${timeStr})`;

      const payload = {
        project_id: projectId,
        name: nextName,
        description: originalExp.description || "",
        config: {
          ...baseConfig,
          project_id: projectId,
        },
      };

      setAlert({ variant: "success", body: "Starting new evaluation run..." });
      
      const response = await createExperiment(payload);

      if (response?.experiment?.id) {
        // Add the new experiment to the list optimistically
        handleStarted({
          id: response.experiment.id,
          name: nextName,
          config: payload.config as Record<string, unknown>,
          status: "running",
          created_at: new Date().toISOString(),
        });
        
        setAlert({ variant: "success", body: `Rerun started: ${nextName}` });
        setTimeout(() => setAlert(null), 3000);
      }
    } catch (err) {
      console.error("Failed to rerun experiment:", err);
      setAlert({ variant: "error", body: "Failed to start rerun" });
      setTimeout(() => setAlert(null), 20000);
    }
  };

  const handleRerunExperiment = async (row: IEvaluationRow) => {
    // Find the original experiment to get its config
    const originalExp = experiments.find((e) => e.id === row.id);
    if (!originalExp) {
      setAlert({ variant: "error", body: "Could not find experiment to rerun" });
      setTimeout(() => setAlert(null), 20000);
      return;
    }

    // Get prompt count from sampleCount or config
    const promptCount = originalExp.sampleCount || 0;

    // Show rerun confirmation with estimated time
    setRerunConfirm({
      experiment: originalExp,
      promptCount,
    });
  };

  const proceedWithRerun = async (originalExp: ExperimentWithMetrics) => {
    const baseConfig = originalExp.config || {};

    // Validate model API key availability before rerunning
    const modelName = baseConfig.model?.name;
    const modelProvider = baseConfig.model?.accessMethod;

    if (modelName && modelProvider !== "ollama" && modelProvider !== "huggingface") {
      try {
        const validation = await validateModel(modelName, modelProvider);
        if (!validation.valid) {
          // Show warning modal but allow user to proceed
          setApiKeyWarning({
            message: validation.error_message || `API key for ${validation.provider || modelProvider} is not configured.`,
            pendingExperiment: originalExp,
          });
          return;
        }
      } catch (validationError) {
        console.warn("Model validation check failed, proceeding anyway:", validationError);
      }
    }

    // If validation passed or skipped, execute the rerun
    await executeRerun(originalExp);
  };

  const handleDeleteExperiment = async (experimentId: string) => {
    try {
      await deleteExperiment(experimentId);
      setAlert({ variant: "success", body: "Experiment deleted" });
      setTimeout(() => setAlert(null), 3000);
      loadExperiments();
    } catch {
      setAlert({ variant: "error", body: "Failed to delete" });
      setTimeout(() => setAlert(null), 20000);
    }
  };

  const handleDownloadExperiment = async (row: IEvaluationRow) => {
    try {
      const experimentData = await getExperiment(row.id);
      const blob = new Blob([JSON.stringify(experimentData, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${(row.name || row.id).replace(/[^a-z0-9]/gi, "_").toLowerCase()}_results.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setAlert({ variant: "success", body: "Experiment results downloaded" });
      setTimeout(() => setAlert(null), 3000);
    } catch {
      setAlert({ variant: "error", body: "Failed to download results" });
      setTimeout(() => setAlert(null), 20000);
    }
  };

  const handleCopyExperiment = async (row: IEvaluationRow) => {
    try {
      const experimentData = await getExperiment(row.id);
      await navigator.clipboard.writeText(JSON.stringify(experimentData, null, 2));
      setAlert({ variant: "success", body: "Results copied to clipboard" });
      setTimeout(() => setAlert(null), 3000);
    } catch {
      setAlert({ variant: "error", body: "Failed to copy results" });
      setTimeout(() => setAlert(null), 20000);
    }
  };

  const handleStarted = (exp: { id: string; name?: string; config: Record<string, unknown>; status: string; created_at?: string }) => {
    const cfg = exp.config as { 
      model?: { name?: string }; 
      judgeLlm?: { model?: string; provider?: string };
      dataset?: { count?: number; prompts?: unknown[] };
    };
    const cfgForState: Record<string, unknown> = {
      model: { name: cfg.model?.name },
      judgeLlm: { model: cfg.judgeLlm?.model, provider: cfg.judgeLlm?.provider },
      dataset: cfg.dataset,
    };
    // Get prompt count from config
    const promptCount = cfg.dataset?.count || cfg.dataset?.prompts?.length || 0;
    
    setExperiments((prev) => [
      ({
        id: exp.id,
        project_id: projectId,
        name: exp.name || exp.id,
        description: `Pending eval for ${cfg.model?.name || "model"}`,
        config: cfgForState,
        baseline_experiment_id: undefined,
        status: "running",
        results: undefined,
        error_message: undefined,
        started_at: exp.created_at,
        completed_at: undefined,
        created_at: exp.created_at || new Date().toISOString(),
        updated_at: exp.created_at || new Date().toISOString(),
        tenant: "",
        created_by: undefined,
        avgMetrics: {},
        sampleCount: promptCount,
      } as unknown as ExperimentWithMetrics),
      ...prev,
    ]);
  };

  // Filters (shared FilterBy component)
  const experimentFilterColumns: FilterColumn[] = useMemo(
    () => [
      { id: "name", label: "Experiment name", type: "text" },
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
      { id: "model", label: "Model", type: "text" },
      { id: "judge", label: "Judge", type: "text" },
    ],
    []
  );

  const getExperimentFieldValue = useCallback(
    (exp: ExperimentWithMetrics, fieldId: string): string | number | Date | null | undefined => {
      const cfg = exp.config as {
        model?: { name?: string };
        judgeLlm?: { model?: string; provider?: string };
        evaluationMode?: string;
        scorerName?: string;
      } | undefined;

      switch (fieldId) {
        case "name":
          return exp.name;
        case "status":
          return exp.status;
        case "model":
          return cfg?.model?.name || "";
        case "judge": {
          const evaluationMode = cfg?.evaluationMode || "standard";
          const judgeModel = cfg?.judgeLlm?.model || cfg?.judgeLlm?.provider || "";
          const scorerName = cfg?.scorerName || "";
          if (evaluationMode === "scorer") return scorerName;
          if (evaluationMode === "both") return `${judgeModel} + ${scorerName}`;
          return judgeModel;
        }
        default:
          return "";
      }
    },
    []
  );

  const { filterData, handleFilterChange } = useFilterBy<ExperimentWithMetrics>(getExperimentFieldValue);

  const filteredExperiments = useMemo(() => {
    const afterFilter = filterData(experiments);
    if (!searchTerm.trim()) return afterFilter;
    const q = searchTerm.toLowerCase();
    return afterFilter.filter((exp) => {
      const cfg = exp.config as {
        model?: { name?: string };
        judgeLlm?: { model?: string; provider?: string };
      } | undefined;

      const text = [
        exp.id,
        exp.name,
        cfg?.model?.name,
        cfg?.judgeLlm?.model,
        cfg?.judgeLlm?.provider,
        exp.status,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return text.includes(q);
    });
  }, [experiments, filterData, searchTerm]);

  // Transform to table format
  const tableColumns = ["EXPERIMENT NAME", "MODEL", "JUDGE/SCORER", "# PROMPTS", "DATASET", "DATE", "ACTION"];

  const tableRows: IEvaluationRow[] = filteredExperiments.map((exp) => {
    // Get dataset name from config - try multiple sources
    let datasetName = "Dataset";
    const datasetConfig = exp.config?.dataset;
    if (datasetConfig) {
      if (datasetConfig.name) {
        datasetName = datasetConfig.name;
      } else if (datasetConfig.path) {
        // Extract friendly name from path like "chatbot/chatbot_coding_helper.json"
        const pathParts = datasetConfig.path.split("/");
        const fileName = pathParts[pathParts.length - 1]?.replace(/\.json$/i, "") || "";
        // Convert snake_case to Title Case
        datasetName = fileName
          .split("_")
          .map((word: string) => word.charAt(0).toUpperCase() + word.slice(1))
          .join(" ");
      } else if (datasetConfig.datasetId) {
        datasetName = datasetConfig.datasetId;
      } else if (datasetConfig.categories?.[0]) {
        datasetName = datasetConfig.categories[0];
      } else if (datasetConfig.useBuiltin) {
        datasetName = "Template";
      }
    }
    
    // Format the date with time
    const createdDate = exp.created_at 
      ? new Date(exp.created_at).toLocaleDateString("en-US", { 
          month: "short", 
          day: "numeric", 
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        })
      : "-";

    // Determine judge display based on evaluation mode
    const evaluationMode = exp.config?.evaluationMode || "standard";
    const judgeModelRaw = exp.config?.judgeLlm?.model || exp.config?.judgeLlm?.provider || "";
    const judgeModel = shortenModelName(judgeModelRaw);
    const scorerName = exp.config?.scorerName || "";
    
    let judgeDisplay = "-";
    if (evaluationMode === "scorer" && scorerName) {
      judgeDisplay = `${scorerName}`;
    } else if (evaluationMode === "standard" && judgeModel) {
      judgeDisplay = judgeModel;
    } else if (evaluationMode === "both" && judgeModel && scorerName) {
      judgeDisplay = `${judgeModel} + ${scorerName}`;
    } else if (judgeModel) {
      judgeDisplay = judgeModel;
    } else if (scorerName) {
      judgeDisplay = `${scorerName}`;
    }

    return {
      id: exp.id,
      name: exp.name,
      model: exp.config?.model?.name || "Unknown",
      judge: judgeDisplay,
      dataset: datasetName,
      prompts: exp.sampleCount || 0,
      date: createdDate,
      status:
        exp.status === "completed" ? "Completed" :
        exp.status === "failed" ? "Failed" :
        exp.status === "running" ? "Running" :
        "Pending",
    };
  });

  // Define how to get the group key for each row
  const getRowGroupKey = useCallback((row: IEvaluationRow, field: string): string => {
    switch (field) {
      case "status":
        return row.status || "Unknown";
      case "model":
        return row.model || "Unknown";
      case "judge":
        return row.judge || "Unknown";
      default:
        return "Other";
    }
  }, []);

  // Apply grouping to table rows
  const groupedRows = useTableGrouping({
    data: tableRows,
    groupByField: groupBy,
    sortOrder: groupSortOrder,
    getGroupKey: getRowGroupKey,
  });

  return (
    <Box>
      {alert && <Alert variant={alert.variant} body={alert.body} />}

      {/* Rerun Confirmation Modal */}
      {rerunConfirm && (
        <ConfirmationModal
          title="Rerun experiment"
          body={
            <Box>
              <Typography sx={{ fontSize: "14px", color: "#475467", lineHeight: 1.6, mb: 2 }}>
                This will create a new experiment run using the same configuration as "{rerunConfirm.experiment.name}".
              </Typography>
              {rerunConfirm.promptCount > 0 && (
                <Box
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    p: "8px",
                    borderRadius: "4px",
                    backgroundColor: "#F0FDF4",
                    border: "1px solid #BBF7D0",
                  }}
                >
                  <Clock size={16} color="#13715B" />
                  <Box>
                    <Typography sx={{ fontSize: "13px", fontWeight: 500, color: "#13715B" }}>
                      Estimated time: {getEstimatedTimeRange(rerunConfirm.promptCount)}
                    </Typography>
                    <Typography sx={{ fontSize: "11px", color: "#16A34A" }}>
                      Based on {rerunConfirm.promptCount} prompt{rerunConfirm.promptCount !== 1 ? "s" : ""} from the original run
                    </Typography>
                  </Box>
                </Box>
              )}
            </Box>
          }
          cancelText="Cancel"
          proceedText="Rerun"
          onCancel={() => setRerunConfirm(null)}
          onProceed={async () => {
            const exp = rerunConfirm.experiment;
            setRerunConfirm(null);
            await proceedWithRerun(exp);
          }}
          proceedButtonColor="primary"
          proceedButtonVariant="contained"
        />
      )}

      {/* API Key Warning Modal */}
      {apiKeyWarning && (
        <ConfirmationModal
          title="API key may not be configured"
          body={
            <Typography sx={{ fontSize: "14px", color: "#475467", lineHeight: 1.6 }}>
              {apiKeyWarning.message}
              <br /><br />
              Do you want to run the experiment anyway?
            </Typography>
          }
          cancelText="Cancel"
          proceedText="Run anyway"
          onCancel={() => setApiKeyWarning(null)}
          onProceed={async () => {
            const exp = apiKeyWarning.pendingExperiment;
            setApiKeyWarning(null);
            await executeRerun(exp);
          }}
          proceedButtonColor="primary"
          proceedButtonVariant="contained"
        />
      )}

      {/* Header + description */}
      <Stack spacing={1} mb={4}>
        <Box display="flex" alignItems="center" gap={1}>
          <Typography variant="h6" fontSize={15} fontWeight="600" color="#111827">
            Experiments
          </Typography>
          <HelperIcon articlePath="llm-evals/running-experiments" />
        </Box>
        <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.6, fontSize: "14px" }}>
          Experiments run evaluations on your models using datasets and scorers. Track performance metrics over time and compare different model configurations.
        </Typography>
        <TipBox entityName="evals-experiments" />
      </Stack>

      {/* Performance Chart */}
      <Card sx={{ marginBottom: "16px", border: "1px solid #d0d5dd", borderRadius: "4px", boxShadow: "none" }}>
        <CardContent sx={{ py: 2 }}>
          <Box mb={1}>
            <Typography variant="h6" sx={{ fontSize: "14px", fontWeight: 600 }}>Performance tracking</Typography>
          </Box>
          <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 2 }}>
            <Typography variant="body2" color="text.secondary" sx={{ fontSize: "13px" }}>
              Track metric scores across eval runs
            </Typography>
            <FormControl size="small">
              <Select
                value={chartTimeRange}
                onChange={(e) => setChartTimeRange(e.target.value as TimeRange)}
                sx={{
                  fontSize: "12px",
                  height: "28px",
                  "& .MuiSelect-select": { py: 0.5, px: 1.5 },
                  "& .MuiOutlinedInput-notchedOutline": { borderColor: "#E5E7EB" },
                  "&:hover .MuiOutlinedInput-notchedOutline": { borderColor: "#D1D5DB" },
                  "&.Mui-focused .MuiOutlinedInput-notchedOutline": { borderColor: "#13715B" },
                }}
              >
                {TIME_RANGE_OPTIONS.map((opt) => (
                  <MenuItem key={opt.value} value={opt.value} sx={{ fontSize: "12px" }}>
                    {opt.label}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Box>

          <Box sx={{ position: "relative" }}>
            <Box sx={{
              filter: experiments.length === 0 ? "blur(4px)" : "none",
              pointerEvents: experiments.length === 0 ? "none" : "auto",
            }}>
              <PerformanceChart key={`chart-${chartRefreshKey}`} projectId={projectId} timeRange={chartTimeRange} />
            </Box>
            {experiments.length === 0 && (
              <Box
                sx={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  right: 0,
                  bottom: 0,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: "rgba(255, 255, 255, 0.6)",
                  zIndex: 1,
                }}
              >
                <Typography
                  sx={{
                    fontSize: "14px",
                    fontWeight: 500,
                    color: "#374151",
                    textAlign: "center",
                    px: 3,
                  }}
                >
                  You can start tracking metrics once you define your experiments
                </Typography>
              </Box>
            )}
          </Box>
        </CardContent>
      </Card>

      {/* Filters + Search + Group directly above the table */}
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ marginBottom: "18px" }} gap={2}>
        <Stack direction="row" alignItems="center" gap={2}>
          <FilterBy columns={experimentFilterColumns} onFilterChange={handleFilterChange} />
          <GroupBy
            options={[
              { id: "status", label: "Status" },
              { id: "model", label: "Model" },
              { id: "judge", label: "Judge" },
            ]}
            onGroupChange={handleGroupChange}
          />
          <SearchBox
            placeholder="Search experiments..."
            value={searchTerm}
            onChange={setSearchTerm}
            inputProps={{ "aria-label": "Search experiments" }}
            fullWidth={false}
          />
        </Stack>
        <CustomizableButton
          variant="contained"
          text="New experiment"
          icon={<Play size={16} />}
          sx={{
            backgroundColor: "#13715B",
            border: "1px solid #13715B",
            gap: 2,
          }}
          onClick={() => setNewEvalModalOpen(true)}
          isDisabled={!canCreateExperiment}
        />
      </Stack>

      {/* Experiments Table with Pagination */}
      <Box mb={4}>
        <GroupedTableView
          groupedData={groupedRows}
          ungroupedData={tableRows}
          renderTable={(data, options) => (
            <EvaluationTable
              columns={tableColumns}
              rows={data}
              removeModel={canDeleteExperiment ? {
                onConfirm: handleDeleteExperiment,
              } : undefined}
              page={currentPage}
              setCurrentPagingation={setCurrentPage}
              onShowDetails={handleViewExperiment}
              onRerun={canCreateExperiment ? handleRerunExperiment : undefined}
              onDownload={handleDownloadExperiment}
              onCopy={handleCopyExperiment}
              hidePagination={options?.hidePagination}
            />
          )}
        />
      </Box>

      {/* New Experiment Modal */}
      <NewExperimentModal
        isOpen={newEvalModalOpen}
        onClose={() => setNewEvalModalOpen(false)}
        projectId={projectId}
        orgId={orgId}
        onSuccess={() => {
          setNewEvalModalOpen(false);
          loadExperiments();
        }}
        onStarted={handleStarted}
        useCase={useCase}
      />
    </Box>
  );
}
