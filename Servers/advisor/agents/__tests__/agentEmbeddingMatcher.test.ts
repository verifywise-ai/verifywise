/**
 * agentEmbeddingMatcher — pure-logic unit tests.
 *
 * Covers the deterministic helpers that don't touch the DB or the
 * embedding provider:
 *   - cosineSimilarity()
 *   - buildAgentSourceText()
 *
 * The DB-cache + ranking pipeline is exercised by the manual smoke test
 * (a real OpenAI key is needed for embed/embedMany calls).
 */

import { describe, expect, it } from "@jest/globals";
import { cosineSimilarity, buildAgentSourceText } from "../agentEmbeddingMatcher";
import { AGENT_TOOL_MAP } from "../agentToolMap";

/* ------------------------------------------------------------------ */
/* cosineSimilarity                                                   */
/* ------------------------------------------------------------------ */

describe("agentEmbeddingMatcher / cosineSimilarity", () => {
  it("returns 1 for identical unit vectors", () => {
    expect(cosineSimilarity([1, 0, 0], [1, 0, 0])).toBeCloseTo(1, 6);
  });

  it("returns 0 for orthogonal vectors", () => {
    expect(cosineSimilarity([1, 0, 0], [0, 1, 0])).toBeCloseTo(0, 6);
  });

  it("returns -1 for anti-parallel vectors", () => {
    expect(cosineSimilarity([1, 2, 3], [-1, -2, -3])).toBeCloseTo(-1, 6);
  });

  it("returns 0 for empty input", () => {
    expect(cosineSimilarity([], [])).toBe(0);
  });

  it("returns 0 for length mismatch (defensive)", () => {
    expect(cosineSimilarity([1, 2, 3], [1, 2])).toBe(0);
  });

  it("returns 0 when one input is the zero vector", () => {
    expect(cosineSimilarity([0, 0, 0], [1, 1, 1])).toBe(0);
  });

  it("ranks closer vectors higher than orthogonal ones", () => {
    const target = [1, 1, 0];
    const closer = [1, 0.95, 0.1];
    const orthogonal = [0, 0, 1];
    expect(cosineSimilarity(target, closer)).toBeGreaterThan(cosineSimilarity(target, orthogonal));
  });

  it("is symmetric", () => {
    const a = [0.3, 0.5, 0.7];
    const b = [0.1, 0.9, 0.4];
    expect(cosineSimilarity(a, b)).toBeCloseTo(cosineSimilarity(b, a), 6);
  });
});

/* ------------------------------------------------------------------ */
/* buildAgentSourceText                                               */
/* ------------------------------------------------------------------ */

describe("agentEmbeddingMatcher / buildAgentSourceText", () => {
  const VENDOR_AGENT = AGENT_TOOL_MAP.find((a) => a.name === "vendor-agent")!;

  it("concatenates name, keywords, and capability hints", () => {
    const text = buildAgentSourceText(VENDOR_AGENT);
    expect(text).toContain("Agent: vendor-agent");
    expect(text).toContain("Keywords:");
    expect(text).toContain("Capabilities:");
    // Vendor-specific keyword should appear:
    expect(text.toLowerCase()).toContain("vendor");
    // A vendor tool name (with prefix-stripped, underscores → spaces) too:
    expect(text.toLowerCase()).toContain("fetch vendors");
  });

  it("strips agent_ prefix from tool names in the capability hints", () => {
    const text = buildAgentSourceText(VENDOR_AGENT);
    // Original tool: "agent_create_vendor" → "create vendor" in hints
    expect(text).toContain("create vendor");
    // The agent_ prefix should be gone in the rendered hints:
    expect(text).not.toContain("agent_create_vendor");
  });

  it("caps capability hints to first 25 tools", () => {
    const fakeAgent = {
      name: "test-agent",
      keywords: ["test"],
      tools: Array.from({ length: 50 }, (_, i) => `tool_${i}`),
    };
    const text = buildAgentSourceText(fakeAgent);
    // Tool 24 should appear; 49 should not (above the cap):
    expect(text).toContain("tool 24");
    expect(text).not.toContain("tool 49");
  });

  it("is deterministic — same input → same output", () => {
    const a = buildAgentSourceText(VENDOR_AGENT);
    const b = buildAgentSourceText(VENDOR_AGENT);
    expect(a).toBe(b);
  });

  it("produces distinct text for different agents", () => {
    const vendor = buildAgentSourceText(AGENT_TOOL_MAP.find((a) => a.name === "vendor-agent")!);
    const risk = buildAgentSourceText(AGENT_TOOL_MAP.find((a) => a.name === "risk-agent")!);
    expect(vendor).not.toBe(risk);
  });
});

/* ------------------------------------------------------------------ */
/* AGENT_TOOL_MAP integrity (catches drift)                            */
/* ------------------------------------------------------------------ */

describe("agentEmbeddingMatcher / AGENT_TOOL_MAP integrity", () => {
  it("every agent has a non-empty name, keywords, and tools list", () => {
    for (const a of AGENT_TOOL_MAP) {
      expect(a.name.length).toBeGreaterThan(0);
      expect(a.keywords.length).toBeGreaterThan(0);
      expect(a.tools.length).toBeGreaterThan(0);
    }
  });

  it("agent names are unique", () => {
    const names = AGENT_TOOL_MAP.map((a) => a.name);
    const uniq = new Set(names);
    expect(uniq.size).toBe(names.length);
  });

  it("buildAgentSourceText output is non-empty for every agent", () => {
    for (const a of AGENT_TOOL_MAP) {
      const text = buildAgentSourceText(a);
      expect(text.length).toBeGreaterThan(20);
    }
  });
});
