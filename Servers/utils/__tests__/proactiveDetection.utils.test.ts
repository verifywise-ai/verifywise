import { describe, it, expect, beforeEach, jest } from "@jest/globals";

jest.mock("../../database/db", () => ({
  sequelize: {
    query: jest.fn(),
  },
}));

import { sequelize } from "../../database/db";
import {
  detectRiskAnomaly,
  findOverdueTasks,
  detectComplianceDrop,
  buildWeeklyDigest,
} from "../proactiveDetection.utils";

const mockQuery = sequelize.query as jest.MockedFunction<typeof sequelize.query>;

describe("detectRiskAnomaly", () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  it("flags an anomaly when count24h exceeds twice the 30-day daily average", async () => {
    // First query: count of new high/critical risks in last 24h
    mockQuery.mockResolvedValueOnce([[{ count: "10" }], {}] as any);
    // Second query: total new high/critical risks in the prior 30 days
    mockQuery.mockResolvedValueOnce([[{ count: "30" }], {}] as any);

    const result = await detectRiskAnomaly(7);

    // avg30d = 30 / 30 = 1, threshold = 2 * 1 = 2, count24h = 10 > 2 -> anomaly
    expect(result.count24h).toBe(10);
    expect(result.avg30d).toBe(1);
    expect(result.ratio).toBe(10);
    expect(result.isAnomaly).toBe(true);
  });

  it("does not flag an anomaly when count24h is within twice the average", async () => {
    mockQuery.mockResolvedValueOnce([[{ count: "1" }], {}] as any);
    mockQuery.mockResolvedValueOnce([[{ count: "60" }], {}] as any);

    const result = await detectRiskAnomaly(7);

    // avg30d = 60 / 30 = 2, threshold = 4, count24h = 1 -> no anomaly
    expect(result.count24h).toBe(1);
    expect(result.avg30d).toBe(2);
    expect(result.isAnomaly).toBe(false);
  });

  it("guards against a zero 30-day average (no division by zero, no anomaly)", async () => {
    mockQuery.mockResolvedValueOnce([[{ count: "0" }], {}] as any);
    mockQuery.mockResolvedValueOnce([[{ count: "0" }], {}] as any);

    const result = await detectRiskAnomaly(7);

    expect(result.avg30d).toBe(0);
    expect(result.isAnomaly).toBe(false);
    expect(Number.isFinite(result.ratio)).toBe(true);
  });

  it("filters by organization_id (multi-tenancy)", async () => {
    mockQuery.mockResolvedValueOnce([[{ count: "0" }], {}] as any);
    mockQuery.mockResolvedValueOnce([[{ count: "0" }], {}] as any);

    await detectRiskAnomaly(42);

    const firstCall = mockQuery.mock.calls[0];
    expect(firstCall[1]).toMatchObject({ replacements: { organizationId: 42 } });
    expect(String(firstCall[0])).toContain("organization_id = :organizationId");
  });
});

describe("findOverdueTasks", () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  it("returns tasks past due that are not completed", async () => {
    const rows = [
      { id: 1, title: "late one", due_date: "2020-01-01", status: "Open" },
      { id: 2, title: "late two", due_date: "2020-02-01", status: "In Progress" },
    ];
    mockQuery.mockResolvedValueOnce([rows, {}] as any);

    const result = await findOverdueTasks(7);

    expect(result).toEqual(rows);
    const sql = String(mockQuery.mock.calls[0][0]);
    expect(sql).toContain("due_date < NOW()");
    expect(sql).toContain("organization_id = :organizationId");
    // Completed tasks must be excluded (parameterized, value = "Completed")
    expect(sql).toContain("status != :completedStatus");
    expect(mockQuery.mock.calls[0][1]).toMatchObject({
      replacements: { organizationId: 7, completedStatus: "Completed" },
    });
  });
});

describe("detectComplianceDrop", () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  it("returns only frameworks whose latest score dropped more than 5 points", async () => {
    // One framework dropped 10 (80 -> 70), another dropped 3 (50 -> 47, ignored)
    const rows = [
      { framework_type: "eu_ai_act", latest_score: 70, previous_score: 80 },
      { framework_type: "iso_42001", latest_score: 47, previous_score: 50 },
    ];
    mockQuery.mockResolvedValueOnce([rows, {}] as any);

    const result = await detectComplianceDrop(7);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      framework_type: "eu_ai_act",
      latest_score: 70,
      previous_score: 80,
      drop: 10,
    });
  });

  it("ignores frameworks without a previous score", async () => {
    const rows = [{ framework_type: "eu_ai_act", latest_score: 70, previous_score: null }];
    mockQuery.mockResolvedValueOnce([rows, {}] as any);

    const result = await detectComplianceDrop(7);

    expect(result).toEqual([]);
  });

  it("filters by organization_id (multi-tenancy)", async () => {
    mockQuery.mockResolvedValueOnce([[], {}] as any);

    await detectComplianceDrop(99);

    expect(String(mockQuery.mock.calls[0][0])).toContain("organization_id = :organizationId");
    expect(mockQuery.mock.calls[0][1]).toMatchObject({
      replacements: { organizationId: 99 },
    });
  });
});

describe("buildWeeklyDigest", () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  it("aggregates open risks, overdue tasks, and framework scores", async () => {
    // 1. open risks count
    mockQuery.mockResolvedValueOnce([[{ count: "5" }], {}] as any);
    // 2. overdue tasks
    const overdue = [{ id: 1, title: "late", due_date: "2020-01-01", status: "Open" }];
    mockQuery.mockResolvedValueOnce([overdue, {}] as any);
    // 3. framework scores
    const scores = [{ framework_type: "eu_ai_act", avg_score: 80 }];
    mockQuery.mockResolvedValueOnce([scores, {}] as any);

    const result = await buildWeeklyDigest(7);

    expect(result.openRisks).toBe(5);
    expect(result.overdueTasks).toEqual(overdue);
    expect(result.frameworkScores).toEqual(scores);
    expect(typeof result.generatedAt).toBe("string");
    expect(Number.isNaN(Date.parse(result.generatedAt))).toBe(false);
  });
});
