/**
 * @fileoverview Provider lists and logos for the New Experiment wizard.
 *
 * @module pages/EvalsDashboard/NewExperiment/providerConfig
 */

import type { ComponentType, SVGProps } from "react";
import { ReactComponent as OpenAILogo } from "../../../assets/icons/openai_logo.svg";
import { ReactComponent as AnthropicLogo } from "../../../assets/icons/anthropic_logo.svg";
import { ReactComponent as OllamaLogo } from "../../../assets/icons/ollama_logo.svg";
import { ReactComponent as GeminiLogo } from "../../../assets/icons/gemini_logo.svg";
import { ReactComponent as MistralLogo } from "../../../assets/icons/mistral_logo.svg";
import { ReactComponent as XAILogo } from "../../../assets/icons/xai_logo.svg";
import { ReactComponent as OpenRouterLogo } from "../../../assets/icons/openrouter_logo.svg";
import { ReactComponent as FolderFilledIcon } from "../../../assets/icons/folder_filled.svg";
import { BuildIcon, HuggingFaceLogo } from "./experimentIcons";
import type { ProviderType } from "./newExperimentConfig";

export type ProviderLogo = ComponentType<SVGProps<SVGSVGElement>>;

export interface ProviderEntry {
  id: ProviderType;
  name: string;
  Logo: ProviderLogo;
  needsApiKey: boolean;
  needsUrl?: boolean;
}

/** Cloud providers that have a LiteLLM / AI Gateway catalog entry. */
export const CLOUD_PROVIDER_IDS = [
  "openai",
  "anthropic",
  "google",
  "mistral",
  "xai",
  "openrouter",
] as const;

export const OPENROUTER_POPULAR_MODELS = [
  { id: "openai/gpt-4o", name: "GPT-4o" },
  { id: "anthropic/claude-3.5-sonnet", name: "Claude 3.5 Sonnet" },
  { id: "google/gemini-pro-1.5", name: "Gemini Pro 1.5" },
  { id: "meta-llama/llama-3.1-70b-instruct", name: "Llama 3.1 70B" },
  { id: "mistralai/mistral-large", name: "Mistral Large" },
] as const;

/** Cloud providers that need API keys. */
export const cloudProviders: readonly ProviderEntry[] = [
  {
    id: "openrouter",
    name: "OpenRouter",
    Logo: OpenRouterLogo,
    needsApiKey: true,
  },
  { id: "openai", name: "OpenAI", Logo: OpenAILogo, needsApiKey: true },
  { id: "anthropic", name: "Anthropic", Logo: AnthropicLogo, needsApiKey: true },
  { id: "google", name: "Gemini", Logo: GeminiLogo, needsApiKey: true },
  { id: "xai", name: "xAI", Logo: XAILogo, needsApiKey: true },
  { id: "mistral", name: "Mistral", Logo: MistralLogo, needsApiKey: true },
];

/** Local / self-hosted providers that do not require a cloud API key by default. */
export const localProviders: readonly ProviderEntry[] = [
  {
    id: "huggingface",
    name: "HuggingFace",
    Logo: HuggingFaceLogo,
    needsApiKey: false,
  },
  { id: "ollama", name: "Ollama", Logo: OllamaLogo, needsApiKey: false },
  {
    id: "custom_api",
    name: "Custom / Self-hosted",
    Logo: BuildIcon,
    needsApiKey: false,
  },
];

/** Providers available for judge selection (cloud + local, no bare "Local" entry). */
export const availableJudgeProviders: readonly ProviderEntry[] = [
  ...cloudProviders,
  ...localProviders,
];

/** All model-under-test providers, including the Local (needsUrl) entry. */
export const allModelProviders: readonly ProviderEntry[] = [
  ...cloudProviders.map((p) => ({ ...p, needsUrl: false })),
  ...localProviders.map((p) => ({ ...p, needsUrl: false })),
  {
    id: "local",
    name: "Local",
    Logo: FolderFilledIcon,
    needsApiKey: false,
    needsUrl: true,
  },
];

export const availableModelProviders = allModelProviders;
