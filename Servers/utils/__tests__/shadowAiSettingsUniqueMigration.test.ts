import { afterEach, describe, expect, it, jest } from "@jest/globals";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const migration = require("../../database/migrations/20261012091252-shadow-ai-settings-unique-org.js");

const BACKUP = "verifywise.shadow_ai_settings_dedup_backup";

function fakeQueryInterface(answer: (sql: string) => unknown[] = () => [[]]) {
  const statements: { sql: string; inTransaction: boolean }[] = [];
  const tx = {};
  const query = async (sql: string, options?: { transaction?: unknown }) => {
    const flat = sql.replace(/\s+/g, " ").trim();
    statements.push({ sql: flat, inTransaction: options?.transaction === tx });
    return answer(flat);
  };
  return {
    statements,
    queryInterface: { sequelize: { query, transaction: async (fn: any) => fn(tx) } },
  };
}

afterEach(() => {
  jest.restoreAllMocks();
});

describe("shadow-ai-settings-unique-org migration up()", () => {
  it("backs up and removes duplicates, keeping the lowest ctid, before adding the index", async () => {
    const log = jest.spyOn(console, "log").mockImplementation(() => undefined);
    const { statements, queryInterface } = fakeQueryInterface((sql) =>
      sql.startsWith("WITH ranked") ? [[{ removed: 2 }]] : [[]],
    );

    await migration.up(queryInterface);

    expect(statements.map((s) => s.sql.split(" ").slice(0, 3).join(" "))).toEqual([
      "CREATE TABLE IF",
      "WITH ranked AS",
      "CREATE UNIQUE INDEX",
    ]);
    expect(statements[0].sql).toContain(`${BACKUP} (LIKE verifywise.shadow_ai_settings)`);
    const dedup = statements[1].sql;
    // The kept row is the one an unordered SELECT returned: lowest ctid.
    expect(dedup).toContain("PARTITION BY organization_id ORDER BY ctid");
    expect(dedup).toContain("ranked.rn > 1");
    expect(dedup).toContain(`INSERT INTO ${BACKUP} SELECT * FROM removed`);
    expect(statements.every((s) => s.inTransaction)).toBe(true);
    expect(log).toHaveBeenCalledWith(expect.stringContaining("removed 2 duplicate"));
  });
});

describe("shadow-ai-settings-unique-org migration down()", () => {
  it("drops the index, restores the removed rows and drops the backup", async () => {
    const { statements, queryInterface } = fakeQueryInterface((sql) =>
      sql.includes("to_regclass") ? [[{ present: true }]] : [[]],
    );

    await migration.down(queryInterface);

    expect(statements.map((s) => s.sql)).toEqual([
      "DROP INDEX IF EXISTS verifywise.uq_shadow_ai_settings_organization_id;",
      `SELECT to_regclass('${BACKUP}') IS NOT NULL AS present;`,
      `INSERT INTO verifywise.shadow_ai_settings SELECT * FROM ${BACKUP};`,
      `DROP TABLE ${BACKUP};`,
    ]);
  });

  it("only drops the index when there is no backup table", async () => {
    const { statements, queryInterface } = fakeQueryInterface((sql) =>
      sql.includes("to_regclass") ? [[{ present: false }]] : [[]],
    );

    await migration.down(queryInterface);

    expect(statements).toHaveLength(2);
  });
});
