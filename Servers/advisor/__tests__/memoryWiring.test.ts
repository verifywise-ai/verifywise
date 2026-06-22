/**
 * Memory wire-up — pure-logic unit tests.
 *
 * Covers the deterministic helpers that gate / shape the memory
 * persistence pipeline:
 *   - memoryEnabled() — guards every memory write/read
 *   - extractLatestUserContent() — pulls the user turn from the messages
 *     array or userPrompt fallback
 *
 * The DB-side helpers (saveMessage, getMessages, clearUserMemory) are
 * exercised by the integration test step 8 (manual 2-turn verification)
 * since mocking Sequelize from inside the SDK pipeline is brittle.
 */

import { describe, expect, it } from "@jest/globals";
import { memoryEnabled, extractLatestUserContent, AiSdkAdvisorParams } from "../aiSdkAgent";

/**
 * Build a minimal valid params object so tests only express the deltas
 * they care about.
 */
function makeParams(overrides: Partial<AiSdkAdvisorParams> = {}): AiSdkAdvisorParams {
  return {
    apiKey: "test-key",
    baseURL: "https://example.test",
    model: "test-model",
    userPrompt: "",
    tenant: 1,
    userId: 42,
    availableTools: {},
    toolsDefinition: [],
    provider: "Anthropic",
    sessionId: "session-abc",
    agentName: "advisor",
    ...overrides,
  };
}

/* ------------------------------------------------------------------ */
/* memoryEnabled                                                      */
/* ------------------------------------------------------------------ */

describe("aiSdkAgent / memoryEnabled", () => {
  it("returns true when tenant + userId + sessionId are all present", () => {
    expect(memoryEnabled(makeParams())).toBe(true);
  });

  it("returns false when sessionId is missing", () => {
    expect(memoryEnabled(makeParams({ sessionId: undefined }))).toBe(false);
  });

  it("returns false when sessionId is empty/whitespace", () => {
    expect(memoryEnabled(makeParams({ sessionId: "" }))).toBe(false);
    expect(memoryEnabled(makeParams({ sessionId: "   " }))).toBe(false);
  });

  it("returns false when userId is missing", () => {
    expect(memoryEnabled(makeParams({ userId: undefined }))).toBe(false);
  });

  it("returns false when tenant is 0 or missing", () => {
    expect(memoryEnabled(makeParams({ tenant: 0 }))).toBe(false);
  });

  it("returns false for non-string sessionId types", () => {
    expect(memoryEnabled(makeParams({ sessionId: 123 as any }))).toBe(false);
  });
});

/* ------------------------------------------------------------------ */
/* extractLatestUserContent                                           */
/* ------------------------------------------------------------------ */

describe("aiSdkAgent / extractLatestUserContent", () => {
  it("falls back to userPrompt when no messages array provided", () => {
    expect(extractLatestUserContent(makeParams({ userPrompt: "What is my risk score?" }))).toBe(
      "What is my risk score?",
    );
  });

  it("returns empty string when neither userPrompt nor messages provided", () => {
    expect(extractLatestUserContent(makeParams())).toBe("");
  });

  it("reads the latest user turn from a messages array (string content)", () => {
    const params = makeParams({
      messages: [
        { role: "user", content: "first user turn" },
        { role: "assistant", content: "ack" },
        { role: "user", content: "second user turn" },
      ] as any,
    });
    expect(extractLatestUserContent(params)).toBe("second user turn");
  });

  it("walks back past trailing assistant/tool turns to find the user turn", () => {
    const params = makeParams({
      messages: [
        { role: "user", content: "the actual question" },
        { role: "assistant", content: "thinking..." },
        { role: "tool", content: "tool result" },
      ] as any,
    });
    expect(extractLatestUserContent(params)).toBe("the actual question");
  });

  it("flattens parts arrays into a single text block", () => {
    const params = makeParams({
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: "What about " },
            { type: "text", text: "vendor X?" },
          ],
        },
      ] as any,
    });
    expect(extractLatestUserContent(params)).toBe("What about \nvendor X?");
  });

  it("ignores non-text parts and skips silently", () => {
    const params = makeParams({
      messages: [
        {
          role: "user",
          content: [
            { type: "image", url: "data:..." },
            { type: "text", text: "describe this" },
          ],
        },
      ] as any,
    });
    expect(extractLatestUserContent(params)).toBe("describe this");
  });

  it("returns empty string when messages exist but no user turn is present", () => {
    const params = makeParams({
      messages: [
        { role: "system", content: "you are helpful" },
        { role: "assistant", content: "ack" },
      ] as any,
    });
    expect(extractLatestUserContent(params)).toBe("");
  });

  it("handles plain string user content as the simplest case", () => {
    const params = makeParams({
      messages: [{ role: "user", content: "hello" }] as any,
    });
    expect(extractLatestUserContent(params)).toBe("hello");
  });
});
