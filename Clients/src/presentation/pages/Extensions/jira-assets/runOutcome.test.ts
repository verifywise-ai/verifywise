import { describe, expect, it } from "vitest";
import { isAbandonedRun, isSkippedRun } from "./runOutcome";

describe("run outcome readers", () => {
  it("read the engine status, then the code, never the message", () => {
    expect(isAbandonedRun({ status: "abandoned", code: "abandoned" })).toBe(true);
    expect(isAbandonedRun({ code: "abandoned" })).toBe(true);
    expect(isAbandonedRun({ status: "failed", code: null })).toBe(false);
    expect(isAbandonedRun(null)).toBe(false);
    expect(isSkippedRun({ status: "skipped", code: "skipped" })).toBe(true);
    expect(isSkippedRun({ status: "completed", code: null })).toBe(false);
  });
});
