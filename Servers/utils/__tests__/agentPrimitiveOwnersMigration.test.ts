import { describe, it, expect } from "@jest/globals";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const migration = require("../../database/migrations/20261009072856-create-agent-primitive-owners.js");

/** Run the migration's up() against a fake queryInterface and return its SQL. */
async function upSql(): Promise<string[]> {
  const statements: string[] = [];
  await migration.up({
    sequelize: {
      query: async (sql: string) => {
        statements.push(sql.replace(/\s+/g, " ").trim());
        return [];
      },
    },
  });
  return statements;
}

describe("create-agent-primitive-owners migration backfill", () => {
  it("backfills after creating the table and index", async () => {
    const sql = await upSql();
    expect(sql).toHaveLength(3);
    expect(sql[0]).toContain("CREATE TABLE IF NOT EXISTS verifywise.agent_primitive_owners");
    expect(sql[1]).toContain("CREATE INDEX IF NOT EXISTS idx_agent_primitive_owners_agent");
    expect(sql[2]).toContain("INSERT INTO verifywise.agent_primitive_owners");
  });

  it("copies only manual agents' owners who are users of the same organization", async () => {
    const backfill = (await upSql())[2];
    expect(backfill).toContain("WHERE ap.is_manual = true");
    expect(backfill).toContain("JOIN verifywise.users u ON u.organization_id = ap.organization_id");
    expect(backfill).toContain(
      "ON CONFLICT (organization_id, agent_primitive_id, user_id) DO NOTHING",
    );
  });

  it("casts owner_id only when it is 1 to 10 digits, so the cast cannot fail", async () => {
    const backfill = (await upSql())[2];
    // The cast sits inside the CASE branch guarded by the digit-count regex.
    expect(backfill).toContain(
      "u.id = CASE WHEN btrim(ap.owner_id) ~ '^[0-9]{1,10}$' THEN btrim(ap.owner_id)::bigint END",
    );
    expect(backfill.match(/::bigint/g)).toHaveLength(1);
    expect(backfill).not.toMatch(/::int(eger)?\b/);
    // The largest value the guard lets through still fits BIGINT.
    expect(9999999999).toBeLessThan(Number.MAX_SAFE_INTEGER);
  });
});
