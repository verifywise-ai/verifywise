/**
 * cleanupDatabase() TRUNCATEs every tenant table. It must check which database
 * it is connected to before doing so (a plain `npx jest <pattern>` once reached
 * it without globalSetup's guard and wiped a developer's local data on
 * 2026-10-15).
 *
 * Hermetic: readDevDbName is mocked in every test, so the result never depends
 * on the developer's real Servers/.env, and modules are reset per test so the
 * cached verdict starts empty.
 */

import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";

const query = jest.fn<(sql: string) => Promise<unknown>>();

jest.mock("../../database/db", () => ({
  sequelize: { query: (sql: string) => query(sql) },
}));

type Helpers = typeof import("../integration/helpers");

let cleanupDatabase: Helpers["cleanupDatabase"];
let guard: { readDevDbName: () => string | undefined };

function connectedTo(name: string) {
  query.mockImplementation(async (sql: string) =>
    /current_database\(\)/.test(sql) ? [[{ name }], undefined] : [[], undefined],
  );
}

function devDatabaseIs(name: string | undefined) {
  jest.spyOn(guard, "readDevDbName").mockReturnValue(name);
}

const truncated = () => query.mock.calls.some(([sql]) => /TRUNCATE/i.test(sql));
const lookups = () => query.mock.calls.filter(([sql]) => /current_database/.test(sql)).length;

describe("cleanupDatabase", () => {
  beforeEach(() => {
    jest.resetModules();
    guard = require("../testDatabaseGuard");
    ({ cleanupDatabase } = require("../integration/helpers") as Helpers);
  });

  afterEach(() => {
    jest.restoreAllMocks();
    query.mockReset();
  });

  it("refuses to truncate a database not named as a test database", async () => {
    devDatabaseIs(undefined);
    connectedTo("verifywise");

    await expect(cleanupDatabase()).rejects.toThrow(/Refusing to truncate "verifywise"/);
    expect(truncated()).toBe(false);
  });

  it("refuses to truncate the database Servers/.env names", async () => {
    devDatabaseIs("verifywise_dev_test");
    connectedTo("verifywise_dev_test");

    await expect(cleanupDatabase()).rejects.toThrow(/same database as Servers\/\.env/);
    expect(truncated()).toBe(false);
  });

  it("truncates a dedicated test database", async () => {
    devDatabaseIs("verifywise");
    connectedTo("verifywise_test_cleanup_guard");

    await cleanupDatabase();

    expect(truncated()).toBe(true);
  });

  it("asks Postgres and reads Servers/.env once, not on every call", async () => {
    devDatabaseIs("verifywise");
    connectedTo("verifywise_test_cleanup_guard");

    await cleanupDatabase();
    await cleanupDatabase();
    await cleanupDatabase();

    expect(lookups()).toBe(1);
    expect(guard.readDevDbName).toHaveBeenCalledTimes(1);
  });

  it("keeps refusing once it has refused", async () => {
    devDatabaseIs(undefined);
    connectedTo("verifywise");

    await expect(cleanupDatabase()).rejects.toThrow(/Refusing/);
    await expect(cleanupDatabase()).rejects.toThrow(/Refusing/);
    expect(truncated()).toBe(false);
  });
});
