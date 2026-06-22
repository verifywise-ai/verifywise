/**
 * Tests for the DeepEval proxy route helpers.
 *
 * Covers:
 *   - toLiteLLMModel parity with the Python `to_litellm_model` helper
 *   - injectApiKeys for every request type:
 *       * Experiment with model.provider but no key
 *       * Experiment with key already present (skip injection)
 *       * Experiment in scorer mode with multiple scorerProviders
 *       * Experiment with judge LLM provider (and reuse with scorerApiKeys)
 *       * Arena compare (multiple contestants + judge inference)
 *       * Report generation
 *       * No org id (early return)
 *       * GET request (no-op)
 *
 * The DB-bound key lookup is mocked at the module boundary
 * (`../../utils/aiGatewayEvalKey.utils`) so these tests stay fully unit and do
 * not touch Postgres.
 */

import { describe, it, expect, beforeEach, jest } from "@jest/globals";
import type { NextFunction, Request, Response } from "express";

// `http-proxy-middleware` ships ESM and Jest can't transform it without extra
// config; we don't exercise the proxy here so a no-op mock is fine.
jest.mock("http-proxy-middleware", () => ({
  __esModule: true,
  createProxyMiddleware: jest.fn(() => (_req: unknown, _res: unknown, next: () => void) => next()),
  fixRequestBody: jest.fn(),
}));

jest.mock("../../utils/aiGatewayEvalKey.utils", () => ({
  __esModule: true,
  getDecryptedAiGatewayKeyForProviderQuery: jest.fn(),
}));

import { injectApiKeys, toLiteLLMModel } from "../deepEvalRoutes.route";
import { getDecryptedAiGatewayKeyForProviderQuery } from "../../utils/aiGatewayEvalKey.utils";

const mockGetKey = getDecryptedAiGatewayKeyForProviderQuery as jest.MockedFunction<
  typeof getDecryptedAiGatewayKeyForProviderQuery
>;

type MockReq = Partial<Request> & { body?: any; organizationId?: number };

function buildReq(overrides: Partial<MockReq> = {}): MockReq {
  return {
    method: "POST",
    url: "/experiments",
    body: {},
    organizationId: 7,
    ...overrides,
  };
}

function buildRes(): Response {
  return {} as Response;
}

function buildNext(): jest.Mock {
  return jest.fn() as unknown as jest.Mock;
}

beforeEach(() => {
  mockGetKey.mockReset();
});

// --------------------------------------------------------------------------- //
// toLiteLLMModel — must match EvalServer/src/utils/gateway_litellm_client.py //
// --------------------------------------------------------------------------- //

describe("toLiteLLMModel", () => {
  const cases: Array<[string, string, string]> = [
    // [provider, input, expected]
    [
      "openrouter",
      "meta-llama/llama-3.1-70b-instruct",
      "openrouter/meta-llama/llama-3.1-70b-instruct",
    ],
    [
      "openrouter",
      "openrouter/meta-llama/llama-3.1-70b-instruct",
      "openrouter/meta-llama/llama-3.1-70b-instruct",
    ],
    ["openrouter", "anthropic/claude-3-opus", "openrouter/anthropic/claude-3-opus"],
    ["openrouter", "gpt-4o", "openrouter/gpt-4o"],
    ["google", "gemini-1.5-pro", "gemini/gemini-1.5-pro"],
    ["google", "gemini/gemini-1.5-pro", "gemini/gemini-1.5-pro"],
    ["gemini", "gemini-flash", "gemini/gemini-flash"],
    ["anthropic", "claude-3-5-sonnet", "anthropic/claude-3-5-sonnet"],
    ["anthropic", "anthropic/claude-3-5-sonnet", "anthropic/claude-3-5-sonnet"],
    ["mistral", "mistral-large", "mistral/mistral-large"],
    ["mistral", "mistral/mistral-large", "mistral/mistral-large"],
    ["xai", "grok-beta", "xai/grok-beta"],
    ["openai", "gpt-4o", "gpt-4o"],
    ["openai", "ft:gpt-4/my-fine-tune", "ft:gpt-4/my-fine-tune"],
  ];

  it.each(cases)("toLiteLLMModel(%j, %j) -> %j", (provider, input, expected) => {
    expect(toLiteLLMModel(provider, input)).toBe(expected);
  });

  it("uppercase provider is normalized via toLowerCase", () => {
    expect(toLiteLLMModel("OPENROUTER", "meta-llama/foo")).toBe("openrouter/meta-llama/foo");
  });
});

// --------------------------------------------------------------------------- //
// injectApiKeys — early returns                                              //
// --------------------------------------------------------------------------- //

describe("injectApiKeys early returns", () => {
  it("calls next without DB lookup for GET requests", async () => {
    const req = buildReq({ method: "GET", url: "/experiments" });
    const next = buildNext();
    await injectApiKeys(req as Request, buildRes(), next as unknown as NextFunction);
    expect(next).toHaveBeenCalledTimes(1);
    expect(mockGetKey).not.toHaveBeenCalled();
  });

  it("calls next without DB lookup for unrelated POST routes", async () => {
    const req = buildReq({ url: "/projects" });
    const next = buildNext();
    await injectApiKeys(req as Request, buildRes(), next as unknown as NextFunction);
    expect(next).toHaveBeenCalledTimes(1);
    expect(mockGetKey).not.toHaveBeenCalled();
  });

  it("calls next without DB lookup when organizationId is null/undefined", async () => {
    const req = buildReq({
      organizationId: undefined,
      body: { config: { model: { provider: "openai" } } },
    });
    const next = buildNext();
    await injectApiKeys(req as Request, buildRes(), next as unknown as NextFunction);
    expect(next).toHaveBeenCalledTimes(1);
    expect(mockGetKey).not.toHaveBeenCalled();
  });
});

// --------------------------------------------------------------------------- //
// injectApiKeys — experiment + model api key                                 //
// --------------------------------------------------------------------------- //

describe("injectApiKeys (experiment) — model.apiKey", () => {
  it("injects key for cloud model provider when none provided", async () => {
    mockGetKey.mockResolvedValueOnce("sk-test-injected");
    const req = buildReq({
      body: {
        config: { model: { provider: "openai", apiKey: "" } },
      },
    });
    const next = buildNext();

    await injectApiKeys(req as Request, buildRes(), next as unknown as NextFunction);

    expect(mockGetKey).toHaveBeenCalledWith(7, "openai");
    expect(req.body.config.model.apiKey).toBe("sk-test-injected");
    expect(next).toHaveBeenCalledTimes(1);
  });

  it("does not overwrite a real existing key", async () => {
    const req = buildReq({
      body: {
        config: { model: { provider: "openrouter", apiKey: "sk-or-v1-existing-real-key" } },
      },
    });
    const next = buildNext();

    await injectApiKeys(req as Request, buildRes(), next as unknown as NextFunction);

    expect(mockGetKey).not.toHaveBeenCalled();
    expect(req.body.config.model.apiKey).toBe("sk-or-v1-existing-real-key");
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('treats "***" placeholder key as missing and re-injects', async () => {
    mockGetKey.mockResolvedValueOnce("sk-real-from-db");
    const req = buildReq({
      body: { config: { model: { provider: "anthropic", apiKey: "***" } } },
    });
    const next = buildNext();

    await injectApiKeys(req as Request, buildRes(), next as unknown as NextFunction);

    expect(mockGetKey).toHaveBeenCalledWith(7, "anthropic");
    expect(req.body.config.model.apiKey).toBe("sk-real-from-db");
  });

  it("falls back to model.accessMethod when provider absent", async () => {
    mockGetKey.mockResolvedValueOnce("sk-from-access");
    const req = buildReq({
      body: { config: { model: { accessMethod: "google", apiKey: "" } } },
    });
    const next = buildNext();

    await injectApiKeys(req as Request, buildRes(), next as unknown as NextFunction);

    expect(mockGetKey).toHaveBeenCalledWith(7, "google");
    expect(req.body.config.model.apiKey).toBe("sk-from-access");
    expect(req.body.config.model.provider).toBe("google");
  });

  it("rejects unknown provider names without DB lookup", async () => {
    const req = buildReq({
      body: { config: { model: { provider: "totally-fake", apiKey: "" } } },
    });
    const next = buildNext();

    await injectApiKeys(req as Request, buildRes(), next as unknown as NextFunction);

    expect(mockGetKey).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledTimes(1);
  });
});

// --------------------------------------------------------------------------- //
// injectApiKeys (experiment) — scorerProviders                              //
// --------------------------------------------------------------------------- //

describe("injectApiKeys (experiment) — scorerProviders", () => {
  it("injects scorer keys for each requested provider", async () => {
    mockGetKey.mockImplementation(async (_org, provider) => `key-${provider}`);

    const req = buildReq({
      body: {
        config: {
          useCustomScorer: true,
          scorerProviders: ["openai", "mistral"],
          evaluationMode: "scorer",
        },
      },
    });
    const next = buildNext();

    await injectApiKeys(req as Request, buildRes(), next as unknown as NextFunction);

    expect(mockGetKey).toHaveBeenCalledWith(7, "openai");
    expect(mockGetKey).toHaveBeenCalledWith(7, "mistral");
    expect(req.body.config.scorerApiKeys).toEqual({
      openai: "key-openai",
      mistral: "key-mistral",
    });
  });

  it("skips providers whose lookup returns null", async () => {
    mockGetKey.mockResolvedValueOnce("sk-ok").mockResolvedValueOnce(null);

    const req = buildReq({
      body: {
        config: {
          useCustomScorer: true,
          scorerProviders: ["openai", "anthropic"],
        },
      },
    });
    const next = buildNext();

    await injectApiKeys(req as Request, buildRes(), next as unknown as NextFunction);

    expect(req.body.config.scorerApiKeys).toEqual({ openai: "sk-ok" });
  });

  it("skips invalid provider names entirely", async () => {
    mockGetKey.mockResolvedValueOnce("sk-ok");
    const req = buildReq({
      body: {
        config: {
          useCustomScorer: true,
          scorerProviders: ["openai", "fake-provider"],
        },
      },
    });
    const next = buildNext();

    await injectApiKeys(req as Request, buildRes(), next as unknown as NextFunction);

    expect(mockGetKey).toHaveBeenCalledTimes(1);
    expect(mockGetKey).toHaveBeenCalledWith(7, "openai");
  });
});

// --------------------------------------------------------------------------- //
// injectApiKeys (experiment) — judgeLlm + scorerApiKeys reuse               //
// --------------------------------------------------------------------------- //

describe("injectApiKeys (experiment) — judgeLlm and scorerApiKeys reuse", () => {
  it("injects judge LLM key when missing", async () => {
    mockGetKey.mockResolvedValueOnce("sk-judge");

    const req = buildReq({
      body: {
        config: {
          evaluationMode: "standard",
          judgeLlm: { provider: "openai", model: "gpt-4o-mini" },
        },
      },
    });
    const next = buildNext();

    await injectApiKeys(req as Request, buildRes(), next as unknown as NextFunction);

    expect(req.body.config.judgeLlm.apiKey).toBe("sk-judge");
    // Reused for scorerApiKeys (no second DB call)
    expect(req.body.config.scorerApiKeys).toEqual({ openai: "sk-judge" });
    expect(mockGetKey).toHaveBeenCalledTimes(1);
  });

  it("reuses an already-resolved judge api key for scorerApiKeys", async () => {
    const req = buildReq({
      body: {
        config: {
          evaluationMode: "standard",
          judgeLlm: { provider: "openai", apiKey: "sk-already-set" },
        },
      },
    });
    const next = buildNext();

    await injectApiKeys(req as Request, buildRes(), next as unknown as NextFunction);

    expect(mockGetKey).not.toHaveBeenCalled();
    expect(req.body.config.scorerApiKeys).toEqual({ openai: "sk-already-set" });
  });

  it('does not inject judge api key when evaluationMode is "scorer"', async () => {
    const req = buildReq({
      body: {
        config: {
          evaluationMode: "scorer",
          judgeLlm: { provider: "openai" },
        },
      },
    });
    const next = buildNext();

    await injectApiKeys(req as Request, buildRes(), next as unknown as NextFunction);

    expect(mockGetKey).not.toHaveBeenCalled();
    expect(req.body.config.judgeLlm.apiKey).toBeUndefined();
  });

  it('injects judge key in "both" mode and adds it to scorerApiKeys', async () => {
    mockGetKey.mockResolvedValueOnce("sk-both-judge");

    const req = buildReq({
      body: {
        config: {
          evaluationMode: "both",
          judgeLlm: { provider: "anthropic", model: "claude-3-haiku" },
        },
      },
    });
    const next = buildNext();

    await injectApiKeys(req as Request, buildRes(), next as unknown as NextFunction);

    expect(req.body.config.judgeLlm.apiKey).toBe("sk-both-judge");
    expect(req.body.config.scorerApiKeys).toEqual({ anthropic: "sk-both-judge" });
  });
});

// --------------------------------------------------------------------------- //
// injectApiKeys — arena                                                     //
// --------------------------------------------------------------------------- //

describe("injectApiKeys (arena)", () => {
  function arenaReq(overrides: any = {}): MockReq {
    return buildReq({ url: "/arena/compare", body: overrides });
  }

  it("collects keys for every contestant provider exactly once", async () => {
    mockGetKey.mockImplementation(async (_org, provider) => `arena-${provider}`);

    const req = arenaReq({
      contestants: [
        { hyperparameters: { provider: "openai" } },
        { hyperparameters: { provider: "openai" } }, // dupe — only 1 lookup
        { hyperparameters: { provider: "anthropic" } },
      ],
      judgeModel: "gpt-4o",
    });
    const next = buildNext();

    await injectApiKeys(req as Request, buildRes(), next as unknown as NextFunction);

    expect(mockGetKey).toHaveBeenCalledWith(7, "openai");
    expect(mockGetKey).toHaveBeenCalledWith(7, "anthropic");
    expect(req.body.apiKeys).toEqual({ openai: "arena-openai", anthropic: "arena-anthropic" });
  });

  it("infers judge provider from model name when judgeProvider absent", async () => {
    mockGetKey.mockImplementation(async (_org, provider) => `arena-${provider}`);

    const req = arenaReq({
      contestants: [],
      judgeModel: "magistral-small", // -> mistral
    });
    const next = buildNext();

    await injectApiKeys(req as Request, buildRes(), next as unknown as NextFunction);

    expect(mockGetKey).toHaveBeenCalledWith(7, "mistral");
  });

  it("infers openrouter when judge model contains a slash and no other rule matches", async () => {
    mockGetKey.mockImplementation(async (_org, provider) => `arena-${provider}`);

    const req = arenaReq({
      contestants: [],
      judgeModel: "meta-llama/llama-3.1-70b",
    });
    const next = buildNext();

    await injectApiKeys(req as Request, buildRes(), next as unknown as NextFunction);

    expect(mockGetKey).toHaveBeenCalledWith(7, "openrouter");
  });

  it("respects explicit judgeProvider over model-name inference", async () => {
    mockGetKey.mockImplementation(async (_org, provider) => `arena-${provider}`);

    const req = arenaReq({
      contestants: [],
      judgeModel: "claude-3-haiku", // would infer 'anthropic'
      judgeProvider: "openrouter",
    });
    const next = buildNext();

    await injectApiKeys(req as Request, buildRes(), next as unknown as NextFunction);

    expect(mockGetKey).toHaveBeenCalledWith(7, "openrouter");
    expect(mockGetKey).not.toHaveBeenCalledWith(7, "anthropic");
  });

  it("does not inject apiKeys when no contestants resolve a key", async () => {
    mockGetKey.mockResolvedValue(null);

    const req = arenaReq({
      contestants: [{ hyperparameters: { provider: "openai" } }],
      judgeModel: "gpt-4o",
    });
    const next = buildNext();

    await injectApiKeys(req as Request, buildRes(), next as unknown as NextFunction);

    expect(req.body.apiKeys).toBeUndefined();
  });

  it("returns early if contestants array is missing", async () => {
    const req = arenaReq({ judgeModel: "gpt-4o" });
    const next = buildNext();

    await injectApiKeys(req as Request, buildRes(), next as unknown as NextFunction);

    expect(mockGetKey).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledTimes(1);
  });
});

// --------------------------------------------------------------------------- //
// injectApiKeys — report generation                                         //
// --------------------------------------------------------------------------- //

describe("injectApiKeys (report)", () => {
  it("injects judge api key into req.body.apiKey", async () => {
    mockGetKey.mockResolvedValueOnce("sk-report-judge");

    const req = buildReq({
      url: "/reports/generate",
      body: { judgeProvider: "anthropic" },
    });
    const next = buildNext();

    await injectApiKeys(req as Request, buildRes(), next as unknown as NextFunction);

    expect(mockGetKey).toHaveBeenCalledWith(7, "anthropic");
    expect(req.body.apiKey).toBe("sk-report-judge");
  });

  it("does nothing if judgeProvider is invalid or absent", async () => {
    const req = buildReq({
      url: "/reports/generate",
      body: { judgeProvider: "fake-provider" },
    });
    const next = buildNext();

    await injectApiKeys(req as Request, buildRes(), next as unknown as NextFunction);

    expect(mockGetKey).not.toHaveBeenCalled();
    expect(req.body.apiKey).toBeUndefined();
  });
});

// --------------------------------------------------------------------------- //
// injectApiKeys — error swallowing                                          //
// --------------------------------------------------------------------------- //

describe("injectApiKeys error handling", () => {
  it("a thrown DB error from getDecryptedAiGatewayKeyForProviderQuery is swallowed", async () => {
    mockGetKey.mockRejectedValue(new Error("db connection error"));

    const req = buildReq({
      body: {
        config: { model: { provider: "openai", apiKey: "" } },
      },
    });
    const next = buildNext();

    await injectApiKeys(req as Request, buildRes(), next as unknown as NextFunction);

    expect(req.body.config.model.apiKey).toBe("");
    expect(next).toHaveBeenCalledTimes(1);
  });
});
