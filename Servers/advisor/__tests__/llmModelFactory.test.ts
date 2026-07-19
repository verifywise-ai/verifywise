const mockChat = jest.fn((..._a: any[]) => "chat-model");
// Typed as rest-parameter fns so the spread call sites below typecheck: a
// zero-arg jest.fn() cannot receive `...a: any[]` (TS2556).
const mockOpenAIFactory = jest.fn((..._a: any[]) => {
  const f: any = jest.fn((..._m: any[]) => "responses-model");
  f.chat = mockChat;
  return f;
});
const mockAnthropicFactory = jest.fn((..._a: any[]) => jest.fn((..._m: any[]) => "anthropic-model"));

jest.mock("@ai-sdk/openai", () => ({ createOpenAI: (...a: any[]) => mockOpenAIFactory(...a) }));
jest.mock("@ai-sdk/anthropic", () => ({ createAnthropic: (...a: any[]) => mockAnthropicFactory(...a) }));

import { createModelFromKey, detectProvider } from "../llmModelFactory";

/** The plain callable the factory returned for the current test's call. */
const openaiCallable = () => mockOpenAIFactory.mock.results[0].value as unknown as jest.Mock;
const anthropicCallable = () => mockAnthropicFactory.mock.results[0].value as unknown as jest.Mock;

describe("llmModelFactory", () => {
  beforeEach(() => {
    mockChat.mockClear();
    mockOpenAIFactory.mockClear();
    mockAnthropicFactory.mockClear();
  });

  it("detects Anthropic from the key name", () => {
    expect(detectProvider("My Claude key")).toBe("Anthropic");
    expect(detectProvider("anthropic-prod")).toBe("Anthropic");
    expect(detectProvider("OpenAI prod")).toBe("OpenAI");
  });

  it("uses openai.chat() when a custom baseURL is set, forwarding all options", () => {
    const model = createModelFromKey({
      name: "openrouter",
      key: "sk-x",
      url: "https://openrouter.ai/api/v1",
      model: "meta-llama/llama-3-70b",
      custom_headers: { "HTTP-Referer": "https://verifywise.ai" },
    });
    expect(mockOpenAIFactory).toHaveBeenCalledWith({
      apiKey: "sk-x",
      baseURL: "https://openrouter.ai/api/v1",
      headers: { "HTTP-Referer": "https://verifywise.ai" },
    });
    expect(mockChat).toHaveBeenCalledWith("meta-llama/llama-3-70b");
    expect(model).toBe("chat-model");
  });

  it("uses the plain callable when there is no custom baseURL", () => {
    const model = createModelFromKey({
      name: "openai",
      key: "sk-x",
      url: null,
      model: "gpt-4o-mini",
      custom_headers: null,
    });
    expect(mockOpenAIFactory).toHaveBeenCalledWith({
      apiKey: "sk-x",
      baseURL: undefined,
      headers: undefined,
    });
    expect(mockChat).not.toHaveBeenCalled();
    expect(openaiCallable()).toHaveBeenCalledWith("gpt-4o-mini");
    expect(model).toBe("responses-model");
  });

  it("treats an empty-string url as no baseURL", () => {
    const model = createModelFromKey({
      name: "openai",
      key: "sk-x",
      url: "",
      model: "gpt-4o-mini",
      custom_headers: null,
    });
    expect(mockOpenAIFactory).toHaveBeenCalledWith({
      apiKey: "sk-x",
      baseURL: undefined,
      headers: undefined,
    });
    expect(mockChat).not.toHaveBeenCalled();
    expect(model).toBe("responses-model");
  });

  it("routes Anthropic keys to createAnthropic, forwarding all options", () => {
    const model = createModelFromKey({
      name: "claude",
      key: "sk-ant",
      url: null,
      model: "claude-sonnet-4-20250514",
      custom_headers: null,
    });
    expect(mockAnthropicFactory).toHaveBeenCalledWith({
      apiKey: "sk-ant",
      baseURL: undefined,
      headers: undefined,
    });
    expect(anthropicCallable()).toHaveBeenCalledWith("claude-sonnet-4-20250514");
    expect(mockOpenAIFactory).not.toHaveBeenCalled();
    expect(model).toBe("anthropic-model");
  });

  it("forwards a custom baseURL and headers on the Anthropic path", () => {
    const model = createModelFromKey({
      name: "anthropic-proxy",
      key: "sk-ant",
      url: "https://proxy.internal/v1",
      model: "claude-sonnet-4-20250514",
      custom_headers: { "x-tenant": "acme" },
    });
    expect(mockAnthropicFactory).toHaveBeenCalledWith({
      apiKey: "sk-ant",
      baseURL: "https://proxy.internal/v1",
      headers: { "x-tenant": "acme" },
    });
    expect(anthropicCallable()).toHaveBeenCalledWith("claude-sonnet-4-20250514");
    expect(model).toBe("anthropic-model");
  });

  it("falls back to the default model when none is given", () => {
    createModelFromKey({ name: "openai", key: "sk-x", url: null, model: "", custom_headers: null });
    expect(openaiCallable()).toHaveBeenCalledWith("gpt-4o-mini");

    mockAnthropicFactory.mockClear();
    createModelFromKey({ name: "claude", key: "sk-ant", url: null, custom_headers: null });
    expect(anthropicCallable()).toHaveBeenCalledWith("claude-sonnet-4-20250514");
  });
});
