import { sequelize } from "../database/db";
import { buildVisibilityFilterForEvidence } from "./visibility.utils";

/**
 * Insert or update an AI analysis result for a file.
 *
 * `audit_metadata` is optional — analyzer-v2 produces it (per-dimension
 * rationales, document signals, evidence quotes). Heuristic-v1 leaves
 * it null. The frontend treats null as "no rationale available".
 */
export const upsertAnalysisQuery = async (
  fileId: number,
  organizationId: number,
  data: {
    summary: string;
    key_findings: any;
    compliance_areas: any;
    quality_score: any;
    overall_quality_score: number;
    suggested_control_links: any;
    analysis_model: string;
    analyzed_by: number | null;
    visibility?: string;
    audit_metadata?: any | null;
  },
) => {
  const auditMetadataJson =
    data.audit_metadata != null ? JSON.stringify(data.audit_metadata) : null;

  // Check if analysis already exists
  const [existing] = await sequelize.query(
    `SELECT id FROM evidence_ai_analysis
     WHERE file_id = :fileId AND organization_id = :organizationId
     LIMIT 1`,
    { replacements: { fileId, organizationId } },
  );

  if ((existing as any[]).length > 0) {
    const existingId = (existing as any[])[0].id;
    const [updated] = await sequelize.query(
      `UPDATE evidence_ai_analysis SET
         summary = :summary,
         key_findings = :key_findings,
         compliance_areas = :compliance_areas,
         quality_score = :quality_score,
         overall_quality_score = :overall_quality_score,
         suggested_control_links = :suggested_control_links,
         analysis_model = :analysis_model,
         analysis_version = analysis_version + 1,
         analyzed_at = NOW(),
         analyzed_by = :analyzed_by,
         visibility = :visibility,
         audit_metadata = :audit_metadata::jsonb
       WHERE id = :id AND organization_id = :organizationId
       RETURNING *`,
      {
        replacements: {
          id: existingId,
          organizationId,
          summary: data.summary,
          key_findings: JSON.stringify(data.key_findings),
          compliance_areas: JSON.stringify(data.compliance_areas),
          quality_score: JSON.stringify(data.quality_score),
          overall_quality_score: data.overall_quality_score,
          suggested_control_links: JSON.stringify(data.suggested_control_links),
          analysis_model: data.analysis_model,
          analyzed_by: data.analyzed_by,
          visibility: data.visibility || "public",
          audit_metadata: auditMetadataJson,
        },
      },
    );
    return (updated as any[])[0];
  }

  const [created] = await sequelize.query(
    `INSERT INTO evidence_ai_analysis (
       file_id, summary, key_findings, compliance_areas,
       quality_score, overall_quality_score, suggested_control_links,
       analysis_model, analyzed_by, visibility, organization_id,
       audit_metadata
     ) VALUES (
       :fileId, :summary, :key_findings, :compliance_areas,
       :quality_score, :overall_quality_score, :suggested_control_links,
       :analysis_model, :analyzed_by, :visibility, :organizationId,
       :audit_metadata::jsonb
     ) RETURNING *`,
    {
      replacements: {
        fileId,
        organizationId,
        summary: data.summary,
        key_findings: JSON.stringify(data.key_findings),
        compliance_areas: JSON.stringify(data.compliance_areas),
        quality_score: JSON.stringify(data.quality_score),
        overall_quality_score: data.overall_quality_score,
        suggested_control_links: JSON.stringify(data.suggested_control_links),
        analysis_model: data.analysis_model,
        analyzed_by: data.analyzed_by,
        visibility: data.visibility || "public",
        audit_metadata: auditMetadataJson,
      },
    },
  );
  return (created as any[])[0];
};

/**
 * Get analysis for a specific file.
 */
export const getAnalysisByFileIdQuery = async (
  fileId: number,
  organizationId: number,
  userId?: number | null,
  visibility?: string,
) => {
  const vis = buildVisibilityFilterForEvidence(userId ?? null, visibility, "eaa");
  const [rows] = await sequelize.query(
    `SELECT * FROM evidence_ai_analysis eaa
     WHERE eaa.file_id = :fileId AND eaa.organization_id = :organizationId
     ${vis.clause}
     ORDER BY eaa.analyzed_at DESC
     LIMIT 1`,
    { replacements: { fileId, organizationId, ...vis.replacements } },
  );
  return (rows as any[])[0] || null;
};

/**
 * Get quality scores for all analyzed files (dashboard view).
 */
export const getQualityScoresQuery = async (
  organizationId: number,
  userId?: number | null,
  visibility?: string,
) => {
  const vis = buildVisibilityFilterForEvidence(userId ?? null, visibility, "eaa");
  const [rows] = await sequelize.query(
    `SELECT eaa.*, f.filename
     FROM evidence_ai_analysis eaa
     LEFT JOIN files f ON f.id = eaa.file_id
     WHERE eaa.organization_id = :organizationId
     ${vis.clause}
     ORDER BY eaa.overall_quality_score ASC`,
    { replacements: { organizationId, ...vis.replacements } },
  );
  return rows as any[];
};

/**
 * Get evidence gap analysis — controls lacking evidence or with low quality.
 */
export const getEvidenceGapsQuery = async (
  organizationId: number,
  frameworkType?: string,
  qualityThreshold: number = 50,
) => {
  const fwTypes = frameworkType ? [frameworkType] : ["eu_ai_act", "iso_42001"];
  const allGaps: any[] = [];

  for (const fw of fwTypes) {
    let controlQuery: string;
    let controlTitleCol: string;
    if (fw === "iso_42001") {
      controlQuery = "annexcategories_struct_iso";
      controlTitleCol = "title";
    } else {
      controlQuery = "controls_struct_eu";
      controlTitleCol = "title";
    }

    const [gaps] = await sequelize.query(
      `SELECT
         :fwType as framework_type,
         cs.id as control_id,
         cs.${controlTitleCol} as control_title,
         COALESCE(stats.evidence_count, 0)::int as evidence_count,
         COALESCE(stats.avg_quality, 0)::int as avg_quality
       FROM ${controlQuery} cs
       LEFT JOIN (
         SELECT
           fel.entity_id,
           COUNT(DISTINCT fel.file_id) as evidence_count,
           AVG(eaa.overall_quality_score) as avg_quality
         FROM file_entity_links fel
         LEFT JOIN evidence_ai_analysis eaa
           ON eaa.file_id = fel.file_id AND eaa.organization_id = :organizationId
         WHERE fel.organization_id = :organizationId
           AND fel.framework_type = :fwType
         GROUP BY fel.entity_id
       ) stats ON stats.entity_id = cs.id
       WHERE cs.${controlTitleCol} IS NOT NULL
       ORDER BY COALESCE(stats.evidence_count, 0) ASC, COALESCE(stats.avg_quality, 0) ASC`,
      { replacements: { organizationId, fwType: fw } },
    );

    allGaps.push(...(gaps as any[]));
  }

  return allGaps.map((g) => ({
    ...g,
    gap_type:
      g.evidence_count === 0
        ? "no_evidence"
        : g.avg_quality < qualityThreshold
          ? "low_quality"
          : "adequate",
  }));
};

/**
 * Get suggested control links for a file.
 */
export const getSuggestionsQuery = async (fileId: number, organizationId: number) => {
  const analysis = await getAnalysisByFileIdQuery(fileId, organizationId);
  if (!analysis) return null;

  return {
    file_id: fileId,
    suggested_control_links:
      typeof analysis.suggested_control_links === "string"
        ? JSON.parse(analysis.suggested_control_links)
        : analysis.suggested_control_links,
    overall_quality_score: analysis.overall_quality_score,
  };
};

/**
 * Apply suggested control links by creating file_entity_links.
 */
export const applySuggestionsQuery = async (
  fileId: number,
  organizationId: number,
  suggestions: Array<{
    control_id: number;
    framework_type: string;
  }>,
  createdBy?: number,
) => {
  const applied: any[] = [];

  for (const suggestion of suggestions) {
    const [result] = await sequelize.query(
      `INSERT INTO file_entity_links (
         organization_id, file_id, framework_type, entity_type, entity_id, link_type, created_by
       ) VALUES (
         :organizationId, :fileId, :frameworkType, 'control', :entityId, 'evidence', :createdBy
       )
       ON CONFLICT (file_id, framework_type, entity_type, entity_id) DO NOTHING
       RETURNING *`,
      {
        replacements: {
          organizationId,
          fileId,
          frameworkType: suggestion.framework_type,
          entityId: suggestion.control_id,
          createdBy: createdBy || null,
        },
      },
    );
    if ((result as any[]).length > 0) {
      applied.push((result as any[])[0]);
    }
  }

  return { applied_count: applied.length, links: applied };
};
