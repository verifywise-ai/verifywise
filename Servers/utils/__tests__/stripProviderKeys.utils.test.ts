import { stripProviderKeys, withoutProviderKeys } from "../stripProviderKeys.utils";

const KEY = "sk-ant-api03-not-a-real-key";

const configWithKeys = () => ({
  model: { name: "claude-haiku-4-5", provider: "anthropic", apiKey: KEY },
  judgeLlm: { provider: "anthropic", model: "claude-sonnet-4-6", apiKey: KEY },
  scorerApiKeys: { anthropic: KEY },
  scorerApiKey: KEY,
  apiKeys: { openai: KEY },
  dataset: { name: "d", prompts: [{ prompt: "q", api_key: "fixture value" }] },
  metrics: { faithfulness: true },
});

describe("stripProviderKeys", () => {
  it("removes every provider-key field outside the dataset", () => {
    const cleaned = stripProviderKeys(configWithKeys());
    expect(JSON.stringify(cleaned)).not.toContain(KEY);
    expect(cleaned).toEqual({
      model: { name: "claude-haiku-4-5", provider: "anthropic" },
      judgeLlm: { provider: "anthropic", model: "claude-sonnet-4-6" },
      dataset: { name: "d", prompts: [{ prompt: "q", api_key: "fixture value" }] },
      metrics: { faithfulness: true },
    });
  });

  it("does not modify its input", () => {
    const config = configWithKeys();
    stripProviderKeys(config);
    expect(config.model.apiKey).toBe(KEY);
  });

  it("strips each experiment row's config and keeps other columns", () => {
    const [row] = withoutProviderKeys([{ id: "exp_1", config: configWithKeys() }]);
    expect(row.id).toBe("exp_1");
    expect(JSON.stringify(row)).not.toContain(KEY);
  });

  it("passes through rows without a config", () => {
    expect(withoutProviderKeys([{ id: "exp_1", config: null }])).toEqual([
      { id: "exp_1", config: null },
    ]);
  });
});
