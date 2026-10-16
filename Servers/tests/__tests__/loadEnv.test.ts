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
const { loadEnv } = require("../../database/config/loadEnv");

describe("loadEnv", () => {
  let dir: string;
  let snapshot: NodeJS.ProcessEnv;

  beforeEach(() => {
    snapshot = { ...process.env };
    for (const k of [
      "GUARD_T_EXPORTED",
      "GUARD_T_BOTH",
      "GUARD_T_DEV_ONLY",
      "GUARD_T_TEST_ONLY",
      "DB_NAME",
    ]) {
      delete process.env[k];
    }
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
    for (const key of Object.keys(process.env)) if (!(key in snapshot)) delete process.env[key];
    Object.assign(process.env, snapshot);
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

    expect(result).toMatchObject({ envTestLoaded: false, dbNameSource: ".env" });
    expect(process.env.DB_NAME).toBe("dev_db");
  });

  it("records an exported DB_NAME as coming from the environment", () => {
    process.env.DB_NAME = "exported_test";

    expect(loadEnv({ nodeEnv: "test", serversRoot: dir }).dbNameSource).toBe("environment");
    expect(process.env.DB_NAME).toBe("exported_test");
  });

  it("keeps an exported empty DB_NAME (as pg will see it) and reports it as exported", () => {
    process.env.DB_NAME = "";

    expect(loadEnv({ nodeEnv: "test", serversRoot: dir }).dbNameSource).toBe("environment");
    expect(process.env.DB_NAME).toBe("");
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
  });

  describe("with dotenv.config mocked", () => {
    const config = jest.fn((_options?: unknown) => ({ parsed: {} }));
    let fresh: { loadEnv: (options?: Record<string, unknown>) => unknown };

    beforeEach(() => {
      config.mockClear();
      jest.isolateModules(() => {
        jest.doMock("dotenv", () => ({ ...dotenv, config }));
        fresh = require("../../database/config/loadEnv");
      });
    });

    afterEach(() => {
      jest.dontMock("dotenv");
    });

    it("outside NODE_ENV=test calls dotenv like `dotenv/config` did: cwd .env, quiet", () => {
      delete process.env.DOTENV_QUIET;
      delete process.env.DOTENV_CONFIG_QUIET;

      fresh.loadEnv({ nodeEnv: "production", serversRoot: dir });

      expect(config).toHaveBeenCalledTimes(1);
      expect(config).toHaveBeenCalledWith({ quiet: true });
    });

    it("is idempotent: a repeat call with the same options loads nothing", () => {
      const first = fresh.loadEnv({ nodeEnv: "test", serversRoot: dir });

      expect(fresh.loadEnv({ nodeEnv: "test", serversRoot: dir })).toBe(first);
      expect(config).toHaveBeenCalledTimes(2); // .env.test and .env, once
    });
  });
});
