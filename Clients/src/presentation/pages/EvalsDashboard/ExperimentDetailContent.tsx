import { useState, useEffect } from "react";
import {
  Box,
  Typography,
  CircularProgress,
  Card,
  CardContent,
  Stack,
  IconButton,
  TextField,
} from "@mui/material";
import { CustomizableButton } from "../../components/button/customizable-button";
import Alert from "../../components/Alert";
import ConfirmationModal from "../../components/Dialogs/ConfirmationModal";
import StandardModal from "../../components/Modals/StandardModal";
import {
  TrendingUp,
  TrendingDown,
  Minus,
  X,
  Pencil,
  Check,
  Shield,
  Sparkles,
  RotateCcw,
  Download,
  Copy,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";
import { palette } from "../../themes/palette";
import {
  getExperiment,
  getLogs,
  updateExperiment,
  createExperiment,
  validateModel,
  type Experiment,
  type EvaluationLog,
} from "../../../application/repository/deepEval.repository";

// Preprocess LaTeX delimiters to work with remark-math
const preprocessLatex = (text: string): string => {
  // Convert \[ \] to $$ $$ (display math)
  let processed = text.replace(/\\\[/g, "$$").replace(/\\\]/g, "$$");
  // Convert \( \) to $ $ (inline math)
  processed = processed.replace(/\\\(/g, "$").replace(/\\\)/g, "$");
  return processed;
};

// Convert camelCase or concatenated metric names to proper display format
// e.g., "turnRelevancy" → "Turn Relevancy", "Knowledgeretention" → "Knowledge Retention"
const formatMetricName = (name: string): string => {
  if (!name) return name;

  // First, insert spaces before capital letters (handles camelCase)
  // Also handles concatenated words like "Turnrelevancy" → "Turn relevancy"
  let formatted = name
    // Insert space before uppercase letters that follow lowercase letters
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    // Insert space before uppercase letters at the start of common words
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2");

  // Sentence case: capitalize first letter only, lowercase the rest
  formatted = formatted
    .split(" ")
    .map((word, i) =>
      i === 0 ? word.charAt(0).toUpperCase() + word.slice(1).toLowerCase() : word.toLowerCase(),
    )
    .join(" ");

  return formatted;
};

// Markdown renderer with LaTeX support
const MarkdownRenderer = ({ content }: { content: string }) => {
  if (!content) return null;

  const processedContent = preprocessLatex(content);

  return (
    <Box
      sx={{
        fontSize: 14,
        color: palette.text.secondary,
        lineHeight: 1.7,
        "& p": { mb: 1, mt: 0 },
        "& h1": { fontSize: 16, fontWeight: 700, color: palette.text.primary, mt: 2, mb: 1 },
        "& h2": { fontSize: 15, fontWeight: 700, color: palette.text.primary, mt: 2, mb: 1 },
        "& h3": { fontSize: 14, fontWeight: 700, color: palette.text.primary, mt: 2, mb: 1 },
        "& h4": { fontSize: 14, fontWeight: 600, color: palette.text.primary, mt: 1.5, mb: 0.5 },
        "& ul, & ol": { pl: 3.5, mb: 1, ml: 0.5 },
        "& li": { mb: 0.5 },
        "& code": {
          backgroundColor: palette.background.hover,
          px: 0.75,
          py: 0.25,
          borderRadius: "4px",
          fontFamily: "'Fira Code', monospace",
          fontSize: 11,
          color: "#0f766e",
        },
        "& pre": {
          backgroundColor: "#1e293b",
          borderRadius: "6px",
          p: 2,
          my: 1.5,
          overflow: "auto",
          "& code": {
            backgroundColor: "transparent",
            color: "#e2e8f0",
            p: 0,
          },
        },
        "& strong": { fontWeight: 600 },
        "& em": { fontStyle: "italic" },
        "& hr": { border: "none", borderTop: `1px solid ${palette.border.light}`, my: 2 },
        "& blockquote": {
          borderLeft: `3px solid ${palette.border.light}`,
          pl: 2,
          ml: 0,
          color: palette.text.disabled,
          fontStyle: "italic",
        },
        "& table": {
          borderCollapse: "collapse",
          width: "100%",
          my: 1,
          fontSize: 11,
        },
        "& th, & td": {
          border: `1px solid ${palette.border.light}`,
          px: 1,
          py: 0.5,
          textAlign: "left",
        },
        "& th": {
          backgroundColor: palette.background.accent,
          fontWeight: 600,
        },
        // KaTeX math styling
        "& .katex": {
          fontSize: "1em",
        },
        "& .katex-display": {
          my: 1,
          overflow: "auto",
        },
      }}
    >
      <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>
        {processedContent}
      </ReactMarkdown>
    </Box>
  );
};

interface ExperimentDetailContentProps {
  experimentId: string;
  projectId: string;
  onBack: () => void;
}

export default function ExperimentDetailContent({
  experimentId,
  projectId,
  onBack,
}: ExperimentDetailContentProps) {
  const [loading, setLoading] = useState(true);
  const [experiment, setExperiment] = useState<Experiment | null>(null);
  const [logs, setLogs] = useState<EvaluationLog[]>([]);
  const [selectedSampleIndex, setSelectedSampleIndex] = useState<number | null>(null);
  const [isEditingName, setIsEditingName] = useState(false);
  const [isEditingDescription, setIsEditingDescription] = useState(false);
  const [editedName, setEditedName] = useState("");
  const [editedDescription, setEditedDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [rerunLoading, setRerunLoading] = useState(false);

  // Helper to extract reason from metric data
  // Expected format: {"score": 0.85, "reason": "The answer is accurate..."}
  const parseMetricReason = (reason: string | undefined): string | undefined => {
    if (!reason) return undefined;

    // If it's already clean text (doesn't look like JSON), return as-is
    if (!reason.includes('"reason"') && !reason.includes("{")) {
      return reason;
    }

    // Try to parse as JSON directly
    try {
      const parsed = JSON.parse(reason.trim());
      if (parsed.reason) return parsed.reason;
    } catch {
      // Not valid JSON, try regex extraction
    }

    // Regex to extract reason value (handles escaped quotes)
    const reasonMatch = reason.match(/"reason"\s*:\s*"((?:[^"\\]|\\.)*)"/);
    if (reasonMatch && reasonMatch[1]) {
      return reasonMatch[1].replace(/\\"/g, '"').replace(/\\n/g, "\n").replace(/\\t/g, "\t");
    }

    // Return original if nothing worked
    return reason;
  };

  useEffect(() => {
    loadExperimentData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [experimentId]);

  const loadExperimentData = async () => {
    if (!experimentId) return;

    try {
      setLoading(true);
      const [expData, logsData] = await Promise.all([
        getExperiment(experimentId),
        getLogs({ experiment_id: experimentId, limit: 1000 }),
      ]);

      setExperiment(expData.experiment);
      const loadedLogs = logsData.logs || [];
      setLogs(loadedLogs);
    } catch (err) {
      console.error("Failed to load experiment data:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleStartEditName = () => {
    setEditedName(experiment?.name || "");
    setIsEditingName(true);
  };

  const handleStartEditDescription = () => {
    setEditedDescription(experiment?.description || "");
    setIsEditingDescription(true);
  };

  const handleSaveName = async () => {
    if (!experimentId || !editedName.trim()) return;

    try {
      setSaving(true);
      await updateExperiment(experimentId, {
        name: editedName.trim(),
      });

      setExperiment((prev) => (prev ? { ...prev, name: editedName.trim() } : prev));
      setIsEditingName(false);
      setAlert({ variant: "success", body: "Name saved" });
      setTimeout(() => setAlert(null), 3000);
    } catch (err) {
      console.error("Failed to update experiment name:", err);
      setAlert({ variant: "error", body: "Failed to save name" });
      setTimeout(() => setAlert(null), 15000);
    } finally {
      setSaving(false);
    }
  };

  const handleSaveDescription = async () => {
    if (!experimentId) return;

    try {
      setSaving(true);
      await updateExperiment(experimentId, {
        description: editedDescription.trim(),
      });

      setExperiment((prev) => (prev ? { ...prev, description: editedDescription.trim() } : prev));
      setIsEditingDescription(false);
      setAlert({ variant: "success", body: "Description saved" });
      setTimeout(() => setAlert(null), 3000);
    } catch (err) {
      console.error("Failed to update experiment description:", err);
      setAlert({ variant: "error", body: "Failed to save description" });
      setTimeout(() => setAlert(null), 15000);
    } finally {
      setSaving(false);
    }
  };

  const handleCancelEditName = () => {
    setIsEditingName(false);
    setEditedName("");
  };

  const handleCancelEditDescription = () => {
    setIsEditingDescription(false);
    setEditedDescription("");
  };

  const [alert, setAlert] = useState<{ variant: "success" | "error"; body: string } | null>(null);
  const [apiKeyWarning, setApiKeyWarning] = useState<string | null>(null);

  const executeRerun = async () => {
    if (!experiment || !projectId) return;

    try {
      setRerunLoading(true);
      setAlert(null);
      const baseConfig =
        (experiment as unknown as { config?: Record<string, Record<string, unknown>> }).config ||
        {};

      const nextName = `${experiment.name || "Eval"} (rerun ${new Date().toLocaleDateString()})`;

      const payload = {
        project_id: projectId,
        name: nextName,
        description: experiment.description || "",
        config: {
          ...baseConfig,
          project_id: projectId,
        },
      };

      const response = await createExperiment(payload);

      if (response?.experiment?.id) {
        setAlert({ variant: "success", body: `Rerun started: "${nextName}"` });
        // Navigate back to experiments page after successful rerun
        setTimeout(() => {
          onBack();
        }, 500);
      }
    } catch (err) {
      console.error("Failed to rerun experiment:", err);
      setAlert({ variant: "error", body: "Failed to start rerun" });
      setTimeout(() => setAlert(null), 20000);
    } finally {
      setRerunLoading(false);
    }
  };

  const handleRerunExperiment = async () => {
    if (!experiment || !projectId) return;
    if (rerunLoading) return;

    const baseConfig =
      (experiment as unknown as { config?: Record<string, Record<string, unknown>> }).config || {};

    // Validate model API key availability before rerunning
    const modelName = baseConfig.model?.name as string | undefined;
    const modelProvider = baseConfig.model?.accessMethod as string | undefined;

    if (modelName && modelProvider !== "ollama" && modelProvider !== "huggingface") {
      try {
        const validation = await validateModel(modelName, modelProvider);
        if (!validation.valid) {
          // Show warning modal but allow user to proceed
          setApiKeyWarning(
            validation.error_message ||
              `API key for ${validation.provider || modelProvider} is not configured.`,
          );
          return;
        }
      } catch (validationError) {
        console.warn("Model validation check failed, proceeding anyway:", validationError);
      }
    }

    // If validation passed or skipped, execute the rerun
    await executeRerun();
  };

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="400px">
        <CircularProgress />
      </Box>
    );
  }

  if (!experiment) {
    return (
      <Box p={4}>
        <Typography>Experiment not found</Typography>
      </Box>
    );
  }

  // Extract config from experiment
  const config =
    (
      experiment as unknown as {
        config?: { model?: { name?: string }; judgeLlm?: { model?: string } };
      }
    ).config || {};

  return (
    <Box>
      {alert && (
        <Alert variant={alert.variant} body={alert.body} isToast onClick={() => setAlert(null)} />
      )}

      {/* API Key Warning Modal */}
      {apiKeyWarning && (
        <ConfirmationModal
          title="API key may not be configured"
          body={
            <Typography sx={{ fontSize: "14px", color: palette.text.tertiary, lineHeight: 1.6 }}>
              {apiKeyWarning}
              <br />
              <br />
              Do you want to run the experiment anyway?
            </Typography>
          }
          cancelText="Cancel"
          proceedText="Run anyway"
          onCancel={() => setApiKeyWarning(null)}
          onProceed={async () => {
            setApiKeyWarning(null);
            await executeRerun();
          }}
          proceedButtonColor="primary"
          proceedButtonVariant="contained"
        />
      )}

      {/* Back button */}
      <Box sx={{ mb: 2 }}>
        <Typography
          component="span"
          onClick={onBack}
          sx={{
            fontSize: "13px",
            color: palette.brand.primary,
            cursor: "pointer",
            textDecoration: "underline",
            textDecorationStyle: "dashed",
            textUnderlineOffset: "3px",
            "&:hover": {
              color: palette.brand.primaryHover,
            },
          }}
        >
          ← Back to experiments
        </Typography>
      </Box>

      {/* Header - Title and Actions */}
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 1 }}>
        <Box
          sx={{
            display: "inline-flex",
            alignItems: "center",
            gap: 0.5,
            "&:hover .edit-icon": {
              opacity: 1,
            },
          }}
        >
          {isEditingName ? (
            <>
              <TextField
                value={editedName}
                onChange={(e) => setEditedName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSaveName();
                  if (e.key === "Escape") handleCancelEditName();
                }}
                variant="outlined"
                size="small"
                autoFocus
                disabled={saving}
                sx={{
                  minWidth: "400px",
                  "& .MuiOutlinedInput-root": {
                    fontSize: "18px",
                    fontWeight: 700,
                  },
                }}
              />
              <IconButton
                size="small"
                onClick={handleSaveName}
                disabled={saving || !editedName.trim()}
                sx={{ color: palette.brand.primary }}
              >
                <Check size={18} />
              </IconButton>
              <IconButton
                size="small"
                onClick={handleCancelEditName}
                disabled={saving}
                sx={{ color: palette.text.disabled }}
              >
                <X size={18} />
              </IconButton>
            </>
          ) : (
            <>
              <Typography sx={{ fontSize: 18, fontWeight: 700, color: palette.text.primary }}>
                {experiment.name || experiment.id}
              </Typography>
              <IconButton
                size="small"
                onClick={handleStartEditName}
                className="edit-icon"
                sx={{
                  opacity: 0,
                  transition: "opacity 0.2s",
                  color: palette.text.disabled,
                  "&:hover": {
                    color: palette.brand.primary,
                    backgroundColor: "rgba(19, 113, 91, 0.1)",
                  },
                }}
              >
                <Pencil size={14} />
              </IconButton>
            </>
          )}
        </Box>

        {/* Action buttons */}
        <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 3 }}>
          <CustomizableButton
            variant="outlined"
            onClick={async () => {
              try {
                const blob = new Blob([JSON.stringify({ experiment, logs }, null, 2)], {
                  type: "application/json",
                });
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = `${experiment.id}_results.json`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
              } catch (err) {
                console.error("Failed to download:", err);
              }
            }}
            startIcon={<Download size={14} />}
            sx={{
              borderColor: palette.border.dark,
              color: palette.text.secondary,
              "&:hover": {
                borderColor: palette.brand.primary,
                color: palette.brand.primary,
                backgroundColor: palette.status.success.bg,
              },
            }}
          >
            Download
          </CustomizableButton>
          <CustomizableButton
            variant="outlined"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(JSON.stringify({ experiment, logs }, null, 2));
                setAlert({ variant: "success", body: "Results copied to clipboard" });
                setTimeout(() => setAlert(null), 3000);
              } catch (err) {
                console.error("Failed to copy:", err);
              }
            }}
            startIcon={<Copy size={14} />}
            sx={{
              borderColor: palette.border.dark,
              color: palette.text.secondary,
              "&:hover": {
                borderColor: palette.brand.primary,
                color: palette.brand.primary,
                backgroundColor: palette.status.success.bg,
              },
            }}
          >
            Copy
          </CustomizableButton>
          <Box
            sx={{ width: "1px", height: "24px", backgroundColor: palette.border.light, mx: 0.5 }}
          />
          <CustomizableButton
            variant="contained"
            onClick={handleRerunExperiment}
            isDisabled={rerunLoading || experiment.status === "running"}
            startIcon={<RotateCcw size={14} />}
            sx={{
              backgroundColor: palette.brand.primary,
              border: `1px solid ${palette.brand.primary}`,
              "&:hover": {
                backgroundColor: palette.brand.primaryHover,
                border: `1px solid ${palette.brand.primaryHover}`,
              },
            }}
          >
            {rerunLoading ? "Starting…" : "Rerun"}
          </CustomizableButton>
        </Stack>
      </Box>

      {/* Summary Box - like Arena */}
      <Box
        sx={{
          p: "12px",
          borderRadius: "4px",
          background:
            experiment.status === "completed"
              ? `linear-gradient(135deg, ${palette.status.success.bg} 0%, ${palette.status.success.bg} 100%)`
              : experiment.status === "failed"
                ? palette.status.error.bg
                : palette.background.accent,
          border:
            experiment.status === "completed"
              ? `1px solid ${palette.status.success.text}`
              : experiment.status === "failed"
                ? `1px solid ${palette.status.error.text}`
                : `1px solid ${palette.border.light}`,
          mb: 3,
        }}
      >
        <Stack direction="row" alignItems="center" justifyContent="space-between">
          {/* Status Section */}
          <Stack direction="row" alignItems="center" spacing={2}>
            <Box>
              <Typography
                sx={{
                  fontSize: 10,
                  fontWeight: 600,
                  color:
                    experiment.status === "completed"
                      ? palette.status.success.text
                      : experiment.status === "failed"
                        ? palette.status.error.text
                        : palette.text.disabled,
                  textTransform: "uppercase",
                  letterSpacing: 0.5,
                }}
              >
                {experiment.status === "completed"
                  ? "Completed"
                  : experiment.status === "failed"
                    ? "Failed"
                    : "Status"}
              </Typography>
              <Box
                sx={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 0.5,
                  "&:hover .edit-icon": { opacity: 1 },
                }}
              >
                {isEditingDescription ? (
                  <>
                    <TextField
                      value={editedDescription}
                      onChange={(e) => setEditedDescription(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleSaveDescription();
                        if (e.key === "Escape") handleCancelEditDescription();
                      }}
                      variant="outlined"
                      size="small"
                      autoFocus
                      disabled={saving}
                      placeholder="Add a description..."
                      sx={{ minWidth: "250px", "& .MuiOutlinedInput-root": { fontSize: "13px" } }}
                    />
                    <IconButton
                      size="small"
                      onClick={handleSaveDescription}
                      disabled={saving}
                      sx={{ color: palette.brand.primary }}
                    >
                      <Check size={14} />
                    </IconButton>
                    <IconButton
                      size="small"
                      onClick={handleCancelEditDescription}
                      disabled={saving}
                      sx={{ color: palette.text.disabled }}
                    >
                      <X size={14} />
                    </IconButton>
                  </>
                ) : (
                  <>
                    <Typography
                      sx={{
                        fontSize: 14,
                        fontWeight: 500,
                        color:
                          experiment.status === "completed"
                            ? palette.status.success.text
                            : experiment.status === "failed"
                              ? palette.status.error.text
                              : palette.text.disabled,
                      }}
                    >
                      {experiment.description ||
                        `Evaluating ${config.model?.name || "model"} with ${logs.length} prompts`}
                    </Typography>
                    <IconButton
                      size="small"
                      onClick={handleStartEditDescription}
                      className="edit-icon"
                      sx={{
                        opacity: 0,
                        transition: "opacity 0.2s",
                        color: palette.text.disabled,
                        padding: "2px",
                        "&:hover": { color: palette.brand.primary },
                      }}
                    >
                      <Pencil size={12} />
                    </IconButton>
                  </>
                )}
              </Box>
            </Box>
          </Stack>

          {/* Info Section */}
          <Stack direction="row" spacing={5} alignItems="flex-start">
            <Box sx={{ textAlign: "center" }}>
              <Typography
                sx={{
                  fontSize: 9,
                  color:
                    experiment.status === "completed"
                      ? palette.status.success.text
                      : palette.text.disabled,
                  textTransform: "uppercase",
                }}
              >
                Model
              </Typography>
              <Typography
                sx={{
                  fontSize: 12,
                  fontWeight: 600,
                  color:
                    experiment.status === "completed"
                      ? palette.status.success.text
                      : palette.text.secondary,
                }}
              >
                {config.model?.name || "—"}
              </Typography>
            </Box>
            <Box sx={{ textAlign: "center" }}>
              <Typography
                sx={{
                  fontSize: 9,
                  color:
                    experiment.status === "completed"
                      ? palette.status.success.text
                      : palette.text.disabled,
                  textTransform: "uppercase",
                }}
              >
                Judge
              </Typography>
              <Typography
                sx={{
                  fontSize: 12,
                  fontWeight: 600,
                  color:
                    experiment.status === "completed"
                      ? palette.status.success.text
                      : palette.text.secondary,
                }}
              >
                {config.judgeLlm?.model || "—"}
              </Typography>
            </Box>
            <Box sx={{ textAlign: "center" }}>
              <Typography
                sx={{
                  fontSize: 9,
                  color:
                    experiment.status === "completed"
                      ? palette.status.success.text
                      : palette.text.disabled,
                  textTransform: "uppercase",
                }}
              >
                Prompts
              </Typography>
              <Typography
                sx={{
                  fontSize: 12,
                  fontWeight: 600,
                  color:
                    experiment.status === "completed"
                      ? palette.status.success.text
                      : palette.text.secondary,
                }}
              >
                {logs.length}
              </Typography>
            </Box>
            <Box sx={{ textAlign: "center" }}>
              <Typography
                sx={{
                  fontSize: 9,
                  color:
                    experiment.status === "completed"
                      ? palette.status.success.text
                      : palette.text.disabled,
                  textTransform: "uppercase",
                }}
              >
                Created
              </Typography>
              <Typography
                sx={{
                  fontSize: 12,
                  fontWeight: 600,
                  color:
                    experiment.status === "completed"
                      ? palette.status.success.text
                      : palette.text.secondary,
                }}
              >
                {new Date(experiment.created_at).toLocaleDateString()}
              </Typography>
            </Box>
          </Stack>
        </Stack>
      </Box>

      {/* Overall Stats Header */}
      {logs.length > 0 &&
        (() => {
          // Map display names to camelCase keys for backwards compatibility
          const displayNameToKey: Record<string, string> = {
            // Single-turn metrics
            "Answer Relevancy": "answerRelevancy",
            Faithfulness: "faithfulness",
            "Contextual Relevancy": "contextualRelevancy",
            "Contextual Recall": "contextualRecall",
            "Contextual Precision": "contextualPrecision",
            Bias: "bias",
            Toxicity: "toxicity",
            Hallucination: "hallucination",
            "Tool Correctness": "toolCorrectness",
            "Answer Correctness": "answerCorrectness",
            Coherence: "coherence",
            Tonality: "tonality",
            Safety: "safety",
            // Conversational metrics (multi-turn)
            "Turn Relevancy": "turnRelevancy",
            "Knowledge Retention": "knowledgeRetention",
            "Conversation Coherence": "conversationCoherence",
            "Conversation Helpfulness": "conversationHelpfulness",
            "Task Completion": "taskCompletion",
            "Conversation Safety": "conversationSafety",
            "Conversation Completeness": "conversationCompleteness",
            "Conversation Relevancy": "conversationRelevancy",
            "Role Adherence": "roleAdherence",
            "Conversation Quality": "conversationQuality",
          };

          // Calculate overall averages and per-sample scores for sparklines
          const metricsSum: Record<string, { sum: number; count: number; scores: number[] }> = {};
          logs.forEach((log) => {
            if (log.metadata?.metric_scores) {
              Object.entries(log.metadata.metric_scores).forEach(([rawKey, value]) => {
                // Normalize key: convert display names to camelCase, or keep if already camelCase
                const key = displayNameToKey[rawKey] || rawKey;
                const score =
                  typeof value === "number" ? value : (value as { score?: number })?.score;
                if (typeof score === "number") {
                  if (!metricsSum[key]) metricsSum[key] = { sum: 0, count: 0, scores: [] };
                  metricsSum[key].sum += score;
                  metricsSum[key].count += 1;
                  metricsSum[key].scores.push(score);
                }
              });
            }
          });

          // Detect if this is a multi-turn experiment by checking logs metadata
          const isMultiTurnExperiment = logs.some(
            (log) => log.metadata?.is_conversational === true || log.metadata?.turns !== undefined,
          );

          // Metric definitions with categories - expanded to include all possible metrics
          const metricDefinitions: Record<
            string,
            {
              label: string;
              category: "quality" | "safety" | "conversational";
              multiTurnOnly?: boolean;
              singleTurnOnly?: boolean;
            }
          > = {
            // Standard DeepEval metrics (single-turn ONLY)
            answerRelevancy: {
              label: "Answer Relevancy",
              category: "quality",
              singleTurnOnly: true,
            },
            faithfulness: { label: "Faithfulness", category: "quality", singleTurnOnly: true },
            contextualRelevancy: {
              label: "Contextual Relevancy",
              category: "quality",
              singleTurnOnly: true,
            },
            contextualRecall: {
              label: "Contextual Recall",
              category: "quality",
              singleTurnOnly: true,
            },
            contextualPrecision: {
              label: "Contextual Precision",
              category: "quality",
              singleTurnOnly: true,
            },
            hallucination: { label: "Hallucination", category: "safety", singleTurnOnly: true },
            // Agent metrics (single-turn)
            toolCorrectness: {
              label: "Tool Correctness",
              category: "quality",
              singleTurnOnly: true,
            },
            // G-Eval single-turn metrics
            answerCorrectness: {
              label: "Answer Correctness",
              category: "quality",
              singleTurnOnly: true,
            },
            coherence: { label: "Coherence", category: "quality", singleTurnOnly: true },
            tonality: { label: "Tonality", category: "quality", singleTurnOnly: true },
            safety: { label: "Safety", category: "safety", singleTurnOnly: true },

            // Safety metrics (work for both single-turn and multi-turn)
            bias: { label: "Bias", category: "safety" },
            toxicity: { label: "Toxicity", category: "safety" },

            // === CONVERSATIONAL METRICS (multi-turn ONLY) ===
            turnRelevancy: {
              label: "Turn Relevancy",
              category: "conversational",
              multiTurnOnly: true,
            },
            knowledgeRetention: {
              label: "Knowledge Retention",
              category: "conversational",
              multiTurnOnly: true,
            },
            conversationCoherence: {
              label: "Conversation Coherence",
              category: "conversational",
              multiTurnOnly: true,
            },
            conversationHelpfulness: {
              label: "Conversation Helpfulness",
              category: "conversational",
              multiTurnOnly: true,
            },
            taskCompletion: {
              label: "Task Completion",
              category: "conversational",
              multiTurnOnly: true,
            },
            conversationSafety: {
              label: "Conversation Safety",
              category: "conversational",
              multiTurnOnly: true,
            },
            // Legacy conversational names (for backwards compatibility)
            conversationCompleteness: {
              label: "Conversation Completeness",
              category: "conversational",
              multiTurnOnly: true,
            },
            conversationRelevancy: {
              label: "Conversation Relevancy",
              category: "conversational",
              multiTurnOnly: true,
            },
            roleAdherence: {
              label: "Role Adherence",
              category: "conversational",
              multiTurnOnly: true,
            },
            conversationQuality: {
              label: "Conversation Quality",
              category: "conversational",
              multiTurnOnly: true,
            },
          };

          // Get score color based on value thresholds
          // For inverse metrics (bias, toxicity), lower is better
          const getScoreColor = (score: number | undefined, metricKey?: string) => {
            if (score === undefined)
              return {
                bg: palette.status.default.bg,
                text: palette.status.default.text,
                icon: palette.status.default.text,
              };

            // Check if this is an inverse metric (lower is better)
            const isInverse =
              metricKey &&
              (metricKey.toLowerCase() === "bias" || metricKey.toLowerCase() === "toxicity");

            if (isInverse) {
              // For inverse metrics: low = good (green), high = bad (red)
              if (score <= 0.3)
                return {
                  bg: palette.status.success.bg,
                  text: palette.status.success.text,
                  icon: palette.status.success.text,
                };
              if (score <= 0.6)
                return {
                  bg: palette.status.warning.bg,
                  text: palette.status.warning.text,
                  icon: palette.status.warning.text,
                };
              return {
                bg: palette.status.error.bg,
                text: palette.status.error.text,
                icon: palette.status.error.text,
              };
            }

            // Normal metrics: high = good (green), low = bad (red)
            if (score >= 0.7)
              return {
                bg: palette.status.success.bg,
                text: palette.status.success.text,
                icon: palette.status.success.text,
              };
            if (score >= 0.4)
              return {
                bg: palette.status.warning.bg,
                text: palette.status.warning.text,
                icon: palette.status.warning.text,
              };
            return {
              bg: palette.status.error.bg,
              text: palette.status.error.text,
              icon: palette.status.error.text,
            };
          };

          // Get delta indicator (simulated - in real app would compare to previous experiment)
          const getDeltaIndicator = (scores: number[]) => {
            if (scores.length < 2) return null;
            const firstHalf = scores.slice(0, Math.floor(scores.length / 2));
            const secondHalf = scores.slice(Math.floor(scores.length / 2));
            const firstAvg = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
            const secondAvg = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length;
            const delta = secondAvg - firstAvg;
            if (Math.abs(delta) < 0.02) return { type: "neutral" as const, value: 0 };
            return {
              type: delta > 0 ? ("up" as const) : ("down" as const),
              value: Math.abs(delta * 100),
            };
          };

          // Simple SVG sparkline component
          const Sparkline = ({ scores, color }: { scores: number[]; color: string }) => {
            if (scores.length < 2) return null;
            const width = 60;
            const height = 20;
            const padding = 2;
            const maxScore = Math.max(...scores);
            const minScore = Math.min(...scores);
            const range = maxScore - minScore || 1;

            const points = scores
              .map((score, i) => {
                const x = padding + (i / (scores.length - 1)) * (width - 2 * padding);
                const y = height - padding - ((score - minScore) / range) * (height - 2 * padding);
                return `${x},${y}`;
              })
              .join(" ");

            return (
              <svg width={width} height={height} style={{ marginLeft: "auto" }}>
                <polyline
                  points={points}
                  fill="none"
                  stroke={color}
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            );
          };

          // Show metrics that:
          // 1. Have actual data (score was calculated)
          // 2. Are appropriate for the experiment type (multi-turn vs single-turn)
          const orderedMetrics = Object.keys(metricDefinitions)
            .filter((k) => {
              const def = metricDefinitions[k];
              // Only show metrics that have actual data
              if (!metricsSum[k]) return false;
              // Filter by experiment type
              if (isMultiTurnExperiment && def.singleTurnOnly) return false;
              if (!isMultiTurnExperiment && def.multiTurnOnly) return false;
              return true;
            })
            .map((k) => ({ key: k, ...metricDefinitions[k] }));

          // Find custom scorer metrics (those not in metricDefinitions but have data)
          const customScorerMetrics = Object.keys(metricsSum)
            .filter((k) => !metricDefinitions[k] && !displayNameToKey[k])
            .map((k) => ({
              key: k,
              label: k
                .split("_")
                .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
                .join(" "),
              category: "scorer" as const,
            }));

          if (Object.keys(metricsSum).length === 0 && customScorerMetrics.length === 0) return null;

          // Group metrics by category
          const qualityMetrics = orderedMetrics.filter((m) => m.category === "quality");
          const safetyMetrics = orderedMetrics.filter((m) => m.category === "safety");
          const conversationalMetrics = orderedMetrics.filter(
            (m) => m.category === "conversational",
          );

          // Get icon for metric type (for background watermark)
          const getMetricIcon = (metricKey: string) => {
            switch (metricKey) {
              // Quality metrics (single-turn)
              case "answerRelevancy":
                return Sparkles;
              case "faithfulness":
                return Check;
              case "contextualRelevancy":
                return Sparkles;
              case "contextualRecall":
                return Sparkles;
              case "contextualPrecision":
                return Sparkles;
              case "answerCorrectness":
                return Sparkles;
              case "coherence":
                return Sparkles;
              case "tonality":
                return Sparkles;
              case "toolCorrectness":
                return Check;
              // Safety metrics
              case "bias":
                return Shield;
              case "toxicity":
                return Shield;
              case "safety":
                return Shield;
              case "hallucination":
                return Shield;
              // Conversational metrics (multi-turn)
              case "turnRelevancy":
                return Sparkles;
              case "knowledgeRetention":
                return Sparkles;
              case "conversationCoherence":
                return Sparkles;
              case "conversationHelpfulness":
                return Sparkles;
              case "taskCompletion":
                return Check;
              case "conversationSafety":
                return Shield;
              case "conversationCompleteness":
                return Sparkles;
              case "conversationRelevancy":
                return Sparkles;
              case "roleAdherence":
                return Sparkles;
              case "conversationQuality":
                return Sparkles;
              // Custom scorers use Sparkles as default
              default:
                return Sparkles;
            }
          };

          const renderMetricCard = (metric: { key: string; label: string; category: string }) => {
            const entry =
              metricsSum[metric.label] ||
              metricsSum[`G-Eval (${metric.label})`] ||
              metricsSum[metric.key];
            const avgValue = entry ? entry.sum / Math.max(1, entry.count) : undefined;
            const scores = entry?.scores || [];
            const colors = getScoreColor(avgValue, metric.label);
            const delta = getDeltaIndicator(scores);
            const BackgroundIcon = getMetricIcon(metric.key);

            return (
              <Card
                key={metric.key}
                elevation={0}
                sx={{
                  position: "relative",
                  overflow: "hidden",
                  background: `linear-gradient(135deg, ${palette.background.main} 0%, ${palette.background.accent} 100%)`,
                  border: `1px solid ${palette.border.dark}`,
                  borderRadius: "4px",
                  transition: "all 0.2s ease",
                  "&:hover": {
                    background: `linear-gradient(135deg, ${palette.background.accent} 0%, ${palette.background.hover} 100%)`,
                    "& .background-icon": {
                      opacity: 0.04,
                      transform: "translateY(-10px)",
                    },
                  },
                }}
              >
                {/* Background watermark icon */}
                <Box
                  className="background-icon"
                  sx={{
                    position: "absolute",
                    bottom: "-32px",
                    right: "-32px",
                    opacity: 0.015,
                    transform: "translateY(0px)",
                    zIndex: 0,
                    pointerEvents: "none",
                    transition: "opacity 0.2s ease, transform 0.3s ease",
                  }}
                >
                  <BackgroundIcon size={96} color={palette.text.secondary} />
                </Box>

                <CardContent
                  sx={{
                    p: "16px",
                    position: "relative",
                    zIndex: 1,
                    "&:last-child": { pb: "16px" },
                  }}
                >
                  <Box
                    sx={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      mb: 1.5,
                    }}
                  >
                    <Typography
                      variant="body2"
                      sx={{ fontSize: "13px", fontWeight: 400, color: palette.text.disabled }}
                    >
                      {metric.label}
                    </Typography>
                    {delta && (
                      <Box
                        sx={{
                          display: "flex",
                          alignItems: "center",
                          gap: 0.5,
                          px: 1,
                          py: 0.25,
                          borderRadius: "4px",
                          backgroundColor:
                            delta.type === "up"
                              ? palette.status.success.bg
                              : delta.type === "down"
                                ? palette.status.error.bg
                                : palette.status.default.bg,
                        }}
                      >
                        {delta.type === "up" ? (
                          <TrendingUp size={10} color={palette.status.success.text} />
                        ) : delta.type === "down" ? (
                          <TrendingDown size={10} color={palette.status.error.text} />
                        ) : (
                          <Minus size={10} color={palette.status.default.text} />
                        )}
                        <Typography
                          sx={{
                            fontSize: "9px",
                            fontWeight: 600,
                            color:
                              delta.type === "up"
                                ? palette.status.success.text
                                : delta.type === "down"
                                  ? palette.status.error.text
                                  : palette.status.default.text,
                          }}
                        >
                          {delta.value.toFixed(1)}%
                        </Typography>
                      </Box>
                    )}
                  </Box>
                  <Box
                    sx={{
                      display: "flex",
                      alignItems: "flex-end",
                      justifyContent: "space-between",
                    }}
                  >
                    <Typography
                      variant="h6"
                      sx={{
                        fontSize: "24px",
                        fontWeight: 700,
                        color: colors.text,
                        lineHeight: 1.2,
                        fontFamily: "'JetBrains Mono', 'Fira Code', 'Courier New', monospace",
                      }}
                    >
                      {avgValue === undefined ? "N/A" : `${(avgValue * 100).toFixed(1)}%`}
                    </Typography>
                    {scores.length >= 2 && <Sparkline scores={scores} color={colors.icon} />}
                  </Box>
                </CardContent>
              </Card>
            );
          };

          return (
            <Box>
              {/* Quality Metrics Section */}
              {qualityMetrics.length > 0 && (
                <Box sx={{ mb: "16px" }}>
                  <Typography variant="h6" sx={{ fontSize: "15px", fontWeight: 600, mb: 2 }}>
                    Quality metrics
                  </Typography>
                  <Box
                    sx={{
                      display: "grid",
                      gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
                      gap: "16px",
                    }}
                  >
                    {qualityMetrics.map(renderMetricCard)}
                  </Box>
                </Box>
              )}

              {/* Conversational Metrics Section (Multi-turn) */}
              {conversationalMetrics.length > 0 && (
                <Box sx={{ mb: "16px" }}>
                  <Typography variant="h6" sx={{ fontSize: "15px", fontWeight: 600, mb: 2 }}>
                    Conversational metrics
                    <Typography
                      component="span"
                      sx={{
                        fontSize: "12px",
                        fontWeight: 400,
                        color: palette.text.disabled,
                        ml: 1,
                      }}
                    >
                      (multi-turn)
                    </Typography>
                  </Typography>
                  <Box
                    sx={{
                      display: "grid",
                      gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
                      gap: "16px",
                    }}
                  >
                    {conversationalMetrics.map(renderMetricCard)}
                  </Box>
                </Box>
              )}

              {/* Safety Metrics Section */}
              {safetyMetrics.length > 0 && (
                <Box sx={{ mb: "16px" }}>
                  <Typography variant="h6" sx={{ fontSize: "15px", fontWeight: 600, mb: 2 }}>
                    Safety metrics
                  </Typography>
                  <Box
                    sx={{
                      display: "grid",
                      gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
                      gap: "16px",
                    }}
                  >
                    {safetyMetrics.map(renderMetricCard)}
                  </Box>
                </Box>
              )}

              {/* Custom Scorers Section - only show truly custom ones not matching known metrics */}
              {customScorerMetrics.length > 0 && (
                <Box sx={{ mb: "16px" }}>
                  <Typography variant="h6" sx={{ fontSize: "15px", fontWeight: 600, mb: 2 }}>
                    Custom scorers
                  </Typography>
                  <Box
                    sx={{
                      display: "grid",
                      gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
                      gap: "16px",
                    }}
                  >
                    {customScorerMetrics.map(renderMetricCard)}
                  </Box>
                </Box>
              )}
            </Box>
          );
        })()}

      {/* Split Panel Layout */}
      <Typography variant="h6" sx={{ fontSize: "15px", fontWeight: 600, mb: 2 }}>
        All samples
      </Typography>
      {/* Extract unique metric names from all logs */}
      {(() => {
        const allMetricNames = new Set<string>();
        logs.forEach((log) => {
          if (log.metadata?.metric_scores) {
            Object.keys(log.metadata.metric_scores).forEach((name) => {
              // Clean up metric name for display
              const cleanName = name.replace(/^G-Eval\s*\((.+)\)$/i, "$1");
              allMetricNames.add(cleanName);
            });
          }
        });
        const metricColumns = Array.from(allMetricNames);

        // Helper to get metric score from log
        const getMetricScore = (log: EvaluationLog, metricName: string): number | null => {
          if (!log.metadata?.metric_scores) return null;
          // Try exact match first
          const scores = log.metadata.metric_scores as Record<string, number | { score?: number }>;
          if (scores[metricName] !== undefined) {
            const data = scores[metricName];
            return typeof data === "number" ? data : (data?.score ?? null);
          }
          // Try G-Eval format
          const gevalKey = `G-Eval (${metricName})`;
          if (scores[gevalKey] !== undefined) {
            const data = scores[gevalKey];
            return typeof data === "number" ? data : (data?.score ?? null);
          }
          // Try case-insensitive match
          const key = Object.keys(scores).find(
            (k) =>
              k.toLowerCase() === metricName.toLowerCase() ||
              k.replace(/^G-Eval\s*\((.+)\)$/i, "$1").toLowerCase() === metricName.toLowerCase(),
          );
          if (key) {
            const data = scores[key];
            return typeof data === "number" ? data : (data?.score ?? null);
          }
          return null;
        };

        return (
          <>
            <Box
              sx={{
                overflow: "hidden",
                border: `1px solid ${palette.border.dark}`,
                borderRadius: "4px",
              }}
            >
              <Box sx={{ overflowX: "auto" }}>
                {/* Native HTML table to bypass MUI styling conflicts */}
                <table
                  style={{
                    width: "100%",
                    tableLayout: "fixed",
                    borderCollapse: "collapse",
                    fontSize: "12px",
                  }}
                >
                  <thead>
                    {(() => {
                      // Input column should be 3x the width of each metric column
                      // Total proportional units: 3 (input) + metricColumns.length (1 each)
                      // The # column is a fixed 50px
                      const totalUnits = 3 + metricColumns.length;
                      const metricColWidth = `${(100 / totalUnits).toFixed(2)}%`;
                      const inputColWidth = `${((3 * 100) / totalUnits).toFixed(2)}%`;
                      return (
                        <tr style={{ backgroundColor: palette.background.accent }}>
                          <th
                            style={{
                              fontWeight: 600,
                              fontSize: "11px",
                              width: 50,
                              textAlign: "center",
                              padding: "12px 16px",
                              borderBottom: `2px solid ${palette.border.dark}`,
                              borderRight: `1px solid ${palette.border.dark}`,
                            }}
                          >
                            #
                          </th>
                          <th
                            style={{
                              fontWeight: 600,
                              fontSize: "11px",
                              width: inputColWidth,
                              textAlign: "center",
                              padding: "12px 16px",
                              borderBottom: `2px solid ${palette.border.dark}`,
                              borderRight: `1px solid ${palette.border.dark}`,
                            }}
                          >
                            Input
                          </th>
                          {metricColumns.map((metric) => (
                            <th
                              key={metric}
                              style={{
                                fontWeight: 600,
                                fontSize: "11px",
                                width: metricColWidth,
                                textAlign: "center",
                                padding: "12px 8px",
                                borderBottom: `2px solid ${palette.border.dark}`,
                                borderRight: `1px solid ${palette.border.dark}`,
                              }}
                            >
                              {formatMetricName(metric)}
                            </th>
                          ))}
                        </tr>
                      );
                    })()}
                  </thead>
                  <tbody>
                    {logs.length === 0 ? (
                      <tr>
                        <td
                          colSpan={2 + metricColumns.length}
                          style={{
                            textAlign: "center",
                            padding: "32px 16px",
                            color: palette.text.disabled,
                          }}
                        >
                          No samples found
                        </td>
                      </tr>
                    ) : (
                      logs.map((log, index) => (
                        <tr
                          key={log.id}
                          onClick={() => setSelectedSampleIndex(index)}
                          style={{ cursor: "pointer" }}
                          onMouseEnter={(e) =>
                            (e.currentTarget.style.backgroundColor = palette.background.accent)
                          }
                          onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "")}
                        >
                          <td
                            style={{
                              fontSize: "12px",
                              color: palette.text.disabled,
                              textAlign: "center",
                              padding: "12px 16px",
                              borderBottom: `1px solid ${palette.border.dark}`,
                              borderRight: `1px solid ${palette.border.dark}`,
                            }}
                          >
                            {index + 1}
                          </td>
                          <td
                            style={{
                              fontSize: "12px",
                              textAlign: "center",
                              padding: "12px 16px",
                              borderBottom: `1px solid ${palette.border.dark}`,
                              borderRight: `1px solid ${palette.border.dark}`,
                              maxWidth: 400,
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {log.input_text || "-"}
                          </td>
                          {metricColumns.map((metric) => {
                            const score = getMetricScore(log, metric);
                            const isInverseMetric =
                              metric.toLowerCase() === "bias" ||
                              metric.toLowerCase() === "toxicity" ||
                              metric.toLowerCase() === "hallucination";
                            const passed =
                              score !== null && (isInverseMetric ? score < 0.5 : score >= 0.5);
                            return (
                              <td
                                key={metric}
                                style={{
                                  textAlign: "center",
                                  padding: "12px 16px",
                                  borderBottom: `1px solid ${palette.border.dark}`,
                                  borderRight: `1px solid ${palette.border.dark}`,
                                  backgroundColor:
                                    score !== null
                                      ? passed
                                        ? "rgba(16, 185, 129, 0.18)"
                                        : "rgba(239, 68, 68, 0.18)"
                                      : "transparent",
                                  fontSize: "12px",
                                  fontWeight: 500,
                                  color:
                                    score !== null ? palette.text.secondary : palette.text.disabled,
                                }}
                              >
                                {score !== null ? `${(score * 100).toFixed(0)}%` : "-"}
                              </td>
                            );
                          })}
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </Box>
            </Box>

            {/* Sample Detail Modal */}
            {selectedSampleIndex !== null &&
              logs[selectedSampleIndex] &&
              (() => {
                const selectedLog = logs[selectedSampleIndex];
                const totalSamples = logs.length;
                const isFirstSample = selectedSampleIndex === 0;
                const isLastSample = selectedSampleIndex === totalSamples - 1;

                const scrollToTop = () => {
                  // Scroll modal content to top - target the form element which is the scrollable container in StandardModal
                  setTimeout(() => {
                    const modalContent = document.querySelector("[data-sample-modal-content]");
                    // The scrollable container is the parent form element
                    const scrollableForm = modalContent?.closest("form");
                    if (scrollableForm) {
                      scrollableForm.scrollTop = 0;
                    }
                  }, 10);
                };

                const handlePrevious = () => {
                  if (!isFirstSample) {
                    setSelectedSampleIndex(selectedSampleIndex - 1);
                    scrollToTop();
                  }
                };

                const handleNext = () => {
                  if (!isLastSample) {
                    setSelectedSampleIndex(selectedSampleIndex + 1);
                    scrollToTop();
                  }
                };

                // Calculate overall pass/fail for this sample
                const metricScores = selectedLog.metadata?.metric_scores || {};
                const scoreEntries = Object.entries(metricScores);
                const passedCount = scoreEntries.filter(([name, data]) => {
                  const score =
                    typeof data === "number" ? data : (data as { score?: number })?.score;
                  const isInverse =
                    name.toLowerCase().includes("bias") || name.toLowerCase().includes("toxicity");
                  return typeof score === "number" && (isInverse ? score < 0.5 : score >= 0.5);
                }).length;

                return (
                  <StandardModal
                    isOpen={selectedSampleIndex !== null}
                    onClose={() => setSelectedSampleIndex(null)}
                    title={`Sample ${selectedSampleIndex + 1}`}
                    description={`${passedCount}/${scoreEntries.length} metrics passed`}
                    maxWidth="1100px"
                    fitContent
                    customFooter={
                      <Stack
                        direction="row"
                        spacing="8px"
                        sx={{ width: "100%", justifyContent: "flex-end" }}
                      >
                        <CustomizableButton
                          variant="outlined"
                          text="Previous"
                          onClick={handlePrevious}
                          isDisabled={isFirstSample}
                          icon={<ChevronLeft size={16} />}
                          sx={{
                            minWidth: "100px",
                            height: "34px",
                            border: `1px solid ${palette.border.dark}`,
                            color: isFirstSample ? palette.text.disabled : palette.text.secondary,
                            "&:hover:not(.Mui-disabled)": {
                              backgroundColor: palette.background.accent,
                              border: `1px solid ${palette.border.dark}`,
                            },
                          }}
                        />
                        <CustomizableButton
                          variant="outlined"
                          text="Next"
                          onClick={handleNext}
                          isDisabled={isLastSample}
                          icon={<ChevronRight size={16} />}
                          sx={{
                            minWidth: "100px",
                            height: "34px",
                            border: `1px solid ${palette.border.dark}`,
                            color: isLastSample ? palette.text.disabled : palette.text.secondary,
                            "&:hover:not(.Mui-disabled)": {
                              backgroundColor: palette.background.accent,
                              border: `1px solid ${palette.border.dark}`,
                            },
                            flexDirection: "row-reverse",
                            "& .MuiButton-startIcon": {
                              marginLeft: "8px",
                              marginRight: "-4px",
                            },
                          }}
                        />
                      </Stack>
                    }
                  >
                    {/* Side-by-side layout: Left = Input/Output, Right = Metrics */}
                    <Box
                      data-sample-modal-content
                      sx={{
                        display: "grid",
                        gridTemplateColumns: "1fr 1fr",
                        gap: "32px",
                        minHeight: "400px",
                      }}
                    >
                      {/* Left Panel: Input/Output or Conversation */}
                      <Box
                        sx={{
                          display: "flex",
                          flexDirection: "column",
                          borderRight: `1px solid ${palette.border.light}`,
                          pr: 4,
                        }}
                      >
                        {/* Conversational Display (for multi-turn) */}
                        {selectedLog.metadata?.is_conversational && selectedLog.metadata?.turns ? (
                          <Box sx={{ flex: 1, display: "flex", flexDirection: "column" }}>
                            <Typography
                              sx={{
                                fontSize: 14,
                                fontWeight: 600,
                                color: palette.text.primary,
                                mb: 1.5,
                              }}
                            >
                              Conversation (
                              {selectedLog.metadata.turn_count ||
                                (selectedLog.metadata.turns as Array<unknown>).length}{" "}
                              turns)
                            </Typography>
                            {selectedLog.metadata.scenario && (
                              <Typography
                                sx={{ fontSize: 12, color: palette.text.disabled, mb: 1.5 }}
                              >
                                Scenario: {selectedLog.metadata.scenario}
                              </Typography>
                            )}
                            <Box
                              sx={{
                                flex: 1,
                                backgroundColor: palette.accent.purple.bg,
                                border: `1px solid ${palette.accent.purple.border}`,
                                borderRadius: "8px",
                                p: 2.5,
                                overflowY: "auto",
                              }}
                            >
                              <Stack spacing={2}>
                                {(
                                  selectedLog.metadata.turns as Array<{
                                    role: string;
                                    content: string;
                                  }>
                                ).map((turn, idx) => {
                                  const isUser = turn.role?.toLowerCase() === "user";
                                  return (
                                    <Box
                                      key={idx}
                                      sx={{
                                        display: "flex",
                                        justifyContent: isUser ? "flex-end" : "flex-start",
                                      }}
                                    >
                                      <Box
                                        sx={{
                                          maxWidth: "85%",
                                          p: 1.5,
                                          borderRadius: "12px",
                                          backgroundColor: isUser
                                            ? palette.status.success.bg
                                            : palette.status.info.bg,
                                          border: isUser
                                            ? `1px solid ${palette.status.success.border}`
                                            : `1px solid ${palette.status.info.border}`,
                                        }}
                                      >
                                        <Typography
                                          sx={{
                                            fontWeight: 600,
                                            color: isUser
                                              ? palette.status.success.text
                                              : palette.status.info.text,
                                            fontSize: "10px",
                                            textTransform: "uppercase",
                                            mb: 0.5,
                                          }}
                                        >
                                          {isUser ? "User" : "Assistant"}
                                        </Typography>
                                        <MarkdownRenderer content={turn.content || ""} />
                                      </Box>
                                    </Box>
                                  );
                                })}
                              </Stack>
                            </Box>
                            {selectedLog.metadata.expected_outcome && (
                              <Box
                                sx={{
                                  mt: 2,
                                  p: 1.5,
                                  backgroundColor: palette.status.warning.bg,
                                  borderRadius: "6px",
                                  border: `1px solid ${palette.status.warning.border}`,
                                }}
                              >
                                <Typography
                                  sx={{
                                    fontSize: 11,
                                    fontWeight: 600,
                                    color: palette.status.warning.text,
                                  }}
                                >
                                  Expected Outcome:
                                </Typography>
                                <Typography
                                  sx={{ fontSize: 12, color: palette.status.warning.text, mt: 0.5 }}
                                >
                                  {selectedLog.metadata.expected_outcome}
                                </Typography>
                              </Box>
                            )}
                          </Box>
                        ) : (
                          <Box sx={{ flex: 1, display: "flex", flexDirection: "column" }}>
                            {/* Input */}
                            <Box sx={{ mb: 3 }}>
                              <Typography
                                sx={{
                                  fontSize: 14,
                                  fontWeight: 600,
                                  color: palette.text.primary,
                                  mb: 1,
                                }}
                              >
                                Input
                              </Typography>
                              <Box
                                sx={{
                                  p: 2.5,
                                  pl: 4,
                                  backgroundColor: palette.background.accent,
                                  border: `1px solid ${palette.border.light}`,
                                  borderRadius: "8px",
                                  maxHeight: "120px",
                                  overflowY: "auto",
                                }}
                              >
                                <Typography
                                  sx={{
                                    fontSize: 13,
                                    color: palette.text.secondary,
                                    lineHeight: 1.6,
                                  }}
                                >
                                  {selectedLog.input_text || "No input"}
                                </Typography>
                              </Box>
                            </Box>

                            {/* Output */}
                            <Box sx={{ flex: 1, display: "flex", flexDirection: "column" }}>
                              <Typography
                                sx={{
                                  fontSize: 14,
                                  fontWeight: 600,
                                  color: palette.text.primary,
                                  mb: 1,
                                }}
                              >
                                Output
                              </Typography>
                              <Box
                                sx={{
                                  flex: 1,
                                  p: 2.5,
                                  pl: 4,
                                  backgroundColor: palette.background.accent,
                                  border: `1px solid ${palette.border.light}`,
                                  borderRadius: "8px",
                                  overflowY: "auto",
                                }}
                              >
                                <MarkdownRenderer
                                  content={selectedLog.output_text || "No output"}
                                />
                              </Box>
                            </Box>
                          </Box>
                        )}
                      </Box>

                      {/* Right Panel: Metric Scores with Full Reasoning */}
                      <Box
                        sx={{ display: "flex", flexDirection: "column", overflowY: "auto", pl: 1 }}
                      >
                        <Typography
                          sx={{
                            fontSize: 14,
                            fontWeight: 600,
                            color: palette.text.primary,
                            mb: 1.5,
                          }}
                        >
                          Evaluation Metrics
                        </Typography>

                        {selectedLog.metadata?.metric_scores &&
                        Object.keys(selectedLog.metadata.metric_scores).length > 0 ? (
                          <Stack spacing={2} sx={{ flex: 1, overflowY: "auto", pr: 1 }}>
                            {Object.entries(selectedLog.metadata.metric_scores).map(
                              ([metricName, metricData]) => {
                                const score =
                                  typeof metricData === "number"
                                    ? metricData
                                    : (metricData as { score?: number })?.score;
                                const isInverse =
                                  metricName.toLowerCase().includes("bias") ||
                                  metricName.toLowerCase().includes("toxicity") ||
                                  metricName.toLowerCase().includes("hallucination");
                                const passed =
                                  typeof score === "number" &&
                                  (isInverse ? score < 0.5 : score >= 0.5);
                                const rawReason =
                                  typeof metricData === "object" && metricData !== null
                                    ? (metricData as { reason?: string }).reason
                                    : undefined;
                                const reason = parseMetricReason(rawReason);
                                const friendlyMetric = formatMetricName(
                                  metricName.replace(/^G-Eval\s*\((.+)\)$/i, "$1"),
                                );

                                return (
                                  <Box
                                    key={metricName}
                                    sx={{
                                      p: 2,
                                      borderRadius: "6px",
                                      backgroundColor: palette.background.main,
                                      border: `1px solid ${palette.border.light}`,
                                      borderLeft: `3px solid ${passed ? palette.status.success.text : palette.status.error.text}`,
                                    }}
                                  >
                                    <Stack
                                      direction="row"
                                      justifyContent="space-between"
                                      alignItems="center"
                                      sx={{ mb: 0.75 }}
                                    >
                                      <Typography
                                        sx={{
                                          fontSize: 13,
                                          fontWeight: 600,
                                          color: palette.text.primary,
                                        }}
                                      >
                                        {friendlyMetric}
                                      </Typography>
                                      <Typography
                                        sx={{
                                          fontSize: 13,
                                          fontWeight: 700,
                                          color: passed
                                            ? palette.status.success.text
                                            : palette.status.error.text,
                                        }}
                                      >
                                        {typeof score === "number"
                                          ? `${(score * 100).toFixed(0)}%`
                                          : "N/A"}
                                      </Typography>
                                    </Stack>

                                    {/* Progress bar - subtle */}
                                    <Box
                                      sx={{
                                        height: 4,
                                        backgroundColor: palette.background.hover,
                                        borderRadius: 2,
                                        overflow: "hidden",
                                        mb: reason ? 1.5 : 0,
                                      }}
                                    >
                                      <Box
                                        sx={{
                                          height: "100%",
                                          width: `${(typeof score === "number" ? score : 0) * 100}%`,
                                          backgroundColor: passed
                                            ? palette.status.success.text
                                            : palette.status.error.text,
                                          borderRadius: 2,
                                          transition: "width 0.3s ease",
                                        }}
                                      />
                                    </Box>

                                    {/* Full reasoning - not truncated */}
                                    {reason && (
                                      <Typography
                                        sx={{
                                          fontSize: 12,
                                          color: palette.text.disabled,
                                          lineHeight: 1.6,
                                        }}
                                      >
                                        {reason}
                                      </Typography>
                                    )}
                                  </Box>
                                );
                              },
                            )}
                          </Stack>
                        ) : (
                          <Box
                            sx={{
                              flex: 1,
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                            }}
                          >
                            <Typography sx={{ fontSize: 13, color: palette.text.disabled }}>
                              No metric scores available
                            </Typography>
                          </Box>
                        )}
                      </Box>
                    </Box>

                    {/* Error message if failed */}
                    {selectedLog.error_message && (
                      <Box
                        sx={{
                          mt: 2,
                          p: 2,
                          backgroundColor: palette.status.error.bg,
                          borderRadius: "6px",
                          border: `1px solid ${palette.status.error.border}`,
                        }}
                      >
                        <Typography
                          sx={{
                            fontSize: 12,
                            fontWeight: 600,
                            color: palette.status.error.text,
                            mb: 0.5,
                          }}
                        >
                          Error
                        </Typography>
                        <Typography
                          sx={{
                            fontSize: 12,
                            color: palette.status.error.text,
                            fontFamily: "monospace",
                            whiteSpace: "pre-wrap",
                          }}
                        >
                          {selectedLog.error_message}
                        </Typography>
                      </Box>
                    )}

                    {/* Footer: Metadata + Sample ID */}
                    <Box
                      sx={{
                        mt: 2,
                        pt: 2,
                        borderTop: `1px solid ${palette.border.light}`,
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                      }}
                    >
                      <Stack direction="row" spacing={3}>
                        {selectedLog.model_name && (
                          <Typography sx={{ fontSize: 11, color: palette.text.disabled }}>
                            <span style={{ fontWeight: 600 }}>Model:</span> {selectedLog.model_name}
                          </Typography>
                        )}
                        {selectedLog.latency_ms && (
                          <Typography sx={{ fontSize: 11, color: palette.text.disabled }}>
                            <span style={{ fontWeight: 600 }}>Latency:</span>{" "}
                            {selectedLog.latency_ms}ms
                          </Typography>
                        )}
                        {selectedLog.token_count && (
                          <Typography sx={{ fontSize: 11, color: palette.text.disabled }}>
                            <span style={{ fontWeight: 600 }}>Tokens:</span>{" "}
                            {selectedLog.token_count}
                          </Typography>
                        )}
                      </Stack>
                      <Typography
                        sx={{ fontSize: 10, color: palette.text.disabled, fontFamily: "monospace" }}
                      >
                        {selectedLog.id}
                      </Typography>
                    </Box>
                  </StandardModal>
                );
              })()}
          </>
        );
      })()}
    </Box>
  );
}
