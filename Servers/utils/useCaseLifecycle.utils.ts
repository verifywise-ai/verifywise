import { QueryTypes } from "sequelize";
import { sequelize } from "../database/db";
import { LIFECYCLE_STAGES, LifecycleStage } from "../domain.layer/enums/lifecycle-stage.enum";
import { confirmationBaselineSql, staleSql } from "./lifecycle.utils";

/**
 * Use case lifecycle read models (#5187): tab counts and stale markers for the
 * Use cases list, and the dashboard widgets. Both apply the same visibility as
 * the list itself (utils/project.utils.ts getUserProjects): Admins see every
 * use case in the org, everyone else sees use cases they own or are a member of.
 */

export interface Viewer {
  userId: number;
  role: string;
}

function visibility(viewer: Viewer): { sql: string; replacements: Record<string, unknown> } {
  if (viewer.role === "Admin" || viewer.role === "SuperAdmin") {
    return { sql: "", replacements: {} };
  }
  return {
    sql: ` AND (p.owner = :viewerId OR EXISTS (
             SELECT 1 FROM projects_members pm
              WHERE pm.organization_id = p.organization_id
                AND pm.project_id = p.id
                AND pm.user_id = :viewerId))`,
    replacements: { viewerId: viewer.userId },
  };
}

const BASE_WHERE = "p.organization_id = :organizationId AND p.is_organizational = false";

export type StageCounts = Record<LifecycleStage, number>;

export interface LifecycleSummary {
  counts: StageCounts;
  stale_ids: number[];
  confirmation_interval_days: number;
}

function emptyCounts(): StageCounts {
  return Object.fromEntries(LIFECYCLE_STAGES.map((s) => [s, 0])) as StageCounts;
}

export async function getUseCaseLifecycleSummary(
  organizationId: number,
  viewer: Viewer,
  intervalDays: number,
): Promise<LifecycleSummary> {
  const vis = visibility(viewer);
  const replacements = { organizationId, intervalDays, ...vis.replacements };

  const countRows = (await sequelize.query(
    `SELECT p.lifecycle_stage AS stage, COUNT(*)::int AS count
       FROM projects p
      WHERE ${BASE_WHERE}${vis.sql}
      GROUP BY p.lifecycle_stage`,
    { replacements, type: QueryTypes.SELECT },
  )) as { stage: LifecycleStage; count: number }[];

  const staleRows = (await sequelize.query(
    `SELECT p.id
       FROM projects p
      WHERE ${BASE_WHERE}${vis.sql} AND ${staleSql("p")}
      ORDER BY p.id`,
    { replacements, type: QueryTypes.SELECT },
  )) as { id: number }[];

  const counts = emptyCounts();
  for (const row of countRows) {
    if (row.stage in counts) counts[row.stage] = Number(row.count);
  }
  return {
    counts,
    stale_ids: staleRows.map((r) => Number(r.id)),
    confirmation_interval_days: intervalDays,
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

export interface LifecycleDashboard {
  counts: StageCounts;
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
  // "Time in review vs agreed review time" needs the per-form review time
  // setting from #5189; it is added there, not here.
}

const LIST_LIMIT = 10;

export async function getUseCaseLifecycleDashboard(
  organizationId: number,
  viewer: Viewer,
  intervalDays: number,
): Promise<LifecycleDashboard> {
  const vis = visibility(viewer);
  const replacements = { organizationId, intervalDays, limit: LIST_LIMIT, ...vis.replacements };
  const where = `${BASE_WHERE}${vis.sql}`;

  const run = async <T>(sql: string): Promise<T[]> =>
    (await sequelize.query(sql, { replacements, type: QueryTypes.SELECT })) as T[];

  const [
    countRows,
    quarterRows,
    goingLive,
    retired,
    byDept,
    byTier,
    byReg,
    staleTotal,
    staleItems,
  ] = await Promise.all([
    run<{ stage: LifecycleStage; count: number }>(
      `SELECT p.lifecycle_stage AS stage, COUNT(*)::int AS count
           FROM projects p WHERE ${where} GROUP BY p.lifecycle_stage`,
    ),
    run<{ start: string; end: string }>(
      `SELECT to_char(date_trunc('quarter', CURRENT_DATE), 'YYYY-MM-DD') AS "start",
                to_char(date_trunc('quarter', CURRENT_DATE) + interval '3 months' - interval '1 day',
                        'YYYY-MM-DD') AS "end"`,
    ),
    // Went live this quarter, or planned with a go-live date this quarter.
    run<DashboardItem>(
      `SELECT p.id, p.project_title AS title, p.lifecycle_stage AS stage,
                to_char(p.go_live_date, 'YYYY-MM-DD') AS date
           FROM projects p
          WHERE ${where}
            AND p.lifecycle_stage IN ('${LifecycleStage.PLANNED}', '${LifecycleStage.LIVE}')
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
      `SELECT COUNT(*)::int AS total FROM projects p WHERE ${where} AND ${staleSql("p")}`,
    ),
    run<DashboardItem>(
      `SELECT p.id, p.project_title AS title, p.lifecycle_stage AS stage,
                to_char(${confirmationBaselineSql("p")}, 'YYYY-MM-DD') AS date
           FROM projects p
          WHERE ${where} AND ${staleSql("p")}
          ORDER BY ${confirmationBaselineSql("p")} ASC, p.id ASC
          LIMIT :limit`,
    ),
  ]);

  const counts = emptyCounts();
  for (const row of countRows) {
    if (row.stage in counts) counts[row.stage] = Number(row.count);
  }
  const numeric = (rows: BreakdownRow[]) =>
    rows.map((r) => ({ label: r.label, count: Number(r.count) }));
  const items = (rows: DashboardItem[]) => rows.map((r) => ({ ...r, id: Number(r.id) }));

  return {
    counts,
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
    confirmation_interval_days: intervalDays,
  };
}
