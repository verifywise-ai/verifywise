import { describe, expect, it } from "vitest";
import { estimateProgress, remainingLabel } from "../estimate";
import { FIRST_LINE_DELAY_MS, LINES, STEP_MS, lineIndexAt } from "../committee";

const MINUTE = 60_000;

describe("estimateProgress", () => {
  it("starts at zero and handles bad input", () => {
    expect(estimateProgress(0, MINUTE)).toBe(0);
    expect(estimateProgress(-5, MINUTE)).toBe(0);
    expect(estimateProgress(1000, 0)).toBe(0);
    expect(estimateProgress(Number.NaN, MINUTE)).toBe(0);
  });

  it("only ever moves forward", () => {
    let last = 0;
    for (let t = 0; t <= 5 * MINUTE; t += 500) {
      const p = estimateProgress(t, MINUTE);
      expect(p).toBeGreaterThanOrEqual(last);
      last = p;
    }
  });

  it("reaches 90% at the expected time", () => {
    expect(estimateProgress(MINUTE, MINUTE)).toBeCloseTo(0.9, 5);
  });

  it("never claims to be done before the request is", () => {
    expect(estimateProgress(60 * MINUTE, MINUTE)).toBeLessThanOrEqual(0.97);
  });
});

describe("remainingLabel", () => {
  it("counts down in fixed phrases", () => {
    expect(remainingLabel(0, 3 * MINUTE)).toBe("A couple of minutes left");
    expect(remainingLabel(0, MINUTE)).toBe("About a minute left");
    expect(remainingLabel(20_000, MINUTE)).toBe("Less than a minute left");
    expect(remainingLabel(35_000, MINUTE)).toBe("About 30 seconds left");
    expect(remainingLabel(50_000, MINUTE)).toBe("A few seconds left");
    expect(remainingLabel(58_000, MINUTE)).toBe("Almost there");
    expect(remainingLabel(5 * MINUTE, MINUTE)).toBe("Almost there");
  });
});

describe("lineIndexAt", () => {
  it("waits for the cast before the first line, then steps and loops", () => {
    expect(lineIndexAt(0)).toBe(-1);
    expect(lineIndexAt(FIRST_LINE_DELAY_MS)).toBe(0);
    expect(lineIndexAt(FIRST_LINE_DELAY_MS + STEP_MS)).toBe(1);
    expect(lineIndexAt(FIRST_LINE_DELAY_MS + STEP_MS * LINES.length)).toBe(0);
  });
});
