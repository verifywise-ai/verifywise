/**
 * The integration suite's connection-level guard (tests/integration/databaseGuard.ts,
 * setupDatabaseGuard.ts) and runMigrations()'s pre-spawn check. No database:
 * connections are mocked, execSync is mocked, readDevDbName is pinned.
 */

import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";

const execSync = jest.fn();
jest.mock("child_process", () => ({
  ...jest.requireActual<typeof import("child_process")>("child_process"),
  execSync: (...args: unknown[]) => execSync(...args),
}));

type Guard = typeof import("../integration/databaseGuard");

let guardModule: { readDevDbName: () => string | undefined };
let databaseGuard: Guard;

function connectionTo(name: string | undefined) {
  return {
    query: jest.fn(async (_sql: string) => ({ rows: [{ name }] })),
    end: jest.fn(async () => undefined),
  };
}

describe("assertConnectionIsTestDatabase (afterConnect hook)", () => {
  beforeEach(() => {
    jest.resetModules();
    guardModule = require("../testDatabaseGuard");
    jest.spyOn(guardModule, "readDevDbName").mockReturnValue("verifywise");
    databaseGuard = require("../integration/databaseGuard");
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("closes a refused connection before throwing", async () => {
    const connection = connectionTo("verifywise");

    await expect(databaseGuard.assertConnectionIsTestDatabase(connection)).rejects.toThrow(
      /Refusing to truncate "verifywise"/,
    );
    expect(connection.end).toHaveBeenCalledTimes(1);
  });

  it("keeps the refusal when closing fails", async () => {
    const connection = connectionTo("latest");
    connection.end.mockRejectedValue(new Error("socket already closed"));

    await expect(databaseGuard.assertConnectionIsTestDatabase(connection)).rejects.toThrow(
      /Refusing to truncate "latest"/,
    );
  });

  it("closes the connection when the lookup itself fails", async () => {
    const connection = connectionTo(undefined);
    connection.query.mockRejectedValue(new Error("boom"));

    await expect(databaseGuard.assertConnectionIsTestDatabase(connection)).rejects.toThrow("boom");
    expect(connection.end).toHaveBeenCalledTimes(1);
  });

  it("leaves a test-database connection open", async () => {
    const connection = connectionTo("verifywise_test2");

    await databaseGuard.assertConnectionIsTestDatabase(connection);

    expect(connection.end).not.toHaveBeenCalled();
  });

  it("asks every new connection, with no cache shared between them", async () => {
    const good = connectionTo("verifywise_test");
    const bad = connectionTo("verifywise");

    await databaseGuard.assertConnectionIsTestDatabase(good);
    await databaseGuard.assertConnectionIsTestDatabase(good);
    await expect(databaseGuard.assertConnectionIsTestDatabase(bad)).rejects.toThrow(/Refusing/);

    expect(good.query).toHaveBeenCalledTimes(2);
    expect(bad.end).toHaveBeenCalledTimes(1);
  });
});

describe("setupDatabaseGuard", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("adds the hook to the app's sequelize only once database/db is loaded", () => {
    jest.isolateModules(() => {
      require("../integration/setupDatabaseGuard");
      const { sequelize } = require("../../database/db");
      const hooks = (sequelize.options.hooks.afterConnect ?? []) as { name?: string }[];
      expect(hooks.map((h) => h.name)).toContain("integrationTestDatabaseGuard");
    });
  });
});

describe("runMigrations", () => {
  const saved = { ...process.env };

  beforeEach(() => {
    jest.resetModules();
    jest.doMock("../../database/db", () => ({ sequelize: { query: jest.fn() } }));
    guardModule = require("../testDatabaseGuard");
    jest.spyOn(guardModule, "readDevDbName").mockReturnValue("verifywise");
    execSync.mockReset();
  });

  afterEach(() => {
    jest.restoreAllMocks();
    jest.dontMock("../../database/db");
    for (const key of Object.keys(process.env)) if (!(key in saved)) delete process.env[key];
    Object.assign(process.env, saved);
  });

  it("refuses before spawning the sequelize CLI when the child's DB_NAME is the dev database", () => {
    process.env.DB_NAME = "verifywise";
    const { runMigrations } = require("../integration/helpers");

    expect(() => runMigrations()).toThrow(/same database as Servers\/\.env[\s\S]*exported/);
    expect(execSync).not.toHaveBeenCalled();
  });

  it("refuses a name without a test token", () => {
    process.env.DB_NAME = "verifywise_attestations";
    const { runMigrations } = require("../integration/helpers");

    expect(() => runMigrations()).toThrow(/"test" or "tests" as a separate word/);
    expect(execSync).not.toHaveBeenCalled();
  });

  it("migrates a dedicated test database, passing the checked DB_NAME to the child", () => {
    process.env.DB_NAME = "verifywise_tests";
    const { runMigrations } = require("../integration/helpers");

    runMigrations();

    expect(execSync).toHaveBeenCalledTimes(1);
    const [, options] = execSync.mock.calls[0] as [string, { env: NodeJS.ProcessEnv }];
    expect(options.env.DB_NAME).toBe("verifywise_tests");
    expect(options.env.NODE_ENV).toBe("test");
  });
});
