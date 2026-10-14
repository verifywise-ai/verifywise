import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import {
  GATEWAY_HEALTH_TIMEOUT_MS,
  resetGatewayKeyWarning,
  warnIfGatewayKeyMissing,
} from "../aiGatewayKeyCheck";

const saved = { key: process.env.AI_GATEWAY_INTERNAL_KEY, url: process.env.AI_GATEWAY_URL };
const setEnv = (name: string, value: string | undefined) => {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
};
const log = { warn: jest.fn() };
const fetchMock: jest.Mock<(...args: any[]) => Promise<any>> = jest.fn();
let originalFetch: typeof globalThis.fetch;

beforeEach(() => {
  log.warn.mockReset();
  fetchMock.mockReset();
  originalFetch = globalThis.fetch;
  (globalThis as any).fetch = fetchMock;
  resetGatewayKeyWarning();
  setEnv("AI_GATEWAY_INTERNAL_KEY", undefined);
  setEnv("AI_GATEWAY_URL", undefined);
});
afterEach(() => {
  globalThis.fetch = originalFetch;
  setEnv("AI_GATEWAY_INTERNAL_KEY", saved.key);
  setEnv("AI_GATEWAY_URL", saved.url);
});

describe("warnIfGatewayKeyMissing", () => {
  it("stays quiet when the key is set, without probing", async () => {
    setEnv("AI_GATEWAY_INTERNAL_KEY", "k");
    expect(await warnIfGatewayKeyMissing(log)).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(log.warn).not.toHaveBeenCalled();
  });

  it("warns when AI_GATEWAY_URL is set, without probing", async () => {
    setEnv("AI_GATEWAY_URL", "http://gw:8100");
    expect(await warnIfGatewayKeyMissing(log)).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(log.warn).toHaveBeenCalledWith(expect.stringContaining("AI_GATEWAY_URL is set"));
  });

  it("warns when a gateway answers /health at the default address", async () => {
    fetchMock.mockResolvedValue({ ok: true });
    expect(await warnIfGatewayKeyMissing(log)).toBe(true);
    const [url, init] = fetchMock.mock.calls[0] as [string, any];
    expect(url).toBe("http://127.0.0.1:8100/health");
    expect(init.signal).toBeDefined();
    expect(GATEWAY_HEALTH_TIMEOUT_MS).toBe(2_000);
    expect(log.warn).toHaveBeenCalledWith(
      expect.stringContaining("an AI Gateway answers at the default address"),
    );
  });

  it.each([
    ["the probe fails", () => fetchMock.mockRejectedValue(new Error("ECONNREFUSED"))],
    ["the probe times out", () => fetchMock.mockRejectedValue(new Error("TimeoutError"))],
    ["the gateway is unhealthy", () => fetchMock.mockResolvedValue({ ok: false })],
  ])("stays quiet when %s", async (_case, arrange) => {
    arrange();
    expect(await warnIfGatewayKeyMissing(log)).toBe(false);
    expect(log.warn).not.toHaveBeenCalled();
  });

  it("logs at most once per process", async () => {
    setEnv("AI_GATEWAY_URL", "http://gw:8100");
    await warnIfGatewayKeyMissing(log);
    await warnIfGatewayKeyMissing(log);
    expect(log.warn).toHaveBeenCalledTimes(1);
  });
});
