import { describe, it, expect } from "vitest";
import { validateApiKeyFormat } from "../apiKeyValidation";

describe("validateApiKeyFormat", () => {
  it("returns error for empty key", () => {
    const result = validateApiKeyFormat("openai", "");
    expect(result.valid).toBe(false);
    expect(result.error).toBe("API key is required");
  });

  it("returns error for whitespace-only key", () => {
    const result = validateApiKeyFormat("openai", "   ");
    expect(result.valid).toBe(false);
    expect(result.error).toBe("API key is required");
  });

  it("returns valid for unknown provider", () => {
    const result = validateApiKeyFormat("unknown-provider", "anything-works");
    expect(result.valid).toBe(true);
  });

  it("accepts valid OpenAI key", () => {
    const result = validateApiKeyFormat("openai", "sk-proj-abcdef1234567890abcdef1234");
    expect(result.valid).toBe(true);
  });

  it("accepts valid OpenAI key without proj- prefix", () => {
    const result = validateApiKeyFormat("openai", "sk-abcdef1234567890abcdef1234");
    expect(result.valid).toBe(true);
  });

  it("rejects invalid OpenAI key", () => {
    const result = validateApiKeyFormat("openai", "invalid-key");
    expect(result.valid).toBe(false);
    expect(result.error).toContain("Invalid key format");
  });

  it("accepts valid Anthropic key", () => {
    const result = validateApiKeyFormat("anthropic", "sk-ant-abcdef1234567890abcdef1234");
    expect(result.valid).toBe(true);
  });

  it("rejects invalid Anthropic key", () => {
    const result = validateApiKeyFormat("anthropic", "sk-invalid-abc");
    expect(result.valid).toBe(false);
  });

  it("accepts valid Gemini key", () => {
    const result = validateApiKeyFormat("gemini", "AIza0123456789012345678901234567890123");
    expect(result.valid).toBe(true);
  });

  it("rejects invalid Gemini key", () => {
    const result = validateApiKeyFormat("gemini", "xxxxx");
    expect(result.valid).toBe(false);
  });

  it("accepts valid xAI key", () => {
    const result = validateApiKeyFormat("xai", "xai-abcdef1234567890abcdef1234");
    expect(result.valid).toBe(true);
  });

  it("accepts valid Mistral key", () => {
    const result = validateApiKeyFormat("mistral", "abcdef1234567890abcdef1234567890ab");
    expect(result.valid).toBe(true);
  });

  it("rejects short Mistral key", () => {
    const result = validateApiKeyFormat("mistral", "short");
    expect(result.valid).toBe(false);
  });

  it("accepts valid OpenRouter key", () => {
    const result = validateApiKeyFormat("openrouter", "sk-or-abcdef1234567890abcdef1234");
    expect(result.valid).toBe(true);
  });

  it("trims whitespace from key", () => {
    const result = validateApiKeyFormat("openai", "  sk-abcdef1234567890abcdef1234  ");
    expect(result.valid).toBe(true);
  });

  it("is case-insensitive for provider", () => {
    const result = validateApiKeyFormat("OpenAI", "sk-abcdef1234567890abcdef1234");
    expect(result.valid).toBe(true);
  });
});
