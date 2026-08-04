/**
 * @fileoverview Model wizard step — provider grid, saved models, and fields.
 *
 * Parent owns all model state; this step only renders and fires callbacks.
 *
 * @module pages/EvalsDashboard/NewExperiment/ModelStep
 */

import {
  Box,
  Card,
  CardContent,
  CircularProgress,
  FormControl,
  Grid,
  MenuItem,
  Select,
  Stack,
  Typography,
} from "@mui/material";
import { Check } from "lucide-react";
import type { RefObject } from "react";
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
  hasApiKey: (providerId: string) => boolean;
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
  hasApiKey,
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

  return (
    <Stack spacing={4}>
      <Box>
        <Typography variant="body2" color="text.secondary">
          Select the model you want to evaluate.
        </Typography>
      </Box>

      {loadingApiKeys ? (
        <Box sx={{ py: 4, textAlign: "center" }}>
          <CircularProgress size={24} />
          <Typography sx={{ mt: 1, fontSize: "13px", color: palette.text.tertiary }}>
            Loading providers...
          </Typography>
        </Box>
      ) : (
        <Box>
          <Typography
            sx={{ mb: 2.5, fontSize: "14px", fontWeight: 500, color: palette.text.secondary }}
          >
            Model provider
          </Typography>
          <Grid container spacing={1.5}>
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
                        "py": 3,
                        "px": 2,
                        "height": "100%",
                        "display": "flex",
                        "flexDirection": "column",
                        "alignItems": "center",
                        "justifyContent": "center",
                        "&:last-child": { pb: 3 },
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
                          "mb": 1.5,
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

      {savedModels.length > 0 && (
        <Box>
          <Typography
            sx={{
              fontSize: "12px",
              fontWeight: 600,
              color: palette.text.disabled,
              textTransform: "uppercase",
              letterSpacing: "0.06em",
              mb: 1.5,
            }}
          >
            Saved Models
          </Typography>
          <Stack spacing={1}>
            {savedModels.map((m) => {
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
                    "px": 2,
                    "py": 1.25,
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
                  <Stack direction="row" alignItems="center" spacing={1.5}>
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
          needsApiKey={!!selectedModelProvider?.needsApiKey}
          needsUrl={!!(selectedModelProvider && selectedModelProvider.needsUrl)}
          fieldsRef={fieldsRef}
          getProviderModels={getProviderModels}
          onModelChange={onModelNameChange}
          onEndpointChange={onEndpointUrlChange}
          onApiKeyChange={onApiKeyChange}
          onCustomModelToggle={onUseCustomModelNameChange}
        />
      )}

      <Box sx={{ mt: "16px" }}>
        <Typography
          variant="body2"
          sx={{ mb: "4px", fontWeight: 500, fontSize: "13px", color: palette.text.secondary }}
        >
          Link to model inventory (optional)
        </Typography>
        <FormControl fullWidth size="small">
          <Select
            value={selectedModelInventoryId !== null ? selectedModelInventoryId : ""}
            onChange={(e) => {
              const val = String(e.target.value);
              onModelInventoryChange(val === "" ? null : Number(val));
            }}
            displayEmpty
            sx={{ height: "34px", fontSize: "13px", borderRadius: "4px" }}
          >
            <MenuItem value="">
              <Typography sx={{ fontSize: "13px", color: palette.text.secondary }}>
                None — don't link to inventory
              </Typography>
            </MenuItem>
            {modelInventories.map((m) => (
              <MenuItem key={m.id} value={m.id}>
                <Stack direction="row" spacing={1} alignItems="center">
                  <Typography sx={{ fontSize: "13px" }}>
                    {m.provider} — {m.model}
                  </Typography>
                  <Typography sx={{ fontSize: "11px", color: palette.text.secondary }}>
                    v{m.version}
                  </Typography>
                </Stack>
              </MenuItem>
            ))}
          </Select>
        </FormControl>
      </Box>
    </Stack>
  );
}
