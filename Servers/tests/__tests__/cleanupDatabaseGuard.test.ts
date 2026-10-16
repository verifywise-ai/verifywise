/**
 * cleanupDatabase() TRUNCATEs every tenant table. It must check which database
 * it is connected to before doing so, because the integration suite can be
 * reached without globalSetup's guard (a plain `npx jest <pattern>` did exactly
 * that on 2026-10-15 and wiped a developer's local data).
 */

import { beforeEach, describe, expect, it, jest } from "@jest/globals";

const query = jest.fn<(sql: string) => Promise<unknown>>();

jest.mock("../../database/db", () => ({
  sequelize: { query: (sql: string) => query(sql) },
}));

import { cleanupDatabase } from "../integration/helpers";

function connectedTo(name: string) {
  query.mockImplementation(async (sql: string) =>
    /current_database\(\)/.test(sql) ? [[{ name }], undefined] : [[], undefined],
  );
}

const truncated = () => query.mock.calls.some(([sql]) => /TRUNCATE/i.test(sql));

describe("cleanupDatabase", () => {
  beforeEach(() => {
    query.mockReset();
  });

  it("refuses to truncate a database not named as a test database", async () => {
    connectedTo("verifywise");

    await expect(cleanupDatabase()).rejects.toThrow(/Refusing to truncate "verifywise"/);
    expect(truncated()).toBe(false);
  });

  it("refuses to truncate the database Servers/.env names", async () => {
    const devDbName = "verifywise_dev_test";
    const guard = require("../testDatabaseGuard");
    const spy = jest.spyOn(guard, "readDevDbName").mockReturnValue(devDbName);
    connectedTo(devDbName);

    await expect(cleanupDatabase()).rejects.toThrow(/same database as Servers\/\.env/);
    expect(truncated()).toBe(false);
    spy.mockRestore();
  });

  it("truncates a dedicated test database", async () => {
    connectedTo("verifywise_test_cleanup_guard");

    await cleanupDatabase();

    expect(truncated()).toBe(true);
  });
});
