import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  bandFor,
  combineScore,
  isBandAllowed,
  lowestAllowedBand,
  median,
  ruleMinimumFor,
} from "../scoreMath";

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURE = resolve(
  HERE,
  "../../../../../../Servers/services/intakeScoring/__fixtures__/scoreMathCases.json",
);

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
