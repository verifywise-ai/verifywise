/**
 * Evidence Analyzer — Main orchestrator.
 *
 * Pipeline:
 *   1. Normalize document (whitespace + control chars + truncation).
 *   2. If document is unanalyzably short, abstain with F grades.
 *   3. LLM call (generateObject, temperature 0) → A–F grade + rationale for
 *      all five dimensions + a holistic overall grade + abstain_reason.
 *   4. Semantic control matching (separate LLM call).
 *   5. Return AnalyzerResult, ready for upsert by the controller.
 *
 * All quality judgement (including recency and reliability) comes from the
 * LLM. There is no deterministic weighted formula anymore.
 */

import type { QualityGrade } from "../../domain.layer/interfaces/i.evidenceAi";
import logger from "../../utils/logger/fileLogger";
import { generateObjectWithSelfCorrection } from "../llmSelfCorrect";
import { createModelFromKey } from "../llmModelFactory";
import { llmAnalysisSchema, type LLMAnalysisOutput } from "./schema";
import { buildAnalyzerSystemPrompt, buildAnalyzerUserPrompt, ANALYZER_VERSION } from "./prompts";
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
    relevance: QualityGrade;
    completeness: QualityGrade;
    recency: QualityGrade;
    reliability: QualityGrade;
    specificity: QualityGrade;
  };
  overall_quality_grade: QualityGrade;
  quality_rationale: {
    relevance: string;
    completeness: string;
    recency: string;
    reliability: string;
    specificity: string;
    overall: string;
  };
  suggested_control_links: Array<{
    control_id: number;
    control_title: string;
    framework_type: string;
    match_score: number;
    matched_areas: string[];
  }>;
  analysis_model: string;
  /**
   * Audit trail — non-rendered metadata kept for debugging.
   */
  audit: {
    analyzer_version: string;
    abstain_reason: string | null;
    char_count: number;
    truncated: boolean;
    findings_with_quotes: Array<{
      text: string;
      evidence_quote: string;
      relevance: "primary" | "supporting" | "tangential";
    }>;
    filename_check: {
      mismatch: boolean;
      suggested_filename: string | null;
      reason: string | null;
    } | null;
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
    .replace(/ /g, " ")
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
  return createModelFromKey({
    // The analyzer's own input type carries an explicit provider; map it back
    // onto the name-detection contract the shared factory uses.
    name: key.provider === "Anthropic" ? "anthropic" : "openai",
    key: key.apiKey,
    url: key.baseURL,
    model: key.model,
    custom_headers: key.headers ?? null,
  });
}

/* ------------------------------------------------------------------ */
/* Abstain path                                                       */
/* ------------------------------------------------------------------ */

function buildAbstainResult(
  reason: string,
  charCount: number,
  modelLabel: string,
): AnalyzerResult {
  const grade: QualityGrade = "F";
  return {
    summary: `Insufficient content to grade (${reason}).`,
    key_findings: [],
    compliance_areas: [],
    quality_score: {
      relevance: grade,
      completeness: grade,
      recency: grade,
      reliability: grade,
      specificity: grade,
    },
    overall_quality_grade: grade,
    quality_rationale: {
      relevance: `abstained: ${reason}`,
      completeness: `abstained: ${reason}`,
      recency: `abstained: ${reason}`,
      reliability: `abstained: ${reason}`,
      specificity: `abstained: ${reason}`,
      overall: `abstained: ${reason}`,
    },
    suggested_control_links: [],
    analysis_model: modelLabel,
    audit: {
      analyzer_version: ANALYZER_VERSION,
      abstain_reason: reason,
      char_count: charCount,
      truncated: false,
      findings_with_quotes: [],
      filename_check: null,
    },
  };
}

/* ------------------------------------------------------------------ */
/* Public entry                                                       */
/* ------------------------------------------------------------------ */

export async function analyzeEvidence(input: AnalyzerInput): Promise<AnalyzerResult> {
  const { text, truncated, charCount } = normalizeDocument(input.documentText);
  const modelLabel = `${ANALYZER_VERSION}/${input.llmKey.provider}/${input.llmKey.model}`;

  // Pre-LLM abstain check: not enough content to be worth grading.
  if (charCount < MIN_USEFUL_CHARS) {
    return buildAbstainResult(
      `document only ${charCount} characters of usable text`,
      charCount,
      modelLabel,
    );
  }

  const model = createModel(input.llmKey);

  // ---- LLM 1: quality grading --------------------------------------
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
        parseFidelity: input.parseFidelity,
        characterCount: charCount,
      }),
      temperature: 0,
      innerMaxRetries: 2,
      maxSelfCorrectionAttempts: 2,
    });
    llmOutput = result.object;
    if (result.selfCorrected) {
      logger.debug(
        `[evidenceAnalyzer] quality grading self-corrected after ${result.attempts} attempts`,
      );
    }
  } catch (err) {
    logger.error(
      "[evidenceAnalyzer] quality grading LLM call failed (after self-correction budget)",
      err,
    );
    throw err; // controller catches and falls back to heuristic-v1
  }

  // ---- LLM-detected abstain (overrides grades even if doc was long enough)
  if (llmOutput.abstain_reason) {
    return buildAbstainResult(llmOutput.abstain_reason, charCount, modelLabel);
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

  const g = llmOutput.quality_grades;

  return {
    summary: llmOutput.summary,
    key_findings: llmOutput.key_findings.map((f) => f.text),
    compliance_areas: llmOutput.compliance_areas,
    quality_score: {
      relevance: g.relevance.grade,
      completeness: g.completeness.grade,
      recency: g.recency.grade,
      reliability: g.reliability.grade,
      specificity: g.specificity.grade,
    },
    overall_quality_grade: llmOutput.overall_grade,
    quality_rationale: {
      relevance: g.relevance.rationale,
      completeness: g.completeness.rationale,
      recency: g.recency.rationale,
      reliability: g.reliability.rationale,
      specificity: g.specificity.rationale,
      overall: llmOutput.overall_rationale,
    },
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
      abstain_reason: null,
      char_count: charCount,
      truncated,
      findings_with_quotes: llmOutput.key_findings,
      filename_check: llmOutput.filename_check,
    },
  };
}
