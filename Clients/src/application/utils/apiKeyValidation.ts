/**
 * Client-side API key format validation for AI Gateway provider keys.
 * Patterns are consistent with those used in the broader VerifyWise codebase.
 *
 * Returns null if the key is valid (or the provider has no known pattern).
 * Returns an error message string if the key is invalid.
 */

const PROVIDER_KEY_PATTERNS: Record<string, { pattern: RegExp; description: string }> = {
  openai: {
    pattern: /^sk-(proj-)?[a-zA-Z0-9_-]{20,}$/,
    description: 'OpenAI keys start with "sk-" or "sk-proj-" followed by 20+ characters',
  },
  anthropic: {
    pattern: /^sk-ant-(api\d+-)?[a-zA-Z0-9_-]{20,}$/,
    description: 'Anthropic keys start with "sk-ant-" (e.g. "sk-ant-api03-...")',
  },
  gemini: {
    pattern: /^AIza[a-zA-Z0-9_-]{35,}$/,
    description: 'Google Gemini keys start with "AIza"',
  },
  xai: {
    pattern: /^xai-[a-zA-Z0-9_-]{20,}$/,
    description: 'xAI keys start with "xai-"',
  },
  mistral: {
    pattern: /^[a-zA-Z0-9]{32,}$/,
    description: 'Mistral keys are alphanumeric strings of 32+ characters',
  },
  openrouter: {
    pattern: /^sk-or-v1-[a-zA-Z0-9]{40,}$/,
    description: 'OpenRouter keys start with "sk-or-v1-"',
  },
};

/**
 * Validate the format of a provider API key.
 * @returns null if valid (or no pattern exists for this provider), error message if invalid.
 */
export function validateApiKeyFormat(provider: string, apiKey: string): string | null {
  const config = PROVIDER_KEY_PATTERNS[provider.toLowerCase()];
  if (!config) return null; // no pattern → skip format validation

  const trimmed = apiKey.trim();
  if (!config.pattern.test(trimmed)) {
    return `Invalid ${provider} API key format. ${config.description}.`;
  }
  return null;
}
