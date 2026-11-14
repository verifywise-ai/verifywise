/**
 * @fileoverview Shared provider model / endpoint / API-key fields for Model and Judge steps.
 *
 * @module pages/EvalsDashboard/NewExperiment/ProviderModelFields
 */

import { Box, Stack, Typography } from "@mui/material";
import { Check } from "lucide-react";
import type { RefObject } from "react";
import Field from "../../../components/Inputs/Field";
import ModelPicker from "../../../components/Inputs/ModelPicker";
import { palette, radiusPx } from "../../../themes/palette";
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
}

export default function ProviderModelFields({
  mode,
  providerId,
  providerName,
  modelValue,
  endpointUrl,
  apiKey,
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

    // Local and custom providers: saved names first, any name can be typed
    const providerSavedModels = getProviderModels(providerId);
    const placeholder =
      providerId === "ollama"
        ? "e.g., llama2, mistral, codellama"
        : providerId === "huggingface"
          ? "e.g., TinyLlama/TinyLlama-1.1B-Chat-v1.0"
          : "e.g., gpt-4, claude-3-opus";

    if (providerSavedModels.length > 0) {
      return (
        <ModelPicker
          label="Model name"
          value={modelValue}
          onChange={onModelChange}
          models={providerSavedModels}
          savedModelIds={providerSavedModels.map((m) => m.id)}
          placeholder={placeholder}
          testId={mode}
        />
      );
    }

    return (
      <Field
        label="Model name"
        value={modelValue}
        onChange={(e) => onModelChange(e.target.value)}
        placeholder={placeholder}
      />
    );
  })();

  return (
    <Box ref={fieldsRef}>
      <Stack spacing="6px">
        {/* Judge custom_api places URL before the model field */}
        {mode === "judge" && providerId === "custom_api" ? urlField : null}
        {modelField}
        {!(mode === "judge" && providerId === "custom_api") ? urlField : null}

        {showApiKeyField &&
          (hasApiKeyConfigured ? (
            <Box
              sx={{
                p: "8px 10px",
                backgroundColor: palette.status.success.bg,
                borderRadius: radiusPx.sm,
                border: `1px solid ${palette.status.success.border}`,
              }}
            >
              <Stack direction="row" alignItems="center" spacing="6px">
                <Check size={14} color={palette.status.success.text} />
                <Typography sx={{ fontSize: "12px", color: palette.status.success.text }}>
                  Uses your saved API key
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
