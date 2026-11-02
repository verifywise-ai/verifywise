import { describe, it, expect, jest, beforeEach } from "@jest/globals";

const mockQuery = jest.fn(async (..._args: any[]): Promise<any> => [[]]);
jest.mock("../../database/db", () => ({
  sequelize: { query: (...args: any[]) => mockQuery(...args) },
}));

import { getInsightsSummaryQuery, getUserActivityQuery } from "../shadowAiInsights.utils";

const sqlOf = (call: any[]) => String(call[0]).replace(/\s+/g, " ");

beforeEach(() => {
  mockQuery.mockReset();
  mockQuery.mockResolvedValue([
    [{ total: "0", total_ai_users: "0", unique_apps: "0", departments_using_ai: "0" }],
  ]);
});

describe("getInsightsSummaryQuery", () => {
  it("counts AI users only from events matched to a tool", async () => {
    await getInsightsSummaryQuery(1, 30);
    const sql = sqlOf(mockQuery.mock.calls[0]);
    const userSubquery = sql.match(/\(SELECT COUNT\(DISTINCT user_email\).*?\) as total_ai_users/);
    expect(userSubquery).not.toBeNull();
    expect(userSubquery![0]).toContain("detected_tool_id IS NOT NULL");
  });
});

describe("getUserActivityQuery", () => {
  it("excludes unmatched events from both the rows and the total", async () => {
    await getUserActivityQuery(1, { department: "Sales" });
    const [rowsSql, totalSql] = mockQuery.mock.calls.map(sqlOf);
    expect(rowsSql).toContain("GROUP BY e.user_email");
    expect(rowsSql).toContain("e.detected_tool_id IS NOT NULL");
    expect(totalSql).toContain("COUNT(DISTINCT user_email)");
    expect(totalSql).toContain("e.detected_tool_id IS NOT NULL");
    // department filter still combines with the tool filter
    expect(totalSql).toContain("e.department = :department");
  });
});
