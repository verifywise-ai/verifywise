import { buildRecentActivities } from "../recentActivity";

describe("buildRecentActivities", () => {
  it("keeps the newest five records and carries the entity id used for navigation", () => {
    const activities = buildRecentActivities({
      useCaseMetrics: {
        recent: [
          { id: 12, title: "Claims triage", last_updated: "2026-03-02T00:00:00.000Z" },
          { id: 13, title: "Older use case", created_at: "2026-01-01T00:00:00.000Z" },
        ],
      },
      riskMetrics: {
        recent: [{ id: 4, title: "Bias in scoring", updated_at: "2026-03-05T00:00:00.000Z" }],
      },
      taskMetrics: {
        recent: [{ id: 9, title: "Collect evidence", created_at: "2026-03-04T00:00:00.000Z" }],
      },
      incidentMetrics: {
        recent: [
          {
            id: 3,
            incident_id: "INC-3",
            description: "A".repeat(70),
            created_at: "2026-03-03T00:00:00.000Z",
          },
        ],
      },
      policyMetrics: {
        recent: [{ id: "15", title: "Model policy", last_updated_at: "2026-03-01T00:00:00.000Z" }],
      },
      evidenceMetrics: {
        recent: [{ id: 20, title: "Audit pack", uploaded_at: "2026-02-01T00:00:00.000Z" }],
      },
    });

    expect(activities.map((item) => item.entityType)).toEqual([
      "risk",
      "task",
      "incident",
      "useCase",
      "policy",
    ]);
    expect(activities.find((item) => item.entityType === "useCase")).toMatchObject({
      id: "useCase-12",
      entityId: 12,
      title: "Claims triage",
    });
    expect(activities.find((item) => item.entityType === "incident")?.title).toBe(
      `${"A".repeat(60)}...`,
    );
    expect(activities.some((item) => item.entityId === 20)).toBe(false);
  });

  it("drops rows that have no timestamp", () => {
    expect(
      buildRecentActivities({
        taskMetrics: { recent: [{ id: 1, title: "No date" }] },
      }),
    ).toEqual([]);
  });
});
