import { beforeEach, describe, expect, it, jest } from "@jest/globals";

jest.mock("../../database/db", () => ({ sequelize: { query: jest.fn() } }));

import { sequelize } from "../../database/db";
import { GENERIC_FORMATTERS, getEntityConfig } from "../../config/changeHistory.config";
import { recordEntityCreation } from "../changeHistory.base.utils";

const mockQuery = sequelize.query as jest.MockedFunction<any>;
const formatters = getEntityConfig("incident").fieldFormatters!;
const tx = { id: "tx" } as any;

const isSavepointSql = (sql: string) =>
  /^(SAVEPOINT|RELEASE SAVEPOINT|ROLLBACK TO SAVEPOINT) /.test(sql);

/** Answers savepoint statements and INSERTs; `select` answers lookups. */
function respond(select: (sql: string) => unknown) {
  mockQuery.mockImplementation(async (sql: string) => {
    if (isSavepointSql(sql) || sql.startsWith("INSERT")) return [[], 0];
    return select(sql);
  });
}

/** The lookup SELECTs (not savepoint statements or history INSERTs). */
const lookupCalls = () =>
  mockQuery.mock.calls.filter(
    ([sql]: [string]) => !isSavepointSql(sql) && !sql.startsWith("INSERT"),
  );

/** The SQL statements run on `transaction`, with savepoint names normalised. */
const statementsOn = (transaction: unknown) =>
  mockQuery.mock.calls
    .filter(([, options]: [string, any]) => options?.transaction === transaction)
    .map(([sql]: [string]) =>
      isSavepointSql(sql) ? sql.replace(/history_lookup_\d+/, "sp") : "SELECT",
    );

describe("incident change-history formatters are tenant-scoped", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockQuery.mockReset();
  });

  it.each([
    ["project_id", "projects", "Use case"],
    ["model_inventory_id", "model_inventories", "Model"],
  ])(
    "%s resolves a name only within the organization, on the update transaction",
    async (field, table, label) => {
      respond(() => [{ name: "Fraud model" }]);

      await expect(formatters[field](5, { organizationId: 1, transaction: tx })).resolves.toBe(
        "Fraud model",
      );
      const [sql, options] = lookupCalls()[0];
      expect(sql).toContain(`FROM ${table}`);
      expect(sql).toContain("organization_id = :organizationId");
      expect(options).toMatchObject({
        replacements: { id: 5, organizationId: 1 },
        transaction: tx,
      });

      // Another organization's row is not found → id fallback, no name leaked.
      respond(() => []);
      await expect(formatters[field](6, { organizationId: 1 })).resolves.toBe(`${label} #6`);
    },
  );

  it.each([["project_id"], ["model_inventory_id"]])(
    "%s does not query at all without an organization",
    async (field) => {
      await expect(formatters[field](5)).resolves.toMatch(/ #5$/);
      expect(mockQuery).not.toHaveBeenCalled();
    },
  );

  it("assignee_id uses the user lookup scoped to the organization", async () => {
    respond(() => [{ id: 7, name: "Grace", surname: "Hopper", email: null }]);

    await expect(formatters.assignee_id("7", { organizationId: 1, transaction: tx })).resolves.toBe(
      "Grace Hopper",
    );
    const [sql, options] = lookupCalls()[0];
    expect(sql).toContain("organization_id = :organizationId");
    expect(options).toMatchObject({
      replacements: { userId: 7, organizationId: 1 },
      transaction: tx,
    });
  });

  it("the generic user formatter keeps its unscoped lookup when given no organization", async () => {
    mockQuery.mockResolvedValueOnce([]);
    await expect(GENERIC_FORMATTERS.user(7)).resolves.toBe("User #7");
    expect(mockQuery.mock.calls[0][0]).not.toContain("organization_id");
    // No transaction, no savepoint.
    expect(mockQuery).toHaveBeenCalledTimes(1);
  });

  describe("savepoints around lookups on a caller's transaction", () => {
    it("opens and releases a savepoint around a successful lookup", async () => {
      respond(() => [{ name: "Chatbot" }]);

      await expect(formatters.project_id(3, { organizationId: 1, transaction: tx })).resolves.toBe(
        "Chatbot",
      );
      expect(statementsOn(tx)).toEqual(["SAVEPOINT sp", "SELECT", "RELEASE SAVEPOINT sp"]);
    });

    it("rolls back to and releases the savepoint when the lookup fails, then falls back", async () => {
      respond(() => {
        throw new Error("division by zero");
      });

      await expect(formatters.project_id(3, { organizationId: 1, transaction: tx })).resolves.toBe(
        "Use case #3",
      );
      expect(statementsOn(tx)).toEqual([
        "SAVEPOINT sp",
        "SELECT",
        "ROLLBACK TO SAVEPOINT sp",
        "RELEASE SAVEPOINT sp",
      ]);
    });

    it("uses a distinct savepoint name for each lookup", async () => {
      respond(() => [{ name: "Chatbot" }]);

      await formatters.project_id(3, { organizationId: 1, transaction: tx });
      await formatters.project_id(4, { organizationId: 1, transaction: tx });

      const names = mockQuery.mock.calls
        .map(([sql]: [string]) => /^SAVEPOINT (\w+)$/.exec(sql)?.[1])
        .filter(Boolean);
      expect(names).toHaveLength(2);
      expect(new Set(names).size).toBe(2);
    });
  });

  it("creation history records names, looked up in the organization on the creating transaction", async () => {
    const createTx = { afterCommit: jest.fn() } as any;
    respond((sql) => {
      if (sql.includes("FROM users")) {
        return [{ id: 7, name: "Grace", surname: "Hopper", email: null }];
      }
      if (sql.includes("FROM projects")) return [{ name: "Chatbot" }];
      return [[], 0];
    });

    await recordEntityCreation(
      "incident",
      42,
      5,
      1,
      { status: "Open", assignee_id: 7, project_id: 3 },
      createTx,
    );

    const lookups = lookupCalls();
    expect(lookups).toHaveLength(2);
    for (const [sql, options] of lookups) {
      expect(sql).toContain("organization_id = :organizationId");
      expect(options).toMatchObject({
        replacements: { organizationId: 1 },
        transaction: createTx,
      });
    }
    const inserted = mockQuery.mock.calls
      .filter(([sql]: [string]) => sql.startsWith("INSERT"))
      .map(([, options]: [string, any]) => [
        options.replacements.field_name,
        options.replacements.new_value,
      ]);
    expect(inserted).toEqual(
      expect.arrayContaining([
        ["Owner", "Grace Hopper"],
        ["Linked use case", "Chatbot"],
        ["Status", "Open"],
      ]),
    );
  });

  it("creation history still records every field when a name lookup fails", async () => {
    const createTx = { afterCommit: jest.fn() } as any;
    respond((sql) => {
      if (sql.includes("FROM users")) throw new Error("lookup failed");
      return [[], 0];
    });

    await recordEntityCreation("incident", 42, 5, 1, { status: "Open", assignee_id: 7 }, createTx);

    const inserted = mockQuery.mock.calls
      .filter(([sql]: [string]) => sql.startsWith("INSERT"))
      .map(([, options]: [string, any]) => [
        options.replacements.field_name,
        options.replacements.new_value,
        options.transaction,
      ]);
    expect(inserted).toEqual(
      expect.arrayContaining([
        ["Owner", "User #7", createTx],
        ["Status", "Open", createTx],
      ]),
    );
    expect(mockQuery.mock.calls.map(([sql]: [string]) => sql)).toEqual(
      expect.arrayContaining([expect.stringMatching(/^ROLLBACK TO SAVEPOINT history_lookup_\d+$/)]),
    );
  });
});

describe("incident day columns in change history", () => {
  it("records a stored TIMESTAMP day (a Date at local midnight) as that day east of UTC", async () => {
    // node-pg reads TIMESTAMP WITHOUT TIME ZONE as server-local time. On a
    // UTC+9 server, 2026-06-23 is the instant 2026-06-22T15:00Z, whose local
    // date parts are the 23rd. Jest pins the zone, so the local parts are
    // simulated on the Date.
    const stored = new Date("2026-06-22T15:00:00.000Z");
    stored.getFullYear = () => 2026;
    stored.getMonth = () => 5;
    stored.getDate = () => 23;
    expect(stored.toISOString().slice(0, 10)).toBe("2026-06-22");
    expect(await formatters.occurred_date(stored)).toBe("2026-06-23");
    expect(await formatters.date_detected(stored)).toBe("2026-06-23");
    // A YYYY-MM-DD string (what the drawer sends) is that day too.
    expect(await formatters.date_detected("2026-06-23")).toBe("2026-06-23");
  });
});
