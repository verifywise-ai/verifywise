import type { HomeQueueItem } from "../../domain.layer/interfaces/i.homeQueue";

/** Ascending, with null after every value. ISO strings compare correctly as text. */
const ascNullsLast = (a: string | null, b: string | null): number => {
  if (a === b) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return a < b ? -1 : 1;
};

/**
 * Queue order: overdue first, then due soonest (no due date last), then the
 * oldest waiting (no wait time last). The id breaks ties so the order is stable
 * between requests. Returns a new array.
 */
export function sortQueueItems(items: HomeQueueItem[]): HomeQueueItem[] {
  return [...items].sort(
    (a, b) =>
      Number(b.overdue) - Number(a.overdue) ||
      ascNullsLast(a.dueDate, b.dueDate) ||
      ascNullsLast(a.waitingSince, b.waitingSince) ||
      a.id.localeCompare(b.id),
  );
}
