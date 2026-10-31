import { describe, it, expect } from "@jest/globals";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const migration = require("../../database/migrations/20261011150000-data-retention-tables.js");

/**
 * Run down() against a fake queryInterface. `present` and `hasRows` answer the
 * checkpoint table probes; every statement is returned.
 */
async function runDown(present: boolean, hasRows: boolean) {
  const statements: string[] = [];
  const query = async (sql: string) => {
    statements.push(sql.replace(/\s+/g, " ").trim());
    if (sql.includes("to_regclass")) return [[{ present }]];
    if (sql.includes("has_rows")) return [[{ has_rows: hasRows }]];
    return [[]];
  };
  const error = await migration
    .down({ sequelize: { query, transaction: async (fn: any) => fn({}) } })
    .then(() => null)
    .catch((e: Error) => e);
  return { statements, error };
}

describe("data-retention-tables migration down()", () => {
  it("refuses to roll back once a ledger checkpoint exists, before dropping anything", async () => {
    const { statements, error } = await runDown(true, true);
    expect(error?.message).toMatch(/audit_ledger_retention_checkpoints has rows/);
    expect(statements.some((s) => s.startsWith("DROP"))).toBe(false);
  });

  it("drops the tables when there are no checkpoints", async () => {
    const { statements, error } = await runDown(true, false);
    expect(error).toBeNull();
    expect(statements).toContain(
      "DROP TABLE IF EXISTS verifywise.audit_ledger_retention_checkpoints;",
    );
  });

  it("does not query a checkpoint table that does not exist", async () => {
    const { statements, error } = await runDown(false, true);
    expect(error).toBeNull();
    expect(statements.some((s) => s.includes("has_rows"))).toBe(false);
  });
});
