const mockFetch = jest.fn();
global.fetch = mockFetch as any;

import { complete, GatewayPromptRefusedError, GatewayRequestError } from "./gatewayClient";

const settings = {
  baseUrl: "https://gateway.example/v1",
  apiKey: "test-key-do-not-log",
  model: "pinned-model-1",
};

const ok = (model: string, text = "generated text") => ({
  ok: true,
  json: async () => ({
    model,
    choices: [{ message: { content: text }, finish_reason: "stop" }],
  }),
});

beforeEach(() => mockFetch.mockReset());

describe("complete", () => {
  it("sends the pinned model and returns the text", async () => {
    mockFetch.mockResolvedValue(ok("pinned-model-1"));
    const out = await complete(settings, "write a resume");
    expect(out.text).toBe("generated text");
    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.model).toBe("pinned-model-1");
  });

  // Review Focus 2
  it("records the model the response actually came from", async () => {
    mockFetch.mockResolvedValue(ok("some-other-model"));
    const out = await complete(settings, "p");
    expect(out.modelObserved).toBe("some-other-model");
    // Credentials do not select the provider, config does. Two prior corpora
    // went through ten and eleven models before anyone noticed, so the
    // observed model is read from the response, never assumed from config.
  });

  it("hashes the prompt so a corpus records what produced each record", async () => {
    mockFetch.mockResolvedValue(ok("pinned-model-1"));
    const a = await complete(settings, "same prompt");
    const b = await complete(settings, "same prompt");
    const c = await complete(settings, "different prompt");
    expect(a.promptHash).toBe(b.promptHash);
    expect(a.promptHash).not.toBe(c.promptHash);
    expect(a.promptHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("authenticates with a bearer token", async () => {
    mockFetch.mockResolvedValue(ok("pinned-model-1"));
    await complete(settings, "p");
    const headers = mockFetch.mock.calls[0][1].headers;
    expect(headers.Authorization).toBe("Bearer test-key-do-not-log");
  });
});

describe("the key never leaks", () => {
  it("is absent from an error raised on a failed request", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => "unauthorized for key test-key-do-not-log",
    });
    await expect(complete(settings, "p")).rejects.toThrow(
      expect.objectContaining({
        message: expect.not.stringContaining("test-key-do-not-log"),
      }) as any,
    );
  });

  it("is absent from an error raised on a network failure", async () => {
    mockFetch.mockRejectedValue(new Error("connect ECONNREFUSED test-key-do-not-log"));
    await expect(complete(settings, "p")).rejects.toThrow(
      expect.objectContaining({
        message: expect.not.stringContaining("test-key-do-not-log"),
      }) as any,
    );
  });

  it("is absent from a thrown error on a malformed response", async () => {
    mockFetch.mockResolvedValue({ ok: true, json: async () => ({ nope: true }) });
    await expect(complete(settings, "p")).rejects.toThrow(/unexpected response/i);
    await expect(complete(settings, "p")).rejects.toThrow(
      expect.objectContaining({
        message: expect.not.stringContaining("test-key-do-not-log"),
      }) as any,
    );
  });
});

describe("retries", () => {
  it("retries a 429 and succeeds", async () => {
    mockFetch
      .mockResolvedValueOnce({ ok: false, status: 429, text: async () => "slow down" })
      .mockResolvedValueOnce(ok("pinned-model-1"));
    const out = await complete(settings, "p", { retries: 1, retryDelayMs: 0 });
    expect(out.text).toBe("generated text");
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("gives up after the configured retries", async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 500, text: async () => "boom" });
    await expect(complete(settings, "p", { retries: 2, retryDelayMs: 0 })).rejects.toThrow(
      /gateway request failed/i,
    );
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });

  it("does not retry a 400", async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 400, text: async () => "bad" });
    await expect(complete(settings, "p", { retries: 3, retryDelayMs: 0 })).rejects.toThrow();
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });
});

describe("finish reason", () => {
  it("is returned, and null when absent", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        model: "m",
        choices: [{ message: { content: "t" }, finish_reason: "length" }],
      }),
    });
    expect((await complete(settings, "p")).finishReason).toBe("length");
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ model: "m", choices: [{ message: { content: "t" } }] }),
    });
    expect((await complete(settings, "p")).finishReason).toBeNull();
  });
});

describe("transport faults", () => {
  it("treats a body-read timeout as a retryable network error, not 'not JSON'", async () => {
    const timeout = Object.assign(new Error("timed out"), { name: "TimeoutError" });
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => {
          throw timeout;
        },
      })
      .mockResolvedValueOnce(ok("pinned-model-1"));
    const out = await complete(settings, "p", { retries: 1, retryDelayMs: 0 });
    expect(out.text).toBe("generated text");
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("reports a JSON SyntaxError as not JSON, without retrying", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => {
        throw new SyntaxError("x test-key-do-not-log");
      },
    });
    await expect(complete(settings, "p", { retries: 2, retryDelayMs: 0 })).rejects.toThrow(
      /not JSON/,
    );
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("cancels the body of a non-ok response before retrying and before throwing", async () => {
    const cancel = jest.fn().mockResolvedValue(undefined);
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
      body: { cancel },
      text: async () => "x",
    });
    await expect(complete(settings, "p", { retries: 1, retryDelayMs: 0 })).rejects.toThrow();
    expect(cancel).toHaveBeenCalledTimes(2);
    cancel.mockClear();
    mockFetch.mockReset();
    mockFetch.mockResolvedValue({
      ok: false,
      status: 400,
      body: { cancel },
      text: async () => "x",
    });
    await expect(complete(settings, "p", { retries: 3, retryDelayMs: 0 })).rejects.toThrow();
    expect(cancel).toHaveBeenCalledTimes(1);
  });
});

describe("backoff", () => {
  const res429 = (retryAfter: string) => ({
    ok: false,
    status: 429,
    headers: { get: (n: string) => (n === "retry-after" ? retryAfter : null) },
  });

  it("honours Retry-After seconds on a 429", async () => {
    const sleep = jest.fn().mockResolvedValue(undefined);
    mockFetch.mockResolvedValueOnce(res429("7")).mockResolvedValueOnce(ok("pinned-model-1"));
    await complete(settings, "p", { retries: 1, retryDelayMs: 0, sleep });
    expect(sleep).toHaveBeenCalledWith(7000);
  });

  it("honours a Retry-After HTTP date", async () => {
    const sleep = jest.fn().mockResolvedValue(undefined);
    const at = new Date(Date.now() + 20_000).toUTCString();
    mockFetch.mockResolvedValueOnce(res429(at)).mockResolvedValueOnce(ok("pinned-model-1"));
    await complete(settings, "p", { retries: 1, retryDelayMs: 0, sleep });
    const waited = sleep.mock.calls[0][0];
    expect(waited).toBeGreaterThan(17_000);
    expect(waited).toBeLessThanOrEqual(20_000);
  });

  it("caps Retry-After at 60 seconds", async () => {
    const sleep = jest.fn().mockResolvedValue(undefined);
    mockFetch.mockResolvedValueOnce(res429("3600")).mockResolvedValueOnce(ok("pinned-model-1"));
    await complete(settings, "p", { retries: 1, retryDelayMs: 0, sleep });
    expect(sleep).toHaveBeenCalledWith(60_000);
  });

  it("backs off exponentially with jitter otherwise", async () => {
    const sleep = jest.fn().mockResolvedValue(undefined);
    mockFetch.mockResolvedValue({ ok: false, status: 500 });
    await expect(
      complete(settings, "p", { retries: 2, retryDelayMs: 100, sleep }),
    ).rejects.toThrow();
    const [first, second] = sleep.mock.calls.map((c) => c[0]);
    expect(first).toBeGreaterThanOrEqual(50);
    expect(first).toBeLessThanOrEqual(100);
    expect(second).toBeGreaterThanOrEqual(100);
    expect(second).toBeLessThanOrEqual(200);
  });
});

describe("refusals", () => {
  it.each([400, 403, 422])(
    "reports a content refusal (%s) as a refusal of this prompt",
    async (status) => {
      mockFetch.mockResolvedValue({
        ok: false,
        status,
        text: async () => '{"error":{"code":"content_filter","message":"flagged"}}',
      });
      const err = await complete(settings, "p", { retries: 2, retryDelayMs: 0 }).catch((e) => e);
      expect(err).toBeInstanceOf(GatewayPromptRefusedError);
      expect(err.status).toBe(status);
      // Not retried: the same prompt would be refused again.
      expect(mockFetch).toHaveBeenCalledTimes(1);
    },
  );

  it.each([
    '{"error":{"code":"content_policy_violation","message":"rejected by our safety system"}}',
    // Google's status name must not hide a content refusal.
    '{"error":{"message":"Blocked by content policy","status":"INVALID_ARGUMENT"}}',
    '{"error":{"message":"Blocked by content filter","code":"invalid_argument"}}',
    '{"error":{"message":"litellm.BadRequestError: {\\"error\\": {\\"message\\": \\"Blocked by content policy\\", \\"status\\": \\"INVALID_ARGUMENT\\"}}"}}',
  ])("reports a provider content block as a refusal of this prompt: %s", async (body) => {
    mockFetch.mockResolvedValue({ ok: false, status: 400, text: async () => body });
    const err = await complete(settings, "p", { retries: 2, retryDelayMs: 0 }).catch((e) => e);
    expect(err).toBeInstanceOf(GatewayPromptRefusedError);
  });

  it.each([
    '{"detail":"Request blocked by guardrail: pii: PERSON detected"}',
    '{"detail":"Request blocked by guardrail: pii: SYSTEM_ERROR detected"}',
    '{"detail":"Request blocked by guardrail: content_filter: policy violation"}',
    '{"error":{"message":"Violated guardrail policy"}}',
    '{"error":{"code":"guardrail_intervened","message":"content blocked"}}',
    '{"detail":"Request blocked by guardrail: custom_regex: invalid argument field detected"}',
  ])("fails the corpus, resumably, on an AI Gateway guardrail block: %s", async (body) => {
    mockFetch.mockResolvedValue({ ok: false, status: 400, text: async () => body });
    const err = await complete(settings, "p", { retries: 2, retryDelayMs: 0 }).catch((e) => e);
    expect(err).toBeInstanceOf(GatewayRequestError);
    expect(err.code).toBe("gateway_guardrail");
    expect(err.message).not.toContain("PERSON");
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it.each([
    [400, '{"error":"invalid model id"}'],
    [401, "unauthorized"],
    [402, "Budget limit exceeded"],
    [403, "forbidden"],
    [404, "not found"],
    [413, "too large"],
    [400, '{"error":{"message":"Unknown parameter: safety_identifier"}}'],
    [400, '{"error":{"message":"Invalid argument: safety_settings must be a list"}}'],
    [400, '{"error":{"message":"moderation is not enabled for this deployment"}}'],
    [400, '{"error":{"message":"Unknown parameter: content_filter_mode"}}'],
    [400, '{"error":{"message":"Unknown field: content_filter_config"}}'],
    [400, '{"error":{"message":"Unsupported argument: content_moderation"}}'],
    [400, '{"error":{"message":"The guardrail identifier or version provided does not exist"}}'],
    [400, '{"error":{"message":"Unknown parameter: guardrailConfig"}}'],
  ])("reports a %s that is not a content refusal as a deployment fault", async (status, body) => {
    mockFetch.mockResolvedValue({ ok: false, status, text: async () => body });
    const err = await complete(settings, "p", { retries: 2, retryDelayMs: 0 }).catch((e) => e);
    expect(err).toBeInstanceOf(GatewayRequestError);
    expect(err).not.toBeInstanceOf(GatewayPromptRefusedError);
    expect(err.message).not.toContain(body);
  });

  it("retries a 408 as a transient fault", async () => {
    mockFetch
      .mockResolvedValueOnce({ ok: false, status: 408, text: async () => "" })
      .mockResolvedValueOnce(ok("pinned-model-1"));
    const out = await complete(settings, "p", { retries: 2, retryDelayMs: 0 });
    expect(out.modelObserved).toBe("pinned-model-1");
  });
});
