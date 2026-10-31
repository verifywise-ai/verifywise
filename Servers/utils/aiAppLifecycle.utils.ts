import { QueryTypes } from "sequelize";
import { sequelize } from "../database/db";
import { LIFECYCLE_STAGES, LifecycleStage } from "../domain.layer/enums/lifecycle-stage.enum";
import {
  LIFECYCLE_ENTITIES,
  LifecycleRow,
  ORG_INTERVAL_SQL,
  getLifecycleOrgSettings,
  getLifecycleRow,
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

/** One AI app's lifecycle, for its detail page. Null when not in the org. */
export async function getAiAppLifecycleState(
  organizationId: number,
  id: number,
): Promise<AiAppLifecycleState | null> {
  const [row, settings, stale] = await Promise.all([
    getLifecycleRow(AI_APP, organizationId, id),
    getLifecycleOrgSettings(organizationId),
    sequelize.query(
      `SELECT 1 FROM ai_apps a
        WHERE a.organization_id = :organizationId AND a.id = :id
          AND ${staleSql("a", ORG_INTERVAL_SQL, AI_APP)}`,
      { replacements: { organizationId, id }, type: QueryTypes.SELECT },
    ),
  ]);
  if (!row) return null;
  const { department: _department, ...lifecycle } = row;
  return {
    ...lifecycle,
    id: Number(lifecycle.id),
    is_stale: stale.length > 0,
    confirmation_interval_days: settings.confirmation_interval_days,
  };
}
