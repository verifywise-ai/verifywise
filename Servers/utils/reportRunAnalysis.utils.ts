import { sequelize } from "../database/db";

export interface RunAnalysisInput {
  report_run_id: number;
  section_key: string;
  organization_id: number;
  payload: any;
  analysis_model: string | null;
  analyzed_by: number | null;
  audit_metadata: any | null;
}

/**
 * Upsert one analysis row per (run, section, org). Re-analysis bumps the
 * version in place rather than inserting a duplicate. ON CONFLICT (not
 * check-then-write) because the six analyzers write concurrently.
 *
 * Tenant isolation: the WHERE EXISTS guard refuses to write when the run does
 * not belong to the given organization — the FKs only check existence, so an
 * inconsistent (org A's run, org B) pair would otherwise get its own valid row
 * and leak org A's payload to org B via getRunAnalysesQuery.
 *
 * @returns the upserted row, or `undefined` when the run does not belong to
 * `organization_id` (zero rows written). Callers MUST treat `undefined` as a
 * failed write, not a silent success.
 */
export const upsertRunAnalysisQuery = async (input: RunAnalysisInput) => {
  const result = (await sequelize.query(
    `INSERT INTO report_run_analyses
       (report_run_id, section_key, organization_id, payload,
        analysis_model, analysis_version, analyzed_at, analyzed_by, audit_metadata)
     SELECT :report_run_id, :section_key, :organization_id, :payload,
            :analysis_model, 1, NOW(), :analyzed_by, :audit_metadata
      WHERE EXISTS (
        SELECT 1 FROM report_runs
         WHERE id = :report_run_id AND organization_id = :organization_id
      )
     ON CONFLICT (report_run_id, section_key, organization_id)
     DO UPDATE SET
       payload = EXCLUDED.payload,
       analysis_model = EXCLUDED.analysis_model,
       analysis_version = report_run_analyses.analysis_version + 1,
       analyzed_at = NOW(),
       analyzed_by = EXCLUDED.analyzed_by,
       audit_metadata = EXCLUDED.audit_metadata
     RETURNING *;`,
    {
      replacements: {
        report_run_id: input.report_run_id,
        section_key: input.section_key,
        organization_id: input.organization_id,
        payload: JSON.stringify(input.payload ?? {}),
        analysis_model: input.analysis_model,
        analyzed_by: input.analyzed_by,
        audit_metadata: input.audit_metadata ? JSON.stringify(input.audit_metadata) : null,
      },
    },
  )) as [any[], number];
  return result[0][0];
};

export const getRunAnalysesQuery = async (reportRunId: number, organizationId: number) => {
  const result = (await sequelize.query(
    `SELECT * FROM report_run_analyses
      WHERE report_run_id = :report_run_id
        AND organization_id = :organization_id
      ORDER BY section_key;`,
    { replacements: { report_run_id: reportRunId, organization_id: organizationId } },
  )) as [any[], number];
  return result[0];
};

/**
 * The most recent facts snapshot stored for a schedule — the input to
 * prior-run comparison (design §10). One extra read, no LLM call.
 *
 * persistAnalyses writes the same snapshot onto every section row of a run, so
 * any row answers "what did the last run see"; newest-first plus LIMIT 1 picks
 * one without caring which section's write succeeded.
 *
 * Tenant isolation: organization_id is filtered on report_runs AND on
 * report_run_analyses. report_runs alone would be enough today — the sidecar
 * cannot outlive its run — but a guard on only one side of a join is the shape
 * that leaks when the join is later rewritten.
 *
 * The caller's own run cannot match itself: analyses are persisted after
 * generation, so at read time the current run has no rows. If an
 * analyse-in-place path is ever added, pass the run id and exclude it here.
 *
 * `-> 'facts'` (not `->>`) returns JSONB, which pg hands back as a parsed
 * object. `IS NOT NULL` is SQL NULL only, so a row that stored a JSON `null`
 * would slip through — persistAnalyses therefore omits the key entirely rather
 * than writing null.
 *
 * No explicit return type, matching the two exports above.
 */
export const getPriorFactsSnapshotQuery = async (
  scheduledReportId: number,
  organizationId: number,
) => {
  const result = (await sequelize.query(
    `SELECT ra.audit_metadata -> 'facts' AS facts
       FROM report_run_analyses ra
       JOIN report_runs r ON r.id = ra.report_run_id
      WHERE r.scheduled_report_id = :scheduled_report_id
        AND r.organization_id = :organization_id
        AND ra.organization_id = :organization_id
        AND ra.audit_metadata -> 'facts' IS NOT NULL
      ORDER BY ra.analyzed_at DESC
      LIMIT 1;`,
    {
      replacements: {
        scheduled_report_id: scheduledReportId,
        organization_id: organizationId,
      },
    },
  )) as [any[], number];
  return result[0][0]?.facts ?? null;
};
