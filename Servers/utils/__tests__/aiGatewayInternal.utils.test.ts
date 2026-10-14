import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import { AiGatewayError, aiGatewayRequest } from "../aiGatewayInternal.utils";

const fetchMock: jest.Mock<(...args: any[]) => Promise<any>> = jest.fn();

describe("aiGatewayRequest", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    (global as any).fetch = fetchMock;
  });
  afterEach(() => {
    delete (global as any).fetch;
  });

  it("sends the internal key and the caller's org and role headers", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ settings: {} }) });

    const result = await aiGatewayRequest("GET", "/internal/guardrails/settings", {
      organizationId: 7,
      role: "Admin",
    });

    expect(result).toEqual({ settings: {} });
    const [url, init] = fetchMock.mock.calls[0] as [string, any];
    expect(String(url)).toMatch(/\/internal\/guardrails\/settings$/);
    expect(init.method).toBe("GET");
    expect(init.headers["x-organization-id"]).toBe("7");
    expect(init.headers["x-role"]).toBe("Admin");
    expect(init.headers).toHaveProperty("x-internal-key");
    expect(init.signal).toBeDefined();
    expect(init.body).toBeUndefined();
  });

  it("omits tenant headers when none are given and serialises a body", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({}) });

    await aiGatewayRequest("POST", "/internal/x", { body: { a: 1 } });

    const [, init] = fetchMock.mock.calls[0] as [string, any];
    expect(init.headers).not.toHaveProperty("x-organization-id");
    expect(init.headers).not.toHaveProperty("x-role");
    expect(init.body).toBe(JSON.stringify({ a: 1 }));
  });

  it("forwards the request id when given", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({}) });

    await aiGatewayRequest("PUT", "/internal/x", { requestId: "req-9" });
    await aiGatewayRequest("PUT", "/internal/x");

    expect((fetchMock.mock.calls[0] as [string, any])[1].headers["x-request-id"]).toBe("req-9");
    expect((fetchMock.mock.calls[1] as [string, any])[1].headers).not.toHaveProperty(
      "x-request-id",
    );
  });

  it("uses a custom timeout when given and the default otherwise", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({}) });
    const timeoutSpy = jest.spyOn(AbortSignal, "timeout");

    await aiGatewayRequest("POST", "/internal/x", { timeoutMs: 300_000 });
    await aiGatewayRequest("POST", "/internal/x");

    expect(timeoutSpy).toHaveBeenNthCalledWith(1, 300_000);
    expect(timeoutSpy).toHaveBeenNthCalledWith(2, 10_000);
    timeoutSpy.mockRestore();
  });

  it("throws on a non-2xx response", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 403, text: async () => "nope" });

    await expect(aiGatewayRequest("GET", "/internal/x")).rejects.toThrow(/403/);
  });

  it("carries the status and parsed body on the error", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 400,
      text: async () => JSON.stringify({ detail: "bad value" }),
    });

    const error = (await aiGatewayRequest("PUT", "/internal/x").catch((e) => e)) as AiGatewayError;
    expect(error).toBeInstanceOf(AiGatewayError);
    expect(error.status).toBe(400);
    expect(error.body).toEqual({ detail: "bad value" });
  });

  it("truncates a long upstream body in the error message", async () => {
    const long = "x".repeat(5000);
    fetchMock.mockResolvedValue({ ok: false, status: 500, text: async () => long });

    const error = (await aiGatewayRequest("GET", "/internal/x").catch((e) => e)) as AiGatewayError;
    expect(error.message.length).toBeLessThan(260);
    expect(error.message).toMatch(/x{200}\.\.\.$/);
    expect(error.body).toBe(long);
  });

  it("sends the user id header when given", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({}) });

    await aiGatewayRequest("PUT", "/internal/x", { organizationId: 1, role: "Admin", userId: 9 });

    const [, init] = fetchMock.mock.calls[0] as [string, any];
    expect(init.headers["x-user-id"]).toBe("9");
  });
});

describe("aiGatewayRequest internal key header", () => {
  const savedKey = process.env.AI_GATEWAY_INTERNAL_KEY;
  afterEach(() => {
    if (savedKey === undefined) delete process.env.AI_GATEWAY_INTERNAL_KEY;
    else process.env.AI_GATEWAY_INTERNAL_KEY = savedKey;
    delete (global as any).fetch;
  });

  it("sends the trimmed key, the same value the startup check reads", async () => {
    process.env.AI_GATEWAY_INTERNAL_KEY = "  shared-key\n";
    const fetchSpy: jest.Mock<(...args: any[]) => Promise<any>> = jest.fn();
    fetchSpy.mockResolvedValue({ ok: true, json: async () => ({}) });
    (global as any).fetch = fetchSpy;

    await aiGatewayRequest("GET", "/internal/x");

    const [, init] = fetchSpy.mock.calls[0] as [string, any];
    expect(init.headers["x-internal-key"]).toBe("shared-key");
  });
});
