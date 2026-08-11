/**
 * Evidence Analyzer — Embedding helper determinism tests.
 *
 * cosineSimilarity and buildQueryTextForEmbedding are pure: same inputs, same
 * output forever, so they can be pinned to fixed baselines here.
 *
 * The deterministic recency/reliability scorers this file used to cover were
 * removed in 039b0548b ("LLM-driven A–F quality grades in analyzer"), which
 * deleted ../recency and ../reliability and the anti-inflation helpers along
 * with them; their tests went with them. Quality grading is now entirely an
 * LLM judgement and is not testable without a network call to a paid provider
 * — snapshot tests against real output belong in a nightly job that has API
 * keys configured.
 */

import { describe, expect, it } from "@jest/globals";
import { cosineSimilarity, buildQueryTextForEmbedding } from "../embeddingMatcher";

/* ------------------------------------------------------------------ */
/* Embedding helpers                                                  */
/* ------------------------------------------------------------------ */

describe("evidenceAnalyzer / cosineSimilarity", () => {
  it("returns 1 for identical vectors", () => {
    expect(cosineSimilarity([1, 2, 3], [1, 2, 3])).toBeCloseTo(1, 5);
  });

  it("returns 0 for orthogonal vectors", () => {
    expect(cosineSimilarity([1, 0, 0], [0, 1, 0])).toBeCloseTo(0, 5);
  });

  it("returns -1 for opposite vectors", () => {
    expect(cosineSimilarity([1, 2, 3], [-1, -2, -3])).toBeCloseTo(-1, 5);
  });

  it("returns 0 for empty or mismatched vectors", () => {
    expect(cosineSimilarity([], [])).toBe(0);
    expect(cosineSimilarity([1, 2], [1, 2, 3])).toBe(0);
  });

  it("returns 0 when one vector is all zeros", () => {
    expect(cosineSimilarity([0, 0, 0], [1, 1, 1])).toBe(0);
  });

  it("ranks similar vectors close to 1", () => {
    const a = [1, 2, 3];
    const b = [1.1, 2.05, 2.95];
    expect(cosineSimilarity(a, b)).toBeGreaterThan(0.999);
  });
});

describe("evidenceAnalyzer / buildQueryTextForEmbedding", () => {
  it("concatenates summary + findings + areas", () => {
    const text = buildQueryTextForEmbedding({
      summary: "Policy on AI risk management.",
      keyFindings: ["Risk classification mandatory.", "DPIA required."],
      complianceAreas: ["Risk management", "Data governance"],
    });
    expect(text).toContain("Policy on AI risk management.");
    expect(text).toContain("Risk classification mandatory.");
    expect(text).toContain("Risk management, Data governance");
  });

  it("trims findings to first 5", () => {
    const text = buildQueryTextForEmbedding({
      summary: "Sum",
      keyFindings: ["a", "b", "c", "d", "e", "f", "g"],
      complianceAreas: [],
    });
    expect(text.includes("g")).toBe(false);
    expect(text.includes("e")).toBe(true);
  });

  it("ignores empty parts", () => {
    const text = buildQueryTextForEmbedding({
      summary: "Sum",
      keyFindings: [],
      complianceAreas: [],
    });
    expect(text.startsWith("Sum")).toBe(true);
    // Compliance line is always emitted; ensure no double-blank crash.
    expect(text.length).toBeLessThan(80);
  });
});
