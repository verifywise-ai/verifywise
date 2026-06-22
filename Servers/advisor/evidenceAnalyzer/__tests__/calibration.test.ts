/**
 * Evidence Analyzer — Calibration & determinism tests.
 *
 * These tests guard the deterministic parts of the scoring pipeline so
 * future prompt or rubric changes can be evaluated against fixed
 * baselines:
 *
 *   1. Recency — pure date math; same dates → same score forever.
 *   2. Reliability — pure formula over LLM signals + file metadata.
 *   3. Numerical-threshold counter — regex-only; deterministic.
 *   4. Execution-evidence detector — regex-only; deterministic.
 *   5. Anti-inflation cap orchestration — combines everything above.
 *
 * The full LLM-driven path (semantic dimensions) is NOT tested here
 * because it depends on a network call to a paid provider. Snapshot
 * tests against real LLM output should run nightly with a separate
 * CI step that has API keys configured.
 */

import { describe, expect, it } from "@jest/globals";
import { computeRecency } from "../recency";
import { computeReliability } from "../reliability";
import {
  applyAntiInflationCaps,
  countNumericalThresholds,
  hasExecutionEvidence,
} from "../analyzer.service";
import { cosineSimilarity, buildQueryTextForEmbedding } from "../embeddingMatcher";
import type { LLMAnalysisOutput } from "../schema";

/* ------------------------------------------------------------------ */
/* Recency                                                            */
/* ------------------------------------------------------------------ */

describe("evidenceAnalyzer / recency", () => {
  // Reference time for deterministic age computation across CI environments.
  const NOW = new Date("2026-04-30T00:00:00Z");

  it("returns 100 for a same-day upload", () => {
    const r = computeRecency({
      uploadDate: NOW,
      expiryDate: null,
      now: NOW,
    });
    expect(r.score).toBe(100);
    expect(r.ageDays).toBe(0);
  });

  it("returns 92 for ≤90-day window", () => {
    const r = computeRecency({
      uploadDate: new Date("2026-02-15T00:00:00Z"), // 74 days
      expiryDate: null,
      now: NOW,
    });
    expect(r.score).toBe(92);
  });

  it("returns 72 for ≤365-day window", () => {
    const r = computeRecency({
      uploadDate: new Date("2025-08-01T00:00:00Z"), // ~272 days
      expiryDate: null,
      now: NOW,
    });
    expect(r.score).toBe(72);
  });

  it("returns 15 for documents older than 5 years", () => {
    const r = computeRecency({
      uploadDate: new Date("2018-01-01T00:00:00Z"),
      expiryDate: null,
      now: NOW,
    });
    expect(r.score).toBe(15);
  });

  it("applies expired ×0.4 penalty", () => {
    const r = computeRecency({
      uploadDate: new Date("2026-04-01T00:00:00Z"),
      expiryDate: new Date("2026-04-10T00:00:00Z"), // expired 20d ago
      now: NOW,
    });
    // Base 100 (≤30d) → 100 × 0.4 = 40
    expect(r.score).toBe(40);
    expect(r.daysToExpiry).toBe(-20);
  });

  it("applies near-expiry ×0.85 penalty (≤30d to expiry)", () => {
    const r = computeRecency({
      uploadDate: new Date("2026-04-01T00:00:00Z"),
      expiryDate: new Date("2026-05-15T15:00:00Z"), // 15 days out
      now: NOW,
    });
    // Base 100 × 0.85 = 85
    expect(r.score).toBe(85);
  });

  it("defaults to 40 when upload_date missing", () => {
    const r = computeRecency({
      uploadDate: null,
      expiryDate: null,
      now: NOW,
    });
    expect(r.score).toBe(40);
    expect(r.ageDays).toBeNull();
  });
});

/* ------------------------------------------------------------------ */
/* Reliability                                                        */
/* ------------------------------------------------------------------ */

describe("evidenceAnalyzer / reliability", () => {
  const fullSignals: LLMAnalysisOutput["document_signals"] = {
    document_type: "policy",
    has_explicit_dates: true,
    has_named_owner: true,
    has_version: true,
    has_metrics: true,
    is_draft: false,
    authority_signal: 100,
  };

  it("scores 99 for a fully signed board-approved policy in PDF (formula ceiling, PDF format = 90)", () => {
    const r = computeReliability({
      llmSignals: fullSignals,
      fileType: "application/pdf",
      parseFidelity: "high",
    });
    // 0.5×100 + 0.1×100 + 0.1×100 + 0.1×100 + 0.05×100 + 0.1×90 + 0.05×100 = 99
    expect(r.score).toBe(99);
  });

  it("drops draft documents by 25 points", () => {
    const r = computeReliability({
      llmSignals: { ...fullSignals, is_draft: true },
      fileType: "application/pdf",
      parseFidelity: "high",
    });
    // 99 − 25 = 74
    expect(r.score).toBe(74);
    expect(r.rationale).toContain("draft penalty −25");
  });

  it("scores low for an unsigned text memo", () => {
    const r = computeReliability({
      llmSignals: {
        document_type: "other",
        has_explicit_dates: false,
        has_named_owner: false,
        has_version: false,
        has_metrics: false,
        is_draft: true,
        authority_signal: 20,
      },
      fileType: "text/plain",
      parseFidelity: "high",
    });
    // 0.5×20 + 0+0+0+0 + 0.1×50 + 0.05×100 − 25 = 10+5+5−25 = -5 → 0
    expect(r.score).toBeLessThanOrEqual(5);
  });

  it("penalises sub-1KB files by another 10 points", () => {
    const noDraftSignals: LLMAnalysisOutput["document_signals"] = {
      ...fullSignals,
      is_draft: false,
      authority_signal: 80,
    };
    const baseline = computeReliability({
      llmSignals: noDraftSignals,
      fileType: "application/pdf",
      parseFidelity: "high",
    });
    const tiny = computeReliability({
      llmSignals: noDraftSignals,
      fileType: "application/pdf",
      parseFidelity: "high",
      fileSizeBytes: 512,
    });
    expect(baseline.score - tiny.score).toBe(10);
  });
});

/* ------------------------------------------------------------------ */
/* Numerical-threshold counter                                        */
/* ------------------------------------------------------------------ */

describe("evidenceAnalyzer / countNumericalThresholds", () => {
  it("counts comparison percentages", () => {
    const text = "Bias rate must be < 5% and accuracy >= 99.5%. Drift threshold ≤ 2%.";
    expect(countNumericalThresholds(text)).toBeGreaterThanOrEqual(2);
  });

  it("counts time SLAs", () => {
    const text = "Response within 24 hours. Maximum 100 ms latency. Less than 30 days retention.";
    expect(countNumericalThresholds(text)).toBeGreaterThanOrEqual(2);
  });

  it("counts F1 / model performance thresholds", () => {
    const text = "F1 score ≥ 0.85. Precision >= 0.95. AUC > 0.9.";
    expect(countNumericalThresholds(text)).toBeGreaterThanOrEqual(2);
  });

  it("does not count qualitative scales as thresholds", () => {
    const text = "Risk levels: High, Medium, Low. Likelihood and Impact assessed qualitatively.";
    expect(countNumericalThresholds(text)).toBe(0);
  });

  it("does not count years or document IDs", () => {
    const text = "Effective date: 2026-01-15. Document ID: VW-AIG-POL-001 v3.2. Approved 2026.";
    expect(countNumericalThresholds(text)).toBe(0);
  });
});

/* ------------------------------------------------------------------ */
/* Execution-evidence detector                                        */
/* ------------------------------------------------------------------ */

describe("evidenceAnalyzer / hasExecutionEvidence", () => {
  it("returns true when audit was performed on a date", () => {
    expect(hasExecutionEvidence("DPIA performed on January 15, 2026 by the privacy team.")).toBe(
      true,
    );
  });

  it("returns true when an audit log block is referenced", () => {
    expect(
      hasExecutionEvidence("See audit log below for past reviews. The review history shows..."),
    ).toBe(true);
  });

  it("returns true with past-tense action and date", () => {
    expect(hasExecutionEvidence("System was reviewed on March 10 by the AI lead.")).toBe(true);
  });

  it("returns true with measured numerical outcome", () => {
    expect(hasExecutionEvidence("Achieved 99.7% uptime in production for Q1 2026.")).toBe(true);
  });

  it("returns false for forward-looking 'shall' policy language", () => {
    expect(
      hasExecutionEvidence(
        "All AI systems shall be classified before deployment. Reviews shall be performed every six months.",
      ),
    ).toBe(false);
  });

  it("returns false for static 'Approved By' header alone", () => {
    expect(
      hasExecutionEvidence("Approved By: Board of Directors. Effective Date: March 15, 2026."),
    ).toBe(false);
  });
});

/* ------------------------------------------------------------------ */
/* Anti-inflation cap orchestration                                   */
/* ------------------------------------------------------------------ */

describe("evidenceAnalyzer / applyAntiInflationCaps", () => {
  const policyOnlyDoc =
    "All AI systems shall be classified. The company shall implement appropriate measures. Reviews shall be performed every six months.";

  const operationalDoc =
    "DPIA performed on January 15, 2026 by the privacy team. Audit log: 2026-01-15 — passed; 2026-02-15 — passed. Bias rate < 5% achieved. Response within 24 hours. Accuracy >= 95%.";

  it("caps relevance and completeness at 90 when no execution evidence", () => {
    const { scores, cappedNotes } = applyAntiInflationCaps(
      { relevance: 100, completeness: 100, specificity: 90 },
      policyOnlyDoc,
    );
    expect(scores.relevance).toBeLessThanOrEqual(90);
    expect(scores.completeness).toBeLessThanOrEqual(90);
    expect(cappedNotes.some((n) => n.startsWith("relevance"))).toBe(true);
    expect(cappedNotes.some((n) => n.startsWith("completeness"))).toBe(true);
  });

  it("caps specificity > 90 when fewer than 2 numerical thresholds", () => {
    const { scores, cappedNotes } = applyAntiInflationCaps(
      { relevance: 80, completeness: 80, specificity: 100 },
      policyOnlyDoc,
    );
    expect(scores.specificity).toBe(90);
    expect(cappedNotes.some((n) => n.startsWith("specificity"))).toBe(true);
  });

  it("does NOT cap specificity when ≥ 2 numerical thresholds present", () => {
    const { scores } = applyAntiInflationCaps(
      { relevance: 95, completeness: 95, specificity: 100 },
      operationalDoc,
    );
    // operationalDoc has execution evidence, so relevance/completeness uncapped at 95.
    // specificity stays 100 (≥2 thresholds).
    expect(scores.specificity).toBeGreaterThanOrEqual(95);
  });

  it("near-perfect guard drops the highest dimension by 5 when 2+ ≥95", () => {
    const { scores, cappedNotes } = applyAntiInflationCaps(
      { relevance: 100, completeness: 95, specificity: 95 },
      operationalDoc,
    );
    // No execution-evidence cap (operational doc passes).
    // No threshold cap (operational doc has thresholds).
    // Near-perfect guard: relevance is highest → 100 → 95.
    expect(scores.relevance).toBe(95);
    expect(cappedNotes.some((n) => n.includes("near-perfect"))).toBe(true);
  });

  it("test.docx archetype: board policy w/ no execution → 90/90/90", () => {
    // Simulate the "EU AI Act Compliance Policy" archetype that previously
    // hit 100/100/100 — anchor that it now lands at 90/90/90.
    const { scores } = applyAntiInflationCaps(
      { relevance: 100, completeness: 100, specificity: 100 },
      policyOnlyDoc,
    );
    expect(scores.relevance).toBe(90);
    expect(scores.completeness).toBe(90);
    expect(scores.specificity).toBe(90);
  });

  it("leaves lower scores untouched", () => {
    const { scores, cappedNotes } = applyAntiInflationCaps(
      { relevance: 50, completeness: 40, specificity: 40 },
      "Vague aspirational note. We strive to be ethical somehow.",
    );
    expect(scores).toEqual({ relevance: 50, completeness: 40, specificity: 40 });
    expect(cappedNotes).toHaveLength(0);
  });
});

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
