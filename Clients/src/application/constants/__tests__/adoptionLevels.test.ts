import { describe, expect, it } from "vitest";
import { adoptionLevelRowLabel, summarizeAdoptionLevels } from "../adoptionLevels";

describe("adoptionLevels", () => {
  it("labels a valid level and rejects others", () => {
    expect(adoptionLevelRowLabel(0)).toBe("Level 0");
    expect(adoptionLevelRowLabel(6)).toBeNull();
    expect(adoptionLevelRowLabel(null)).toBeNull();
  });

  it("summarizes assessed domains with their lowest and highest level", () => {
    expect(summarizeAdoptionLevels([2, null, 4, 3])).toEqual({
      assessed: 3,
      total: 4,
      min: 2,
      max: 4,
    });
  });

  it("counts level 0 and ignores out-of-range values", () => {
    expect(summarizeAdoptionLevels([0, 9, 1.5, undefined])).toEqual({
      assessed: 1,
      total: 4,
      min: 0,
      max: 0,
    });
  });

  it("has no range when nothing is assessed", () => {
    expect(summarizeAdoptionLevels([null])).toEqual({
      assessed: 0,
      total: 1,
      min: null,
      max: null,
    });
  });
});
