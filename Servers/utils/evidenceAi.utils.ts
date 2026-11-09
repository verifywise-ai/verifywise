import { sequelize } from "../database/db";
import { buildVisibilityFilterForEvidence } from "./visibility.utils";
import { VISIBLE_FILE_REPLACEMENTS, VISIBLE_FILE_SQL } from "./files/visibleFiles";
import type { QualityGrade } from "../domain.layer/interfaces/i.evidenceAi";
import { logStructured } from "./logger/fileLogger";

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
    overall_quality_grade: QualityGrade | null;
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
         overall_quality_grade = :overall_quality_grade,
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
          overall_quality_grade: data.overall_quality_grade,
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
       quality_score, overall_quality_grade, suggested_control_links,
       analysis_model, analyzed_by, visibility, organization_id,
       audit_metadata
     ) VALUES (
       :fileId, :summary, :key_findings, :compliance_areas,
       :quality_score, :overall_quality_grade, :suggested_control_links,
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
        overall_quality_grade: data.overall_quality_grade,
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
     ORDER BY CASE eaa.overall_quality_grade
       WHEN 'F' THEN 0 WHEN 'D' THEN 1 WHEN 'C' THEN 2
       WHEN 'B' THEN 3 WHEN 'A' THEN 4 ELSE 5 END ASC`,
    { replacements: { organizationId, ...vis.replacements } },
  );
  return rows as any[];
};

/**
 * Where a framework's evidence lives, and how a link row points at the
 * requirement it is evidence for.
 *
 * Evidence is attached from several drawers, and each one stores a different
 * kind of id in file_entity_links.entity_id:
 *
 * - `control` (EU AI Act) — a controls_struct_eu template id, written by
 *   applySuggestionsQuery when an AI suggestion is accepted.
 * - `control` (ISO 42001) — an annexcategories_struct_iso template id, same
 *   writer: the suggestion matcher works on template rows for both frameworks.
 * - `subcontrol` — a per-project subcontrols_eu id (the subcontrol drawer),
 *   which reaches its template through controls_eu.control_meta_id.
 * - `annex_category` — a per-project annexcategories_iso id (the annex drawer),
 *   which reaches its template through annexcategory_meta_id.
 *
 * Counting these id spaces as if they were one — joining every link of a
 * framework straight onto the struct table — made a subcontrol id read as a
 * control template id, so controls showed evidence they did not have and gaps
 * they did not have either. Each source below therefore maps its own id space
 * up to the template id, and the entity types that belong to a different axis
 * are left out:
 *
 * - `assessment` (EU AI Act) stores an answers_eu id. Answers hang off
 *   questions_struct_eu → subtopics → topics, which never reaches
 *   controls_struct_eu — the assessment tracker is a separate axis from the
 *   compliance tracker, so assessment evidence cannot be attributed to a
 *   control at all.
 * - `subclause` (ISO 42001) stores a subclauses_iso id, which belongs to the
 *   clause axis rather than to an annex category.
 */
type EvidenceLinkSource = {
  /** file_entity_links.entity_type this source reads. */
  entityType: string;
  /** Expression yielding the requirement (template) id this link counts against. */
  requirementId: string;
  /** Joins mapping a per-project row up to its template. */
  joins?: string;
};

const EVIDENCE_REQUIREMENT_SOURCES: Record<
  string,
  { structTable: string; titleColumn: string; linkSources: EvidenceLinkSource[] }
> = {
  eu_ai_act: {
    structTable: "controls_struct_eu",
    titleColumn: "title",
    linkSources: [
      { entityType: "control", requirementId: "fel.entity_id" },
      {
        entityType: "subcontrol",
        requirementId: "ce.control_meta_id",
        joins: `JOIN subcontrols_eu sc
                  ON sc.id = fel.entity_id AND sc.organization_id = fel.organization_id
                JOIN controls_eu ce
                  ON ce.id = sc.control_id AND ce.organization_id = fel.organization_id`,
      },
    ],
  },
  iso_42001: {
    structTable: "annexcategories_struct_iso",
    titleColumn: "title",
    linkSources: [
      { entityType: "control", requirementId: "fel.entity_id" },
      {
        entityType: "annex_category",
        requirementId: "ac.annexcategory_meta_id",
        joins: `JOIN annexcategories_iso ac
                  ON ac.id = fel.entity_id AND ac.organization_id = fel.organization_id`,
      },
    ],
  },
};

/**
 * One link source as a SELECT of (file_id, requirement_id).
 *
 * The project filter is applied per source rather than once at the end: a link
 * row carries no project, so the restriction has to be made against the file.
 */
const buildLinkSourceSql = (source: EvidenceLinkSource): string =>
  `SELECT fel.file_id, ${source.requirementId} AS requirement_id
     FROM file_entity_links fel
     ${source.joins ?? ""}
    WHERE fel.organization_id = :organizationId
      AND fel.framework_type = :fwType
      AND fel.entity_type = '${source.entityType}'
      -- Feedback files (e.g. subcontrol feedback) are not evidence;
      -- only links created as evidence count toward coverage (#4911).
      AND fel.link_type = 'evidence'
      AND (:projectId IS NULL OR EXISTS (
            SELECT 1 FROM files pf
             WHERE pf.id = fel.file_id
               AND pf.organization_id = fel.organization_id
               AND pf.project_id = :projectId
          ))`;

/**
 * Log what the organization's links look like before they are counted, broken
 * down by entity type and marked counted / not counted.
 *
 * This is the line that explains an empty report: evidence attached from the
 * assessment or subclause drawer is real evidence, but it belongs to another
 * axis and never reaches a control, so coverage can read 0% while files exist.
 */
const logLinkBreakdown = async (organizationId: number, fwTypes: string[]) => {
  const [rows] = await sequelize.query(
    `SELECT framework_type, entity_type, link_type,
            COUNT(*)::int as links,
            COUNT(DISTINCT file_id)::int as files
       FROM file_entity_links
      WHERE organization_id = :organizationId
        AND framework_type IN (:fwTypes)
      GROUP BY framework_type, entity_type, link_type
      ORDER BY framework_type, entity_type, link_type`,
    { replacements: { organizationId, fwTypes } },
  );

  const breakdown = (rows as any[]).map((r) => {
    // A link counts only if its entity type is one this framework maps AND it
    // was created as evidence — feedback files live in the same table (#4911).
    const counted =
      r.link_type === "evidence" &&
      (EVIDENCE_REQUIREMENT_SOURCES[r.framework_type]?.linkSources ?? []).some(
        (source) => source.entityType === r.entity_type,
      );
    return `${r.framework_type}/${r.entity_type}/${r.link_type}=${r.files} file(s)${
      counted ? "" : " NOT COUNTED"
    }`;
  });

  logStructured(
    "processing",
    breakdown.length > 0
      ? `evidence links for org ${organizationId}: ${breakdown.join(", ")}`
      : `evidence links for org ${organizationId}: none for ${fwTypes.join(", ")}`,
    "getEvidenceGapsQuery",
    "evidenceAi.utils.ts",
  );
};

/**
 * Get evidence gap analysis — controls lacking evidence or with low quality.
 */
/** Platform framework ids for the frameworks evidence gaps are computed for. */
const EVIDENCE_FRAMEWORK_IDS: Record<string, number> = { eu_ai_act: 1, iso_42001: 2 };

/**
 * The evidence frameworks the organization has adopted on at least one use
 * case. Coverage over a framework nobody uses reads as a gap in every one of
 * its controls, so an unfiltered coverage view is limited to these.
 */
export const getAdoptedEvidenceFrameworksQuery = async (
  organizationId: number,
): Promise<string[]> => {
  const [rows] = await sequelize.query(
    `SELECT DISTINCT framework_id
       FROM projects_frameworks
      WHERE organization_id = :organizationId
        AND framework_id IN (:frameworkIds)`,
    {
      replacements: { organizationId, frameworkIds: Object.values(EVIDENCE_FRAMEWORK_IDS) },
    },
  );
  const adopted = new Set((rows as any[]).map((r) => Number(r.framework_id)));
  return Object.entries(EVIDENCE_FRAMEWORK_IDS)
    .filter(([, id]) => adopted.has(id))
    .map(([key]) => key);
};

export const getEvidenceGapsQuery = async (
  organizationId: number,
  frameworkType?: string,
  lowGrades: QualityGrade[] = ["D", "F"],
  /** Restrict counted evidence to files uploaded under this project. */
  projectId?: number,
  /**
   * With no `frameworkType`, check only these frameworks instead of every one
   * this module knows (see getAdoptedEvidenceFrameworksQuery).
   */
  onlyFrameworks?: string[],
) => {
  const fwTypes = frameworkType
    ? [frameworkType]
    : (onlyFrameworks ?? Object.keys(EVIDENCE_REQUIREMENT_SOURCES));
  if (fwTypes.length === 0) return [];
  const known = fwTypes.filter((fw) => EVIDENCE_REQUIREMENT_SOURCES[fw]);

  if (known.length === 0) {
    logStructured(
      "error",
      `no evidence requirement mapping for framework "${frameworkType}" — returning no gaps`,
      "getEvidenceGapsQuery",
      "evidenceAi.utils.ts",
    );
    return [];
  }

  await logLinkBreakdown(organizationId, known);

  const allGaps: any[] = [];

  for (const fw of known) {
    const source = EVIDENCE_REQUIREMENT_SOURCES[fw];

    // adequate evidence = an analysis whose overall_quality_grade is graded and
    // NOT in the low set. Low-quality (unrated/D/F) evidence and un-analyzed
    // files don't count toward adequacy, so a control with only those reads as
    // a gap. Worst controls (fewest evidence, then fewest adequate) sort first.
    const [gaps] = await sequelize.query(
      `WITH requirement_links AS (
         ${source.linkSources.map(buildLinkSourceSql).join("\n         UNION ALL\n         ")}
       )
       SELECT
         :fwType as framework_type,
         cs.id as control_id,
         cs.${source.titleColumn} as control_title,
         COALESCE(stats.evidence_count, 0)::int as evidence_count,
         COALESCE(stats.adequate_count, 0)::int as adequate_count
       FROM ${source.structTable} cs
       LEFT JOIN (
         SELECT
           rl.requirement_id,
           COUNT(DISTINCT rl.file_id) as evidence_count,
           COUNT(DISTINCT rl.file_id) FILTER (
             WHERE eaa.overall_quality_grade IS NOT NULL
               AND eaa.overall_quality_grade <> ALL(ARRAY[:lowGrades]::varchar[])
           ) as adequate_count
         FROM requirement_links rl
         LEFT JOIN evidence_ai_analysis eaa
           ON eaa.file_id = rl.file_id AND eaa.organization_id = :organizationId
         GROUP BY rl.requirement_id
       ) stats ON stats.requirement_id = cs.id
       WHERE cs.${source.titleColumn} IS NOT NULL
       ORDER BY COALESCE(stats.evidence_count, 0) ASC, COALESCE(stats.adequate_count, 0) ASC`,
      { replacements: { organizationId, fwType: fw, lowGrades, projectId: projectId ?? null } },
    );

    const rows = gaps as any[];
    const withEvidence = rows.filter((r) => r.evidence_count > 0);
    logStructured(
      "successful",
      `${fw}: ${rows.length} requirements from ${source.structTable}, ` +
        `${withEvidence.length} with evidence attributed ` +
        `(sources: ${source.linkSources.map((l) => l.entityType).join(", ")}; ` +
        `low grades: ${lowGrades.join(", ")}${projectId ? `; project ${projectId}` : ""})`,
      "getEvidenceGapsQuery",
      "evidenceAi.utils.ts",
    );

    allGaps.push(...rows);
  }

  return allGaps.map((g) => ({
    ...g,
    gap_type:
      g.evidence_count === 0 ? "no_evidence" : g.adequate_count === 0 ? "low_quality" : "adequate",
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
    overall_quality_grade: analysis.overall_quality_grade,
  };
};

/**
 * Apply suggested control links by creating file_entity_links. A link is only
 * created for a visible file in the organization: a stance PDF, a missing id
 * or another organization's file inserts nothing.
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
       )
       SELECT :organizationId, f.id, :frameworkType, 'control', :entityId, 'evidence', :createdBy
         FROM files f
        WHERE f.id = :fileId AND f.organization_id = :organizationId AND ${VISIBLE_FILE_SQL("f")}
       ON CONFLICT (file_id, framework_type, entity_type, entity_id) DO NOTHING
       RETURNING *`,
      {
        replacements: {
          organizationId,
          fileId,
          frameworkType: suggestion.framework_type,
          entityId: suggestion.control_id,
          createdBy: createdBy || null,
          ...VISIBLE_FILE_REPLACEMENTS,
        },
      },
    );
    if ((result as any[]).length > 0) {
      applied.push((result as any[])[0]);
    }
  }

  return { applied_count: applied.length, links: applied };
};
