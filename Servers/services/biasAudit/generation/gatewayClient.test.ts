const mockFetch = jest.fn();
global.fetch = mockFetch as any;

import { complete } from "./gatewayClient";

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
