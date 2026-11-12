import { useState, useRef, useEffect, useMemo } from "react";
import {
  Box,
  Typography,
  Stack,
  Card,
  CardContent,
  Grid,
  Divider,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  FormHelperText,
} from "@mui/material";
import SectionLabel from "./NewExperiment/SectionLabel";
import {
  Check,
  ExternalLink,
  Sparkles,
  Settings,
  Plus,
  Layers,
  ChevronDown,
  FileSearch,
  MessageSquare,
  Bot,
  Clock,
} from "lucide-react";
import StepperModal from "../../components/Modals/StepperModal";
import SelectableCard from "../../components/SelectableCard";
import Field from "../../components/Inputs/Field";
import ModelPicker from "../../components/Inputs/ModelPicker";
import Checkbox from "../../components/Inputs/Checkbox";
import Alert from "../../components/Alert";
import Chip from "../../components/Chip";
import { palette } from "../../themes/palette";
import {
  createExperiment,
  listMyDatasets,
  listScorers,
  getAllLlmApiKeys,
  addLlmApiKey,
  verifySavedLlmApiKey,
  validateModel,
  type DeepEvalScorer,
  type LLMApiKey,
  type LLMProvider,
} from "../../../application/repository/deepEval.repository";
import { getAllEntities } from "../../../application/repository/entity.repository";
import { PROVIDERS, type ModelInfo } from "../../utils/providers";
import { evalModelsService, type SavedModel } from "../../../infrastructure/api/evalModelsService";
import { useModelPreferences } from "../../../application/hooks/useModelPreferences";
import { mergeWithBundledModels } from "../../../application/hooks/useProviderModels";
import {
  datasetNameFromPresetPath,
  generateDefaultExperimentName,
} from "./NewExperiment/experimentNameHelpers";
import {
  type DatasetPrompt,
  type JudgeMode,
  type ProviderType,
  type UserDataset,
  apiKeyHelperText,
  validationAlertTitle,
  WIZARD_STEPS,
} from "./NewExperiment/newExperimentConfig";
import {
  availableJudgeProviders,
  availableModelProviders,
  CLOUD_PROVIDER_IDS,
} from "./NewExperiment/providerConfig";
import { canProceedToNextStep, getMissingKeyProviders } from "./NewExperiment/stepValidation";
import DatasetStep from "./NewExperiment/DatasetStep";
import ModelStep from "./NewExperiment/ModelStep";
import { toSimulatedScenarios } from "./NewExperiment/simulatedScenarios";
import { countLabel } from "../../tools/countLabel";
import { CustomizableButton } from "../../components/button/customizable-button";
import { METRIC_LABELS } from "./metricLabels";

/** Conversational G-Eval metrics built without evaluation_params; they fail on every sample. */
const FAILING_CONVERSATIONAL_METRICS = [
  "conversationCoherence",
  "conversationHelpfulness",
  "taskCompletion",
  "conversationSafety",
] as const;

interface NewExperimentModalProps {
  isOpen: boolean;
  onClose: () => void;
  projectId: string;
  orgId?: string | null;
  onSuccess: () => void;
  onStarted?: (exp: {
    id: string;
    name?: string;
    config: Record<string, unknown>;
    status: string;
    created_at?: string;
  }) => void;
  /** Project's use case - determines default metrics and datasets (required) */
  useCase: "chatbot" | "rag" | "agent";
  /**
   * Names of experiments that already exist in this project. Used to
   * disambiguate the auto-generated experiment name with #2, #3, ... when
   * the same model+dataset combination has been run before.
   */
  existingExperimentNames?: string[];
}

export default function NewExperimentModal({
  isOpen,
  onClose,
  projectId,
  orgId,
  onSuccess,
  onStarted,
  useCase,
  existingExperimentNames = [],
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
  const [datasetPrompts, setDatasetPrompts] = useState<DatasetPrompt[]>([]);
  // User's saved datasets (for "My datasets" option)
  const [userDatasets, setUserDatasets] = useState<UserDataset[]>([]);
  const [selectedUserDataset, setSelectedUserDataset] = useState<UserDataset | null>(null);
  const [loadingUserDatasets, setLoadingUserDatasets] = useState(false);
  const [uploadingDataset, setUploadingDataset] = useState(false);
  const [selectedPresetPath, setSelectedPresetPath] = useState<string>("");

  // Scorer / Judge mode state: scorer = custom only, standard = judge only, both = run both
  const [judgeMode, setJudgeMode] = useState<JudgeMode>("standard");
  const [userScorers, setUserScorers] = useState<DeepEvalScorer[]>([]);
  const [selectedScorer, setSelectedScorer] = useState<DeepEvalScorer | null>(null);
  const [selectedScorerIds, setSelectedScorerIds] = useState<string[]>([]); // Multi-select scorer IDs
  const [loadingScorers, setLoadingScorers] = useState(false);

  // Configured API keys state
  const [configuredApiKeys, setConfiguredApiKeys] = useState<LLMApiKey[]>([]);
  const [loadingApiKeys, setLoadingApiKeys] = useState(true);
  // Saved keys the provider refused when the wizard checked them; those count as missing
  const [rejectedKeyIds, setRejectedKeyIds] = useState<Set<number>>(new Set());
  const checkedKeyIds = useRef<Set<number>>(new Set());
  // Bumped on each open; key checks and the key list belong to the open that started them
  const openGeneration = useRef(0);
  const keysGeneration = useRef(-1);
  // orgId the saved models were last loaded for, so a late orgId reloads only the models
  const modelsOrgId = useRef<string | undefined>(undefined);
  // listModels reads null, undefined and "" alike
  const modelsOrg = orgId || undefined;

  // Saved models from the Models page (database)
  const [savedModels, setSavedModels] = useState<SavedModel[]>([]);
  // Selected saved model ID — when set, bypasses provider/model config UI entirely
  const [selectedSavedModelId, setSelectedSavedModelId] = useState<string | null>(null);
  // Track when user picks "Other (type custom)" in a saved-models dropdown

  // Live LiteLLM model catalog fetched from AI Gateway, keyed by frontend provider ID.
  // Populated lazily when the user picks a provider; falls back to static JSON if gateway is down.
  const [gatewayModels, setGatewayModels] = useState<Record<string, ModelInfo[]>>({});
  const gatewayModelsLoaded = useRef<Set<string>>(new Set());

  // Model preferences hook for auto-loading saved settings
  const {
    preferences: savedPreferences,
    loading: preferencesLoading,
    savePreferences,
  } = useModelPreferences(projectId, orgId);
  const [preferencesApplied, setPreferencesApplied] = useState(false);

  // Model inventory link (optional)
  const [modelInventories, setModelInventories] = useState<
    Array<{ id: number; provider: string; model: string; version: string; status: string }>
  >([]);
  const [selectedModelInventoryId, setSelectedModelInventoryId] = useState<number | null>(null);

  // Experiment name (editable by user). The placeholder always shows the
  // current auto-suggested default (`<model> × <dataset>` with a #N suffix
  // when needed); leaving this field blank uses that default on submit.
  const [experimentName, setExperimentName] = useState("");

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
      scenarios: [] as Array<{
        scenario: string;
        expected_outcome: string;
        user_description?: string;
        max_turns?: number;
      }>,
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

  // Reset warning acknowledgment when model changes; picking another saved model counts,
  // so a model the provider refused does not let the next one skip the check
  useEffect(() => {
    setApiKeyWarningAcknowledged(false);
  }, [config.model.name, config.model.accessMethod, selectedSavedModelId]);

  // Fetch model inventories when modal opens
  useEffect(() => {
    if (isOpen) {
      getAllEntities({ routeUrl: "/modelInventory" })
        .then((response) => {
          if (response?.data) {
            setModelInventories(response.data);
          }
        })
        .catch(() => {
          // Non-critical — dropdown just stays empty
        });
    }
  }, [isOpen]);

  // A simulated dataset holds scenarios; the runner turns them into conversations,
  // so it is scored with the multi-turn metrics too.
  const isSimulatedDataset = selectedUserDataset?.turnType === "simulated";

  // Track if selected dataset is multi-turn
  const isMultiTurnDataset =
    isSimulatedDataset ||
    selectedUserDataset?.turnType === "multi-turn" ||
    Boolean(selectedPresetPath && selectedPresetPath.includes("multiturn"));

  // ── Auto-generated experiment name ────────────────────────────────────────
  // Mirrors the resolution logic in handleSubmit: a saved model selection
  // wins, otherwise we fall back to whatever the user typed in the custom
  // model field. Kept in sync via useMemo so the placeholder/default in the
  // metrics step always reflects the latest model + dataset.
  const resolvedModelName = useMemo(() => {
    if (selectedSavedModelId) {
      const saved = savedModels.find((m) => String(m.id) === String(selectedSavedModelId));
      if (saved?.name) return saved.name;
    }
    return config.model.name;
  }, [selectedSavedModelId, savedModels, config.model.name]);

  const datasetDisplayName = useMemo(() => {
    if (selectedUserDataset?.name) return selectedUserDataset.name;
    if (selectedPresetPath) return datasetNameFromPresetPath(selectedPresetPath);
    return "";
  }, [selectedUserDataset, selectedPresetPath]);

  const defaultExperimentName = useMemo(
    () =>
      generateDefaultExperimentName(resolvedModelName, datasetDisplayName, existingExperimentNames),
    [resolvedModelName, datasetDisplayName, existingExperimentNames],
  );

  // Metric defaults follow the task type and whether the dataset is multi-turn. Both are
  // set here, in one place, so neither can undo the other.
  useEffect(() => {
    const withTaskDefaults = (prev: typeof config): typeof config => {
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
    };

    setConfig((prev) => {
      const next = withTaskDefaults(prev);
      if (!isMultiTurnDataset) return next;
      // Off by default on multi-turn datasets until the conversational G-Eval metrics get
      // evaluation_params: today they fail on every sample (LLM Evals demo findings spec #2b).
      // Task completion also runs on single-turn, where it works, so only multi-turn drops it.
      return {
        ...next,
        metrics: {
          ...next.metrics,
          ...Object.fromEntries(FAILING_CONVERSATIONAL_METRICS.map((key) => [key, false])),
        },
      };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config.taskType, isMultiTurnDataset]);

  // Sync taskType with useCase prop when modal opens
  useEffect(() => {
    if (isOpen && useCase !== config.taskType) {
      setConfig((prev) => ({ ...prev, taskType: useCase }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, useCase]);

  const handleNext = () => {
    setActiveStep((prev) => prev + 1);
  };

  // Load configured API keys and saved models when the modal opens. The modal stays mounted
  // between opens, so key checks start afresh each time: a key fixed or revoked in the
  // meantime is seen as it is now.
  useEffect(() => {
    if (!isOpen) return;
    const generation = ++openGeneration.current;
    checkedKeyIds.current = new Set();
    setRejectedKeyIds(new Set());
    modelsOrgId.current = modelsOrg;
    (async () => {
      setLoadingApiKeys(true);
      const [keys, models] = await Promise.allSettled([
        getAllLlmApiKeys(),
        evalModelsService.listModels(modelsOrg),
      ]);
      // A slower load from an earlier open must not replace this open's lists
      if (generation !== openGeneration.current) return;
      if (keys.status === "fulfilled") {
        setConfiguredApiKeys(keys.value);
      } else {
        // Keep checking the last list loaded, so a key refused before is not shown as configured
        console.warn("Failed to load saved API keys:", keys.reason);
      }
      // A late orgId reloads the models itself; this open's older list must not replace it
      if (models.status === "fulfilled" && modelsOrgId.current === modelsOrg) {
        setSavedModels(models.value);
      } else if (models.status === "rejected") {
        console.warn("Failed to load saved models:", models.reason);
      }
      keysGeneration.current = generation;
      setLoadingApiKeys(false);
    })();
    // orgId arriving after the open is handled below, without reloading keys
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  // Saved models depend on orgId, which may arrive after the modal opens
  useEffect(() => {
    if (!isOpen || modelsOrg === modelsOrgId.current) return;
    modelsOrgId.current = modelsOrg;
    let stale = false;
    evalModelsService
      .listModels(modelsOrg)
      .then((models) => {
        if (!stale) setSavedModels(models);
      })
      .catch((err) => console.warn("Failed to load saved models:", err));
    return () => {
      stale = true;
    };
  }, [isOpen, modelsOrg]);

  // Check the saved keys of the chosen model and judge providers once per open, so a dead
  // key shows the key field instead of "API key configured" and the run doesn't fail on it
  useEffect(() => {
    // Wait for this open's key list; the previous open's may name deleted keys
    if (!isOpen || loadingApiKeys || keysGeneration.current !== openGeneration.current) return;
    const generation = openGeneration.current;
    const providers: string[] = [config.model.accessMethod];
    // The standard judge only runs outside scorer-only mode
    if (judgeMode !== "scorer") providers.push(config.judgeLlm.provider);
    for (const key of configuredApiKeys) {
      if (!providers.includes(key.provider) || key.id === undefined) continue;
      if (checkedKeyIds.current.has(key.id)) continue;
      const keyId = key.id;
      checkedKeyIds.current.add(keyId);
      void verifySavedLlmApiKey(keyId).then(({ valid }) => {
        // A reply from an earlier open must not mark a key fixed since then
        if (!valid && generation === openGeneration.current) {
          setRejectedKeyIds((prev) => new Set(prev).add(keyId));
        }
      });
    }
  }, [
    isOpen,
    loadingApiKeys,
    judgeMode,
    config.model.accessMethod,
    config.judgeLlm.provider,
    configuredApiKeys,
  ]);

  // Reset model selection and apply saved judge preferences on each open
  useEffect(() => {
    if (!isOpen || preferencesApplied || preferencesLoading) return;

    setSelectedSavedModelId(null);
    setConfig((prev) => ({
      ...prev,
      // Always clear model so user chooses explicitly via "Saved Models" or provider grid
      model: {
        name: "",
        accessMethod: "" as ProviderType | "",
        endpointUrl: "",
        apiKey: "",
        modelPath: "",
      },
      judgeLlm: {
        ...prev.judgeLlm,
        ...(savedPreferences
          ? {
              provider: (savedPreferences.judgeLlm.provider || prev.judgeLlm.provider) as
                ProviderType | "",
              model: savedPreferences.judgeLlm.model || prev.judgeLlm.model,
              endpointUrl: savedPreferences.judgeLlm.endpointUrl || prev.judgeLlm.endpointUrl,
            }
          : {}),
      },
    }));
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
      } catch {
        /* ignore */
      } finally {
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
        // Mode stays on the standard judge; scorers are opt-in. Every run saves its judge as a
        // scorer, so switching whenever one exists made "Custom scorer only" the default for all
        setUserScorers(enabledScorers);
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
      const firstScorer = userScorers.find((s) => s.id === selectedScorerIds[0]);
      setSelectedScorer(firstScorer || null);
    } else {
      setSelectedScorer(null);
    }
  }, [selectedScorerIds, userScorers]);

  const handleBack = () => {
    setActiveStep((prev) => prev - 1);
  };

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

      // A simulated dataset runs its scenarios; without any it would run as plain prompts
      const simulatedScenarios = isSimulatedDataset ? toSimulatedScenarios(datasetPrompts) : [];
      if (isSimulatedDataset && simulatedScenarios.length === 0) {
        setAlert({
          show: true,
          variant: "error",
          title: "No scenarios in dataset",
          body: "This simulated dataset has no rows with a scenario. Add a scenario to each row, or pick another dataset.",
        });
        setLoading(false);
        return;
      }
      // What the run will evaluate: scenarios for a simulated dataset, prompts otherwise
      const sampleCount = isSimulatedDataset ? simulatedScenarios.length : datasetPrompts.length;

      // Resolve model name/provider for validation (saved model takes precedence)
      const savedModelForValidation = selectedSavedModelId
        ? (savedModels.find((m) => m.id === selectedSavedModelId) ?? null)
        : null;
      const modelName = savedModelForValidation?.name || config.model.name;
      const modelProvider = savedModelForValidation
        ? savedModelForValidation.provider.toLowerCase()
        : config.model.accessMethod;

      // Skip validation if user already acknowledged the warning, or if they provided a key inline
      if (
        !apiKeyWarningAcknowledged &&
        !config.model.apiKey &&
        modelName &&
        modelProvider !== "ollama" &&
        modelProvider !== "huggingface"
      ) {
        try {
          // probe: one tiny call with the saved key catches a refused key or a model the
          // provider no longer serves before the run spends anything
          const validation = await validateModel(modelName, modelProvider, true);
          if (!validation.valid) {
            // Show warning but allow user to proceed by clicking again
            setAlert({
              show: true,
              variant: "warning",
              title: validationAlertTitle(validation.probe_failed, validation.probe_error_code),
              body: `${validation.error_message || `The API key for ${validation.provider || modelProvider} may not be configured.`} Click "Start experiment" again to proceed anyway.`,
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
      if (
        config.model.apiKey &&
        modelProvider &&
        PROVIDERS[modelProvider] &&
        !hasApiKey(modelProvider)
      ) {
        saveApiKeyPromises.push(
          addLlmApiKey({
            provider: modelProvider as LLMProvider,
            apiKey: config.model.apiKey,
          })
            .then((newKey) => {
              // Update local state so we know it's configured now
              setConfiguredApiKeys((prev) => [...prev, newKey]);
            })
            .catch((err) => {
              console.warn("Failed to save model API key:", err);
            }),
        );
      }

      // Save judge provider API key if entered
      const judgeProvider = config.judgeLlm.provider;
      if (
        config.judgeLlm.apiKey &&
        judgeProvider &&
        PROVIDERS[judgeProvider] &&
        !hasApiKey(judgeProvider)
      ) {
        saveApiKeyPromises.push(
          addLlmApiKey({
            provider: judgeProvider as LLMProvider,
            apiKey: config.judgeLlm.apiKey,
          })
            .then((newKey) => {
              setConfiguredApiKeys((prev) => [...prev, newKey]);
            })
            .catch((err) => {
              console.warn("Failed to save judge API key:", err);
            }),
        );
      }

      // Wait for API keys to be saved (don't block if they fail)
      await Promise.allSettled(saveApiKeyPromises);

      // Prepare experiment configuration
      // Resolve model: prefer saved model record over manual config
      const savedModelRecord = selectedSavedModelId
        ? (savedModels.find((m) => m.id === selectedSavedModelId) ?? null)
        : null;
      const resolvedModel = savedModelRecord
        ? {
            name: savedModelRecord.name,
            accessMethod: savedModelRecord.provider.toLowerCase(),
            endpointUrl: savedModelRecord.endpointUrl || "",
            apiKey: config.model.apiKey || undefined,
            modelPath: "",
          }
        : {
            name: config.model.name,
            accessMethod: config.model.accessMethod,
            endpointUrl: config.model.endpointUrl,
            apiKey: config.model.apiKey || undefined,
            modelPath: config.model.modelPath,
          };

      // Experiment name: user-typed value wins, otherwise the auto-suggested
      // `<model> × <dataset> [#N]` default that powers the placeholder.
      const experimentModelName = resolvedModel.name || modelName || "Unknown model";
      const resolvedExperimentName =
        experimentName.trim() ||
        generateDefaultExperimentName(
          experimentModelName,
          datasetDisplayName,
          existingExperimentNames,
        );

      const experimentConfig = {
        project_id: projectId,
        name: resolvedExperimentName,
        description: `Evaluating ${experimentModelName} with ${countLabel(sampleCount, isSimulatedDataset ? "scenario" : "prompt")}`,
        model_inventory_id: selectedModelInventoryId || undefined,
        config: {
          project_id: projectId, // Include in config for runner
          model: {
            name: resolvedModel.name,
            accessMethod: resolvedModel.accessMethod,
            endpointUrl: resolvedModel.endpointUrl,
            apiKey: resolvedModel.apiKey,
            modelPath: resolvedModel.modelPath,
          },
          // Include scorer info if using custom scorer mode or both
          ...(judgeMode === "scorer" || judgeMode === "both"
            ? {
                useCustomScorer: true,
                // NEW: Include selectedScorers array for backend filtering
                ...(selectedScorerIds.length > 0 && {
                  selectedScorers: selectedScorerIds,
                }),
                // Keep backward compatibility fields (single scorer)
                ...(selectedScorer
                  ? {
                      scorerId: selectedScorer.id,
                      scorerName: selectedScorer.name,
                      scorerMetricKey: selectedScorer.metricKey,
                    }
                  : {}),
                // Tell backend which providers the custom scorers need (for API key injection)
                scorerProviders: (() => {
                  const providers: string[] = [];
                  // Collect providers from all selected scorers
                  const scorersToCheck =
                    selectedScorerIds.length > 0
                      ? userScorers.filter((s) => selectedScorerIds.includes(s.id))
                      : userScorers; // If none selected, include all for API key purposes

                  scorersToCheck.forEach((scorer) => {
                    const judgeModel = scorer.config?.judgeModel;
                    if (typeof judgeModel === "object" && judgeModel?.provider) {
                      const provider = judgeModel.provider.toLowerCase();
                      if (!providers.includes(provider)) {
                        providers.push(provider);
                      }
                    } else if (typeof judgeModel === "string") {
                      // Legacy format - infer provider from model name
                      const modelLower = judgeModel.toLowerCase();
                      if (
                        (modelLower.includes("gpt") ||
                          modelLower.includes("o1") ||
                          modelLower.includes("o3")) &&
                        !providers.includes("openai")
                      ) {
                        providers.push("openai");
                      } else if (
                        modelLower.includes("claude") &&
                        !providers.includes("anthropic")
                      ) {
                        providers.push("anthropic");
                      } else if (modelLower.includes("gemini") && !providers.includes("google")) {
                        providers.push("google");
                      } else if (
                        (modelLower.includes("mistral") || modelLower.includes("magistral")) &&
                        !providers.includes("mistral")
                      ) {
                        providers.push("mistral");
                      } else if (modelLower.includes("grok") && !providers.includes("xai")) {
                        providers.push("xai");
                      }
                    }
                  });
                  return providers.length > 0 ? providers : ["openai"]; // Default to OpenAI
                })(),
                // API key is automatically injected by the backend from organization settings
              }
            : {}),
          // Include judge LLM config if using standard mode or both
          judgeLlm:
            judgeMode === "standard" || judgeMode === "both"
              ? {
                  provider: config.judgeLlm.provider,
                  model: config.judgeLlm.model,
                  apiKey: config.judgeLlm.apiKey || undefined,
                  endpointUrl: config.judgeLlm.endpointUrl || undefined,
                }
              : undefined,
          // Include evaluation mode for the runner
          evaluationMode: judgeMode,
          dataset: {
            useBuiltin: config.dataset.useBuiltin,
            // Include dataset name and path for display in experiments table
            name:
              selectedUserDataset?.name ||
              (selectedPresetPath
                ? selectedPresetPath
                    .split("/")
                    .pop()
                    ?.replace(/\.json$/i, "")
                    .split("_")
                    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
                    .join(" ")
                : undefined),
            path: selectedUserDataset?.path || selectedPresetPath || undefined,
            datasetId: selectedUserDataset?.id || undefined,
            // A simulated dataset's rows go once, as scenarios; the runner applies
            // each scenario's max_turns.
            prompts: isSimulatedDataset ? [] : datasetPrompts,
            count: sampleCount,
            ...(isSimulatedDataset ? { simulatedMode: true, scenarios: simulatedScenarios } : {}),
          },
          metrics: config.metrics,
          thresholds: config.thresholds,
        },
      };

      // Create experiment via API
      const response = await createExperiment(experimentConfig);

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
          name: resolvedModel.name,
          accessMethod: resolvedModel.accessMethod,
          endpointUrl: resolvedModel.endpointUrl,
        },
        judgeLlm: {
          provider: config.judgeLlm.provider,
          model: config.judgeLlm.model,
          endpointUrl: config.judgeLlm.endpointUrl || undefined,
        },
      }).catch(() => {});

      // Show success message
      setAlert({
        show: true,
        variant: "success",
        title: "Experiment created",
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
        title: "Experiment creation failed",
        body: errorMessage,
      });
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setActiveStep(0);
    setDatasetPrompts([]);
    setSelectedUserDataset(null);
    setSelectedPresetPath("");
    // Reset scorer state
    setJudgeMode("standard");
    setSelectedScorer(null);
    // Reset custom model name toggles
    setSelectedModelInventoryId(null);
    setExperimentName("");
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

  // Saved keys the provider has not refused
  const usableApiKeys = useMemo(
    () => configuredApiKeys.filter((k) => k.id === undefined || !rejectedKeyIds.has(k.id)),
    [configuredApiKeys, rejectedKeyIds],
  );

  // Check if a provider has a configured API key the provider has not refused
  const hasApiKey = (providerId: string): boolean =>
    usableApiKeys.some((k) => k.provider === providerId);

  // A saved key exists for the provider, but the provider refused it
  const savedKeyRejected = (providerId: string): boolean =>
    !hasApiKey(providerId) && configuredApiKeys.some((k) => k.provider === providerId);

  const selectedProvider = availableJudgeProviders.find((p) => p.id === config.judgeLlm.provider);

  // Get saved models that match a given provider ID
  const getSavedModelsForProvider = (providerId: string): SavedModel[] => {
    const pid = providerId.toLowerCase();
    return savedModels.filter((m) => {
      const mp = (m.provider || "").toLowerCase();
      if (pid === "custom_api")
        return mp === "custom" || mp === "custom_api" || mp === "self-hosted";
      if (pid === "ollama") return mp === "ollama";
      // Cloud providers match their own ID
      return mp === pid;
    });
  };

  // Get models for selected provider.
  // Priority: saved DB models → live LiteLLM catalog from AI Gateway → static JSON fallback.
  const getProviderModels = (providerId: string): ModelInfo[] => {
    const saved = getSavedModelsForProvider(providerId).map((m) => ({
      id: m.name,
      name: m.name,
      description: m.endpointUrl ? `Saved · ${m.endpointUrl}` : "Saved model",
    }));

    // Use live gateway catalog if already loaded for this provider
    const live = gatewayModels[providerId];
    if (live && live.length > 0) {
      const named = mergeWithBundledModels(providerId, live);
      const liveIds = new Set(live.map((m) => m.id));
      const uniqueSaved = saved.filter((s) => !liveIds.has(s.id));
      return [...uniqueSaved, ...named];
    }

    // Fall back to bundled static JSON while gateway loads (or if gateway is down)
    if (PROVIDERS[providerId]) {
      const staticModels = PROVIDERS[providerId].models;
      const staticIds = new Set(staticModels.map((sm) => sm.id));
      const uniqueSaved = saved.filter((s) => !staticIds.has(s.id));
      return [...uniqueSaved, ...staticModels];
    }

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

  // Load live model catalog from AI Gateway when a cloud provider is selected.
  // Runs for both the model-under-test and the judge provider.
  const loadGatewayModels = async (provider: string) => {
    if (!provider || gatewayModelsLoaded.current.has(provider)) return;
    // Only cloud providers — local/custom providers don't have a LiteLLM catalog entry
    if (!(CLOUD_PROVIDER_IDS as readonly string[]).includes(provider)) return;
    gatewayModelsLoaded.current.add(provider); // mark before fetch to prevent concurrent calls
    try {
      const models = await evalModelsService.getGatewayModelsForProvider(provider);
      if (models.length > 0) {
        setGatewayModels((prev) => ({ ...prev, [provider]: models }));
      } else {
        // Gateway down or restarting: the bundled list shows, and the next pick asks again
        gatewayModelsLoaded.current.delete(provider);
      }
    } catch {
      gatewayModelsLoaded.current.delete(provider);
    }
  };

  useEffect(() => {
    void loadGatewayModels(config.model.accessMethod as string);
  }, [config.model.accessMethod]);

  useEffect(() => {
    void loadGatewayModels(config.judgeLlm.provider as string);
  }, [config.judgeLlm.provider]);

  const selectedModelProvider = availableModelProviders.find(
    (p) => p.id === config.model.accessMethod,
  );

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
          <ModelStep
            loadingApiKeys={loadingApiKeys}
            savedModels={savedModels}
            selectedSavedModelId={selectedSavedModelId}
            modelConfig={{
              name: config.model.name,
              accessMethod: config.model.accessMethod,
              endpointUrl: config.model.endpointUrl,
              apiKey: config.model.apiKey,
            }}
            modelInventories={modelInventories}
            selectedModelInventoryId={selectedModelInventoryId}
            fieldsRef={formFieldsRef}
            getProviderModels={getProviderModels}
            getSavedModelIds={(providerId) =>
              getSavedModelsForProvider(providerId).map((m) => m.name)
            }
            hasApiKey={hasApiKey}
            savedKeyRejected={savedKeyRejected}
            onProviderSelect={(providerId) => {
              setSelectedSavedModelId(null);
              setConfig((prev) => ({
                ...prev,
                model: {
                  ...prev.model,
                  accessMethod: providerId,
                  name: "",
                },
              }));
            }}
            onModelNameChange={(name) => {
              // A model chosen in the picker replaces a saved model picked above it
              setSelectedSavedModelId(null);
              setConfig((prev) => ({
                ...prev,
                model: { ...prev.model, name },
              }));
            }}
            onEndpointUrlChange={(url) =>
              setConfig((prev) => ({
                ...prev,
                model: { ...prev.model, endpointUrl: url },
              }))
            }
            onApiKeyChange={(key) =>
              setConfig((prev) => ({
                ...prev,
                model: { ...prev.model, apiKey: key },
              }))
            }
            onSavedModelSelect={setSelectedSavedModelId}
            onModelInventoryChange={setSelectedModelInventoryId}
          />
        );

      case 1:
        // Step 2: Dataset
        return (
          <DatasetStep
            taskType={config.taskType}
            useBuiltin={config.dataset.useBuiltin}
            userDatasets={userDatasets}
            selectedUserDataset={selectedUserDataset}
            loadingUserDatasets={loadingUserDatasets}
            uploadingDataset={uploadingDataset}
            selectedPresetPath={selectedPresetPath}
            datasetPromptCount={datasetPrompts.length}
            orgId={orgId}
            projectId={projectId}
            onUploadingChange={setUploadingDataset}
            onAlert={({ variant, title, body, autoHideMs }) => {
              setAlert({ show: true, variant, title, body });
              setTimeout(() => setAlert(null), autoHideMs);
            }}
            onUploadComplete={(dataset, prompts) => {
              setUserDatasets((prev) => [dataset, ...prev]);
              setSelectedUserDataset(dataset);
              setConfig((prev) => ({
                ...prev,
                dataset: { ...prev.dataset, useBuiltin: false },
              }));
              if (prompts !== null) {
                setDatasetPrompts(prompts);
              } else {
                setDatasetPrompts([]);
              }
            }}
            onUserDatasetSelect={(dataset, prompts) => {
              setConfig((prev) => ({
                ...prev,
                dataset: { ...prev.dataset, useBuiltin: false },
              }));
              setSelectedUserDataset(dataset);
              setSelectedPresetPath("");
              if (prompts !== null) {
                setDatasetPrompts(prompts);
              } else {
                setDatasetPrompts([]);
              }
            }}
            onPresetSelect={(path, prompts) => {
              setConfig((prev) => ({
                ...prev,
                dataset: { ...prev.dataset, useBuiltin: true },
              }));
              setSelectedUserDataset(null);
              setSelectedPresetPath(path);
              if (prompts !== null) {
                setDatasetPrompts(prompts);
              } else {
                setDatasetPrompts([]);
              }
            }}
          />
        );

      case 2:
        // Step 3: Scorer / Judge - Choose evaluation method
        return (
          <Stack spacing="16px">
            {/* Evaluation method; the default (standard judge) comes first */}
            <Stack spacing="8px">
              <SelectableCard
                isSelected={judgeMode === "standard"}
                onClick={() => {
                  setJudgeMode("standard");
                  setSelectedScorer(null);
                }}
                icon={
                  <Settings
                    size={14}
                    color={
                      judgeMode === "standard" ? palette.brand.primary : palette.text.secondary
                    }
                  />
                }
                title="Standard judge only"
                description="Use built-in metrics with fixed evaluation criteria"
              />
              <SelectableCard
                isSelected={judgeMode === "scorer"}
                onClick={() => {
                  setJudgeMode("scorer");
                  setConfig((prev) => ({ ...prev, judgeLlm: { ...prev.judgeLlm, provider: "" } }));
                }}
                icon={
                  <Sparkles
                    size={14}
                    color={judgeMode === "scorer" ? palette.brand.primary : palette.text.secondary}
                  />
                }
                title="Custom scorer only"
                description="Use your own prompts for domain-specific evaluation"
              />
              <SelectableCard
                isSelected={judgeMode === "both"}
                onClick={() => setJudgeMode("both")}
                icon={
                  <Layers
                    size={14}
                    color={judgeMode === "both" ? palette.brand.primary : palette.text.secondary}
                  />
                }
                title="Judge + scorer"
                description="Use both built-in metrics and your custom scorers"
              />
            </Stack>

            {/* Custom Scorers Section - shown for "scorer" and "both" modes */}
            {(judgeMode === "scorer" || judgeMode === "both") && (
              <Box>
                {loadingScorers ? (
                  <Box sx={{ py: "6px", textAlign: "center" }}>
                    <Typography sx={{ fontSize: "13px", color: palette.text.tertiary }}>
                      Loading your scorers...
                    </Typography>
                  </Box>
                ) : userScorers.length > 0 ? (
                  <Box>
                    <Stack
                      direction="row"
                      alignItems="center"
                      justifyContent="space-between"
                      sx={{ mb: "8px" }}
                    >
                      <SectionLabel noMargin>Your scorers</SectionLabel>
                      <Stack direction="row" spacing="4px">
                        <CustomizableButton
                          size="small"
                          variant="text"
                          onClick={() => {
                            if (selectedScorerIds.length === userScorers.length) {
                              setSelectedScorerIds([]);
                            } else {
                              setSelectedScorerIds(userScorers.map((s) => s.id));
                            }
                          }}
                          text={
                            selectedScorerIds.length === userScorers.length
                              ? "Clear all"
                              : "Select all"
                          }
                        />
                        <CustomizableButton
                          size="small"
                          variant="text"
                          startIcon={<ExternalLink size={14} strokeWidth={1.5} />}
                          onClick={() => window.open(`/evals/${projectId}#scorers`, "_blank")}
                          text="Manage scorers"
                        />
                      </Stack>
                    </Stack>
                    <Stack spacing="8px">
                      {userScorers.map((scorer) => {
                        const isSelected = selectedScorerIds.includes(scorer.id);
                        const modelName =
                          typeof scorer.config?.judgeModel === "string"
                            ? scorer.config.judgeModel
                            : scorer.config?.judgeModel?.name ||
                              scorer.config?.model ||
                              "LLM judge";
                        return (
                          <SelectableCard
                            key={scorer.id}
                            isSelected={isSelected}
                            onClick={() => {
                              setSelectedScorerIds((prev) =>
                                prev.includes(scorer.id)
                                  ? prev.filter((id) => id !== scorer.id)
                                  : [...prev, scorer.id],
                              );
                            }}
                            icon={
                              <Sparkles
                                size={14}
                                color={isSelected ? palette.brand.primary : palette.text.tertiary}
                              />
                            }
                            title={scorer.name}
                            description={`${modelName} • ${scorer.metricKey}`}
                          />
                        );
                      })}
                    </Stack>
                    <FormHelperText
                      sx={{ mt: "2px", fontSize: "12px", color: palette.text.tertiary }}
                    >
                      {selectedScorerIds.length > 0
                        ? `${countLabel(selectedScorerIds.length, "scorer")} selected. Only these will run during evaluation.`
                        : "No scorers selected. All enabled scorers will run if none are selected."}
                    </FormHelperText>
                    {missingKeyProviders.length > 0 && (
                      <Box
                        sx={{
                          mt: "8px",
                          p: "8px 10px",
                          borderRadius: "4px",
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
                            LLM Evals settings
                          </span>{" "}
                          before running the experiment.
                        </Typography>
                      </Box>
                    )}
                  </Box>
                ) : (
                  <Box
                    sx={{
                      py: "24px",
                      px: "16px",
                      textAlign: "center",
                      border: `1px dashed ${palette.border.dark}`,
                      borderRadius: "4px",
                    }}
                  >
                    <Sparkles size={32} color={palette.border.dark} style={{ marginBottom: 8 }} />
                    <Typography sx={{ fontSize: "14px", color: palette.text.tertiary, mb: "2px" }}>
                      No custom scorers yet
                    </Typography>
                    <Typography sx={{ fontSize: "13px", color: palette.text.tertiary, mb: "12px" }}>
                      Create a scorer to use custom evaluation criteria
                    </Typography>
                    <CustomizableButton
                      size="small"
                      variant="outlined"
                      startIcon={<Plus size={14} strokeWidth={1.5} />}
                      onClick={() => window.open(`/evals/${projectId}#scorers`, "_blank")}
                      text="Create scorer"
                    />
                  </Box>
                )}
              </Box>
            )}

            {/* Divider between sections when in "both" mode */}
            {judgeMode === "both" && (
              <Box sx={{ pt: "4px" }}>
                <Divider sx={{ mb: "4px" }} />
                <SectionLabel>Standard judge</SectionLabel>
              </Box>
            )}

            {/* Standard Judge Section - shown for "standard" and "both" modes */}
            {(judgeMode === "standard" || judgeMode === "both") && (
              <>
                {judgeMode === "standard" && <SectionLabel>Judge provider</SectionLabel>}
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
                            }}
                            sx={{
                              "cursor": "pointer",
                              "border": "1px solid",
                              "borderColor": isSelected
                                ? palette.brand.primary
                                : palette.border.dark,
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
                                  <Check
                                    size={12}
                                    color={palette.background.main}
                                    strokeWidth={3}
                                  />
                                </Box>
                              )}

                              {/* Provider Logo */}
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
                    <Stack spacing="6px">
                      {/* Model Selection - Dropdown for cloud providers, text input for local/OpenRouter */}
                      {PROVIDERS[config.judgeLlm.provider] ? (
                        /* Cloud judges, OpenRouter included: the gateway catalog, any ID typed */
                        <ModelPicker
                          value={config.judgeLlm.model}
                          onChange={(model) =>
                            setConfig((prev) => ({
                              ...prev,
                              judgeLlm: { ...prev.judgeLlm, model },
                            }))
                          }
                          models={getProviderModels(config.judgeLlm.provider)}
                          savedModelIds={getSavedModelsForProvider(config.judgeLlm.provider).map(
                            (m) => m.name,
                          )}
                          placeholder={
                            config.judgeLlm.provider === "openrouter"
                              ? "Search or type an ID, e.g. openai/gpt-4o"
                              : "Search or type a model ID"
                          }
                          testId="judge"
                        />
                      ) : (
                        /* Local judge providers (Ollama, HuggingFace, Custom / Self-hosted) */
                        (() => {
                          const isCustom = config.judgeLlm.provider === "custom_api";
                          const judgeSaved = getProviderModels(config.judgeLlm.provider);
                          const placeholder =
                            config.judgeLlm.provider === "ollama"
                              ? "e.g., llama2, mistral, codellama"
                              : isCustom
                                ? "e.g., llama3.2, mistral, gpt-4"
                                : "e.g., gpt-4, claude-3-opus";

                          return (
                            <Stack spacing="4px">
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
                                  // The OpenAI-compatible base URL; /chat/completions is added
                                  placeholder="http://localhost:8000/v1"
                                />
                              )}

                              {/* Saved names first when there are any; any name can be typed */}
                              {judgeSaved.length > 0 ? (
                                <ModelPicker
                                  label="Model name"
                                  value={config.judgeLlm.model}
                                  onChange={(model) =>
                                    setConfig((prev) => ({
                                      ...prev,
                                      judgeLlm: { ...prev.judgeLlm, model },
                                    }))
                                  }
                                  models={judgeSaved}
                                  savedModelIds={judgeSaved.map((m) => m.id)}
                                  placeholder={placeholder}
                                  testId="judge"
                                />
                              ) : (
                                <Field
                                  label="Model name"
                                  value={config.judgeLlm.model}
                                  onChange={(e) =>
                                    setConfig((prev) => ({
                                      ...prev,
                                      judgeLlm: { ...prev.judgeLlm, model: e.target.value },
                                    }))
                                  }
                                  placeholder={placeholder}
                                />
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
                      {selectedProvider?.needsApiKey &&
                        (hasApiKey(config.judgeLlm.provider) ? (
                          <Box
                            sx={{
                              p: "8px 10px",
                              backgroundColor: palette.status.success.bg,
                              borderRadius: "4px",
                              border: `1px solid ${palette.status.success.border}`,
                            }}
                          >
                            <Stack direction="row" alignItems="center" spacing="6px">
                              <Check size={14} color={palette.status.success.text} />
                              <Typography
                                sx={{ fontSize: "12px", color: palette.status.success.text }}
                              >
                                Uses your saved API key
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
                            helperText={apiKeyHelperText(
                              savedKeyRejected(config.judgeLlm.provider),
                            )}
                          />
                        ))}
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
            <Stack spacing="6px">
              <Box
                sx={{
                  p: "8px",
                  textAlign: "center",
                  border: `1px solid ${palette.border.dark}`,
                  borderRadius: "4px",
                  backgroundColor: palette.background.accent,
                }}
              >
                <Typography
                  sx={{
                    fontSize: "15px",
                    fontWeight: 600,
                    color: palette.text.secondary,
                    mb: "2px",
                  }}
                >
                  No metrics available
                </Typography>
                <Typography
                  variant="body2"
                  color="text.secondary"
                  sx={{ maxWidth: 400, mx: "auto" }}
                >
                  Standard metrics require a Judge LLM.
                  <br /> Your custom scorer will be used instead.
                </Typography>
              </Box>

              {/* Experiment name */}
              <Field
                label="Experiment name"
                value={experimentName}
                placeholder={defaultExperimentName}
                onChange={(e) => setExperimentName(e.target.value)}
                helperText="Leave blank to use the suggested name. We append #2, #3, ... for re-runs of the same model + dataset."
              />

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
                    <Typography
                      sx={{ fontSize: "13px", fontWeight: 500, color: palette.brand.primary }}
                    >
                      Estimated time: {getEstimatedTimeRange(datasetPrompts.length)}
                    </Typography>
                    <Typography sx={{ fontSize: "12px", color: palette.status.success.text }}>
                      Based on {datasetPrompts.length} prompt
                      {datasetPrompts.length !== 1 ? "s" : ""} in your dataset
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
                <Box sx={{ mt: "3px", mb: "6px" }}>
                  <Chip
                    label="Multi-turn dataset"
                    size="small"
                    backgroundColor={palette.accent.blue.bg}
                    textColor={palette.accent.blue.text}
                  />
                </Box>
              )}
            </Box>

            {/* Conversational metrics - For Multi-turn Datasets */}
            {isMultiTurnDataset && (
              <Accordion
                defaultExpanded
                disableGutters
                elevation={0}
                sx={{
                  "border": `1px solid ${palette.accent.blue.bg}`,
                  "borderRadius": "4px !important",
                  "backgroundColor": palette.accent.blue.bg,
                  "&:before": { display: "none" },
                  "&.Mui-expanded": { margin: 0 },
                }}
              >
                <AccordionSummary
                  expandIcon={<ChevronDown size={18} color={palette.accent.blue.text} />}
                  sx={{
                    "minHeight": 48,
                    "px": "8px",
                    "&.Mui-expanded": { minHeight: 48 },
                    "& .MuiAccordionSummary-content": { my: "8px" },
                  }}
                >
                  <Box>
                    <Typography
                      sx={{ fontSize: "14px", fontWeight: 600, color: palette.accent.blue.text }}
                    >
                      Conversational metrics
                    </Typography>
                    <Typography
                      variant="caption"
                      sx={{ mt: "1px", display: "block", color: palette.accent.blue.text }}
                    >
                      Designed for multi-turn conversation evaluation
                    </Typography>
                  </Box>
                </AccordionSummary>
                <AccordionDetails sx={{ px: "12px", pt: "12px", pb: "16px" }}>
                  <Stack spacing="5px">
                    {Object.entries({
                      turnRelevancy: {
                        label: METRIC_LABELS.turnRelevancy,
                        desc: "Evaluates if each assistant response is relevant to the user's input in that turn.",
                      },
                      knowledgeRetention: {
                        label: METRIC_LABELS.knowledgeRetention,
                        desc: "Checks if the model retains context and information across conversation turns.",
                      },
                      conversationCoherence: {
                        label: METRIC_LABELS.conversationCoherence,
                        desc: "Evaluates overall coherence, correctness, and logical consistency across turns.",
                      },
                      conversationHelpfulness: {
                        label: METRIC_LABELS.conversationHelpfulness,
                        desc: "Measures how helpful the assistant is in addressing the user's needs throughout.",
                      },
                      taskCompletion: {
                        label: METRIC_LABELS.taskCompletion,
                        desc: "Evaluates if the conversation successfully achieved the expected outcome.",
                      },
                      conversationSafety: {
                        label: METRIC_LABELS.conversationSafety,
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
                          sx={{
                            ml: "7px",
                            mt: "1px",
                            pr: "4px",
                            display: "block",
                            fontSize: "12px",
                            lineHeight: 1.4,
                          }}
                        >
                          {(meta as { desc: string }).desc}
                        </Typography>
                      </Box>
                    ))}
                  </Stack>
                  <Typography
                    sx={{ mt: "12px", fontSize: "12px", color: palette.accent.blue.text }}
                  >
                    Coherence, helpfulness, task completion and safety start unticked: they don't
                    return scores on multi-turn runs yet.
                  </Typography>
                </AccordionDetails>
              </Accordion>
            )}

            {/* Per-turn safety metrics (for multi-turn) */}
            {isMultiTurnDataset && (
              <Box
                sx={{
                  p: "12px",
                  border: `1px solid ${palette.border.light}`,
                  borderRadius: "4px",
                  backgroundColor: palette.background.accent,
                }}
              >
                <Typography
                  sx={{
                    fontSize: "14px",
                    fontWeight: 600,
                    color: palette.text.primary,
                    mb: "2px",
                  }}
                >
                  Per-turn safety metrics
                </Typography>
                <Typography
                  variant="caption"
                  sx={{ display: "block", mb: "8px", color: palette.text.secondary }}
                >
                  Bias and toxicity are scored on each assistant turn, then combined into one score
                </Typography>
                <Stack direction="row" spacing="8px">
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

            {/* Universal core metrics - For Single-turn Datasets */}
            {!isMultiTurnDataset && (
              <Accordion
                defaultExpanded
                disableGutters
                elevation={0}
                sx={{
                  "border": `1px solid ${palette.border.dark}`,
                  "borderRadius": "4px !important",
                  "&:before": { display: "none" },
                  "&.Mui-expanded": { margin: 0 },
                }}
              >
                <AccordionSummary
                  expandIcon={<ChevronDown size={18} color={palette.text.tertiary} />}
                  sx={{
                    "minHeight": 48,
                    "px": "8px",
                    "&.Mui-expanded": { minHeight: 48 },
                    "& .MuiAccordionSummary-content": { my: "8px" },
                  }}
                >
                  <Box>
                    <Typography
                      sx={{ fontSize: "14px", fontWeight: 600, color: palette.text.secondary }}
                    >
                      Universal core metrics
                    </Typography>
                    <Typography
                      variant="caption"
                      color="text.secondary"
                      sx={{ mt: "1px", display: "block" }}
                    >
                      Runs for every use case (Chatbot, RAG, Agent)
                    </Typography>
                  </Box>
                </AccordionSummary>
                <AccordionDetails sx={{ px: "12px", pt: "12px", pb: "16px" }}>
                  <Stack spacing="5px">
                    {Object.entries({
                      answerRelevancy: {
                        label: METRIC_LABELS.answerRelevancy,
                        desc: "Measures how relevant the model's answer is to the input (GEval).",
                      },
                      correctness: {
                        label: METRIC_LABELS.correctness,
                        desc: "Evaluates factual accuracy of the model's response (GEval).",
                      },
                      completeness: {
                        label: METRIC_LABELS.completeness,
                        desc: "Checks if the response fully addresses all aspects of the query (GEval).",
                      },
                      hallucination: {
                        label: METRIC_LABELS.hallucination,
                        desc: "Detects fabricated or unsupported information in outputs (GEval).",
                      },
                      instructionFollowing: {
                        label: METRIC_LABELS.instructionFollowing,
                        desc: "Measures how well the model follows the given instructions.",
                      },
                      toxicity: {
                        label: METRIC_LABELS.toxicity,
                        desc: "Flags toxic or harmful language in outputs.",
                      },
                      bias: {
                        label: METRIC_LABELS.bias,
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
                          sx={{
                            ml: "7px",
                            mt: "1px",
                            pr: "4px",
                            display: "block",
                            fontSize: "12px",
                            lineHeight: 1.4,
                          }}
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
                <Typography
                  sx={{
                    fontSize: "14px",
                    fontWeight: 600,
                    color: palette.text.secondary,
                    mb: "3px",
                  }}
                >
                  RAG metrics
                </Typography>
                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{ display: "block", mb: "4px" }}
                >
                  Requires retrieval_context in your dataset
                </Typography>
                {Object.entries({
                  contextRelevancy: {
                    label: METRIC_LABELS.contextRelevancy,
                    desc: "Measures whether retrieved context is relevant to the query.",
                  },
                  contextPrecision: {
                    label: METRIC_LABELS.contextPrecision,
                    desc: "Evaluates if the retrieved context contains only relevant information.",
                  },
                  contextRecall: {
                    label: METRIC_LABELS.contextRecall,
                    desc: "Checks if all relevant information needed for the answer was retrieved.",
                  },
                  faithfulness: {
                    label: METRIC_LABELS.faithfulness,
                    desc: "Checks if the answer is grounded in the provided retrieval context.",
                  },
                }).map(([key, meta]) => (
                  <Box key={key} sx={{ mb: "3px" }}>
                    <Stack spacing="1px">
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
                        sx={{ ml: "8px", pr: "4px", display: "block", fontSize: "12px" }}
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
                <Typography
                  sx={{
                    fontSize: "14px",
                    fontWeight: 600,
                    color: palette.text.secondary,
                    mb: "3px",
                  }}
                >
                  Agent metrics
                </Typography>
                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{ display: "block", mb: "4px" }}
                >
                  Comprehensive agent evaluation based on{" "}
                  <a
                    href="https://deepeval.com/docs/getting-started-agents"
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ color: palette.accent.blue.text }}
                  >
                    DeepEval Agent Evaluation
                  </a>
                </Typography>

                {/* Reasoning Layer */}
                <Typography
                  sx={{
                    fontSize: "12px",
                    fontWeight: 600,
                    color: palette.text.tertiary,
                    mb: "2px",
                    mt: "4px",
                  }}
                >
                  Reasoning layer
                </Typography>
                {Object.entries({
                  planQuality: {
                    label: METRIC_LABELS.planQuality,
                    desc: "Evaluates task understanding, decomposition, and planning coherence.",
                  },
                  planAdherence: {
                    label: METRIC_LABELS.planAdherence,
                    desc: "Measures how well the agent follows its own plan during execution.",
                  },
                }).map(([key, meta]) => (
                  <Box key={key} sx={{ mb: "3px" }}>
                    <Stack spacing="1px">
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
                        sx={{ ml: "8px", pr: "4px", display: "block", fontSize: "12px" }}
                      >
                        {(meta as { desc: string }).desc}
                      </Typography>
                    </Stack>
                  </Box>
                ))}

                {/* Action Layer */}
                <Typography
                  sx={{
                    fontSize: "12px",
                    fontWeight: 600,
                    color: palette.text.tertiary,
                    mb: "2px",
                    mt: "4px",
                  }}
                >
                  Action layer
                </Typography>
                {Object.entries({
                  toolSelection: {
                    label: METRIC_LABELS.toolSelection,
                    desc: "Evaluates whether the agent selected the appropriate tool for the task.",
                  },
                  toolCorrectness: {
                    label: METRIC_LABELS.toolCorrectness,
                    desc: "Measures whether the agent used tools with correct parameters and sequence.",
                  },
                  argumentCorrectness: {
                    label: METRIC_LABELS.argumentCorrectness,
                    desc: "Evaluates if tool arguments are correctly typed, formatted, and extracted from context.",
                  },
                }).map(([key, meta]) => (
                  <Box key={key} sx={{ mb: "3px" }}>
                    <Stack spacing="1px">
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
                        sx={{ ml: "8px", pr: "4px", display: "block", fontSize: "12px" }}
                      >
                        {(meta as { desc: string }).desc}
                      </Typography>
                    </Stack>
                  </Box>
                ))}

                {/* Execution Layer */}
                <Typography
                  sx={{
                    fontSize: "12px",
                    fontWeight: 600,
                    color: palette.text.tertiary,
                    mb: "2px",
                    mt: "4px",
                  }}
                >
                  Execution layer
                </Typography>
                {Object.entries({
                  taskCompletion: {
                    label: METRIC_LABELS.taskCompletion,
                    desc: "Measures whether the agent successfully completed the requested task.",
                  },
                  stepEfficiency: {
                    label: METRIC_LABELS.stepEfficiency,
                    desc: "Evaluates if the agent completed the task with minimal unnecessary steps.",
                  },
                  actionRelevance: {
                    label: METRIC_LABELS.actionRelevance,
                    desc: "Checks if all agent actions directly contribute to the goal.",
                  },
                }).map(([key, meta]) => (
                  <Box key={key} sx={{ mb: "3px" }}>
                    <Stack spacing="1px">
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
                        sx={{ ml: "8px", pr: "4px", display: "block", fontSize: "12px" }}
                      >
                        {(meta as { desc: string }).desc}
                      </Typography>
                    </Stack>
                  </Box>
                ))}
              </Box>
            )}

            {/* Experiment name */}
            <Box sx={{ mt: "16px" }}>
              <Field
                label="Experiment name"
                value={experimentName}
                placeholder={defaultExperimentName}
                onChange={(e) => setExperimentName(e.target.value)}
                helperText="Leave blank to use the suggested name. We append #2, #3, ... for re-runs of the same model + dataset."
              />
            </Box>

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
                  <Typography
                    sx={{ fontSize: "13px", fontWeight: 500, color: palette.brand.primary }}
                  >
                    Estimated time: {getEstimatedTimeRange(datasetPrompts.length)}
                  </Typography>
                  <Typography sx={{ fontSize: "12px", color: palette.status.success.text }}>
                    {`Based on ${countLabel(datasetPrompts.length, "prompt")} in your dataset`}
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
  const missingKeyProviders = useMemo(
    () =>
      getMissingKeyProviders({
        judgeMode,
        selectedScorerIds,
        userScorers,
        configuredApiKeys,
      }),
    [judgeMode, selectedScorerIds, userScorers, configuredApiKeys],
  );

  const canProceed = canProceedToNextStep({
    activeStep,
    selectedSavedModelId,
    model: config.model,
    selectedModelProvider,
    hasApiKey,
    datasetPromptCount: datasetPrompts.length,
    judgeMode,
    userScorersCount: userScorers.length,
    missingKeyProviders,
    judgeLlm: config.judgeLlm,
  });

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
        steps={[...WIZARD_STEPS]}
        activeStep={activeStep}
        onNext={handleNext}
        onBack={handleBack}
        onSubmit={handleSubmit}
        isSubmitting={loading}
        canProceed={canProceed}
        submitButtonText="Start experiment"
        maxWidth="700px"
        width="700px"
        fixedHeight
        headerBadge={
          <Box
            sx={{
              display: "inline-flex",
              alignItems: "center",
              gap: "4px",
              px: "6px",
              py: "2px",
              borderRadius: "4px",
              backgroundColor:
                config.taskType === "agent"
                  ? palette.accent.purple.bg
                  : config.taskType === "rag"
                    ? palette.status.warning.bg
                    : palette.status.success.bg,
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
                fontSize: "12px",
                fontWeight: 600,
                color:
                  config.taskType === "agent"
                    ? palette.accent.purple.text
                    : config.taskType === "rag"
                      ? palette.status.warning.text
                      : palette.status.success.text,
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
