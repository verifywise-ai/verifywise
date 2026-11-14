/**
 * Policy review reminders (P-H3, P-M2): which policies the daily sweep picks,
 * who it tells, the stamp it writes, and the stamps a review date change
 * clears. SQL-string tests; the selection runs against a real database in
 * tests/integration/policySave.test.ts.
 */
jest.mock("../../database/db", () => ({ sequelize: { query: jest.fn() } }));
jest.mock("../../services/automations/automationProducer", () => ({
  enqueueAutomationAction: jest.fn(),
}));
jest.mock("../customField.utils", () => ({
  deleteAllCustomFieldValuesForEntityQuery: jest.fn().mockResolvedValue(undefined),
  fetchCustomFieldsForEntities: jest.fn(),
}));
jest.mock("../user.utils", () => ({
  findUsersNotInOrganization: jest.fn().mockResolvedValue([]),
  parseReferencedIds: jest.fn((ids: unknown[]) => ids.filter(Boolean).map(Number)),
}));
jest.mock("../logger/fileLogger", () => ({
  __esModule: true,
  default: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));

import { sequelize } from "../../database/db";
import {
  findPolicyRemindersDueQuery,
  markPolicyReminderSentQuery,
  updatePolicyByIdQuery,
} from "../policyManager.utils";

const mockQuery = sequelize.query as jest.Mock;
const squash = (sql: string) => sql.replace(/\s+/g, " ");

beforeEach(() => {
  mockQuery.mockReset();
});

describe("findPolicyRemindersDueQuery", () => {
  const run = async () => {
    mockQuery.mockResolvedValue([]);
    await findPolicyRemindersDueQuery(4);
    const [sql, options] = mockQuery.mock.calls[0];
    return { sql: squash(sql), options };
  };

  it("reads only the organization's policies, unqualified", async () => {
    const { sql, options } = await run();
    expect(sql).toContain("FROM policy_manager pm WHERE pm.organization_id = :organizationId");
    expect(sql).toContain("r.organization_id = pm.organization_id");
    expect(sql).not.toContain("verifywise.");
    expect(options.replacements).toEqual({ organizationId: 4 });
  });

  it("skips retired policies and policies without a review date", async () => {
    const { sql } = await run();
    expect(sql).toContain("pm.status IS DISTINCT FROM 'Archived'");
    expect(sql).toContain("pm.status IS DISTINCT FROM 'Deprecated'");
    expect(sql).toContain("pm.next_review_date IS NOT NULL");
  });

  it("compares the review day with today for both windows, each once", async () => {
    const { sql } = await run();
    expect(sql).toContain(
      "(pm.next_review_date::date < CURRENT_DATE AND pm.overdue_reminded_at IS NULL)",
    );
    expect(sql).toContain(
      "pm.next_review_date::date BETWEEN CURRENT_DATE AND CURRENT_DATE + 7 AND pm.due_soon_reminded_at IS NULL",
    );
    expect(sql).toContain(
      "CASE WHEN pm.next_review_date::date < CURRENT_DATE THEN 'overdue' ELSE 'due_soon' END AS kind",
    );
    expect(sql).toContain("to_char(pm.next_review_date, 'YYYY-MM-DD') AS review_date");
  });

  it("tells the owner and reviewers once each, falling back to the author, members only", async () => {
    const { sql } = await run();
    // UNION de-duplicates an owner who is also a reviewer.
    expect(sql).toMatch(
      /SELECT pm\.policy_owner_id AS user_id UNION SELECT r\.user_id FROM policy_manager__assigned_reviewer_ids r/,
    );
    expect(sql).toContain(
      "om.organization_id = pm.organization_id AND om.user_id = assigned.user_id",
    );
    expect(sql).toMatch(
      /COALESCE\( \(SELECT array_agg\(assigned\.user_id ORDER BY assigned\.user_id\).*\(SELECT ARRAY\[pm\.author_id\] WHERE EXISTS \( SELECT 1 FROM organization_members om WHERE om\.organization_id = pm\.organization_id AND om\.user_id = pm\.author_id \)\) \) AS recipient_ids/,
    );
  });

  it("returns no policy that nobody can be told about", async () => {
    const { sql } = await run();
    expect(sql).toContain("WHERE due.recipient_ids IS NOT NULL ORDER BY due.id");
  });

  it("returns the rows as read", async () => {
    const rows = [
      { id: 1, title: "A", review_date: "2030-01-15", kind: "due_soon", recipient_ids: [3] },
    ];
    mockQuery.mockResolvedValue(rows);
    await expect(findPolicyRemindersDueQuery(4)).resolves.toBe(rows);
  });
});

describe("markPolicyReminderSentQuery", () => {
  it.each([
    ["due_soon", "due_soon_reminded_at"],
    ["overdue", "overdue_reminded_at"],
  ] as const)("stamps %s in %s, scoped to the organization", async (kind, column) => {
    mockQuery.mockResolvedValue([[], 1]);

    await markPolicyReminderSentQuery(9, kind, 4);

    const [sql, options] = mockQuery.mock.calls[0];
    expect(squash(sql)).toBe(
      `UPDATE policy_manager SET ${column} = now() WHERE organization_id = :organizationId AND id = :id`,
    );
    expect(options.replacements).toEqual({ organizationId: 4, id: 9 });
  });
});

describe("updatePolicyByIdQuery review reminder stamps", () => {
  const tx = { afterCommit: jest.fn() };

  const updateSql = async (patch: Record<string, unknown>) => {
    mockQuery.mockImplementation(async (sql: string) => {
      if (sql.includes("FROM automation_triggers")) return [];
      if (sql.includes("FROM policy_manager pm")) return [{ id: 9, title: "Policy" }];
      return [[], 0];
    });
    await updatePolicyByIdQuery(9, patch as never, 4, 1, tx as never);
    const call = mockQuery.mock.calls.find(([sql]) => String(sql).startsWith("UPDATE"));
    return { sql: squash(call[0]), replacements: call[1].replacements };
  };

  it("clears both stamps only when the review moves to another day", async () => {
    const { sql, replacements } = await updateSql({ next_review_date: "2030-02-01" });

    expect(replacements.next_review_date).toBe("2030-02-01");
    expect(sql).toContain("next_review_date = :next_review_date");
    // Same day: each stamp keeps its value; another day (or cleared): NULL.
    expect(sql).toContain(
      "due_soon_reminded_at = CASE WHEN next_review_date::date IS NOT DISTINCT FROM CAST(:next_review_date AS date) THEN due_soon_reminded_at END",
    );
    expect(sql).toContain(
      "overdue_reminded_at = CASE WHEN next_review_date::date IS NOT DISTINCT FROM CAST(:next_review_date AS date) THEN overdue_reminded_at END",
    );
  });

  it("applies the same rule when the review date is cleared", async () => {
    const { sql, replacements } = await updateSql({ next_review_date: null });

    expect(replacements.next_review_date).toBeNull();
    expect(sql).toContain("due_soon_reminded_at = CASE");
  });

  it("leaves the stamps alone when the save does not touch the review date", async () => {
    const { sql } = await updateSql({ title: "Renamed" });

    expect(sql).not.toContain("next_review_date");
    expect(sql).not.toContain("reminded_at");
  });
});
