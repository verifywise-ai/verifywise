import { useState, useCallback, useEffect } from "react";
import { useNavigate } from "react-router";
import {
  Box,
  Typography,
  Stack,
  Divider,
  IconButton,
  Slider,
  Select as MuiSelect,
  MenuItem,
  TextField,
  CircularProgress,
  Tooltip,
} from "@mui/material";
import { Plus, Trash2, HelpCircle } from "lucide-react";
import StandardModal from "../../components/Modals/StandardModal";
import Field from "../../components/Inputs/Field";
import ModelSelector from "../../components/Inputs/ModelSelector";
import { CustomizableButton } from "../../components/button/customizable-button";
import {
  getAllLlmApiKeys,
  type LLMApiKey,
} from "../../../application/repository/deepEval.repository";
import { palette } from "../../themes/palette";

interface ChoiceScore {
  label: string;
  score: number;
}

interface Message {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ModelParams {
  temperature: number;
  maxTokens: number;
  topP: number;
}

export interface ScorerConfig {
  name: string;
  slug: string;
  type: "llm";
  // LLM Judge config
  provider: string;
  model: string;
  modelParams: ModelParams;
  messages: Message[];
  useChainOfThought: boolean;
  choiceScores: ChoiceScore[];
  passThreshold: number;
  // Self-hosted fields
  endpointUrl?: string;
  apiKey?: string;
  // Variables schema
  inputSchema: string;
}

interface CreateScorerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (config: ScorerConfig) => Promise<void>;
  initialConfig?: Partial<ScorerConfig>;
  isEditing?: boolean;
  projectId: string;
}

// Section heading with an optional info tooltip
function SectionHeading({ label, tooltip }: { label: string; tooltip: string }) {
  return (
    <Stack direction="row" alignItems="center" gap={0.75} mb={1.5}>
      <Typography sx={{ fontSize: 13, fontWeight: 600, color: palette.text.secondary }}>
        {label}
      </Typography>
      <Tooltip title={tooltip} placement="right" arrow>
        <HelpCircle size={13} color={palette.text.disabled} style={{ cursor: "help" }} />
      </Tooltip>
    </Stack>
  );
}

// Simple score text input (0 to 1)
function ScoreInput({ value, onChange }: { value: number; onChange: (val: number) => void }) {
  const [inputValue, setInputValue] = useState(value.toString());

  // Sync with external value changes
  useEffect(() => {
    setInputValue(value.toString());
  }, [value]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    // Allow typing any valid decimal pattern, convert comma to dot
    const raw = e.target.value.replace(",", ".");
    // Allow empty, digits, and one decimal point
    if (raw === "" || /^[0-9]*\.?[0-9]*$/.test(raw)) {
      setInputValue(raw);
    }
  };

  const handleBlur = () => {
    // On blur, validate and update parent
    const numVal = parseFloat(inputValue);
    if (inputValue === "" || isNaN(numVal)) {
      setInputValue("0");
      onChange(0);
    } else {
      // Clamp between 0 and 1
      const clamped = Math.min(1, Math.max(0, Math.round(numVal * 100) / 100));
      setInputValue(clamped.toString());
      onChange(clamped);
    }
  };

  return (
    <TextField
      size="small"
      value={inputValue}
      onChange={handleChange}
      onBlur={handleBlur}
      sx={{
        "width": 100,
        "& .MuiInputBase-input": {
          fontSize: "13px",
          textAlign: "center",
        },
        "& .MuiOutlinedInput-root": {
          borderRadius: "4px",
        },
      }}
    />
  );
}

const DEFAULT_INPUT_SCHEMA = `{
  "input": "",
  "output": "",
  "expected": "",
  "metadata": {}
}`;

// Braintrust-style Model Selector Component
export default function CreateScorerModal({
  isOpen,
  onClose,
  onSubmit,
  initialConfig,
  isEditing: _isEditing = false,
  projectId,
}: CreateScorerModalProps) {
  void _isEditing; // Reserved for future use
  const navigate = useNavigate();

  const [config, setConfig] = useState<ScorerConfig>({
    name: initialConfig?.name || "",
    slug: initialConfig?.slug || "",
    type: "llm",
    provider: initialConfig?.provider || "",
    model: initialConfig?.model || "",
    modelParams: initialConfig?.modelParams || {
      temperature: 0.7,
      maxTokens: 2048,
      topP: 1,
    },
    messages: initialConfig?.messages || [
      {
        role: "system",
        content:
          "You are an AI evaluator. Assess the quality of the AI response based on accuracy and relevance to the input.",
      },
      {
        role: "user",
        content:
          'Input: {{input}}\n\nAI Response: {{output}}\n\nExpected Answer: {{expected}}\n\nEvaluate whether the AI response is satisfactory. Reply with JSON only, in this exact format: {"verdict": "PASS", "reason": "brief explanation"}',
      },
    ],
    useChainOfThought: initialConfig?.useChainOfThought ?? true,
    choiceScores: initialConfig?.choiceScores || [
      { label: "PASS", score: 1 },
      { label: "FAIL", score: 0 },
    ],
    passThreshold: initialConfig?.passThreshold ?? 0.5,
    endpointUrl: initialConfig?.endpointUrl || "",
    apiKey: initialConfig?.apiKey || "",
    inputSchema: initialConfig?.inputSchema || DEFAULT_INPUT_SCHEMA,
  });

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [configuredProviders, setConfiguredProviders] = useState<LLMApiKey[]>([]);
  const [loadingProviders, setLoadingProviders] = useState(true);

  // Update config when initialConfig changes (for editing)
  useEffect(() => {
    if (initialConfig) {
      setConfig({
        name: initialConfig.name || "",
        slug: initialConfig.slug || "",
        type: "llm",
        provider: initialConfig.provider || "",
        model: initialConfig.model || "",
        modelParams: initialConfig.modelParams || {
          temperature: 0.7,
          maxTokens: 2048,
          topP: 1,
        },
        messages: initialConfig.messages || [
          {
            role: "system",
            content:
              "You are an AI evaluator. Assess the quality of the AI response based on accuracy and relevance to the input.",
          },
          {
            role: "user",
            content:
              'Input: {{input}}\n\nAI Response: {{output}}\n\nExpected Answer: {{expected}}\n\nEvaluate whether the AI response is satisfactory. Reply with JSON only, in this exact format: {"verdict": "PASS", "reason": "brief explanation"}',
          },
        ],
        useChainOfThought: initialConfig.useChainOfThought ?? true,
        choiceScores: initialConfig.choiceScores || [
          { label: "PASS", score: 1 },
          { label: "FAIL", score: 0 },
        ],
        passThreshold: initialConfig.passThreshold ?? 0.5,
        endpointUrl: initialConfig.endpointUrl || "",
        apiKey: initialConfig.apiKey || "",
        inputSchema: initialConfig.inputSchema || DEFAULT_INPUT_SCHEMA,
      });
    } else {
      // Reset to defaults when creating new
      setConfig({
        name: "",
        slug: "",
        type: "llm",
        provider: "",
        model: "",
        modelParams: {
          temperature: 0.7,
          maxTokens: 2048,
          topP: 1,
        },
        messages: [
          {
            role: "system",
            content:
              "You are an AI evaluator. Assess the quality of the AI response based on accuracy and relevance to the input.",
          },
          {
            role: "user",
            content:
              'Input: {{input}}\n\nAI Response: {{output}}\n\nExpected Answer: {{expected}}\n\nEvaluate whether the AI response is satisfactory. Reply with JSON only, in this exact format: {"verdict": "PASS", "reason": "brief explanation"}',
          },
        ],
        useChainOfThought: true,
        choiceScores: [
          { label: "PASS", score: 1 },
          { label: "FAIL", score: 0 },
        ],
        passThreshold: 0.5,
        endpointUrl: "",
        apiKey: "",
        inputSchema: DEFAULT_INPUT_SCHEMA,
      });
    }
  }, [initialConfig, isOpen]);

  // Fetch configured providers on mount
  useEffect(() => {
    if (isOpen) {
      setLoadingProviders(true);
      getAllLlmApiKeys()
        .then((keys) => {
          setConfiguredProviders(keys);
          // Set default provider to first configured one (only if not already set and not editing)
          setConfig((prev) => {
            if (keys.length > 0 && !prev.provider && !initialConfig) {
              // No model preselected: the bundled list's first entry may not be served.
              return { ...prev, provider: keys[0].provider, model: "" };
            }
            return prev;
          });
        })
        .catch((err) => {
          console.error("Failed to fetch configured providers:", err);
        })
        .finally(() => {
          setLoadingProviders(false);
        });
    }
  }, [isOpen, initialConfig]);

  // Auto-generate slug from name
  const handleNameChange = useCallback((name: string) => {
    const slug = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "");
    setConfig((prev) => ({ ...prev, name, slug }));
  }, []);

  // Handle provider change - reset model when provider changes
  const handleProviderChange = useCallback((providerId: string) => {
    setConfig((prev) => ({
      ...prev,
      provider: providerId,
      model: "",
      ...(providerId !== "self-hosted" ? { endpointUrl: "", apiKey: "" } : {}),
    }));
  }, []);

  // Handle model change
  const handleModelChange = useCallback((modelId: string) => {
    setConfig((prev) => ({
      ...prev,
      model: modelId,
    }));
  }, []);

  const handleEndpointUrlChange = useCallback((url: string) => {
    setConfig((prev) => ({ ...prev, endpointUrl: url }));
  }, []);

  const handleApiKeyChange = useCallback((key: string) => {
    setConfig((prev) => ({ ...prev, apiKey: key }));
  }, []);

  const handleAddMessage = useCallback(() => {
    setConfig((prev) => ({
      ...prev,
      messages: [...prev.messages, { role: "user", content: "" }],
    }));
  }, []);

  const handleRemoveMessage = useCallback((index: number) => {
    setConfig((prev) => ({
      ...prev,
      messages: prev.messages.filter((_, i) => i !== index),
    }));
  }, []);

  const handleUpdateMessage = useCallback(
    (index: number, field: "role" | "content", value: string) => {
      setConfig((prev) => ({
        ...prev,
        messages: prev.messages.map((msg, i) =>
          i === index
            ? { ...msg, [field]: field === "role" ? (value as Message["role"]) : value }
            : msg,
        ),
      }));
    },
    [],
  );

  const handleAddChoiceScore = useCallback(() => {
    setConfig((prev) => ({
      ...prev,
      choiceScores: [...prev.choiceScores, { label: "", score: 0 }],
    }));
  }, []);

  const handleRemoveChoiceScore = useCallback((index: number) => {
    setConfig((prev) => ({
      ...prev,
      choiceScores: prev.choiceScores.filter((_, i) => i !== index),
    }));
  }, []);

  const handleUpdateChoiceScore = useCallback(
    (index: number, field: "label" | "score", value: string | number) => {
      setConfig((prev) => ({
        ...prev,
        choiceScores: prev.choiceScores.map((cs, i) =>
          i === index ? { ...cs, [field]: value } : cs,
        ),
      }));
    },
    [],
  );

  const handleSubmit = async () => {
    setIsSubmitting(true);
    try {
      await onSubmit(config);
      onClose();
    } catch (error) {
      console.error("Failed to save scorer:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Validation
  const isValid =
    config.name.trim() &&
    config.slug.trim() &&
    config.messages.length > 0 &&
    config.choiceScores.some((cs) => cs.label.trim()) &&
    // A judge provider needs a model; none is preselected
    (!config.provider || config.model.trim());

  return (
    <StandardModal
      isOpen={isOpen}
      onClose={onClose}
      title={initialConfig?.name ? "Edit scorer" : "Create scorer"}
      description={
        initialConfig?.name
          ? "Update your scorer configuration."
          : "A scorer is a custom LLM judge that evaluates model outputs against your criteria. Define the prompt, grading choices, and pass threshold — the judge runs automatically on each experiment."
      }
      onSubmit={handleSubmit}
      submitButtonText={initialConfig?.name ? "Save changes" : "Save as custom scorer"}
      isSubmitting={isSubmitting || !isValid}
      maxWidth="780px"
    >
      <Stack spacing={0}>
        {/* ── Name & Slug ── */}
        <Stack direction="row" spacing={2} mb={3}>
          <Box sx={{ flex: 1 }}>
            <Stack direction="row" alignItems="center" gap={0.75} mb={0.75}>
              <Typography sx={{ fontSize: 13, fontWeight: 500, color: palette.text.secondary }}>
                Name <span style={{ color: palette.status.error.text }}>*</span>
              </Typography>
              <Tooltip
                title="A human-readable name for this scorer, shown in dropdowns and reports."
                placement="right"
                arrow
              >
                <HelpCircle size={13} color={palette.text.disabled} style={{ cursor: "help" }} />
              </Tooltip>
            </Stack>
            <Field
              label=""
              placeholder="e.g. Relevance judge"
              value={config.name}
              onChange={(e) => handleNameChange(e.target.value)}
            />
          </Box>
          <Box sx={{ flex: 1 }}>
            <Stack direction="row" alignItems="center" gap={0.75} mb={0.75}>
              <Typography sx={{ fontSize: 13, fontWeight: 500, color: palette.text.secondary }}>
                Slug <span style={{ color: palette.status.error.text }}>*</span>
              </Typography>
              <Tooltip
                title="A URL-safe identifier used internally. Auto-generated from the name."
                placement="right"
                arrow
              >
                <HelpCircle size={13} color={palette.text.disabled} style={{ cursor: "help" }} />
              </Tooltip>
            </Stack>
            <Field
              label=""
              placeholder="e.g. relevance_judge"
              value={config.slug}
              onChange={(e) => setConfig((prev) => ({ ...prev, slug: e.target.value }))}
            />
          </Box>
        </Stack>

        <Divider sx={{ mb: 3 }} />

        {/* ── Judge model ── */}
        <Box mb={3}>
          <SectionHeading
            label="Judge model"
            tooltip="The LLM that will act as the evaluator. It reads your prompt and returns one of the choice scores you define below."
          />
          {loadingProviders ? (
            <Stack direction="row" alignItems="center" gap={1} sx={{ py: 1 }}>
              <CircularProgress size={16} />
              <Typography sx={{ fontSize: 13, color: palette.text.tertiary }}>
                Loading providers...
              </Typography>
            </Stack>
          ) : (
            <ModelSelector
              provider={config.provider}
              model={config.model}
              onProviderChange={handleProviderChange}
              onModelChange={handleModelChange}
              configuredProviders={configuredProviders}
              onNavigateToSettings={() => {
                onClose();
                navigate(`/evals/${projectId}#settings`);
              }}
              endpointUrl={config.endpointUrl}
              apiKey={config.apiKey}
              onEndpointUrlChange={handleEndpointUrlChange}
              onApiKeyChange={handleApiKeyChange}
            />
          )}
          {/* Save stays disabled until a model is chosen; say why */}
          {!loadingProviders && config.provider && !config.model.trim() && (
            <Typography sx={{ fontSize: 11, color: palette.text.tertiary, mt: "4px" }}>
              Choose a judge model to save this scorer
            </Typography>
          )}
        </Box>

        <Divider sx={{ mb: 3 }} />

        {/* ── Prompt ── */}
        <Box mb={3}>
          <SectionHeading
            label="Prompt"
            tooltip="The messages sent to the judge LLM. Use {{input}}, {{output}}, and {{expected}} to inject test-case values. The judge should return one of your choice labels."
          />
          <Typography sx={{ fontSize: 12, color: palette.text.tertiary, mb: 1.5 }}>
            Variables:{" "}
            <code
              style={{ background: palette.background.accent, padding: "1px 5px", borderRadius: 3 }}
            >
              {"{{input}}"}
            </code>{" "}
            <code
              style={{ background: palette.background.accent, padding: "1px 5px", borderRadius: 3 }}
            >
              {"{{output}}"}
            </code>{" "}
            <code
              style={{ background: palette.background.accent, padding: "1px 5px", borderRadius: 3 }}
            >
              {"{{expected}}"}
            </code>
          </Typography>
          <Stack spacing={1.5}>
            {config.messages.map((msg, index) => (
              <Box
                key={index}
                sx={{
                  border: `1px solid ${palette.border.dark}`,
                  borderRadius: "6px",
                  overflow: "hidden",
                }}
              >
                <Stack
                  direction="row"
                  alignItems="center"
                  justifyContent="space-between"
                  sx={{
                    px: 1.5,
                    py: 0.75,
                    backgroundColor: palette.background.accent,
                    borderBottom: `1px solid ${palette.border.dark}`,
                  }}
                >
                  <MuiSelect
                    size="small"
                    value={msg.role}
                    onChange={(e) => handleUpdateMessage(index, "role", e.target.value)}
                    variant="standard"
                    disableUnderline
                    sx={{
                      "fontSize": 12,
                      "fontWeight": 500,
                      "minWidth": 80,
                      "& .MuiSelect-select": { py: 0 },
                    }}
                  >
                    <MenuItem value="system">System</MenuItem>
                    <MenuItem value="user">User</MenuItem>
                    <MenuItem value="assistant">Assistant</MenuItem>
                  </MuiSelect>
                  {config.messages.length > 1 && (
                    <IconButton
                      size="small"
                      onClick={() => handleRemoveMessage(index)}
                      sx={{ p: 0.5 }}
                    >
                      <Trash2 size={14} color={palette.text.disabled} />
                    </IconButton>
                  )}
                </Stack>
                <TextField
                  multiline
                  minRows={2}
                  maxRows={6}
                  fullWidth
                  placeholder={
                    msg.role === "system"
                      ? "You are a helpful assistant that evaluates..."
                      : "Use {{input}}, {{output}}, {{expected}} to reference test case data"
                  }
                  value={msg.content}
                  onChange={(e) => handleUpdateMessage(index, "content", e.target.value)}
                  sx={{
                    "& .MuiOutlinedInput-root": {
                      "border": "none",
                      "& fieldset": { border: "none" },
                    },
                    "& .MuiInputBase-input": { fontSize: 13, p: 1.5 },
                  }}
                />
              </Box>
            ))}
            <CustomizableButton
              variant="text"
              text="Add message"
              icon={<Plus size={14} />}
              onClick={handleAddMessage}
              sx={{
                "alignSelf": "flex-start",
                "color": palette.brand.primary,
                "fontSize": 13,
                "fontWeight": 600,
                "textTransform": "none",
                "&:hover": { backgroundColor: palette.brand.primaryLight },
              }}
            />
          </Stack>
        </Box>

        <Divider sx={{ mb: 3 }} />

        {/* ── Choice scores ── */}
        <Box mb={3}>
          <SectionHeading
            label="Choice scores"
            tooltip="The verdicts the judge can return, each mapped to a numeric score (0–1). The LLM is forced to pick exactly one choice via a tool schema — all labels and scores must be unique."
          />
          <Stack spacing={1.5}>
            <Stack direction="row" spacing={2}>
              <Typography sx={{ flex: 1, fontSize: 12, color: palette.text.tertiary }}>
                Choice label
              </Typography>
              <Typography
                sx={{ width: 100, fontSize: 12, color: palette.text.tertiary, textAlign: "center" }}
              >
                Score (0–1)
              </Typography>
              <Box sx={{ width: 32 }} />
            </Stack>
            {config.choiceScores.map((cs, index) => (
              <Stack key={index} direction="row" spacing={2} alignItems="center">
                <Field
                  placeholder="e.g. PASS"
                  value={cs.label}
                  onChange={(e) => handleUpdateChoiceScore(index, "label", e.target.value)}
                  sx={{ flex: 1 }}
                />
                <ScoreInput
                  value={cs.score}
                  onChange={(v) => handleUpdateChoiceScore(index, "score", v)}
                />
                <IconButton
                  size="small"
                  onClick={() => handleRemoveChoiceScore(index)}
                  disabled={config.choiceScores.length === 1}
                  sx={{ p: 0.5 }}
                >
                  <Trash2
                    size={16}
                    color={
                      config.choiceScores.length === 1 ? palette.border.dark : palette.text.disabled
                    }
                  />
                </IconButton>
              </Stack>
            ))}
            <CustomizableButton
              variant="text"
              text="Add choice"
              icon={<Plus size={14} />}
              onClick={handleAddChoiceScore}
              sx={{
                "alignSelf": "flex-start",
                "color": palette.brand.primary,
                "fontSize": 12,
                "fontWeight": 600,
                "textTransform": "none",
                "&:hover": { backgroundColor: palette.brand.primaryLight },
              }}
            />
          </Stack>
        </Box>

        <Divider sx={{ mb: 3 }} />

        {/* ── Pass threshold & Top P ── */}
        <Box>
          <SectionHeading
            label="Pass threshold"
            tooltip="Samples with a score at or above this value will be marked as passing. Adjust based on how strict you want the evaluation to be."
          />
          <Stack direction="row" alignItems="center" spacing={2} mb={2.5}>
            <Slider
              value={config.passThreshold}
              onChange={(_, v) => setConfig((prev) => ({ ...prev, passThreshold: v as number }))}
              min={0}
              max={1}
              step={0.05}
              valueLabelDisplay="auto"
              sx={{
                "flex": 1,
                "color": palette.brand.primary,
                "& .MuiSlider-thumb": {
                  backgroundColor: palette.background.main,
                  border: `2px solid ${palette.brand.primary}`,
                },
              }}
            />
            <Typography
              sx={{
                fontSize: 13,
                fontWeight: 600,
                minWidth: 36,
                textAlign: "right",
                color: palette.text.secondary,
              }}
            >
              {config.passThreshold.toFixed(2)}
            </Typography>
          </Stack>

          <SectionHeading
            label="Top P"
            tooltip="Controls the diversity of the judge's responses by sampling from the top-P probability mass. 1.0 = no restriction; lower values make output more focused."
          />
          <Stack direction="row" alignItems="center" spacing={2}>
            <Slider
              size="small"
              value={config.modelParams.topP}
              onChange={(_, v) =>
                setConfig((prev) => ({
                  ...prev,
                  modelParams: { ...prev.modelParams, topP: v as number },
                }))
              }
              min={0}
              max={1}
              step={0.05}
              sx={{
                "flex": 1,
                "color": palette.brand.primary,
                "height": 4,
                "& .MuiSlider-thumb": {
                  width: 14,
                  height: 14,
                  backgroundColor: palette.background.main,
                  border: `2px solid ${palette.brand.primary}`,
                },
                "& .MuiSlider-track": { border: "none" },
              }}
            />
            <Typography
              sx={{
                fontSize: 13,
                fontWeight: 600,
                minWidth: 36,
                textAlign: "right",
                color: palette.text.secondary,
              }}
            >
              {config.modelParams.topP.toFixed(2)}
            </Typography>
          </Stack>
        </Box>
      </Stack>
    </StandardModal>
  );
}
