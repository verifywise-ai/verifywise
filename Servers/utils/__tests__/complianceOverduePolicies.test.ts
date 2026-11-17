/**
 * Compliance overdue-policy count (P-M13): a policy is overdue once its review
 * day has passed, whatever its status, except retired ones (Archived and
 * Deprecated). SQL-string test with a mocked database.
 */
jest.mock("../../database/db", () => ({ sequelize: { query: jest.fn() } }));

import { sequelize } from "../../database/db";
import { calculateComplianceScore } from "../compliance.utils";

describe("compliance overdue policies", () => {
  it("counts by calendar day and excludes Archived and Deprecated", async () => {
    (sequelize.query as jest.Mock).mockResolvedValue([{ count: "0" }]);

    await calculateComplianceScore(7);

    const calls = (sequelize.query as jest.Mock).mock.calls;
    const overdueCall = calls.find(
      ([sql]) =>
        typeof sql === "string" &&
        sql.includes("FROM policy_manager") &&
        sql.includes("next_review_date"),
    );
    expect(overdueCall).toBeDefined();
    const sql = overdueCall[0] as string;
    expect(sql).toContain("organization_id = :organizationId");
    expect(sql).toContain("next_review_date::date < CURRENT_DATE");
    expect(sql).toContain("status IS DISTINCT FROM 'Archived'");
    expect(sql).toContain("status IS DISTINCT FROM 'Deprecated'");
    expect(sql).not.toContain("'Published'");
    expect(overdueCall[1].replacements).toEqual({ organizationId: 7 });
  });
});
