import { describe, it, expect, jest, beforeEach } from "@jest/globals";

jest.mock("../../utils/safeOutboundUrl", () => ({ safeFetch: jest.fn() }));
jest.mock("../../utils/logger/fileLogger", () => ({
  __esModule: true,
  default: { debug: jest.fn(), error: jest.fn() },
}));

import {
  verifyLLMKey,
  LLM_KEY_VERIFY_TIMEOUT_MS,
  MAX_BODY_BYTES,
  withoutTrailingSlashes,
} from "../llmKeyVerification";
import { safeFetch } from "../../utils/safeOutboundUrl";
import logger from "../../utils/logger/fileLogger";

const mockFetch = safeFetch as unknown as jest.Mock<any>;

// A real Response, so the capped body reader runs as in production.
const reply = (status: number, body: unknown = {}) =>
  new Response(typeof body === "string" ? body : JSON.stringify(body), { status });

const sentHeaders = (call = 0): Headers =>
  (mockFetch.mock.calls[call][1] as RequestInit).headers as Headers;

const WORKSPACE_ERROR = {
  type: "error",
  error: {
    type: "invalid_request_error",
    message:
      "This API key is not scoped to a workspace, so this request must include the anthropic-workspace-id header with the ID of the workspace to use.",
  },
};

describe("verifyLLMKey", () => {
  beforeEach(() => jest.clearAllMocks());

  describe("Anthropic", () => {
    const anthropic = {
      name: "Anthropic" as const,
      key: "sk-ant-api03-secret",
      model: "claude-sonnet-4-5",
    };

    it("looks the model up with the key, the API version and a timeout", async () => {
      mockFetch.mockResolvedValue(reply(200, { id: "claude-sonnet-4-5" }));
      await expect(verifyLLMKey(anthropic)).resolves.toEqual({ ok: true });

      const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(url).toBe("https://api.anthropic.com/v1/models/claude-sonnet-4-5");
      expect(init.method).toBe("GET");
      expect(init.signal).toBeInstanceOf(AbortSignal);
      expect(sentHeaders().get("x-api-key")).toBe("sk-ant-api03-secret");
      expect(sentHeaders().get("anthropic-version")).toBe("2023-06-01");
      expect(LLM_KEY_VERIFY_TIMEOUT_MS).toBe(8000);
    });

    it("sends the workspace id from the custom headers", async () => {
      mockFetch.mockResolvedValue(reply(200));
      await verifyLLMKey({
        ...anthropic,
        custom_headers: { "anthropic-workspace-id": "wrkspc_123" },
      });
      expect(sentHeaders().get("anthropic-workspace-id")).toBe("wrkspc_123");
    });

    it("reports a key outside any workspace as workspace_required", async () => {
      mockFetch.mockResolvedValue(reply(400, WORKSPACE_ERROR));
      await expect(verifyLLMKey(anthropic)).resolves.toEqual({
        ok: false,
        code: "workspace_required",
      });
    });

    it.each([401, 403])("reports %i as invalid_key", async (status) => {
      mockFetch.mockResolvedValue(reply(status, { error: { message: "invalid x-api-key" } }));
      await expect(verifyLLMKey(anthropic)).resolves.toEqual({ ok: false, code: "invalid_key" });
    });

    it("reports an unknown model as model_unavailable", async () => {
      mockFetch.mockResolvedValue(reply(404, { error: { type: "not_found_error" } }));
      await expect(verifyLLMKey(anthropic)).resolves.toEqual({
        ok: false,
        code: "model_unavailable",
      });
    });

    it("escapes the model id in the path", async () => {
      mockFetch.mockResolvedValue(reply(200));
      await verifyLLMKey({ ...anthropic, model: "../key" });
      expect(mockFetch.mock.calls[0][0]).toBe("https://api.anthropic.com/v1/models/..%2Fkey");
    });
  });

  describe("OpenAI", () => {
    const openai = { name: "OpenAI" as const, key: "sk-proj-secret", model: "gpt-4o" };

    it("lists the models with a bearer token and accepts a listed model", async () => {
      mockFetch.mockResolvedValue(reply(200, { data: [{ id: "gpt-4o" }, { id: "gpt-4.1" }] }));
      await expect(verifyLLMKey(openai)).resolves.toEqual({ ok: true });
      expect(mockFetch.mock.calls[0][0]).toBe("https://api.openai.com/v1/models");
      expect(sentHeaders().get("authorization")).toBe("Bearer sk-proj-secret");
    });

    it("reports a model missing from the list as model_unavailable", async () => {
      mockFetch.mockResolvedValue(reply(200, { data: [{ id: "gpt-4.1" }] }));
      await expect(verifyLLMKey(openai)).resolves.toEqual({
        ok: false,
        code: "model_unavailable",
      });
    });

    it("accepts the key when the list cannot be read", async () => {
      mockFetch.mockResolvedValue(reply(200, "not json"));
      await expect(verifyLLMKey(openai)).resolves.toEqual({ ok: true });
    });

    it("reports 401 as invalid_key", async () => {
      mockFetch.mockResolvedValue(reply(401));
      await expect(verifyLLMKey(openai)).resolves.toEqual({ ok: false, code: "invalid_key" });
    });

    it("keeps a plain invalid_api_key refusal as invalid_key", async () => {
      mockFetch.mockResolvedValue(
        reply(401, { error: { message: "Incorrect API key provided", code: "invalid_api_key" } }),
      );
      await expect(verifyLLMKey(openai)).resolves.toEqual({ ok: false, code: "invalid_key" });
    });

    it.each([
      "You have insufficient permissions for this operation. Missing scopes: api.model.read.",
      "Missing scopes: api.model.read",
      "insufficient permissions",
    ])("treats a restricted key (%s) as could-not-check", async (message) => {
      mockFetch.mockResolvedValue(reply(401, { error: { message } }));
      await expect(verifyLLMKey(openai)).resolves.toEqual({
        ok: false,
        code: "unreachable",
        reason: "cannot_list_models",
      });
    });

    it("skips the model check when the list is over the size cap", async () => {
      mockFetch.mockResolvedValue(reply(200, "x".repeat(MAX_BODY_BYTES + 1)));
      await expect(verifyLLMKey(openai)).resolves.toEqual({ ok: true });
    });

    it("lets a custom header override the default one, as the SDK does", async () => {
      mockFetch.mockResolvedValue(reply(200, { data: [{ id: "gpt-4o" }] }));
      await verifyLLMKey({ ...openai, custom_headers: { "OpenAI-Organization": "org-1" } });
      expect(sentHeaders().get("openai-organization")).toBe("org-1");
    });
  });

  describe("OpenRouter", () => {
    const openrouter = { name: "OpenRouter" as const, key: "sk-or-v1-secret", model: "x/y" };

    it("checks the key's own info endpoint, which needs auth", async () => {
      mockFetch.mockResolvedValue(reply(200, { data: { label: "k" } }));
      await expect(verifyLLMKey(openrouter)).resolves.toEqual({ ok: true });
      expect(mockFetch.mock.calls[0][0]).toBe("https://openrouter.ai/api/v1/key");
      expect(sentHeaders().get("authorization")).toBe("Bearer sk-or-v1-secret");
    });

    it("reports 401 as invalid_key", async () => {
      mockFetch.mockResolvedValue(reply(401));
      await expect(verifyLLMKey(openrouter)).resolves.toEqual({ ok: false, code: "invalid_key" });
    });
  });

  describe("Custom", () => {
    const custom = {
      name: "Custom" as const,
      key: "sk-custom",
      model: "llama-3",
      url: "https://proxy.example.com/v1/",
    };

    it("lists {url}/models and accepts a listed model", async () => {
      mockFetch.mockResolvedValue(reply(200, { data: [{ id: "llama-3" }] }));
      await expect(verifyLLMKey(custom)).resolves.toEqual({ ok: true });
      expect(mockFetch.mock.calls[0][0]).toBe("https://proxy.example.com/v1/models");
    });

    it("warns, without refusing, when the model is missing from the list", async () => {
      mockFetch.mockResolvedValue(reply(200, { data: [{ id: "mistral" }] }));
      await expect(verifyLLMKey(custom)).resolves.toEqual({
        ok: false,
        code: "unreachable",
        reason: "model_not_listed",
      });
    });

    it.each([["llama-3:latest"], ["meta/llama-3"]])(
      "accepts the model listed as %s",
      async (id) => {
        mockFetch.mockResolvedValue(reply(200, { data: [{ id }] }));
        await expect(verifyLLMKey(custom)).resolves.toEqual({ ok: true });
      },
    );

    it("does not take a longer id that only starts with the model", async () => {
      mockFetch.mockResolvedValue(reply(200, { data: [{ id: "llama-3-70b" }] }));
      await expect(verifyLLMKey(custom)).resolves.toMatchObject({ reason: "model_not_listed" });
    });

    it("treats a model list over the size cap as unreachable, without reading it all", async () => {
      const big = JSON.stringify({ data: [{ id: "x".repeat(MAX_BODY_BYTES + 10) }] });
      mockFetch.mockResolvedValue(reply(200, big));
      await expect(verifyLLMKey(custom)).resolves.toEqual({ ok: false, code: "unreachable" });
    });

    it("treats a refusal for missing scopes as could-not-check", async () => {
      mockFetch.mockResolvedValue(reply(403, { error: { message: "insufficient permissions" } }));
      await expect(verifyLLMKey(custom)).resolves.toMatchObject({
        code: "unreachable",
        reason: "cannot_list_models",
      });
    });

    it("cannot check a server without a /models endpoint", async () => {
      mockFetch.mockResolvedValue(reply(404));
      await expect(verifyLLMKey(custom)).resolves.toEqual({ ok: false, code: "unreachable" });
    });

    it("treats a URL the outbound policy refuses as unreachable", async () => {
      mockFetch.mockRejectedValue(new Error("resolves to a loopback address"));
      await expect(verifyLLMKey(custom)).resolves.toEqual({ ok: false, code: "unreachable" });
    });
  });

  describe("cannot check", () => {
    const openai = { name: "OpenAI" as const, key: "sk-proj-secret", model: "gpt-4o" };

    it.each([500, 502, 503, 429])("reports %i as unreachable", async (status) => {
      mockFetch.mockResolvedValue(reply(status));
      await expect(verifyLLMKey(openai)).resolves.toEqual({ ok: false, code: "unreachable" });
    });

    it("reports a network error or timeout as unreachable", async () => {
      mockFetch.mockRejectedValue(Object.assign(new Error("aborted"), { name: "TimeoutError" }));
      await expect(verifyLLMKey(openai)).resolves.toEqual({ ok: false, code: "unreachable" });
    });
  });

  describe("a key with characters a key cannot have", () => {
    it.each([
      ["a curly quote", "sk-proj-abc\u2019def"],
      ["a line break", "sk-proj-abc\ndef"],
      ["a trailing line break", "sk-proj-abcdef\n"],
    ])("refuses %s without calling the provider", async (_label, key) => {
      await expect(verifyLLMKey({ name: "OpenAI", key, model: "gpt-4o" })).resolves.toEqual({
        ok: false,
        code: "invalid_key",
        reason: "bad_characters",
      });
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it("refuses it for Anthropic too", async () => {
      await expect(
        verifyLLMKey({ name: "Anthropic", key: "sk-ant-\u2019", model: "claude-sonnet-4-5" }),
      ).resolves.toMatchObject({ code: "invalid_key", reason: "bad_characters" });
    });
  });

  it("never logs the key", async () => {
    mockFetch.mockResolvedValue(reply(401));
    await verifyLLMKey({ name: "OpenAI", key: "sk-proj-dont-log-me", model: "gpt-4o" });
    mockFetch.mockRejectedValue(new Error("boom"));
    await verifyLLMKey({ name: "OpenAI", key: "sk-proj-dont-log-me", model: "gpt-4o" });
    const logged = JSON.stringify([
      (logger.debug as jest.Mock).mock.calls,
      (logger.error as jest.Mock).mock.calls,
    ]);
    expect(logged).not.toContain("sk-proj-dont-log-me");
  });
});

describe("withoutTrailingSlashes", () => {
  it("drops every trailing slash and nothing else", () => {
    expect(withoutTrailingSlashes("https://gw.example/v1/")).toBe("https://gw.example/v1");
    expect(withoutTrailingSlashes("https://gw.example/v1///")).toBe("https://gw.example/v1");
    expect(withoutTrailingSlashes("https://gw.example/v1")).toBe("https://gw.example/v1");
    expect(withoutTrailingSlashes("///")).toBe("");
  });

  it("stays fast on a long run of slashes", () => {
    const started = Date.now();
    expect(withoutTrailingSlashes(`x${"/".repeat(200_000)}y`)).toBe(`x${"/".repeat(200_000)}y`);
    expect(Date.now() - started).toBeLessThan(500);
  });
});
