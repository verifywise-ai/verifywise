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

const { assertSafeTestDatabase } = require("../testDatabaseGuard");

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
