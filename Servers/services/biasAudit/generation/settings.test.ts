import { inspect } from "node:util";
import {
  getGatewaySettings,
  GatewayConfigError,
  GatewayNotConfiguredError,
  isGatewayConfigured,
} from "./settings";

const full = {
  BIAS_AUDIT_LLM_API_KEY: "sk-secret-value-123",
  BIAS_AUDIT_LLM_BASE_URL: "https://gateway.example/v1/",
  BIAS_AUDIT_LLM_MODEL: "pinned-model-1",
};

describe("getGatewaySettings", () => {
  it("reads all three variables, trimming a trailing slash from the base URL", () => {
    const s = getGatewaySettings(full);
    expect(s.apiKey).toBe("sk-secret-value-123");
    expect(s.baseUrl).toBe("https://gateway.example/v1");
    expect(s.model).toBe("pinned-model-1");
    expect(isGatewayConfigured(full)).toBe(true);
  });

  it("refuses with a typed error naming the missing variables", () => {
    const { BIAS_AUDIT_LLM_API_KEY: _k, ...noKey } = full;
    expect(() => getGatewaySettings(noKey)).toThrow(GatewayNotConfiguredError);
    try {
      getGatewaySettings(noKey);
    } catch (e: any) {
      expect(e.code).toBe("gateway_not_configured");
      expect(e.missing).toEqual(["BIAS_AUDIT_LLM_API_KEY"]);
    }
    expect(isGatewayConfigured(noKey)).toBe(false);
  });

  it("never puts the key in the error when another variable is missing", () => {
    // The model is pinned in config; a key without a model is not configured.
    const { BIAS_AUDIT_LLM_MODEL: _m, ...noModel } = full;
    try {
      getGatewaySettings(noModel);
      throw new Error("should have thrown");
    } catch (e: any) {
      expect(e).toBeInstanceOf(GatewayNotConfiguredError);
      expect(e.missing).toEqual(["BIAS_AUDIT_LLM_MODEL"]);
      expect(JSON.stringify({ message: e.message, ...e })).not.toContain("sk-secret-value-123");
    }
  });

  it("treats blank values as missing", () => {
    expect(() => getGatewaySettings({ ...full, BIAS_AUDIT_LLM_BASE_URL: "   " })).toThrow(
      GatewayNotConfiguredError,
    );
  });

  it("refuses a base URL that is not https, naming only the variable", () => {
    for (const bad of ["http://gateway.example/v1", "not a url", "ftp://x.example"]) {
      try {
        getGatewaySettings({ ...full, BIAS_AUDIT_LLM_BASE_URL: bad });
        throw new Error("should have thrown");
      } catch (e: any) {
        expect(e).toBeInstanceOf(GatewayConfigError);
        expect(e.variable).toBe("BIAS_AUDIT_LLM_BASE_URL");
        expect(e.message).not.toContain(bad);
      }
    }
  });

  it("refuses a key with inner whitespace, control or non-ASCII characters", () => {
    for (const bad of ["sk bad", "sk\nbad", "sk\u0000bad", "sk-\u00e9bad"]) {
      try {
        getGatewaySettings({ ...full, BIAS_AUDIT_LLM_API_KEY: bad });
        throw new Error("should have thrown");
      } catch (e: any) {
        expect(e).toBeInstanceOf(GatewayConfigError);
        expect(e.variable).toBe("BIAS_AUDIT_LLM_API_KEY");
        expect(e.message).not.toContain("bad");
      }
    }
  });

  it("isGatewayConfigured is false for an invalid value", () => {
    expect(isGatewayConfigured({ ...full, BIAS_AUDIT_LLM_BASE_URL: "http://x.example" })).toBe(
      false,
    );
  });

  it("does not serialise or inspect the key", () => {
    const s = getGatewaySettings(full);
    expect(JSON.stringify(s)).not.toContain("sk-secret-value-123");
    expect(inspect(s)).not.toContain("sk-secret-value-123");
    expect(Object.keys(s)).not.toContain("apiKey");
    expect(JSON.stringify({ ...s })).not.toContain("sk-secret-value-123");
  });
});
