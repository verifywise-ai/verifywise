import { sortQueueItems } from "../sort";
import type { HomeQueueItem } from "../../../domain.layer/interfaces/i.homeQueue";

const item = (
  entityId: number,
  dueDate: string | null,
  waitingSince: string | null,
  overdue: boolean,
): HomeQueueItem => ({
  id: `tasks:${entityId}`,
  source: "tasks",
  part: "automate",
  entityType: "task",
  entityId,
  name: `Item ${entityId}`,
  url: `/tasks?taskId=${entityId}`,
  dueDate,
  waitingSince,
  overdue,
  meta: {},
});

describe("sortQueueItems", () => {
  it("puts overdue first, then due soonest, nulls last, then oldest waiting", () => {
    const a = item(1, "2026-11-20", null, false);
    const b = item(2, "2026-11-01", null, true);
    const c = item(3, null, "2026-11-02T09:00:00.000Z", false);
    const d = item(4, null, "2026-11-01T09:00:00.000Z", false);
    const e = item(5, "2026-11-16", null, false);

    const sorted = sortQueueItems([a, b, c, d, e]);

    expect(sorted.map((i) => i.entityId)).toEqual([2, 5, 1, 4, 3]);
  });

  it("orders items with the same due date by oldest waiting, a null wait last", () => {
    const late = item(1, "2026-11-20", "2026-11-10T00:00:00.000Z", false);
    const early = item(2, "2026-11-20", "2026-11-01T00:00:00.000Z", false);
    const none = item(3, "2026-11-20", null, false);

    expect(sortQueueItems([none, late, early]).map((i) => i.entityId)).toEqual([2, 1, 3]);
  });

  it("does not mutate its input", () => {
    const input = [item(1, "2026-11-20", null, false), item(2, "2026-11-01", null, true)];
    sortQueueItems(input);
    expect(input.map((i) => i.entityId)).toEqual([1, 2]);
  });
});
