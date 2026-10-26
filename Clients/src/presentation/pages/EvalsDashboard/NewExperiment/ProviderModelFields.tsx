/**
 * @fileoverview Shared provider model / endpoint / API-key fields for Model and Judge steps.
 *
 * @module pages/EvalsDashboard/NewExperiment/ProviderModelFields
 */

import {
  Box,
  Button,
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
import ModelPicker from "../../../components/Inputs/ModelPicker";
import { palette } from "../../../themes/palette";
import { PROVIDERS, type ModelInfo } from "../../../utils/providers";
import { apiKeyHelperText, type ProviderType } from "./newExperimentConfig";

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
  /** A key is saved but the provider refused it; the key field explains why it is back. */
  savedKeyRejected?: boolean;
  needsApiKey: boolean;
  needsUrl: boolean;
  fieldsRef?: RefObject<HTMLDivElement | null>;
  getProviderModels: (providerId: string) => ModelInfo[];
  /** The organization's saved model IDs for this provider; the picker lists them first */
  savedModelIds?: string[];
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
  savedKeyRejected = false,
  needsApiKey,
  needsUrl,
  fieldsRef,
  getProviderModels,
  savedModelIds,
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
      // The OpenAI-compatible base URL; the client adds /chat/completions
      placeholder="http://localhost:8000/v1"
    />
  ) : null;

  const modelField = (() => {
    // Cloud providers, OpenRouter included: the gateway catalog, searchable, any ID typed
    if (PROVIDERS[providerId]) {
      return (
        <ModelPicker
          value={modelValue}
          onChange={onModelChange}
          models={getProviderModels(providerId)}
          savedModelIds={savedModelIds}
          showPrices={mode === "model"}
          placeholder={
            providerId === "openrouter"
              ? "Search or type an ID, e.g. openai/gpt-4o"
              : "Search or type a model ID"
          }
          testId={mode}
        />
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
                    alignItems="center"
                    justifyContent="space-between"
                    sx={{ width: "100%" }}
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
              <Stack direction="row" alignItems="center" spacing={1}>
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
                providerId === "custom_api" ? undefined : apiKeyHelperText(savedKeyRejected)
              }
            />
          ))}
      </Stack>
    </Box>
  );
}
