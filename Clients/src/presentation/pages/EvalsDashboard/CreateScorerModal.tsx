import { useState, useCallback, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
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
  Popper,
  Paper,
  ClickAwayListener,
  InputAdornment,
  Tooltip,
} from "@mui/material";
import {
  Plus,
  Trash2,
  Search,
  Check,
  ChevronRight,
  ChevronDown,
  Key,
  HelpCircle,
  Settings,
} from "lucide-react";
import StandardModal from "../../components/Modals/StandardModal";
import Field from "../../components/Inputs/Field";
import { CustomizableButton } from "../../components/button/customizable-button";
import { PROVIDERS, getModelsForProvider, type ModelInfo } from "../../utils/providers";
import { evalModelsService } from "../../../infrastructure/api/evalModelsService";
import {
  getAllLlmApiKeys,
  type LLMApiKey,
} from "../../../application/repository/deepEval.repository";
import { palette } from "../../themes/palette";

// Provider icons
import { ReactComponent as OpenAILogo } from "../../assets/icons/openai_logo.svg";
import { ReactComponent as AnthropicLogo } from "../../assets/icons/anthropic_logo.svg";
import { ReactComponent as GeminiLogo } from "../../assets/icons/gemini_logo.svg";
import { ReactComponent as MistralLogo } from "../../assets/icons/mistral_logo.svg";
import { ReactComponent as XAILogo } from "../../assets/icons/xai_logo.svg";
import { ReactComponent as OpenRouterLogo } from "../../assets/icons/openrouter_logo.svg";
import { ReactComponent as OllamaLogo } from "../../assets/icons/ollama_logo.svg";

const PROVIDER_ICONS: Record<string, React.FC<React.SVGProps<SVGSVGElement>>> = {
  "openai": OpenAILogo,
  "anthropic": AnthropicLogo,
  "google": GeminiLogo,
  "mistral": MistralLogo,
  "xai": XAILogo,
  "openrouter": OpenRouterLogo,
  "self-hosted": OllamaLogo,
};

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
interface ModelSelectorProps {
  provider: string;
  model: string;
  onProviderChange: (provider: string) => void;
  onModelChange: (model: string) => void;
  configuredProviders: LLMApiKey[];
  onNavigateToSettings: () => void;
  endpointUrl?: string;
  apiKey?: string;
  onEndpointUrlChange?: (url: string) => void;
  onApiKeyChange?: (key: string) => void;
  gatewayModels?: Record<string, ModelInfo[]>;
}

function ModelSelector({
  provider,
  model,
  onProviderChange,
  onModelChange,
  configuredProviders,
  onNavigateToSettings,
  endpointUrl,
  apiKey,
  onEndpointUrlChange,
  onApiKeyChange,
  gatewayModels = {},
}: ModelSelectorProps) {
  const [open, setOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [customModel, setCustomModel] = useState(model || "");
  const anchorRef = useRef<HTMLDivElement>(null);

  const providerList = Object.values(PROVIDERS);
  // Prefer live LiteLLM catalog; fall back to static list
  const liveModels = gatewayModels[provider];
  const models = liveModels && liveModels.length > 0 ? liveModels : getModelsForProvider(provider);
  const selectedModel = models.find((m) => m.id === model);

  // OpenRouter allows custom model names
  const isOpenRouter = provider === "openrouter";
  const isSelfHosted = provider === "self-hosted";

  // Sync customModel when model prop changes (for OpenRouter and self-hosted)
  useEffect(() => {
    if (isOpenRouter || isSelfHosted) {
      setCustomModel(model);
    }
  }, [model, isOpenRouter, isSelfHosted]);

  // Check if provider has API key configured
  const hasApiKey = (providerId: string) =>
    configuredProviders.some((cp) => cp.provider === providerId);
  const currentProviderHasKey = hasApiKey(provider);

  const filteredModels = models.filter(
    (m) =>
      m.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      m.id.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  const handleProviderSelect = (newProvider: string) => {
    onProviderChange(newProvider);
    onModelChange(""); // Reset model when provider changes
    setCustomModel(""); // Reset custom model too
    setSearchQuery("");
  };

  const handleModelSelect = (modelId: string) => {
    onModelChange(modelId);
    setOpen(false);
    setSearchQuery("");
  };

  // Render provider icon
  const renderProviderIcon = (providerId: string, size: number = 20) => {
    const Icon = PROVIDER_ICONS[providerId];
    if (!Icon) return null;
    return (
      <Box
        sx={{
          "width": size,
          "height": size,
          "minWidth": size,
          "minHeight": size,
          "flexShrink": 0,
          "display": "flex",
          "alignItems": "center",
          "justifyContent": "center",
          "& svg": {
            width: "100%",
            height: "100%",
          },
        }}
      >
        <Icon />
      </Box>
    );
  };

  return (
    <Box>
      <Typography sx={{ fontSize: 12, fontWeight: 600, color: palette.text.secondary, mb: 0.75 }}>
        Model
      </Typography>
      <Box
        ref={anchorRef}
        onClick={() => setOpen(!open)}
        sx={{
          "display": "flex",
          "alignItems": "center",
          "justifyContent": "space-between",
          "px": 1.5,
          "py": 1.25,
          "border": "1px solid",
          "borderColor": open ? palette.brand.primary : palette.border.dark,
          "borderRadius": "8px",
          "backgroundColor": palette.background.main,
          "cursor": "pointer",
          "transition": "all 0.15s ease",
          "&:hover": {
            borderColor: palette.border.dark,
          },
        }}
      >
        <Stack direction="row" alignItems="center" spacing={1.5}>
          {renderProviderIcon(provider, 20)}
          <Typography
            sx={{
              fontSize: 13,
              color:
                selectedModel || ((isOpenRouter || isSelfHosted) && model)
                  ? palette.text.primary
                  : palette.text.disabled,
            }}
          >
            {(isOpenRouter || isSelfHosted) && model
              ? model
              : selectedModel?.name || "Select a model"}
          </Typography>
        </Stack>
        <ChevronDown
          size={16}
          color={palette.text.tertiary}
          style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform 0.2s" }}
        />
      </Box>

      <Popper
        open={open}
        anchorEl={anchorRef.current}
        placement="bottom-start"
        style={{
          zIndex: 1400,
          width: anchorRef.current?.offsetWidth
            ? Math.max(anchorRef.current.offsetWidth, 520)
            : 520,
        }}
      >
        <ClickAwayListener
          onClickAway={() => {
            setOpen(false);
            setSearchQuery("");
          }}
        >
          <Paper
            elevation={8}
            sx={{
              mt: 0.5,
              borderRadius: "12px",
              border: `1px solid ${palette.border.dark}`,
              overflow: "hidden",
            }}
          >
            {/* Search */}
            <Box sx={{ p: 1.5, borderBottom: `1px solid ${palette.background.hover}` }}>
              <TextField
                fullWidth
                size="small"
                placeholder="Find a model"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                autoFocus
                autoComplete="off"
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <Search size={16} color={palette.text.disabled} />
                    </InputAdornment>
                  ),
                }}
                sx={{
                  "& .MuiOutlinedInput-root": {
                    "fontSize": 13,
                    "borderRadius": "8px",
                    "backgroundColor": palette.background.accent,
                    "& fieldset": { borderColor: palette.border.dark },
                    "&:hover fieldset": { borderColor: palette.border.dark },
                    "&.Mui-focused fieldset": { borderColor: palette.brand.primary },
                  },
                }}
              />
            </Box>

            {/* Split view */}
            <Stack direction="row" sx={{ height: 320 }}>
              {/* Providers list */}
              <Box
                sx={{
                  width: 200,
                  borderRight: `1px solid ${palette.background.hover}`,
                  overflowY: "auto",
                  display: "flex",
                  flexDirection: "column",
                }}
              >
                <Box sx={{ flex: 1, overflowY: "auto", py: 0.5 }}>
                  {providerList.map((p) => {
                    const isSelected = p.provider === provider;
                    const providerHasKey = hasApiKey(p.provider);
                    return (
                      <Box
                        key={p.provider}
                        onClick={() => handleProviderSelect(p.provider)}
                        sx={{
                          "display": "flex",
                          "alignItems": "center",
                          "justifyContent": "space-between",
                          "px": 1.5,
                          "height": 38,
                          "minHeight": 38,
                          "cursor": "pointer",
                          "backgroundColor": isSelected
                            ? palette.brand.primaryLight
                            : "transparent",
                          "&:hover": {
                            backgroundColor: isSelected
                              ? palette.brand.primaryLight
                              : palette.background.accent,
                          },
                        }}
                      >
                        <Stack
                          direction="row"
                          alignItems="center"
                          spacing={1.5}
                          sx={{ minWidth: 0, flex: 1 }}
                        >
                          {renderProviderIcon(p.provider, 20)}
                          <Stack spacing={0} sx={{ minWidth: 0 }}>
                            <Typography
                              sx={{
                                fontSize: 13,
                                fontWeight: isSelected ? 600 : 400,
                                color: isSelected ? palette.brand.primary : palette.text.secondary,
                                lineHeight: 1.2,
                              }}
                            >
                              {p.displayName}
                            </Typography>
                            {!providerHasKey && p.provider !== "self-hosted" && (
                              <Typography
                                sx={{
                                  fontSize: 10,
                                  color: palette.status.warning.text,
                                  lineHeight: 1.2,
                                }}
                              >
                                No API key
                              </Typography>
                            )}
                          </Stack>
                        </Stack>
                        {isSelected ? (
                          <Check size={14} color={palette.brand.primary} />
                        ) : (
                          <ChevronRight size={14} color={palette.text.disabled} />
                        )}
                      </Box>
                    );
                  })}
                </Box>

                {/* Add provider button */}
                <Box sx={{ p: 1.5, borderTop: `1px solid ${palette.background.hover}` }}>
                  <Box
                    onClick={(e) => {
                      e.stopPropagation();
                      setOpen(false);
                      onNavigateToSettings();
                    }}
                    sx={{
                      "display": "flex",
                      "alignItems": "center",
                      "gap": 1.5,
                      "px": 1.5,
                      "py": 1,
                      "borderRadius": "8px",
                      "cursor": "pointer",
                      "backgroundColor": palette.brand.primaryLight,
                      "&:hover": {
                        backgroundColor: palette.brand.primaryLight,
                      },
                    }}
                  >
                    <Plus size={16} color={palette.brand.primary} />
                    <Typography
                      sx={{ fontSize: 13, fontWeight: 500, color: palette.brand.primary }}
                    >
                      Add API key
                    </Typography>
                  </Box>
                </Box>
              </Box>

              {/* Models list */}
              <Box
                sx={{
                  flex: 1,
                  overflowY: "auto",
                  py: 0.5,
                  display: "flex",
                  flexDirection: "column",
                }}
              >
                {isSelfHosted ? (
                  /* Self-hosted model configuration */
                  <Box sx={{ p: 2 }}>
                    <Typography
                      sx={{ fontSize: 12, fontWeight: 600, color: palette.text.secondary, mb: 1 }}
                    >
                      Self-Hosted Model Configuration
                    </Typography>
                    <Typography sx={{ fontSize: 11, color: palette.text.tertiary, mb: 1.5 }}>
                      Connect to a locally running model server (Ollama, vLLM, etc.)
                    </Typography>

                    {/* Endpoint URL */}
                    <Typography
                      sx={{ fontSize: 11, fontWeight: 600, color: palette.text.secondary, mb: 0.5 }}
                    >
                      Endpoint URL *
                    </Typography>
                    <TextField
                      size="small"
                      fullWidth
                      placeholder="http://localhost:11434/v1"
                      value={endpointUrl || ""}
                      onChange={(e) => onEndpointUrlChange?.(e.target.value)}
                      onClick={(e) => e.stopPropagation()}
                      onKeyDown={(e) => e.stopPropagation()}
                      autoComplete="off"
                      sx={{
                        "mb": 1.5,
                        "& .MuiOutlinedInput-root": {
                          fontSize: 13,
                          borderRadius: "8px",
                        },
                      }}
                    />

                    {/* Model Name */}
                    <Typography
                      sx={{ fontSize: 11, fontWeight: 600, color: palette.text.secondary, mb: 0.5 }}
                    >
                      Model Name *
                    </Typography>
                    <TextField
                      size="small"
                      fullWidth
                      placeholder="e.g., llama3.2, mistral, codellama"
                      value={customModel}
                      onChange={(e) => setCustomModel(e.target.value)}
                      onClick={(e) => e.stopPropagation()}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && customModel.trim() && (endpointUrl || "").trim()) {
                          onModelChange(customModel.trim());
                          setOpen(false);
                        }
                        e.stopPropagation();
                      }}
                      autoComplete="off"
                      sx={{
                        "mb": 1.5,
                        "& .MuiOutlinedInput-root": {
                          fontSize: 13,
                          borderRadius: "8px",
                        },
                      }}
                    />

                    {/* API Key (optional) */}
                    <Typography
                      sx={{ fontSize: 11, fontWeight: 600, color: palette.text.secondary, mb: 0.5 }}
                    >
                      API Key (optional)
                    </Typography>
                    <TextField
                      size="small"
                      fullWidth
                      type="password"
                      placeholder="Leave empty if not required"
                      value={apiKey || ""}
                      onChange={(e) => onApiKeyChange?.(e.target.value)}
                      onClick={(e) => e.stopPropagation()}
                      onKeyDown={(e) => e.stopPropagation()}
                      autoComplete="off"
                      sx={{
                        "mb": 2,
                        "& .MuiOutlinedInput-root": {
                          fontSize: 13,
                          borderRadius: "8px",
                        },
                      }}
                    />

                    {/* Use this model button */}
                    <Box
                      onClick={() => {
                        if (customModel.trim() && (endpointUrl || "").trim()) {
                          onModelChange(customModel.trim());
                          setOpen(false);
                        }
                      }}
                      sx={{
                        "display": "inline-flex",
                        "alignItems": "center",
                        "gap": 1,
                        "px": 2,
                        "py": 1,
                        "borderRadius": "6px",
                        "cursor":
                          customModel.trim() && (endpointUrl || "").trim()
                            ? "pointer"
                            : "not-allowed",
                        "backgroundColor":
                          customModel.trim() && (endpointUrl || "").trim()
                            ? palette.brand.primary
                            : palette.border.dark,
                        "color":
                          customModel.trim() && (endpointUrl || "").trim()
                            ? palette.background.main
                            : palette.text.disabled,
                        "fontSize": 12,
                        "fontWeight": 500,
                        "&:hover": {
                          backgroundColor:
                            customModel.trim() && (endpointUrl || "").trim()
                              ? palette.brand.primaryHover
                              : palette.border.dark,
                        },
                      }}
                    >
                      <Check size={14} />
                      Use this model
                    </Box>
                  </Box>
                ) : !currentProviderHasKey ? (
                  /* No API key message - centered vertically */
                  <Box
                    sx={{
                      flex: 1,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      p: 4,
                    }}
                  >
                    <Box sx={{ textAlign: "center" }}>
                      <Box
                        sx={{
                          width: 48,
                          height: 48,
                          borderRadius: "12px",
                          backgroundColor: palette.status.warning.bg,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          margin: "0 auto",
                          mb: 2,
                        }}
                      >
                        <Key size={24} color={palette.status.warning.text} />
                      </Box>
                      <Typography
                        sx={{ fontSize: 14, fontWeight: 600, color: palette.text.primary, mb: 0.5 }}
                      >
                        API key required
                      </Typography>
                      <Typography sx={{ fontSize: 12, color: palette.text.tertiary, mb: 2 }}>
                        Add an API key for {PROVIDERS[provider]?.displayName || provider} to use its
                        models
                      </Typography>
                      <Box
                        onClick={(e) => {
                          e.stopPropagation();
                          setOpen(false);
                          onNavigateToSettings();
                        }}
                        sx={{
                          "display": "inline-flex",
                          "alignItems": "center",
                          "gap": 1,
                          "px": 3,
                          "py": 1.5,
                          "borderRadius": "8px",
                          "cursor": "pointer",
                          "backgroundColor": palette.brand.primary,
                          "color": palette.background.main,
                          "fontSize": 13,
                          "fontWeight": 500,
                          "&:hover": {
                            backgroundColor: palette.brand.primaryHover,
                          },
                        }}
                      >
                        <Settings size={14} />
                        Go to Settings
                      </Box>
                    </Box>
                  </Box>
                ) : isOpenRouter ? (
                  /* Custom model input for OpenRouter */
                  <Box sx={{ p: 2 }}>
                    <Typography
                      sx={{ fontSize: 12, fontWeight: 600, color: palette.text.secondary, mb: 1 }}
                    >
                      Enter Model Name
                    </Typography>
                    <Typography sx={{ fontSize: 11, color: palette.text.tertiary, mb: 1.5 }}>
                      OpenRouter supports any model. Enter the model ID (e.g.,
                      anthropic/claude-3-opus)
                    </Typography>
                    <TextField
                      size="small"
                      fullWidth
                      placeholder="e.g., openai/gpt-4o, anthropic/claude-3-opus"
                      value={customModel}
                      onChange={(e) => setCustomModel(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && customModel.trim()) {
                          onModelChange(customModel.trim());
                          setOpen(false);
                        }
                        e.stopPropagation();
                      }}
                      onClick={(e) => e.stopPropagation()}
                      autoComplete="off"
                      sx={{
                        "mb": 1.5,
                        "& .MuiOutlinedInput-root": {
                          fontSize: 13,
                          borderRadius: "8px",
                        },
                      }}
                    />
                    <Box
                      onClick={() => {
                        if (customModel.trim()) {
                          onModelChange(customModel.trim());
                          setOpen(false);
                        }
                      }}
                      sx={{
                        "display": "inline-flex",
                        "alignItems": "center",
                        "gap": 1,
                        "px": 2,
                        "py": 1,
                        "borderRadius": "6px",
                        "cursor": customModel.trim() ? "pointer" : "not-allowed",
                        "backgroundColor": customModel.trim()
                          ? palette.brand.primary
                          : palette.border.dark,
                        "color": customModel.trim()
                          ? palette.background.main
                          : palette.text.disabled,
                        "fontSize": 12,
                        "fontWeight": 500,
                        "&:hover": {
                          backgroundColor: customModel.trim()
                            ? palette.brand.primaryHover
                            : palette.border.dark,
                        },
                      }}
                    >
                      <Check size={14} />
                      Use this model
                    </Box>

                    {/* Popular OpenRouter models */}
                    <Typography
                      sx={{
                        fontSize: 11,
                        fontWeight: 600,
                        color: palette.text.disabled,
                        mt: 2,
                        mb: 1,
                        textTransform: "uppercase",
                      }}
                    >
                      Popular Models
                    </Typography>
                    {[
                      { id: "openai/gpt-4o", name: "GPT-4o" },
                      { id: "anthropic/claude-3.5-sonnet", name: "Claude 3.5 Sonnet" },
                      { id: "google/gemini-pro-1.5", name: "Gemini Pro 1.5" },
                      { id: "meta-llama/llama-3.1-70b-instruct", name: "Llama 3.1 70B" },
                      { id: "mistralai/mistral-large", name: "Mistral Large" },
                    ].map((m) => (
                      <Box
                        key={m.id}
                        onClick={() => {
                          setCustomModel(m.id);
                          onModelChange(m.id);
                          setOpen(false);
                        }}
                        sx={{
                          "display": "flex",
                          "alignItems": "center",
                          "justifyContent": "space-between",
                          "px": 1.5,
                          "py": 0.75,
                          "borderRadius": "6px",
                          "cursor": "pointer",
                          "backgroundColor":
                            model === m.id ? palette.brand.primaryLight : "transparent",
                          "&:hover": {
                            backgroundColor:
                              model === m.id
                                ? palette.brand.primaryLight
                                : palette.background.accent,
                          },
                        }}
                      >
                        <Typography
                          sx={{
                            fontSize: 12,
                            fontWeight: model === m.id ? 600 : 400,
                            color: model === m.id ? palette.brand.primary : palette.text.secondary,
                          }}
                        >
                          {m.name}
                        </Typography>
                        <Typography sx={{ fontSize: 10, color: palette.text.disabled }}>
                          {m.id}
                        </Typography>
                      </Box>
                    ))}
                  </Box>
                ) : filteredModels.length === 0 ? (
                  <Box
                    sx={{
                      flex: 1,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      p: 3,
                    }}
                  >
                    <Typography sx={{ fontSize: 13, color: palette.text.disabled }}>
                      No models found
                    </Typography>
                  </Box>
                ) : (
                  filteredModels.map((m) => {
                    const isSelected = m.id === model;
                    return (
                      <Box
                        key={m.id}
                        onClick={() => handleModelSelect(m.id)}
                        sx={{
                          "display": "flex",
                          "alignItems": "center",
                          "gap": 1.5,
                          "pl": 2.5,
                          "pr": 1.5,
                          "py": 1,
                          "cursor": "pointer",
                          "backgroundColor": isSelected
                            ? palette.brand.primaryLight
                            : "transparent",
                          "&:hover": {
                            backgroundColor: isSelected
                              ? palette.brand.primaryLight
                              : palette.background.accent,
                          },
                        }}
                      >
                        {isSelected && <Check size={16} color={palette.brand.primary} />}
                        {renderProviderIcon(provider, 20)}
                        <Typography
                          sx={{
                            fontSize: 13,
                            fontWeight: isSelected ? 600 : 400,
                            color: isSelected ? palette.brand.primary : palette.text.secondary,
                          }}
                        >
                          {m.name}
                        </Typography>
                      </Box>
                    );
                  })
                )}
              </Box>
            </Stack>
          </Paper>
        </ClickAwayListener>
      </Popper>
    </Box>
  );
}

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
  const [gatewayModels, setGatewayModels] = useState<Record<string, ModelInfo[]>>({});
  const gatewayModelsLoaded = useRef<Set<string>>(new Set());

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
              const firstProvider = keys[0].provider;
              const models = getModelsForProvider(firstProvider);
              return {
                ...prev,
                provider: firstProvider,
                model: models.length > 0 ? models[0].id : "",
              };
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

  // Fetch LiteLLM gateway models for the current provider
  const CLOUD_PROVIDERS = new Set([
    "openai",
    "anthropic",
    "google",
    "mistral",
    "xai",
    "openrouter",
  ]);
  useEffect(() => {
    const provider = config.provider;
    if (!provider || !CLOUD_PROVIDERS.has(provider) || gatewayModelsLoaded.current.has(provider))
      return;
    gatewayModelsLoaded.current.add(provider);
    evalModelsService
      .getGatewayModelsForProvider(provider)
      .then((models) => {
        if (models.length > 0) setGatewayModels((prev) => ({ ...prev, [provider]: models }));
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config.provider]);

  // Auto-generate slug from name
  const handleNameChange = useCallback((name: string) => {
    const slug = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "");
    setConfig((prev) => ({ ...prev, name, slug }));
  }, []);

  // Handle provider change - reset model when provider changes
  const handleProviderChange = useCallback(
    (providerId: string) => {
      const live = gatewayModels[providerId];
      const models = live && live.length > 0 ? live : getModelsForProvider(providerId);
      setConfig((prev) => ({
        ...prev,
        provider: providerId,
        model: models.length > 0 ? models[0].id : "",
        ...(providerId !== "self-hosted" ? { endpointUrl: "", apiKey: "" } : {}),
      }));
      // Lazy-fetch gateway models for this provider if not yet loaded
      if (CLOUD_PROVIDERS.has(providerId) && !gatewayModelsLoaded.current.has(providerId)) {
        gatewayModelsLoaded.current.add(providerId);
        evalModelsService
          .getGatewayModelsForProvider(providerId)
          .then((m) => {
            if (m.length > 0) setGatewayModels((prev) => ({ ...prev, [providerId]: m }));
          })
          .catch(() => {});
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    },
    [gatewayModels],
  );

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
    config.choiceScores.some((cs) => cs.label.trim());

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
              gatewayModels={gatewayModels}
            />
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
                <TextField
                  size="small"
                  placeholder="e.g. PASS"
                  value={cs.label}
                  onChange={(e) => handleUpdateChoiceScore(index, "label", e.target.value)}
                  sx={{ "flex": 1, "& .MuiInputBase-input": { fontSize: 13 } }}
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
