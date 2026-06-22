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

const fileName = "evidenceAi.ctrl.ts";

/**
 * Heuristic fallback — used only when no LLM key is configured for the org
 * or the LLM call fails. Same scoring algorithm as v1 but tagged so the
 * UI can show "fallback" provenance.
 */
function buildHeuristicResult(documentText: string): {
  summary: string;
  keyFindings: string[];
  complianceAreas: string[];
  qualityScore: {
    relevance: number;
    completeness: number;
    recency: number;
    reliability: number;
    specificity: number;
  };
  overall: number;
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

  const relevance = Math.min(100, foundAreas.length * 15 + 10);
  const completeness = Math.min(100, keyFindings.length * 10 + (summary.length > 200 ? 20 : 0));
  const recency = 70;
  const reliability = Math.min(
    100,
    (keyFindings.length > 3 ? 40 : 20) + (foundAreas.length > 2 ? 30 : 10) + 20,
  );
  const specificity = Math.min(100, keyFindings.filter((f) => f.length > 50).length * 15 + 10);
  const overall = Math.round(
    relevance * 0.25 +
      completeness * 0.25 +
      recency * 0.2 +
      reliability * 0.15 +
      specificity * 0.15,
  );
  return {
    summary,
    keyFindings,
    complianceAreas: foundAreas,
    qualityScore: {
      relevance,
      completeness,
      recency,
      reliability,
      specificity,
    },
    overall,
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
 * Trigger AI analysis for a file. Uses the v2 evidence-analyzer
 * (LLM-rubric + deterministic recency/reliability) when an LLM key is
 * configured. Falls back to heuristic-v1 if no key or the LLM call fails.
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

    // ---- Pick LLM key for the org --------------------------------
    let analyzerResult: AnalyzerResult | null = null;
    let usedFallback = false;
    let fallbackReason = "";

    try {
      const clients = await getLLMKeysWithKeyQuery(organizationId);
      if (clients.length === 0) {
        usedFallback = true;
        fallbackReason = "no LLM key configured";
      } else {
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
      }
    } catch (llmErr) {
      logger.warn("[evidenceAnalyzer] LLM analysis failed, falling back to heuristic-v1", llmErr);
      usedFallback = true;
      fallbackReason = (llmErr as Error).message || "LLM error";
    }

    // ---- Heuristic fallback path ---------------------------------
    let summary: string;
    let keyFindings: any;
    let complianceAreas: any;
    let qualityScore: any;
    let overall: number;
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
      overall = analyzerResult.overall_quality_score;
      suggestions = analyzerResult.suggested_control_links;
      modelLabel = analyzerResult.analysis_model;
      auditMetadata = analyzerResult.audit;
    } else {
      const h = buildHeuristicResult(documentText);
      summary = h.summary;
      keyFindings = h.keyFindings;
      complianceAreas = h.complianceAreas;
      qualityScore = h.qualityScore;
      overall = h.overall;
      suggestions = h.suggestions;
      modelLabel = `heuristic-v1${fallbackReason ? ` (fallback: ${fallbackReason})` : ""}`;
      // Heuristic path leaves audit_metadata null — no rationales available.
    }

    // ---- Persist -------------------------------------------------
    const visibility = req.body.visibility || "public";
    const analysis = await upsertAnalysisQuery(fileId, organizationId, {
      summary,
      key_findings: keyFindings,
      compliance_areas: complianceAreas,
      quality_score: qualityScore,
      overall_quality_score: overall,
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
        confidenceScore: overall,
        promptSummary: `Analyzed file ${file.filename}: ${complianceAreas.length} compliance areas, ${
          Array.isArray(keyFindings) ? keyFindings.length : 0
        } findings`,
      },
      userId,
    ).catch(() => {});

    logStructured("successful", `file ${fileId} analyzed (${modelLabel})`, functionName, fileName);
    return res.status(200).json(STATUS_CODE[200](analysis));
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
    const qualityThreshold = req.query.quality_threshold
      ? Number(
          Array.isArray(req.query.quality_threshold)
            ? req.query.quality_threshold[0]
            : req.query.quality_threshold,
        )
      : 50;

    const gaps = await getEvidenceGapsQuery(req.organizationId!, frameworkType, qualityThreshold);

    const noEvidence = gaps.filter((g: any) => g.gap_type === "no_evidence");
    const lowQuality = gaps.filter((g: any) => g.gap_type === "low_quality");

    logStructured("successful", "evidence gaps fetched", functionName, fileName);
    return res.status(200).json(
      STATUS_CODE[200]({
        total_controls: gaps.length,
        controls_without_evidence: noEvidence.length,
        controls_with_low_quality: lowQuality.length,
        controls_adequate: gaps.length - noEvidence.length - lowQuality.length,
        quality_threshold: qualityThreshold,
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
