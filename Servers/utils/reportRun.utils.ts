import { sequelize } from "../database/db";
import { QueryTypes } from "sequelize";

export async function createRunQuery(input: any): Promise<any> {
  const rows: any[] = await sequelize.query(
    `INSERT INTO report_runs
       (organization_id, scheduled_report_id, template_id, template_version_id, triggered_by, triggered_by_user_id, status, started_at, config_snapshot, scheduled_for)
     VALUES (:organization_id, :scheduled_report_id, :template_id, :template_version_id, :triggered_by, :triggered_by_user_id, 'running', NOW(), :config_snapshot, :scheduled_for)
     RETURNING *`,
    { replacements: {
        organization_id: input.organization_id, scheduled_report_id: input.scheduled_report_id ?? null,
        template_id: input.template_id ?? null, template_version_id: input.template_version_id ?? null,
        triggered_by: input.triggered_by, triggered_by_user_id: input.triggered_by_user_id ?? null,
        config_snapshot: JSON.stringify(input.config_snapshot ?? {}), scheduled_for: input.scheduled_for ?? null,
      }, type: QueryTypes.SELECT });
  return rows[0];
}

export async function updateRunStatusQuery(id: number, fields: any): Promise<void> {
  await sequelize.query(
    `UPDATE report_runs SET status = :status, completed_at = NOW(), file_id = :file_id, output_filename = :output_filename,
       output_mime_type = :output_mime_type, delivery_status = :delivery_status, ai_status = :ai_status,
       ai_tokens_used = :ai_tokens_used, ai_cost = :ai_cost, duration_ms = :duration_ms, error_message = :error_message, updated_at = NOW()
     WHERE id = :id`,
    { replacements: {
        id, status: fields.status, file_id: fields.file_id ?? null, output_filename: fields.output_filename ?? null,
        output_mime_type: fields.output_mime_type ?? null, delivery_status: JSON.stringify(fields.delivery_status ?? {}),
        ai_status: JSON.stringify(fields.ai_status ?? {}), ai_tokens_used: fields.ai_tokens_used ?? null,
        ai_cost: fields.ai_cost ?? null, duration_ms: fields.duration_ms ?? null, error_message: fields.error_message ?? null,
      }, type: QueryTypes.UPDATE });
}

export async function listRunsQuery(organization_id: number, filters: any): Promise<any[]> {
  return sequelize.query(
    `SELECT * FROM report_runs WHERE organization_id = :organization_id
       AND (:scheduledReportId IS NULL OR scheduled_report_id = :scheduledReportId)
       AND (:status IS NULL OR status = :status)
     ORDER BY created_at DESC LIMIT 200`,
    { replacements: { organization_id, scheduledReportId: filters.scheduledReportId ?? null, status: filters.status ?? null }, type: QueryTypes.SELECT });
}

export async function getRunQuery(id: number, organization_id: number): Promise<any> {
  const rows: any[] = await sequelize.query(
    `SELECT * FROM report_runs WHERE id = :id AND organization_id = :organization_id`,
    { replacements: { id, organization_id }, type: QueryTypes.SELECT });
  return rows[0] ?? null;
}
