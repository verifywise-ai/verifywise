import { describe, expect, it } from "vitest";
import { EXPECTED_MS, estimateProgress, remainingLabel } from "../estimate";
import {
  CAST,
  FILLER_LINES,
  FIRST_LINE_DELAY_MS,
  LINES,
  ONE_PASS_MS,
  STEP_MS,
  lineIndexAt,
} from "../committee";

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
    expect(remainingLabel(0)).toBe("A few seconds left");
    expect(remainingLabel(EXPECTED_MS - 6_000)).toBe("A few seconds left");
    expect(remainingLabel(EXPECTED_MS - 4_000)).toBe("Almost there");
    expect(remainingLabel(5 * MINUTE)).toBe("Almost there");
  });
});

describe("expected run time", () => {
  it("is one pass of the committee, 10 to 15 seconds", () => {
    expect(EXPECTED_MS).toBe(ONE_PASS_MS);
    expect(ONE_PASS_MS).toBe(FIRST_LINE_DELAY_MS + CAST.length * STEP_MS);
    expect(ONE_PASS_MS).toBeGreaterThanOrEqual(10_000);
    expect(ONE_PASS_MS).toBeLessThanOrEqual(15_000);
  });

  it("puts the bar at 90% when every animal has spoken once", () => {
    expect(estimateProgress(ONE_PASS_MS)).toBeCloseTo(0.9, 5);
  });
});

describe("lineIndexAt", () => {
  it("waits for the cast before the first line, then steps", () => {
    expect(lineIndexAt(0)).toBe(-1);
    expect(lineIndexAt(FIRST_LINE_DELAY_MS)).toBe(0);
    expect(lineIndexAt(FIRST_LINE_DELAY_MS + STEP_MS)).toBe(1);
  });

  it("plays the script once, then loops the filler instead of starting over", () => {
    const at = (step: number) => lineIndexAt(FIRST_LINE_DELAY_MS + STEP_MS * step);
    expect(at(LINES.length - 1)).toBe(LINES.length - 1);
    expect(at(LINES.length)).toBe(LINES.length);
    expect(at(LINES.length + FILLER_LINES.length)).toBe(LINES.length);
    for (let step = LINES.length; step < LINES.length * 4; step += 1) {
      expect(at(step)).toBeGreaterThanOrEqual(LINES.length);
    }
  });
});
