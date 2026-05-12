import {
  Stack,
  useTheme,
  Box,
  CircularProgress,
  Typography,
  IconButton,
  Collapse,
  Link,
} from "@mui/material";
import { useState, useCallback, useEffect, useMemo } from "react";
import { CustomizableButton } from "../../../components/button/customizable-button";
import {
  Plus as PlusIcon,
  Trash2 as DeleteIcon,
  Edit as EditIcon,
  ExternalLink,
  Server as ServerIcon,
  X as XIcon,
} from "lucide-react";
import Alert from "../../../components/Alert";
import StandardModal from "../../../components/Modals/StandardModal";
import ConfirmationModal from "../../../components/Dialogs/ConfirmationModal";
import Field from "../../../components/Inputs/Field";
import Select from "../../../components/Inputs/Select";
import allowedRoles from "../../../../application/constants/permissions";
import { useAuth } from "../../../../application/hooks/useAuth";
import {
  LLMKeysFormData,
  LLMKeysModel,
  LLMProviderName,
} from "../../../../domain/models/Common/llmKeys/llmKeys.model";
import {
  createLLMKey,
  deleteLLMKey,
  editLLMKey,
  getLLMKeys,
} from "../../../../application/repository/llmKeys.repository";
import { getModelsForProvider, getRecommendedModel } from "../../../utils/providers";

// Import provider logos
import anthropicLogo from "../../../assets/icons/anthropic_logo.svg";
import openaiLogo from "../../../assets/icons/openai_logo.svg";
import openrouterLogo from "../../../assets/icons/openrouter_logo.svg";
import { brand, text, background, border as borderPalette, status } from "../../../themes/palette";

const PROVIDER_LOGOS: Record<string, string> = {
  Anthropic: anthropicLogo,
  OpenAI: openaiLogo,
  OpenRouter: openrouterLogo,
};

interface AlertState {
  variant: "success" | "info" | "warning" | "error";
  title?: string;
  body: string;
  isToast?: boolean;
}

interface HeaderRow {
  key: string;
  value: string;
}

const LLMKeys = () => {
  const initialFormData: LLMKeysFormData = {
    name: "Anthropic",
    key: "",
    model: "",
  };
  const { userRoleName } = useAuth();
  const theme = useTheme();
  const isDisabled = !allowedRoles.llmKeys?.manage?.includes(userRoleName);

  const [keys, setKeys] = useState<LLMKeysModel[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [keyToEdit, setKeyToEdit] = useState<string>("");
  const [keyToDelete, setKeyToDelete] = useState<LLMKeysModel | null>(null);
  const [alert, setAlert] = useState<AlertState | null>(null);
  const [hoveredKeyId, setHoveredKeyId] = useState<number | null>(null);
  const [deletingKeyId, setDeletingKeyId] = useState<number | null>(null);
  const [formData, setFormData] = useState<LLMKeysFormData>(initialFormData);

  // Custom headers state
  const [headerRows, setHeaderRows] = useState<HeaderRow[]>([]);

  const showAlert = useCallback((variant: AlertState["variant"], title: string, body: string) => {
    setAlert({ variant, title, body, isToast: false });
  }, []);

  const fetchLLMKeys = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await getLLMKeys();
      if (response && response.data && response.data.data) {
        const llmKeyModel = response.data.data.map((item: any) => LLMKeysModel.createNewKey(item));
        setKeys(llmKeyModel);
      }
    } catch (_error) {
      showAlert("error", "Error", "Failed to fetch LLM Keys");
    } finally {
      setIsLoading(false);
    }
  }, [showAlert]);

  useEffect(() => {
    fetchLLMKeys();
  }, [fetchLLMKeys]);

  useEffect(() => {
    if (alert) {
      const timeoutId = setTimeout(() => {
        setAlert(null);
      }, 3000);

      return () => clearTimeout(timeoutId);
    }
    return undefined;
  }, [alert]);

  const isCustomProvider = formData.name === "Custom";

  const isCreateButtonDisabled =
    !formData.key ||
    !formData.model ||
    !formData.name ||
    (isCustomProvider && !formData.url) ||
    isLoading;

  // Get provider config for current selection
  const currentProviderConfig = useMemo(
    () => LLMKeysModel.getProviderConfig(formData.name),
    [formData.name],
  );

  // Get provider ID for fetching models
  const currentProviderId = useMemo(
    () => LLMKeysModel.getProviderIdByName(formData.name),
    [formData.name],
  );

  // Track if user is entering a custom model
  const [isCustomModel, setIsCustomModel] = useState(false);
  const [customModelName, setCustomModelName] = useState("");

  // Get models for selected provider with "Other" option
  const modelOptions = useMemo(() => {
    if (isCustomProvider) return [];
    if (!currentProviderId) return [];
    const models = getModelsForProvider(currentProviderId);
    const options = models.map((model) => ({
      _id: model.id,
      name: model.name,
    }));
    // Add "Other" option at the end
    options.push({ _id: "__custom__", name: "Other (enter manually)" });
    return options;
  }, [currentProviderId, isCustomProvider]);

  // Convert headerRows to Record for API
  const getCustomHeadersFromRows = useCallback((): Record<string, string> | null => {
    const filtered = headerRows.filter((r) => r.key.trim() && r.value.trim());
    if (filtered.length === 0) return null;
    const result: Record<string, string> = {};
    for (const row of filtered) {
      result[row.key.trim()] = row.value.trim();
    }
    return result;
  }, [headerRows]);

  // Convert Record to headerRows for editing
  const headersToRows = (headers: Record<string, string> | null | undefined): HeaderRow[] => {
    if (!headers || Object.keys(headers).length === 0) return [];
    return Object.entries(headers).map(([key, value]) => ({ key, value }));
  };

  // Reset model when provider changes, auto-selecting the recommended model
  const handleProviderChange = useCallback((providerName: string) => {
    const isCustom = providerName === "Custom";
    const providerId = LLMKeysModel.getProviderIdByName(providerName as LLMProviderName);
    const recommended = !isCustom && providerId ? getRecommendedModel(providerId) : undefined;
    setFormData((prev) => ({
      ...prev,
      name: providerName as LLMProviderName,
      model: recommended?.id || "",
      url: isCustom ? (prev.name === "Custom" ? prev.url : "") : undefined,
      custom_headers: isCustom ? prev.custom_headers : undefined,
    }));
    setIsCustomModel(isCustom);
    setCustomModelName(isCustom ? "" : "");
    if (!isCustom) {
      setHeaderRows([]);
    }
  }, []);

  // Handle model selection including custom option
  const handleModelChange = useCallback((modelId: string) => {
    if (modelId === "__custom__") {
      setIsCustomModel(true);
      setFormData((prev) => ({ ...prev, model: "" }));
    } else {
      setIsCustomModel(false);
      setCustomModelName("");
      setFormData((prev) => ({ ...prev, model: modelId }));
    }
  }, []);

  // Handle custom model name input
  const handleCustomModelChange = useCallback((value: string) => {
    setCustomModelName(value);
    setFormData((prev) => ({ ...prev, model: value }));
  }, []);

  // Header row management
  const handleAddHeaderRow = useCallback(() => {
    setHeaderRows((prev) => [...prev, { key: "", value: "" }]);
  }, []);

  const handleRemoveHeaderRow = useCallback((index: number) => {
    setHeaderRows((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const handleHeaderRowChange = useCallback(
    (index: number, field: "key" | "value", value: string) => {
      setHeaderRows((prev) =>
        prev.map((row, i) => (i === index ? { ...row, [field]: value } : row)),
      );
    },
    [],
  );

  const handleCreateKey = useCallback(async () => {
    setIsLoading(true);
    try {
      const body: any = {
        name: formData.name,
        key: formData.key,
        model: formData.model,
      };
      if (isCustomProvider) {
        body.url = formData.url;
        body.custom_headers = getCustomHeadersFromRows();
      }
      const response = await createLLMKey({ body });
      if (response && response.data) {
        showAlert("success", "Success", "API key added successfully");
        fetchLLMKeys();
      }
    } catch (error: any) {
      const errorMessage =
        error?.data?.message || error?.response?.data?.message || "Failed to add API key";
      showAlert("error", "Error", errorMessage);
    } finally {
      setIsLoading(false);
      setIsCreateModalOpen(false);
      setIsEditModalOpen(false);
      setFormData(initialFormData);
      setIsCustomModel(false);
      setCustomModelName("");
      setHeaderRows([]);
    }
  }, [
    fetchLLMKeys,
    formData,
    showAlert,
    initialFormData,
    isCustomProvider,
    getCustomHeadersFromRows,
  ]);

  const handleEditKey = useCallback(async () => {
    setIsLoading(true);
    try {
      const body: any = {
        name: formData.name,
        key: formData.key,
        model: formData.model,
      };
      if (isCustomProvider) {
        body.url = formData.url;
        body.custom_headers = getCustomHeadersFromRows();
      }
      const response = await editLLMKey({ id: keyToEdit, body });
      if (response && response.data) {
        showAlert("success", "Success", "API key updated successfully");
        fetchLLMKeys();
      }
    } catch (error: any) {
      const errorMessage =
        error?.data?.message || error?.response?.data?.message || "Failed to update API key";
      showAlert("error", "Error", errorMessage);
    } finally {
      setIsLoading(false);
      setIsCreateModalOpen(false);
      setIsEditModalOpen(false);
      setFormData(initialFormData);
      setIsCustomModel(false);
      setCustomModelName("");
      setHeaderRows([]);
    }
  }, [
    fetchLLMKeys,
    formData,
    showAlert,
    keyToEdit,
    initialFormData,
    isCustomProvider,
    getCustomHeadersFromRows,
  ]);

  const handleDeleteKey = useCallback(async () => {
    if (!keyToDelete) return;
    setIsLoading(true);
    setDeletingKeyId(keyToDelete.id);
    try {
      const response = await deleteLLMKey(keyToDelete.id.toString());
      if (response && response.data) {
        showAlert("success", "Success", "LLM Key deleted successfully");
        fetchLLMKeys();
      }
    } catch (_error) {
      showAlert("error", "Error", "Failed to delete LLM Key");
    } finally {
      setIsLoading(false);
      setDeletingKeyId(null);
      setIsDeleteModalOpen(false);
      setKeyToDelete(null);
    }
  }, [keyToDelete]);

  const handleCloseCreateModal = useCallback(() => {
    setIsCreateModalOpen(false);
    setIsEditModalOpen(false);
    setFormData(initialFormData);
    setIsCustomModel(false);
    setCustomModelName("");
    setHeaderRows([]);
  }, []);

  const handleEditButtonClick = useCallback((data: LLMKeysModel) => {
    setKeyToEdit(data.id.toString());
    const isCustom = data.name === "Custom";
    setFormData({
      name: data.name,
      key: data.key,
      model: data.model,
      url: isCustom ? data.url : undefined,
      custom_headers: isCustom ? data.custom_headers : undefined,
    });

    if (isCustom) {
      setIsCustomModel(true);
      setCustomModelName(data.model);
      setHeaderRows(headersToRows(data.custom_headers));
    } else {
      // Check if the model is a custom one (not in the predefined list)
      const providerId = LLMKeysModel.getProviderIdByName(data.name);
      if (providerId) {
        const models = getModelsForProvider(providerId);
        const isPresetModel = models.some((m) => m.id === data.model);
        if (!isPresetModel) {
          setIsCustomModel(true);
          setCustomModelName(data.model);
        } else {
          setIsCustomModel(false);
          setCustomModelName("");
        }
      }
      setHeaderRows([]);
    }
    setIsEditModalOpen(true);
  }, []);

  const handleFormChange = (name: string, value: string) => {
    setFormData({ ...formData, [name]: value });
  };

  return (
    <Stack sx={{ mt: 3, width: "100%" }}>
      {alert && (
        <Alert
          variant={alert.variant}
          title={alert.title}
          body={alert.body}
          isToast={false}
          onClick={() => setAlert(null)}
        />
      )}

      <Stack sx={{ pt: theme.spacing(20) }}>
        <Box
          sx={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            mb: 3,
          }}
        >
          <Box>
            <Typography sx={{ fontSize: 15, fontWeight: 600, color: `${text.black}` }}>
              LLM Keys
            </Typography>
            <Typography sx={{ fontSize: 13, color: "#666666", mt: 0.5, mb: 3 }}>
              Manage your LLM keys for access to VerifyWise Advisor.
            </Typography>
          </Box>
          {keys.length > 0 && (
            <CustomizableButton
              variant="contained"
              text="Create new LLM key"
              icon={<PlusIcon size={16} />}
              onClick={() => setIsCreateModalOpen(true)}
              isDisabled={isDisabled}
              sx={{
                "backgroundColor": `${brand.primary}`,
                "color": `${background.main}`,
                "&:hover": { backgroundColor: "#0e5c47" },
              }}
            />
          )}
        </Box>

        {isLoading && keys.length === 0 ? (
          <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
            <CircularProgress />
          </Box>
        ) : keys.length === 0 ? (
          <Box
            sx={{
              border: `2px dashed ${status.default.border}`,
              borderRadius: "12px",
              p: 6,
              textAlign: "center",
              backgroundColor: "#fafbfc",
            }}
          >
            <Box
              sx={{
                width: 56,
                height: 56,
                borderRadius: "50%",
                backgroundColor: "#f0fdf4",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                margin: "0 auto",
                mb: 2,
              }}
            >
              <PlusIcon size={24} color={brand.primary} />
            </Box>
            <Typography sx={{ fontSize: 15, fontWeight: 600, color: `${text.black}`, mb: 1 }}>
              No LLM keys yet
            </Typography>
            <Typography sx={{ fontSize: 13, color: "#666666", mb: 3 }}>
              Add your first LLM API key to enable access to your VerifyWise Advisor.
            </Typography>
            <CustomizableButton
              text="Add API key"
              icon={<PlusIcon size={16} />}
              onClick={() => setIsCreateModalOpen(true)}
              isDisabled={isDisabled}
              sx={{
                "backgroundColor": `${brand.primary}`,
                "color": `${background.main}`,
                "&:hover": { backgroundColor: "#0e5c47" },
              }}
            />
          </Box>
        ) : (
          <Box sx={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {keys.map((key) => (
              <Collapse key={key.id} in={deletingKeyId !== key.id} timeout={300}>
                <Box
                  onMouseEnter={() => setHoveredKeyId(key.id)}
                  onMouseLeave={() => setHoveredKeyId(null)}
                  sx={{
                    border: `1.5px solid ${borderPalette.light}`,
                    borderRadius: "4px",
                    p: 4,
                    backgroundColor: hoveredKeyId === key.id ? "#f8fffe" : `${background.main}`,
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    transition: "all 0.3s ease-in-out",
                    cursor: "default",
                    boxShadow:
                      hoveredKeyId === key.id ? "0 2px 8px rgba(19, 113, 91, 0.08)" : "none",
                    opacity: deletingKeyId === key.id ? 0 : 1,
                    transform: deletingKeyId === key.id ? "translateY(-20px)" : "translateY(0)",
                  }}
                >
                  <Box sx={{ flex: 1 }}>
                    <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, mb: 1 }}>
                      {key.name === "Custom" ? (
                        <ServerIcon size={20} color={text.tertiary} strokeWidth={1.5} />
                      ) : (
                        <img
                          src={PROVIDER_LOGOS[key.name]}
                          alt={key.name}
                          style={{ width: 20, height: 20 }}
                        />
                      )}
                      <Typography
                        sx={{
                          fontSize: 14,
                          fontWeight: 600,
                          color: `${text.black}`,
                          letterSpacing: "0.01em",
                        }}
                      >
                        {key.name === "Custom" ? "Custom endpoint" : key.name}
                      </Typography>
                    </Box>
                    <Box sx={{ display: "flex", gap: 2, alignItems: "center" }}>
                      <Typography sx={{ fontSize: 12, color: "#666666" }}>{key.model}</Typography>
                      {key.name === "Custom" && key.url && (
                        <>
                          <Typography sx={{ fontSize: 12, color: "#999999" }}>•</Typography>
                          <Typography
                            sx={{
                              fontSize: 12,
                              color: "#999999",
                              maxWidth: 300,
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {key.url}
                          </Typography>
                        </>
                      )}
                      <Typography sx={{ fontSize: 12, color: "#999999" }}>•</Typography>
                      <Typography sx={{ fontSize: 12, color: "#999999" }}>
                        Added {key.getFormattedCreatedDate()}
                      </Typography>
                    </Box>
                  </Box>
                  <Box sx={{ display: "flex", gap: 1 }}>
                    <IconButton
                      onClick={(e) => {
                        e.stopPropagation();
                        handleEditButtonClick(key);
                      }}
                      disableRipple
                      disabled={isDisabled}
                      sx={{
                        "opacity": hoveredKeyId === key.id ? 1 : 0.6,
                        "transition": "opacity 0.2s ease-in-out",
                        "&:hover": {
                          backgroundColor: "#FEF2F2",
                        },
                        "&:disabled": {
                          opacity: 0.3,
                        },
                      }}
                    >
                      <EditIcon size={18} />
                    </IconButton>
                    <IconButton
                      onClick={(e) => {
                        e.stopPropagation();
                        setKeyToDelete(key);
                        setIsDeleteModalOpen(true);
                      }}
                      disableRipple
                      disabled={isDisabled}
                      sx={{
                        "color": "#DC2626",
                        "opacity": hoveredKeyId === key.id ? 1 : 0.6,
                        "transition": "opacity 0.2s ease-in-out",
                        "&:hover": {
                          backgroundColor: "#FEF2F2",
                        },
                        "&:disabled": {
                          opacity: 0.3,
                        },
                      }}
                    >
                      <DeleteIcon size={18} />
                    </IconButton>
                  </Box>
                </Box>
              </Collapse>
            ))}
          </Box>
        )}
      </Stack>

      {/* Create Key Modal */}
      <StandardModal
        isOpen={isCreateModalOpen || isEditModalOpen}
        onClose={handleCloseCreateModal}
        title={isCreateModalOpen ? "Add API key" : "Edit API key"}
        description={
          isCreateModalOpen
            ? "Connect your LLM provider to enable VerifyWise Advisor."
            : "Update your API key details below."
        }
        onSubmit={isCreateModalOpen ? handleCreateKey : handleEditKey}
        submitButtonText={isLoading ? "Saving..." : isCreateModalOpen ? "Add key" : "Save changes"}
        isSubmitting={isCreateButtonDisabled}
        maxWidth="600px"
      >
        <Stack spacing={6}>
          {/* Provider Selection with Logo */}
          <Box>
            <Typography
              component="label"
              sx={{
                fontSize: 13,
                fontWeight: 500,
                color: `${text.secondary}`,
                mb: 0.5,
                display: "block",
              }}
            >
              Provider <span style={{ color: "#f04438" }}>*</span>
            </Typography>
            <Box
              sx={{
                display: "flex",
                gap: "8px",
                mt: 1,
              }}
            >
              {LLMKeysModel.PROVIDER_CONFIGS.map((provider) => (
                <Box
                  key={provider.id}
                  onClick={() => handleProviderChange(provider.name)}
                  sx={{
                    "flex": 1,
                    "display": "flex",
                    "flexDirection": "column",
                    "alignItems": "center",
                    "gap": 1,
                    "padding": "12px 8px",
                    "borderRadius": "4px",
                    "border": "0.5px solid",
                    "borderColor":
                      formData.name === provider.name
                        ? `${brand.primary}`
                        : `${borderPalette.light}`,
                    "backgroundColor":
                      formData.name === provider.name ? "#f0fdf4" : `${background.main}`,
                    "cursor": "pointer",
                    "transition": "all 0.15s ease",
                    "&:hover": {
                      borderColor: `${brand.primary}`,
                      backgroundColor: "#f8fffe",
                    },
                  }}
                >
                  {provider.id === "custom" ? (
                    <ServerIcon size={24} color={text.tertiary} strokeWidth={1.5} />
                  ) : (
                    <img
                      src={PROVIDER_LOGOS[provider.name]}
                      alt={provider.name}
                      style={{ width: 24, height: 24 }}
                    />
                  )}
                  <Typography sx={{ fontSize: 12, fontWeight: 500, color: `${text.secondary}` }}>
                    {provider.name}
                  </Typography>
                </Box>
              ))}
            </Box>
          </Box>

          {/* Endpoint URL (Custom provider only) */}
          {isCustomProvider && (
            <Box>
              <Field
                id="llm-form-url"
                label="Endpoint URL"
                value={formData.url || ""}
                onChange={(e) => handleFormChange("url", e.target.value)}
                placeholder="https://your-llm-proxy.example.com/v1"
                isRequired
              />
              <Typography sx={{ fontSize: 11, color: "#666666", mt: 0.5 }}>
                OpenAI-compatible endpoint (LiteLLM, vLLM, Ollama, Azure OpenAI, etc.)
              </Typography>
            </Box>
          )}

          {/* Model Selection - Dropdown for standard providers, free text for Custom */}
          {isCustomProvider ? (
            <Box>
              <Field
                id="llm-form-model"
                label="Model name"
                value={formData.model}
                onChange={(e) => handleFormChange("model", e.target.value)}
                placeholder="e.g., gpt-4, llama-3, claude-3-5-sonnet"
                isRequired
              />
              <Typography sx={{ fontSize: 11, color: "#666666", mt: 0.5 }}>
                Enter the exact model ID supported by your endpoint
              </Typography>
            </Box>
          ) : (
            <Box>
              <Select
                id="llm-form-model"
                label="Model"
                value={isCustomModel ? "__custom__" : formData.model}
                items={modelOptions}
                onChange={(e) => handleModelChange(e.target.value as string)}
                placeholder="Select a model"
                isRequired
              />
              {modelOptions.length === 0 && (
                <Typography sx={{ fontSize: 11, color: "#666666", mt: 0.5 }}>
                  Select a provider first to see available models
                </Typography>
              )}
            </Box>
          )}

          {/* Custom Model Input (shown when "Other" is selected for standard providers) */}
          {!isCustomProvider && isCustomModel && (
            <Box>
              <Field
                id="llm-form-custom-model"
                label="Model name"
                value={customModelName}
                onChange={(e) => handleCustomModelChange(e.target.value)}
                placeholder="e.g., claude-3-5-sonnet-20241022"
                isRequired
              />
              <Typography sx={{ fontSize: 11, color: "#666666", mt: 0.5 }}>
                Enter the exact model ID from your provider's documentation
              </Typography>
            </Box>
          )}

          {/* API Key Field with Helper */}
          <Box>
            <Field
              id="llm-form-key"
              label="API key"
              value={formData.key}
              onChange={(e) => handleFormChange("key", e.target.value)}
              placeholder={currentProviderConfig?.keyPlaceholder || "Enter your API key"}
              isRequired
            />
            {!isCustomProvider && currentProviderConfig && (
              <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, mt: 0.5 }}>
                <Typography sx={{ fontSize: 11, color: "#666666" }}>
                  Get your API key from
                </Typography>
                <Link
                  href={currentProviderConfig.apiKeyUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  sx={{
                    "fontSize": 11,
                    "color": `${brand.primary}`,
                    "textDecoration": "none",
                    "display": "inline-flex",
                    "alignItems": "center",
                    "gap": 0.25,
                    "&:hover": { textDecoration: "underline" },
                  }}
                >
                  {currentProviderConfig.name} Console
                  <ExternalLink size={10} />
                </Link>
              </Box>
            )}
          </Box>

          {/* Custom Headers (Custom provider only) */}
          {isCustomProvider && (
            <Box>
              <Typography
                component="label"
                sx={{
                  fontSize: 13,
                  fontWeight: 500,
                  color: `${text.secondary}`,
                  mb: 1,
                  display: "block",
                }}
              >
                Custom headers
              </Typography>
              <Typography sx={{ fontSize: 11, color: "#666666", mb: 1.5 }}>
                Optional HTTP headers sent with every request (e.g., HTTP-Referer, X-Title,
                Helicone-Auth)
              </Typography>
              <Stack spacing="8px">
                {headerRows.map((row, index) => (
                  <Box key={index} sx={{ display: "flex", gap: "8px", alignItems: "center" }}>
                    <Box sx={{ flex: 1 }}>
                      <Field
                        id={`header-key-${index}`}
                        value={row.key}
                        onChange={(e) => handleHeaderRowChange(index, "key", e.target.value)}
                        placeholder="Header name"
                      />
                    </Box>
                    <Box sx={{ flex: 1 }}>
                      <Field
                        id={`header-value-${index}`}
                        value={row.value}
                        onChange={(e) => handleHeaderRowChange(index, "value", e.target.value)}
                        placeholder="Value"
                      />
                    </Box>
                    <IconButton
                      onClick={() => handleRemoveHeaderRow(index)}
                      size="small"
                      sx={{
                        "color": "#999999",
                        "&:hover": { color: "#DC2626", backgroundColor: "#FEF2F2" },
                      }}
                    >
                      <XIcon size={16} />
                    </IconButton>
                  </Box>
                ))}
                <Box>
                  <Typography
                    onClick={handleAddHeaderRow}
                    sx={{
                      "fontSize": 12,
                      "color": "brand.primary",
                      "cursor": "pointer",
                      "display": "inline-flex",
                      "alignItems": "center",
                      "gap": 0.5,
                      "&:hover": { textDecoration: "underline" },
                    }}
                  >
                    <PlusIcon size={14} />
                    Add header
                  </Typography>
                </Box>
              </Stack>
            </Box>
          )}
        </Stack>
      </StandardModal>

      {/* Delete Key Modal */}
      {isDeleteModalOpen && keyToDelete && (
        <ConfirmationModal
          title="Delete API key"
          body={
            <Typography fontSize={13}>
              Are you sure you want to delete the API key "
              {keyToDelete.name === "Custom" ? "Custom endpoint" : keyToDelete.name}"? This action
              cannot be undone and any advisor using this key will lose access.
            </Typography>
          }
          cancelText="Cancel"
          proceedText={isLoading ? "Deleting..." : "Delete"}
          onCancel={() => {
            setIsDeleteModalOpen(false);
            setKeyToDelete(null);
          }}
          onProceed={handleDeleteKey}
          proceedButtonColor="error"
          proceedButtonVariant="contained"
          TitleFontSize={0}
        />
      )}
    </Stack>
  );
};

export default LLMKeys;
