import { sequelize } from "../database/db";
import { QueryTypes } from "sequelize";
import { computeNextRun } from "../services/reporting/scheduleCalculator";

export async function createScheduledReportQuery(
  input: any,
  organization_id: number,
  userId: number,
): Promise<any> {
  const next = computeNextRun(input.scheduleConfig);
  const rows: any = await sequelize.query(
    `INSERT INTO scheduled_reports
       (organization_id, template_id, template_version_id, name, scope, project_id, framework_id, framework_ids, project_framework_id,
        sections_config, ai_blocks_config, format, schedule_config, delivery_config, is_active, owner_id, created_by, next_run_at)
     VALUES (:organization_id, :templateId, :templateVersionId, :name, :scope, :projectId, :frameworkId, :frameworkIds, :projectFrameworkId,
        :sections, :ai, :format, :schedule, :delivery, true, :userId, :userId, :nextRun)
     RETURNING *`,
    {
      replacements: {
        organization_id,
        templateId: input.templateId,
        templateVersionId: input.templateVersionId,
        name: input.name,
        scope: input.scope,
        projectId: input.projectId ?? null,
        frameworkId: input.frameworkId ?? null,
        projectFrameworkId: input.projectFrameworkId ?? null,
        // JSONB, like sections_config below: an array has to arrive as JSON
        // text. NULL (not "[]") for an absent selection, so the column keeps
        // meaning "every framework in scope" exactly as a pre-column row does.
        frameworkIds: input.frameworkIds ? JSON.stringify(input.frameworkIds) : null,
        sections: JSON.stringify(input.sectionsConfig),
        ai: JSON.stringify(input.aiBlocksConfig),
        format: input.format,
        schedule: JSON.stringify(input.scheduleConfig),
        delivery: JSON.stringify(input.deliveryConfig),
        userId,
        nextRun: next,
      },
      type: QueryTypes.SELECT,
    },
  );
  return rows[0];
}

export async function listScheduledReportsQuery(organization_id: number): Promise<any[]> {
  return sequelize.query(
    `SELECT * FROM scheduled_reports WHERE organization_id = :organization_id AND deleted_at IS NULL ORDER BY created_at DESC`,
    { replacements: { organization_id }, type: QueryTypes.SELECT },
  );
}

export async function getScheduledReportQuery(id: number, organization_id: number): Promise<any> {
  const rows: any[] = await sequelize.query(
    `SELECT * FROM scheduled_reports WHERE id = :id AND organization_id = :organization_id AND deleted_at IS NULL`,
    { replacements: { id, organization_id }, type: QueryTypes.SELECT },
  );
  return rows[0] ?? null;
}

export async function setActiveQuery(
  id: number,
  organization_id: number,
  active: boolean,
): Promise<void> {
  await sequelize.query(
    `UPDATE scheduled_reports SET is_active = :active, updated_at = NOW() WHERE id = :id AND organization_id = :organization_id`,
    { replacements: { id, organization_id, active }, type: QueryTypes.UPDATE },
  );
}

export async function softDeleteQuery(id: number, organization_id: number): Promise<void> {
  await sequelize.query(
    `UPDATE scheduled_reports SET deleted_at = NOW(), is_active = false WHERE id = :id AND organization_id = :organization_id`,
    { replacements: { id, organization_id }, type: QueryTypes.UPDATE },
  );
}

export async function findDueScheduledReportsQuery(now: Date): Promise<any[]> {
  return sequelize.query(
    `SELECT * FROM scheduled_reports WHERE is_active = true AND deleted_at IS NULL AND next_run_at IS NOT NULL AND next_run_at <= :now`,
    { replacements: { now }, type: QueryTypes.SELECT },
  );
}

export async function markRunEnqueuedQuery(
  id: number,
  lastRun: Date,
  nextRun: Date,
): Promise<void> {
  await sequelize.query(
    `UPDATE scheduled_reports SET last_run_at = :lastRun, next_run_at = :nextRun, updated_at = NOW() WHERE id = :id`,
    { replacements: { id, lastRun, nextRun }, type: QueryTypes.UPDATE },
  );
}

// Editable fields only. organization_id, template_id, template_version_id and
// created_by are deliberately absent — a PATCH must not be able to move a
// schedule between tenants or re-point it at another template.
export const UPDATABLE_FIELDS: Record<string, string> = {
  name: "name",
  scope: "scope",
  projectId: "project_id",
  frameworkId: "framework_id",
  frameworkIds: "framework_ids",
  projectFrameworkId: "project_framework_id",
  sectionsConfig: "sections_config",
  aiBlocksConfig: "ai_blocks_config",
  format: "format",
  scheduleConfig: "schedule_config",
  deliveryConfig: "delivery_config",
};

const JSON_FIELDS = new Set([
  // framework_ids is a JSONB array, so it goes through the same stringify as
  // the JSONB objects — passing the raw array would bind a Postgres array.
  "frameworkIds",
  "sectionsConfig",
  "aiBlocksConfig",
  "scheduleConfig",
  "deliveryConfig",
]);

export async function updateScheduledReportQuery(
  id: number,
  organization_id: number,
  input: any,
): Promise<any> {
  const sets: string[] = [];
  const replacements: any = { id, organization_id };

  for (const [key, column] of Object.entries(UPDATABLE_FIELDS)) {
    if (input[key] === undefined) continue;
    sets.push(`${column} = :${key}`);
    replacements[key] = JSON_FIELDS.has(key) ? JSON.stringify(input[key]) : input[key];
  }

  if (!sets.length) return null;

  // A schedule change invalidates the stored next_run_at — without this the
  // report keeps firing on the old cadence until its next tick.
  if (input.scheduleConfig !== undefined) {
    sets.push("next_run_at = :nextRun");
    replacements.nextRun = computeNextRun(input.scheduleConfig);
  }

  sets.push("updated_at = NOW()");

  const result: any = await sequelize.query(
    `UPDATE scheduled_reports SET ${sets.join(", ")}
      WHERE id = :id AND organization_id = :organization_id AND deleted_at IS NULL
      RETURNING *`,
    { replacements, type: QueryTypes.UPDATE },
  );
  return result[0]?.[0] ?? null;
}
