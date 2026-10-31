import { describe, expect, it } from "@jest/globals";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const migration = require("../../database/migrations/20261012142910-data-retention-runs-error-code.js");

async function run(direction: "up" | "down") {
  const statements: string[] = [];
  await migration[direction]({
    sequelize: { query: async (sql: string) => statements.push(sql.replace(/\s+/g, " ").trim()) },
  });
  return statements;
}

describe("data-retention-runs-error-code migration", () => {
  it("adds a nullable error_code column", async () => {
    expect(await run("up")).toEqual([
      "ALTER TABLE verifywise.data_retention_runs ADD COLUMN IF NOT EXISTS error_code VARCHAR(64);",
    ]);
  });

  it("drops it on rollback", async () => {
    expect(await run("down")).toEqual([
      "ALTER TABLE verifywise.data_retention_runs DROP COLUMN IF EXISTS error_code;",
    ]);
  });
});
