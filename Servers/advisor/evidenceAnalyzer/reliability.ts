/**
 * Evidence Analyzer — Reliability scoring.
 *
 * Reliability is a hybrid score combining:
 *   1. Deterministic file-metadata signals (mime type, size, parse success).
 *   2. LLM-detected document signals (named owner, version, dates, draft flag,
 *      authority_signal 0-100).
 *
 * Final formula:
 *   reliability = 0.55 * authority_signal
 *               + 0.10 * (has_named_owner ? 100 : 0)
 *               + 0.10 * (has_version ? 100 : 0)
 *               + 0.10 * (has_explicit_dates ? 100 : 0)
 *               + 0.05 * (has_metrics ? 100 : 0)
 *               + 0.10 * fileTypeSignal
 *   - 25 if is_draft
 *
 * Clamp to [0, 100].
 *
 * The deterministic file-type signal favors structured/portable formats
 * (PDF/DOCX > TXT > HTML/Markdown).
 */

import type { LLMAnalysisOutput } from "./schema";

export interface ReliabilityInput {
  llmSignals: LLMAnalysisOutput["document_signals"];
  fileType: string;
  fileSizeBytes?: number | null;
  parseFidelity?: "high" | "medium" | "low";
}

export interface ReliabilityResult {
  score: number;
  rationale: string;
}

function fileTypeScore(fileType: string): number {
  const t = fileType.toLowerCase();
  if (t.includes("pdf") || t.includes("officedocument.wordprocessing") || t.includes("msword")) {
    return 90;
  }
  if (t.includes("officedocument.spreadsheet") || t.includes("excel")) {
    return 80;
  }
  if (t.includes("text/html") || t.includes("markdown")) {
    return 60;
  }
  if (t.includes("text/plain")) {
    return 50;
  }
  if (t.includes("image") || t.includes("png") || t.includes("jpeg")) {
    return 30; // OCR'd images — lower fidelity
  }
  return 50;
}

function parseFidelityScore(fidelity?: "high" | "medium" | "low"): number {
  switch (fidelity) {
    case "high":
      return 100;
    case "medium":
      return 75;
    case "low":
      return 40;
    default:
      return 80;
  }
}

export function computeReliability(input: ReliabilityInput): ReliabilityResult {
  const sig = input.llmSignals;
  const ft = fileTypeScore(input.fileType);
  const pf = parseFidelityScore(input.parseFidelity);
  const reasons: string[] = [];

  let score =
    0.5 * sig.authority_signal +
    0.1 * (sig.has_named_owner ? 100 : 0) +
    0.1 * (sig.has_version ? 100 : 0) +
    0.1 * (sig.has_explicit_dates ? 100 : 0) +
    0.05 * (sig.has_metrics ? 100 : 0) +
    0.1 * ft +
    0.05 * pf;

  reasons.push(`authority ${sig.authority_signal}`);
  reasons.push(
    `signals owner=${sig.has_named_owner ? "✓" : "✗"} version=${
      sig.has_version ? "✓" : "✗"
    } dates=${sig.has_explicit_dates ? "✓" : "✗"} metrics=${sig.has_metrics ? "✓" : "✗"}`,
  );
  reasons.push(`format ${ft}/100`);

  if (sig.is_draft) {
    score -= 25;
    reasons.push("draft penalty −25");
  }

  if (input.fileSizeBytes && input.fileSizeBytes < 1024) {
    score -= 10;
    reasons.push("size <1KB penalty −10");
  }

  const final = Math.min(100, Math.max(0, Math.round(score)));
  return {
    score: final,
    rationale: reasons.join(" · "),
  };
}
