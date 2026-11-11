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

import { afterAll, describe, expect, it } from "@jest/globals";
import fs from "fs";
import os from "os";
import path from "path";

const {
  assertSafeTestDatabase,
  assertSafeIntegrationRun,
  assertConnectedDatabaseIsNotDev,
  effectiveDatabaseName,
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

describe("the guard of a plain `npx jest <pattern>` run", () => {
  const made: string[] = [];
  /** A Servers directory with the given dotenv files, written with synthetic names. */
  const serversWith = (files: Record<string, string>): string => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vw-guard-"));
    made.push(dir);
    for (const [name, text] of Object.entries(files)) fs.writeFileSync(path.join(dir, name), text);
    return dir;
  };
  afterAll(() => {
    for (const dir of made) fs.rmSync(dir, { recursive: true, force: true });
  });

  const integrationFile = path.join("/repo", "Servers", "tests", "integration", "login.test.ts");
  const unitFile = path.join("/repo", "Servers", "services", "__tests__", "x.test.ts");

  it("refuses an integration file whose database is the one Servers/.env names", () => {
    const serversDir = serversWith({ ".env": "DB_NAME=zz_dev_database\nDB_HOST=db.example\n" });
    // Nothing exported: database/db.ts loads Servers/.env, so the dev database is the target.
    expect(() =>
      assertSafeIntegrationRun({ testPath: integrationFile, env: {}, serversDir }),
    ).toThrow(/same database/i);
    expect(() =>
      assertSafeIntegrationRun({
        testPath: integrationFile,
        env: { DB_NAME: "zz_dev_database" },
        serversDir,
      }),
    ).toThrow(/same database/i);
  });

  it("allows an integration file on a dedicated database, however it is named", () => {
    const serversDir = serversWith({ ".env": "DB_NAME=zz_dev_database\n" });
    expect(() =>
      assertSafeIntegrationRun({
        testPath: integrationFile,
        env: { DB_NAME: "zz_integration_test" },
        serversDir,
      }),
    ).not.toThrow();
  });

  it("reads Servers/.env.test as database/db.ts does when NODE_ENV is test", () => {
    const serversDir = serversWith({
      ".env": "DB_NAME=zz_dev_database\n",
      ".env.test": "DB_NAME=zz_dedicated\n",
    });
    expect(effectiveDatabaseName({ NODE_ENV: "test" }, serversDir)).toBe("zz_dedicated");
    expect(effectiveDatabaseName({ NODE_ENV: "development" }, serversDir)).toBe("zz_dev_database");
    expect(() =>
      assertSafeIntegrationRun({
        testPath: integrationFile,
        env: { NODE_ENV: "test" },
        serversDir,
      }),
    ).not.toThrow();
  });

  it("does not look at a test file outside tests/integration", () => {
    const serversDir = serversWith({ ".env": "DB_NAME=zz_dev_database\n" });
    expect(() =>
      assertSafeIntegrationRun({ testPath: unitFile, env: {}, serversDir }),
    ).not.toThrow();
  });

  it("allows CI, where no database is named in a file and the environment names one", () => {
    const serversDir = serversWith({});
    expect(() =>
      assertSafeIntegrationRun({
        testPath: integrationFile,
        env: { DB_NAME: "verifywise_test" },
        serversDir,
      }),
    ).not.toThrow();
    // A file that reaches no database at all has nothing to protect.
    expect(() =>
      assertSafeIntegrationRun({ testPath: integrationFile, env: {}, serversDir }),
    ).not.toThrow();
  });

  it("refuses to truncate a connection that is on the database of Servers/.env", () => {
    const serversDir = serversWith({ ".env": "DB_NAME=zz_dev_database\n" });
    expect(() =>
      assertConnectedDatabaseIsNotDev({ connectedDbName: "zz_dev_database", serversDir }),
    ).toThrow(/same database/i);
    expect(() =>
      assertConnectedDatabaseIsNotDev({ connectedDbName: undefined, serversDir }),
    ).toThrow(/DB_NAME/);
    expect(() =>
      assertConnectedDatabaseIsNotDev({ connectedDbName: "zz_integration_test", serversDir }),
    ).not.toThrow();
  });
});
