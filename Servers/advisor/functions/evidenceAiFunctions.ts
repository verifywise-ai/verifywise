import { sequelize } from "../../database/db";
import logger from "../../utils/logger/fileLogger";

export interface AnalyzeDocumentParams {
  file_id: number;
  document_text: string;
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
  quality_threshold?: number;
}

/**
 * Analyze a document: extract summary, key findings, compliance areas.
 * In a full implementation this would call generateObject() via AI SDK,
 * but here we provide the structured extraction that the agent can use.
 */
const analyzeDocument = async (
  params: AnalyzeDocumentParams,
  _organizationId: number,
): Promise<any> => {
  try {
    const { file_id, document_text } = params;
    const textLength = document_text.length;
    const wordCount = document_text.split(/\s+/).length;

    // Extract basic compliance keywords from text
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
      document_text.toLowerCase().includes(kw.toLowerCase()),
    );

    // Create a summary from the first ~500 chars
    const summary =
      document_text.length > 500
        ? document_text.substring(0, 500).trim() + "..."
        : document_text.trim();

    // Extract sentences that seem like findings (contain key verbs)
    const sentences = document_text.split(/[.!?]+/).filter((s) => s.trim().length > 20);
    const findingPatterns =
      /\b(must|shall|should|require|recommend|ensure|implement|maintain|document|verify)\b/i;
    const keyFindings = sentences
      .filter((s) => findingPatterns.test(s))
      .slice(0, 10)
      .map((s) => s.trim());

    return {
      file_id,
      summary,
      key_findings: keyFindings,
      compliance_areas: foundAreas,
      document_stats: {
        text_length: textLength,
        word_count: wordCount,
        sentence_count: sentences.length,
      },
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
 */
const detectEvidenceGaps = async (
  params: DetectGapsParams,
  organizationId: number,
): Promise<any> => {
  try {
    const {
      framework_type: _framework_type,
      project_id: _project_id,
      quality_threshold = 50,
    } = params;

    // Get controls with their evidence counts and quality scores
    const [gaps] = await sequelize.query(
      `SELECT
         'eu_ai_act' as framework_type,
         cs.id as control_id,
         cs.title as control_title,
         COALESCE(ea.evidence_count, 0) as evidence_count,
         COALESCE(ea.avg_quality, 0) as avg_quality
       FROM controls_struct_eu cs
       LEFT JOIN (
         SELECT
           fel.entity_id,
           COUNT(DISTINCT fel.file_id) as evidence_count,
           COALESCE(AVG(eaa.overall_quality_score), 0) as avg_quality
         FROM file_entity_links fel
         LEFT JOIN evidence_ai_analysis eaa
           ON eaa.file_id = fel.file_id AND eaa.organization_id = :organizationId
         WHERE fel.organization_id = :organizationId
           AND fel.framework_type = 'eu_ai_act'
         GROUP BY fel.entity_id
       ) ea ON ea.entity_id = cs.id
       WHERE cs.title IS NOT NULL
       ORDER BY COALESCE(ea.avg_quality, 0) ASC, COALESCE(ea.evidence_count, 0) ASC
       LIMIT 20`,
      { replacements: { organizationId } },
    );

    const gapResults = (gaps as any[]).map((g) => ({
      framework_type: g.framework_type,
      control_id: g.control_id,
      control_title: g.control_title,
      evidence_count: parseInt(g.evidence_count, 10),
      avg_quality: Math.round(parseFloat(g.avg_quality)),
      gap_type:
        parseInt(g.evidence_count, 10) === 0
          ? "no_evidence"
          : parseFloat(g.avg_quality) < quality_threshold
            ? "low_quality"
            : "adequate",
      recommendation:
        parseInt(g.evidence_count, 10) === 0
          ? `Upload evidence documents for "${g.control_title}"`
          : parseFloat(g.avg_quality) < quality_threshold
            ? `Improve evidence quality for "${g.control_title}" (current avg: ${Math.round(parseFloat(g.avg_quality))})`
            : null,
    }));

    const noEvidence = gapResults.filter((g) => g.gap_type === "no_evidence");
    const lowQuality = gapResults.filter((g) => g.gap_type === "low_quality");

    return {
      total_controls_checked: gapResults.length,
      controls_without_evidence: noEvidence.length,
      controls_with_low_quality: lowQuality.length,
      controls_adequate: gapResults.length - noEvidence.length - lowQuality.length,
      quality_threshold,
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
