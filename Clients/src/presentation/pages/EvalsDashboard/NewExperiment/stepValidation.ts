/**
 * @fileoverview Pure gating helpers for the New Experiment wizard Next button.
 *
 * @module pages/EvalsDashboard/NewExperiment/stepValidation
 */

import {
  JudgeMode,
  MODEL_PROVIDERS_WITHOUT_API_KEY,
  SCORER_PROVIDERS_WITHOUT_API_KEY,
} from "./newExperimentConfig";

export interface ScorerForValidation {
  id: string;
  config?: {
    judgeModel?: { provider?: string } | string | null;
  } | null;
}

export interface ApiKeyForValidation {
  provider: string;
}

export interface ModelConfigForValidation {
  name: string;
  accessMethod: string;
  endpointUrl: string;
  apiKey: string;
}

export interface JudgeLlmConfigForValidation {
  provider: string;
  model: string;
  endpointUrl: string;
}

export interface ModelProviderForValidation {
  needsUrl?: boolean;
}

/**
 * Providers required by selected scorers that have no saved API key in org
 * settings. Self-hosted / Ollama scorers are excluded since they don't need a
 * cloud key.
 */
export function getMissingKeyProviders(params: {
  judgeMode: JudgeMode;
  selectedScorerIds: string[];
  userScorers: ScorerForValidation[];
  configuredApiKeys: ApiKeyForValidation[];
}): string[] {
  const { judgeMode, selectedScorerIds, userScorers, configuredApiKeys } = params;
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
      if (
        !(SCORER_PROVIDERS_WITHOUT_API_KEY as readonly string[]).includes(provider) &&
        !configuredApiKeys.some((k) => k.provider === provider) &&
        !missing.includes(provider)
      ) {
        missing.push(provider);
      }
    }
  }
  return missing;
}

export function canProceedToNextStep(params: {
  activeStep: number;
  selectedSavedModelId: string | null;
  model: ModelConfigForValidation;
  selectedModelProvider?: ModelProviderForValidation | null;
  hasApiKey: (providerId: string) => boolean;
  datasetPromptCount: number;
  judgeMode: JudgeMode;
  userScorersCount: number;
  missingKeyProviders: string[];
  judgeLlm: JudgeLlmConfigForValidation;
}): boolean {
  const {
    activeStep,
    selectedSavedModelId,
    model,
    selectedModelProvider,
    hasApiKey,
    datasetPromptCount,
    judgeMode,
    userScorersCount,
    missingKeyProviders,
    judgeLlm,
  } = params;

  if (activeStep === 0) {
    // A saved model selection is always sufficient to proceed
    if (selectedSavedModelId) return true;

    // Step 1: Model validation
    const hasName = !!model.name;
    const hasAccessMethod = !!model.accessMethod;
    if (!hasName || !hasAccessMethod) return false;

    // Check conditional fields based on access method
    if (selectedModelProvider?.needsUrl && !model.endpointUrl) return false;

    // For all cloud providers (including custom_api), require either a saved
    // API key OR an entered API key
    if (!(MODEL_PROVIDERS_WITHOUT_API_KEY as readonly string[]).includes(model.accessMethod)) {
      // Map custom_api to "custom" for checking saved keys
      const providerForKeyCheck =
        model.accessMethod === "custom_api" ? "custom" : model.accessMethod;
      const hasSavedKey = hasApiKey(providerForKeyCheck);
      const hasEnteredKey = !!model.apiKey;
      if (!hasSavedKey && !hasEnteredKey) return false;
    }

    return true;
  }

  if (activeStep === 1) {
    // Step 2: Dataset validation - must have loaded prompts
    return datasetPromptCount > 0;
  }

  if (activeStep === 2) {
    // Step 3: Scorer / Judge validation
    if (judgeMode === "scorer") {
      // Custom scorer only - must have at least one scorer and all required API keys
      if (userScorersCount === 0) return false;
      if (missingKeyProviders.length > 0) return false;
      return true;
    }

    if (judgeMode === "standard") {
      // Standard judge only - must have provider and model (API key is from saved settings)
      const hasBase = !!(judgeLlm.provider && judgeLlm.model);
      // Custom / Self-hosted also requires endpoint URL
      if (judgeLlm.provider === "custom_api") {
        return hasBase && !!judgeLlm.endpointUrl;
      }
      return hasBase;
    }

    // Both mode - scorers exist, all scorer API keys present, AND standard judge configured
    const hasScorers = userScorersCount > 0;
    if (missingKeyProviders.length > 0) return false;
    let hasJudge = !!(judgeLlm.provider && judgeLlm.model);
    if (judgeLlm.provider === "custom_api") {
      hasJudge = hasJudge && !!judgeLlm.endpointUrl;
    }
    return hasScorers && hasJudge;
  }

  return true;
}
