import { describe, it, expect } from "vitest";
import {
  PROVIDERS,
  getProviderList,
  getModelsForProvider,
  getRecommendedModel,
  getProviderMeta,
} from "../providers";

describe("PROVIDERS", () => {
  it("contains all expected providers", () => {
    expect(PROVIDERS).toHaveProperty("openai");
    expect(PROVIDERS).toHaveProperty("anthropic");
    expect(PROVIDERS).toHaveProperty("google");
    expect(PROVIDERS).toHaveProperty("mistral");
    expect(PROVIDERS).toHaveProperty("xai");
    expect(PROVIDERS).toHaveProperty("openrouter");
    expect(PROVIDERS).toHaveProperty("self-hosted");
  });

  it("each provider has required fields", () => {
    Object.values(PROVIDERS).forEach((provider) => {
      expect(provider).toHaveProperty("provider");
      expect(provider).toHaveProperty("displayName");
      expect(provider).toHaveProperty("models");
      expect(Array.isArray(provider.models)).toBe(true);
    });
  });
});

describe("getProviderList", () => {
  it("returns array of all providers", () => {
    const list = getProviderList();
    expect(Array.isArray(list)).toBe(true);
    expect(list.length).toBe(Object.keys(PROVIDERS).length);
  });
});

describe("getModelsForProvider", () => {
  it("returns models for known provider", () => {
    const models = getModelsForProvider("openai");
    expect(Array.isArray(models)).toBe(true);
    expect(models.length).toBeGreaterThan(0);
  });

  it("returns empty array for unknown provider", () => {
    const models = getModelsForProvider("nonexistent");
    expect(models).toEqual([]);
  });

  it("returns empty array for self-hosted (no pre-configured models)", () => {
    const models = getModelsForProvider("self-hosted");
    expect(models).toEqual([]);
  });

  it("each model has required fields", () => {
    const models = getModelsForProvider("openai");
    models.forEach((model) => {
      expect(model).toHaveProperty("id");
      expect(model).toHaveProperty("name");
      expect(typeof model.id).toBe("string");
      expect(typeof model.name).toBe("string");
    });
  });
});

describe("getRecommendedModel", () => {
  it("returns a recommended model for providers that have one", () => {
    const recommended = getRecommendedModel("openai");
    if (recommended) {
      expect(recommended.recommended).toBe(true);
    }
  });

  it("returns undefined for provider with no recommended model", () => {
    const recommended = getRecommendedModel("self-hosted");
    expect(recommended).toBeUndefined();
  });

  it("returns undefined for unknown provider", () => {
    const recommended = getRecommendedModel("nonexistent");
    expect(recommended).toBeUndefined();
  });
});

describe("getProviderMeta", () => {
  it("returns metadata for known provider", () => {
    const meta = getProviderMeta("openai");
    expect(meta).toBeDefined();
    expect(meta.displayName).toBe("OpenAI");
    expect(typeof meta.iconColor).toBe("string");
    expect(typeof meta.logo).toBe("string");
  });

  it("returns metadata for anthropic", () => {
    const meta = getProviderMeta("anthropic");
    expect(meta.displayName).toBe("Anthropic");
  });

  it("returns undefined for unknown provider", () => {
    const meta = getProviderMeta("nonexistent");
    expect(meta).toBeUndefined();
  });
});
