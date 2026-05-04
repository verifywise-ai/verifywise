export type LLMProviderId = "anthropic" | "openai" | "openrouter" | "custom";

// Display names for providers (used in forms and UI)
export type LLMProviderName = "Anthropic" | "OpenAI" | "OpenRouter" | "Custom";

interface LLMKeysData {
  id: number;
  name: LLMProviderName;
  key: string;
  url?: string | null;
  model: string;
  custom_headers?: Record<string, string> | null;
  created_at?: string;
}

export interface LLMKeysFormData {
  name: LLMProviderName;
  key: string;
  model: string;
  url?: string | null;
  custom_headers?: Record<string, string> | null;
}

export interface LLMProviderConfig {
  id: LLMProviderId;
  name: LLMProviderName;
  keyPrefix: string;
  keyPlaceholder: string;
  apiKeyUrl: string;
}

export class LLMKeysModel {
  id!: number;
  name!: LLMProviderName;
  key!: string;
  url?: string | null;
  model!: string;
  custom_headers?: Record<string, string> | null;
  created_at?: string;

  constructor(data: LLMKeysData) {
    this.id = data.id;
    this.name = data.name;
    this.key = data.key;
    this.url = data.url;
    this.model = data.model;
    this.custom_headers = data.custom_headers;
    this.created_at = data.created_at;
  }

  static createNewKey(data: LLMKeysModel): LLMKeysModel {
    return new LLMKeysModel(data);
  }

  getFormattedCreatedDate(): string {
    return new Date(this.created_at ?? "").toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  }

  /**
   * Provider configurations with API key info
   */
  static readonly PROVIDER_CONFIGS: LLMProviderConfig[] = [
    {
      id: "anthropic",
      name: "Anthropic",
      keyPrefix: "sk-ant-",
      keyPlaceholder: "sk-ant-api03-...",
      apiKeyUrl: "https://console.anthropic.com/settings/keys",
    },
    {
      id: "openai",
      name: "OpenAI",
      keyPrefix: "sk-",
      keyPlaceholder: "sk-proj-...",
      apiKeyUrl: "https://platform.openai.com/api-keys",
    },
    {
      id: "openrouter",
      name: "OpenRouter",
      keyPrefix: "sk-or-",
      keyPlaceholder: "sk-or-v1-...",
      apiKeyUrl: "https://openrouter.ai/keys",
    },
    {
      id: "custom",
      name: "Custom",
      keyPrefix: "",
      keyPlaceholder: "Enter your API key",
      apiKeyUrl: "",
    },
  ];

  static getAvailableProviders(): LLMProviderName[] {
    return this.PROVIDER_CONFIGS.map((p) => p.name);
  }

  static getProviderConfig(name: LLMProviderName): LLMProviderConfig | undefined {
    return this.PROVIDER_CONFIGS.find((p) => p.name === name);
  }

  static getProviderIdByName(name: LLMProviderName): LLMProviderId | undefined {
    return this.PROVIDER_CONFIGS.find((p) => p.name === name)?.id;
  }
}
