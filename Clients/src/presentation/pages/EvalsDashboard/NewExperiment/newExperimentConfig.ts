/**
 * @fileoverview Shared constants for the New Experiment wizard.
 *
 * @module pages/EvalsDashboard/NewExperiment/newExperimentConfig
 */

export type ProviderType =
  | "openai"
  | "anthropic"
  | "google"
  | "xai"
  | "huggingface"
  | "mistral"
  | "ollama"
  | "local"
  | "custom_api"
  | "openrouter";

export type JudgeMode = "scorer" | "standard" | "both";

/** Step labels shown in the StepperModal header. */
export const WIZARD_STEPS = ["Model", "Dataset", "Scorer / Judge", "Metrics"] as const;

/**
 * Model-under-evaluation providers that do not require a cloud API key
 * (local runtimes / on-prem). Used by step-0 gating.
 */
export const MODEL_PROVIDERS_WITHOUT_API_KEY = ["ollama", "local"] as const;

/**
 * Scorer judge-model providers that do not require a saved org API key.
 * Used when computing missing keys for custom scorers.
 */
export const SCORER_PROVIDERS_WITHOUT_API_KEY = ["self-hosted", "ollama"] as const;
