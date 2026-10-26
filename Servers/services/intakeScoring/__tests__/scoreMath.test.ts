// Servers/services/intakeScoring/__tests__/scoreMath.test.ts
import { describe, it, expect } from "@jest/globals";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  bandFor,
  bandOfTier,
  combineScore,
  isBandAllowed,
  lowestAllowedBand,
  median,
  ruleMinimumFor,
} from "../scoreMath";

const FIXTURE = join(__dirname, "../__fixtures__/scoreMathCases.json");

const cases = JSON.parse(readFileSync(FIXTURE, "utf8")) as Array<{
  ruleMinimum: number | null;
  aiMedian: number | null;
  finalScore: number | null;
  source: string | null;
  rulesOnly: boolean;
}>;

describe("combineScore", () => {
  it.each(cases)("min $ruleMinimum / ai $aiMedian", ({ ruleMinimum, aiMedian, ...expected }) => {
    expect(combineScore({ ruleMinimum, aiMedian })).toEqual(expected);
  });
});

describe("ruleMinimumFor", () => {
  it("maps levels and null", () => {
    expect(ruleMinimumFor("Prohibited")).toBe(90);
    expect(ruleMinimumFor("High risk")).toBe(70);
    expect(ruleMinimumFor("Limited risk")).toBe(30);
    expect(ruleMinimumFor("Minimal risk")).toBe(0);
    expect(ruleMinimumFor("Out of scope")).toBe(0);
    expect(ruleMinimumFor(null)).toBeNull();
  });
});

describe("bandFor", () => {
  it("uses the band edges", () => {
    expect(bandFor(0)).toBe("Low");
    expect(bandFor(25)).toBe("Low");
    expect(bandFor(26)).toBe("Medium");
    expect(bandFor(50)).toBe("Medium");
    expect(bandFor(51)).toBe("High");
    expect(bandFor(75)).toBe("High");
    expect(bandFor(76)).toBe("Critical");
    expect(bandFor(100)).toBe("Critical");
  });
});

describe("median", () => {
  it("handles even and odd lengths", () => {
    expect(median([10, 20, 30, 40])).toBe(25);
    expect(median([60, 62, 71, 65, 70])).toBe(65);
    expect(median([10, 21])).toBe(16);
  });
});

describe("band floor", () => {
  it("never allows a band below the rule minimum", () => {
    expect(isBandAllowed("High", 90)).toBe(false);
    expect(isBandAllowed("Critical", 90)).toBe(true);
    expect(isBandAllowed("Low", null)).toBe(true);
    expect(lowestAllowedBand(30)).toBe("Medium");
    expect(lowestAllowedBand(null)).toBe("Low");
  });
});

describe("bandOfTier", () => {
  it("keeps bands and maps pre-v2 tiers to the band with the same scores", () => {
    expect(bandOfTier("High")).toBe("High");
    expect(bandOfTier("Minimal")).toBe("Low");
    expect(bandOfTier("Limited")).toBe("Medium");
    expect(bandOfTier("Unacceptable")).toBe("Critical");
    expect(bandOfTier("Extreme")).toBeNull();
    expect(bandOfTier("toString")).toBeNull();
    expect(bandOfTier(undefined)).toBeNull();
  });
});
