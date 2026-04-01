/**
 * ModelSelector - A VerifyWise component for selecting AI model provider and model
 *
 * Features:
 * - Split-view dropdown with providers on left, models on right
 * - Search functionality for models
 * - API key status indicators
 * - Custom model input for OpenRouter
 * - VW styling with green accent colors
 */

import React, { useState, useRef, useEffect } from "react";
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
import {
  Search,
  Check,
  ChevronRight,
  ChevronDown,
  Plus,
  Key,
  Settings,
} from "lucide-react";
import { PROVIDERS, getModelsForProvider } from "../../../utils/providers";

// Provider icons
import { ReactComponent as OpenAILogo } from "../../../assets/icons/openai_logo.svg";
import { ReactComponent as AnthropicLogo } from "../../../assets/icons/anthropic_logo.svg";
import { ReactComponent as GeminiLogo } from "../../../assets/icons/gemini_logo.svg";
import { ReactComponent as MistralLogo } from "../../../assets/icons/mistral_logo.svg";
import { ReactComponent as XAILogo } from "../../../assets/icons/xai_logo.svg";
import { ReactComponent as OpenRouterLogo } from "../../../assets/icons/openrouter_logo.svg";

const PROVIDER_ICONS: Record<string, React.FC<React.SVGProps<SVGSVGElement>>> = {
  openai: OpenAILogo,
  anthropic: AnthropicLogo,
  google: GeminiLogo,
  mistral: MistralLogo,
  xai: XAILogo,
  openrouter: OpenRouterLogo,
};

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
}

function ModelSelector({
  provider,
  model,
  onProviderChange,
  onModelChange,
  configuredProviders,
  onNavigateToSettings,
  label = "Model",
}: ModelSelectorProps) {
  const theme = useTheme();
  const [open, setOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [customModel, setCustomModel] = useState(model || "");
  const anchorRef = useRef<HTMLDivElement>(null);

  const providerList = Object.values(PROVIDERS);
  const models = getModelsForProvider(provider);
  const selectedModel = models.find((m) => m.id === model);

  // OpenRouter allows custom model names
  const isOpenRouter = provider === "openrouter";

  // Sync customModel when model prop changes (for OpenRouter)
  useEffect(() => {
    if (isOpenRouter) {
      setCustomModel(model);
    }
  }, [model, isOpenRouter]);

  // Check if provider has API key configured
  const hasApiKey = (providerId: string) =>
    configuredProviders.some((cp) => cp.provider === providerId);
  const currentProviderHasKey = hasApiKey(provider);

  const filteredModels = models.filter(
    (m) =>
      m.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      m.id.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleProviderSelect = (newProvider: string) => {
    onProviderChange(newProvider);
    setCustomModel("");
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
          width: size,
          height: size,
          minWidth: size,
          minHeight: size,
          flexShrink: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
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
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          px: 1.5,
          height: 34,
          border: "1px solid",
          borderColor: open ? theme.palette.primary.main : theme.palette.border.dark,
          borderRadius: theme.shape.borderRadius,
          backgroundColor: theme.palette.background.main,
          cursor: "pointer",
          transition: "border-color 150ms ease-in-out",
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
              color:
                selectedModel || (isOpenRouter && model)
                  ? theme.palette.text.primary
                  : theme.palette.text.disabled,
            }}
          >
            {isOpenRouter && model
              ? model
              : selectedModel?.name || "Select a model"}
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
                placeholder="Find a model"
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
                    fontSize: 13,
                    borderRadius: theme.shape.borderRadius,
                    backgroundColor: theme.palette.action.hover,
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
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          px: 1.5,
                          height: 38,
                          minHeight: 38,
                          cursor: "pointer",
                          backgroundColor: isSelected
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
                            {!providerHasKey && (
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
                      display: "flex",
                      alignItems: "center",
                      gap: 1.5,
                      px: 1.5,
                      py: 1,
                      borderRadius: theme.shape.borderRadius,
                      cursor: "pointer",
                      backgroundColor: theme.palette.background.accent,
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
                {!currentProviderHasKey ? (
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
                      <Typography
                        sx={{ fontSize: 12, color: theme.palette.text.disabled, mb: 2 }}
                      >
                        Add an API key for{" "}
                        {PROVIDERS[provider]?.displayName || provider} to use
                        its models
                      </Typography>
                      <Box
                        onClick={(e) => {
                          e.stopPropagation();
                          setOpen(false);
                          onNavigateToSettings();
                        }}
                        sx={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 1,
                          px: 3,
                          py: 1.5,
                          borderRadius: theme.shape.borderRadius,
                          cursor: "pointer",
                          backgroundColor: theme.palette.primary.main,
                          color: theme.palette.common.white,
                          fontSize: 13,
                          fontWeight: 500,
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
                ) : isOpenRouter ? (
                  /* Custom model input for OpenRouter */
                  <Box sx={{ p: 2 }}>
                    <Typography
                      sx={{
                        fontSize: 12,
                        fontWeight: 600,
                        color: theme.palette.text.secondary,
                        mb: 1,
                      }}
                    >
                      Enter model name
                    </Typography>
                    <Typography
                      sx={{ fontSize: 11, color: theme.palette.text.disabled, mb: 1.5 }}
                    >
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
                        mb: 1.5,
                        "& .MuiOutlinedInput-root": {
                          fontSize: 13,
                          borderRadius: theme.shape.borderRadius,
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
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 1,
                        px: 2,
                        py: 1,
                        borderRadius: theme.shape.borderRadius,
                        cursor: customModel.trim() ? "pointer" : "not-allowed",
                        backgroundColor: customModel.trim()
                          ? theme.palette.primary.main
                          : theme.palette.action.disabledBackground,
                        color: customModel.trim() ? theme.palette.common.white : theme.palette.text.disabled,
                        fontSize: 12,
                        fontWeight: 500,
                        "&:hover": {
                          backgroundColor: customModel.trim()
                            ? theme.palette.primary.dark
                            : theme.palette.action.disabledBackground,
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
                        color: theme.palette.text.disabled,
                        mt: 2,
                        mb: 1,
                        textTransform: "uppercase",
                      }}
                    >
                      Popular models
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
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          px: 1.5,
                          py: 0.75,
                          borderRadius: theme.shape.borderRadius,
                          cursor: "pointer",
                          backgroundColor:
                            model === m.id
                              ? theme.palette.background.accent
                              : "transparent",
                          "&:hover": {
                            backgroundColor:
                              model === m.id
                                ? theme.palette.background.accent
                                : theme.palette.action.hover,
                          },
                        }}
                      >
                        <Typography
                          sx={{
                            fontSize: 12,
                            fontWeight: model === m.id ? 600 : 400,
                            color:
                              model === m.id
                                ? theme.palette.primary.main
                                : theme.palette.text.secondary,
                          }}
                        >
                          {m.name}
                        </Typography>
                        <Typography sx={{ fontSize: 10, color: theme.palette.text.disabled }}>
                          {m.id}
                        </Typography>
                      </Box>
                    ))}
                  </Box>
                ) : filteredModels.length === 0 ? (
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
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          pl: 2.5,
                          pr: 1.5,
                          py: 1,
                          cursor: "pointer",
                          backgroundColor: isSelected
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
                          {isSelected && (
                            <Check size={16} color={theme.palette.primary.main} />
                          )}
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
              </Box>
            </Stack>
          </Paper>
        </ClickAwayListener>
      </Popper>
    </Box>
  );
}

export default ModelSelector;
