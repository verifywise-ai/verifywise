import { sequelize } from "../database/db";
import { QueryTypes } from "sequelize";
import { computeNextRun } from "../services/reporting/scheduleCalculator";

export async function createScheduledReportQuery(input: any, organization_id: number, userId: number): Promise<any> {
  const next = computeNextRun(input.scheduleConfig);
  const rows: any = await sequelize.query(
    `INSERT INTO scheduled_reports
       (organization_id, template_id, template_version_id, name, scope, project_id, framework_id, project_framework_id,
        sections_config, ai_blocks_config, format, schedule_config, delivery_config, is_active, owner_id, created_by, next_run_at)
     VALUES (:organization_id, :templateId, :templateVersionId, :name, :scope, :projectId, :frameworkId, :projectFrameworkId,
        :sections, :ai, :format, :schedule, :delivery, true, :userId, :userId, :nextRun)
     RETURNING *`,
    { replacements: {
        organization_id, templateId: input.templateId, templateVersionId: input.templateVersionId,
        name: input.name, scope: input.scope, projectId: input.projectId ?? null,
        frameworkId: input.frameworkId ?? null, projectFrameworkId: input.projectFrameworkId ?? null,
        sections: JSON.stringify(input.sectionsConfig), ai: JSON.stringify(input.aiBlocksConfig),
        format: input.format, schedule: JSON.stringify(input.scheduleConfig), delivery: JSON.stringify(input.deliveryConfig),
        userId, nextRun: next,
      }, type: QueryTypes.SELECT });
  return rows[0];
}

export async function listScheduledReportsQuery(organization_id: number): Promise<any[]> {
  return sequelize.query(
    `SELECT * FROM scheduled_reports WHERE organization_id = :organization_id AND deleted_at IS NULL ORDER BY created_at DESC`,
    { replacements: { organization_id }, type: QueryTypes.SELECT });
}

export async function getScheduledReportQuery(id: number, organization_id: number): Promise<any> {
  const rows: any[] = await sequelize.query(
    `SELECT * FROM scheduled_reports WHERE id = :id AND organization_id = :organization_id AND deleted_at IS NULL`,
    { replacements: { id, organization_id }, type: QueryTypes.SELECT });
  return rows[0] ?? null;
}

export async function setActiveQuery(id: number, organization_id: number, active: boolean): Promise<void> {
  await sequelize.query(
    `UPDATE scheduled_reports SET is_active = :active, updated_at = NOW() WHERE id = :id AND organization_id = :organization_id`,
    { replacements: { id, organization_id, active }, type: QueryTypes.UPDATE });
}

export async function softDeleteQuery(id: number, organization_id: number): Promise<void> {
  await sequelize.query(
    `UPDATE scheduled_reports SET deleted_at = NOW(), is_active = false WHERE id = :id AND organization_id = :organization_id`,
    { replacements: { id, organization_id }, type: QueryTypes.UPDATE });
}

export async function findDueScheduledReportsQuery(now: Date): Promise<any[]> {
  return sequelize.query(
    `SELECT * FROM scheduled_reports WHERE is_active = true AND deleted_at IS NULL AND next_run_at IS NOT NULL AND next_run_at <= :now`,
    { replacements: { now }, type: QueryTypes.SELECT });
}

export async function markRunEnqueuedQuery(id: number, lastRun: Date, nextRun: Date): Promise<void> {
  await sequelize.query(
    `UPDATE scheduled_reports SET last_run_at = :lastRun, next_run_at = :nextRun, updated_at = NOW() WHERE id = :id`,
    { replacements: { id, lastRun, nextRun }, type: QueryTypes.UPDATE });
}
