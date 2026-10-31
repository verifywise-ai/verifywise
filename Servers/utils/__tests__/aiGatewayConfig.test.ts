import { afterEach, describe, expect, it } from "@jest/globals";
import {
  DEFAULT_AI_GATEWAY_URL,
  getGatewayInternalKey,
  getGatewayUrl,
  isGatewayInternalKeyConfigured,
  isGatewayUrlConfigured,
  missingGatewayKeyWarning,
} from "../aiGatewayConfig";

const saved = {
  key: process.env.AI_GATEWAY_INTERNAL_KEY,
  url: process.env.AI_GATEWAY_URL,
};

function setEnv(name: string, value: string | undefined) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

afterEach(() => {
  setEnv("AI_GATEWAY_INTERNAL_KEY", saved.key);
  setEnv("AI_GATEWAY_URL", saved.url);
});

describe("aiGatewayConfig", () => {
  it("trims the internal key, so the header and the check use the same value", () => {
    setEnv("AI_GATEWAY_INTERNAL_KEY", "  secret-key\n");
    expect(getGatewayInternalKey()).toBe("secret-key");
    expect(isGatewayInternalKeyConfigured()).toBe(true);
  });

  it("treats a whitespace-only key as not set", () => {
    setEnv("AI_GATEWAY_INTERNAL_KEY", " \n\t");
    expect(getGatewayInternalKey()).toBe("");
    expect(isGatewayInternalKeyConfigured()).toBe(false);
  });

  it("reads the environment on every call, so values loaded after import are seen", () => {
    // The worker imports this module before anything else could load .env.
    setEnv("AI_GATEWAY_INTERNAL_KEY", undefined);
    expect(isGatewayInternalKeyConfigured()).toBe(false);
    setEnv("AI_GATEWAY_INTERNAL_KEY", "loaded-later");
    expect(getGatewayInternalKey()).toBe("loaded-later");
    setEnv("AI_GATEWAY_URL", "http://gw:8100");
    expect(getGatewayUrl()).toBe("http://gw:8100");
  });

  it("falls back to the default URL the gateway calls have always used", () => {
    setEnv("AI_GATEWAY_URL", undefined);
    expect(getGatewayUrl()).toBe(DEFAULT_AI_GATEWAY_URL);
    expect(DEFAULT_AI_GATEWAY_URL).toBe("http://127.0.0.1:8100");
    setEnv("AI_GATEWAY_URL", " http://gw:8100\n");
    expect(getGatewayUrl()).toBe("http://gw:8100");
    setEnv("AI_GATEWAY_URL", "  ");
    expect(getGatewayUrl()).toBe(DEFAULT_AI_GATEWAY_URL);
  });

  it("knows whether AI_GATEWAY_URL is set explicitly", () => {
    setEnv("AI_GATEWAY_URL", undefined);
    expect(isGatewayUrlConfigured()).toBe(false);
    setEnv("AI_GATEWAY_URL", "  ");
    expect(isGatewayUrlConfigured()).toBe(false);
    setEnv("AI_GATEWAY_URL", "http://gw:8100");
    expect(isGatewayUrlConfigured()).toBe(true);
  });

  it("names the reason and the gateway URL in the warning", () => {
    setEnv("AI_GATEWAY_URL", "http://gw:8100");
    const text = missingGatewayKeyWarning("AI_GATEWAY_URL is set");
    expect(text).toContain("but AI_GATEWAY_URL is set");
    expect(text).toContain("http://gw:8100");
  });
});
