/**
 * The fields every framework seeder fills the same way when it seeds demo data
 * (is_mock_data = true). Keeping the rule here is what stopped the five seeders
 * drifting apart: before this, each one picked its own status strategy, and only
 * some of them set an owner or tagged rows as demo.
 *
 * The contract, for each framework's implementation rows:
 * - struct rows are read in an explicit, stable order (ORDER BY id, or the
 *   framework's own declared order)
 * - status walks that table's own status vocabulary in order, so the demo covers
 *   every status and looks the same on every seed
 * - owner, reviewer and approver are the project owner
 * - due_date is a near/mid/far rotation so the demo shows a spread of deadlines
 * - is_demo comes from the parent project, resolved once
 *
 * A real project gets none of this: no owner, no due date, and the status its
 * enum starts at.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

/** Days out for the demo due-date rotation. Always future, so the demo never
 * opens on a wall of overdue items. Exported because the generic framework
 * seeder builds the same rotation in SQL, inside one INSERT ... SELECT. */
export const DEMO_DUE_DATE_OFFSET_DAYS = [30, 60, 90];

/**
 * Deterministic future due date for the row at `index` in a demo seed. Rotates
 * through DEMO_DUE_DATE_OFFSET_DAYS alongside the status walk.
 */
export function demoDueDate(index: number): Date {
  const days = DEMO_DUE_DATE_OFFSET_DAYS[index % DEMO_DUE_DATE_OFFSET_DAYS.length];
  return new Date(Date.now() + days * DAY_MS);
}
