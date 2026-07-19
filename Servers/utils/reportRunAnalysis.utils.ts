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
