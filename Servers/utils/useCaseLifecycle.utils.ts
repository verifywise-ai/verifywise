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

export interface LifecycleDashboard {
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

  const [settings, quarterRows, goingLive, retired, byDept, byTier, byReg, staleTotal, staleItems] =
    await Promise.all([
      getLifecycleOrgSettings(organizationId),
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
