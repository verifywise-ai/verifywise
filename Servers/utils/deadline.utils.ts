import { sequelize } from "../database/db";

export interface IDeadlineSummary {
  overdue: number;
  dueSoon: number;
  dueSoonDays: number;
}

/**
 * Returns counts of overdue and due-soon tasks for an organization.
 * - overdue: due_date < today, not Completed/Deleted
 * - dueSoon: due_date within the next `days` days (inclusive of today), not Completed/Deleted
 *
 * NULL due_date rows are naturally excluded by the date comparisons.
 */
export const getDeadlineSummaryQuery = async (
  organizationId: number,
  days: number = 7,
): Promise<IDeadlineSummary> => {
  const overdueResult = (await sequelize.query(
    `SELECT COUNT(*) FROM tasks
     WHERE due_date < CURRENT_DATE
     AND status NOT IN ('Completed', 'Deleted')
     AND organization_id = :organizationId`,
    { replacements: { organizationId } },
  )) as [{ count: string }[], number];

  const dueSoonResult = (await sequelize.query(
    `SELECT COUNT(*) FROM tasks
     WHERE due_date >= CURRENT_DATE
     AND due_date <= CURRENT_DATE + (:days || ' days')::INTERVAL
     AND status NOT IN ('Completed', 'Deleted')
     AND organization_id = :organizationId`,
    { replacements: { organizationId, days } },
  )) as [{ count: string }[], number];

  return {
    overdue: parseInt(overdueResult[0][0].count),
    dueSoon: parseInt(dueSoonResult[0][0].count),
    dueSoonDays: days,
  };
};
