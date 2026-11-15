import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  QUEUED_QUIET_MS,
  SERVER_LOOP_STEP_TIMEOUT_MS,
  SERVER_LOOP_TOTAL_TIMEOUT_MS,
  SERVER_STALE_RUN_MINUTES,
  TURN_QUIET_MS,
} from "../useVendorResearch";

// The polling windows of a research run are made of bounds of the server, which the client copies
// by value because it cannot import the server's code. Read here from the server's source, so that
// a change there fails this test until the copy follows. node:path, as the other tests that read a
// server file do: Vite refuses `new URL(..., import.meta.url)` for such a path.
const SERVERS = resolve(dirname(fileURLToPath(import.meta.url)), "../../../../../Servers");
const source = (path: string) => readFileSync(resolve(SERVERS, path), "utf8");

/** The number a pattern captures, with the digit separators taken out. */
const numberIn = (text: string, pattern: RegExp): number => {
  const match = pattern.exec(text);
  if (match === null) throw new Error(`not found: ${pattern}`);
  return Number(match[1].replace(/_/g, ""));
};

describe("the bounds of the server that the polling of a run is made of", () => {
  it("copies how long the server lets a run stay queued", () => {
    const utils = source("utils/vendorResearch.utils.ts");
    expect(SERVER_STALE_RUN_MINUTES).toBe(
      numberIn(utils, /export const STALE_RUN_MINUTES = ([\d_]+);/),
    );
  });

  it("copies the deadlines of the research loop", () => {
    const loop = source("services/webResearch/researchLoop.ts");
    const limits = /export const LOOP_LIMITS: LoopLimits = \{([^}]*)\}/.exec(loop);
    expect(limits).not.toBeNull();
    expect(SERVER_LOOP_STEP_TIMEOUT_MS).toBe(numberIn(limits![1], /stepTimeoutMs: ([\d_]+),/));
    expect(SERVER_LOOP_TOTAL_TIMEOUT_MS).toBe(numberIn(limits![1], /totalTimeoutMs: ([\d_]+),/));
  });

  it("follows a queued run for longer than the server lets it stay queued", () => {
    expect(QUEUED_QUIET_MS).toBeGreaterThan(SERVER_STALE_RUN_MINUTES * 60_000);
  });

  it("follows a run in its loop for a turn of the model and the search or read after it", () => {
    expect(TURN_QUIET_MS).toBe(SERVER_LOOP_STEP_TIMEOUT_MS + SERVER_LOOP_TOTAL_TIMEOUT_MS);
  });
});
