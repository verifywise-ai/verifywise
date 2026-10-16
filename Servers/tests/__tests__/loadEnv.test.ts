/**
 * Under NODE_ENV=test the environment is resolved as: exported variables >
 * Servers/.env.test > Servers/.env. Loading .env.test with override (as the
 * first version of this fix did) clobbered every exported variable, including
 * an explicit `DB_NAME=... npx jest`.
 */

import { afterEach, beforeEach, describe, expect, it } from "@jest/globals";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const { loadEnv } = require("../../database/config/loadEnv");

const KEYS = ["GUARD_T_EXPORTED", "GUARD_T_BOTH", "GUARD_T_DEV_ONLY", "GUARD_T_TEST_ONLY"];

describe("loadEnv", () => {
  let dir: string;
  let saved: Record<string, string | undefined>;

  beforeEach(() => {
    saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));
    for (const k of KEYS) delete process.env[k];
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "loadenv-"));
    fs.writeFileSync(
      path.join(dir, ".env"),
      "GUARD_T_EXPORTED=from_env\nGUARD_T_BOTH=from_env\nGUARD_T_DEV_ONLY=from_env\n",
    );
    fs.writeFileSync(
      path.join(dir, ".env.test"),
      "GUARD_T_EXPORTED=from_env_test\nGUARD_T_BOTH=from_env_test\nGUARD_T_TEST_ONLY=from_env_test\n",
    );
  });

  afterEach(() => {
    for (const k of KEYS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("under NODE_ENV=test: exported > .env.test > .env", () => {
    process.env.GUARD_T_EXPORTED = "exported";

    const result = loadEnv({ nodeEnv: "test", serversRoot: dir });

    expect(result).toEqual({ envTestPath: path.join(dir, ".env.test"), envTestLoaded: true });
    expect(process.env.GUARD_T_EXPORTED).toBe("exported");
    expect(process.env.GUARD_T_BOTH).toBe("from_env_test");
    expect(process.env.GUARD_T_TEST_ONLY).toBe("from_env_test");
    expect(process.env.GUARD_T_DEV_ONLY).toBe("from_env");
  });

  it("reports a missing .env.test and falls back to .env", () => {
    fs.rmSync(path.join(dir, ".env.test"));

    const result = loadEnv({ nodeEnv: "test", serversRoot: dir });

    expect(result.envTestLoaded).toBe(false);
    expect(process.env.GUARD_T_BOTH).toBe("from_env");
  });

  it("ignores .env.test outside NODE_ENV=test", () => {
    const cwd = process.cwd();
    process.chdir(dir);
    try {
      loadEnv({ nodeEnv: "development", serversRoot: dir });
    } finally {
      process.chdir(cwd);
    }

    expect(process.env.GUARD_T_BOTH).toBe("from_env");
    expect(process.env.GUARD_T_TEST_ONLY).toBeUndefined();
  });
});
