import { renderHook } from "@testing-library/react";
import type { PropsWithChildren } from "react";
import { Provider } from "react-redux";
import { configureStore, combineReducers } from "@reduxjs/toolkit";
import authReducer from "../../../../application/redux/auth/authSlice";

// useLocalRuntime normally wraps the adapter in a full assistant-ui runtime.
// For testing the adapter's streaming logic directly, return the adapter
// itself so the test can call `.run(...)` on it.
vi.mock("@assistant-ui/react", () => ({
  useLocalRuntime: (adapter: any) => adapter,
}));

import { usePlaygroundRuntime } from "./usePlaygroundRuntime";

function wrapper({ children }: PropsWithChildren) {
  const store = configureStore({
    reducer: combineReducers({ auth: authReducer }),
    preloadedState: {
      auth: {
        isLoading: false,
        authToken: "test-token",
        user: "",
        userExists: false,
        success: null,
        message: null,
        expirationDate: null,
      } as any,
    },
  });
  return <Provider store={store}>{children}</Provider>;
}

/** Build a fetch Response-like object simulating the SSE stream shape. */
function makeSSEResponse(lines: string[], opts: { ok?: boolean; status?: number } = {}) {
  const { ok = true, status = 200 } = opts;
  if (!ok) {
    return { ok: false, status, text: async () => lines.join("") };
  }
  const encoder = new TextEncoder();
  const encoded = lines.map((l) => encoder.encode(l));
  let i = 0;
  const reader = {
    read: vi.fn(async () => {
      if (i < encoded.length) return { done: false, value: encoded[i++] };
      return { done: true, value: undefined };
    }),
    releaseLock: vi.fn(),
  };
  return { ok: true, status, body: { getReader: () => reader } };
}

async function collect(iterable: AsyncGenerator<any>) {
  const results = [];
  for await (const chunk of iterable) results.push(chunk);
  return results;
}

describe("usePlaygroundRuntime", () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("yields a prompt to select an endpoint when configRef has no endpointSlug", async () => {
    const configRef = { current: { endpointSlug: "", temperature: 0.7, maxTokens: 1000 } };
    const { result } = renderHook(() => usePlaygroundRuntime(configRef as any), { wrapper });
    const adapter = result.current as any;

    const chunks = await collect(
      adapter.run({ messages: [], abortSignal: new AbortController().signal }),
    );

    expect(chunks).toEqual([{ content: [{ type: "text", text: "Select an endpoint first." }] }]);
  });

  it("streams accumulated content deltas from the SSE response", async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValue(
        makeSSEResponse([
          'data: {"choices":[{"delta":{"content":"Hel"}}]}\n\n',
          'data: {"cost_usd":0.001}\n\n',
          'data: {"choices":[{"delta":{"content":"lo"}}]}\n\n',
          "data: [DONE]\n\n",
        ]),
      );
    const configRef = {
      current: { endpointSlug: "prod", temperature: 0.5, maxTokens: 500 },
    };
    const { result } = renderHook(() => usePlaygroundRuntime(configRef as any), { wrapper });
    const adapter = result.current as any;

    const chunks = await collect(
      adapter.run({
        messages: [{ role: "user", content: [{ type: "text", text: "Hi" }] }],
        abortSignal: new AbortController().signal,
      }),
    );

    expect(chunks).toEqual([
      { content: [{ type: "text", text: "Hel" }] },
      { content: [{ type: "text", text: "Hello" }] },
    ]);
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/ai-gateway/chat/stream"),
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ Authorization: "Bearer test-token" }),
      }),
    );
  });

  it("yields a guardrail-blocked message when the response is not ok with guardrail_blocked", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      makeSSEResponse([JSON.stringify({ guardrail_blocked: true, message: "PII detected" })], {
        ok: false,
        status: 403,
      }),
    );
    const configRef = { current: { endpointSlug: "prod", temperature: 0.5, maxTokens: 500 } };
    const { result } = renderHook(() => usePlaygroundRuntime(configRef as any), { wrapper });
    const adapter = result.current as any;

    const chunks = await collect(
      adapter.run({ messages: [], abortSignal: new AbortController().signal }),
    );

    expect(chunks).toEqual([
      { content: [{ type: "text", text: "Blocked by guardrail: PII detected" }] },
    ]);
  });

  it("yields the parsed error message when the response is not ok without guardrail_blocked", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      makeSSEResponse([JSON.stringify({ message: "Endpoint not found" })], {
        ok: false,
        status: 404,
      }),
    );
    const configRef = { current: { endpointSlug: "prod", temperature: 0.5, maxTokens: 500 } };
    const { result } = renderHook(() => usePlaygroundRuntime(configRef as any), { wrapper });
    const adapter = result.current as any;

    const chunks = await collect(
      adapter.run({ messages: [], abortSignal: new AbortController().signal }),
    );

    expect(chunks).toEqual([{ content: [{ type: "text", text: "Endpoint not found" }] }]);
  });

  it("falls back to a raw status/text error when the error body isn't JSON", async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValue(makeSSEResponse(["Internal Server Error"], { ok: false, status: 500 }));
    const configRef = { current: { endpointSlug: "prod", temperature: 0.5, maxTokens: 500 } };
    const { result } = renderHook(() => usePlaygroundRuntime(configRef as any), { wrapper });
    const adapter = result.current as any;

    const chunks = await collect(
      adapter.run({ messages: [], abortSignal: new AbortController().signal }),
    );

    expect(chunks).toEqual([
      { content: [{ type: "text", text: "Error 500: Internal Server Error" }] },
    ]);
  });

  it("yields a no-response-body message when the response has no readable body", async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, body: null });
    const configRef = { current: { endpointSlug: "prod", temperature: 0.5, maxTokens: 500 } };
    const { result } = renderHook(() => usePlaygroundRuntime(configRef as any), { wrapper });
    const adapter = result.current as any;

    const chunks = await collect(
      adapter.run({ messages: [], abortSignal: new AbortController().signal }),
    );

    expect(chunks).toEqual([{ content: [{ type: "text", text: "No response body" }] }]);
  });

  it("silently skips malformed SSE lines and non-text message parts", async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValue(
        makeSSEResponse([
          "data: {not valid json\n\n",
          'data: {"choices":[{"delta":{}}]}\n\n',
          'data: {"choices":[{"delta":{"content":"ok"}}]}\n\n',
          "data: [DONE]\n\n",
        ]),
      );
    const configRef = { current: { endpointSlug: "prod", temperature: 0.5, maxTokens: 500 } };
    const { result } = renderHook(() => usePlaygroundRuntime(configRef as any), { wrapper });
    const adapter = result.current as any;

    const chunks = await collect(
      adapter.run({
        messages: [
          {
            role: "user",
            content: [
              { type: "image", url: "x" },
              { type: "text", text: "hi" },
            ],
          },
        ],
        abortSignal: new AbortController().signal,
      }),
    );

    expect(chunks).toEqual([{ content: [{ type: "text", text: "ok" }] }]);
  });
});
