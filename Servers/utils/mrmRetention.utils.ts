import { QueryTypes } from "sequelize";
import { sequelize } from "../database/db";

/**
 * MRM metric retention — the examiner-safe prune (gap #1).
 *
 * Retention NEVER touches the audit trail: a raw mrm_metrics point is
 * prunable only if NO evaluation of it was warn/breach. Any point with a
 * warn/breach evaluation is kept forever. CASCADE then removes only the
 * pruned point's benign-only evaluation rows; breach evaluations are never
 * reached because their metric survives.
 *
 * The NOT EXISTS guard lives INSIDE the batching subquery — load-bearing.
 * If the batch window were selected first (oldest N) and filtered after,
 * never-deletable protected points would permanently occupy the window's
 * slots and wedge the loop with prunable rows still beyond the window.
 * With the guard inside, "deleted < batchSize" genuinely means "no more
 * prunable rows".
 */

/** The cutoff timestamp for a retention window, computed in SQL (one source of truth). */
export const getRetentionCutoffQuery = async (retentionMonths: number): Promise<string> => {
  const rows = (await sequelize.query(
    `SELECT (now() - make_interval(months => :retentionMonths))::text AS cutoff`,
    {
      replacements: { retentionMonths },
      type: QueryTypes.SELECT,
    },
  )) as { cutoff: string }[];
  return rows[0].cutoff;
};

/**
 * Delete one batch of prunable (benign, aged-out) metric points for an org.
 * Returns the number of rows deleted; a return < batchSize means done.
 */
export const pruneMetricsBatchQuery = async (
  organizationId: number,
  retentionMonths: number,
  batchSize: number,
): Promise<number> => {
  const [, meta] = await sequelize.query(
    `DELETE FROM mrm_metrics
      WHERE id IN (
        SELECT mm.id
          FROM mrm_metrics mm
         WHERE mm.organization_id = :organizationId
           AND mm.at < now() - make_interval(months => :retentionMonths)
           AND NOT EXISTS (
             SELECT 1 FROM mrm_metric_evaluations e
              WHERE e.organization_id = mm.organization_id
                AND e.metric_id = mm.id
                AND e.status IN ('warn', 'breach')
           )
         ORDER BY mm.at
         LIMIT :batchSize
      )`,
    {
      replacements: { organizationId, retentionMonths, batchSize },
    },
  );
  return (meta as { rowCount?: number } | undefined)?.rowCount ?? 0;
};
