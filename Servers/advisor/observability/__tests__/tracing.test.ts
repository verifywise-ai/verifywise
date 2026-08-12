/**
 * Phase 3 — Langfuse tracing wire-up tests.
 *
 * Verifies that the advisor execution path is instrumented with the
 * traceManager: a trace is opened on entry, a span is opened per tool
 * step, the trace is closed on finish, and errors are logged via
 * logError.
 *
 * We mock the `ai` package so `streamText` never touches a real LLM. The
 * mock drives the `onStepFinish` callback with a synthetic tool call and
 * exposes a controllable `text` promise (which we can make reject to test
 * the error path). The traceManager module is mocked so its functions are
 * jest spies — the unit under test is the *wiring*, not Langfuse itself.
 */

import { describe, expect, it, jest, beforeEach } from "@jest/globals";

// ── Mock the AI SDK so no real model call happens ──────────────────
// `streamText` is invoked (after an `await`) inside the run fn; it returns
// an object exposing `text` (a promise) and `fullStream` (an async
// iterable). We capture the `onStepFinish` callback and fire it with a
// synthetic tool call so the span-per-step wiring is exercised. The `text`
// promise resolves/rejects from a module-level value the test sets BEFORE
// invoking the run fn — this sidesteps the `await buildRoutedTools` micro-
// task that runs before streamText, which made an externally-captured
// resolver unreliable.
let nextTextError: unknown | null = null;

jest.mock("ai", () => ({
  streamText: jest.fn((args: any) => {
    if (typeof args.onStepFinish === "function") {
      args.onStepFinish({
        toolCalls: [{ toolName: "fetch_risks", input: { foo: "bar" }, toolCallId: "tc-1" }],
        text: "",
      });
    }
    return {
      get text() {
        return nextTextError ? Promise.reject(nextTextError) : Promise.resolve("done");
      },
      // fullStream isn't consumed by runAdvisorAiSdk, but provide a stub.
      fullStream: (async function* () {})(),
    };
  }),
  tool: (def: any) => def,
  stepCountIs: () => 12,
}));

// ── Mock the traceManager so its functions are observable spies ────
const fakeTrace = { traceId: "trace-1" };
const fakeSpan = { spanId: "span-1" };

jest.mock("../traceManager", () => ({
  startTrace: jest.fn(() => fakeTrace),
  startSpan: jest.fn(() => fakeSpan),
  endSpan: jest.fn(),
  endTrace: jest.fn(),
  logError: jest.fn(),
  logGeneration: jest.fn(),
}));

// ── Mock heavy collaborators so the run fn stays pure ──────────────
jest.mock("../../memory/memoryService", () => ({
  saveMessage: jest.fn(async () => {}),
  getMessages: jest.fn(async () => []),
}));

jest.mock("../../routing", () => ({
  selectActiveTools: jest.fn(async (p: any) => ({
    availableTools: p.availableTools,
    toolsDefinition: p.toolsDefinition,
    selectedAgents: [],
    reason: "test",
    metrics: { activeCount: 0, fullCount: 0, universalCount: 0 },
  })),
}));

jest.mock("../../toolBridge", () => ({
  bridgeTools: jest.fn(() => ({})),
}));

jest.mock("../../prompts", () => ({
  getAdvisorPrompt: () => "system prompt",
  getAdvisorResponsePrompt: () => "response prompt",
}));

// Import AFTER the mocks are registered.
import { runAdvisorAiSdk, type AiSdkAdvisorParams } from "../../aiSdkAgent";
import * as traceManager from "../traceManager";

function makeParams(overrides: Partial<AiSdkAdvisorParams> = {}): AiSdkAdvisorParams {
  return {
    apiKey: "test-key",
    baseURL: "https://example.test",
    model: "test-model",
    userPrompt: "what is my risk score?",
    tenant: 1,
    userId: 42,
    availableTools: {},
    toolsDefinition: [],
    provider: "Anthropic",
    ...overrides,
  };
}

describe("aiSdkAgent / langfuse tracing wiring", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    nextTextError = null;
  });

  it("opens a trace at the start of execution", async () => {
    await runAdvisorAiSdk(makeParams());
    expect(traceManager.startTrace).toHaveBeenCalledTimes(1);
  });

  it("opens a span for each tool step via onStepFinish", async () => {
    await runAdvisorAiSdk(makeParams());
    expect(traceManager.startSpan).toHaveBeenCalled();
    // The span name should reference the tool that ran.
    const names = (traceManager.startSpan as jest.Mock).mock.calls.map((c: any[]) => String(c[1]));
    expect(names.some((n) => n.includes("fetch_risks"))).toBe(true);
  });

  it("closes the trace at the end of execution", async () => {
    await runAdvisorAiSdk(makeParams());
    expect(traceManager.endTrace).toHaveBeenCalledTimes(1);
  });

  it("logs an error via logError when execution throws", async () => {
    nextTextError = new Error("model exploded");
    await expect(runAdvisorAiSdk(makeParams())).rejects.toThrow("model exploded");
    expect(traceManager.logError).toHaveBeenCalled();
    // Trace is still closed even on the error path.
    expect(traceManager.endTrace).toHaveBeenCalled();
  });
});
