import { QueryTypes } from "sequelize";
import { sequelize } from "../database/db";
import { LIFECYCLE_STAGES, LifecycleStage } from "../domain.layer/enums/lifecycle-stage.enum";
import {
  LIFECYCLE_ENTITIES,
  LifecycleRow,
  ORG_INTERVAL_SQL,
  getLifecycleOrgSettings,
  lifecycleColumnsSql,
  staleSql,
} from "./lifecycle.utils";

/**
 * AI app lifecycle read models (#5193). Every member of the org sees every AI
 * app (GET /api/ai-apps applies no per-user rule), so neither does this.
 *
 * Unlike use cases, the AI apps list is paged on the server, so the tab counts
 * come from here rather than from the rows the page holds.
 */

const AI_APP = LIFECYCLE_ENTITIES.ai_app;

export type StageCounts = Record<LifecycleStage, number>;

export interface AiAppLifecycleSummary {
  counts: StageCounts;
  stale_ids: number[];
  confirmation_interval_days: number;
}

export async function getAiAppLifecycleSummary(
  organizationId: number,
): Promise<AiAppLifecycleSummary> {
  const [settings, countRows, staleRows] = await Promise.all([
    getLifecycleOrgSettings(organizationId),
    sequelize.query(
      `SELECT a.lifecycle_stage AS stage, COUNT(*)::int AS count
         FROM ai_apps a
        WHERE a.organization_id = :organizationId
        GROUP BY a.lifecycle_stage`,
      { replacements: { organizationId }, type: QueryTypes.SELECT },
    ) as Promise<{ stage: LifecycleStage; count: number }[]>,
    sequelize.query(
      `SELECT a.id
         FROM ai_apps a
        WHERE a.organization_id = :organizationId
          AND ${staleSql("a", ORG_INTERVAL_SQL, AI_APP)}
        ORDER BY a.id`,
      { replacements: { organizationId }, type: QueryTypes.SELECT },
    ) as Promise<{ id: number }[]>,
  ]);
  const counts = Object.fromEntries(LIFECYCLE_STAGES.map((s) => [s, 0])) as StageCounts;
  for (const row of countRows) {
    if (row.stage in counts) counts[row.stage] = Number(row.count);
  }
  return {
    counts,
    stale_ids: staleRows.map((r) => Number(r.id)),
    confirmation_interval_days: settings.confirmation_interval_days,
  };
}

export interface AiAppLifecycleState extends Omit<LifecycleRow, "department"> {
  is_stale: boolean;
  confirmation_interval_days: number;
}

/** One AI app's lifecycle, staleness and the org interval in one query. Null when not in the org. */
export async function getAiAppLifecycleState(
  organizationId: number,
  id: number,
): Promise<AiAppLifecycleState | null> {
  const rows = (await sequelize.query(
    `SELECT ${lifecycleColumnsSql(AI_APP)}, a.${AI_APP.ownerColumn} AS owner,
            ${staleSql("a", ORG_INTERVAL_SQL, AI_APP)} AS is_stale,
            ${ORG_INTERVAL_SQL} AS confirmation_interval_days
       FROM ai_apps a
      WHERE a.organization_id = :organizationId AND a.id = :id`,
    { replacements: { organizationId, id }, type: QueryTypes.SELECT },
  )) as Array<LifecycleRow & { is_stale: boolean; confirmation_interval_days: number }>;
  const row = rows[0];
  if (!row) return null;
  const { department: _department, ...lifecycle } = row;
  return {
    ...lifecycle,
    id: Number(lifecycle.id),
    is_stale: Boolean(row.is_stale),
    confirmation_interval_days: Number(row.confirmation_interval_days),
  };
}
