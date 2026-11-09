/**
 * ModelSelector - A VerifyWise component for selecting AI model provider and model
 *
 * Features:
 * - Split-view dropdown with providers on left, models on right
 * - Search functionality for models
 * - API key status indicators
 * - Models from the AI Gateway's LiteLLM catalog (bundled list as fallback)
 * - Any model ID can be typed in the search box and used
 * - Self-hosted models (endpoint, model name, optional key) when the caller handles the endpoint
 * - VW styling with green accent colors
 */

import React, { useEffect, useState, useRef } from "react";
import {
  Box,
  Stack,
  Typography,
  TextField,
  Popper,
  Paper,
  ClickAwayListener,
  InputAdornment,
  useTheme,
} from "@mui/material";
import { Search, Check, ChevronRight, ChevronDown, Plus, Key, Settings } from "lucide-react";
import Field from "../Field";
import { CustomizableButton } from "../../button/customizable-button";
import { PROVIDERS } from "../../../utils/providers";
import { useProviderModels } from "../../../../application/hooks/useProviderModels";

// Provider icons
import { ReactComponent as OpenAILogo } from "../../../assets/icons/openai_logo.svg";
import { ReactComponent as AnthropicLogo } from "../../../assets/icons/anthropic_logo.svg";
import { ReactComponent as GeminiLogo } from "../../../assets/icons/gemini_logo.svg";
import { ReactComponent as MistralLogo } from "../../../assets/icons/mistral_logo.svg";
import { ReactComponent as XAILogo } from "../../../assets/icons/xai_logo.svg";
import { ReactComponent as OpenRouterLogo } from "../../../assets/icons/openrouter_logo.svg";
import { ReactComponent as OllamaLogo } from "../../../assets/icons/ollama_logo.svg";

const PROVIDER_ICONS: Record<string, React.FC<React.SVGProps<SVGSVGElement>>> = {
  "openai": OpenAILogo,
  "anthropic": AnthropicLogo,
  "google": GeminiLogo,
  "mistral": MistralLogo,
  "xai": XAILogo,
  "openrouter": OpenRouterLogo,
  "self-hosted": OllamaLogo,
};

const SELF_HOSTED = "self-hosted";

export interface ConfiguredProvider {
  provider: string;
}

interface ModelSelectorProps {
  provider: string;
  model: string;
  onProviderChange: (provider: string) => void;
  onModelChange: (model: string) => void;
  configuredProviders: ConfiguredProvider[];
  onNavigateToSettings: () => void;
  label?: string;
  /** Self-hosted model server; the Self-Hosted provider is listed only with onEndpointUrlChange */
  endpointUrl?: string;
  apiKey?: string;
  onEndpointUrlChange?: (url: string) => void;
  onApiKeyChange?: (key: string) => void;
}

function ModelSelector({
  provider,
  model,
  onProviderChange,
  onModelChange,
  configuredProviders,
  onNavigateToSettings,
  label = "Model",
  endpointUrl,
  apiKey,
  onEndpointUrlChange,
  onApiKeyChange,
}: ModelSelectorProps) {
  const theme = useTheme();
  const [open, setOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const anchorRef = useRef<HTMLDivElement>(null);

  const supportsSelfHosted = !!onEndpointUrlChange;
  const providerList = Object.values(PROVIDERS).filter(
    (p) => supportsSelfHosted || p.provider !== SELF_HOSTED,
  );
  const isSelfHosted = provider === SELF_HOSTED && supportsSelfHosted;
  const [selfHostedModel, setSelfHostedModel] = useState(isSelfHosted ? model : "");
  useEffect(() => {
    if (isSelfHosted) setSelfHostedModel(model);
  }, [model, isSelfHosted]);
  const canUseSelfHosted = !!selfHostedModel.trim() && !!(endpointUrl || "").trim();
  const pickSelfHostedModel = () => {
    if (!canUseSelfHosted) return;
    onModelChange(selfHostedModel.trim());
    setOpen(false);
  };
  const { models, isLoading: modelsLoading } = useProviderModels(provider);
  const selectedModel = models.find((m) => m.id === model);
  // A typed ID the list does not have can still be used (OpenRouter serves any model)
  const typedId = searchQuery.trim();
  const canUseTypedId = !!typedId && !models.some((m) => m.id === typedId);

  // Check if provider has API key configured
  const hasApiKey = (providerId: string) =>
    configuredProviders.some((cp) => cp.provider === providerId);
  // A self-hosted server needs no saved provider key
  const currentProviderHasKey = isSelfHosted || hasApiKey(provider);

  const filteredModels = models.filter(
    (m) =>
      m.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      m.id.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  const handleProviderSelect = (newProvider: string) => {
    onProviderChange(newProvider);
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
      {label && (
        <Typography
          sx={{ fontSize: 13, fontWeight: 600, color: theme.palette.text.primary, mb: 0.75 }}
        >
          {label}
        </Typography>
      )}
      <Box
        ref={anchorRef}
        onClick={() => setOpen(!open)}
        sx={{
          "display": "flex",
          "alignItems": "center",
          "justifyContent": "space-between",
          "px": 1.5,
          "height": 34,
          "border": "1px solid",
          "borderColor": open ? theme.palette.primary.main : theme.palette.border.dark,
          "borderRadius": theme.shape.borderRadius,
          "backgroundColor": theme.palette.background.main,
          "cursor": "pointer",
          "transition": "border-color 150ms ease-in-out",
          "&:hover": {
            borderColor: theme.palette.primary.light,
          },
        }}
      >
        <Stack direction="row" alignItems="center" spacing={1.5}>
          {renderProviderIcon(provider, 20)}
          <Typography
            sx={{
              fontSize: 13,
              color: model ? theme.palette.text.primary : theme.palette.text.disabled,
            }}
          >
            {selectedModel?.name || model || "Select a model"}
          </Typography>
        </Stack>
        <ChevronDown
          size={16}
          color={theme.palette.text.disabled}
          style={{
            transform: open ? "rotate(180deg)" : "none",
            transition: "transform 0.2s",
          }}
        />
      </Box>

      <Popper
        open={open}
        anchorEl={anchorRef.current}
        placement="bottom-start"
        style={{
          zIndex: 1300,
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
              borderRadius: theme.shape.borderRadius,
              border: `1px solid ${theme.palette.border.dark}`,
              overflow: "hidden",
              boxShadow: theme.boxShadow,
            }}
          >
            {/* Search */}
            <Box sx={{ p: 1.5, borderBottom: `1px solid ${theme.palette.divider}` }}>
              <TextField
                fullWidth
                size="small"
                placeholder="Find a model or type its ID"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                autoFocus
                autoComplete="off"
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <Search size={16} color={theme.palette.text.disabled} />
                    </InputAdornment>
                  ),
                }}
                sx={{
                  "& .MuiOutlinedInput-root": {
                    "fontSize": 13,
                    "borderRadius": theme.shape.borderRadius,
                    "backgroundColor": theme.palette.action.hover,
                    "& fieldset": { borderColor: theme.palette.border.dark },
                    "&:hover fieldset": { borderColor: theme.palette.primary.light },
                    "&.Mui-focused fieldset": {
                      borderColor: theme.palette.primary.main,
                    },
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
                  borderRight: `1px solid ${theme.palette.divider}`,
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
                            ? theme.palette.background.accent
                            : "transparent",
                          "&:hover": {
                            backgroundColor: isSelected
                              ? theme.palette.background.accent
                              : theme.palette.action.hover,
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
                                color: isSelected
                                  ? theme.palette.primary.main
                                  : theme.palette.text.secondary,
                                lineHeight: 1.2,
                              }}
                            >
                              {p.displayName}
                            </Typography>
                            {!providerHasKey && p.provider !== SELF_HOSTED && (
                              <Typography
                                sx={{
                                  fontSize: 10,
                                  color: theme.palette.warning.main,
                                  lineHeight: 1.2,
                                }}
                              >
                                No API key
                              </Typography>
                            )}
                          </Stack>
                        </Stack>
                        {isSelected ? (
                          <Check size={14} color={theme.palette.primary.main} />
                        ) : (
                          <ChevronRight size={14} color={theme.palette.text.disabled} />
                        )}
                      </Box>
                    );
                  })}
                </Box>

                {/* Add provider button */}
                <Box sx={{ p: 1.5, borderTop: `1px solid ${theme.palette.divider}` }}>
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
                      "borderRadius": theme.shape.borderRadius,
                      "cursor": "pointer",
                      "backgroundColor": theme.palette.background.accent,
                      "&:hover": {
                        backgroundColor: theme.palette.primary.light,
                      },
                    }}
                  >
                    <Plus size={16} color={theme.palette.primary.main} />
                    <Typography
                      sx={{
                        fontSize: 13,
                        fontWeight: 500,
                        color: theme.palette.primary.main,
                      }}
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
                  /* Self-hosted model server: endpoint, model name, optional key */
                  <Stack sx={{ p: "16px" }} gap="12px">
                    <Box>
                      <Typography
                        sx={{ fontSize: 12, fontWeight: 600, color: theme.palette.text.secondary }}
                      >
                        Self-hosted model
                      </Typography>
                      <Typography sx={{ fontSize: 11, color: theme.palette.text.tertiary }}>
                        Connect to a locally running model server (Ollama, vLLM, etc.)
                      </Typography>
                    </Box>
                    <Field
                      label="Endpoint URL"
                      isRequired
                      placeholder="http://localhost:11434/v1"
                      value={endpointUrl || ""}
                      onChange={(e) => onEndpointUrlChange?.(e.target.value)}
                      InputProps={{
                        onClick: (e) => e.stopPropagation(),
                        onKeyDown: (e) => e.stopPropagation(),
                      }}
                      autoComplete="off"
                    />
                    <Field
                      label="Model name"
                      isRequired
                      placeholder="e.g., llama3.2, mistral, codellama"
                      value={selfHostedModel}
                      onChange={(e) => setSelfHostedModel(e.target.value)}
                      InputProps={{
                        onClick: (e) => e.stopPropagation(),
                        onKeyDown: (e) => {
                          if (e.key === "Enter") pickSelfHostedModel();
                          e.stopPropagation();
                        },
                      }}
                      autoComplete="off"
                    />
                    <Field
                      label="API key (optional)"
                      type="password"
                      placeholder="Leave empty if not required"
                      value={apiKey || ""}
                      onChange={(e) => onApiKeyChange?.(e.target.value)}
                      InputProps={{
                        onClick: (e) => e.stopPropagation(),
                        onKeyDown: (e) => e.stopPropagation(),
                      }}
                      autoComplete="off"
                    />
                    <Box>
                      <CustomizableButton
                        variant="contained"
                        text="Use this model"
                        isDisabled={!canUseSelfHosted}
                        onClick={pickSelfHostedModel}
                      />
                    </Box>
                  </Stack>
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
                          backgroundColor: theme.palette.warning.light,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          margin: "0 auto",
                          mb: 2,
                        }}
                      >
                        <Key size={24} color={theme.palette.warning.main} />
                      </Box>
                      <Typography
                        sx={{
                          fontSize: 14,
                          fontWeight: 600,
                          color: theme.palette.text.primary,
                          mb: 0.5,
                        }}
                      >
                        API key required
                      </Typography>
                      <Typography sx={{ fontSize: 12, color: theme.palette.text.disabled, mb: 2 }}>
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
                          "borderRadius": theme.shape.borderRadius,
                          "cursor": "pointer",
                          "backgroundColor": theme.palette.primary.main,
                          "color": theme.palette.common.white,
                          "fontSize": 13,
                          "fontWeight": 500,
                          "&:hover": {
                            backgroundColor: theme.palette.primary.dark,
                          },
                        }}
                      >
                        <Settings size={14} />
                        Go to settings
                      </Box>
                    </Box>
                  </Box>
                ) : (
                  <>
                    {/* The bundled list shows meanwhile; it may still change */}
                    {modelsLoading && (
                      <Typography
                        sx={{ fontSize: 11, color: theme.palette.text.tertiary, pl: 2.5, py: 0.5 }}
                      >
                        Updating model list…
                      </Typography>
                    )}
                    {canUseTypedId && (
                      <Box
                        onClick={() => handleModelSelect(typedId)}
                        sx={{
                          "display": "flex",
                          "alignItems": "center",
                          "gap": "8px",
                          "pl": 2.5,
                          "pr": 1.5,
                          "py": 1,
                          "cursor": "pointer",
                          "&:hover": { backgroundColor: theme.palette.action.hover },
                        }}
                      >
                        <Plus size={16} color={theme.palette.primary.main} />
                        <Typography sx={{ fontSize: 13, color: theme.palette.primary.main }}>
                          Use “{typedId}”
                        </Typography>
                      </Box>
                    )}
                    {filteredModels.length === 0 && !canUseTypedId ? (
                      <Box sx={{ p: 3, textAlign: "center" }}>
                        <Typography sx={{ fontSize: 13, color: theme.palette.text.disabled }}>
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
                              "justifyContent": "space-between",
                              "pl": 2.5,
                              "pr": 1.5,
                              "py": 1,
                              "cursor": "pointer",
                              "backgroundColor": isSelected
                                ? theme.palette.background.accent
                                : "transparent",
                              "&:hover": {
                                backgroundColor: isSelected
                                  ? theme.palette.background.accent
                                  : theme.palette.action.hover,
                              },
                            }}
                          >
                            <Stack direction="row" alignItems="center" spacing={1.5}>
                              {isSelected && <Check size={16} color={theme.palette.primary.main} />}
                              {renderProviderIcon(provider, 18)}
                              <Typography
                                sx={{
                                  fontSize: 13,
                                  fontWeight: isSelected ? 600 : 400,
                                  color: isSelected
                                    ? theme.palette.primary.main
                                    : theme.palette.text.secondary,
                                }}
                              >
                                {m.name}
                              </Typography>
                            </Stack>
                          </Box>
                        );
                      })
                    )}
                  </>
                )}
              </Box>
            </Stack>
          </Paper>
        </ClickAwayListener>
      </Popper>
    </Box>
  );
}

export default ModelSelector;
