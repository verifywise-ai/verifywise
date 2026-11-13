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
import VWTooltip from "../../components/VWTooltip";
import { EXPERIMENT_ACTION_TOOLTIPS } from "../../components/Table/ExperimentTable/actionTooltips";
import {
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
import { palette, radiusPx } from "../../themes/palette";
import {
  getExperiment,
  getLogs,
  updateExperiment,
  createExperiment,
  validateModel,
  type Experiment,
  type EvaluationLog,
} from "../../../application/repository/deepEval.repository";
import useFormattedDate from "../../../application/hooks/useFormattedDate";
import {
  entryScore,
  findMetricEntry,
  entryError,
  entryReason,
  entryThreshold,
  METRIC_STATUS_COLORS,
  metricStatus,
  SCORE_BAND_COLORS,
  scoreBand,
  type MetricScoreEntry,
} from "./metricScore";
import {
  METRIC_KEY_BY_DISPLAY_NAME,
  METRIC_LABELS,
  metricLabel,
  stripGEvalPrefix,
} from "./metricLabels";
import { countLabel } from "../../tools/countLabel";
import { Link as RouterLink } from "react-router";
import { fontFamily } from "../../themes/typography";

// Preprocess LaTeX delimiters to work with remark-math
const preprocessLatex = (text: string): string => {
  // Convert \[ \] to $$ $$ (display math)
  let processed = text.replace(/\\\[/g, "$$").replace(/\\\]/g, "$$");
  // Convert \( \) to $ $ (inline math)
  processed = processed.replace(/\\\(/g, "$").replace(/\\\)/g, "$");
  return processed;
};

// A metric name stored on a log ("Relevance", "G-Eval (Coherence)") as the shared display
// name, so the table, the cards and the sample view call a metric the same thing.
const storedMetricLabel = (storedName: string): string => {
  const name = stripGEvalPrefix(storedName);
  const key = METRIC_KEY_BY_DISPLAY_NAME[name] ?? (METRIC_LABELS[name] ? name : undefined);
  return key ? METRIC_LABELS[key] : metricLabel(name);
};

// Failures a user fixes in LLM Evals settings (keys, credits, quota, access)
const SETTINGS_FIXABLE_FAILURE =
  /api key|credit|quota|billing|budget|permission|unauthori[sz]ed|authentication/i;

// Markdown renderer with LaTeX support
const MarkdownRenderer = ({ content }: { content: string }) => {
  if (!content) return null;

  const processedContent = preprocessLatex(content);

  return (
    <Box
      sx={{
        "fontSize": 14,
        "color": palette.text.secondary,
        "lineHeight": 1.7,
        "& p": { mb: "2px", mt: 0 },
        "& h1": {
          fontSize: 16,
          fontWeight: 700,
          color: palette.text.primary,
          mt: "4px",
          mb: "2px",
        },
        "& h2": {
          fontSize: 15,
          fontWeight: 700,
          color: palette.text.primary,
          mt: "4px",
          mb: "2px",
        },
        "& h3": {
          fontSize: 14,
          fontWeight: 700,
          color: palette.text.primary,
          mt: "4px",
          mb: "2px",
        },
        "& h4": {
          fontSize: 14,
          fontWeight: 600,
          color: palette.text.primary,
          mt: "3px",
          mb: "1px",
        },
        "& ul, & ol": { pl: "7px", mb: "2px", ml: "1px" },
        "& li": { mb: "1px" },
        "& code": {
          backgroundColor: palette.background.hover,
          px: "1.5px",
          py: "0.5px",
          borderRadius: radiusPx.sm,
          fontFamily: fontFamily.mono,
          fontSize: 12,
          color: palette.accent.teal.text,
        },
        "& pre": {
          "backgroundColor": palette.text.primary,
          "borderRadius": radiusPx.md,
          "p": "4px",
          "my": "3px",
          "overflow": "auto",
          "& code": {
            backgroundColor: "transparent",
            color: palette.border.light,
            p: 0,
          },
        },
        "& strong": { fontWeight: 600 },
        "& em": { fontStyle: "italic" },
        "& hr": { border: "none", borderTop: `1px solid ${palette.border.light}`, my: "4px" },
        "& blockquote": {
          borderLeft: `3px solid ${palette.border.light}`,
          pl: "4px",
          ml: 0,
          color: palette.text.tertiary,
          fontStyle: "italic",
        },
        "& table": {
          borderCollapse: "collapse",
          width: "100%",
          my: "2px",
          fontSize: 12,
        },
        "& th, & td": {
          border: `1px solid ${palette.border.light}`,
          px: "2px",
          py: "1px",
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
          my: "2px",
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
  const formatDate = useFormattedDate();
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

      const nextName = `${experiment.name || "Eval"} (rerun ${formatDate(new Date())})`;

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
      <Box p="8px">
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

  // Why a failed run failed; shown as the banner's main line when present
  const failureReason =
    experiment.status === "failed" ? experiment.error_message?.trim() || undefined : undefined;
  const hideSamples = experiment.status === "failed" && logs.length === 0;

  const rerunDisabled = rerunLoading || experiment.status === "running";
  const rerunButton = (
    <CustomizableButton
      variant="contained"
      onClick={handleRerunExperiment}
      isDisabled={rerunDisabled}
      startIcon={<RotateCcw size={14} />}
      sx={{
        "backgroundColor": palette.brand.primary,
        "border": `1px solid ${palette.brand.primary}`,
        "&:hover": {
          backgroundColor: palette.brand.primaryHover,
          border: `1px solid ${palette.brand.primaryHover}`,
        },
      }}
    >
      {rerunLoading ? "Starting…" : "Rerun"}
    </CustomizableButton>
  );

  // Prompts of a finished run with no numeric score (e.g. the model returned nothing).
  // They are logged but left out of the averages, so the header shows both numbers.
  const unscoredPrompts =
    experiment.status === "completed"
      ? logs.filter(
          (log) =>
            !Object.values(
              (log.metadata?.metric_scores ?? {}) as Record<string, MetricScoreEntry>,
            ).some((entry) => entryScore(entry) !== null),
        ).length
      : 0;

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
      <Box sx={{ mb: "4px" }}>
        <Typography
          component="span"
          onClick={onBack}
          sx={{
            "fontSize": "13px",
            "color": palette.brand.primary,
            "cursor": "pointer",
            "textDecoration": "underline",
            "textDecorationStyle": "dashed",
            "textUnderlineOffset": "3px",
            "&:hover": {
              color: palette.brand.primaryHover,
            },
          }}
        >
          ← Back to experiments
        </Typography>
      </Box>

      {/* Header - Title and Actions */}
      <Box
        sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: "2px" }}
      >
        <Box
          sx={{
            "display": "inline-flex",
            "alignItems": "center",
            "gap": "1px",
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
                  "minWidth": "400px",
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
                sx={{ color: palette.text.tertiary }}
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
                  "opacity": 0,
                  "transition": "opacity 0.2s",
                  "color": palette.text.tertiary,
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
        <Stack direction="row" spacing="2px" alignItems="center" sx={{ mb: "6px" }}>
          <VWTooltip
            content={EXPERIMENT_ACTION_TOOLTIPS.downloadFull}
            placement="bottom"
            maxWidth={280}
            describeChild
          >
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
                "borderColor": palette.border.dark,
                "color": palette.text.secondary,
                "&:hover": {
                  borderColor: palette.brand.primary,
                  color: palette.brand.primary,
                  backgroundColor: palette.status.success.bg,
                },
              }}
            >
              Download
            </CustomizableButton>
          </VWTooltip>
          <VWTooltip
            content={EXPERIMENT_ACTION_TOOLTIPS.copyFull}
            placement="bottom"
            maxWidth={280}
            describeChild
          >
            <CustomizableButton
              variant="outlined"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(
                    JSON.stringify({ experiment, logs }, null, 2),
                  );
                  setAlert({ variant: "success", body: "Results copied to clipboard" });
                  setTimeout(() => setAlert(null), 3000);
                } catch (err) {
                  console.error("Failed to copy:", err);
                }
              }}
              startIcon={<Copy size={14} />}
              sx={{
                "borderColor": palette.border.dark,
                "color": palette.text.secondary,
                "&:hover": {
                  borderColor: palette.brand.primary,
                  color: palette.brand.primary,
                  backgroundColor: palette.status.success.bg,
                },
              }}
            >
              Copy results
            </CustomizableButton>
          </VWTooltip>
          <Box
            sx={{ width: "1px", height: "24px", backgroundColor: palette.border.light, mx: "1px" }}
          />
          <VWTooltip
            content={
              experiment.status === "running"
                ? EXPERIMENT_ACTION_TOOLTIPS.rerunWhileRunning
                : EXPERIMENT_ACTION_TOOLTIPS.rerun
            }
            placement="bottom-end"
            maxWidth={280}
            describeChild
          >
            {/* While the experiment runs, the disabled button fires no hover events, so a
                span carries the tooltip; otherwise the button takes it directly, so it is
                described. Not keyed on rerunLoading: clicking Rerun must not remount the
                hovered button (the brief "Starting…" state just shows no tooltip). */}
            {experiment.status === "running" ? (
              <Box component="span" sx={{ display: "inline-flex" }}>
                {rerunButton}
              </Box>
            ) : (
              rerunButton
            )}
          </VWTooltip>
        </Stack>
      </Box>

      {/* Summary Box - like Arena */}
      <Box
        sx={{
          p: "12px",
          borderRadius: radiusPx.sm,
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
          mb: "6px",
        }}
      >
        <Stack direction="row" alignItems="center" justifyContent="space-between">
          {/* Status Section */}
          <Stack
            direction="row"
            alignItems="center"
            spacing="4px"
            sx={failureReason ? { flex: 1, minWidth: 0, mr: "24px" } : undefined}
          >
            <Box sx={failureReason ? { minWidth: 0 } : undefined}>
              <Typography
                sx={{
                  fontSize: 12,
                  fontWeight: 600,
                  color:
                    experiment.status === "completed"
                      ? palette.status.success.text
                      : experiment.status === "failed"
                        ? palette.status.error.text
                        : palette.text.tertiary,
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
              {failureReason && (
                <VWTooltip
                  content={<Box sx={{ wordBreak: "break-word" }}>{failureReason}</Box>}
                  placement="bottom-start"
                  maxWidth={600}
                >
                  <Typography
                    data-testid="experiment-failure-reason"
                    sx={{
                      fontSize: 14,
                      fontWeight: 500,
                      color: palette.status.error.text,
                      wordBreak: "break-word",
                      display: "-webkit-box",
                      WebkitLineClamp: 3,
                      WebkitBoxOrient: "vertical",
                      overflow: "hidden",
                    }}
                  >
                    {failureReason}
                  </Typography>
                </VWTooltip>
              )}
              {failureReason && SETTINGS_FIXABLE_FAILURE.test(failureReason) && (
                // Only for key, credit, quota and access failures, which are fixed in settings
                <Box
                  component={RouterLink}
                  to={`/evals/${projectId}#settings`}
                  sx={{
                    "display": "block",
                    "width": "fit-content",
                    "mt": "4px",
                    "mb": "4px",
                    "fontSize": 13,
                    "fontWeight": 500,
                    "color": palette.brand.primary,
                    "textDecoration": "none",
                    "&:hover": { textDecoration: "underline" },
                  }}
                >
                  Check API keys in LLM Evals settings
                </Box>
              )}
              <Box
                sx={{
                  "display": "inline-flex",
                  "alignItems": "center",
                  "gap": "1px",
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
                      sx={{ "minWidth": "250px", "& .MuiOutlinedInput-root": { fontSize: "13px" } }}
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
                      sx={{ color: palette.text.tertiary }}
                    >
                      <X size={14} />
                    </IconButton>
                  </>
                ) : (
                  <>
                    <Typography
                      sx={{
                        fontSize: failureReason ? 12 : 14,
                        fontWeight: failureReason ? 400 : 500,
                        color: failureReason
                          ? palette.text.secondary
                          : experiment.status === "completed"
                            ? palette.status.success.text
                            : experiment.status === "failed"
                              ? palette.status.error.text
                              : palette.text.tertiary,
                      }}
                    >
                      {experiment.description ||
                        `Evaluating ${config.model?.name || "model"} with ${countLabel(logs.length, "prompt")}`}
                    </Typography>
                    <IconButton
                      size="small"
                      onClick={handleStartEditDescription}
                      className="edit-icon"
                      sx={{
                        "opacity": 0,
                        "transition": "opacity 0.2s",
                        "color": palette.text.tertiary,
                        "padding": "2px",
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
          <Stack direction="row" spacing="10px" alignItems="flex-start">
            <Box sx={{ textAlign: "center" }}>
              <Typography
                sx={{
                  fontSize: 12,
                  color:
                    experiment.status === "completed"
                      ? palette.status.success.text
                      : palette.text.tertiary,
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
                  fontSize: 12,
                  color:
                    experiment.status === "completed"
                      ? palette.status.success.text
                      : palette.text.tertiary,
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
                  fontSize: 12,
                  color:
                    experiment.status === "completed"
                      ? palette.status.success.text
                      : palette.text.tertiary,
                  textTransform: "uppercase",
                }}
              >
                Prompts
              </Typography>
              {unscoredPrompts > 0 ? (
                <VWTooltip
                  content={`${unscoredPrompts} of ${countLabel(logs.length, "prompt")} got no score, usually because the model returned no response or an error. They are left out of the averages.`}
                  placement="bottom"
                  maxWidth={280}
                >
                  <Typography
                    data-testid="experiment-scored-prompts"
                    sx={{
                      fontSize: 12,
                      fontWeight: 600,
                      color: palette.status.success.text,
                      cursor: "help",
                    }}
                  >
                    {logs.length} · {logs.length - unscoredPrompts} scored
                  </Typography>
                </VWTooltip>
              ) : (
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
              )}
            </Box>
            <Box sx={{ textAlign: "center" }}>
              <Typography
                sx={{
                  fontSize: 12,
                  color:
                    experiment.status === "completed"
                      ? palette.status.success.text
                      : palette.text.tertiary,
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
                {formatDate(experiment.created_at)}
              </Typography>
            </Box>
          </Stack>
        </Stack>
      </Box>

      {/* Overall Stats Header */}
      {logs.length > 0 &&
        (() => {
          // Calculate overall averages and per-sample scores for sparklines
          // threshold = the first one stored on the metric's entries (the run uses one).
          const metricsSum: Record<
            string,
            { sum: number; count: number; scores: number[]; threshold: number | null }
          > = {};
          logs.forEach((log) => {
            if (log.metadata?.metric_scores) {
              Object.entries(log.metadata.metric_scores).forEach(([rawKey, value]) => {
                // Normalize key: convert display names to camelCase, or keep if already camelCase
                const key = METRIC_KEY_BY_DISPLAY_NAME[rawKey] || rawKey;
                const score = entryScore(value as MetricScoreEntry);
                if (score !== null) {
                  if (!metricsSum[key])
                    metricsSum[key] = { sum: 0, count: 0, scores: [], threshold: null };
                  metricsSum[key].sum += score;
                  metricsSum[key].count += 1;
                  metricsSum[key].scores.push(score);
                  metricsSum[key].threshold ??= entryThreshold(value as MetricScoreEntry);
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
              label: METRIC_LABELS.answerRelevancy,
              category: "quality",
              singleTurnOnly: true,
            },
            // Universal core G-Eval metrics (single-turn)
            correctness: {
              label: METRIC_LABELS.correctness,
              category: "quality",
              singleTurnOnly: true,
            },
            completeness: {
              label: METRIC_LABELS.completeness,
              category: "quality",
              singleTurnOnly: true,
            },
            instructionFollowing: {
              label: METRIC_LABELS.instructionFollowing,
              category: "quality",
              singleTurnOnly: true,
            },
            faithfulness: {
              label: METRIC_LABELS.faithfulness,
              category: "quality",
              singleTurnOnly: true,
            },
            contextualRelevancy: {
              label: METRIC_LABELS.contextualRelevancy,
              category: "quality",
              singleTurnOnly: true,
            },
            contextualRecall: {
              label: METRIC_LABELS.contextualRecall,
              category: "quality",
              singleTurnOnly: true,
            },
            contextualPrecision: {
              label: METRIC_LABELS.contextualPrecision,
              category: "quality",
              singleTurnOnly: true,
            },
            // RAG metrics as the evaluator names them today
            contextRelevancy: {
              label: METRIC_LABELS.contextRelevancy,
              category: "quality",
              singleTurnOnly: true,
            },
            contextPrecision: {
              label: METRIC_LABELS.contextPrecision,
              category: "quality",
              singleTurnOnly: true,
            },
            contextRecall: {
              label: METRIC_LABELS.contextRecall,
              category: "quality",
              singleTurnOnly: true,
            },
            hallucination: {
              label: METRIC_LABELS.hallucination,
              category: "safety",
              singleTurnOnly: true,
            },
            // Agent metrics (single-turn)
            toolCorrectness: {
              label: METRIC_LABELS.toolCorrectness,
              category: "quality",
              singleTurnOnly: true,
            },
            toolSelection: {
              label: METRIC_LABELS.toolSelection,
              category: "quality",
              singleTurnOnly: true,
            },
            actionRelevance: {
              label: METRIC_LABELS.actionRelevance,
              category: "quality",
              singleTurnOnly: true,
            },
            planningQuality: {
              label: METRIC_LABELS.planningQuality,
              category: "quality",
              singleTurnOnly: true,
            },
            planQuality: {
              label: METRIC_LABELS.planQuality,
              category: "quality",
              singleTurnOnly: true,
            },
            planAdherence: {
              label: METRIC_LABELS.planAdherence,
              category: "quality",
              singleTurnOnly: true,
            },
            argumentCorrectness: {
              label: METRIC_LABELS.argumentCorrectness,
              category: "quality",
              singleTurnOnly: true,
            },
            stepEfficiency: {
              label: METRIC_LABELS.stepEfficiency,
              category: "quality",
              singleTurnOnly: true,
            },
            // G-Eval single-turn metrics
            answerCorrectness: {
              label: METRIC_LABELS.answerCorrectness,
              category: "quality",
              singleTurnOnly: true,
            },
            coherence: {
              label: METRIC_LABELS.coherence,
              category: "quality",
              singleTurnOnly: true,
            },
            tonality: { label: METRIC_LABELS.tonality, category: "quality", singleTurnOnly: true },
            safety: { label: METRIC_LABELS.safety, category: "safety", singleTurnOnly: true },

            // Safety metrics (work for both single-turn and multi-turn)
            bias: { label: METRIC_LABELS.bias, category: "safety" },
            toxicity: { label: METRIC_LABELS.toxicity, category: "safety" },

            // === CONVERSATIONAL METRICS (multi-turn ONLY) ===
            turnRelevancy: {
              label: METRIC_LABELS.turnRelevancy,
              category: "conversational",
              multiTurnOnly: true,
            },
            knowledgeRetention: {
              label: METRIC_LABELS.knowledgeRetention,
              category: "conversational",
              multiTurnOnly: true,
            },
            conversationCoherence: {
              label: METRIC_LABELS.conversationCoherence,
              category: "conversational",
              multiTurnOnly: true,
            },
            conversationHelpfulness: {
              label: METRIC_LABELS.conversationHelpfulness,
              category: "conversational",
              multiTurnOnly: true,
            },
            // Scored for conversations and for single-turn (agent) runs alike.
            taskCompletion: {
              label: METRIC_LABELS.taskCompletion,
              category: isMultiTurnExperiment ? "conversational" : "quality",
            },
            conversationSafety: {
              label: METRIC_LABELS.conversationSafety,
              category: "conversational",
              multiTurnOnly: true,
            },
            // Legacy conversational names (for backwards compatibility)
            conversationCompleteness: {
              label: METRIC_LABELS.conversationCompleteness,
              category: "conversational",
              multiTurnOnly: true,
            },
            conversationRelevancy: {
              label: METRIC_LABELS.conversationRelevancy,
              category: "conversational",
              multiTurnOnly: true,
            },
            roleAdherence: {
              label: METRIC_LABELS.roleAdherence,
              category: "conversational",
              multiTurnOnly: true,
            },
            conversationQuality: {
              label: METRIC_LABELS.conversationQuality,
              category: "conversational",
              multiTurnOnly: true,
            },
          };

          // Colour the average against the metric's pass line (see scoreBand).
          const getScoreColor = (
            score: number | undefined,
            metricName: string,
            threshold: number | null,
            passFailOnly: boolean,
          ) => {
            if (score === undefined)
              return {
                bg: palette.status.default.bg,
                text: palette.status.default.text,
                icon: palette.status.default.text,
              };
            const band = scoreBand(metricName, score, threshold, { passFailOnly });
            const { bg, text } = SCORE_BAND_COLORS[band];
            return { bg, text, icon: text };
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
            .filter((k) => !metricDefinitions[k] && !METRIC_KEY_BY_DISPLAY_NAME[k])
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
            // Custom scorers use their own score scale, so they get pass/fail colours only.
            const colors = getScoreColor(
              avgValue,
              metric.label,
              entry?.threshold ?? null,
              metric.category === "scorer",
            );
            const BackgroundIcon = getMetricIcon(metric.key);

            return (
              <Card
                key={metric.key}
                elevation={0}
                sx={{
                  "position": "relative",
                  "overflow": "hidden",
                  "background": `linear-gradient(135deg, ${palette.background.main} 0%, ${palette.background.accent} 100%)`,
                  "border": `1px solid ${palette.border.dark}`,
                  "borderRadius": radiusPx.sm,
                  "transition": "all 0.2s ease",
                  "&:hover": {
                    "background": `linear-gradient(135deg, ${palette.background.accent} 0%, ${palette.background.hover} 100%)`,
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
                    "p": "16px",
                    "position": "relative",
                    "zIndex": 1,
                    "&:last-child": { pb: "16px" },
                  }}
                >
                  <Box
                    sx={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      mb: "3px",
                    }}
                  >
                    <Typography
                      variant="body2"
                      sx={{ fontSize: "13px", fontWeight: 400, color: palette.text.tertiary }}
                    >
                      {metric.label}
                    </Typography>
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
                        fontVariantNumeric: "tabular-nums",
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
                  <Typography variant="h6" sx={{ fontSize: "15px", fontWeight: 600, mb: "4px" }}>
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
                  <Typography variant="h6" sx={{ fontSize: "15px", fontWeight: 600, mb: "4px" }}>
                    Conversational metrics
                    <Typography
                      component="span"
                      sx={{
                        fontSize: "12px",
                        fontWeight: 400,
                        color: palette.text.tertiary,
                        ml: "2px",
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
                  <Typography variant="h6" sx={{ fontSize: "15px", fontWeight: 600, mb: "4px" }}>
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
                  <Typography variant="h6" sx={{ fontSize: "15px", fontWeight: 600, mb: "4px" }}>
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
      {/* A run that failed before producing any sample has nothing to list */}
      {!hideSamples && (
        <Typography variant="h6" sx={{ fontSize: "15px", fontWeight: 600, mb: "8px" }}>
          All samples
        </Typography>
      )}
      {/* Extract unique metric names from all logs */}
      {!hideSamples &&
        (() => {
          // One column per metric: names that mean the same metric ("Relevance" and the
          // legacy "Answer Relevancy") share a column instead of two with one header
          const columnsByLabel = new Map<string, string[]>();
          logs.forEach((log) => {
            if (log.metadata?.metric_scores) {
              Object.keys(log.metadata.metric_scores).forEach((rawName) => {
                const name = stripGEvalPrefix(rawName);
                const label = storedMetricLabel(name);
                const names = columnsByLabel.get(label) ?? [];
                if (!names.includes(name)) names.push(name);
                columnsByLabel.set(label, names);
              });
            }
          });
          const metricColumns = Array.from(columnsByLabel, ([label, names]) => ({ label, names }));

          // A log's entry for a column: the first of the column's stored names it has
          const getMetricEntry = (
            log: EvaluationLog,
            column: { names: string[] },
          ): MetricScoreEntry => {
            const scores = log.metadata?.metric_scores as
              Record<string, MetricScoreEntry> | undefined;
            for (const name of column.names) {
              const entry = findMetricEntry(scores, name);
              if (entry !== undefined) return entry;
            }
            return undefined;
          };

          return (
            <>
              <Box
                sx={{
                  overflow: "hidden",
                  border: `1px solid ${palette.border.dark}`,
                  borderRadius: radiusPx.sm,
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
                                fontSize: "12px",
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
                                fontSize: "12px",
                                width: inputColWidth,
                                textAlign: "center",
                                padding: "12px 16px",
                                borderBottom: `2px solid ${palette.border.dark}`,
                                borderRight: `1px solid ${palette.border.dark}`,
                              }}
                            >
                              Input
                            </th>
                            {metricColumns.map((column) => (
                              <th
                                key={column.label}
                                style={{
                                  fontWeight: 600,
                                  fontSize: "12px",
                                  width: metricColWidth,
                                  textAlign: "center",
                                  padding: "12px 8px",
                                  borderBottom: `2px solid ${palette.border.dark}`,
                                  borderRight: `1px solid ${palette.border.dark}`,
                                }}
                              >
                                {column.label}
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
                              color: palette.text.tertiary,
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
                                color: palette.text.tertiary,
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
                            {metricColumns.map((column) => {
                              const entry = getMetricEntry(log, column);
                              const score = entryScore(entry);
                              const status = metricStatus(column.names[0], entry);
                              // No score: an error reads "Error", a fail verdict without a score
                              // reads "Failed" (both count as failures, so red); a metric that
                              // was skipped or never ran is neutral ("Not scored")
                              const unscored = score === null;
                              const errorText = entryError(entry);
                              const failedWithoutScore = unscored && status === "failed";
                              return (
                                <td
                                  key={column.label}
                                  title={
                                    errorText ||
                                    (failedWithoutScore
                                      ? "The judge marked this metric as failed without a score"
                                      : unscored
                                        ? "This metric returned no score"
                                        : undefined)
                                  }
                                  style={{
                                    textAlign: "center",
                                    padding: "12px 16px",
                                    borderBottom: `1px solid ${palette.border.dark}`,
                                    borderRight: `1px solid ${palette.border.dark}`,
                                    backgroundColor:
                                      unscored && !failedWithoutScore
                                        ? "transparent"
                                        : METRIC_STATUS_COLORS[status].bg,
                                    fontSize: "12px",
                                    fontWeight: 500,
                                    color: failedWithoutScore
                                      ? palette.status.error.text
                                      : unscored
                                        ? palette.text.tertiary
                                        : palette.text.secondary,
                                  }}
                                >
                                  {!unscored
                                    ? `${(score * 100).toFixed(0)}%`
                                    : errorText
                                      ? "Error"
                                      : failedWithoutScore
                                        ? "Failed"
                                        : "Not scored"}
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
                  const metricScores = (selectedLog.metadata?.metric_scores || {}) as Record<
                    string,
                    MetricScoreEntry
                  >;
                  const statuses = Object.entries(metricScores)
                    .map(([name, data]) => metricStatus(name, data))
                    .filter((status) => status !== "notEvaluated");
                  const passedCount = statuses.filter((status) => status === "passed").length;

                  return (
                    <StandardModal
                      isOpen={selectedSampleIndex !== null}
                      onClose={() => setSelectedSampleIndex(null)}
                      title={`Sample ${selectedSampleIndex + 1}`}
                      description={
                        statuses.length === 0
                          ? "No metrics were evaluated"
                          : `${passedCount} of ${countLabel(statuses.length, "metric")} passed`
                      }
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
                              "minWidth": "100px",
                              "height": "34px",
                              "border": `1px solid ${palette.border.dark}`,
                              "color": isFirstSample
                                ? palette.text.disabled
                                : palette.text.secondary,
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
                              "minWidth": "100px",
                              "height": "34px",
                              "border": `1px solid ${palette.border.dark}`,
                              "color": isLastSample
                                ? palette.text.disabled
                                : palette.text.secondary,
                              "&:hover:not(.Mui-disabled)": {
                                backgroundColor: palette.background.accent,
                                border: `1px solid ${palette.border.dark}`,
                              },
                              "flexDirection": "row-reverse",
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
                            pr: "8px",
                          }}
                        >
                          {/* Conversational Display (for multi-turn) */}
                          {selectedLog.metadata?.is_conversational &&
                          selectedLog.metadata?.turns ? (
                            <Box sx={{ flex: 1, display: "flex", flexDirection: "column" }}>
                              <Typography
                                sx={{
                                  fontSize: 14,
                                  fontWeight: 600,
                                  color: palette.text.primary,
                                  mb: "3px",
                                }}
                              >
                                Conversation (
                                {selectedLog.metadata.turn_count ||
                                  (selectedLog.metadata.turns as Array<unknown>).length}{" "}
                                turns)
                              </Typography>
                              {selectedLog.metadata.scenario && (
                                <Typography
                                  sx={{ fontSize: 12, color: palette.text.tertiary, mb: "3px" }}
                                >
                                  Scenario: {selectedLog.metadata.scenario}
                                </Typography>
                              )}
                              <Box
                                sx={{
                                  flex: 1,
                                  backgroundColor: palette.accent.purple.bg,
                                  border: `1px solid ${palette.accent.purple.border}`,
                                  borderRadius: radiusPx.lg,
                                  p: "5px",
                                  overflowY: "auto",
                                }}
                              >
                                <Stack spacing="4px">
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
                                            p: "3px",
                                            borderRadius: radiusPx.xl,
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
                                              fontSize: "12px",
                                              textTransform: "uppercase",
                                              mb: "1px",
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
                                    mt: "4px",
                                    p: "3px",
                                    backgroundColor: palette.status.warning.bg,
                                    borderRadius: radiusPx.md,
                                    border: `1px solid ${palette.status.warning.border}`,
                                  }}
                                >
                                  <Typography
                                    sx={{
                                      fontSize: 12,
                                      fontWeight: 600,
                                      color: palette.status.warning.text,
                                    }}
                                  >
                                    Expected outcome:
                                  </Typography>
                                  <Typography
                                    sx={{
                                      fontSize: 12,
                                      color: palette.status.warning.text,
                                      mt: "1px",
                                    }}
                                  >
                                    {selectedLog.metadata.expected_outcome}
                                  </Typography>
                                </Box>
                              )}
                            </Box>
                          ) : (
                            <Box sx={{ flex: 1, display: "flex", flexDirection: "column" }}>
                              {/* Input */}
                              <Box sx={{ mb: "6px" }}>
                                <Typography
                                  sx={{
                                    fontSize: 14,
                                    fontWeight: 600,
                                    color: palette.text.primary,
                                    mb: "2px",
                                  }}
                                >
                                  Input
                                </Typography>
                                <Box
                                  sx={{
                                    p: "5px",
                                    pl: "8px",
                                    backgroundColor: palette.background.accent,
                                    border: `1px solid ${palette.border.light}`,
                                    borderRadius: radiusPx.lg,
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
                                    mb: "2px",
                                  }}
                                >
                                  Output
                                </Typography>
                                <Box
                                  sx={{
                                    flex: 1,
                                    p: "5px",
                                    pl: "8px",
                                    backgroundColor: palette.background.accent,
                                    border: `1px solid ${palette.border.light}`,
                                    borderRadius: radiusPx.lg,
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
                          sx={{
                            display: "flex",
                            flexDirection: "column",
                            overflowY: "auto",
                            pl: "2px",
                          }}
                        >
                          <Typography
                            sx={{
                              fontSize: 14,
                              fontWeight: 600,
                              color: palette.text.primary,
                              mb: "3px",
                            }}
                          >
                            Evaluation metrics
                          </Typography>

                          {selectedLog.metadata?.metric_scores &&
                          Object.keys(selectedLog.metadata.metric_scores).length > 0 ? (
                            <Stack spacing="4px" sx={{ flex: 1, overflowY: "auto", pr: "2px" }}>
                              {Object.entries(selectedLog.metadata.metric_scores).map(
                                ([metricName, metricData]) => {
                                  const entry = metricData as MetricScoreEntry;
                                  const score = entryScore(entry);
                                  const status = metricStatus(metricName, entry);
                                  const statusColor = METRIC_STATUS_COLORS[status].text;
                                  // An error explains the failure, so it wins over the judge's
                                  // reason and is shown as written.
                                  const reason =
                                    entryError(entry) || parseMetricReason(entryReason(entry));
                                  const friendlyMetric = storedMetricLabel(metricName);

                                  return (
                                    <Box
                                      key={metricName}
                                      sx={{
                                        p: "4px",
                                        borderRadius: radiusPx.md,
                                        backgroundColor: palette.background.main,
                                        border: `1px solid ${palette.border.light}`,
                                        borderLeft: `3px solid ${statusColor}`,
                                      }}
                                    >
                                      <Stack
                                        direction="row"
                                        justifyContent="space-between"
                                        alignItems="center"
                                        sx={{ mb: "1.5px" }}
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
                                            color: statusColor,
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
                                          borderRadius: "2px",
                                          overflow: "hidden",
                                          mb: reason ? "8px" : 0,
                                        }}
                                      >
                                        <Box
                                          sx={{
                                            height: "100%",
                                            width: `${(score ?? 0) * 100}%`,
                                            backgroundColor: statusColor,
                                            borderRadius: "2px",
                                            transition: "width 0.3s ease",
                                          }}
                                        />
                                      </Box>

                                      {/* Full reasoning - not truncated */}
                                      {reason && (
                                        <Typography
                                          sx={{
                                            fontSize: 13,
                                            color: palette.text.secondary,
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
                              <Typography sx={{ fontSize: 13, color: palette.text.tertiary }}>
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
                            mt: "4px",
                            p: "4px",
                            backgroundColor: palette.status.error.bg,
                            borderRadius: radiusPx.md,
                            border: `1px solid ${palette.status.error.border}`,
                          }}
                        >
                          <Typography
                            sx={{
                              fontSize: 12,
                              fontWeight: 600,
                              color: palette.status.error.text,
                              mb: "1px",
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
                          mt: "4px",
                          pt: "4px",
                          borderTop: `1px solid ${palette.border.light}`,
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                        }}
                      >
                        <Stack direction="row" spacing="6px">
                          {selectedLog.model_name && (
                            <Typography sx={{ fontSize: 12, color: palette.text.tertiary }}>
                              <span style={{ fontWeight: 600 }}>Model:</span>{" "}
                              {selectedLog.model_name}
                            </Typography>
                          )}
                          {selectedLog.latency_ms && (
                            <Typography sx={{ fontSize: 12, color: palette.text.tertiary }}>
                              <span style={{ fontWeight: 600 }}>Latency:</span>{" "}
                              {selectedLog.latency_ms}ms
                            </Typography>
                          )}
                          {selectedLog.token_count && (
                            <Typography sx={{ fontSize: 12, color: palette.text.tertiary }}>
                              <span style={{ fontWeight: 600 }}>Tokens:</span>{" "}
                              {selectedLog.token_count}
                            </Typography>
                          )}
                        </Stack>
                        <Typography
                          sx={{
                            fontSize: 12,
                            color: palette.text.tertiary,
                            fontFamily: "monospace",
                          }}
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
