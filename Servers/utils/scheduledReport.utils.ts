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

/**
 * owner_role is joined in so the scheduler can pass the owner's REAL role to
 * assertReportScopeAllowed — without it every org-scope schedule looks
 * owner-less to the Admin/SuperAdmin bypass, including ones an Admin created
 * and that are fully permitted, drowning the "schedules that predate the
 * rule" warning list in false entries. LEFT JOINs so a schedule whose owner
 * was since deleted still comes back (owner_role NULL) rather than vanishing
 * from the due list.
 */
export async function findDueScheduledReportsQuery(now: Date): Promise<any[]> {
  return sequelize.query(
    `SELECT sr.*, r.name AS owner_role
       FROM scheduled_reports sr
       LEFT JOIN users u ON u.id = sr.owner_id
       LEFT JOIN roles r ON r.id = u.role_id
      WHERE sr.is_active = true AND sr.deleted_at IS NULL AND sr.next_run_at IS NOT NULL AND sr.next_run_at <= :now`,
    { replacements: { now }, type: QueryTypes.SELECT },
  );
}

/**
 * Atomically claim a due scheduled report by advancing its next_run_at.
 *
 * The UPDATE is guarded by `next_run_at = :expectedNextRun` (the value the tick
 * read when selecting the row) so it acts as a compare-and-swap: only the first
 * tick to run the UPDATE matches and advances the row; a concurrent overlapping
 * tick sees the already-advanced value, matches zero rows, and must skip the
 * report. Returns true only for the tick that won the claim, which prevents the
 * same scheduled slot from being delivered twice.
 *
 * When expectedNextRun is null the guard falls back to id-only (unconditional),
 * preserving the previous behaviour for rows without a prior next_run_at.
 */
export async function markRunEnqueuedQuery(
  id: number,
  lastRun: Date,
  nextRun: Date,
  expectedNextRun?: Date | null,
): Promise<boolean> {
  // The expected value is a JS Date (millisecond precision) while next_run_at is
  // a TIMESTAMPTZ (microsecond precision). Compare both at millisecond precision
  // via date_trunc so a microsecond-precise stored value still matches the bound
  // value and the claim doesn't silently fail forever.
  const [, meta] = await sequelize.query(
    `UPDATE scheduled_reports
       SET last_run_at = :lastRun, next_run_at = :nextRun, updated_at = NOW()
     WHERE id = :id
       AND is_active = true
       AND deleted_at IS NULL
       ${
         expectedNextRun != null
           ? "AND date_trunc('milliseconds', next_run_at) = date_trunc('milliseconds', :expectedNextRun::timestamptz)"
           : ""
       }`,
    {
      replacements: { id, lastRun, nextRun, expectedNextRun: expectedNextRun ?? null },
      type: QueryTypes.UPDATE,
    },
  );
  // Sequelize's raw UPDATE returns [results, metadata]; with the pg driver the
  // affected-row count is metadata.rowCount, not a bare number. Only the tick
  // whose CAS matched a row (rowCount > 0) has won the claim.
  const rowCount =
    typeof meta === "number" ? meta : ((meta as unknown as { rowCount?: number })?.rowCount ?? 0);
  return rowCount > 0;
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
