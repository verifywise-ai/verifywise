/**
 * Client-side API key format validation for LLM providers.
 * Validates key format only — no network calls.
 */

interface ValidationResult {
  valid: boolean;
  error?: string;
}

const PROVIDER_PATTERNS: Record<string, { pattern: RegExp; hint: string }> = {
  openai: {
    pattern: /^sk-(proj-)?[a-zA-Z0-9_-]{20,}$/,
    hint: "OpenAI keys start with sk- followed by 20+ alphanumeric characters",
  },
  anthropic: {
    pattern: /^sk-ant-[a-zA-Z0-9_-]{20,}$/,
    hint: "Anthropic keys start with sk-ant- followed by 20+ alphanumeric characters",
  },
  gemini: {
    pattern: /^AIza[a-zA-Z0-9_-]{30,}$/,
    hint: "Google Gemini keys start with AIza followed by 30+ characters",
  },
  xai: {
    pattern: /^xai-[a-zA-Z0-9_-]{20,}$/,
    hint: "xAI keys start with xai- followed by 20+ characters",
  },
  mistral: {
    pattern: /^[a-zA-Z0-9]{32,}$/,
    hint: "Mistral keys are 32+ alphanumeric characters",
  },
  openrouter: {
    pattern: /^sk-or-[a-zA-Z0-9_-]{20,}$/,
    hint: "OpenRouter keys start with sk-or- followed by 20+ characters",
  },
};

/**
 * Validate an API key's format for a given provider.
 * Returns { valid: true } if format is correct or provider is unknown.
 * Returns { valid: false, error: "..." } if format is wrong.
 */
export function validateApiKeyFormat(provider: string, apiKey: string): ValidationResult {
  const trimmed = apiKey.trim();
  if (!trimmed) {
    return { valid: false, error: "API key is required" };
  }

  const rule = PROVIDER_PATTERNS[provider.toLowerCase()];
  if (!rule) {
    // Unknown provider — skip format validation, allow through
    return { valid: true };
  }

  if (!rule.pattern.test(trimmed)) {
    return { valid: false, error: `Invalid key format. ${rule.hint}` };
  }

  return { valid: true };
}
