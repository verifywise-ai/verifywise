import { validateApiKeyFormat } from "../apiKeyValidation";

describe("validateApiKeyFormat", () => {
  // OpenAI
  it("accepts a valid sk- OpenAI key", () => {
    expect(validateApiKeyFormat("openai", "sk-abcdefghijklmnopqrst")).toBeNull();
  });

  it("accepts a valid sk-proj- OpenAI key", () => {
    expect(validateApiKeyFormat("openai", "sk-proj-abcdefghijklmnopqrst")).toBeNull();
  });

  it("rejects a truncated OpenAI key", () => {
    expect(validateApiKeyFormat("openai", "sk-short")).not.toBeNull();
  });

  it("rejects a half-pasted OpenAI key without prefix", () => {
    expect(validateApiKeyFormat("openai", "abcdefghijklmnopqrstuvwxyz")).not.toBeNull();
  });

  // Anthropic
  it("accepts a valid Anthropic key", () => {
    expect(validateApiKeyFormat("anthropic", "sk-ant-api03-abcdefghijklmnopqrstu")).toBeNull();
  });

  it("rejects an Anthropic key missing the sk-ant- prefix", () => {
    expect(validateApiKeyFormat("anthropic", "sk-abcdefghijklmnopqrstu")).not.toBeNull();
  });

  // Google / Gemini
  it("accepts a valid Google Gemini key for gemini provider", () => {
    expect(validateApiKeyFormat("gemini", "AIzaABCDEFGHIJKLMNOPQRSTUVWXYZ12345678")).toBeNull();
  });

  it("rejects a Gemini key without AIza prefix", () => {
    expect(validateApiKeyFormat("gemini", "badkeyABCDEFGHIJKLMNOPQRSTUVWXYZ12345678")).not.toBeNull();
  });

  // xAI
  it("accepts a valid xAI key", () => {
    expect(validateApiKeyFormat("xai", "xai-abcdefghijklmnopqrstu")).toBeNull();
  });

  it("rejects an xAI key without xai- prefix", () => {
    expect(validateApiKeyFormat("xai", "notxai-abcdefghijklmno")).not.toBeNull();
  });

  // Mistral
  it("accepts a valid Mistral key (32+ alphanum chars)", () => {
    expect(validateApiKeyFormat("mistral", "abcdefghijklmnopqrstuvwxyz123456")).toBeNull();
  });

  it("rejects a short Mistral key", () => {
    expect(validateApiKeyFormat("mistral", "tooshort")).not.toBeNull();
  });

  // OpenRouter
  it("accepts a valid OpenRouter key", () => {
    expect(validateApiKeyFormat("openrouter", "sk-or-v1-" + "a".repeat(40))).toBeNull();
  });

  it("rejects an OpenRouter key with wrong prefix", () => {
    expect(validateApiKeyFormat("openrouter", "sk-" + "a".repeat(40))).not.toBeNull();
  });

  // Unknown / unvalidated providers
  it("returns null for unknown providers (bedrock, azure, cohere)", () => {
    expect(validateApiKeyFormat("bedrock", "any-key-format")).toBeNull();
    expect(validateApiKeyFormat("azure", "any-key-format")).toBeNull();
    expect(validateApiKeyFormat("cohere", "any-key-format")).toBeNull();
  });

  // Whitespace trimming
  it("accepts a key with leading/trailing whitespace by trimming it", () => {
    expect(validateApiKeyFormat("openai", "  sk-abcdefghijklmnopqrst  ")).toBeNull();
  });
});
