import { Request, Response } from "express";
import { sequelize } from "../database/db";
import { STATUS_CODE } from "../utils/statusCode.utils";
import logger, { logStructured } from "../utils/logger/fileLogger";
import {
  upsertAnalysisQuery,
  getAnalysisByFileIdQuery,
  getQualityScoresQuery,
  getEvidenceGapsQuery,
  getSuggestionsQuery,
  applySuggestionsQuery,
} from "../utils/evidenceAi.utils";
import { parseDocument, isSupportedMimeType } from "../advisor/parsers";
import { trackAIContent } from "../middleware/aiContentTracker.middleware";
import { analyzeEvidence, type AnalyzerResult } from "../advisor/evidenceAnalyzer/analyzer.service";
import { getLLMKeysWithKeyQuery, getLLMProviderUrl } from "../utils/llmKey.utils";
import type { LLMProvider } from "../domain.layer/interfaces/i.llmKey";
import type {
  QualityGrade,
  IQualityScore,
  IQualityRationale,
} from "../domain.layer/interfaces/i.evidenceAi";

const fileName = "evidenceAi.ctrl.ts";

const NO_GRADE_MESSAGE = "AI grading unavailable — no LLM key";

/**
 * No-LLM-key / LLM-failure fallback. Extracts a deterministic summary and
 * candidate findings (no LLM required) but does NOT fabricate a quality grade —
 * all quality judgement comes from the LLM only. quality_score dims and the
 * overall grade are null, with an explanatory message.
 */
function buildHeuristicResult(documentText: string): {
  summary: string;
  keyFindings: string[];
  complianceAreas: string[];
  qualityScore: null;
  overallGrade: null;
  message: string;
  suggestions: Array<{
    control_id: number;
    control_title: string;
    framework_type: string;
    match_score: number;
    matched_areas: string[];
  }>;
} {
  const complianceKeywords = [
    "risk",
    "audit",
    "compliance",
    "control",
    "policy",
    "regulation",
    "GDPR",
    "ISO",
    "NIST",
    "EU AI Act",
    "security",
    "privacy",
    "assessment",
    "monitoring",
    "incident",
    "training",
    "transparency",
    "accountability",
    "fairness",
    "robustness",
    "data protection",
  ];
  const foundAreas = complianceKeywords.filter((kw) =>
    documentText.toLowerCase().includes(kw.toLowerCase()),
  );
  const sentences = documentText.split(/[.!?]+/).filter((s) => s.trim().length > 20);
  const findingPatterns =
    /\b(must|shall|should|require|recommend|ensure|implement|maintain|document|verify)\b/i;
  const keyFindings = sentences
    .filter((s) => findingPatterns.test(s))
    .slice(0, 10)
    .map((s) => s.trim());
  const summary =
    documentText.length > 500 ? documentText.substring(0, 500).trim() + "..." : documentText.trim();

  return {
    summary,
    keyFindings,
    complianceAreas: foundAreas,
    qualityScore: null,
    overallGrade: null,
    message: NO_GRADE_MESSAGE,
    suggestions: [],
  };
}

/**
 * Map mime type → parse fidelity hint for reliability scoring.
 */
function inferParseFidelity(fileType: string): "high" | "medium" | "low" | undefined {
  const t = fileType.toLowerCase();
  if (
    t.includes("officedocument.wordprocessing") ||
    t.includes("text/plain") ||
    t.includes("text/markdown") ||
    t.includes("text/html")
  ) {
    return "high";
  }
  if (t.includes("pdf")) return "medium";
  if (t.includes("image")) return "low";
  return undefined;
}

/**
 * POST /api/evidence-ai/analyze/:fileId
 * Trigger AI analysis for a file. Requires an LLM key — returns 400 if
 * none is configured for the organization. Uses the v2 evidence-analyzer
 * (LLM-rubric + deterministic recency/reliability); falls back to
 * heuristic-v1 only if the LLM call itself fails after a key was found.
 */
export async function analyzeFile(req: Request, res: Response) {
  const functionName = "analyzeFile";
  const fileId = parseInt(
    Array.isArray(req.params.fileId) ? req.params.fileId[0] : req.params.fileId,
  );

  if (isNaN(fileId)) {
    return res.status(400).json(STATUS_CODE[400]("Invalid file ID"));
  }

  logStructured("processing", `analyzing file ${fileId}`, functionName, fileName);

  try {
    const organizationId = req.organizationId!;
    const userId = req.userId ? Number(req.userId) : null;

    // ---- LLM key required ------------------------------------------
    // NOTE: a DB error here now surfaces as a 500 (previously it was
    // swallowed into a heuristic-v1 200 fallback) — documented tradeoff.
    const clients = await getLLMKeysWithKeyQuery(organizationId);
    if (clients.length === 0) {
      return res
        .status(400)
        .json(STATUS_CODE[400]("No LLM keys configured for this organization."));
    }

    // ---- File metadata + content ---------------------------------
    const [fileRows] = await sequelize.query(
      `SELECT id, filename, type FROM files
       WHERE id = :fileId AND organization_id = :organizationId`,
      { replacements: { fileId, organizationId } },
    );
    const file = (fileRows as any[])[0];
    if (!file) {
      return res.status(404).json(STATUS_CODE[404]("File not found"));
    }

    const [contentRows] = await sequelize.query(
      `SELECT content, octet_length(content) AS size_bytes,
              uploaded_time AS upload_date
       FROM files WHERE id = :fileId AND organization_id = :organizationId`,
      { replacements: { fileId, organizationId } },
    );
    const contentRow = (contentRows as any[])[0];

    // Optional expiry from evidence row, if linked.
    let expiryDate: string | null = null;
    try {
      const [eviRows] = await sequelize.query(
        `SELECT e.expiry_date
         FROM evidence e
         JOIN evidence_files ef ON ef.evidence_id = e.id
         WHERE ef.file_id = :fileId AND e.organization_id = :organizationId
         LIMIT 1`,
        { replacements: { fileId, organizationId } },
      );
      if ((eviRows as any[]).length > 0) {
        expiryDate = (eviRows as any[])[0].expiry_date ?? null;
      }
    } catch {
      // evidence_files table may not exist in all installs — non-critical
    }

    let documentText = "";
    if (contentRow?.content) {
      const buffer = Buffer.isBuffer(contentRow.content)
        ? contentRow.content
        : Buffer.from(contentRow.content);
      if (isSupportedMimeType(file.type)) {
        const parsed = await parseDocument(buffer, file.type);
        documentText = parsed.text;
      } else {
        documentText = buffer.toString("utf-8");
      }
    }
    if (!documentText || documentText.trim().length === 0) {
      return res.status(422).json(STATUS_CODE[422]("File has no extractable text content"));
    }

    // ---- Run the analyzer ------------------------------------------
    let analyzerResult: AnalyzerResult | null = null;
    let usedFallback = false;
    let fallbackReason = "";

    try {
      const apiKey = clients[0];
      const baseURL = apiKey.url || getLLMProviderUrl(apiKey.name as LLMProvider);
      analyzerResult = await analyzeEvidence({
        documentText,
        filename: file.filename,
        fileType: file.type,
        fileSizeBytes: contentRow?.size_bytes ?? null,
        uploadDate: contentRow?.upload_date ?? null,
        expiryDate,
        parseFidelity: inferParseFidelity(file.type),
        llmKey: {
          apiKey: apiKey.key || "",
          baseURL,
          model: apiKey.model,
          provider: apiKey.name as "Anthropic" | "OpenAI" | "OpenRouter" | "Custom",
          headers: apiKey.custom_headers || undefined,
        },
      });
    } catch (llmErr) {
      logger.warn("[evidenceAnalyzer] LLM analysis failed, falling back to heuristic-v1", llmErr);
      usedFallback = true;
      fallbackReason = (llmErr as Error).message || "LLM error";
    }

    // ---- Fallback path -------------------------------------------
    let summary: string;
    let keyFindings: any;
    let complianceAreas: any;
    let qualityScore: IQualityScore | null;
    let overallGrade: QualityGrade | null;
    let qualityRationale: IQualityRationale | null = null;
    let message: string | null = null;
    let suggestions: any[];
    let modelLabel: string;
    let auditMetadata: any | null = null;

    if (analyzerResult && !usedFallback) {
      summary = analyzerResult.summary;
      // Frontend expects key_findings as string[]. Quote-grounded findings
      // are kept in the audit metadata (analyzerResult.audit.findings_with_quotes).
      keyFindings = analyzerResult.key_findings;
      complianceAreas = analyzerResult.compliance_areas;
      qualityScore = analyzerResult.quality_score;
      overallGrade = analyzerResult.overall_quality_grade;
      qualityRationale = analyzerResult.quality_rationale;
      suggestions = analyzerResult.suggested_control_links;
      modelLabel = analyzerResult.analysis_model;
      auditMetadata = analyzerResult.audit;
    } else {
      const h = buildHeuristicResult(documentText);
      summary = h.summary;
      keyFindings = h.keyFindings;
      complianceAreas = h.complianceAreas;
      // No LLM => no grade is computed. dims + overall are null with a message.
      qualityScore = h.qualityScore;
      overallGrade = h.overallGrade;
      message = h.message;
      suggestions = h.suggestions;
      modelLabel = `heuristic-v1${fallbackReason ? ` (fallback: ${fallbackReason})` : ""}`;
      // Heuristic path leaves audit_metadata null — no rationales available.
    }

    // ---- Persist -------------------------------------------------
    const visibility = req.body?.visibility || "public";
    const analysis = await upsertAnalysisQuery(fileId, organizationId, {
      summary,
      key_findings: keyFindings,
      compliance_areas: complianceAreas,
      quality_score: qualityScore,
      overall_quality_grade: overallGrade,
      suggested_control_links: suggestions,
      analysis_model: modelLabel,
      analyzed_by: userId,
      visibility,
      audit_metadata: auditMetadata,
    });

    // ---- Auto-apply control links --------------------------------
    if (suggestions.length > 0) {
      try {
        await applySuggestionsQuery(
          fileId,
          organizationId,
          suggestions.map((s: any) => ({
            control_id: s.control_id,
            framework_type: s.framework_type,
          })),
          userId ?? undefined,
        );
      } catch (linkErr) {
        logger.warn("Auto-apply suggestions failed (non-critical):", linkErr);
      }
    }

    // ---- AI content tracking -------------------------------------
    trackAIContent(
      organizationId,
      "evidence",
      fileId,
      {
        badgeType: "generated",
        modelUsed: modelLabel,
        modelProvider: usedFallback ? "verifywise" : "llm",
        toolName: "evidence-analysis",
        promptSummary: `Analyzed file ${file.filename}: ${complianceAreas.length} compliance areas, ${
          Array.isArray(keyFindings) ? keyFindings.length : 0
        } findings`,
      },
      userId,
    ).catch(() => {});

    logStructured("successful", `file ${fileId} analyzed (${modelLabel})`, functionName, fileName);
    // quality_rationale isn't persisted; return it transiently on the analyze
    // response. message is set only on the no-grade fallback path.
    return res.status(200).json(
      STATUS_CODE[200]({
        ...analysis,
        ...(qualityRationale ? { quality_rationale: qualityRationale } : {}),
        ...(message ? { message } : {}),
      }),
    );
  } catch (error) {
    logStructured("error", "failed to analyze file", functionName, fileName);
    logger.error("Error in analyzeFile:", error);
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

/**
 * GET /api/evidence-ai/analysis/:fileId
 * Get analysis results for a file.
 */
export async function getAnalysis(req: Request, res: Response) {
  const functionName = "getAnalysis";
  const fileId = parseInt(
    Array.isArray(req.params.fileId) ? req.params.fileId[0] : req.params.fileId,
  );

  if (isNaN(fileId)) {
    return res.status(400).json(STATUS_CODE[400]("Invalid file ID"));
  }

  try {
    const visFilter = req.query.visibility ? String(req.query.visibility) : undefined;
    const analysis = await getAnalysisByFileIdQuery(
      fileId,
      req.organizationId!,
      req.userId ? Number(req.userId) : null,
      visFilter,
    );

    if (!analysis) {
      return res.status(204).json(STATUS_CODE[204](null));
    }

    logStructured("successful", `analysis found for file ${fileId}`, functionName, fileName);
    return res.status(200).json(STATUS_CODE[200](analysis));
  } catch (error) {
    logStructured("error", "failed to get analysis", functionName, fileName);
    logger.error("Error in getAnalysis:", error);
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

/**
 * GET /api/evidence-ai/quality-scores
 * Get quality scores for all analyzed files.
 */
export async function getQualityScores(req: Request, res: Response) {
  const functionName = "getQualityScores";

  try {
    const visFilter = req.query.visibility ? String(req.query.visibility) : undefined;
    const scores = await getQualityScoresQuery(
      req.organizationId!,
      req.userId ? Number(req.userId) : null,
      visFilter,
    );

    logStructured("successful", "quality scores fetched", functionName, fileName);
    return res.status(200).json(STATUS_CODE[200](scores));
  } catch (error) {
    logStructured("error", "failed to get quality scores", functionName, fileName);
    logger.error("Error in getQualityScores:", error);
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

/**
 * GET /api/evidence-ai/gaps
 * Get evidence gap analysis.
 */
export async function getGaps(req: Request, res: Response) {
  const functionName = "getGaps";

  try {
    const frameworkType = req.query.framework_type
      ? String(
          Array.isArray(req.query.framework_type)
            ? req.query.framework_type[0]
            : req.query.framework_type,
        )
      : undefined;
    // Grades treated as low-quality (a gap). Defaults to D/F; caller may pass
    // ?low_grades=C,D,F to widen the bar. Invalid letters are dropped.
    const validGrades: QualityGrade[] = ["A", "B", "C", "D", "F"];
    const rawLowGrades = req.query.low_grades
      ? String(
          Array.isArray(req.query.low_grades) ? req.query.low_grades[0] : req.query.low_grades,
        )
          .split(",")
          .map((g) => g.trim().toUpperCase())
          .filter((g): g is QualityGrade => (validGrades as string[]).includes(g))
      : undefined;
    const lowGrades = rawLowGrades && rawLowGrades.length > 0 ? rawLowGrades : undefined;

    const gaps = await getEvidenceGapsQuery(req.organizationId!, frameworkType, lowGrades);

    const noEvidence = gaps.filter((g: any) => g.gap_type === "no_evidence");
    const lowQuality = gaps.filter((g: any) => g.gap_type === "low_quality");

    logStructured("successful", "evidence gaps fetched", functionName, fileName);
    return res.status(200).json(
      STATUS_CODE[200]({
        total_controls: gaps.length,
        controls_without_evidence: noEvidence.length,
        controls_with_low_quality: lowQuality.length,
        controls_adequate: gaps.length - noEvidence.length - lowQuality.length,
        low_grades: lowGrades ?? ["D", "F"],
        gaps: gaps.filter((g: any) => g.gap_type !== "adequate"),
      }),
    );
  } catch (error) {
    logStructured("error", "failed to get evidence gaps", functionName, fileName);
    logger.error("Error in getGaps:", error);
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

/**
 * GET /api/evidence-ai/suggestions/:fileId
 * Get suggested control links for a file.
 */
export async function getSuggestions(req: Request, res: Response) {
  const functionName = "getSuggestions";
  const fileId = parseInt(
    Array.isArray(req.params.fileId) ? req.params.fileId[0] : req.params.fileId,
  );

  if (isNaN(fileId)) {
    return res.status(400).json(STATUS_CODE[400]("Invalid file ID"));
  }

  try {
    const suggestions = await getSuggestionsQuery(fileId, req.organizationId!);

    if (!suggestions) {
      return res.status(204).json(STATUS_CODE[204](null));
    }

    logStructured("successful", `suggestions found for file ${fileId}`, functionName, fileName);
    return res.status(200).json(STATUS_CODE[200](suggestions));
  } catch (error) {
    logStructured("error", "failed to get suggestions", functionName, fileName);
    logger.error("Error in getSuggestions:", error);
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

/**
 * POST /api/evidence-ai/suggestions/:fileId/apply
 * Apply suggested control links.
 */
export async function applySuggestions(req: Request, res: Response) {
  const functionName = "applySuggestions";
  const fileId = parseInt(
    Array.isArray(req.params.fileId) ? req.params.fileId[0] : req.params.fileId,
  );

  if (isNaN(fileId)) {
    return res.status(400).json(STATUS_CODE[400]("Invalid file ID"));
  }

  try {
    const { suggestions } = req.body;

    if (!suggestions || !Array.isArray(suggestions) || suggestions.length === 0) {
      return res.status(400).json(STATUS_CODE[400]("Suggestions array is required"));
    }

    const userId = req.userId ? Number(req.userId) : undefined;
    const result = await applySuggestionsQuery(fileId, req.organizationId!, suggestions, userId);

    logStructured(
      "successful",
      `applied ${result.applied_count} suggestions for file ${fileId}`,
      functionName,
      fileName,
    );
    return res.status(200).json(STATUS_CODE[200](result));
  } catch (error) {
    logStructured("error", "failed to apply suggestions", functionName, fileName);
    logger.error("Error in applySuggestions:", error);
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}
