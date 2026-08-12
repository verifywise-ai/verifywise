import { sequelize } from "../database/db";
import { TaskStatus } from "../domain.layer/enums/task-status.enum";

/**
 * Phase 4 / issue 3811 — in-house proactive detection logic.
 *
 * Pure PostgreSQL aggregation (no ML libraries). Each helper is multi-tenant:
 * every query is scoped by organization_id. The db layer is the shared
 * `sequelize.query` helper used across the other util files, so it is mockable
 * in unit tests.
 *
 * "High/critical" risks are identified by their auto-calculated risk level
 * ("High risk" / "Very high risk").
 */

const HIGH_CRITICAL_RISK_LEVELS = ["High risk", "Very high risk"];

export interface RiskAnomalyResult {
  isAnomaly: boolean;
  count24h: number;
  avg30d: number;
  ratio: number;
}

/**
 * Detect a spike in newly created high/critical risks. Compares the count of
 * such risks created in the last 24h against the prior 30-day daily average.
 * An anomaly is flagged when count24h > 2 * avg30d (guarded against avg30d === 0).
 */
export const detectRiskAnomaly = async (organizationId: number): Promise<RiskAnomalyResult> => {
  const last24hResult = (await sequelize.query(
    `SELECT COUNT(*) AS count
       FROM risks
      WHERE organization_id = :organizationId
        AND is_deleted = false
        AND current_risk_level IN (:levels)
        AND created_at >= NOW() - INTERVAL '24 hours'`,
    { replacements: { organizationId, levels: HIGH_CRITICAL_RISK_LEVELS } },
  )) as [{ count: string }[], number];

  const prior30dResult = (await sequelize.query(
    `SELECT COUNT(*) AS count
       FROM risks
      WHERE organization_id = :organizationId
        AND is_deleted = false
        AND current_risk_level IN (:levels)
        AND created_at >= NOW() - INTERVAL '30 days'
        AND created_at < NOW() - INTERVAL '24 hours'`,
    { replacements: { organizationId, levels: HIGH_CRITICAL_RISK_LEVELS } },
  )) as [{ count: string }[], number];

  const count24h = Number(last24hResult[0][0]?.count ?? 0);
  const total30d = Number(prior30dResult[0][0]?.count ?? 0);
  const avg30d = total30d / 30;

  const ratio = avg30d === 0 ? 0 : count24h / avg30d;
  const isAnomaly = avg30d === 0 ? false : count24h > 2 * avg30d;

  return { isAnomaly, count24h, avg30d, ratio };
};

/**
 * Find tasks that are past their due date and not yet completed, scoped to the
 * organization. Soft-deleted tasks are excluded.
 */
export const findOverdueTasks = async (organizationId: number): Promise<any[]> => {
  const result = (await sequelize.query(
    `SELECT *
       FROM tasks
      WHERE organization_id = :organizationId
        AND due_date IS NOT NULL
        AND due_date < NOW()
        AND status != :completedStatus
        AND status != :deletedStatus
      ORDER BY due_date ASC`,
    {
      replacements: {
        organizationId,
        completedStatus: TaskStatus.COMPLETED,
        deletedStatus: TaskStatus.DELETED,
      },
    },
  )) as [any[], number];

  return result[0];
};

export interface ComplianceDropResult {
  framework_type: string;
  latest_score: number;
  previous_score: number;
  drop: number;
}

/**
 * Compare the latest vs previous framework readiness score per framework and
 * return the frameworks whose score dropped more than 5 percentage points.
 */
export const detectComplianceDrop = async (
  organizationId: number,
): Promise<ComplianceDropResult[]> => {
  const result = (await sequelize.query(
    `SELECT framework_type, latest_score, previous_score
       FROM (
         SELECT framework_type,
                avg_score AS latest_score,
                LEAD(avg_score) OVER (
                  PARTITION BY framework_type ORDER BY calculated_at DESC
                ) AS previous_score,
                ROW_NUMBER() OVER (
                  PARTITION BY framework_type ORDER BY calculated_at DESC
                ) AS rn
           FROM framework_readiness_scores
          WHERE organization_id = :organizationId
       ) ranked
      WHERE rn = 1`,
    { replacements: { organizationId } },
  )) as [{ framework_type: string; latest_score: number; previous_score: number | null }[], number];

  return result[0]
    .filter((row) => row.previous_score != null)
    .map((row) => ({
      framework_type: row.framework_type,
      latest_score: Number(row.latest_score),
      previous_score: Number(row.previous_score),
      drop: Number(row.previous_score) - Number(row.latest_score),
    }))
    .filter((row) => row.drop > 5);
};

export interface WeeklyDigest {
  openRisks: number;
  overdueTasks: any[];
  frameworkScores: any[];
  generatedAt: string;
}

/**
 * Build a weekly digest summary for an organization: open (non-deleted) risk
 * count, overdue tasks, and the latest framework readiness scores.
 */
export const buildWeeklyDigest = async (organizationId: number): Promise<WeeklyDigest> => {
  const openRisksResult = (await sequelize.query(
    `SELECT COUNT(*) AS count
       FROM risks
      WHERE organization_id = :organizationId
        AND is_deleted = false`,
    { replacements: { organizationId } },
  )) as [{ count: string }[], number];

  const overdueTasks = await findOverdueTasks(organizationId);

  const frameworkScoresResult = (await sequelize.query(
    `SELECT framework_type, avg_score
       FROM (
         SELECT framework_type, avg_score,
                ROW_NUMBER() OVER (
                  PARTITION BY framework_type ORDER BY calculated_at DESC
                ) AS rn
           FROM framework_readiness_scores
          WHERE organization_id = :organizationId
       ) ranked
      WHERE rn = 1`,
    { replacements: { organizationId } },
  )) as [any[], number];

  return {
    openRisks: Number(openRisksResult[0][0]?.count ?? 0),
    overdueTasks,
    frameworkScores: frameworkScoresResult[0],
    generatedAt: new Date().toISOString(),
  };
};
