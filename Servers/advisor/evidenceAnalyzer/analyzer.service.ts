/**
 * Evidence Analyzer — Main orchestrator.
 *
 * Pipeline:
 *   1. Normalize document (whitespace + control chars + truncation).
 *   2. If document is unanalyzably short, abstain with low scores.
 *   3. LLM call (generateObject, temperature 0) → semantic dimensions
 *      + document signals + abstain_reason.
 *   4. Compute recency deterministically (file age + expiry).
 *   5. Compute reliability deterministically (file metadata + LLM signals).
 *   6. Compute overall via weighted formula:
 *      0.30·R + 0.25·C + 0.15·Re + 0.15·Rl + 0.15·Sp
 *   7. Semantic control matching (separate LLM call).
 *   8. Return AnalyzeResult, ready for upsert by the controller.
 *
 * Determinism:
 *   - temperature 0 on both LLM calls.
 *   - Maps + sorts produce stable orderings.
 *   - Recency / reliability / overall are pure functions.
 *   - Same document + same metadata → same overall score (±tiny LLM drift).
 */

import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import logger from "../../utils/logger/fileLogger";
import { generateObjectWithSelfCorrection } from "../llmSelfCorrect";
import { llmAnalysisSchema, type LLMAnalysisOutput } from "./schema";
import { buildAnalyzerSystemPrompt, buildAnalyzerUserPrompt, ANALYZER_VERSION } from "./prompts";
import { computeRecency, type RecencyResult } from "./recency";
import { computeReliability, type ReliabilityResult } from "./reliability";
import { matchControlsSemantic, type MatchedControl } from "./controlMatcher";

export interface AnalyzerInput {
  documentText: string;
  filename: string;
  fileType: string;
  fileSizeBytes?: number | null;
  uploadDate: Date | string | null;
  expiryDate: Date | string | null;
  parseFidelity?: "high" | "medium" | "low";
  llmKey: {
    apiKey: string;
    baseURL: string;
    model: string;
    provider: "Anthropic" | "OpenAI" | "OpenRouter" | "Custom";
    headers?: Record<string, string>;
  };
}

export interface AnalyzerResult {
  summary: string;
  key_findings: string[];
  compliance_areas: string[];
  quality_score: {
    relevance: number;
    completeness: number;
    recency: number;
    reliability: number;
    specificity: number;
  };
  overall_quality_score: number;
  suggested_control_links: Array<{
    control_id: number;
    control_title: string;
    framework_type: string;
    match_score: number;
    matched_areas: string[];
  }>;
  analysis_model: string;
  /**
   * Audit trail — non-rendered metadata kept for debugging and
   * cross-run reproducibility checks.
   */
  audit: {
    analyzer_version: string;
    rationales: {
      relevance: string;
      completeness: string;
      specificity: string;
      recency: string;
      reliability: string;
    };
    abstain_reason: string | null;
    document_signals: LLMAnalysisOutput["document_signals"];
    char_count: number;
    truncated: boolean;
    findings_with_quotes: Array<{
      text: string;
      evidence_quote: string;
      relevance: "primary" | "supporting" | "tangential";
    }>;
  };
}

/* ------------------------------------------------------------------ */
/* Document normalization                                             */
/* ------------------------------------------------------------------ */

const MAX_DOC_CHARS = 12000;
const TAIL_KEEP_CHARS = 1500;
const MIN_USEFUL_CHARS = 250;

function normalizeDocument(raw: string): {
  text: string;
  truncated: boolean;
  charCount: number;
} {
  // Strip control chars except newlines and tabs.
  let cleaned = raw
    // eslint-disable-next-line no-control-regex
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "")
    .replace(/ /g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\r\n?/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  let truncated = false;
  if (cleaned.length > MAX_DOC_CHARS) {
    truncated = true;
    const head = cleaned.slice(0, MAX_DOC_CHARS - TAIL_KEEP_CHARS);
    const tail = cleaned.slice(-TAIL_KEEP_CHARS);
    cleaned = `${head}\n\n[... content truncated ...]\n\n${tail}`;
  }

  return { text: cleaned, truncated, charCount: cleaned.length };
}

/* ------------------------------------------------------------------ */
/* Model factory                                                      */
/* ------------------------------------------------------------------ */

function createModel(key: AnalyzerInput["llmKey"]) {
  if (key.provider === "Anthropic") {
    return createAnthropic({
      apiKey: key.apiKey,
      baseURL: key.baseURL || undefined,
      headers: key.headers,
    })(key.model);
  }
  return createOpenAI({
    apiKey: key.apiKey,
    baseURL: key.baseURL,
    headers: key.headers,
  })(key.model);
}

/* ------------------------------------------------------------------ */
/* Anti-inflation guardrails                                          */
/* ------------------------------------------------------------------ */

/**
 * Detect "execution evidence" — proof that the document records actions
 * already taken, not just future intent. Used to cap relevance and
 * completeness at 90 for purely forward-looking policy documents.
 *
 * Static header fields like "Approved By: Board of Directors" alone do
 * NOT count — every policy has those. We require past-tense action with
 * a date, an explicit audit/log table, or completed-action language.
 */
export function hasExecutionEvidence(documentText: string): boolean {
  const text = documentText.toLowerCase();
  const patterns = [
    // Past-tense action verbs near dates: "audit performed on Jan 5"
    /\b(audit(ed)?|review(ed)?|assessment|conformity assessment|dpia)\s+(was\s+)?(performed|conducted|completed|signed|carried out)\s+(on|by)\s+\w+/,
    // Reverse order: "performed monthly bias audit on 2026-01-15"
    /\b(performed|conducted|completed|carried out)\s+(an? |the )?(audit|review|assessment|dpia|conformity check)\s+on\s+\w+/,
    // Explicit log/history blocks
    /(audit log|review history|signoff history|exception log|completed audit|past reviews?|review record|incident log entry)/,
    // Past-tense execution indicator with date pattern
    /\b(was|were)\s+(audited|reviewed|approved|completed|conducted|signed)\s+(on|by)\s+\w+\s+\d/,
    // KPI tracker / measured outcomes
    /\b(achieved|measured|recorded|observed)\s+\d+(\.\d+)?\s*%/,
    // Reference to specific past-period results
    /(in\s+)?q[1-4]\s+\d{4}.*(audit|review|assessment)/,
    // Embedded review log table indicators
    /\|\s*(date|reviewer|outcome|status|signoff)\s*\|/,
  ];
  return patterns.some((p) => p.test(text));
}

/**
 * Detect quantified numerical thresholds in the document.
 * Tier 100 specificity requires at least 2 numerical thresholds beyond
 * trivial dates. Examples that count: "<5%", "≤24h", "99.5% uptime",
 * "0.95 F1 score", "within 30 days", "max 100 ms".
 *
 * Excludes: years (1900-2100), dates, version numbers, simple counts in lists.
 */
export function countNumericalThresholds(documentText: string): number {
  const text = documentText.toLowerCase();
  const patterns = [
    // Percentage with comparison: "<5%", "≥99.5%", "max 95 percent"
    /[<>≤≥]\s*\d+(\.\d+)?\s*%/g,
    /\d+(\.\d+)?\s*%\s*(uptime|accuracy|precision|recall|bias|drift|error|sla|threshold|floor|ceiling|target|max(imum)?|min(imum)?)/g,
    // Time thresholds: "≤24h", "within 30 days", "max 100ms"
    /(within|max(imum)?|less than|no more than|≤|<=)\s*\d+\s*(ms|s|sec|second|min|minute|hour|h|day|week|month)/g,
    // F1 / model perf scores: "F1 score 0.95", "≥0.85 AUC"
    /(f1|auc|precision|recall|accuracy)\s*(score)?\s*[≥≤<>=]+\s*\d/g,
    /[≥≤<>=]+\s*\d+(\.\d+)?\s*(f1|auc)/g,
    // Latency / throughput numerical SLAs
    /\d+(\.\d+)?\s*(ms|qps|rps|requests per second|tokens per second)/g,
  ];
  let total = 0;
  for (const p of patterns) {
    const matches = text.match(p);
    if (matches) total += matches.length;
  }
  return total;
}

/**
 * Apply post-LLM caps based on deterministic textual evidence.
 * The LLM may inflate scores; this acts as a defense-in-depth ceiling.
 */
export function applyAntiInflationCaps(
  scores: { relevance: number; completeness: number; specificity: number },
  documentText: string,
): {
  scores: typeof scores;
  cappedNotes: string[];
} {
  const notes: string[] = [];
  const out = { ...scores };

  // Execution-evidence cap — pure policy-intent documents (forward-looking
  // 'shall'/'will'/'must' language without completed-action artifacts) cannot
  // exceed tier 90 on relevance OR completeness, no matter how thorough.
  const hasExecution = hasExecutionEvidence(documentText);
  if (!hasExecution) {
    if (out.relevance > 90) {
      const before = out.relevance;
      out.relevance = 90;
      notes.push(
        `relevance capped ${before}→90: no execution evidence detected (forward-looking policy intent only — no completed audits, signed reviews, or executed assessments embedded)`,
      );
    }
    if (out.completeness > 90) {
      const before = out.completeness;
      out.completeness = 90;
      notes.push(
        `completeness capped ${before}→90: no execution evidence (no completed audit logs, signed review history, exception reports, or populated KPI tracker)`,
      );
    }
  }

  // Specificity numerical-threshold cap — requires ≥ 2 quantified thresholds
  // beyond dates/versions for tier 100; otherwise 90 ceiling.
  const thresholdCount = countNumericalThresholds(documentText);
  if (out.specificity > 90 && thresholdCount < 2) {
    const before = out.specificity;
    out.specificity = 90;
    notes.push(
      `specificity capped ${before}→90: only ${thresholdCount} numerical threshold(s) detected — tier > 90 requires ≥ 2 (e.g., '<5%', '≥99.5%', '≤24h')`,
    );
  }

  // All-near-perfect sanity guard — if any TWO semantic dimensions are ≥ 95,
  // drop the highest by 5. Real-world docs rarely deliver across multiple
  // dimensions simultaneously.
  const dims = [
    ["relevance", out.relevance],
    ["completeness", out.completeness],
    ["specificity", out.specificity],
  ] as const;
  const ge95Count = dims.filter(([, v]) => v >= 95).length;
  if (ge95Count >= 2) {
    const ordered = dims.slice().sort((a, b) => b[1] - a[1]);
    const [topDim] = ordered[0];
    const before = out[topDim];
    out[topDim] = Math.max(85, before - 5);
    notes.push(
      `${topDim} dropped ${before}→${out[topDim]} (near-perfect guard: ≥2 semantic dimensions at ≥95)`,
    );
  }

  return { scores: out, cappedNotes: notes };
}

/* ------------------------------------------------------------------ */
/* Overall combine                                                    */
/* ------------------------------------------------------------------ */

const WEIGHTS = {
  relevance: 0.3,
  completeness: 0.25,
  recency: 0.15,
  reliability: 0.15,
  specificity: 0.15,
} as const;

function combineOverall(
  relevance: number,
  completeness: number,
  recency: number,
  reliability: number,
  specificity: number,
): number {
  const value =
    WEIGHTS.relevance * relevance +
    WEIGHTS.completeness * completeness +
    WEIGHTS.recency * recency +
    WEIGHTS.reliability * reliability +
    WEIGHTS.specificity * specificity;
  return Math.round(Math.min(100, Math.max(0, value)));
}

/* ------------------------------------------------------------------ */
/* Abstain path                                                       */
/* ------------------------------------------------------------------ */

function buildAbstainResult(
  reason: string,
  recency: RecencyResult,
  reliability: ReliabilityResult,
  charCount: number,
  modelLabel: string,
): AnalyzerResult {
  const semanticScore = 15;
  const overall = combineOverall(
    semanticScore,
    semanticScore,
    recency.score,
    reliability.score,
    semanticScore,
  );
  return {
    summary: `Insufficient content to score (${reason}).`,
    key_findings: [],
    compliance_areas: [],
    quality_score: {
      relevance: semanticScore,
      completeness: semanticScore,
      recency: recency.score,
      reliability: reliability.score,
      specificity: semanticScore,
    },
    overall_quality_score: overall,
    suggested_control_links: [],
    analysis_model: modelLabel,
    audit: {
      analyzer_version: ANALYZER_VERSION,
      rationales: {
        relevance: `abstained: ${reason}`,
        completeness: `abstained: ${reason}`,
        specificity: `abstained: ${reason}`,
        recency: recency.rationale,
        reliability: reliability.rationale,
      },
      abstain_reason: reason,
      document_signals: {
        document_type: "other",
        has_explicit_dates: false,
        has_named_owner: false,
        has_version: false,
        has_metrics: false,
        is_draft: true,
        authority_signal: 0,
      },
      char_count: charCount,
      truncated: false,
      findings_with_quotes: [],
    },
  };
}

/* ------------------------------------------------------------------ */
/* Public entry                                                       */
/* ------------------------------------------------------------------ */

export async function analyzeEvidence(input: AnalyzerInput): Promise<AnalyzerResult> {
  const { text, truncated, charCount } = normalizeDocument(input.documentText);
  const modelLabel = `${ANALYZER_VERSION}/${input.llmKey.provider}/${input.llmKey.model}`;

  // Compute deterministic dimensions early so they ride through the abstain path.
  const recency = computeRecency({
    uploadDate: input.uploadDate,
    expiryDate: input.expiryDate,
  });

  // Pre-LLM abstain check: not enough content to be worth scoring.
  if (charCount < MIN_USEFUL_CHARS) {
    const reliability = computeReliability({
      llmSignals: {
        document_type: "other",
        has_explicit_dates: false,
        has_named_owner: false,
        has_version: false,
        has_metrics: false,
        is_draft: true,
        authority_signal: 0,
      },
      fileType: input.fileType,
      fileSizeBytes: input.fileSizeBytes,
      parseFidelity: input.parseFidelity,
    });
    return buildAbstainResult(
      `document only ${charCount} characters of usable text`,
      recency,
      reliability,
      charCount,
      modelLabel,
    );
  }

  const model = createModel(input.llmKey);

  // ---- LLM 1: semantic analysis ------------------------------------
  let llmOutput: LLMAnalysisOutput;
  try {
    const result = await generateObjectWithSelfCorrection({
      model,
      schema: llmAnalysisSchema,
      system: buildAnalyzerSystemPrompt(),
      prompt: buildAnalyzerUserPrompt({
        documentText: text,
        filename: input.filename,
        fileType: input.fileType,
        uploadDate: input.uploadDate
          ? new Date(input.uploadDate as any).toISOString().slice(0, 10)
          : null,
        expiryDate: input.expiryDate
          ? new Date(input.expiryDate as any).toISOString().slice(0, 10)
          : null,
        characterCount: charCount,
      }),
      temperature: 0,
      innerMaxRetries: 2,
      maxSelfCorrectionAttempts: 2,
    });
    llmOutput = result.object;
    if (result.selfCorrected) {
      logger.debug(
        `[evidenceAnalyzer] semantic analysis self-corrected after ${result.attempts} attempts`,
      );
    }
  } catch (err) {
    logger.error(
      "[evidenceAnalyzer] semantic analysis LLM call failed (after self-correction budget)",
      err,
    );
    throw err; // controller catches and falls back to heuristic-v1
  }

  // ---- Reliability composite ---------------------------------------
  const reliability = computeReliability({
    llmSignals: llmOutput.document_signals,
    fileType: input.fileType,
    fileSizeBytes: input.fileSizeBytes,
    parseFidelity: input.parseFidelity,
  });

  // ---- LLM-detected abstain (overrides scores even if doc was long enough)
  if (llmOutput.abstain_reason) {
    return buildAbstainResult(
      llmOutput.abstain_reason,
      recency,
      reliability,
      charCount,
      modelLabel,
    );
  }

  // ---- LLM 2: control matching -------------------------------------
  // Embedding pre-filter requires an OpenAI-compatible key (the embedding
  // endpoint is OpenAI's). Only enable it when the primary provider is
  // OpenAI/OpenRouter/Custom — Anthropic doesn't expose embeddings via
  // @ai-sdk/openai. Failure to embed transparently falls back to keyword.
  const embeddingKey =
    input.llmKey.provider === "OpenAI" ||
    input.llmKey.provider === "OpenRouter" ||
    input.llmKey.provider === "Custom"
      ? {
          apiKey: input.llmKey.apiKey,
          baseURL: input.llmKey.baseURL,
          headers: input.llmKey.headers,
        }
      : undefined;

  let controlMatches: MatchedControl[] = [];
  try {
    controlMatches = await matchControlsSemantic({
      model,
      summary: llmOutput.summary,
      keyFindings: llmOutput.key_findings.map((f) => f.text),
      complianceAreas: llmOutput.compliance_areas,
      embeddingKey,
    });
  } catch (err) {
    logger.warn("[evidenceAnalyzer] control matcher failed; continuing without suggestions", err);
  }

  // ---- Apply anti-inflation guardrails ----------------------------
  const rawScores = {
    relevance: llmOutput.semantic_scores.relevance.score,
    completeness: llmOutput.semantic_scores.completeness.score,
    specificity: llmOutput.semantic_scores.specificity.score,
  };
  const { scores: cappedScores, cappedNotes } = applyAntiInflationCaps(rawScores, text);
  const { relevance, completeness, specificity } = cappedScores;

  // Append cap notes onto the corresponding rationale so reviewers can see
  // why a score differs from what the LLM produced.
  const capByDim: Record<string, string[]> = {
    relevance: [],
    completeness: [],
    specificity: [],
  };
  for (const note of cappedNotes) {
    if (note.startsWith("relevance")) capByDim.relevance.push(note);
    else if (note.startsWith("completeness")) capByDim.completeness.push(note);
    else if (note.startsWith("specificity")) capByDim.specificity.push(note);
  }

  const overall = combineOverall(
    relevance,
    completeness,
    recency.score,
    reliability.score,
    specificity,
  );

  return {
    summary: llmOutput.summary,
    key_findings: llmOutput.key_findings.map((f) => f.text),
    compliance_areas: llmOutput.compliance_areas,
    quality_score: {
      relevance,
      completeness,
      recency: recency.score,
      reliability: reliability.score,
      specificity,
    },
    overall_quality_score: overall,
    suggested_control_links: controlMatches.map((m) => ({
      control_id: m.control_id,
      control_title: m.control_title,
      framework_type: m.framework_type,
      match_score: m.match_score,
      matched_areas: m.matched_areas,
    })),
    analysis_model: modelLabel,
    audit: {
      analyzer_version: ANALYZER_VERSION,
      rationales: {
        relevance:
          llmOutput.semantic_scores.relevance.rationale +
          (capByDim.relevance.length > 0 ? ` · ${capByDim.relevance.join("; ")}` : ""),
        completeness:
          llmOutput.semantic_scores.completeness.rationale +
          (capByDim.completeness.length > 0 ? ` · ${capByDim.completeness.join("; ")}` : ""),
        specificity:
          llmOutput.semantic_scores.specificity.rationale +
          (capByDim.specificity.length > 0 ? ` · ${capByDim.specificity.join("; ")}` : ""),
        recency: recency.rationale,
        reliability: reliability.rationale,
      },
      abstain_reason: null,
      document_signals: llmOutput.document_signals,
      char_count: charCount,
      truncated,
      findings_with_quotes: llmOutput.key_findings,
    },
  };
}
