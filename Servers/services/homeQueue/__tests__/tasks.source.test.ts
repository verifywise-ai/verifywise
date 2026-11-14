jest.mock("../../../database/db", () => ({ sequelize: { query: jest.fn() } }));

import { sequelize } from "../../../database/db";
import { tasksSource } from "../sources/tasks.source";
import type { HomeQueueContext } from "../../../domain.layer/interfaces/i.homeQueue";

const query = sequelize.query as unknown as jest.Mock;

const ctx: HomeQueueContext = {
  organizationId: 7,
  userId: 5,
  can: () => false,
  today: "2026-11-14",
};

const row = (id: number, due_date: string | null, status = "Open") => ({
  id,
  title: `Task ${id}`,
  due_date,
  status,
  priority: "High",
  created_at: new Date("2026-11-01T10:00:00.000Z"),
});

describe("tasksSource", () => {
  beforeEach(() => query.mockReset());

  it("is visible to anyone and sits in the top group", () => {
    expect(tasksSource.isVisible(ctx)).toBe(true);
    expect(tasksSource.id).toBe("tasks");
    expect(tasksSource.part).toBe("automate");
  });

  it("assignee = me, status Open or In Progress, not deleted; overdue from due_date", async () => {
    query.mockResolvedValueOnce([
      row(1, "2026-11-13"),
      row(2, "2026-11-17", "In Progress"),
      row(3, null),
      row(4, "2026-11-14"),
    ]);

    const items = await tasksSource.load(ctx);

    const [sql, options] = query.mock.calls[0];
    expect(sql).toContain("t.organization_id = :organizationId");
    expect(sql).toContain("ta.user_id = :userId");
    expect(sql).toContain("ta.organization_id = :organizationId");
    expect(sql).toContain("t.status IN (:openStatuses)");
    expect(options.replacements).toEqual({
      organizationId: 7,
      userId: 5,
      openStatuses: ["Open", "In Progress", "Overdue"],
    });
    expect(options.replacements.openStatuses).not.toContain("Deleted");
    expect(options.replacements.openStatuses).not.toContain("Completed");

    const byId = Object.fromEntries(items.map((i) => [i.entityId, i]));
    // Due yesterday → overdue.
    expect(byId[1]).toEqual({
      id: "tasks:1",
      source: "tasks",
      part: "automate",
      entityType: "task",
      entityId: 1,
      name: "Task 1",
      url: "/tasks?taskId=1",
      dueDate: "2026-11-13",
      waitingSince: "2026-11-01T10:00:00.000Z",
      overdue: true,
      meta: { status: "Open", priority: "High" },
    });
    // Due in 3 days → not overdue, due date set.
    expect(byId[2].overdue).toBe(false);
    expect(byId[2].dueDate).toBe("2026-11-17");
    expect(byId[2].meta.status).toBe("In Progress");
    // No due date → never overdue.
    expect(byId[3].overdue).toBe(false);
    expect(byId[3].dueDate).toBeNull();
    // Due today is not overdue yet.
    expect(byId[4].overdue).toBe(false);
  });

  it("lets a database error propagate so the runner marks the source unavailable", async () => {
    query.mockRejectedValueOnce(new Error("boom"));
    await expect(tasksSource.load(ctx)).rejects.toThrow("boom");
  });
});
