/**
 * The integration suite truncates every table it touches, so it must never be
 * pointed at the database named in Servers/.env. On 2026-07-28 it destroyed a
 * developer's local data, and the guard added in response demanded that
 * Servers/.env.test exist — which is not the invariant. CI has no .env.test and
 * no .env at all; it injects DB_* directly, and a file-existence check fails
 * there while proving nothing about which database is about to be truncated.
 *
 * These tests pin the invariant itself: refuse when the target database is the
 * one Servers/.env names, or when there is no target at all.
 */

import { describe, expect, it, jest } from "@jest/globals";
import path from "node:path";

const {
  assertConnectionIsTestDatabase,
  assertSafeTestDatabase,
  assertSafeToTruncate,
  checkDatabaseName,
  installConnectionGuard,
  isTestDatabaseName,
} = require("../testDatabaseGuard");

const envTestPath = "/repo/Servers/.env.test";

describe("assertSafeTestDatabase", () => {
  it("refuses when no database is named at all", () => {
    expect(() =>
      assertSafeTestDatabase({ dbName: undefined, devDbName: "verifywise", envTestPath }),
    ).toThrow(/DB_NAME/);
  });

  it("refuses when the target is the database Servers/.env names", () => {
    expect(() =>
      assertSafeTestDatabase({ dbName: "verifywise", devDbName: "verifywise", envTestPath }),
    ).toThrow(/same database/i);
  });

  it("names .env.test in the message when the file is absent, so the local fix is obvious", () => {
    expect(() =>
      assertSafeTestDatabase({
        dbName: "verifywise",
        devDbName: "verifywise",
        envTestPath,
        source: ".env",
        envTestExists: false,
      }),
    ).toThrow(/because \/repo\/Servers\/\.env\.test does not exist\. Create it with DB_NAME=/);
  });

  it("allows a dedicated test database alongside a development .env", () => {
    expect(() =>
      assertSafeTestDatabase({
        dbName: "verifywise_test",
        devDbName: "verifywise",
        envTestPath,
        envTestExists: true,
      }),
    ).not.toThrow();
  });

  it("allows CI, where there is no development .env to protect", () => {
    expect(() =>
      assertSafeTestDatabase({
        dbName: "verifywise_test",
        devDbName: undefined,
        envTestPath,
        envTestExists: false,
      }),
    ).not.toThrow();
  });

  it("still refuses in CI if the injected name somehow matches the dev database", () => {
    expect(() =>
      assertSafeTestDatabase({
        dbName: "verifywise",
        devDbName: "verifywise",
        envTestPath,
        envTestExists: false,
      }),
    ).toThrow();
  });
});

/**
 * The last line of defence: cleanupDatabase() asks Postgres which database it
 * is connected to and checks that name right before truncating. It holds no
 * matter how jest was started — on 2026-10-15 a plain `npx jest reporting`
 * matched an integration file, skipped globalSetup and truncated the
 * development database.
 */
describe("assertSafeToTruncate", () => {
  it("refuses the database Servers/.env names", () => {
    expect(() =>
      assertSafeToTruncate({ currentDb: "verifywise_test", devDbName: "verifywise_test" }),
    ).toThrow(/Servers\/\.env/);
  });

  it("refuses a database whose name does not mark it as a test database", () => {
    expect(() => assertSafeToTruncate({ currentDb: "verifywise", devDbName: undefined })).toThrow(
      /"test"/,
    );
  });

  it("refuses when the connected database is unknown", () => {
    expect(() => assertSafeToTruncate({ currentDb: undefined, devDbName: "verifywise" })).toThrow(
      /Refusing to truncate/,
    );
  });

  it("allows a dedicated test database", () => {
    expect(() =>
      assertSafeToTruncate({ currentDb: "verifywise_mrm_test", devDbName: "verifywise" }),
    ).not.toThrow();
  });

  it("allows CI's test database, where there is no Servers/.env", () => {
    expect(() =>
      assertSafeToTruncate({ currentDb: "verifywise_test", devDbName: undefined }),
    ).not.toThrow();
  });
});

describe("isTestDatabaseName", () => {
  // Local names, plus every DB_NAME the CI and E2E workflows use (all
  // verifywise_test in .github/workflows/*.yml at the time of writing).
  it.each([
    "verifywise_test",
    "verifywise_tests",
    "verifywise_test2",
    "verifywise_mrm_test",
    "verifywise_jira_test",
    "test_verifywise",
    "tests_verifywise",
    "VerifyWise_TEST",
    "test",
    "app-test-db",
  ])("accepts %s", (name) => {
    expect(isTestDatabaseName(name)).toBe(true);
  });

  it.each([
    "verifywise",
    "verifywise_attestations",
    "latest",
    "contest_app",
    "verifywise_testing_prod",
    "verifywisetest",
    "vw_testdb",
  ])("rejects %s", (name) => {
    expect(isTestDatabaseName(name)).toBe(false);
  });
});

/**
 * globalSetup (before build and migrations) and the connection checks apply
 * one rule, so a name globalSetup lets through is never refused later, and the
 * reverse.
 */
describe("one policy for globalSetup and the connection checks", () => {
  const cases: [string | undefined, string | undefined, string | null][] = [
    [undefined, "verifywise", "unnamed"],
    ["", "verifywise", "blank"],
    ["   ", undefined, "blank"],
    ["verifywise_test", "verifywise_test", "development"],
    ["verifywise", undefined, "not-test"],
    ["verifywise_attestations", "verifywise", "not-test"],
    ["verifywise_mrm_test", "verifywise", null],
  ];

  it.each(cases)("DB %s with dev DB %s -> %s", (name, devDbName, reason) => {
    expect(checkDatabaseName({ name, devDbName })).toBe(reason);
    const setup = () => assertSafeTestDatabase({ dbName: name, devDbName, envTestPath });
    const connection = () => assertSafeToTruncate({ currentDb: name, devDbName });
    if (reason) {
      expect(setup).toThrow();
      expect(connection).toThrow();
    } else {
      expect(setup).not.toThrow();
      expect(connection).not.toThrow();
    }
  });
});

/**
 * The refusal says where the bad DB_NAME came from (loadEnv records it) and
 * gives the fix for that place.
 */
describe("fix advice by DB_NAME source", () => {
  const refuse = (source: string | undefined, envTestExists = true) => {
    try {
      assertSafeTestDatabase({
        dbName: "verifywise",
        devDbName: "verifywise",
        envTestPath,
        source,
        envTestExists,
      });
    } catch (error) {
      return (error as Error).message;
    }
    throw new Error("expected a refusal");
  };

  it("exported: unset it or export a test database", () => {
    expect(refuse("environment")).toMatch(/exported in the environment[\s\S]*unset DB_NAME/);
  });

  it(".env.test: change it there", () => {
    expect(refuse(".env.test")).toMatch(
      /comes from \/repo\/Servers\/\.env\.test\. Change it there/,
    );
  });

  it(".env with a .env.test lacking DB_NAME: add it", () => {
    expect(refuse(".env")).toMatch(/does not set DB_NAME\. Add DB_NAME=verifywise_test/);
  });

  it("not set anywhere", () => {
    expect(() =>
      assertSafeTestDatabase({ dbName: undefined, devDbName: undefined, envTestPath }),
    ).toThrow(/neither \/repo\/Servers\/\.env\.test nor Servers\/\.env sets it/);
  });
});

/**
 * An exported empty DB_NAME survives dotenv (it never overrides), and pg then
 * connects to the database named after DB_USER, so it must be refused rather
 * than treated as unset.
 */
describe("blank DB_NAME", () => {
  it.each(["", "  "])("globalSetup refuses %j with a clear message", (dbName) => {
    expect(() =>
      assertSafeTestDatabase({
        dbName,
        devDbName: "verifywise",
        envTestPath,
        source: "environment",
      }),
    ).toThrow(/DB_NAME is set but empty[\s\S]*exported in the environment/);
  });
});

function connectionTo(name: string | undefined) {
  return {
    query: jest.fn(async (_sql: string) => ({ rows: [{ name }] })),
    end: jest.fn(async () => undefined),
  };
}

/** db.ts's afterConnect hook under jest.integration.config.js. */
describe("assertConnectionIsTestDatabase", () => {
  it("closes a refused connection before throwing", async () => {
    const connection = connectionTo("latest");

    await expect(assertConnectionIsTestDatabase(connection)).rejects.toThrow(
      /Refusing to truncate "latest"/,
    );
    expect(connection.end).toHaveBeenCalledTimes(1);
  });

  it("keeps the refusal when closing fails", async () => {
    const connection = connectionTo("contest_app");
    connection.end.mockRejectedValue(new Error("socket already closed"));

    await expect(assertConnectionIsTestDatabase(connection)).rejects.toThrow(/Refusing/);
  });

  it("closes the connection when the lookup itself fails", async () => {
    const connection = connectionTo(undefined);
    connection.query.mockRejectedValue(new Error("boom"));

    await expect(assertConnectionIsTestDatabase(connection)).rejects.toThrow("boom");
    expect(connection.end).toHaveBeenCalledTimes(1);
  });

  it("asks every connection, with no cache, and leaves a test database open", async () => {
    const good = connectionTo("verifywise_test2");

    await assertConnectionIsTestDatabase(good);
    await assertConnectionIsTestDatabase(good);

    expect(good.query).toHaveBeenCalledTimes(2);
    expect(good.end).not.toHaveBeenCalled();
  });

  it("is what installConnectionGuard registers as afterConnect", () => {
    const sequelize = { addHook: jest.fn() };

    installConnectionGuard(sequelize);

    expect(sequelize.addHook).toHaveBeenCalledWith(
      "afterConnect",
      "integrationTestDatabaseGuard",
      assertConnectionIsTestDatabase,
    );
  });
});

describe("readDevDbName", () => {
  it("reads Servers/.env from loadEnv's SERVERS_ROOT, so it also works from dist/", () => {
    const readEnvFile = jest.fn((_file: string) => ({ DB_NAME: "dev_db" }));
    jest.isolateModules(() => {
      jest.doMock("../../database/config/loadEnv", () => ({
        readEnvFile,
        SERVERS_ROOT: "/srv/Servers",
      }));
      expect(require("../testDatabaseGuard").readDevDbName()).toBe("dev_db");
    });
    jest.dontMock("../../database/config/loadEnv");

    expect(readEnvFile).toHaveBeenCalledWith(path.join("/srv/Servers", ".env"));
  });
});
