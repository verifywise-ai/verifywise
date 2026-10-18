import { getGatewaySettings, GatewayNotConfiguredError, isGatewayConfigured } from "./settings";

const full = {
  LLM_API_KEY: "sk-secret-value-123",
  LLM_BASE_URL: "https://gateway.example/v1/",
  LLM_MODEL: "pinned-model-1",
};

describe("getGatewaySettings", () => {
  it("reads all three variables, trimming a trailing slash from the base URL", () => {
    expect(getGatewaySettings(full)).toEqual({
      apiKey: "sk-secret-value-123",
      baseUrl: "https://gateway.example/v1",
      model: "pinned-model-1",
    });
    expect(isGatewayConfigured(full)).toBe(true);
  });

  it("refuses with a typed error naming the missing variables", () => {
    const { LLM_API_KEY: _k, ...noKey } = full;
    expect(() => getGatewaySettings(noKey)).toThrow(GatewayNotConfiguredError);
    try {
      getGatewaySettings(noKey);
    } catch (e: any) {
      expect(e.code).toBe("gateway_not_configured");
      expect(e.missing).toEqual(["LLM_API_KEY"]);
    }
    expect(isGatewayConfigured(noKey)).toBe(false);
  });

  it("never puts the key in the error when another variable is missing", () => {
    // The model is pinned in config; a key without a model is not configured.
    const { LLM_MODEL: _m, ...noModel } = full;
    try {
      getGatewaySettings(noModel);
      throw new Error("should have thrown");
    } catch (e: any) {
      expect(e).toBeInstanceOf(GatewayNotConfiguredError);
      expect(e.missing).toEqual(["LLM_MODEL"]);
      expect(JSON.stringify({ message: e.message, ...e })).not.toContain("sk-secret-value-123");
    }
  });

  it("treats blank values as missing", () => {
    expect(() => getGatewaySettings({ ...full, LLM_BASE_URL: "   " })).toThrow(
      GatewayNotConfiguredError,
    );
  });
});
