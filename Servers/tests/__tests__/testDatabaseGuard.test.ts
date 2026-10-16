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

import { describe, expect, it } from "@jest/globals";

const {
  assertSafeTestDatabase,
  assertSafeToTruncate,
  checkDatabaseName,
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
        hasEnvTest: false,
      }),
    ).toThrow(/\.env\.test/);
  });

  it("allows a dedicated test database alongside a development .env", () => {
    expect(() =>
      assertSafeTestDatabase({
        dbName: "verifywise_test",
        devDbName: "verifywise",
        envTestPath,
        hasEnvTest: true,
      }),
    ).not.toThrow();
  });

  it("allows CI, where there is no development .env to protect", () => {
    expect(() =>
      assertSafeTestDatabase({
        dbName: "verifywise_test",
        devDbName: undefined,
        envTestPath,
        hasEnvTest: false,
      }),
    ).not.toThrow();
  });

  it("still refuses in CI if the injected name somehow matches the dev database", () => {
    expect(() =>
      assertSafeTestDatabase({
        dbName: "verifywise",
        devDbName: "verifywise",
        envTestPath,
        hasEnvTest: false,
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
    "verifywise_mrm_test",
    "verifywise_jira_test",
    "test_verifywise",
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
