/**
 * @fileoverview Shared provider model / endpoint / API-key fields for Model and Judge steps.
 *
 * @module pages/EvalsDashboard/NewExperiment/ProviderModelFields
 */

import {
  Box,
  Button,
  Chip as MuiChip,
  Divider,
  FormControl,
  MenuItem,
  Select,
  Stack,
  Typography,
} from "@mui/material";
import { Check } from "lucide-react";
import type { RefObject } from "react";
import Field from "../../../components/Inputs/Field";
import { palette } from "../../../themes/palette";
import { PROVIDERS, type ModelInfo } from "../../../utils/providers";
import type { ProviderType } from "./newExperimentConfig";
import { OPENROUTER_POPULAR_MODELS } from "./providerConfig";

export interface ProviderModelFieldsProps {
  /** `model` shows input/output cost in the cloud dropdown; `judge` omits it. */
  mode: "model" | "judge";
  providerId: ProviderType | "";
  providerName: string;
  modelValue: string;
  endpointUrl: string;
  apiKey: string;
  useCustomModelName: boolean;
  hasApiKeyConfigured: boolean;
  needsApiKey: boolean;
  needsUrl: boolean;
  fieldsRef?: RefObject<HTMLDivElement | null>;
  getProviderModels: (providerId: string) => ModelInfo[];
  onModelChange: (name: string) => void;
  onEndpointChange: (url: string) => void;
  onApiKeyChange: (key: string) => void;
  onCustomModelToggle: (custom: boolean) => void;
}

export default function ProviderModelFields({
  mode,
  providerId,
  providerName,
  modelValue,
  endpointUrl,
  apiKey,
  useCustomModelName,
  hasApiKeyConfigured,
  needsApiKey,
  needsUrl,
  fieldsRef,
  getProviderModels,
  onModelChange,
  onEndpointChange,
  onApiKeyChange,
  onCustomModelToggle,
}: ProviderModelFieldsProps) {
  if (!providerId) return null;

  const showUrlField = needsUrl || providerId === "custom_api";
  const showApiKeyField = needsApiKey || providerId === "custom_api";

  const urlField = showUrlField ? (
    <Field
      label="Endpoint URL"
      value={endpointUrl}
      onChange={(e) => onEndpointChange(e.target.value)}
      placeholder={
        providerId === "local"
          ? "http://localhost:11434/api/generate"
          : "https://api.example.com/v1/chat/completions"
      }
    />
  ) : null;

  const modelField = (() => {
    if (providerId === "openrouter") {
      return (
        <Box>
          <Typography
            sx={{
              fontSize: "13px",
              fontWeight: 500,
              color: palette.text.secondary,
              mb: 1,
            }}
          >
            Model
          </Typography>
          <Typography sx={{ fontSize: "11px", color: palette.text.tertiary, mb: 1.5 }}>
            OpenRouter supports any model. Enter the model ID or select from saved or popular
            options.
          </Typography>
          <Field
            label=""
            value={modelValue}
            onChange={(e) => onModelChange(e.target.value)}
            placeholder="e.g., openai/gpt-4o, anthropic/claude-3-opus"
          />
          <Typography
            sx={{
              fontSize: "11px",
              fontWeight: 600,
              color: palette.text.disabled,
              mt: 2,
              mb: 1,
              textTransform: "uppercase",
            }}
          >
            Popular Models
          </Typography>
          <Stack
            direction="row"
            sx={{
              flexWrap: "wrap",
              gap: 1,
            }}
          >
            {OPENROUTER_POPULAR_MODELS.map((m) => (
              <MuiChip
                key={m.id}
                label={m.name}
                variant={modelValue === m.id ? "filled" : "outlined"}
                onClick={() => onModelChange(m.id)}
                sx={{
                  "cursor": "pointer",
                  "backgroundColor":
                    modelValue === m.id ? palette.brand.primaryLight : "transparent",
                  "borderColor": modelValue === m.id ? palette.brand.primary : palette.border.dark,
                  "color": modelValue === m.id ? palette.brand.primary : palette.text.secondary,
                  "&:hover": {
                    backgroundColor:
                      modelValue === m.id ? palette.brand.primaryLight : palette.background.accent,
                    borderColor: palette.brand.primary,
                  },
                }}
              />
            ))}
          </Stack>
        </Box>
      );
    }

    if (PROVIDERS[providerId]) {
      return (
        <Box>
          <Typography
            sx={{
              fontSize: "13px",
              fontWeight: 500,
              color: palette.text.secondary,
              mb: 1,
            }}
          >
            Model
          </Typography>
          <FormControl fullWidth size="small">
            <Select
              value={modelValue}
              onChange={(e) => onModelChange(e.target.value as string)}
              displayEmpty
              sx={{
                "fontSize": "13px",
                "& .MuiOutlinedInput-notchedOutline": {
                  borderColor: palette.border.dark,
                },
                "&:hover .MuiOutlinedInput-notchedOutline": {
                  borderColor: palette.border.dark,
                },
                "&.Mui-focused .MuiOutlinedInput-notchedOutline": {
                  borderColor: palette.brand.primary,
                },
              }}
            >
              <MenuItem value="" disabled>
                <Typography sx={{ color: palette.text.disabled, fontSize: "13px" }}>
                  Select a model
                </Typography>
              </MenuItem>
              {getProviderModels(providerId).map((model) => (
                <MenuItem key={model.id} value={model.id}>
                  <Stack
                    direction="row"
                    sx={{
                      alignItems: "center",
                      justifyContent: "space-between",
                      width: "100%",
                    }}
                  >
                    <Typography sx={{ fontSize: "13px" }}>{model.name}</Typography>
                    {mode === "model" && model.inputCost !== undefined && (
                      <Typography sx={{ fontSize: "11px", color: palette.text.disabled }}>
                        ${model.inputCost}/1M in • ${model.outputCost}/1M out
                      </Typography>
                    )}
                  </Stack>
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </Box>
      );
    }

    const providerSavedModels = getProviderModels(providerId);
    const showDropdown = providerSavedModels.length > 0 && !useCustomModelName;
    const placeholder =
      providerId === "ollama"
        ? "e.g., llama2, mistral, codellama"
        : providerId === "huggingface"
          ? "e.g., TinyLlama/TinyLlama-1.1B-Chat-v1.0"
          : "e.g., gpt-4, claude-3-opus";

    if (showDropdown) {
      return (
        <Box>
          <Typography
            sx={{
              fontSize: "13px",
              fontWeight: 500,
              color: palette.text.secondary,
              mb: 1,
            }}
          >
            Model
          </Typography>
          <FormControl fullWidth size="small">
            <Select
              value={modelValue}
              onChange={(e) => {
                const val = e.target.value as string;
                if (val === "__other__") {
                  onCustomModelToggle(true);
                  onModelChange("");
                } else {
                  onModelChange(val);
                }
              }}
              displayEmpty
              sx={{
                "fontSize": "13px",
                "& .MuiOutlinedInput-notchedOutline": {
                  borderColor: palette.border.dark,
                },
                "&:hover .MuiOutlinedInput-notchedOutline": {
                  borderColor: palette.border.dark,
                },
                "&.Mui-focused .MuiOutlinedInput-notchedOutline": {
                  borderColor: palette.brand.primary,
                },
              }}
            >
              <MenuItem value="" disabled>
                <Typography sx={{ color: palette.text.disabled, fontSize: "13px" }}>
                  Select a model
                </Typography>
              </MenuItem>
              {providerSavedModels.map((model) => (
                <MenuItem key={model.id} value={model.id}>
                  <Stack
                    direction="row"
                    sx={{
                      alignItems: "center",
                      justifyContent: "space-between",
                      width: "100%",
                    }}
                  >
                    <Typography sx={{ fontSize: "13px" }}>{model.name}</Typography>
                    {model.description && (
                      <Typography sx={{ fontSize: "11px", color: palette.text.disabled }}>
                        {model.description}
                      </Typography>
                    )}
                  </Stack>
                </MenuItem>
              ))}
              <Divider />
              <MenuItem value="__other__">
                <Typography
                  sx={{
                    fontSize: "13px",
                    color: palette.text.tertiary,
                    fontStyle: "italic",
                  }}
                >
                  Other (type custom)
                </Typography>
              </MenuItem>
            </Select>
          </FormControl>
        </Box>
      );
    }

    return (
      <Box>
        {providerSavedModels.length > 0 && (
          <Button
            size="small"
            variant="text"
            onClick={() => {
              onCustomModelToggle(false);
              onModelChange("");
            }}
            sx={{
              "textTransform": "none",
              "fontSize": "11px",
              "color": palette.text.tertiary,
              "p": 0,
              "mb": 0.5,
              "minWidth": "auto",
              "&:hover": { color: palette.brand.primary },
            }}
          >
            &larr; Back to saved models
          </Button>
        )}
        <Field
          label="Model name"
          value={modelValue}
          onChange={(e) => onModelChange(e.target.value)}
          placeholder={placeholder}
        />
      </Box>
    );
  })();

  return (
    <Box ref={fieldsRef}>
      <Stack spacing={3}>
        {/* Judge custom_api places URL before the model field */}
        {mode === "judge" && providerId === "custom_api" ? urlField : null}
        {modelField}
        {!(mode === "judge" && providerId === "custom_api") ? urlField : null}

        {showApiKeyField &&
          (hasApiKeyConfigured ? (
            <Box
              sx={{
                p: 1.5,
                backgroundColor: palette.status.success.bg,
                borderRadius: "8px",
                border: `1px solid ${palette.status.success.border}`,
              }}
            >
              <Stack
                direction="row"
                spacing={1}
                sx={{
                  alignItems: "center",
                }}
              >
                <Check size={16} color={palette.status.success.text} />
                <Typography sx={{ fontSize: "12px", color: palette.status.success.text }}>
                  API key configured — will be saved for future experiments
                </Typography>
              </Stack>
            </Box>
          ) : (
            <Field
              label={providerId === "custom_api" ? "API key (optional)" : "API key"}
              type="password"
              value={apiKey}
              onChange={(e) => onApiKeyChange(e.target.value)}
              placeholder={
                providerId === "custom_api"
                  ? "Leave blank if not required"
                  : `Enter your ${providerName || ""} API key`
              }
              autoComplete="off"
              helperText={
                providerId === "custom_api"
                  ? undefined
                  : "Your key will be saved securely for future experiments"
              }
            />
          ))}
      </Stack>
    </Box>
  );
}
