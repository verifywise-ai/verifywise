import { sequelize } from "../database/db";
import { QueryTypes } from "sequelize";
import { deleteFileById } from "./fileUpload.utils";

export async function createRunQuery(input: any): Promise<any> {
  const rows: any[] = await sequelize.query(
    `INSERT INTO report_runs
       (organization_id, scheduled_report_id, template_id, template_version_id, triggered_by, triggered_by_user_id, status, started_at, config_snapshot, scheduled_for)
     VALUES (:organization_id, :scheduled_report_id, :template_id, :template_version_id, :triggered_by, :triggered_by_user_id, 'running', NOW(), :config_snapshot, :scheduled_for)
     RETURNING *`,
    {
      replacements: {
        organization_id: input.organization_id,
        scheduled_report_id: input.scheduled_report_id ?? null,
        template_id: input.template_id ?? null,
        template_version_id: input.template_version_id ?? null,
        triggered_by: input.triggered_by,
        triggered_by_user_id: input.triggered_by_user_id ?? null,
        config_snapshot: JSON.stringify(input.config_snapshot ?? {}),
        scheduled_for: input.scheduled_for ?? null,
      },
      type: QueryTypes.SELECT,
    },
  );
  return rows[0];
}

const TERMINAL_RUN_STATUSES = ["success", "failed", "partial_success"];

// completed_at is only stamped for terminal statuses. Setting it
// unconditionally would mark a run complete on any future intermediate-progress
// update through this same function.
export async function updateRunStatusQuery(
  id: number,
  organization_id: number,
  fields: any,
): Promise<void> {
  const completedAt = TERMINAL_RUN_STATUSES.includes(fields.status) ? "completed_at = NOW(), " : "";
  await sequelize.query(
    `UPDATE report_runs SET status = :status, ${completedAt}file_id = :file_id, output_filename = :output_filename,
       output_mime_type = :output_mime_type, delivery_status = :delivery_status, ai_status = :ai_status,
       ai_tokens_used = :ai_tokens_used, ai_cost = :ai_cost, duration_ms = :duration_ms, error_message = :error_message, updated_at = NOW()
     WHERE id = :id AND organization_id = :organization_id`,
    {
      replacements: {
        id,
        organization_id,
        status: fields.status,
        file_id: fields.file_id ?? null,
        output_filename: fields.output_filename ?? null,
        output_mime_type: fields.output_mime_type ?? null,
        delivery_status: JSON.stringify(fields.delivery_status ?? {}),
        ai_status: JSON.stringify(fields.ai_status ?? {}),
        ai_tokens_used: fields.ai_tokens_used ?? null,
        ai_cost: fields.ai_cost ?? null,
        duration_ms: fields.duration_ms ?? null,
        error_message: fields.error_message ?? null,
      },
      type: QueryTypes.UPDATE,
    },
  );
}

/**
 * Who is asking. The runs list is not purely organization-scoped: the legacy
 * Generate list it replaced showed a non-Admin only the reports of projects
 * they own or are a member of (`getGeneratedReportsQuery`), and that rule has
 * to survive the move to report_runs. Required, not optional — a caller that
 * cannot say who the viewer is must not get an organization-wide list by
 * default.
 */
export type ReportRunViewer = {
  userId: number | null;
  /** Role name from the JWT: Admin, Reviewer, Editor, Auditor, SuperAdmin. */
  role: string | null;
};

/**
 * The project a run covers, as text, or NULL when it covers the whole
 * organization.
 *
 * report_runs has no project column, so the value comes from two places:
 * config_snapshot.project_id, which runScheduledReport writes for every run it
 * creates and the legacy backfill migration wrote for imported files; and the
 * schedule's own project_id, which covers runs created before the snapshot
 * carried one. Compared as text so a snapshot value that is not a number can
 * never raise a cast error mid-query.
 */
const RUN_PROJECT_ID_SQL = `COALESCE(rr.config_snapshot->>'project_id', sr.project_id::text)`;

// sr is joined for RUN_PROJECT_ID_SQL alone. Org-scoped on the join, like every
// other table this file touches.
const RUN_FROM_SQL = `FROM report_runs rr
     LEFT JOIN scheduled_reports sr
       ON sr.id = rr.scheduled_report_id AND sr.organization_id = :organization_id`;

/**
 * The membership predicate, or null when the viewer may see everything.
 *
 * Mirrors getGeneratedReportsQuery: Admin and SuperAdmin are unrestricted,
 * everyone else sees a project's report only if they own the project or are a
 * member of it. An organization-scoped report (no project) is visible to all —
 * the spec calls the legacy inner join to `projects` a bug precisely because it
 * hid those.
 */
function viewerVisibilitySql(viewer: ReportRunViewer): string | null {
  if (viewer.role === "Admin" || viewer.role === "SuperAdmin") return null;
  return `(${RUN_PROJECT_ID_SQL} IS NULL OR EXISTS (
       SELECT 1 FROM projects p
       LEFT JOIN projects_members pm
         ON pm.project_id = p.id AND pm.organization_id = :organization_id
       WHERE p.id::text = ${RUN_PROJECT_ID_SQL}
         AND p.organization_id = :organization_id
         AND (p.owner = :viewerUserId OR pm.user_id = :viewerUserId)
     ))`;
}

/**
 * May this viewer see this one run?
 *
 * The same rule `listRunsQuery` applies to the list, applied to a single id, so
 * the two can never drift: both are built from `viewerVisibilitySql` over
 * `RUN_FROM_SQL`. If a run does not appear in your list you cannot fetch,
 * download or read the analyses of it either — run ids are sequential integers,
 * so an organization-scoped-only per-run endpoint let any member of the
 * organization enumerate ids and read every project's report.
 *
 * Deliberately *not* `canUserAccessFile`: that reads the *file's* `project_id` /
 * `org_id`, which the delivery service does not populate the way a run's scope
 * is derived (`config_snapshot->>'project_id'`), so it would deny a user their
 * own organization-scoped report.
 *
 * A false result means "no such run, as far as you are concerned" — it does not
 * distinguish a run in another organization, a nonexistent id and a run for a
 * project you are not on, and callers turn all three into the same 404.
 */
export async function canViewRunQuery(
  id: number,
  organization_id: number,
  viewer: ReportRunViewer,
): Promise<boolean> {
  const where: string[] = ["rr.id = :id", "rr.organization_id = :organization_id"];
  const replacements: any = { id, organization_id };

  const visibility = viewerVisibilitySql(viewer);
  if (visibility) {
    where.push(visibility);
    replacements.viewerUserId = viewer.userId;
  }

  const rows: any[] = await sequelize.query(
    `SELECT 1 AS ok
     ${RUN_FROM_SQL}
     WHERE ${where.join(" AND ")}
     LIMIT 1`,
    { replacements, type: QueryTypes.SELECT },
  );
  return rows.length > 0;
}

// Pagination replaces a hard LIMIT 200. The default limit is still 200 and
// offset 0, so a caller that passes nothing sees exactly what it saw before.
// `total` lets a UI page without a second endpoint.
export async function listRunsQuery(
  organization_id: number,
  filters: {
    scheduledReportId?: any;
    status?: any;
    archived?: boolean;
    limit?: number;
    offset?: number;
  } = {},
  viewer: ReportRunViewer,
): Promise<{ rows: any[]; total: number }> {
  const where: string[] = ["rr.organization_id = :organization_id"];
  const replacements: any = { organization_id };

  if (filters.scheduledReportId) {
    where.push("rr.scheduled_report_id = :scheduledReportId");
    replacements.scheduledReportId = Number(filters.scheduledReportId);
  }
  if (filters.status) {
    where.push("rr.status = :status");
    replacements.status = String(filters.status);
  }

  // Tri-state on purpose: true → archived only, false → live only, undefined →
  // both. An omitted flag must keep the pre-archive behaviour for any caller
  // that has not opted in.
  if (filters.archived === true) {
    where.push("rr.archived_at IS NOT NULL");
  } else if (filters.archived === false) {
    where.push("rr.archived_at IS NULL");
  }

  const visibility = viewerVisibilitySql(viewer);
  if (visibility) {
    where.push(visibility);
    // NULL here means "no user", which matches no project owner and no member
    // row — a viewer we cannot identify sees organization-scoped runs only.
    replacements.viewerUserId = viewer.userId;
  }

  const whereSql = where.join(" AND ");

  const countRows: any[] = await sequelize.query(
    `SELECT COUNT(*)::int AS total
     ${RUN_FROM_SQL}
     WHERE ${whereSql}`,
    { replacements, type: QueryTypes.SELECT },
  );

  // template_name and the scope columns are joined here rather than resolved in
  // the UI: the list is the only place they are needed, and a template that has
  // since been archived still has to name its runs.
  const rows: any[] = await sequelize.query(
    `SELECT rr.*,
            t.name AS template_name,
            ${RUN_PROJECT_ID_SQL} AS scope_project_id,
            p.project_title AS scope_project_title
     ${RUN_FROM_SQL}
     LEFT JOIN report_templates t
       ON t.id = rr.template_id
      AND (t.organization_id = :organization_id OR t.organization_id IS NULL)
     LEFT JOIN projects p
       ON p.id::text = ${RUN_PROJECT_ID_SQL} AND p.organization_id = :organization_id
     WHERE ${whereSql}
     ORDER BY rr.created_at DESC
     LIMIT :limit OFFSET :offset`,
    {
      replacements: { ...replacements, limit: filters.limit ?? 200, offset: filters.offset ?? 0 },
      type: QueryTypes.SELECT,
    },
  );

  return { rows, total: countRows[0]?.total ?? 0 };
}

export async function getRunQuery(id: number, organization_id: number): Promise<any> {
  const rows: any[] = await sequelize.query(
    `SELECT * FROM report_runs WHERE id = :id AND organization_id = :organization_id`,
    { replacements: { id, organization_id }, type: QueryTypes.SELECT },
  );
  return rows[0] ?? null;
}

/**
 * Archive or restore one run. Returns the updated row, or null when the id does
 * not belong to this organization — the caller turns that into a 404 rather
 * than reporting a success that never happened.
 */
export async function setRunArchivedQuery(
  id: number,
  organization_id: number,
  archived: boolean,
  userId: number | null,
): Promise<any | null> {
  const setClause = archived
    ? "archived_at = NOW(), archived_by = :userId"
    : "archived_at = NULL, archived_by = NULL";

  const rows: any[] = await sequelize.query(
    `UPDATE report_runs SET ${setClause}, updated_at = NOW()
     WHERE id = :id AND organization_id = :organization_id
     RETURNING *`,
    { replacements: { id, organization_id, userId }, type: QueryTypes.SELECT },
  );
  return rows[0] ?? null;
}

/**
 * Permanently delete a run and the file it produced — the file is the report,
 * which is what DELETE /reporting/:id meant before runs became the list. A run
 * with no file_id (failed, or still running) deletes the row alone.
 *
 * One transaction, because the two deletes are not independent: report_runs
 * .file_id is ON DELETE SET NULL, so if the file DELETE committed and the run
 * DELETE then failed the user would be left with a run row pointing at nothing
 * and no way to tell it had ever had a report. File removal goes through
 * deleteFileById rather than a local DELETE so the file's folder mappings go
 * with it — a bare `DELETE FROM files` leaves file_folder_mappings rows behind.
 */
export async function deleteRunQuery(id: number, organization_id: number): Promise<boolean> {
  return await sequelize.transaction(async (transaction) => {
    const rows: any[] = await sequelize.query(
      `SELECT id, file_id FROM report_runs WHERE id = :id AND organization_id = :organization_id`,
      { replacements: { id, organization_id }, type: QueryTypes.SELECT, transaction },
    );
    const run = rows[0];
    if (!run) return false;

    if (run.file_id) {
      await deleteFileById(run.file_id, organization_id, transaction);
    }

    await sequelize.query(
      `DELETE FROM report_runs WHERE id = :id AND organization_id = :organization_id`,
      { replacements: { id, organization_id }, type: QueryTypes.DELETE, transaction },
    );
    return true;
  });
}
