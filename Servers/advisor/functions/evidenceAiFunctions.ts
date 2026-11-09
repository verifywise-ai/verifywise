import { sequelize } from "../../database/db";
import logger from "../../utils/logger/fileLogger";
import { getEvidenceGapsQuery, upsertAnalysisQuery } from "../../utils/evidenceAi.utils";
import { parseDocument, isSupportedMimeType } from "../parsers";
import { analyzeEvidence } from "../evidenceAnalyzer/analyzer.service";
import { getLLMKeysWithKeyQuery, getLLMProviderUrl } from "../../utils/llmKey.utils";
import { VISIBLE_FILE_REPLACEMENTS, VISIBLE_FILE_SQL } from "../../utils/files/visibleFiles";
import type { LLMProvider } from "../../domain.layer/interfaces/i.llmKey";

export interface AnalyzeDocumentParams {
  file_id: number;
  /** Optional: when omitted, the analyzer reads the file's stored content. */
  document_text?: string;
}

export interface ScoreQualityParams {
  file_id: number;
  summary: string;
  key_findings?: string;
  compliance_areas?: string;
}

export interface MatchControlsParams {
  file_id: number;
  compliance_areas?: string;
  framework_type?: string;
}

export interface DetectGapsParams {
  framework_type?: string;
  project_id?: number;
}

/**
 * Analyze a document with the real evidence analyzer (#4913) — the same
 * LLM-backed analyzer the "Analyze with AI" endpoint runs.
 *
 * The file's STORED content is always what gets graded: binary types go
 * through parseDocument, exactly like the endpoint, so a PDF/DOCX is parsed
 * rather than sent as bytes. The caller-supplied document_text is used only
 * when the stored row has no content — it can never replace real file
 * content, so invented text cannot be graded as a file. The result is
 * persisted through upsertAnalysisQuery, so it feeds the same gaps and
 * quality views as the endpoint's analysis, except when it was graded from
 * caller text or would replace a private analysis; `persisted` and
 * `not_persisted_reason` say which. Requires an LLM key.
 */
const analyzeDocument = async (
  params: AnalyzeDocumentParams,
  organizationId: number,
): Promise<any> => {
  try {
    const { file_id, document_text } = params;

    // A bias audit stance PDF is served only by the stance endpoint, so here
    // it answers exactly as a missing file does.
    const [fileRows] = await sequelize.query(
      `SELECT id, filename, type, content, uploaded_time
         FROM files
        WHERE id = :fileId AND organization_id = :organizationId
          AND ${VISIBLE_FILE_SQL("files")}`,
      { replacements: { fileId: file_id, organizationId, ...VISIBLE_FILE_REPLACEMENTS } },
    );
    const file = (fileRows as any[])[0];
    if (!file) {
      throw new Error(`File ${file_id} not found in this organization`);
    }

    // Stored content wins; caller text is only a fallback for content-less
    // rows.
    let text = "";
    let fromStoredContent = false;
    if (file.content) {
      const buffer = Buffer.isBuffer(file.content) ? file.content : Buffer.from(file.content);
      if (isSupportedMimeType(file.type)) {
        text = (await parseDocument(buffer, file.type)).text;
      } else {
        text = buffer.toString("utf-8");
      }
    }
    fromStoredContent = text.trim() !== "";
    if (!fromStoredContent) {
      text = document_text || "";
    }
    if (!text.trim()) {
      throw new Error(`File ${file_id} has no extractable text content`);
    }

    const clients = await getLLMKeysWithKeyQuery(organizationId);
    if (clients.length === 0) {
      throw new Error("No LLM keys configured for this organization");
    }
    const llmKey = clients[0];

    const result = await analyzeEvidence({
      documentText: text,
      filename: file.filename,
      fileType: file.type,
      uploadDate: file.uploaded_time ?? null,
      expiryDate: null,
      llmKey: {
        apiKey: llmKey.key || "",
        baseURL: llmKey.url || getLLMProviderUrl(llmKey.name as LLMProvider),
        model: llmKey.model,
        provider: llmKey.name as "Anthropic" | "OpenAI" | "OpenRouter" | "Custom",
        headers: llmKey.custom_headers || undefined,
      },
    });

    // Persist so the analysis feeds the gaps and quality views like the
    // endpoint's does, but only when that is safe to do:
    //  - the text was the file's own stored content. Text the model supplied
    //    is not the file, and storing a grade for it would let the gaps view
    //    count a control as covered by text the file never contained;
    //  - no private analysis exists. A private analysis is visible only to
    //    its author, and the advisor has no author to keep it private for.
    // Never fails the call.
    let persisted = false;
    let notPersistedReason: string | undefined;
    let existingAuthor: number | null = null;
    try {
      if (!fromStoredContent) {
        notPersistedReason =
          "Not stored: the file has no stored content, so this was graded from text supplied in the conversation.";
      } else {
        const [existingRows] = await sequelize.query(
          `SELECT visibility, analyzed_by
             FROM evidence_ai_analysis
            WHERE file_id = :fileId AND organization_id = :organizationId
            LIMIT 1`,
          { replacements: { fileId: file_id, organizationId } },
        );
        const existing = (existingRows as any[])[0];
        existingAuthor = existing?.analyzed_by ?? null;
        if (existing?.visibility === "private") {
          notPersistedReason =
            "Not stored: this file already has a private analysis, which is left as it is.";
        }
      }
    } catch (lookupError) {
      logger.error("Failed to check for an existing document analysis:", lookupError);
      notPersistedReason = "Not stored: the existing analysis could not be checked.";
    }
    if (!notPersistedReason) {
      try {
        await upsertAnalysisQuery(file_id, organizationId, {
          summary: result.summary,
          key_findings: result.key_findings,
          compliance_areas: result.compliance_areas,
          quality_score: result.quality_score,
          overall_quality_grade: result.overall_quality_grade,
          suggested_control_links: result.suggested_control_links,
          analysis_model: result.analysis_model,
          // Keep the author of a public analysis this replaces.
          analyzed_by: existingAuthor,
          audit_metadata: result.audit,
        });
        persisted = true;
      } catch (persistError) {
        logger.error("Failed to persist advisor document analysis:", persistError);
        notPersistedReason = "Not stored: saving the analysis failed.";
      }
    }

    return {
      file_id,
      ...result,
      persisted,
      ...(notPersistedReason ? { not_persisted_reason: notPersistedReason } : {}),
    };
  } catch (error) {
    logger.error("Error analyzing document:", error);
    throw new Error(
      `Failed to analyze document: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }
};

/**
 * Score evidence quality across 5 dimensions.
 */
const scoreEvidenceQuality = async (
  params: ScoreQualityParams,
  _organizationId: number,
): Promise<any> => {
  try {
    const { file_id, summary, key_findings, compliance_areas } = params;

    let findings: string[] = [];
    let areas: string[] = [];
    try {
      if (key_findings) findings = JSON.parse(key_findings);
    } catch {
      /* use empty */
    }
    try {
      if (compliance_areas) areas = JSON.parse(compliance_areas);
    } catch {
      /* use empty */
    }

    // Heuristic scoring based on content analysis
    const relevance = Math.min(100, areas.length * 15 + 10);
    const completeness = Math.min(100, findings.length * 10 + (summary.length > 200 ? 20 : 0));
    const recency = 70; // Default — would check file upload date in full implementation
    const reliability = Math.min(
      100,
      (findings.length > 3 ? 40 : 20) + (areas.length > 2 ? 30 : 10) + 20,
    );
    const specificity = Math.min(100, findings.filter((f) => f.length > 50).length * 15 + 10);

    const overall = Math.round(
      relevance * 0.25 +
        completeness * 0.25 +
        recency * 0.2 +
        reliability * 0.15 +
        specificity * 0.15,
    );

    return {
      file_id,
      quality_score: {
        relevance,
        completeness,
        recency,
        reliability,
        specificity,
      },
      overall_quality_score: overall,
    };
  } catch (error) {
    logger.error("Error scoring evidence quality:", error);
    throw new Error(
      `Failed to score evidence quality: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }
};

/**
 * Match document content against control requirements.
 */
const matchControls = async (
  params: MatchControlsParams,
  _organizationId: number,
): Promise<any> => {
  try {
    const { file_id, compliance_areas, framework_type } = params;

    let areas: string[] = [];
    try {
      if (compliance_areas) areas = JSON.parse(compliance_areas);
    } catch {
      /* use empty */
    }

    // Query controls from the relevant framework tables
    let controls: any[] = [];

    if (!framework_type || framework_type === "eu_ai_act") {
      const [euControls] = await sequelize.query(
        `SELECT cs.id, cs.title, cs.description,
                'eu_ai_act' as framework_type
         FROM controls_struct_eu cs
         WHERE cs.title IS NOT NULL
         LIMIT 50`,
      );
      controls = controls.concat(euControls);
    }

    if (!framework_type || framework_type === "iso_42001") {
      const [isoControls] = await sequelize.query(
        `SELECT acs.id, acs.title, acs.description,
                'iso_42001' as framework_type
         FROM annexcategories_struct_iso acs
         WHERE acs.title IS NOT NULL
         LIMIT 50`,
      );
      controls = controls.concat(isoControls);
    }

    // Simple keyword matching between compliance areas and control titles/descriptions
    const suggestions = controls
      .map((control: any) => {
        const controlText = `${control.title || ""} ${control.description || ""}`.toLowerCase();
        const matchedAreas = areas.filter((area) => controlText.includes(area.toLowerCase()));
        const score = matchedAreas.length > 0 ? Math.min(100, matchedAreas.length * 30 + 20) : 0;

        return {
          control_id: control.id,
          control_title: control.title,
          framework_type: control.framework_type,
          match_score: score,
          matched_areas: matchedAreas,
        };
      })
      .filter((s: any) => s.match_score > 0)
      .sort((a: any, b: any) => b.match_score - a.match_score)
      .slice(0, 10);

    return {
      file_id,
      suggested_links: suggestions,
      total_controls_checked: controls.length,
      matches_found: suggestions.length,
    };
  } catch (error) {
    logger.error("Error matching controls:", error);
    throw new Error(
      `Failed to match controls: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }
};

/**
 * Detect controls that lack evidence or have low-quality evidence.
 * Reuses the fixed /api/evidence-ai/gaps logic (#4911): honours
 * framework_type (eu_ai_act / iso_42001 / both) and project_id, covers both
 * frameworks, and is not capped — the response states the totals so a caller
 * can see nothing was truncated.
 */
const detectEvidenceGaps = async (
  params: DetectGapsParams,
  organizationId: number,
): Promise<any> => {
  try {
    const { framework_type, project_id } = params;

    const fwType =
      framework_type && ["eu_ai_act", "iso_42001"].includes(framework_type)
        ? framework_type
        : undefined;

    const gaps = await getEvidenceGapsQuery(organizationId, fwType, ["D", "F"], project_id);

    const gapResults = gaps.map((g: any) => ({
      framework_type: g.framework_type,
      control_id: g.control_id,
      control_title: g.control_title,
      evidence_count: g.evidence_count,
      adequate_count: g.adequate_count,
      gap_type: g.gap_type,
      recommendation:
        g.gap_type === "no_evidence"
          ? `Upload evidence documents for "${g.control_title}"`
          : g.gap_type === "low_quality"
            ? `Improve evidence quality for "${g.control_title}" (no adequate-grade evidence yet)`
            : null,
    }));

    const noEvidence = gapResults.filter((g) => g.gap_type === "no_evidence");
    const lowQuality = gapResults.filter((g) => g.gap_type === "low_quality");

    return {
      total_controls_checked: gapResults.length,
      controls_without_evidence: noEvidence.length,
      controls_with_low_quality: lowQuality.length,
      controls_adequate: gapResults.length - noEvidence.length - lowQuality.length,
      framework_type: fwType ?? "all",
      project_id: project_id ?? null,
      truncated: false,
      gaps: gapResults.filter((g) => g.gap_type !== "adequate"),
    };
  } catch (error) {
    logger.error("Error detecting evidence gaps:", error);
    throw new Error(
      `Failed to detect evidence gaps: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }
};

const availableEvidenceAiTools: Record<string, Function> = {
  analyze_document: analyzeDocument,
  score_evidence_quality: scoreEvidenceQuality,
  match_controls: matchControls,
  detect_evidence_gaps: detectEvidenceGaps,
};

export { availableEvidenceAiTools };
