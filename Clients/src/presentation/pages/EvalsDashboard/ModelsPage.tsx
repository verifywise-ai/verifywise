import { useEffect, useMemo, useState, useCallback } from "react";
import {
  Box,
  Stack,
  Typography,
  Card,
  CardContent,
  Grid,
  Select,
  MenuItem,
  FormControl,
  Chip as MuiChip,
  CircularProgress,
} from "@mui/material";
import { Plus, Check } from "lucide-react";
import { CustomizableButton } from "../../components/button/customizable-button";
import SearchBox from "../../components/Search/SearchBox";
import { FilterBy, type FilterColumn } from "../../components/Table/FilterBy";
import { GroupBy } from "../../components/Table/GroupBy";
import { useFilterBy } from "../../../application/hooks/useFilterBy";
import { evalModelsService, type SavedModel } from "../../../infrastructure/api/evalModelsService";
import {
  getAllLlmApiKeys,
  addLlmApiKey,
  type LLMApiKey,
  type LLMProvider,
} from "../../../application/repository/deepEval.repository";
import Alert from "../../components/Alert";
import StandardModal from "../../components/Modals/StandardModal";
import ModelsTable, { type ModelRow } from "../../components/Table/ModelsTable";
import { PageHeader } from "../../components/Layout/PageHeader";
import HelperIcon from "../../components/HelperIcon";
import TipBox from "../../components/TipBox";
import Field from "../../components/Inputs/Field";
import { useAuth } from "../../../application/hooks/useAuth";
import allowedRoles from "../../../application/constants/permissions";
import { PROVIDERS } from "../../utils/providers";
import { palette } from "../../themes/palette";

// Import provider logos
import { ReactComponent as OpenAILogo } from "../../assets/icons/openai_logo.svg";
import { ReactComponent as AnthropicLogo } from "../../assets/icons/anthropic_logo.svg";
import { ReactComponent as OllamaLogo } from "../../assets/icons/ollama_logo.svg";
import { ReactComponent as GeminiLogo } from "../../assets/icons/gemini_logo.svg";
import { ReactComponent as MistralLogo } from "../../assets/icons/mistral_logo.svg";
import { ReactComponent as XAILogo } from "../../assets/icons/xai_logo.svg";
import { ReactComponent as OpenRouterLogo } from "../../assets/icons/openrouter_logo.svg";

// Large SVGs loaded from public/ to avoid bundling
const HuggingFaceLogo = (props: React.SVGProps<SVGSVGElement>) => (
  <img
    src="/assets/icons/huggingface_logo.svg"
    alt="Hugging Face"
    width={props.width || 24}
    height={props.height || 24}
    style={{ display: "inline-block" }}
  />
);
const BuildIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <img
    src="/assets/icons/build.svg"
    alt="Build"
    width={props.width || 24}
    height={props.height || 24}
    style={{ display: "inline-block" }}
  />
);

// Provider definitions for the model selector
const MODEL_PROVIDERS = [
  { id: "openrouter", name: "OpenRouter", Logo: OpenRouterLogo, needsApiKey: true },
  { id: "openai", name: "OpenAI", Logo: OpenAILogo, needsApiKey: true },
  { id: "anthropic", name: "Anthropic", Logo: AnthropicLogo, needsApiKey: true },
  { id: "google", name: "Gemini", Logo: GeminiLogo, needsApiKey: true },
  { id: "xai", name: "xAI", Logo: XAILogo, needsApiKey: true },
  { id: "mistral", name: "Mistral", Logo: MistralLogo, needsApiKey: true },
  { id: "huggingface", name: "Hugging Face", Logo: HuggingFaceLogo, needsApiKey: false },
  { id: "ollama", name: "Ollama", Logo: OllamaLogo, needsApiKey: false },
  { id: "custom", name: "Custom", Logo: BuildIcon, needsApiKey: true },
];

export interface ModelsPageProps {
  orgId: string;
  openAddModal?: boolean;
  onAddModalConsumed?: () => void;
}

interface AlertState {
  variant: "success" | "error";
  body: string;
}

interface NewModelConfig {
  accessMethod: string;
  modelName: string;
  endpointUrl: string;
  apiKey: string;
}

export default function ModelsPage({ orgId, openAddModal, onAddModalConsumed }: ModelsPageProps) {
  const [models, setModels] = useState<SavedModel[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [alert, setAlert] = useState<AlertState | null>(null);

  // RBAC permissions
  const { userRoleName } = useAuth();
  const canDeleteModel = allowedRoles.evals.deleteScorer?.includes(userRoleName) ?? true;
  const canCreateModel = allowedRoles.evals.createScorer?.includes(userRoleName) ?? true;

  // Delete confirmation modal state
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [modelToDelete, setModelToDelete] = useState<ModelRow | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // New model modal state
  const [addModalOpen, setAddModalOpen] = useState(false);
  useEffect(() => {
    if (openAddModal) {
      setAddModalOpen(true);
      onAddModalConsumed?.(); // reset the flag in the parent so returning later doesn't re-open
    }
  }, [openAddModal, onAddModalConsumed]);
  const [isSaving, setIsSaving] = useState(false);
  const [newModel, setNewModel] = useState<NewModelConfig>({
    accessMethod: "",
    modelName: "",
    endpointUrl: "",
    apiKey: "",
  });

  // API keys state
  const [configuredApiKeys, setConfiguredApiKeys] = useState<LLMApiKey[]>([]);
  const [loadingApiKeys, setLoadingApiKeys] = useState(true);

  // Gateway models state
  const [gatewayModels, setGatewayModels] = useState<{ id: string; name: string }[]>([]);
  const [loadingGatewayModels, setLoadingGatewayModels] = useState(false);

  // Load configured API keys when modal opens
  useEffect(() => {
    if (!addModalOpen) return;
    (async () => {
      try {
        setLoadingApiKeys(true);
        const keys = await getAllLlmApiKeys();
        setConfiguredApiKeys(keys);
      } catch {
        /* ignore */
      } finally {
        setLoadingApiKeys(false);
      }
    })();
  }, [addModalOpen]);

  // Fetch live gateway models whenever the selected provider changes
  useEffect(() => {
    const provider = newModel.accessMethod;
    if (!provider || provider === "custom" || provider === "ollama" || provider === "openrouter") {
      setGatewayModels([]);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoadingGatewayModels(true);
      try {
        const models = await evalModelsService.getGatewayModelsForProvider(provider);
        if (!cancelled) {
          setGatewayModels(models.map((m) => ({ id: m.id, name: m.name })));
        }
      } catch {
        if (!cancelled) setGatewayModels([]);
      } finally {
        if (!cancelled) setLoadingGatewayModels(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [newModel.accessMethod]);

  // Check if a provider has a configured API key
  const hasApiKey = useCallback(
    (providerId: string): boolean => {
      return configuredApiKeys.some((k) => k.provider === providerId);
    },
    [configuredApiKeys],
  );

  // Get provider config from MODEL_PROVIDERS
  const getModelProvider = useCallback((providerId: string) => {
    return MODEL_PROVIDERS.find((p) => p.id === providerId);
  }, []);

  const loadModels = useCallback(async () => {
    try {
      setLoading(true);
      const allModels = await evalModelsService.listModels(orgId);
      setModels(allModels);
    } catch (err) {
      console.error("Failed to load models", err);
      setAlert({ variant: "error", body: "Failed to load models" });
      setTimeout(() => setAlert(null), 4000);
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  useEffect(() => {
    void loadModels();
  }, [orgId, loadModels]);

  const filterColumns: FilterColumn[] = useMemo(
    () => [
      { id: "name", label: "Name", type: "text" },
      { id: "provider", label: "Provider", type: "text" },
    ],
    [],
  );

  const getFieldValue = useCallback(
    (m: SavedModel, fieldId: string): string | number | Date | null | undefined => {
      switch (fieldId) {
        case "name":
          return m.name;
        case "provider":
          return m.provider;
        default:
          return "";
      }
    },
    [],
  );

  const { filterData, handleFilterChange } = useFilterBy<SavedModel>(getFieldValue);

  const filteredModels = useMemo(() => {
    const afterFilter = filterData(models);
    if (!searchTerm.trim()) return afterFilter;
    const q = searchTerm.toLowerCase();
    return afterFilter.filter((m) =>
      [m.name, m.provider].filter(Boolean).join(" ").toLowerCase().includes(q),
    );
  }, [models, filterData, searchTerm]);

  // Convert SavedModel to ModelRow for the table
  const modelRows: ModelRow[] = useMemo(() => {
    return filteredModels.map((m) => ({
      id: m.id,
      modelName: m.name,
      modelProvider: m.provider,
      createdAt: m.createdAt,
      updatedAt: m.updatedAt,
    }));
  }, [filteredModels]);

  // Delete handler from menu
  const handleDelete = useCallback((row: ModelRow) => {
    setModelToDelete(row);
    setDeleteModalOpen(true);
  }, []);

  const handleConfirmDelete = async () => {
    if (!modelToDelete) return;
    setIsDeleting(true);
    try {
      const success = await evalModelsService.deleteModel(modelToDelete.id);
      if (success) {
        setAlert({ variant: "success", body: "Model deleted successfully" });
        setTimeout(() => setAlert(null), 3000);
        setDeleteModalOpen(false);
        setModelToDelete(null);
        void loadModels();
      } else {
        throw new Error("Delete failed");
      }
    } catch (err) {
      console.error("Failed to delete model", err);
      setAlert({ variant: "error", body: "Failed to delete model" });
      setTimeout(() => setAlert(null), 4000);
    } finally {
      setIsDeleting(false);
    }
  };

  // Handle adding a new model
  const handleAddModel = () => {
    setNewModel({
      accessMethod: "",
      modelName: "",
      endpointUrl: "",
      apiKey: "",
    });
    setAddModalOpen(true);
  };

  const handleSaveNewModel = async () => {
    if (!newModel.accessMethod || !newModel.modelName) {
      setAlert({ variant: "error", body: "Please select a provider and model" });
      setTimeout(() => setAlert(null), 4000);
      return;
    }

    // Check if API key is required and not configured
    const modelProvider = getModelProvider(newModel.accessMethod);
    const needsApiKey = modelProvider?.needsApiKey;
    const hasSavedKey = hasApiKey(newModel.accessMethod);

    if (needsApiKey && !hasSavedKey && !newModel.apiKey) {
      setAlert({ variant: "error", body: "Please enter an API key for this provider" });
      setTimeout(() => setAlert(null), 4000);
      return;
    }

    setIsSaving(true);
    try {
      // Save API key if entered and not already configured
      if (newModel.apiKey && newModel.accessMethod && modelProvider && !hasSavedKey) {
        try {
          const newKey = await addLlmApiKey({
            provider: newModel.accessMethod as LLMProvider,
            apiKey: newModel.apiKey,
          });
          setConfiguredApiKeys((prev) => [...prev, newKey]);
        } catch (err) {
          console.warn("Failed to save API key:", err);
        }
      }

      // Create model using the new API
      const created = await evalModelsService.createModel({
        orgId: orgId,
        name: newModel.modelName,
        provider: newModel.accessMethod,
        endpointUrl: newModel.endpointUrl || undefined,
      });

      if (created) {
        setAlert({ variant: "success", body: "Model added successfully" });
        setTimeout(() => setAlert(null), 3000);
        setAddModalOpen(false);
        void loadModels();
      } else {
        throw new Error("Save failed");
      }
    } catch (err) {
      console.error("Failed to add model", err);
      setAlert({ variant: "error", body: "Failed to add model" });
      setTimeout(() => setAlert(null), 4000);
    } finally {
      setIsSaving(false);
    }
  };

  // Get available models for selected provider — prefer live gateway models, fall back to static
  const availableModels = useMemo(() => {
    if (
      !newModel.accessMethod ||
      newModel.accessMethod === "custom" ||
      newModel.accessMethod === "ollama"
    ) {
      return [];
    }
    if (gatewayModels.length > 0) return gatewayModels;
    return PROVIDERS[newModel.accessMethod]?.models || [];
  }, [newModel.accessMethod, gatewayModels]);

  return (
    <Stack sx={{ width: "100%" }}>
      {alert && <Alert variant={alert.variant} body={alert.body} />}

      <PageHeader
        title="Models"
        description="View and manage model configurations. These preferences are automatically saved when you run an experiment and auto-loaded for new experiments in the same project."
        rightContent={<HelperIcon articlePath="llm-evals/models" />}
      />
      <Box sx={{ mt: "18px" }}>
        <TipBox entityName="evals-models" />
      </Box>

      {/* Controls row */}
      <Stack
        direction="row"
        justifyContent="space-between"
        alignItems="center"
        sx={{ marginBottom: "18px" }}
        gap={2}
      >
        <Stack direction="row" alignItems="center" gap={2}>
          <FilterBy columns={filterColumns} onFilterChange={handleFilterChange} />
          <GroupBy
            options={[{ id: "modelProvider", label: "Provider" }]}
            onGroupChange={() => {}}
          />
          <SearchBox
            placeholder="Search models..."
            value={searchTerm}
            onChange={setSearchTerm}
            inputProps={{ "aria-label": "Search models" }}
            fullWidth={false}
          />
        </Stack>
        <CustomizableButton
          variant="contained"
          text="New model"
          icon={<Plus size={16} />}
          sx={{
            backgroundColor: palette.brand.primary,
            border: `1px solid ${palette.brand.primary}`,
            gap: 2,
          }}
          onClick={handleAddModel}
          isDisabled={loading || !canCreateModel}
        />
      </Stack>

      {/* Models table */}
      <Box mb={4}>
        <ModelsTable
          rows={modelRows}
          onDelete={canDeleteModel ? handleDelete : undefined}
          loading={loading}
        />
      </Box>

      {/* Delete Confirmation Modal */}
      <StandardModal
        isOpen={deleteModalOpen}
        onClose={() => {
          setDeleteModalOpen(false);
          setModelToDelete(null);
        }}
        title="Delete model"
        description={`Are you sure you want to delete "${modelToDelete?.modelName || "this model"}"? This action cannot be undone.`}
        onSubmit={handleConfirmDelete}
        submitButtonText="Delete"
        isSubmitting={isDeleting}
        submitButtonColor={palette.status.error.text}
      />

      {/* Add Model Modal */}
      <StandardModal
        isOpen={addModalOpen}
        onClose={() => setAddModalOpen(false)}
        title="Add Model"
        description="Select the model you want to save for future experiments."
        onSubmit={handleSaveNewModel}
        submitButtonText="Save Model"
        isSubmitting={isSaving}
        submitButtonColor={palette.brand.primary}
        maxWidth="md"
      >
        {loadingApiKeys ? (
          <Box sx={{ py: 4, textAlign: "center" }}>
            <CircularProgress size={24} />
            <Typography sx={{ mt: 1, fontSize: "13px", color: palette.text.tertiary }}>
              Loading providers...
            </Typography>
          </Box>
        ) : (
          <Stack spacing={4}>
            {/* Provider Selection */}
            <Box>
              <Typography
                sx={{ mb: 2.5, fontSize: "14px", fontWeight: 500, color: palette.text.secondary }}
              >
                Model provider
              </Typography>
              <Grid container spacing={1.5}>
                {MODEL_PROVIDERS.map((provider) => {
                  const { Logo } = provider;
                  const isSelected = newModel.accessMethod === provider.id;

                  return (
                    <Grid size={{ xs: 4, sm: 3 }} key={provider.id}>
                      <Card
                        onClick={() =>
                          setNewModel((prev) => ({
                            ...prev,
                            accessMethod: provider.id,
                            modelName: "",
                          }))
                        }
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

            {/* Model Selection */}
            {newModel.accessMethod && (
              <Box>
                <Typography
                  sx={{ fontSize: "13px", fontWeight: 500, color: palette.text.secondary, mb: 1 }}
                >
                  Model
                </Typography>

                {newModel.accessMethod === "openrouter" ? (
                  /* OpenRouter - Custom model input with suggestions */
                  <Box>
                    <Typography sx={{ fontSize: "11px", color: palette.text.tertiary, mb: 1.5 }}>
                      OpenRouter supports any model. Enter the model ID or select from popular
                      options.
                    </Typography>
                    <Field
                      label=""
                      value={newModel.modelName}
                      onChange={(e) =>
                        setNewModel((prev) => ({ ...prev, modelName: e.target.value }))
                      }
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
                    <Stack direction="row" flexWrap="wrap" gap={1}>
                      {[
                        { id: "openai/gpt-4o", name: "GPT-4o" },
                        { id: "anthropic/claude-3.5-sonnet", name: "Claude 3.5 Sonnet" },
                        { id: "google/gemini-pro-1.5", name: "Gemini Pro 1.5" },
                        { id: "meta-llama/llama-3.1-70b-instruct", name: "Llama 3.1 70B" },
                        { id: "mistralai/mistral-large", name: "Mistral Large" },
                      ].map((m) => (
                        <MuiChip
                          key={m.id}
                          label={m.name}
                          variant={newModel.modelName === m.id ? "filled" : "outlined"}
                          onClick={() => setNewModel((prev) => ({ ...prev, modelName: m.id }))}
                          sx={{
                            "cursor": "pointer",
                            "backgroundColor":
                              newModel.modelName === m.id
                                ? palette.brand.primaryLight
                                : "transparent",
                            "borderColor":
                              newModel.modelName === m.id
                                ? palette.brand.primary
                                : palette.border.dark,
                            "color":
                              newModel.modelName === m.id
                                ? palette.brand.primary
                                : palette.text.secondary,
                            "&:hover": {
                              backgroundColor:
                                newModel.modelName === m.id
                                  ? palette.brand.primaryLight
                                  : palette.background.accent,
                              borderColor: palette.brand.primary,
                            },
                          }}
                        />
                      ))}
                    </Stack>
                  </Box>
                ) : newModel.accessMethod === "ollama" || newModel.accessMethod === "custom" ? (
                  /* Ollama/Custom - Text input */
                  <Box>
                    <Typography sx={{ fontSize: "11px", color: palette.text.tertiary, mb: 1.5 }}>
                      {newModel.accessMethod === "ollama"
                        ? "Enter the name of your locally running Ollama model."
                        : "Enter the model identifier for your custom endpoint."}
                    </Typography>
                    <Field
                      label=""
                      value={newModel.modelName}
                      onChange={(e) =>
                        setNewModel((prev) => ({ ...prev, modelName: e.target.value }))
                      }
                      placeholder={
                        newModel.accessMethod === "ollama"
                          ? "e.g., llama3.2, mistral"
                          : "e.g., my-custom-model"
                      }
                    />
                    {newModel.accessMethod === "custom" && (
                      <Box sx={{ mt: 2 }}>
                        <Typography
                          sx={{
                            fontSize: "13px",
                            fontWeight: 500,
                            color: palette.text.secondary,
                            mb: 1,
                          }}
                        >
                          Endpoint URL
                        </Typography>
                        <Field
                          label=""
                          value={newModel.endpointUrl}
                          onChange={(e) =>
                            setNewModel((prev) => ({ ...prev, endpointUrl: e.target.value }))
                          }
                          placeholder="https://your-api-endpoint.com/v1"
                        />
                      </Box>
                    )}
                  </Box>
                ) : loadingGatewayModels ? (
                  /* Loading models from gateway */
                  <Stack direction="row" alignItems="center" gap={1.5} sx={{ py: 1 }}>
                    <CircularProgress size={16} />
                    <Typography sx={{ fontSize: "13px", color: palette.text.tertiary }}>
                      Loading models...
                    </Typography>
                  </Stack>
                ) : availableModels.length > 0 ? (
                  /* Standard providers - Dropdown populated from AI Gateway */
                  <FormControl fullWidth size="small">
                    <Select
                      value={newModel.modelName}
                      onChange={(e) =>
                        setNewModel((prev) => ({ ...prev, modelName: e.target.value }))
                      }
                      displayEmpty
                      sx={{ backgroundColor: palette.background.main }}
                    >
                      <MenuItem value="" disabled>
                        Select a model
                      </MenuItem>
                      {availableModels.map((model) => (
                        <MenuItem key={model.id} value={model.id}>
                          {model.name}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                ) : (
                  /* Fallback text input */
                  <Field
                    label=""
                    value={newModel.modelName}
                    onChange={(e) =>
                      setNewModel((prev) => ({ ...prev, modelName: e.target.value }))
                    }
                    placeholder="Enter model name"
                  />
                )}
              </Box>
            )}

            {/* API Key - show configured status OR input field */}
            {newModel.accessMethod &&
              getModelProvider(newModel.accessMethod)?.needsApiKey &&
              (hasApiKey(newModel.accessMethod) ? (
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
                      API key configured — will be used for this model
                    </Typography>
                  </Stack>
                </Box>
              ) : (
                <Box>
                  <Typography
                    sx={{ fontSize: "13px", fontWeight: 500, color: palette.text.secondary, mb: 1 }}
                  >
                    API Key
                  </Typography>
                  <Field
                    label=""
                    type="password"
                    value={newModel.apiKey}
                    onChange={(e) => setNewModel((prev) => ({ ...prev, apiKey: e.target.value }))}
                    placeholder={`Enter your ${MODEL_PROVIDERS.find((p) => p.id === newModel.accessMethod)?.name || newModel.accessMethod} API key`}
                    autoComplete="off"
                  />
                  <Typography sx={{ fontSize: "11px", color: palette.text.tertiary, mt: 0.5 }}>
                    Your key will be saved securely for future experiments
                  </Typography>
                </Box>
              ))}
          </Stack>
        )}
      </StandardModal>
    </Stack>
  );
}
