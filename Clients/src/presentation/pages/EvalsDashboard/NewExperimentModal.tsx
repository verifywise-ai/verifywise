import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import {
  Box,
  Typography,
  Stack,
  Card,
  CardContent,
  Grid,
  Button,
  Divider,
  Select,
  MenuItem,
  FormControl,
  CircularProgress,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  FormHelperText,
  Chip as MuiChip,
} from "@mui/material";
import { Check, Database, ExternalLink, Upload, Sparkles, Settings, Plus, Layers, ChevronDown, FileSearch, MessageSquare, Bot, Clock } from "lucide-react";
import StepperModal from "../../components/Modals/StepperModal";
import SelectableCard from "../../components/SelectableCard";
import Field from "../../components/Inputs/Field";
import Checkbox from "../../components/Inputs/Checkbox";
import Alert from "../../components/Alert";
import Chip from "../../components/Chip";
import { palette } from "../../themes/palette";

// Import provider logos
import { ReactComponent as OpenAILogo } from "../../assets/icons/openai_logo.svg";
import { ReactComponent as AnthropicLogo } from "../../assets/icons/anthropic_logo.svg";
import { ReactComponent as HuggingFaceLogo } from "../../assets/icons/huggingface_logo.svg";
import { ReactComponent as OllamaLogo } from "../../assets/icons/ollama_logo.svg";
import { ReactComponent as GeminiLogo } from "../../assets/icons/gemini_logo.svg";
import { ReactComponent as MistralLogo } from "../../assets/icons/mistral_logo.svg";
import { ReactComponent as XAILogo } from "../../assets/icons/xai_logo.svg";
import { ReactComponent as OpenRouterLogo } from "../../assets/icons/openrouter_logo.svg";
import { ReactComponent as FolderFilledIcon } from "../../assets/icons/folder_filled.svg";
import { ReactComponent as BuildIcon } from "../../assets/icons/build.svg";
import {
  createExperiment,
  listDatasets,
  listMyDatasets,
  readDataset,
  uploadDataset,
  listScorers,
  getAllLlmApiKeys,
  addLlmApiKey,
  validateModel,
  type DeepEvalScorer,
  type LLMApiKey,
  type LLMProvider,
} from "../../../application/repository/deepEval.repository";
import { PROVIDERS, type ModelInfo } from "../../utils/providers";
import { evalModelsService, type SavedModel } from "../../../infrastructure/api/evalModelsService";
import { useModelPreferences } from "../../../application/hooks/useModelPreferences";

interface NewExperimentModalProps {
  isOpen: boolean;
  onClose: () => void;
  projectId: string;
  orgId?: string | null;
  onSuccess: () => void;
  onStarted?: (exp: { id: string; name?: string; config: Record<string, unknown>; status: string; created_at?: string }) => void;
  /** Project's use case - determines default metrics and datasets (required) */
  useCase: "chatbot" | "rag" | "agent";
}

const steps = ["Model", "Dataset", "Scorer / Judge", "Metrics"];

export default function NewExperimentModal({
  isOpen,
  onClose,
  projectId,
  orgId,
  onSuccess,
  onStarted,
  useCase,
}: NewExperimentModalProps) {
  const [activeStep, setActiveStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const formFieldsRef = useRef<HTMLDivElement>(null);

  // Alert state for showing success/error messages
  const [alert, setAlert] = useState<{
    show: boolean;
    variant: "success" | "error" | "info" | "warning";
    title: string;
    body: string;
  } | null>(null);

  // Track if user acknowledged API key warning and wants to proceed anyway
  const [apiKeyWarningAcknowledged, setApiKeyWarningAcknowledged] = useState(false);

  // Dataset prompts state
  interface DatasetPrompt {
    id: string;
    category: string;
    prompt: string;
    expected_output: string;
    expected_keywords: string[];
    difficulty: string;
  }
  const [datasetPrompts, setDatasetPrompts] = useState<DatasetPrompt[]>([]);
  const [datasetLoaded, setDatasetLoaded] = useState(false);
  // User's saved datasets (for "My datasets" option)
  const [userDatasets, setUserDatasets] = useState<Array<{ id: string; name: string; path: string; promptCount: number; turnType?: "single-turn" | "multi-turn" | "simulated" }>>([]);
  const [selectedUserDataset, setSelectedUserDataset] = useState<{ id: string; name: string; path: string; promptCount: number; turnType?: "single-turn" | "multi-turn" | "simulated" } | null>(null);
  const [loadingUserDatasets, setLoadingUserDatasets] = useState(false);
  const [uploadingDataset, setUploadingDataset] = useState(false);
  const [selectedPresetPath, setSelectedPresetPath] = useState<string>("");


  // Scorer / Judge mode state: scorer = custom only, standard = judge only, both = run both
  const [judgeMode, setJudgeMode] = useState<"scorer" | "standard" | "both">("standard");
  const [userScorers, setUserScorers] = useState<DeepEvalScorer[]>([]);
  const [selectedScorer, setSelectedScorer] = useState<DeepEvalScorer | null>(null);
  const [selectedScorerIds, setSelectedScorerIds] = useState<string[]>([]); // Multi-select scorer IDs
  const [loadingScorers, setLoadingScorers] = useState(false);

  // Configured API keys state
  const [configuredApiKeys, setConfiguredApiKeys] = useState<LLMApiKey[]>([]);
  const [loadingApiKeys, setLoadingApiKeys] = useState(true);

  // Saved models from the Models page (database)
  const [savedModels, setSavedModels] = useState<SavedModel[]>([]);
  // Track when user picks "Other (type custom)" in a saved-models dropdown
  const [useCustomModelName, setUseCustomModelName] = useState(false);
  const [useCustomJudgeModelName, setUseCustomJudgeModelName] = useState(false);

  // Model preferences hook for auto-loading saved settings
  const { preferences: savedPreferences, loading: preferencesLoading, savePreferences } = useModelPreferences(projectId, orgId);
  const [preferencesApplied, setPreferencesApplied] = useState(false);

  // Configuration state - taskType initialized from project's useCase prop
  const [config, setConfig] = useState({
    // High-level task type for builtin dataset presets - synced with project use case
    taskType: useCase as "chatbot" | "rag" | "agent",
    // Step 1: Model to be evaluated
    model: {
      name: "",
      accessMethod: "" as ProviderType | "",
      endpointUrl: "",
      apiKey: "",
      modelPath: "",
    },
    // Step 2: Judge LLM
    judgeLlm: {
      provider: "" as ProviderType | "",
      model: "",
      apiKey: "",
      endpointUrl: "",
      temperature: 0.7,
      maxTokens: 2048,
    },
    // Step 3: Dataset
    dataset: {
      useBuiltin: true,
      categories: [] as string[],
      limit: 10,
      benchmark: "",
      // Simulated mode: when true, uses ConversationSimulator to generate turns
      simulatedMode: false,
      // Scenarios for simulated mode (optional - can be loaded from dataset)
      scenarios: [] as Array<{ scenario: string; expected_outcome: string; user_description?: string; max_turns?: number }>,
      // Max turns for simulated conversations
      maxTurns: 6,
    },
    // Step 4: Metrics - Universal core for all, plus use-case specific
    metrics: {
      // Universal Core (always runs for every use case - single-turn)
      answerRelevancy: true,
      correctness: true,
      completeness: true,
      hallucination: true,
      instructionFollowing: true,
      toxicity: true,
      bias: true,
      // RAG-specific (requires retrieval_context)
      contextRelevancy: false,
      contextPrecision: false,
      contextRecall: false,
      faithfulness: false,
      // Agent-specific - Reasoning Layer (requires tools)
      planQuality: false,
      planAdherence: false,
      // Agent-specific - Action Layer (requires tools)
      toolSelection: false,
      toolCorrectness: false,
      argumentCorrectness: false,
      // Agent-specific - Execution (requires tools)
      actionRelevance: false,
      planningQuality: false,
      stepEfficiency: false,
      // Conversational metrics (multi-turn datasets)
      turnRelevancy: true,
      knowledgeRetention: true,
      conversationCoherence: true,
      conversationHelpfulness: true,
      taskCompletion: true,
      conversationSafety: true,
    },
    thresholds: {
      answerRelevancy: 0.5,
      correctness: 0.5,
      completeness: 0.5,
      hallucination: 0.5,
      instructionFollowing: 0.5,
      toxicity: 0.5,
      bias: 0.5,
      contextRelevancy: 0.5,
      contextPrecision: 0.5,
      contextRecall: 0.5,
      faithfulness: 0.5,
      planQuality: 0.5,
      planAdherence: 0.5,
      toolSelection: 0.5,
      toolCorrectness: 0.5,
      argumentCorrectness: 0.5,
      actionRelevance: 0.5,
      planningQuality: 0.5,
      stepEfficiency: 0.5,
      turnRelevancy: 0.5,
      knowledgeRetention: 0.5,
      conversationCoherence: 0.5,
      conversationHelpfulness: 0.5,
      taskCompletion: 0.5,
      conversationSafety: 0.5,
    },
  });

  // Reset warning acknowledgment when model changes
  useEffect(() => {
    setApiKeyWarningAcknowledged(false);
  }, [config.model.name, config.model.accessMethod]);

  // Track if selected dataset is multi-turn
  const isMultiTurnDataset = selectedUserDataset?.turnType === "multi-turn" ||
    (selectedPresetPath && selectedPresetPath.includes("multiturn"));

  // Update metric defaults when task type changes
  useEffect(() => {
    setConfig((prev) => {
      // Universal Core - always runs for every use case (single-turn)
      const universalCore = {
        answerRelevancy: true,
        correctness: true,
        completeness: true,
        hallucination: true,
        instructionFollowing: true,
        toxicity: true,
        bias: true,
      };

      // RAG-specific metrics (disabled by default)
      const ragMetrics = {
        contextRelevancy: false,
        contextPrecision: false,
        contextRecall: false,
        faithfulness: false,
      };

      // Agent-specific metrics (disabled by default)
      // Per DeepEval docs: https://deepeval.com/docs/getting-started-agents
      const agentMetrics = {
        // Reasoning Layer
        planQuality: false,
        planAdherence: false,
        // Action Layer
        toolSelection: false,
        toolCorrectness: false,
        argumentCorrectness: false,
        // Execution Layer
        actionRelevance: false,
        planningQuality: false,
        stepEfficiency: false,
      };

      // Conversational metrics (for multi-turn - enabled by default)
      const conversationalMetrics = {
        turnRelevancy: true,
        knowledgeRetention: true,
        conversationCoherence: true,
        conversationHelpfulness: true,
        taskCompletion: true,
        conversationSafety: true,
      };

      if (prev.taskType === "rag") {
        return {
          ...prev,
          metrics: {
            ...universalCore,
            ...ragMetrics,
            ...agentMetrics,
            ...conversationalMetrics,
            // Enable RAG metrics
            contextRelevancy: true,
            contextPrecision: true,
            contextRecall: true,
            faithfulness: true,
          },
        };
      } else if (prev.taskType === "agent") {
        return {
          ...prev,
          metrics: {
            ...universalCore,
            ...ragMetrics,
            ...agentMetrics,
            ...conversationalMetrics,
            // Enable Agent metrics (comprehensive per DeepEval docs)
            // Reasoning Layer
            planQuality: true,
            planAdherence: true,
            // Action Layer
            toolSelection: true,
            toolCorrectness: true,
            argumentCorrectness: true,
            // Execution Layer
            actionRelevance: true,
            stepEfficiency: true,
            taskCompletion: true,
          },
        };
      } else {
        // chatbot - Universal core only (no extra metrics)
        return {
          ...prev,
          metrics: {
            ...universalCore,
            ...ragMetrics,
            ...agentMetrics,
            ...conversationalMetrics,
          },
        };
      }
    });
  }, [config.taskType]);

  // Sync taskType with useCase prop when modal opens
  useEffect(() => {
    if (isOpen && useCase !== config.taskType) {
      setConfig(prev => ({ ...prev, taskType: useCase }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, useCase]);

  const handleNext = () => {
    setActiveStep((prev) => prev + 1);
  };

  // Load configured API keys and saved models when modal opens
  useEffect(() => {
    if (!isOpen) return;
    (async () => {
      try {
        setLoadingApiKeys(true);
        const [keys, models] = await Promise.all([
          getAllLlmApiKeys(),
          evalModelsService.listModels(orgId || undefined),
        ]);
        setConfiguredApiKeys(keys);
        setSavedModels(models);
      } catch {
        /* ignore */
      } finally {
        setLoadingApiKeys(false);
      }
    })();
  }, [isOpen, orgId]);

  // Apply saved model/judge preferences when they finish loading
  useEffect(() => {
    if (!isOpen || preferencesApplied || preferencesLoading) return;

    if (savedPreferences) {
      console.log("Loading saved model preferences:", savedPreferences);
      // Normalize "custom"/"self-hosted" → "custom_api" so Models-page saves auto-select the merged card
      const am = savedPreferences.model.accessMethod;
      const normalizedAccessMethod = (am === "custom" || am === "self-hosted") ? "custom_api" : am;
      setConfig(prev => ({
        ...prev,
        model: {
          ...prev.model,
          name: savedPreferences.model.name || prev.model.name,
          accessMethod: (normalizedAccessMethod || prev.model.accessMethod) as ProviderType | "",
          endpointUrl: savedPreferences.model.endpointUrl || prev.model.endpointUrl,
        },
        judgeLlm: {
          ...prev.judgeLlm,
          provider: (savedPreferences.judgeLlm.provider || prev.judgeLlm.provider) as ProviderType | "",
          model: savedPreferences.judgeLlm.model || prev.judgeLlm.model,
          endpointUrl: savedPreferences.judgeLlm.endpointUrl || prev.judgeLlm.endpointUrl,
          temperature: savedPreferences.judgeLlm.temperature ?? prev.judgeLlm.temperature,
          maxTokens: savedPreferences.judgeLlm.maxTokens ?? prev.judgeLlm.maxTokens,
        },
      }));
    }
    setPreferencesApplied(true);
  }, [isOpen, preferencesApplied, preferencesLoading, savedPreferences]);

  // Reset preferencesApplied when modal closes so it re-applies on next open
  useEffect(() => {
    if (!isOpen) {
      setPreferencesApplied(false);
    }
  }, [isOpen]);

  // Load user datasets when entering the dataset step
  useEffect(() => {
    if (activeStep !== 1) return;
    // Load user datasets
    (async () => {
      try {
        setLoadingUserDatasets(true);
        const res = await listMyDatasets();
        const datasets = (res.datasets || []).map((d) => ({
          id: String(d.id),
          name: d.name,
          path: d.path,
          promptCount: d.promptCount ?? 0,
          turnType: d.turnType,
        }));
        setUserDatasets(datasets);
      } catch { /* ignore */ }
      finally {
        setLoadingUserDatasets(false);
      }
    })();
  }, [activeStep]);

  // Load user scorers when entering the scorer/judge step
  useEffect(() => {
    if (activeStep !== 2) return;
    (async () => {
      try {
        setLoadingScorers(true);
        const res = await listScorers({ org_id: orgId || undefined });
        const enabledScorers = (res.scorers || []).filter((s) => s.enabled);
        setUserScorers(enabledScorers);
        // If user has scorers, default to scorer mode
        if (enabledScorers.length > 0) {
          setJudgeMode("scorer");
        }
      } catch {
        /* ignore */
      } finally {
        setLoadingScorers(false);
      }
    })();
  }, [activeStep, orgId]);

  // Keep selectedScorer in sync with first selectedScorerId for backward compatibility
  useEffect(() => {
    if (selectedScorerIds.length > 0) {
      const firstScorer = userScorers.find(s => s.id === selectedScorerIds[0]);
      setSelectedScorer(firstScorer || null);
    } else {
      setSelectedScorer(null);
    }
  }, [selectedScorerIds, userScorers]);

  const handleBack = () => {
    setActiveStep((prev) => prev - 1);
  };

  const handleLoadBuiltinDataset = useCallback(async () => {
    try {
      // If we already have a selected preset path, load it; otherwise select first by use case
      if (!selectedPresetPath) {
        const list = await listDatasets();
        const options = list[config.taskType] || [];
        if (options.length > 0) {
          setSelectedPresetPath(options[0].path);
        }
      }
      const pathToLoad = selectedPresetPath;
      if (pathToLoad) {
        const { prompts } = await readDataset(pathToLoad);
        // Apply category filters and limits if provided
        let filtered = prompts as DatasetPrompt[];
        if (config.dataset.categories && config.dataset.categories.length > 0) {
          filtered = filtered.filter((p) => config.dataset.categories.includes(p.category));
        }
        if (config.dataset.limit && config.dataset.limit > 0) {
          filtered = filtered.slice(0, config.dataset.limit);
        }
        setDatasetPrompts(filtered as DatasetPrompt[]);
        setDatasetLoaded(true);
      }
    } catch (err) {
      console.error("Failed to load dataset:", err);
    }
  }, [config.dataset.categories, config.dataset.limit, config.taskType, selectedPresetPath]);

  const handleSubmit = async () => {
    setLoading(true);
    try {
      // Validate dataset has prompts before creating experiment
      if (datasetPrompts.length === 0) {
        setAlert({
          show: true,
          variant: "error",
          title: "No prompts in dataset",
          body: "Cannot run experiment without prompts. Please select a dataset with prompts or upload a valid dataset file.",
        });
        setLoading(false);
        return;
      }

      // Validate model API key availability before creating experiment
      const modelName = config.model.name;
      const modelProvider = config.model.accessMethod;

      // Skip validation if user already acknowledged the warning, or if they provided a key inline
      if (!apiKeyWarningAcknowledged && !config.model.apiKey && modelName && modelProvider !== "ollama" && modelProvider !== "huggingface") {
        try {
          const validation = await validateModel(modelName, modelProvider);
          if (!validation.valid) {
            // Show warning but allow user to proceed by clicking again
            setAlert({
              show: true,
              variant: "warning",
              title: "API key may not be configured",
              body: `${validation.error_message || `The API key for ${validation.provider || modelProvider} may not be configured.`} Click "Run experiment" again to proceed anyway.`,
            });
            setApiKeyWarningAcknowledged(true);
            setLoading(false);
            return;
          }
        } catch (validationError) {
          console.warn("Model validation check failed, proceeding anyway:", validationError);
          // Don't block if validation endpoint fails - let the experiment try to run
        }
      }

      // Auto-save any new API keys entered
      const saveApiKeyPromises: Promise<void>[] = [];

      // Save model provider API key if entered (only for cloud providers with saved model lists)
      if (config.model.apiKey && modelProvider && PROVIDERS[modelProvider] && !hasApiKey(modelProvider)) {
        saveApiKeyPromises.push(
          addLlmApiKey({
            provider: modelProvider as LLMProvider,
            apiKey: config.model.apiKey,
          }).then((newKey) => {
            // Update local state so we know it's configured now
            setConfiguredApiKeys((prev) => [...prev, newKey]);
          }).catch((err) => {
            console.warn("Failed to save model API key:", err);
          })
        );
      }

      // Save judge provider API key if entered
      const judgeProvider = config.judgeLlm.provider;
      if (config.judgeLlm.apiKey && judgeProvider && PROVIDERS[judgeProvider] && !hasApiKey(judgeProvider)) {
        saveApiKeyPromises.push(
          addLlmApiKey({
            provider: judgeProvider as LLMProvider,
            apiKey: config.judgeLlm.apiKey,
          }).then((newKey) => {
            setConfiguredApiKeys((prev) => [...prev, newKey]);
          }).catch((err) => {
            console.warn("Failed to save judge API key:", err);
          })
        );
      }

      // Wait for API keys to be saved (don't block if they fail)
      await Promise.allSettled(saveApiKeyPromises);

      // Prepare experiment configuration
      // Create experiment name with model name + date/time
      const now = new Date();
      const dateStr = now.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      });
      const timeStr = now.toLocaleTimeString("en-US", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: true,
      });
      const dateTimeStr = `${dateStr}, ${timeStr}`;
      const experimentModelName = modelName || "Unknown Model";

      const experimentConfig = {
        project_id: projectId,
        name: `${experimentModelName} - ${dateTimeStr}`,
        description: `Evaluating ${experimentModelName} with ${datasetPrompts.length} prompts`,
        config: {
          project_id: projectId,  // Include in config for runner
          model: {
            name: config.model.name,
            accessMethod: config.model.accessMethod,
            endpointUrl: config.model.endpointUrl,
            apiKey: config.model.apiKey || undefined, // Send actual key to runner, backend won't store it
            modelPath: config.model.modelPath,
          },
          // Include scorer info if using custom scorer mode or both
          ...((judgeMode === "scorer" || judgeMode === "both") ? {
            useCustomScorer: true,
            // NEW: Include selectedScorers array for backend filtering
            ...(selectedScorerIds.length > 0 && {
              selectedScorers: selectedScorerIds,
            }),
            // Keep backward compatibility fields (single scorer)
            ...(selectedScorer ? {
              scorerId: selectedScorer.id,
              scorerName: selectedScorer.name,
              scorerMetricKey: selectedScorer.metricKey,
            } : {}),
            // Tell backend which providers the custom scorers need (for API key injection)
            scorerProviders: (() => {
              const providers: string[] = [];
              // Collect providers from all selected scorers
              const scorersToCheck = selectedScorerIds.length > 0
                ? userScorers.filter(s => selectedScorerIds.includes(s.id))
                : userScorers; // If none selected, include all for API key purposes

              scorersToCheck.forEach(scorer => {
                const judgeModel = scorer.config?.judgeModel;
                if (typeof judgeModel === 'object' && judgeModel?.provider) {
                  const provider = judgeModel.provider.toLowerCase();
                  if (!providers.includes(provider)) {
                    providers.push(provider);
                  }
                } else if (typeof judgeModel === 'string') {
                  // Legacy format - infer provider from model name
                  const modelLower = judgeModel.toLowerCase();
                  if ((modelLower.includes('gpt') || modelLower.includes('o1') || modelLower.includes('o3')) && !providers.includes('openai')) {
                    providers.push('openai');
                  } else if (modelLower.includes('claude') && !providers.includes('anthropic')) {
                    providers.push('anthropic');
                  } else if (modelLower.includes('gemini') && !providers.includes('google')) {
                    providers.push('google');
                  } else if ((modelLower.includes('mistral') || modelLower.includes('magistral')) && !providers.includes('mistral')) {
                    providers.push('mistral');
                  } else if (modelLower.includes('grok') && !providers.includes('xai')) {
                    providers.push('xai');
                  }
                }
              });
              return providers.length > 0 ? providers : ['openai']; // Default to OpenAI
            })(),
            // API key is automatically injected by the backend from organization settings
          } : {}),
          // Include judge LLM config if using standard mode or both
          judgeLlm: (judgeMode === "standard" || judgeMode === "both") ? {
            provider: config.judgeLlm.provider,
            model: config.judgeLlm.model,
            apiKey: config.judgeLlm.apiKey || undefined, // Send actual key to runner, backend won't store it
            endpointUrl: config.judgeLlm.endpointUrl || undefined,
            temperature: config.judgeLlm.temperature,
            maxTokens: config.judgeLlm.maxTokens,
          } : undefined,
          // Include evaluation mode for the runner
          evaluationMode: judgeMode,
          dataset: {
            useBuiltin: config.dataset.useBuiltin,
            // Include dataset name and path for display in experiments table
            name: selectedUserDataset?.name || (selectedPresetPath ? selectedPresetPath.split("/").pop()?.replace(/\.json$/i, "").split("_").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ") : undefined),
            path: selectedUserDataset?.path || selectedPresetPath || undefined,
            datasetId: selectedUserDataset?.id || undefined,
            prompts: datasetPrompts,
            count: datasetPrompts.length,
          },
          metrics: config.metrics,
          thresholds: config.thresholds,
        },
      };

      console.log("Creating experiment:", experimentConfig);

      // Create experiment via API
      const response = await createExperiment(experimentConfig);
      console.log("Experiment created:", response);

      // Optimistically notify parent so the table shows a pending row immediately
      if (onStarted && response?.experiment?.id) {
        onStarted({
          id: response.experiment.id,
          name: experimentConfig.name,
          config: experimentConfig.config,
          status: "running",
          created_at: new Date().toISOString(),
        });
      }

      // Save model and judge preferences for next experiment (fire and forget)
      savePreferences({
        model: {
          name: config.model.name,
          accessMethod: config.model.accessMethod,
          endpointUrl: config.model.endpointUrl,
        },
        judgeLlm: {
          provider: config.judgeLlm.provider,
          model: config.judgeLlm.model,
          endpointUrl: config.judgeLlm.endpointUrl || undefined,
          temperature: config.judgeLlm.temperature,
          maxTokens: config.judgeLlm.maxTokens,
        },
      }).then(success => {
        if (success) {
          console.log("Model preferences saved for next experiment");
        }
      });

      // Show success message
      setAlert({
        show: true,
        variant: "success",
        title: "Experiment Created!",
        body: `Your experiment has been created and is now running. Experiment ID: ${response.experiment?.id || "N/A"}`,
      });

      // Close modal after a short delay to let user see the success message
      setTimeout(() => {
        onSuccess();
        onClose();
        resetForm();
        setAlert(null);
      }, 2000);
    } catch (err) {
      console.error("Failed to create experiment:", err);

      // Extract error message
      let errorMessage = "Failed to create experiment. Please try again.";
      if (err instanceof Error) {
        errorMessage = err.message;
      } else if (typeof err === "object" && err !== null && "response" in err) {
        const axiosError = err as { response?: { data?: { detail?: string } } };
        errorMessage = axiosError.response?.data?.detail || errorMessage;
      }

      setAlert({
        show: true,
        variant: "error",
        title: "Experiment Creation Failed",
        body: errorMessage,
      });
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setActiveStep(0);
    setDatasetPrompts([]);
    setDatasetLoaded(false);
    setSelectedUserDataset(null);
    setSelectedPresetPath("");
    // Reset scorer state
    setJudgeMode("standard");
    setSelectedScorer(null);
    // Reset custom model name toggles
    setUseCustomModelName(false);
    setUseCustomJudgeModelName(false);
    setConfig({
      taskType: useCase,
      model: {
        name: "",
        accessMethod: "",
        endpointUrl: "",
        apiKey: "",
        modelPath: "",
      },
      judgeLlm: {
        provider: "",
        model: "",
        apiKey: "",
        endpointUrl: "",
        temperature: 0.7,
        maxTokens: 2048,
      },
      dataset: {
        useBuiltin: true,
        categories: [],
        limit: 10,
        benchmark: "",
        simulatedMode: false,
        scenarios: [],
        maxTurns: 6,
      },
      metrics: {
        // Universal Core (runs for every use case)
        answerRelevancy: true,
        correctness: true,
        completeness: true,
        hallucination: true,
        instructionFollowing: true,
        toxicity: true,
        bias: true,
        // RAG-specific
        contextRelevancy: false,
        contextPrecision: false,
        contextRecall: false,
        faithfulness: false,
        // Agent-specific - Reasoning Layer
        planQuality: false,
        planAdherence: false,
        // Agent-specific - Action Layer
        toolSelection: false,
        toolCorrectness: false,
        argumentCorrectness: false,
        // Agent-specific - Execution
        actionRelevance: false,
        planningQuality: false,
        stepEfficiency: false,
        // Conversational metrics (multi-turn)
        turnRelevancy: true,
        knowledgeRetention: true,
        conversationCoherence: true,
        conversationHelpfulness: true,
        taskCompletion: true,
        conversationSafety: true,
      },
      thresholds: {
        answerRelevancy: 0.5,
        correctness: 0.5,
        completeness: 0.5,
        hallucination: 0.5,
        instructionFollowing: 0.5,
        toxicity: 0.5,
        bias: 0.5,
        contextRelevancy: 0.5,
        contextPrecision: 0.5,
        contextRecall: 0.5,
        faithfulness: 0.5,
        planQuality: 0.5,
        planAdherence: 0.5,
        toolSelection: 0.5,
        toolCorrectness: 0.5,
        argumentCorrectness: 0.5,
        actionRelevance: 0.5,
        planningQuality: 0.5,
        stepEfficiency: 0.5,
        turnRelevancy: 0.5,
        knowledgeRetention: 0.5,
        conversationCoherence: 0.5,
        conversationHelpfulness: 0.5,
        taskCompletion: 0.5,
        conversationSafety: 0.5,
      },
    });
  };

  type ProviderType = "openai" | "anthropic" | "google" | "xai" | "huggingface" | "mistral" | "ollama" | "local" | "custom_api" | "openrouter";

  // Check if a provider has a configured API key
  const hasApiKey = (providerId: string): boolean => {
    return configuredApiKeys.some((k) => k.provider === providerId);
  };

  // All cloud providers that need API keys (using the saved models)
  const cloudProviders = [
    { id: "openrouter" as ProviderType, name: "OpenRouter", Logo: OpenRouterLogo, needsApiKey: true },
    { id: "openai" as ProviderType, name: "OpenAI", Logo: OpenAILogo, needsApiKey: true },
    { id: "anthropic" as ProviderType, name: "Anthropic", Logo: AnthropicLogo, needsApiKey: true },
    { id: "google" as ProviderType, name: "Gemini", Logo: GeminiLogo, needsApiKey: true },
    { id: "xai" as ProviderType, name: "xAI", Logo: XAILogo, needsApiKey: true },
    { id: "mistral" as ProviderType, name: "Mistral", Logo: MistralLogo, needsApiKey: true },
  ];

  // Local providers that don't need API keys
  const localProviders = [
    { id: "huggingface" as ProviderType, name: "HuggingFace", Logo: HuggingFaceLogo, needsApiKey: false },
    { id: "ollama" as ProviderType, name: "Ollama", Logo: OllamaLogo, needsApiKey: false },
    { id: "custom_api" as ProviderType, name: "Custom / Self-hosted", Logo: BuildIcon, needsApiKey: false },
  ];

  // All available providers for judge selection (all cloud + local)
  const availableJudgeProviders = [...cloudProviders, ...localProviders];

  const selectedProvider = availableJudgeProviders.find(p => p.id === config.judgeLlm.provider);

  // Get saved models that match a given provider ID
  const getSavedModelsForProvider = (providerId: string): SavedModel[] => {
    const pid = providerId.toLowerCase();
    return savedModels.filter((m) => {
      const mp = (m.provider || "").toLowerCase();
      if (pid === "custom_api") return mp === "custom" || mp === "custom_api" || mp === "self-hosted";
      if (pid === "ollama") return mp === "ollama";
      // Cloud providers match their own ID
      return mp === pid;
    });
  };

  // Get models for selected provider (saved models + static provider list)
  const getProviderModels = (providerId: string): ModelInfo[] => {
    // Convert saved models to ModelInfo format
    const saved = getSavedModelsForProvider(providerId).map((m) => ({
      id: m.name,
      name: m.name,
      description: m.endpointUrl ? `Saved · ${m.endpointUrl}` : "Saved model",
    }));

    // For cloud providers, merge saved models with static list (deduplicate by id)
    if (PROVIDERS[providerId]) {
      const staticModels = PROVIDERS[providerId].models;
      const staticIds = new Set(staticModels.map((sm) => sm.id));
      const uniqueSaved = saved.filter((s) => !staticIds.has(s.id));
      return [...uniqueSaved, ...staticModels];
    }

    // For local providers, return only saved models
    return saved;
  };

  // Auto-scroll when provider is selected
  useEffect(() => {
    if (config.judgeLlm.provider && formFieldsRef.current) {
      setTimeout(() => {
        formFieldsRef.current?.scrollIntoView({
          behavior: "smooth",
          block: "nearest",
        });
      }, 100);
    }
  }, [config.judgeLlm.provider]);

  // Auto-load default dataset when reaching step 2 (Dataset)
  useEffect(() => {
    if (activeStep === 1 && config.dataset.useBuiltin && !datasetLoaded) {
      handleLoadBuiltinDataset();
    }
  }, [activeStep, config.dataset.useBuiltin, datasetLoaded, handleLoadBuiltinDataset]);

  // Model providers - show ALL providers (cloud + local)
  const allModelProviders = [
    ...cloudProviders.map(p => ({ ...p, needsUrl: false })),
    ...localProviders.map(p => ({ ...p, needsUrl: false })),
    { id: "local" as ProviderType, name: "Local", Logo: FolderFilledIcon, needsApiKey: false, needsUrl: true },
  ];

  // Show all providers - we'll handle missing API keys with a message
  const availableModelProviders = allModelProviders;

  const selectedModelProvider = availableModelProviders.find(p => p.id === config.model.accessMethod);

  // Helper function to estimate experiment duration based on prompt count
  // Each prompt takes ~20-30 seconds (model call + judge evaluations for each metric)
  const getEstimatedTimeRange = (promptCount: number): string => {
    if (promptCount <= 0) return "";
    if (promptCount <= 3) return "~1-2 minutes";
    if (promptCount <= 5) return "~2-3 minutes";
    if (promptCount <= 10) return "~4-6 minutes";
    if (promptCount <= 20) return "~7-12 minutes";
    if (promptCount <= 30) return "~12-18 minutes";
    if (promptCount <= 50) return "~18-30 minutes";
    return "~30+ minutes";
  };

  const renderStepContent = () => {
    switch (activeStep) {
      case 0:
        // Step 1: Model - Model to be evaluated
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
                <Typography sx={{ mb: 2.5, fontSize: "14px", fontWeight: 500, color: palette.text.secondary }}>
                  Model provider
                </Typography>
                <Grid container spacing={1.5}>
                  {/* Show all providers */}
                  {availableModelProviders.map((provider) => {
                    const { Logo } = provider;
                    const isSelected = config.model.accessMethod === provider.id;

                    return (
                      <Grid size={{ xs: 4, sm: 3 }} key={provider.id}>
                        <Card
                          onClick={() => {
                            setConfig((prev) => ({
                              ...prev,
                              model: {
                                ...prev.model,
                                accessMethod: provider.id as typeof config.model.accessMethod,
                                name: "", // Reset model name when changing provider
                              },
                            }));
                            setUseCustomModelName(false);
                          }}
                          sx={{
                            cursor: "pointer",
                            border: "1px solid",
                            borderColor: isSelected ? palette.brand.primary : palette.border.dark,
                            backgroundColor: palette.background.main,
                            boxShadow: "none",
                            transition: "all 0.2s ease",
                            position: "relative",
                            height: "100%",
                            "&:hover": {
                              borderColor: palette.brand.primary,
                              boxShadow: "0 2px 6px rgba(0,0,0,0.06)",
                            },
                          }}
                        >
                          <CardContent
                            sx={{
                              textAlign: "center",
                              py: 3,
                              px: 2,
                              height: "100%",
                              display: "flex",
                              flexDirection: "column",
                              alignItems: "center",
                              justifyContent: "center",
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

                            {/* Provider Logo */}
                            <Box
                              sx={{
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                width: 40,
                                height: 40,
                                mb: 1.5,
                                "& svg": {
                                  width: 32,
                                  height: 32,
                                },
                              }}
                            >
                              <Logo />
                            </Box>

                            {/* Provider Name */}
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

            {/* Conditional Fields Based on Provider */}
            {config.model.accessMethod && (
              <Box ref={formFieldsRef}>
                <Stack spacing={3}>
                  {/* Model Selection - Dropdown for cloud providers, text input for local/OpenRouter */}
                  {config.model.accessMethod === "openrouter" ? (
                    /* OpenRouter - Custom model input with suggestions */
                    <Box>
                      <Typography sx={{ fontSize: "13px", fontWeight: 500, color: palette.text.secondary, mb: 1 }}>
                        Model
                      </Typography>
                      <Typography sx={{ fontSize: "11px", color: palette.text.tertiary, mb: 1.5 }}>
                        OpenRouter supports any model. Enter the model ID or select from popular options.
                      </Typography>
                      <Field
                        label=""
                        value={config.model.name}
                        onChange={(e) =>
                          setConfig((prev) => ({
                            ...prev,
                            model: { ...prev.model, name: e.target.value },
                          }))
                        }
                        placeholder="e.g., openai/gpt-4o, anthropic/claude-3-opus"
                      />
                      <Typography sx={{ fontSize: "11px", fontWeight: 600, color: palette.text.disabled, mt: 2, mb: 1, textTransform: "uppercase" }}>
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
                            variant={config.model.name === m.id ? "filled" : "outlined"}
                            onClick={() =>
                              setConfig((prev) => ({
                                ...prev,
                                model: { ...prev.model, name: m.id },
                              }))
                            }
                            sx={{
                              cursor: "pointer",
                              backgroundColor: config.model.name === m.id ? palette.brand.primaryLight : "transparent",
                              borderColor: config.model.name === m.id ? palette.brand.primary : palette.border.dark,
                              color: config.model.name === m.id ? palette.brand.primary : palette.text.secondary,
                              "&:hover": {
                                backgroundColor: config.model.name === m.id ? palette.brand.primaryLight : palette.background.accent,
                                borderColor: palette.brand.primary,
                              },
                            }}
                          />
                        ))}
                      </Stack>
                    </Box>
                  ) : PROVIDERS[config.model.accessMethod] ? (
                    <Box>
                      <Typography sx={{ fontSize: "13px", fontWeight: 500, color: palette.text.secondary, mb: 1 }}>
                        Model
                      </Typography>
                      <FormControl fullWidth size="small">
                        <Select
                          value={config.model.name}
                          onChange={(e) =>
                            setConfig((prev) => ({
                              ...prev,
                              model: { ...prev.model, name: e.target.value as string },
                            }))
                          }
                          displayEmpty
                          sx={{
                            fontSize: "13px",
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
                          {getProviderModels(config.model.accessMethod).map((model) => (
                            <MenuItem key={model.id} value={model.id}>
                              <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ width: "100%" }}>
                                <Typography sx={{ fontSize: "13px" }}>{model.name}</Typography>
                                {model.inputCost !== undefined && (
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
                  ) : (
                    /* Local/self-hosted/custom providers: show dropdown if saved models exist, else text input */
                    (() => {
                      const providerSavedModels = getProviderModels(config.model.accessMethod);
                      const showDropdown = providerSavedModels.length > 0 && !useCustomModelName;
                      const placeholder = config.model.accessMethod === "ollama"
                        ? "e.g., llama2, mistral, codellama"
                        : config.model.accessMethod === "huggingface"
                          ? "e.g., TinyLlama/TinyLlama-1.1B-Chat-v1.0"
                          : "e.g., gpt-4, claude-3-opus";

                      if (showDropdown) {
                        return (
                          <Box>
                            <Typography sx={{ fontSize: "13px", fontWeight: 500, color: palette.text.secondary, mb: 1 }}>
                              Model
                            </Typography>
                            <FormControl fullWidth size="small">
                              <Select
                                value={config.model.name}
                                onChange={(e) => {
                                  const val = e.target.value as string;
                                  if (val === "__other__") {
                                    setUseCustomModelName(true);
                                    setConfig((prev) => ({ ...prev, model: { ...prev.model, name: "" } }));
                                  } else {
                                    setConfig((prev) => ({ ...prev, model: { ...prev.model, name: val } }));
                                  }
                                }}
                                displayEmpty
                                sx={{
                                  fontSize: "13px",
                                  "& .MuiOutlinedInput-notchedOutline": { borderColor: palette.border.dark },
                                  "&:hover .MuiOutlinedInput-notchedOutline": { borderColor: palette.border.dark },
                                  "&.Mui-focused .MuiOutlinedInput-notchedOutline": { borderColor: palette.brand.primary },
                                }}
                              >
                                <MenuItem value="" disabled>
                                  <Typography sx={{ color: palette.text.disabled, fontSize: "13px" }}>Select a model</Typography>
                                </MenuItem>
                                {providerSavedModels.map((model) => (
                                  <MenuItem key={model.id} value={model.id}>
                                    <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ width: "100%" }}>
                                      <Typography sx={{ fontSize: "13px" }}>{model.name}</Typography>
                                      {model.description && (
                                        <Typography sx={{ fontSize: "11px", color: palette.text.disabled }}>{model.description}</Typography>
                                      )}
                                    </Stack>
                                  </MenuItem>
                                ))}
                                <Divider />
                                <MenuItem value="__other__">
                                  <Typography sx={{ fontSize: "13px", color: palette.text.tertiary, fontStyle: "italic" }}>Other (type custom)</Typography>
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
                                setUseCustomModelName(false);
                                setConfig((prev) => ({ ...prev, model: { ...prev.model, name: "" } }));
                              }}
                              sx={{ textTransform: "none", fontSize: "11px", color: palette.text.tertiary, p: 0, mb: 0.5, minWidth: "auto", "&:hover": { color: palette.brand.primary } }}
                            >
                              &larr; Back to saved models
                            </Button>
                          )}
                          <Field
                            label="Model name"
                            value={config.model.name}
                            onChange={(e) =>
                              setConfig((prev) => ({ ...prev, model: { ...prev.model, name: e.target.value } }))
                            }
                            placeholder={placeholder}
                          />
                        </Box>
                      );
                    })()
                  )}

                  {/* URL field for Local, Custom / Self-hosted */}
                  {(selectedModelProvider && (
                    ('needsUrl' in selectedModelProvider && selectedModelProvider.needsUrl) ||
                    config.model.accessMethod === "custom_api"
                  )) && (
                    <Field
                      label="Endpoint URL"
                      value={config.model.endpointUrl}
                      onChange={(e) =>
                        setConfig((prev) => ({
                          ...prev,
                          model: { ...prev.model, endpointUrl: e.target.value },
                        }))
                      }
                      placeholder={config.model.accessMethod === "local"
                        ? "http://localhost:11434/api/generate"
                        : "https://api.example.com/v1/chat/completions"
                      }
                    />
                  )}

                  {/* API Key - show configured status OR input field */}
                  {/* Cloud providers: required. Custom / Self-hosted: optional */}
                  {(selectedModelProvider?.needsApiKey || config.model.accessMethod === "custom_api") && (
                    hasApiKey(config.model.accessMethod) ? (
                      <Box sx={{ p: 1.5, backgroundColor: palette.status.success.bg, borderRadius: "8px", border: `1px solid ${palette.status.success.border}` }}>
                        <Stack direction="row" alignItems="center" spacing={1}>
                          <Check size={16} color={palette.status.success.text} />
                          <Typography sx={{ fontSize: "12px", color: palette.status.success.text }}>
                            API key configured — will be saved for future experiments
                          </Typography>
                        </Stack>
                      </Box>
                    ) : (
                      <Field
                        label={config.model.accessMethod === "custom_api" ? "API key (optional)" : "API key"}
                        type="password"
                        value={config.model.apiKey}
                        onChange={(e) =>
                          setConfig((prev) => ({
                            ...prev,
                            model: { ...prev.model, apiKey: e.target.value },
                          }))
                        }
                        placeholder={config.model.accessMethod === "custom_api"
                          ? "Leave blank if not required"
                          : `Enter your ${selectedModelProvider?.name || ""} API key`
                        }
                        autoComplete="off"
                        helperText={config.model.accessMethod === "custom_api"
                          ? undefined
                          : "Your key will be saved securely for future experiments"
                        }
                      />
                    )
                  )}
                </Stack>
              </Box>
            )}
          </Stack>
        );

      case 1:
        // Step 2: Dataset
        return (
          <Stack spacing="16px">
            {/* Description */}
            <Typography sx={{ fontSize: "13px", color: palette.text.tertiary, lineHeight: 1.5 }}>
              Choose a dataset containing prompts and expected outputs. Upload your own JSON file, select from saved datasets, or use a template.
            </Typography>

            {/* Option 1: Custom dataset */}
            <Box>
              <Typography sx={{ fontSize: "12px", fontWeight: 600, color: palette.text.disabled, textTransform: "uppercase", letterSpacing: "0.5px", mb: "8px" }}>
                Option 1: Use custom dataset
              </Typography>
              {/* Upload Section - Compact drop zone */}
              <Box
                component="label"
                sx={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  p: "8px",
                  border: "1px dashed",
                  borderColor: uploadingDataset ? palette.brand.primary : palette.border.dark,
                  borderRadius: "4px",
                  backgroundColor: palette.background.accent,
                  cursor: uploadingDataset ? "wait" : "pointer",
                  transition: "all 0.15s ease",
                  "&:hover": { borderColor: palette.brand.primary, backgroundColor: palette.status.success.bg },
                }}
              >
                <Box
                  sx={{
                    width: 32,
                    height: 32,
                    borderRadius: "6px",
                    backgroundColor: palette.brand.primary,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                  }}
                >
                  <Upload size={16} color={palette.background.main} />
                </Box>
                <Box sx={{ flex: 1 }}>
                  <Typography sx={{ fontSize: "13px", fontWeight: 500, color: palette.text.secondary }}>
                    {uploadingDataset ? "Uploading..." : "Upload dataset"}
                  </Typography>
                  <Typography sx={{ fontSize: "11px", color: palette.text.disabled }}>
                    JSON file with prompts and expected outputs
                  </Typography>
                </Box>
                <input
                  type="file"
                  accept="application/json"
                  hidden
                  disabled={uploadingDataset}
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    try {
                      setUploadingDataset(true);
                      // Validate file content before uploading
                      const fileContent = await file.text();
                      let parsedData: unknown[];
                      try {
                        parsedData = JSON.parse(fileContent);
                      } catch {
                        setAlert({ show: true, variant: "error", title: "Invalid JSON", body: "The file does not contain valid JSON" });
                        setTimeout(() => setAlert(null), 15000);
                        return;
                      }
                      if (!Array.isArray(parsedData) || parsedData.length === 0) {
                        setAlert({ show: true, variant: "error", title: "Empty dataset", body: "Cannot use an empty dataset. Please upload a file with at least one prompt." });
                        setTimeout(() => setAlert(null), 15000);
                        return;
                      }
                      // Count only prompts with actual content
                      const validPromptCount = parsedData.filter((item) => {
                        if (typeof item !== "object" || item === null) return false;
                        const obj = item as Record<string, unknown>;
                        // Single-turn: check if prompt field has content
                        if (obj.prompt && typeof obj.prompt === "string" && obj.prompt.trim()) return true;
                        // Multi-turn: check if turns array has at least one turn with content
                        if (Array.isArray(obj.turns) && obj.turns.length > 0) {
                          return obj.turns.some((turn) => {
                            if (typeof turn !== "object" || turn === null) return false;
                            const t = turn as Record<string, unknown>;
                            return t.content && typeof t.content === "string" && t.content.trim();
                          });
                        }
                        return false;
                      }).length;
                      if (validPromptCount === 0) {
                        setAlert({ show: true, variant: "error", title: "Empty dataset", body: "Cannot use an empty dataset. Please upload a file with prompts that have actual content." });
                        setTimeout(() => setAlert(null), 15000);
                        return;
                      }
                      const resp = await uploadDataset(file, "chatbot", "single-turn", orgId || undefined);
                      const newDataset = { id: resp.path, name: file.name.replace(/\.json$/i, ""), path: resp.path, promptCount: validPromptCount };
                      setUserDatasets((prev) => [newDataset, ...prev]);
                      setSelectedUserDataset(newDataset);
                      setConfig((prev) => ({ ...prev, dataset: { ...prev.dataset, useBuiltin: false } }));
                      try {
                        const { prompts } = await readDataset(resp.path);
                        setDatasetPrompts((prompts || []) as DatasetPrompt[]);
                        setDatasetLoaded(true);
                      } catch {
                        setDatasetPrompts([]);
                      }
                      setAlert({ show: true, variant: "success", title: "Uploaded!", body: `${file.name} is ready to use` });
                      setTimeout(() => setAlert(null), 5000);
                    } catch (err) {
                      setAlert({ show: true, variant: "error", title: "Upload failed", body: err instanceof Error ? err.message : "Failed to upload" });
                      setTimeout(() => setAlert(null), 15000);
                    } finally {
                      setUploadingDataset(false);
                      e.target.value = "";
                    }
                  }}
                />
              </Box>
            </Box>

            {/* My Datasets Section */}
            {loadingUserDatasets ? (
              <Box sx={{ py: 2, textAlign: "center" }}>
                <Typography sx={{ fontSize: "13px", color: palette.text.tertiary }}>Loading your datasets...</Typography>
              </Box>
            ) : userDatasets.length > 0 ? (
              <Box>
                <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1 }}>
                  <Typography sx={{ fontSize: "12px", fontWeight: 600, color: palette.text.disabled, textTransform: "uppercase", letterSpacing: "0.5px" }}>
                    Option 2: Your datasets
                  </Typography>
                  <Button
                    size="small"
                    variant="text"
                    startIcon={<ExternalLink size={12} />}
                    onClick={() => window.open(`/evals/${projectId}#datasets`, "_blank")}
                    sx={{ textTransform: "none", fontSize: "11px", color: palette.text.tertiary, p: 0.5, minWidth: "auto", "&:hover": { color: palette.brand.primary } }}
                  >
                    Manage
                  </Button>
                </Stack>
                <Stack spacing="8px">
                  {userDatasets.slice(0, 4).map((dataset) => {
                    const isSelected = selectedUserDataset?.id === dataset.id && !config.dataset.useBuiltin;
                    const isMultiTurn = dataset.turnType === "multi-turn";
                    const isSimulated = dataset.turnType === "simulated";
                    const isEmpty = dataset.promptCount === 0;
                    const typeChip = isEmpty ? (
                      <Chip label="Empty" backgroundColor={palette.status.error.bg} textColor={palette.status.error.text} uppercase={false} />
                    ) : isMultiTurn ? (
                      <Chip label={isSelected && datasetPrompts.length > 0 ? `${datasetPrompts.length} prompts` : "Multi-Turn"} backgroundColor={palette.accent.blue.bg} textColor={palette.accent.blue.text} uppercase={false} />
                    ) : isSimulated ? (
                      <Chip label={isSelected && datasetPrompts.length > 0 ? `${datasetPrompts.length} prompts` : "Simulated"} backgroundColor={palette.accent.purple.bg} textColor={palette.accent.purple.text} uppercase={false} />
                    ) : (
                      <Chip label={isSelected && datasetPrompts.length > 0 ? `${datasetPrompts.length} prompts` : "Single-Turn"} backgroundColor={palette.status.warning.bg} textColor={palette.status.warning.text} uppercase={false} />
                    );
                    return (
                      <SelectableCard
                        key={dataset.id}
                        isSelected={isSelected}
                        disabled={isEmpty}
                        onClick={async () => {
                          if (isEmpty) return;
                          setConfig((prev) => ({ ...prev, dataset: { ...prev.dataset, useBuiltin: false } }));
                          setSelectedUserDataset(dataset);
                          setSelectedPresetPath("");
                          try {
                            const { prompts } = await readDataset(dataset.path);
                            setDatasetPrompts((prompts || []) as DatasetPrompt[]);
                            setDatasetLoaded(true);
                          } catch {
                            setDatasetPrompts([]);
                          }
                        }}
                        icon={<Database size={14} color={isEmpty ? palette.status.error.text : isSelected ? palette.brand.primary : palette.text.disabled} />}
                        title={dataset.name}
                        description={isEmpty ? "Cannot use empty dataset" : "Custom uploaded dataset"}
                        chip={typeChip}
                      />
                    );
                  })}
                </Stack>
              </Box>
            ) : null}

            {/* Template Datasets Section */}
            <Box>
              <Typography sx={{ fontSize: "12px", fontWeight: 600, color: palette.text.disabled, textTransform: "uppercase", letterSpacing: "0.5px", mb: 1 }}>
                Option 3: {config.taskType === "chatbot" ? "Chatbot" : config.taskType === "rag" ? "RAG" : "Agent"} templates
              </Typography>
              <Stack spacing="8px">
                {[
                  ...(config.taskType === "chatbot" ? [
                    // Single-turn chatbot templates
                    { name: "Basic Chatbot", path: "chatbot/chatbot_basic.json", desc: "Standard question-answer pairs", type: "single-turn" as const },
                    { name: "Coding Helper", path: "chatbot/chatbot_coding_helper.json", desc: "Code assistance scenarios", type: "single-turn" as const },
                    { name: "Customer Support (Single-Turn)", path: "chatbot/chatbot_customer_support.json", desc: "Support Q&A pairs", type: "single-turn" as const },
                    // Multi-turn chatbot templates
                    { name: "General Assistant Multi-Turn", path: "chatbot/chatbot_general_assistant_multiturn.json", desc: "Multi-turn conversations", type: "multi-turn" as const },
                    { name: "Customer Support Multi-Turn", path: "chatbot/chatbot_customer_support_multiturn.json", desc: "Support conversations", type: "multi-turn" as const },
                    { name: "Tech Support Multi-Turn", path: "chatbot/chatbot_tech_support_multiturn.json", desc: "Technical help conversations", type: "multi-turn" as const },
                  ] : []),
                  ...(config.taskType === "rag" ? [
                    { name: "Product Docs", path: "rag/rag_product_docs.json", desc: "Product documentation queries", type: "single-turn" as const },
                    { name: "Wikipedia QA", path: "rag/rag_wikipedia_small.json", desc: "Wikipedia-based questions", type: "single-turn" as const },
                    { name: "Research Papers", path: "rag/rag_research_papers.json", desc: "Academic content retrieval", type: "single-turn" as const },
                    { name: "Document Q&A Multi-Turn", path: "rag/rag_document_qa_multiturn.json", desc: "Multi-turn document conversations", type: "multi-turn" as const },
                  ] : []),
                  ...(config.taskType === "agent" ? [
                    { name: "Agent Planning", path: "agent/agent_planning_multiturn.json", desc: "Multi-step planning scenarios", type: "multi-turn" as const },
                    { name: "Agent Task Execution", path: "agent/agent_task_execution_multiturn.json", desc: "Tool usage and task completion", type: "multi-turn" as const },
                    { name: "Agent Workflow Automation", path: "agent/agent_workflow_automation_multiturn.json", desc: "Automated workflow tasks", type: "multi-turn" as const },
                  ] : []),
                ].map((template) => {
                  const isSelected = selectedPresetPath === template.path && config.dataset.useBuiltin;
                  const chipLabel = isSelected && datasetPrompts.length > 0 ? `${datasetPrompts.length} prompts` : (template.type === "multi-turn" ? "Multi-Turn" : "Single-Turn");
                  const typeChip = template.type === "multi-turn" ? (
                    <Chip label={chipLabel} backgroundColor={palette.accent.blue.bg} textColor={palette.accent.blue.text} uppercase={false} />
                  ) : (
                    <Chip label={chipLabel} backgroundColor={palette.status.warning.bg} textColor={palette.status.warning.text} uppercase={false} />
                  );
                  return (
                    <SelectableCard
                      key={template.path}
                      isSelected={isSelected}
                      onClick={async () => {
                        setConfig((prev) => ({ ...prev, dataset: { ...prev.dataset, useBuiltin: true } }));
                        setSelectedUserDataset(null);
                        setSelectedPresetPath(template.path);
                        try {
                          const { prompts } = await readDataset(template.path);
                          setDatasetPrompts((prompts || []) as DatasetPrompt[]);
                          setDatasetLoaded(true);
                        } catch {
                          setDatasetPrompts([]);
                        }
                      }}
                      icon={<Database size={14} color={isSelected ? palette.accent.indigo.text : palette.text.disabled} />}
                      title={template.name}
                      description={template.desc}
                      accentColor={palette.accent.indigo.text}
                      chip={typeChip}
                    />
                  );
                })}
              </Stack>
            </Box>
          </Stack>
        );

      case 2:
        // Step 3: Scorer / Judge - Choose evaluation method
        return (
          <Stack spacing="16px">
            {/* Mode Toggle - 3 Options */}
            <Stack spacing="8px">
              <SelectableCard
                isSelected={judgeMode === "scorer"}
                onClick={() => {
                  setJudgeMode("scorer");
                  setConfig((prev) => ({ ...prev, judgeLlm: { ...prev.judgeLlm, provider: "" } }));
                }}
                icon={<Sparkles size={14} color={judgeMode === "scorer" ? palette.brand.primary : palette.text.disabled} />}
                title="Custom scorer only"
                description="Use your own prompts for domain-specific evaluation"
              />
              <SelectableCard
                isSelected={judgeMode === "standard"}
                onClick={() => {
                  setJudgeMode("standard");
                  setSelectedScorer(null);
                }}
                icon={<Settings size={14} color={judgeMode === "standard" ? palette.brand.primary : palette.text.disabled} />}
                title="Standard judge only"
                description="Use built-in metrics with fixed evaluation criteria"
              />
              <SelectableCard
                isSelected={judgeMode === "both"}
                onClick={() => setJudgeMode("both")}
                icon={<Layers size={14} color={judgeMode === "both" ? palette.brand.primary : palette.text.disabled} />}
                title="Judge + scorer"
                description="Use both built-in metrics and your custom scorers"
              />
            </Stack>

            {/* Custom Scorers Section - shown for "scorer" and "both" modes */}
            {(judgeMode === "scorer" || judgeMode === "both") && (
              <Box>
                {loadingScorers ? (
                  <Box sx={{ py: 3, textAlign: "center" }}>
                    <Typography sx={{ fontSize: "13px", color: palette.text.tertiary }}>Loading your scorers...</Typography>
                  </Box>
                ) : userScorers.length > 0 ? (
                  <Box>
                    <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1.5 }}>
                      <Typography sx={{ fontSize: "12px", fontWeight: 600, color: palette.text.disabled, textTransform: "uppercase", letterSpacing: "0.5px" }}>
                        Your Scorers
                      </Typography>
                      <Stack direction="row" spacing={1}>
                        <Button
                          size="small"
                          variant="text"
                          onClick={() => {
                            if (selectedScorerIds.length === userScorers.length) {
                              setSelectedScorerIds([]);
                            } else {
                              setSelectedScorerIds(userScorers.map(s => s.id));
                            }
                          }}
                          sx={{ textTransform: "none", fontSize: "11px", color: palette.text.tertiary, p: 0.5, minWidth: "auto", "&:hover": { color: palette.brand.primary } }}
                        >
                          {selectedScorerIds.length === userScorers.length ? "Clear All" : "Select All"}
                        </Button>
                        <Button
                          size="small"
                          variant="text"
                          startIcon={<ExternalLink size={12} />}
                          onClick={() => window.open(`/evals/${projectId}#scorers`, "_blank")}
                          sx={{ textTransform: "none", fontSize: "11px", color: palette.text.tertiary, p: 0.5, minWidth: "auto", "&:hover": { color: palette.brand.primary } }}
                        >
                          Manage
                        </Button>
                      </Stack>
                    </Stack>
                    <Stack spacing="8px">
                      {userScorers.map((scorer) => {
                        const isSelected = selectedScorerIds.includes(scorer.id);
                        const modelName = typeof scorer.config?.judgeModel === 'string'
                          ? scorer.config.judgeModel
                          : scorer.config?.judgeModel?.name || scorer.config?.model || "LLM Judge";
                        return (
                          <SelectableCard
                            key={scorer.id}
                            isSelected={isSelected}
                            onClick={() => {
                              setSelectedScorerIds(prev =>
                                prev.includes(scorer.id)
                                  ? prev.filter(id => id !== scorer.id)
                                  : [...prev, scorer.id]
                              );
                            }}
                            icon={<Sparkles size={14} color={isSelected ? palette.brand.primary : palette.text.disabled} />}
                            title={scorer.name}
                            description={`${modelName} • ${scorer.metricKey}`}
                          />
                        );
                      })}
                    </Stack>
                    <FormHelperText sx={{ mt: 1, fontSize: "11px", color: palette.text.tertiary }}>
                      {selectedScorerIds.length > 0
                        ? `${selectedScorerIds.length} scorer${selectedScorerIds.length > 1 ? 's' : ''} selected. Only these will run during evaluation.`
                        : "No scorers selected. All enabled scorers will run if none are selected."}
                    </FormHelperText>
                    {missingKeyProviders.length > 0 && (
                      <Box
                        sx={{
                          mt: 1.5,
                          p: 1.5,
                          borderRadius: "8px",
                          backgroundColor: palette.status.warning.bg,
                          border: `1px solid ${palette.status.warning.text}`,
                        }}
                      >
                        <Typography sx={{ fontSize: "12px", color: palette.status.warning.text }}>
                          Missing API {missingKeyProviders.length > 1 ? "keys" : "key"} for{" "}
                          <strong>
                            {missingKeyProviders
                              .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
                              .join(", ")}
                          </strong>
                          . Save the {missingKeyProviders.length > 1 ? "keys" : "key"} in{" "}
                          <span
                            onClick={() => window.open(`/evals/${projectId}#settings`, "_blank")}
                            style={{
                              textDecoration: "underline",
                              cursor: "pointer",
                              fontWeight: 600,
                            }}
                          >
                            LLM Evals Settings
                          </span>{" "}
                          before running the experiment.
                        </Typography>
                      </Box>
                    )}
                  </Box>
                ) : (
                  <Box sx={{ py: 4, textAlign: "center", border: `1px dashed ${palette.border.dark}`, borderRadius: "8px" }}>
                    <Sparkles size={32} color={palette.border.dark} style={{ marginBottom: 8 }} />
                    <Typography sx={{ fontSize: "14px", color: palette.text.tertiary, mb: 1 }}>
                      No custom scorers yet
                    </Typography>
                    <Typography sx={{ fontSize: "12px", color: palette.text.disabled, mb: 2 }}>
                      Create a scorer to use custom evaluation criteria
                    </Typography>
                    <Button
                      size="small"
                      variant="outlined"
                      startIcon={<Plus size={14} />}
                      onClick={() => window.open(`/evals/${projectId}#scorers`, "_blank")}
                      sx={{
                        textTransform: "none",
                        fontSize: "12px",
                        color: palette.brand.primary,
                        borderColor: palette.brand.primary,
                        "&:hover": { borderColor: palette.brand.primaryHover, backgroundColor: palette.status.success.bg },
                      }}
                    >
                      Create Scorer
                    </Button>
                  </Box>
                )}
              </Box>
            )}

            {/* Divider between sections when in "both" mode */}
            {judgeMode === "both" && (
              <Box sx={{ pt: 2 }}>
                <Divider sx={{ mb: 2 }} />
                <Typography sx={{ fontSize: "12px", fontWeight: 600, color: palette.text.disabled, textTransform: "uppercase", letterSpacing: "0.5px", mb: 1 }}>
                  Standard Judge Configuration
                </Typography>
              </Box>
            )}

            {/* Standard Judge Section - shown for "standard" and "both" modes */}
            {(judgeMode === "standard" || judgeMode === "both") && (
              <>
                {judgeMode === "standard" && (
                  <Typography sx={{ fontSize: "12px", fontWeight: 600, color: palette.text.disabled, textTransform: "uppercase", letterSpacing: "0.5px", mb: 1 }}>
                    Select a Provider
                  </Typography>
                )}
                <Box>
                  <Grid container spacing="8px">
                    {availableJudgeProviders.map((provider) => {
                      const { Logo } = provider;
                      const isSelected = config.judgeLlm.provider === provider.id;

                      return (
                        <Grid size={{ xs: 4, sm: 3 }} key={provider.id}>
                          <Card
                            onClick={() => {
                              setConfig((prev) => ({
                                ...prev,
                                judgeLlm: {
                                  ...prev.judgeLlm,
                                  provider: provider.id,
                                  model: "", // Reset model when changing provider
                                },
                              }));
                              setUseCustomJudgeModelName(false);
                            }}
                            sx={{
                              cursor: "pointer",
                              border: "1px solid",
                              borderColor: isSelected ? palette.brand.primary : palette.border.dark,
                              backgroundColor: palette.background.main,
                              boxShadow: "none",
                              transition: "all 0.2s ease",
                              position: "relative",
                              height: "100%",
                              "&:hover": {
                                borderColor: palette.brand.primary,
                                boxShadow: "0 2px 6px rgba(0,0,0,0.06)",
                              },
                            }}
                          >
                            <CardContent
                              sx={{
                                textAlign: "center",
                                py: 3,
                                px: 2,
                                height: "100%",
                                display: "flex",
                                flexDirection: "column",
                                alignItems: "center",
                                justifyContent: "center",
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

                              {/* Provider Logo */}
                              <Box
                                sx={{
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                  width: 40,
                                  height: 40,
                                  mb: 1.5,
                                  "& svg": {
                                    width: 32,
                                    height: 32,
                                  },
                                }}
                              >
                                <Logo />
                              </Box>

                              {/* Provider Name */}
                              <Typography
                                sx={{
                                  fontSize: "12px",
                                  fontWeight: 500,
                                  color: palette.text.secondary,
                                  lineHeight: 1.3,
                                  mt: "auto",
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

                {config.judgeLlm.provider && (
                  <Box ref={formFieldsRef}>
                    <Stack spacing={3}>
                      {/* Model Selection - Dropdown for cloud providers, text input for local/OpenRouter */}
                      {config.judgeLlm.provider === "openrouter" ? (
                        /* OpenRouter - Custom model input with suggestions */
                        <Box>
                          <Typography sx={{ fontSize: "13px", fontWeight: 500, color: palette.text.secondary, mb: 1 }}>
                            Model
                          </Typography>
                          <Typography sx={{ fontSize: "11px", color: palette.text.tertiary, mb: 1.5 }}>
                            OpenRouter supports any model. Enter the model ID or select from popular options.
                          </Typography>
                          <Field
                            label=""
                            value={config.judgeLlm.model}
                            onChange={(e) =>
                              setConfig((prev) => ({
                                ...prev,
                                judgeLlm: { ...prev.judgeLlm, model: e.target.value },
                              }))
                            }
                            placeholder="e.g., openai/gpt-4o, anthropic/claude-3-opus"
                          />
                          <Typography sx={{ fontSize: "11px", fontWeight: 600, color: palette.text.disabled, mt: 2, mb: 1, textTransform: "uppercase" }}>
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
                                variant={config.judgeLlm.model === m.id ? "filled" : "outlined"}
                                onClick={() =>
                                  setConfig((prev) => ({
                                    ...prev,
                                    judgeLlm: { ...prev.judgeLlm, model: m.id },
                                  }))
                                }
                                sx={{
                                  cursor: "pointer",
                                  backgroundColor: config.judgeLlm.model === m.id ? palette.brand.primaryLight : "transparent",
                                  borderColor: config.judgeLlm.model === m.id ? palette.brand.primary : palette.border.dark,
                                  color: config.judgeLlm.model === m.id ? palette.brand.primary : palette.text.secondary,
                                  "&:hover": {
                                    backgroundColor: config.judgeLlm.model === m.id ? palette.brand.primaryLight : palette.background.accent,
                                    borderColor: palette.brand.primary,
                                  },
                                }}
                              />
                            ))}
                          </Stack>
                        </Box>
                      ) : PROVIDERS[config.judgeLlm.provider] ? (
                        <Box>
                          <Typography sx={{ fontSize: "13px", fontWeight: 500, color: palette.text.secondary, mb: 1 }}>
                            Model
                          </Typography>
                          <FormControl fullWidth size="small">
                            <Select
                              value={config.judgeLlm.model}
                              onChange={(e) =>
                                setConfig((prev) => ({
                                  ...prev,
                                  judgeLlm: { ...prev.judgeLlm, model: e.target.value as string },
                                }))
                              }
                              displayEmpty
                              sx={{
                                fontSize: "13px",
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
                              {getProviderModels(config.judgeLlm.provider).map((model) => (
                                <MenuItem key={model.id} value={model.id}>
                                  <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ width: "100%" }}>
                                    <Typography sx={{ fontSize: "13px" }}>{model.name}</Typography>
                                    {model.inputCost !== undefined && (
                                      <Typography sx={{ fontSize: "11px", color: palette.text.disabled }}>
                                        ${model.inputCost}/1M in
                                      </Typography>
                                    )}
                                  </Stack>
                                </MenuItem>
                              ))}
                            </Select>
                          </FormControl>
                        </Box>
                      ) : (
                        /* Local judge providers (Ollama, HuggingFace, Custom / Self-hosted) */
                        (() => {
                          const isCustom = config.judgeLlm.provider === "custom_api";
                          const judgeSaved = getProviderModels(config.judgeLlm.provider);
                          const showJudgeDropdown = judgeSaved.length > 0 && !useCustomJudgeModelName;
                          const placeholder = config.judgeLlm.provider === "ollama"
                            ? "e.g., llama2, mistral, codellama"
                            : isCustom
                              ? "e.g., llama3.2, mistral, gpt-4"
                              : "e.g., gpt-4, claude-3-opus";

                          return (
                            <Stack spacing={2}>
                              {/* Endpoint URL for Custom / Self-hosted judge */}
                              {isCustom && (
                                <Field
                                  label="Endpoint URL"
                                  value={config.judgeLlm.endpointUrl}
                                  onChange={(e) =>
                                    setConfig((prev) => ({
                                      ...prev,
                                      judgeLlm: { ...prev.judgeLlm, endpointUrl: e.target.value },
                                    }))
                                  }
                                  placeholder="https://api.example.com/v1/chat/completions"
                                />
                              )}

                              {/* Model: dropdown when saved models exist, else text input */}
                              {showJudgeDropdown ? (
                                <Box>
                                  <Typography sx={{ fontSize: "13px", fontWeight: 500, color: palette.text.secondary, mb: 1 }}>
                                    Model
                                  </Typography>
                                  <FormControl fullWidth size="small">
                                    <Select
                                      value={config.judgeLlm.model}
                                      onChange={(e) => {
                                        const val = e.target.value as string;
                                        if (val === "__other__") {
                                          setUseCustomJudgeModelName(true);
                                          setConfig((prev) => ({ ...prev, judgeLlm: { ...prev.judgeLlm, model: "" } }));
                                        } else {
                                          setConfig((prev) => ({ ...prev, judgeLlm: { ...prev.judgeLlm, model: val } }));
                                        }
                                      }}
                                      displayEmpty
                                      sx={{
                                        fontSize: "13px",
                                        "& .MuiOutlinedInput-notchedOutline": { borderColor: palette.border.dark },
                                        "&:hover .MuiOutlinedInput-notchedOutline": { borderColor: palette.border.dark },
                                        "&.Mui-focused .MuiOutlinedInput-notchedOutline": { borderColor: palette.brand.primary },
                                      }}
                                    >
                                      <MenuItem value="" disabled>
                                        <Typography sx={{ color: palette.text.disabled, fontSize: "13px" }}>Select a model</Typography>
                                      </MenuItem>
                                      {judgeSaved.map((model) => (
                                        <MenuItem key={model.id} value={model.id}>
                                          <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ width: "100%" }}>
                                            <Typography sx={{ fontSize: "13px" }}>{model.name}</Typography>
                                            {model.description && (
                                              <Typography sx={{ fontSize: "11px", color: palette.text.disabled }}>{model.description}</Typography>
                                            )}
                                          </Stack>
                                        </MenuItem>
                                      ))}
                                      <Divider />
                                      <MenuItem value="__other__">
                                        <Typography sx={{ fontSize: "13px", color: palette.text.tertiary, fontStyle: "italic" }}>Other (type custom)</Typography>
                                      </MenuItem>
                                    </Select>
                                  </FormControl>
                                </Box>
                              ) : (
                                <Box>
                                  {judgeSaved.length > 0 && (
                                    <Button
                                      size="small"
                                      variant="text"
                                      onClick={() => {
                                        setUseCustomJudgeModelName(false);
                                        setConfig((prev) => ({ ...prev, judgeLlm: { ...prev.judgeLlm, model: "" } }));
                                      }}
                                      sx={{ textTransform: "none", fontSize: "11px", color: palette.text.tertiary, p: 0, mb: 0.5, minWidth: "auto", "&:hover": { color: palette.brand.primary } }}
                                    >
                                      &larr; Back to saved models
                                    </Button>
                                  )}
                                  <Field
                                    label="Model name"
                                    value={config.judgeLlm.model}
                                    onChange={(e) =>
                                      setConfig((prev) => ({ ...prev, judgeLlm: { ...prev.judgeLlm, model: e.target.value } }))
                                    }
                                    placeholder={placeholder}
                                  />
                                </Box>
                              )}

                              {/* API key (optional) for Custom / Self-hosted judge */}
                              {isCustom && (
                                <Field
                                  label="API key (optional)"
                                  type="password"
                                  value={config.judgeLlm.apiKey}
                                  onChange={(e) =>
                                    setConfig((prev) => ({
                                      ...prev,
                                      judgeLlm: { ...prev.judgeLlm, apiKey: e.target.value },
                                    }))
                                  }
                                  placeholder="Leave blank if not required"
                                  autoComplete="off"
                                />
                              )}
                            </Stack>
                          );
                        })()
                      )}

                      {/* API Key - show configured status OR input field */}
                      {selectedProvider?.needsApiKey && (
                        hasApiKey(config.judgeLlm.provider) ? (
                          <Box sx={{ p: 1.5, backgroundColor: palette.status.success.bg, borderRadius: "8px", border: `1px solid ${palette.status.success.border}` }}>
                            <Stack direction="row" alignItems="center" spacing={1}>
                              <Check size={16} color={palette.status.success.text} />
                              <Typography sx={{ fontSize: "12px", color: palette.status.success.text }}>
                                API key configured — will be saved for future experiments
                              </Typography>
                            </Stack>
                          </Box>
                        ) : (
                          <Field
                            label="API Key"
                            type="password"
                            value={config.judgeLlm.apiKey}
                            onChange={(e) =>
                              setConfig((prev) => ({
                                ...prev,
                                judgeLlm: { ...prev.judgeLlm, apiKey: e.target.value },
                              }))
                            }
                            placeholder={`Enter your ${selectedProvider.name} API key`}
                            autoComplete="off"
                            helperText="Your key will be saved securely for future experiments"
                          />
                        )
                      )}

                      <Stack direction="row" spacing={3}>
                        <Field
                          label="Temperature"
                          type="number"
                          value={String(config.judgeLlm.temperature)}
                          onChange={(e) =>
                            setConfig((prev) => ({
                              ...prev,
                              judgeLlm: { ...prev.judgeLlm, temperature: parseFloat(e.target.value) || 0 },
                            }))
                          }
                        />
                        <Field
                          label="Max tokens"
                          type="number"
                          value={String(config.judgeLlm.maxTokens)}
                          onChange={(e) =>
                            setConfig((prev) => ({
                              ...prev,
                              judgeLlm: { ...prev.judgeLlm, maxTokens: parseInt(e.target.value) || 0 },
                            }))
                          }
                        />
                      </Stack>
                    </Stack>
                  </Box>
                )}
              </>
            )}
          </Stack>
        );

      case 3:
        // Step 4: Metrics - organized by use case
        // If using scorer-only mode, don't show metrics selection
        if (judgeMode === "scorer") {
          return (
            <Stack spacing={3}>
              <Box
                sx={{
                  p: 4,
                  textAlign: "center",
                  border: `1px solid ${palette.border.dark}`,
                  borderRadius: "8px",
                  backgroundColor: palette.background.accent,
                }}
              >
                <Typography sx={{ fontSize: "15px", fontWeight: 600, color: palette.text.secondary, mb: 1 }}>
                  No metrics available
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 400, mx: "auto" }}>
                  Standard metrics require a Judge LLM.
                  <br /> Your custom scorer will be used instead.
                </Typography>
              </Box>

              {/* Estimated time display */}
              {datasetPrompts.length > 0 && (
                <Box
                  sx={{
                    p: "8px",
                    borderRadius: "4px",
                    backgroundColor: palette.status.success.bg,
                    border: `1px solid ${palette.status.success.border}`,
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                  }}
                >
                  <Clock size={16} color={palette.brand.primary} />
                  <Box>
                    <Typography sx={{ fontSize: "13px", fontWeight: 500, color: palette.brand.primary }}>
                      Estimated time: {getEstimatedTimeRange(datasetPrompts.length)}
                    </Typography>
                    <Typography sx={{ fontSize: "11px", color: palette.status.success.text }}>
                      Based on {datasetPrompts.length} prompt{datasetPrompts.length !== 1 ? "s" : ""} in your dataset
                    </Typography>
                  </Box>
                </Box>
              )}
            </Stack>
          );
        }

        return (
          <Stack spacing="16px">
            <Box>
              <Typography variant="body2" color="text.secondary">
                {isMultiTurnDataset
                  ? "Select metrics for your multi-turn conversation evaluation."
                  : "Select metrics for your evaluation. Universal core metrics run for all use cases."}
              </Typography>
              {isMultiTurnDataset && (
                <Box sx={{ mt: 1.5, mb: 3 }}>
                  <Chip
                    label="Multi-turn dataset detected"
                    size="small"
                    backgroundColor={palette.accent.blue.bg}
                    textColor={palette.accent.blue.text}
                  />
                </Box>
              )}
            </Box>

            {/* Conversational Metrics - For Multi-turn Datasets */}
            {isMultiTurnDataset && (
              <Accordion
                defaultExpanded
                disableGutters
                elevation={0}
                sx={{
                  border: `1px solid ${palette.accent.blue.bg}`,
                  borderRadius: "4px !important",
                  backgroundColor: palette.accent.blue.bg,
                  "&:before": { display: "none" },
                  "&.Mui-expanded": { margin: 0 },
                }}
              >
                <AccordionSummary
                  expandIcon={<ChevronDown size={18} color={palette.accent.blue.text} />}
                  sx={{
                    minHeight: 48,
                    px: "8px",
                    "&.Mui-expanded": { minHeight: 48 },
                    "& .MuiAccordionSummary-content": { my: "8px" },
                  }}
                >
                  <Box>
                    <Typography sx={{ fontSize: "14px", fontWeight: 600, color: palette.accent.blue.text }}>
                      Conversational Metrics
                    </Typography>
                    <Typography variant="caption" sx={{ mt: 0.5, display: "block", color: palette.accent.blue.text }}>
                      Designed for multi-turn conversation evaluation
                    </Typography>
                  </Box>
                </AccordionSummary>
                <AccordionDetails sx={{ px: "12px", pt: "12px", pb: "16px" }}>
                  <Stack spacing={2.5}>
                    {Object.entries({
                      turnRelevancy: {
                        label: "Turn Relevancy",
                        desc: "Evaluates if each assistant response is relevant to the user's input in that turn.",
                      },
                      knowledgeRetention: {
                        label: "Knowledge Retention",
                        desc: "Checks if the model retains context and information across conversation turns.",
                      },
                      conversationCoherence: {
                        label: "Conversation Coherence",
                        desc: "Evaluates overall coherence, correctness, and logical consistency across turns.",
                      },
                      conversationHelpfulness: {
                        label: "Conversation Helpfulness",
                        desc: "Measures how helpful the assistant is in addressing the user's needs throughout.",
                      },
                      taskCompletion: {
                        label: "Task Completion",
                        desc: "Evaluates if the conversation successfully achieved the expected outcome.",
                      },
                      conversationSafety: {
                        label: "Conversation Safety",
                        desc: "Checks for toxic, biased, or harmful content across all conversation turns.",
                      },
                    }).map(([key, meta]) => (
                      <Box key={key}>
                        <Checkbox
                          id={`metric-${key}`}
                          label={(meta as { label: string }).label}
                          size="small"
                          value={key}
                          isChecked={config.metrics[key as keyof typeof config.metrics]}
                          onChange={() =>
                            setConfig((prev) => ({
                              ...prev,
                              metrics: {
                                ...prev.metrics,
                                [key]: !prev.metrics[key as keyof typeof prev.metrics],
                              },
                            }))
                          }
                        />
                        <Typography
                          variant="caption"
                          color="text.secondary"
                          sx={{ ml: 3.5, mt: 0.5, pr: 2, display: "block", fontSize: "12px", lineHeight: 1.4 }}
                        >
                          {(meta as { desc: string }).desc}
                        </Typography>
                      </Box>
                    ))}
                  </Stack>
                </AccordionDetails>
              </Accordion>
            )}

            {/* Per-Turn Safety Metrics (for multi-turn) */}
            {isMultiTurnDataset && (
              <Box sx={{ p: 2.5, border: `1px solid ${palette.accent.orange.bg}`, borderRadius: "4px", backgroundColor: palette.accent.orange.bg }}>
                <Typography sx={{ fontSize: "14px", fontWeight: 600, color: palette.accent.orange.text, mb: 0.5 }}>
                  Per-Turn Safety Metrics
                </Typography>
                <Typography variant="caption" sx={{ display: "block", mb: 2, color: palette.accent.orange.text }}>
                  Bias and Toxicity will be evaluated on each assistant turn and aggregated
                </Typography>
                <Stack direction="row" spacing={4}>
                  <Checkbox
                    id="metric-toxicity-perturn"
                    label="Toxicity (per-turn)"
                    size="small"
                    value="toxicity"
                    isChecked={config.metrics.toxicity}
                    onChange={() =>
                      setConfig((prev) => ({
                        ...prev,
                        metrics: { ...prev.metrics, toxicity: !prev.metrics.toxicity },
                      }))
                    }
                  />
                  <Checkbox
                    id="metric-bias-perturn"
                    label="Bias (per-turn)"
                    size="small"
                    value="bias"
                    isChecked={config.metrics.bias}
                    onChange={() =>
                      setConfig((prev) => ({
                        ...prev,
                        metrics: { ...prev.metrics, bias: !prev.metrics.bias },
                      }))
                    }
                  />
                </Stack>
              </Box>
            )}

            {/* Universal Core Metrics - For Single-turn Datasets */}
            {!isMultiTurnDataset && (
              <Accordion
                defaultExpanded
                disableGutters
                elevation={0}
                sx={{
                  border: `1px solid ${palette.border.dark}`,
                  borderRadius: "4px !important",
                  "&:before": { display: "none" },
                  "&.Mui-expanded": { margin: 0 },
                }}
              >
                <AccordionSummary
                  expandIcon={<ChevronDown size={18} color={palette.text.tertiary} />}
                  sx={{
                    minHeight: 48,
                    px: "8px",
                    "&.Mui-expanded": { minHeight: 48 },
                    "& .MuiAccordionSummary-content": { my: "8px" },
                  }}
                >
                  <Box>
                    <Typography sx={{ fontSize: "14px", fontWeight: 600, color: palette.text.secondary }}>
                      Universal Core Metrics
                    </Typography>
                    <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: "block" }}>
                      Runs for every use case (Chatbot, RAG, Agent)
                    </Typography>
                  </Box>
                </AccordionSummary>
                <AccordionDetails sx={{ px: "12px", pt: "12px", pb: "16px" }}>
                  <Stack spacing={2.5}>
                    {Object.entries({
                      answerRelevancy: {
                        label: "Answer Relevancy",
                        desc: "Measures how relevant the model's answer is to the input (GEval).",
                      },
                      correctness: {
                        label: "Correctness",
                        desc: "Evaluates factual accuracy of the model's response (GEval).",
                      },
                      completeness: {
                        label: "Completeness",
                        desc: "Checks if the response fully addresses all aspects of the query (GEval).",
                      },
                      hallucination: {
                        label: "Hallucination",
                        desc: "Detects fabricated or unsupported information in outputs (GEval).",
                      },
                      instructionFollowing: {
                        label: "Instruction Following",
                        desc: "Measures how well the model follows the given instructions.",
                      },
                      toxicity: {
                        label: "Toxicity",
                        desc: "Flags toxic or harmful language in outputs.",
                      },
                      bias: {
                        label: "Bias",
                        desc: "Detects biased or discriminatory content in responses.",
                      },
                    }).map(([key, meta]) => (
                      <Box key={key}>
                        <Checkbox
                          id={`metric-${key}`}
                          label={(meta as { label: string }).label}
                          size="small"
                          value={key}
                          isChecked={config.metrics[key as keyof typeof config.metrics]}
                          onChange={() =>
                            setConfig((prev) => ({
                              ...prev,
                              metrics: {
                                ...prev.metrics,
                                [key]: !prev.metrics[key as keyof typeof prev.metrics],
                              },
                            }))
                          }
                        />
                        <Typography
                          variant="caption"
                          color="text.secondary"
                          sx={{ ml: 3.5, mt: 0.5, pr: 2, display: "block", fontSize: "12px", lineHeight: 1.4 }}
                        >
                          {(meta as { desc: string }).desc}
                        </Typography>
                      </Box>
                    ))}
                  </Stack>
                </AccordionDetails>
              </Accordion>
            )}

            {/* RAG-Specific Metrics (single-turn only) */}
            {config.taskType === "rag" && !isMultiTurnDataset && (
              <Box>
                <Typography sx={{ fontSize: "14px", fontWeight: 600, color: palette.text.secondary, mb: 1.5 }}>
                  RAG Metrics
                </Typography>
                <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 2 }}>
                  Requires retrieval_context in your dataset
                </Typography>
                {Object.entries({
                  contextRelevancy: {
                    label: "Context Relevancy",
                    desc: "Measures whether retrieved context is relevant to the query.",
                  },
                  contextPrecision: {
                    label: "Context Precision",
                    desc: "Evaluates if the retrieved context contains only relevant information.",
                  },
                  contextRecall: {
                    label: "Context Recall",
                    desc: "Checks if all relevant information needed for the answer was retrieved.",
                  },
                  faithfulness: {
                    label: "Faithfulness",
                    desc: "Checks if the answer is grounded in the provided retrieval context.",
                  },
                }).map(([key, meta]) => (
                  <Box key={key} sx={{ mb: 1.5 }}>
                    <Stack spacing={0.5}>
                      <Checkbox
                        id={`metric-${key}`}
                        label={(meta as { label: string }).label}
                        size="small"
                        value={key}
                        isChecked={config.metrics[key as keyof typeof config.metrics]}
                        onChange={() =>
                          setConfig((prev) => ({
                            ...prev,
                            metrics: {
                              ...prev.metrics,
                              [key]: !prev.metrics[key as keyof typeof prev.metrics],
                            },
                          }))
                        }
                      />
                      <Typography
                        variant="caption"
                        color="text.secondary"
                        sx={{ ml: 4, pr: 2, display: "block", fontSize: "12px" }}
                      >
                        {(meta as { desc: string }).desc}
                      </Typography>
                    </Stack>
                  </Box>
                ))}
              </Box>
            )}

            {/* Agent-Specific Metrics (single-turn only) */}
            {config.taskType === "agent" && !isMultiTurnDataset && (
              <Box>
                <Typography sx={{ fontSize: "14px", fontWeight: 600, color: palette.text.secondary, mb: 1.5 }}>
                  Agent Metrics
                </Typography>
                <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 2 }}>
                  Comprehensive agent evaluation based on{" "}
                  <a href="https://deepeval.com/docs/getting-started-agents" target="_blank" rel="noopener noreferrer" style={{ color: palette.accent.blue.text }}>
                    DeepEval Agent Evaluation
                  </a>
                </Typography>

                {/* Reasoning Layer */}
                <Typography sx={{ fontSize: "12px", fontWeight: 600, color: palette.text.tertiary, mb: 1, mt: 2 }}>
                  🧠 Reasoning Layer
                </Typography>
                {Object.entries({
                  planQuality: {
                    label: "Plan Quality",
                    desc: "Evaluates task understanding, decomposition, and planning coherence.",
                  },
                  planAdherence: {
                    label: "Plan Adherence",
                    desc: "Measures how well the agent follows its own plan during execution.",
                  },
                }).map(([key, meta]) => (
                  <Box key={key} sx={{ mb: 1.5 }}>
                    <Stack spacing={0.5}>
                      <Checkbox
                        id={`metric-${key}`}
                        label={(meta as { label: string }).label}
                        size="small"
                        value={key}
                        isChecked={config.metrics[key as keyof typeof config.metrics]}
                        onChange={() =>
                          setConfig((prev) => ({
                            ...prev,
                            metrics: {
                              ...prev.metrics,
                              [key]: !prev.metrics[key as keyof typeof prev.metrics],
                            },
                          }))
                        }
                      />
                      <Typography
                        variant="caption"
                        color="text.secondary"
                        sx={{ ml: 4, pr: 2, display: "block", fontSize: "12px" }}
                      >
                        {(meta as { desc: string }).desc}
                      </Typography>
                    </Stack>
                  </Box>
                ))}

                {/* Action Layer */}
                <Typography sx={{ fontSize: "12px", fontWeight: 600, color: palette.text.tertiary, mb: 1, mt: 2 }}>
                  🔧 Action Layer
                </Typography>
                {Object.entries({
                  toolSelection: {
                    label: "Tool Selection",
                    desc: "Evaluates whether the agent selected the appropriate tool for the task.",
                  },
                  toolCorrectness: {
                    label: "Tool Correctness",
                    desc: "Measures whether the agent used tools with correct parameters and sequence.",
                  },
                  argumentCorrectness: {
                    label: "Argument Correctness",
                    desc: "Evaluates if tool arguments are correctly typed, formatted, and extracted from context.",
                  },
                }).map(([key, meta]) => (
                  <Box key={key} sx={{ mb: 1.5 }}>
                    <Stack spacing={0.5}>
                      <Checkbox
                        id={`metric-${key}`}
                        label={(meta as { label: string }).label}
                        size="small"
                        value={key}
                        isChecked={config.metrics[key as keyof typeof config.metrics]}
                        onChange={() =>
                          setConfig((prev) => ({
                            ...prev,
                            metrics: {
                              ...prev.metrics,
                              [key]: !prev.metrics[key as keyof typeof prev.metrics],
                            },
                          }))
                        }
                      />
                      <Typography
                        variant="caption"
                        color="text.secondary"
                        sx={{ ml: 4, pr: 2, display: "block", fontSize: "12px" }}
                      >
                        {(meta as { desc: string }).desc}
                      </Typography>
                    </Stack>
                  </Box>
                ))}

                {/* Execution Layer */}
                <Typography sx={{ fontSize: "12px", fontWeight: 600, color: palette.text.tertiary, mb: 1, mt: 2 }}>
                  ✅ Execution Layer
                </Typography>
                {Object.entries({
                  taskCompletion: {
                    label: "Task Completion",
                    desc: "Measures whether the agent successfully completed the requested task.",
                  },
                  stepEfficiency: {
                    label: "Step Efficiency",
                    desc: "Evaluates if the agent completed the task with minimal unnecessary steps.",
                  },
                  actionRelevance: {
                    label: "Action Relevance",
                    desc: "Checks if all agent actions directly contribute to the goal.",
                  },
                }).map(([key, meta]) => (
                  <Box key={key} sx={{ mb: 1.5 }}>
                    <Stack spacing={0.5}>
                      <Checkbox
                        id={`metric-${key}`}
                        label={(meta as { label: string }).label}
                        size="small"
                        value={key}
                        isChecked={config.metrics[key as keyof typeof config.metrics]}
                        onChange={() =>
                          setConfig((prev) => ({
                            ...prev,
                            metrics: {
                              ...prev.metrics,
                              [key]: !prev.metrics[key as keyof typeof prev.metrics],
                            },
                          }))
                        }
                      />
                      <Typography
                        variant="caption"
                        color="text.secondary"
                        sx={{ ml: 4, pr: 2, display: "block", fontSize: "12px" }}
                      >
                        {(meta as { desc: string }).desc}
                      </Typography>
                    </Stack>
                  </Box>
                ))}
              </Box>
            )}

            {/* Estimated time display */}
            {datasetPrompts.length > 0 && (
              <Box
                sx={{
                  mt: "16px",
                  p: "8px",
                  borderRadius: "4px",
                  backgroundColor: palette.status.success.bg,
                  border: `1px solid ${palette.status.success.border}`,
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                }}
              >
                <Clock size={16} color={palette.brand.primary} />
                <Box>
                  <Typography sx={{ fontSize: "13px", fontWeight: 500, color: palette.brand.primary }}>
                    Estimated time: {getEstimatedTimeRange(datasetPrompts.length)}
                  </Typography>
                  <Typography sx={{ fontSize: "11px", color: palette.status.success.text }}>
                    Based on {datasetPrompts.length} prompt{datasetPrompts.length !== 1 ? "s" : ""} in your dataset
                  </Typography>
                </Box>
              </Box>
            )}
          </Stack>
        );

      default:
        return null;
    }
  };

  // Providers required by selected scorers that have no saved API key in org settings.
  // Self-hosted / Ollama scorers are excluded since they don't need a cloud key.
  const missingKeyProviders = useMemo(() => {
    if (judgeMode !== "scorer" && judgeMode !== "both") return [];
    const scorersToCheck =
      selectedScorerIds.length > 0
        ? userScorers.filter((s) => selectedScorerIds.includes(s.id))
        : userScorers;
    const missing: string[] = [];
    for (const scorer of scorersToCheck) {
      const judgeModel = scorer.config?.judgeModel;
      if (typeof judgeModel === "object" && judgeModel?.provider) {
        const provider = judgeModel.provider.toLowerCase();
        if (provider !== "self-hosted" && provider !== "ollama") {
          const hasKey = configuredApiKeys.some((k) => k.provider === provider);
          if (!hasKey && !missing.includes(provider)) {
            missing.push(provider);
          }
        }
      }
    }
    return missing;
  }, [judgeMode, selectedScorerIds, userScorers, configuredApiKeys]);

  const canProceed = (() => {
    if (activeStep === 0) {
      // Step 1: Model validation
      const hasName = !!config.model.name;
      const hasAccessMethod = !!config.model.accessMethod;

      if (!hasName || !hasAccessMethod) return false;

      // Check conditional fields based on access method
      if (selectedModelProvider && 'needsUrl' in selectedModelProvider && selectedModelProvider.needsUrl && !config.model.endpointUrl) return false;

      // Providers that don't need API keys
      const noApiKeyNeeded = ["ollama", "local"];

      // For all cloud providers (including custom_api), require either a saved API key OR an entered API key
      if (!noApiKeyNeeded.includes(config.model.accessMethod)) {
        // Map custom_api to "custom" for checking saved keys
        const providerForKeyCheck = config.model.accessMethod === "custom_api" ? "custom" : config.model.accessMethod;
        const hasSavedKey = hasApiKey(providerForKeyCheck);
        const hasEnteredKey = !!config.model.apiKey;
        if (!hasSavedKey && !hasEnteredKey) return false;
      }

      return true;
    }

    if (activeStep === 1) {
      // Step 2: Dataset validation - must have loaded prompts
      return datasetPrompts.length > 0;
    }

    if (activeStep === 2) {
      // Step 3: Scorer / Judge validation
      if (judgeMode === "scorer") {
        // Custom scorer only - must have at least one scorer and all required API keys
        if (userScorers.length === 0) return false;
        if (missingKeyProviders.length > 0) return false;
        return true;
      } else if (judgeMode === "standard") {
        // Standard judge only - must have provider and model (API key is from saved settings)
        const hasBase = !!(config.judgeLlm.provider && config.judgeLlm.model);
        // Custom / Self-hosted also requires endpoint URL
        if (config.judgeLlm.provider === "custom_api") {
          return hasBase && !!config.judgeLlm.endpointUrl;
        }
        return hasBase;
      } else {
        // Both mode - scorers exist, all scorer API keys present, AND standard judge configured
        const hasScorers = userScorers.length > 0;
        if (missingKeyProviders.length > 0) return false;
        let hasJudge = !!(config.judgeLlm.provider && config.judgeLlm.model);
        if (config.judgeLlm.provider === "custom_api") {
          hasJudge = hasJudge && !!config.judgeLlm.endpointUrl;
        }
        return hasScorers && hasJudge;
      }
    }

    return true;
  })();

  return (
    <>
      <StepperModal
        isOpen={isOpen}
        onClose={() => {
          onClose();
          resetForm();
          setAlert(null);
        }}
        title="Create new experiment"
        steps={steps}
        activeStep={activeStep}
        onNext={handleNext}
        onBack={handleBack}
        onSubmit={handleSubmit}
        isSubmitting={loading}
        canProceed={canProceed}
        submitButtonText="Start Experiment"
        maxWidth="700px"
        headerBadge={
          <Box
            sx={{
              display: "inline-flex",
              alignItems: "center",
              gap: 0.5,
              px: 1,
              py: 0.25,
              borderRadius: "4px",
              backgroundColor: config.taskType === "agent" ? palette.accent.purple.bg : config.taskType === "rag" ? palette.status.warning.bg : palette.status.success.bg,
              border: `1px solid ${config.taskType === "agent" ? palette.accent.purple.text : config.taskType === "rag" ? palette.status.warning.text : palette.status.success.border}`,
            }}
          >
            {config.taskType === "agent" ? (
              <Bot size={12} color={palette.accent.purple.text} />
            ) : config.taskType === "rag" ? (
              <FileSearch size={12} color={palette.status.warning.text} />
            ) : (
              <MessageSquare size={12} color={palette.status.success.text} />
            )}
            <Typography
              sx={{
                fontSize: "11px",
                fontWeight: 600,
                color: config.taskType === "agent" ? palette.accent.purple.text : config.taskType === "rag" ? palette.status.warning.text : palette.status.success.text,
                textTransform: "capitalize",
              }}
            >
              {config.taskType}
            </Typography>
          </Box>
        }
      >
        {renderStepContent()}
      </StepperModal>

      {/* Alert toast for success/error messages */}
      {alert?.show && (
        <Alert
          variant={alert.variant}
          title={alert.title}
          body={alert.body}
          isToast
          onClick={() => setAlert(null)}
        />
      )}
    </>
  );
}



