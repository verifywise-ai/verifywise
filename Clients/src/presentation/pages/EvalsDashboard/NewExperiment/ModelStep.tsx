/**
 * @fileoverview Model wizard step — provider grid, saved models, and fields.
 *
 * Parent owns all model state; this step only renders and fires callbacks.
 *
 * @module pages/EvalsDashboard/NewExperiment/ModelStep
 */

import { Box, Card, CardContent, CircularProgress, Grid, Stack, Typography } from "@mui/material";
import { Check } from "lucide-react";
import type { RefObject } from "react";
import Select from "../../../components/Inputs/Select";
import { palette } from "../../../themes/palette";
import type { ModelInfo } from "../../../utils/providers";
import type { SavedModel } from "../../../../infrastructure/api/evalModelsService";
import type { ProviderType } from "./newExperimentConfig";
import { availableModelProviders } from "./providerConfig";
import ProviderModelFields from "./ProviderModelFields";

export interface ModelInventoryOption {
  id: number;
  provider: string;
  model: string;
  version: string;
}

export interface ModelStepProps {
  loadingApiKeys: boolean;
  savedModels: SavedModel[];
  selectedSavedModelId: string | null;
  modelConfig: {
    name: string;
    accessMethod: ProviderType | "";
    endpointUrl: string;
    apiKey: string;
  };
  useCustomModelName: boolean;
  modelInventories: ModelInventoryOption[];
  selectedModelInventoryId: number | null;
  fieldsRef?: RefObject<HTMLDivElement | null>;
  getProviderModels: (providerId: string) => ModelInfo[];
  /** The organization's saved model IDs for a provider, listed first in the picker */
  getSavedModelIds?: (providerId: string) => string[];
  hasApiKey: (providerId: string) => boolean;
  savedKeyRejected: (providerId: string) => boolean;
  onProviderSelect: (providerId: ProviderType) => void;
  onModelNameChange: (name: string) => void;
  onEndpointUrlChange: (url: string) => void;
  onApiKeyChange: (key: string) => void;
  onSavedModelSelect: (id: string | null) => void;
  onUseCustomModelNameChange: (custom: boolean) => void;
  onModelInventoryChange: (id: number | null) => void;
}

export default function ModelStep({
  loadingApiKeys,
  savedModels,
  selectedSavedModelId,
  modelConfig,
  useCustomModelName,
  modelInventories,
  selectedModelInventoryId,
  fieldsRef,
  getProviderModels,
  getSavedModelIds,
  hasApiKey,
  savedKeyRejected,
  onProviderSelect,
  onModelNameChange,
  onEndpointUrlChange,
  onApiKeyChange,
  onSavedModelSelect,
  onUseCustomModelNameChange,
  onModelInventoryChange,
}: ModelStepProps) {
  const selectedModelProvider = availableModelProviders.find(
    (p) => p.id === modelConfig.accessMethod,
  );
  // Nothing stops the same model being saved twice (Models page, older seeds); identical
  // rows can't be told apart, so list each name + provider + endpoint once
  const seenSavedModels = new Set<string>();
  const uniqueSavedModels = savedModels.filter((m) => {
    const key = `${m.provider.toLowerCase()}|${m.name}|${m.endpointUrl ?? ""}`;
    if (seenSavedModels.has(key)) return false;
    seenSavedModels.add(key);
    return true;
  });

  return (
    <Stack spacing="8px">
      <Box>
        <Typography variant="body2" color="text.secondary">
          Select the model you want to evaluate.
        </Typography>
      </Box>

      {loadingApiKeys ? (
        <Box sx={{ py: "8px", textAlign: "center" }}>
          <CircularProgress size={24} />
          <Typography sx={{ mt: "2px", fontSize: "13px", color: palette.text.tertiary }}>
            Loading providers...
          </Typography>
        </Box>
      ) : (
        <Box>
          <Typography
            sx={{ mb: "5px", fontSize: "14px", fontWeight: 500, color: palette.text.secondary }}
          >
            Model provider
          </Typography>
          <Grid container spacing="3px">
            {availableModelProviders.map((provider) => {
              const { Logo } = provider;
              const isSelected = modelConfig.accessMethod === provider.id;

              return (
                <Grid size={{ xs: 4, sm: 3 }} key={provider.id}>
                  <Card
                    onClick={() => onProviderSelect(provider.id)}
                    sx={{
                      "cursor": "pointer",
                      "border": "1px solid",
                      "borderColor": isSelected ? palette.brand.primary : palette.border.dark,
                      "backgroundColor": palette.background.main,
                      "boxShadow": "none",
                      "transition": "all 0.2s ease",
                      "position": "relative",
                      "height": "100%",
                      "&:hover": {
                        borderColor: palette.brand.primary,
                        boxShadow: "0 2px 6px rgba(0,0,0,0.06)",
                      },
                    }}
                  >
                    <CardContent
                      sx={{
                        "textAlign": "center",
                        "py": "6px",
                        "px": "4px",
                        "height": "100%",
                        "display": "flex",
                        "flexDirection": "column",
                        "alignItems": "center",
                        "justifyContent": "center",
                        "&:last-child": { pb: "6px" },
                      }}
                    >
                      {isSelected && (
                        <Box
                          sx={{
                            position: "absolute",
                            top: 8,
                            right: 8,
                            backgroundColor: palette.brand.primary,
                            borderRadius: "50%",
                            width: 20,
                            height: 20,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                          }}
                        >
                          <Check size={12} color={palette.background.main} strokeWidth={3} />
                        </Box>
                      )}

                      <Box
                        sx={{
                          "display": "flex",
                          "alignItems": "center",
                          "justifyContent": "center",
                          "width": 40,
                          "height": 40,
                          "mb": "3px",
                          "& svg": {
                            width: 32,
                            height: 32,
                          },
                        }}
                      >
                        <Logo />
                      </Box>

                      <Typography
                        sx={{
                          fontSize: "12px",
                          fontWeight: isSelected ? 600 : 500,
                          color: isSelected ? palette.brand.primary : palette.text.secondary,
                          textAlign: "center",
                        }}
                      >
                        {provider.name}
                      </Typography>
                    </CardContent>
                  </Card>
                </Grid>
              );
            })}
          </Grid>
        </Box>
      )}

      {uniqueSavedModels.length > 0 && (
        <Box>
          <Typography
            sx={{
              fontSize: "12px",
              fontWeight: 600,
              color: palette.text.disabled,
              textTransform: "uppercase",
              letterSpacing: "0.06em",
              mb: "3px",
            }}
          >
            Saved models
          </Typography>
          <Stack spacing="2px">
            {uniqueSavedModels.map((m) => {
              const providerKey = m.provider.toLowerCase();
              const providerEntry = availableModelProviders.find((p) => p.id === providerKey);
              const ProviderLogo = providerEntry?.Logo ?? null;
              const isSelected = selectedSavedModelId === m.id;
              return (
                <Box
                  key={m.id}
                  onClick={() => onSavedModelSelect(isSelected ? null : m.id)}
                  sx={{
                    "display": "flex",
                    "alignItems": "center",
                    "justifyContent": "space-between",
                    "px": "4px",
                    "py": "2.5px",
                    "borderRadius": "8px",
                    "border": `1.5px solid ${isSelected ? palette.brand.primary : palette.border.light}`,
                    "backgroundColor": isSelected ? palette.brand.primaryLight : "transparent",
                    "cursor": "pointer",
                    "transition": "all 0.15s ease",
                    "&:hover": {
                      borderColor: palette.brand.primary,
                      backgroundColor: palette.brand.primaryLight,
                    },
                  }}
                >
                  <Stack direction="row" alignItems="center" spacing="3px">
                    {ProviderLogo && (
                      <Box
                        sx={{
                          width: 20,
                          height: 20,
                          flexShrink: 0,
                          display: "flex",
                          alignItems: "center",
                        }}
                      >
                        <ProviderLogo style={{ width: 20, height: 20 }} />
                      </Box>
                    )}
                    <Typography
                      sx={{
                        fontSize: "13px",
                        fontWeight: 500,
                        color: isSelected ? palette.brand.primary : palette.text.primary,
                      }}
                    >
                      {m.name}
                    </Typography>
                  </Stack>
                  <Box
                    sx={{
                      width: 18,
                      height: 18,
                      borderRadius: "50%",
                      border: `1.5px solid ${isSelected ? palette.brand.primary : palette.border.dark}`,
                      backgroundColor: isSelected ? palette.brand.primary : "transparent",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                      transition: "all 0.15s ease",
                    }}
                  >
                    {isSelected && (
                      <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                        <path
                          d="M1 4L3.5 6.5L9 1"
                          stroke="white"
                          strokeWidth="1.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    )}
                  </Box>
                </Box>
              );
            })}
          </Stack>
        </Box>
      )}

      {modelConfig.accessMethod && (
        <ProviderModelFields
          mode="model"
          providerId={modelConfig.accessMethod}
          providerName={selectedModelProvider?.name || ""}
          modelValue={modelConfig.name}
          endpointUrl={modelConfig.endpointUrl}
          apiKey={modelConfig.apiKey}
          useCustomModelName={useCustomModelName}
          hasApiKeyConfigured={hasApiKey(modelConfig.accessMethod)}
          savedKeyRejected={savedKeyRejected(modelConfig.accessMethod)}
          needsApiKey={!!selectedModelProvider?.needsApiKey}
          needsUrl={!!(selectedModelProvider && selectedModelProvider.needsUrl)}
          fieldsRef={fieldsRef}
          getProviderModels={getProviderModels}
          savedModelIds={getSavedModelIds?.(modelConfig.accessMethod)}
          onModelChange={onModelNameChange}
          onEndpointChange={onEndpointUrlChange}
          onApiKeyChange={onApiKeyChange}
          onCustomModelToggle={onUseCustomModelNameChange}
        />
      )}

      <Box sx={{ mt: "16px" }}>
        <Select
          id="experiment-model-inventory-link"
          label="Link to model inventory (optional)"
          value={selectedModelInventoryId !== null ? String(selectedModelInventoryId) : ""}
          onChange={(e) => {
            const val = String(e.target.value);
            onModelInventoryChange(val === "" ? null : Number(val));
          }}
          items={[
            { _id: "", name: "None — don't link to inventory" },
            ...modelInventories.map((m) => ({
              _id: String(m.id),
              name: `${m.provider} — ${m.model} (v${m.version})`,
            })),
          ]}
          sx={{ width: "100%" }}
        />
      </Box>
    </Stack>
  );
}
