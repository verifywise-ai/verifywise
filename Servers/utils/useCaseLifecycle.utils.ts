import { QueryTypes } from "sequelize";
import { sequelize } from "../database/db";
import { LifecycleStage } from "../domain.layer/enums/lifecycle-stage.enum";
import {
  ORG_INTERVAL_SQL,
  confirmationBaselineSql,
  getLifecycleOrgSettings,
  staleSql,
} from "./lifecycle.utils";
import { projectVisibilitySql } from "./projectVisibility.utils";
import { IntakeSubmissionStatus } from "../domain.layer/enums/intake-submission-status.enum";
import { IntakeEntityType } from "../domain.layer/enums/intake-entity-type.enum";
import type { IIntakeFormSchema } from "../domain.layer/interfaces/i.intakeForm";

/**
 * Use case lifecycle read models (#5187): stale markers for the Use cases
 * list and the dashboard widgets. Both use projectVisibilitySql, the rule
 * the list itself uses. Stage counts are not served here: the list page and
 * the dashboard both count the use cases list they already load, so there is
 * one source of counts.
 */

export interface Viewer {
  userId: number;
  role: string;
}

const BASE_WHERE = "p.organization_id = :organizationId AND p.is_organizational = false";

export interface LifecycleSummary {
  stale_ids: number[];
  confirmation_interval_days: number;
}

export async function getUseCaseLifecycleSummary(
  organizationId: number,
  viewer: Viewer,
): Promise<LifecycleSummary> {
  const vis = projectVisibilitySql("p", viewer);
  const [settings, staleRows] = await Promise.all([
    getLifecycleOrgSettings(organizationId),
    sequelize.query(
      `SELECT p.id
         FROM projects p
        WHERE ${BASE_WHERE}${vis.sql} AND ${staleSql("p", ORG_INTERVAL_SQL)}
        ORDER BY p.id`,
      { replacements: { organizationId, ...vis.replacements }, type: QueryTypes.SELECT },
    ) as Promise<{ id: number }[]>,
  ]);
  return {
    stale_ids: staleRows.map((r) => Number(r.id)),
    confirmation_interval_days: settings.confirmation_interval_days,
  };
}

export interface DashboardItem {
  id: number;
  title: string;
  stage: LifecycleStage;
  date: string | null;
}

export interface BreakdownRow {
  label: string;
  count: number;
}

export interface ReviewTimeStats {
  /** Use case submissions approved in the period. */
  approved: number;
  /** Submitted → approved, in days, one decimal. Null when none were approved. */
  median_days: number | null;
  average_days: number | null;
  period_months: number;
}

export interface LifecycleDashboard {
  review_time: ReviewTimeStats;
  quarter: {
    start: string;
    end: string;
    going_live: DashboardItem[];
    retired: DashboardItem[];
  };
  live_by: {
    department: BreakdownRow[];
    risk_tier: BreakdownRow[];
    regulation: BreakdownRow[];
  };
  stale: {
    total: number;
    items: DashboardItem[];
  };
  confirmation_interval_days: number;
}

const LIST_LIMIT = 10;

export async function getUseCaseLifecycleDashboard(
  organizationId: number,
  viewer: Viewer,
): Promise<LifecycleDashboard> {
  const vis = projectVisibilitySql("p", viewer);
  const replacements = { organizationId, limit: LIST_LIMIT, ...vis.replacements };
  const where = `${BASE_WHERE}${vis.sql}`;

  const run = async <T>(sql: string): Promise<T[]> =>
    (await sequelize.query(sql, { replacements, type: QueryTypes.SELECT })) as T[];

  const [
    settings,
    reviewTime,
    quarterRows,
    goingLive,
    retired,
    byDept,
    byTier,
    byReg,
    staleTotal,
    staleItems,
  ] = await Promise.all([
    getLifecycleOrgSettings(organizationId),
    getUseCaseReviewTime(organizationId, viewer),
    run<{ start: string; end: string }>(
      `SELECT to_char(date_trunc('quarter', CURRENT_DATE), 'YYYY-MM-DD') AS "start",
                to_char(date_trunc('quarter', CURRENT_DATE) + interval '3 months' - interval '1 day',
                        'YYYY-MM-DD') AS "end"`,
    ),
    // Went live this quarter, whatever the stage now (live, or retired since).
    // go_live_date is only ever set by the go-live action.
    run<DashboardItem>(
      `SELECT p.id, p.project_title AS title, p.lifecycle_stage AS stage,
                to_char(p.go_live_date, 'YYYY-MM-DD') AS date
           FROM projects p
          WHERE ${where}
            AND p.go_live_date >= date_trunc('quarter', CURRENT_DATE)
            AND p.go_live_date < date_trunc('quarter', CURRENT_DATE) + interval '3 months'
          ORDER BY p.go_live_date ASC, p.id ASC
          LIMIT :limit`,
    ),
    run<DashboardItem>(
      `SELECT p.id, p.project_title AS title, p.lifecycle_stage AS stage,
                to_char(p.retired_at, 'YYYY-MM-DD') AS date
           FROM projects p
          WHERE ${where}
            AND p.lifecycle_stage = '${LifecycleStage.RETIRED}'
            AND p.retired_at >= date_trunc('quarter', NOW())
            AND p.retired_at < date_trunc('quarter', NOW()) + interval '3 months'
          ORDER BY p.retired_at DESC, p.id ASC
          LIMIT :limit`,
    ),
    run<BreakdownRow>(
      `SELECT COALESCE(NULLIF(p.department, ''), '') AS label, COUNT(*)::int AS count
           FROM projects p
          WHERE ${where} AND p.lifecycle_stage = '${LifecycleStage.LIVE}'
          GROUP BY 1 ORDER BY count DESC, label ASC`,
    ),
    run<BreakdownRow>(
      `SELECT COALESCE(p.ai_risk_classification::text, '') AS label, COUNT(*)::int AS count
           FROM projects p
          WHERE ${where} AND p.lifecycle_stage = '${LifecycleStage.LIVE}'
          GROUP BY 1 ORDER BY count DESC, label ASC`,
    ),
    run<BreakdownRow>(
      `SELECT f.name AS label, COUNT(DISTINCT p.id)::int AS count
           FROM projects p
           JOIN projects_frameworks pf
             ON pf.project_id = p.id AND pf.organization_id = p.organization_id
           JOIN frameworks f ON f.id = pf.framework_id
          WHERE ${where} AND p.lifecycle_stage = '${LifecycleStage.LIVE}'
          GROUP BY f.name ORDER BY count DESC, label ASC`,
    ),
    run<{ total: number }>(
      `SELECT COUNT(*)::int AS total FROM projects p WHERE ${where} AND ${staleSql("p", ORG_INTERVAL_SQL)}`,
    ),
    run<DashboardItem>(
      `SELECT p.id, p.project_title AS title, p.lifecycle_stage AS stage,
                to_char(${confirmationBaselineSql("p")}, 'YYYY-MM-DD') AS date
           FROM projects p
          WHERE ${where} AND ${staleSql("p", ORG_INTERVAL_SQL)}
          ORDER BY ${confirmationBaselineSql("p")} ASC, p.id ASC
          LIMIT :limit`,
    ),
  ]);

  const numeric = (rows: BreakdownRow[]) =>
    rows.map((r) => ({ label: r.label, count: Number(r.count) }));
  const items = (rows: DashboardItem[]) => rows.map((r) => ({ ...r, id: Number(r.id) }));

  return {
    review_time: reviewTime,
    quarter: {
      start: quarterRows[0].start,
      end: quarterRows[0].end,
      going_live: items(goingLive),
      retired: items(retired),
    },
    live_by: {
      department: numeric(byDept),
      risk_tier: numeric(byTier),
      regulation: numeric(byReg),
    },
    stale: { total: Number(staleTotal[0]?.total ?? 0), items: items(staleItems) },
    confirmation_interval_days: settings.confirmation_interval_days,
  };
}

// ─── Intake submissions in review (#5188) ───────────────────────────────────

/**
 * Resubmissions point at the submission they replace (original_submission_id),
 * which may itself be a resubmission. Time in review counts from the FIRST
 * submission of that chain. `leavesSql` must select `id`, `original_submission_id`
 * and `created_at` of the rows to date; the CTE yields (leaf_id, first_at).
 * Depth is capped so a corrupt cycle cannot loop.
 */
function firstSubmittedCte(leavesSql: string): string {
  return `leaves AS (${leavesSql}),
    chain AS (
      SELECT l.id AS leaf_id, l.original_submission_id, l.created_at, 0 AS depth
        FROM leaves l
      UNION ALL
      SELECT c.leaf_id, prev.original_submission_id, prev.created_at, c.depth + 1
        FROM chain c
        JOIN intake_submissions prev
          ON prev.organization_id = :organizationId AND prev.id = c.original_submission_id
       WHERE c.depth < 50
    ),
    firsts AS (
      SELECT leaf_id, MIN(created_at) AS first_at FROM chain GROUP BY leaf_id
    )`;
}

/**
 * A use case intake submission waiting for a decision. No project exists yet
 * (approval creates it), so the In review tab lists these next to the use
 * cases that wait on an approval request.
 */
export interface PendingUseCaseSubmission {
  id: number;
  /** The answer mapped to the use case title, as approval would use it. */
  title: string | null;
  form_name: string;
  submitter_name: string | null;
  /** When the first submission of its resubmission chain arrived. */
  submitted_at: string;
  /** Whole days since then. */
  days_in_review: number;
}

export interface PendingUseCaseSubmissions {
  /** All pending use case submissions; the tab count. */
  total: number;
  /** The oldest `limit` of them. */
  items: PendingUseCaseSubmission[];
  limit: number;
}

export const PENDING_SUBMISSIONS_LIMIT = 500;

/**
 * The field id each use case form maps to the use case title. Each form's
 * schema is read once; rows then carry only that one answer.
 */
async function titleFieldIdsByForm(organizationId: number): Promise<Record<string, string>> {
  const forms = (await sequelize.query(
    `SELECT f.id, f.schema
       FROM intake_forms f
      WHERE f.organization_id = :organizationId
        AND EXISTS (
          SELECT 1 FROM intake_submissions s
           WHERE s.organization_id = f.organization_id AND s.form_id = f.id
             AND s.status = :pending AND s.entity_type = :useCase)`,
    {
      replacements: {
        organizationId,
        pending: IntakeSubmissionStatus.PENDING,
        useCase: IntakeEntityType.USE_CASE,
      },
      type: QueryTypes.SELECT,
    },
  )) as { id: number; schema: IIntakeFormSchema | null }[];
  const map: Record<string, string> = {};
  for (const form of forms) {
    const field = form.schema?.fields?.find((f) => f.entityFieldMapping === "project_title");
    if (field) map[String(form.id)] = field.id;
  }
  return map;
}

/**
 * Pending use case submissions, oldest first by first submission, plus the
 * total. Approved, rejected and superseded submissions never appear. Every
 * signed-in member of the org can already list submissions
 * (GET /api/intake/submissions), so no further visibility rule applies.
 */
export async function getPendingUseCaseSubmissions(
  organizationId: number,
): Promise<PendingUseCaseSubmissions> {
  const titleFields = await titleFieldIdsByForm(organizationId);
  const replacements = {
    organizationId,
    pending: IntakeSubmissionStatus.PENDING,
    useCase: IntakeEntityType.USE_CASE,
    limit: PENDING_SUBMISSIONS_LIMIT,
    titleFields: JSON.stringify(titleFields),
  };
  const pendingWhere = `s.organization_id = :organizationId
        AND s.status = :pending AND s.entity_type = :useCase`;

  const [totalRows, rows] = await Promise.all([
    sequelize.query(
      `SELECT COUNT(*)::int AS total FROM intake_submissions s WHERE ${pendingWhere}`,
      { replacements, type: QueryTypes.SELECT },
    ) as Promise<{ total: number }[]>,
    sequelize.query(
      `WITH RECURSIVE ${firstSubmittedCte(
        `SELECT s.id, s.original_submission_id, s.created_at FROM intake_submissions s WHERE ${pendingWhere}`,
      )}
      SELECT s.id,
             s.data ->> (CAST(:titleFields AS jsonb) ->> s.form_id::text) AS title,
             f.name AS form_name,
             s.submitter_name,
             fi.first_at AS submitted_at,
             GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (NOW() - fi.first_at)) / 86400))::int AS days_in_review
        FROM firsts fi
        JOIN intake_submissions s ON s.organization_id = :organizationId AND s.id = fi.leaf_id
        JOIN intake_forms f ON f.organization_id = s.organization_id AND f.id = s.form_id
       ORDER BY fi.first_at ASC, s.id ASC
       LIMIT :limit`,
      { replacements, type: QueryTypes.SELECT },
    ) as Promise<
      Array<{
        id: number;
        title: string | null;
        form_name: string;
        submitter_name: string | null;
        submitted_at: Date | string;
        days_in_review: number;
      }>
    >,
  ]);

  return {
    total: Number(totalRows[0]?.total ?? 0),
    limit: PENDING_SUBMISSIONS_LIMIT,
    items: rows.map((row) => ({
      id: Number(row.id),
      title: row.title && row.title.trim() ? row.title.trim() : null,
      form_name: row.form_name,
      submitter_name: row.submitter_name,
      submitted_at: new Date(row.submitted_at).toISOString(),
      days_in_review: Number(row.days_in_review),
    })),
  };
}

const REVIEW_TIME_MONTHS = 12;

/**
 * How long approved use case submissions spent in review over the last 12
 * months, from the first submission of each resubmission chain to approval.
 * Admins see every approved submission; others only those whose use case
 * they can see (projectVisibilitySql on the created project). No comparison
 * with an agreed review time yet: that per-form setting comes with #5189.
 */
export async function getUseCaseReviewTime(
  organizationId: number,
  viewer: Viewer,
): Promise<ReviewTimeStats> {
  const vis = projectVisibilitySql("p", viewer);
  const visibleProject = vis.sql
    ? ` AND EXISTS (SELECT 1 FROM projects p
                     WHERE p.organization_id = :organizationId AND p.id = s.entity_id${vis.sql})`
    : "";
  const rows = (await sequelize.query(
    `WITH RECURSIVE ${firstSubmittedCte(
      `SELECT s.id, s.original_submission_id, s.created_at
         FROM intake_submissions s
        WHERE s.organization_id = :organizationId
          AND s.status = :approved
          AND s.entity_type = :useCase
          AND s.reviewed_at IS NOT NULL
          AND s.reviewed_at >= NOW() - make_interval(months => :months)${visibleProject}`,
    )}
    SELECT COUNT(*)::int AS approved,
           percentile_cont(0.5) WITHIN GROUP (
             ORDER BY EXTRACT(EPOCH FROM (s.reviewed_at - fi.first_at)) / 86400
           ) AS median_days,
           AVG(EXTRACT(EPOCH FROM (s.reviewed_at - fi.first_at)) / 86400) AS average_days
      FROM firsts fi
      JOIN intake_submissions s ON s.organization_id = :organizationId AND s.id = fi.leaf_id`,
    {
      replacements: {
        organizationId,
        approved: IntakeSubmissionStatus.APPROVED,
        useCase: IntakeEntityType.USE_CASE,
        months: REVIEW_TIME_MONTHS,
        ...vis.replacements,
      },
      type: QueryTypes.SELECT,
    },
  )) as {
    approved: number;
    median_days: string | number | null;
    average_days: string | number | null;
  }[];
  const row = rows[0];
  const oneDecimal = (value: string | number | null) =>
    value === null || value === undefined ? null : Math.round(Math.max(0, Number(value)) * 10) / 10;
  return {
    approved: Number(row?.approved ?? 0),
    median_days: oneDecimal(row?.median_days ?? null),
    average_days: oneDecimal(row?.average_days ?? null),
    period_months: REVIEW_TIME_MONTHS,
  };
}
