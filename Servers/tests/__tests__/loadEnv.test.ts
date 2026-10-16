/**
 * Under NODE_ENV=test the environment is resolved as: exported variables >
 * Servers/.env.test > Servers/.env. Loading .env.test with override (as the
 * first version of this fix did) clobbered every exported variable, including
 * an explicit `DB_NAME=... npx jest`.
 *
 * Hermetic: every call points loadEnv at a temp directory (serversRoot /
 * cwdEnvPath), never at the real working directory or Servers/, and the whole
 * process.env is restored after each test.
 */

import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const dotenv = require("dotenv");
const { loadEnv, resolveTestDbName, SOURCE_MARKER } = require("../../database/config/loadEnv");

const KEYS = ["GUARD_T_EXPORTED", "GUARD_T_BOTH", "GUARD_T_DEV_ONLY", "GUARD_T_TEST_ONLY"];

/** Run `fn` against a fresh loadEnv whose dotenv.config loads nothing; returns that mock. */
function withMockedDotenv(
  fn: (fresh: { loadEnv: (options?: Record<string, unknown>) => unknown }) => void,
) {
  const config = jest.fn((_options?: unknown) => ({ parsed: {} }));
  jest.isolateModules(() => {
    jest.doMock("dotenv", () => ({ ...dotenv, config }));
    fn(require("../../database/config/loadEnv"));
  });
  jest.dontMock("dotenv");
  return config;
}

function restoreEnv(snapshot: NodeJS.ProcessEnv) {
  for (const key of Object.keys(process.env)) {
    if (!(key in snapshot)) delete process.env[key];
  }
  Object.assign(process.env, snapshot);
}

describe("loadEnv", () => {
  let dir: string;
  let snapshot: NodeJS.ProcessEnv;

  beforeEach(() => {
    snapshot = { ...process.env };
    for (const k of [...KEYS, "DB_NAME", SOURCE_MARKER]) delete process.env[k];
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "loadenv-"));
    fs.writeFileSync(
      path.join(dir, ".env"),
      "GUARD_T_EXPORTED=from_env\nGUARD_T_BOTH=from_env\nGUARD_T_DEV_ONLY=from_env\nDB_NAME=dev_db\n",
    );
    fs.writeFileSync(
      path.join(dir, ".env.test"),
      "GUARD_T_EXPORTED=from_env_test\nGUARD_T_BOTH=from_env_test\nGUARD_T_TEST_ONLY=from_env_test\nDB_NAME=dev_test\n",
    );
  });

  afterEach(() => {
    jest.restoreAllMocks();
    restoreEnv(snapshot);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("under NODE_ENV=test: exported > .env.test > .env", () => {
    process.env.GUARD_T_EXPORTED = "exported";

    const result = loadEnv({ nodeEnv: "test", serversRoot: dir });

    expect(result).toEqual({
      envTestPath: path.join(dir, ".env.test"),
      envTestLoaded: true,
      dbNameSource: ".env.test",
    });
    expect(process.env.GUARD_T_EXPORTED).toBe("exported");
    expect(process.env.GUARD_T_BOTH).toBe("from_env_test");
    expect(process.env.GUARD_T_TEST_ONLY).toBe("from_env_test");
    expect(process.env.GUARD_T_DEV_ONLY).toBe("from_env");
  });

  it("reports a missing .env.test and falls back to .env", () => {
    fs.rmSync(path.join(dir, ".env.test"));

    const result = loadEnv({ nodeEnv: "test", serversRoot: dir });

    expect(result.envTestLoaded).toBe(false);
    expect(result.dbNameSource).toBe(".env");
    expect(process.env.GUARD_T_BOTH).toBe("from_env");
    expect(process.env.DB_NAME).toBe("dev_db");
  });

  it("records an exported DB_NAME as coming from the environment", () => {
    process.env.DB_NAME = "exported_test";

    expect(loadEnv({ nodeEnv: "test", serversRoot: dir }).dbNameSource).toBe("environment");
    expect(process.env.DB_NAME).toBe("exported_test");
  });

  it("ignores .env.test outside NODE_ENV=test and loads only the given .env", () => {
    const result = loadEnv({
      nodeEnv: "development",
      serversRoot: dir,
      cwdEnvPath: path.join(dir, ".env"),
    });

    expect(result.dbNameSource).toBeUndefined();
    expect(process.env.GUARD_T_BOTH).toBe("from_env");
    expect(process.env.GUARD_T_TEST_ONLY).toBeUndefined();
    expect(process.env[SOURCE_MARKER]).toBeUndefined();
  });

  it("outside NODE_ENV=test calls dotenv like `dotenv/config` did: cwd .env, quiet", () => {
    delete process.env.DOTENV_QUIET;
    delete process.env.DOTENV_CONFIG_QUIET;

    const config = withMockedDotenv((fresh) => fresh.loadEnv({ nodeEnv: "production" }));

    expect(config).toHaveBeenCalledTimes(1);
    expect(config).toHaveBeenCalledWith({ quiet: true });
  });

  it("is idempotent: a second call without options loads nothing", () => {
    const config = withMockedDotenv((fresh) => {
      const first = fresh.loadEnv();
      expect(fresh.loadEnv()).toBe(first);
    });

    const callsForOneLoad = process.env.NODE_ENV === "test" ? 2 : 1;
    expect(config).toHaveBeenCalledTimes(callsForOneLoad);
  });

  it("hands the source to child processes, so a worker does not report it as exported", () => {
    loadEnv({ nodeEnv: "test", serversRoot: dir });
    const childEnv = { ...process.env };

    expect(resolveTestDbName({ env: childEnv, serversRoot: dir })).toMatchObject({
      dbName: "dev_test",
      source: ".env.test",
    });
  });

  it("does not trust a stale source record once DB_NAME has changed", () => {
    loadEnv({ nodeEnv: "test", serversRoot: dir });
    const childEnv = { ...process.env, DB_NAME: "someone_exported_this" };

    expect(resolveTestDbName({ env: childEnv, serversRoot: dir }).source).toBe("environment");
  });
});

describe("resolveTestDbName", () => {
  let dir: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "resolvedb-"));
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it.each([
    ["exported wins", { DB_NAME: "x_test" }, "a_test", "dev", "x_test", "environment"],
    [".env.test beats .env", {}, "a_test", "dev", "a_test", ".env.test"],
    [".env when .env.test has no DB_NAME", {}, undefined, "dev", "dev", ".env"],
    ["nothing anywhere", {}, undefined, undefined, undefined, undefined],
  ])("%s", (_label, env, envTestDb, envDb, dbName, source) => {
    fs.writeFileSync(path.join(dir, ".env.test"), envTestDb ? `DB_NAME=${envTestDb}\n` : "X=1\n");
    if (envDb) fs.writeFileSync(path.join(dir, ".env"), `DB_NAME=${envDb}\n`);

    expect(resolveTestDbName({ env, serversRoot: dir })).toMatchObject({
      dbName,
      source,
      envTestExists: true,
    });
  });
});
