import {
  adoptionLevelLabel,
  adoptionSummaryLabel,
  summarizeAdoptionLevels,
} from "../adoptionLevel";

describe("adoptionLevel", () => {
  it("labels a level with its index name", () => {
    expect(adoptionLevelLabel(3)).toBe("3: Managed");
    expect(adoptionLevelLabel(null)).toBe("Not assessed");
    expect(adoptionLevelLabel(6)).toBe("Not assessed");
  });

  describe("summarizeAdoptionLevels", () => {
    it("counts assessed domains and takes the lowest and highest level", () => {
      expect(summarizeAdoptionLevels([2, null, 4, 3])).toEqual({
        assessed: 3,
        total: 4,
        min: 2,
        max: 4,
      });
    });

    it("treats level 0 as assessed", () => {
      expect(summarizeAdoptionLevels([0, null])).toEqual({ assessed: 1, total: 2, min: 0, max: 0 });
    });

    it("ignores values outside 0-5 and non-integers", () => {
      expect(summarizeAdoptionLevels([7, -1, 2.5, undefined, 1])).toEqual({
        assessed: 1,
        total: 5,
        min: 1,
        max: 1,
      });
    });

    it("has no range when nothing is assessed", () => {
      expect(summarizeAdoptionLevels([null, null])).toEqual({
        assessed: 0,
        total: 2,
        min: null,
        max: null,
      });
      expect(summarizeAdoptionLevels([])).toEqual({ assessed: 0, total: 0, min: null, max: null });
    });
  });

  describe("adoptionSummaryLabel", () => {
    it("shows a range when levels differ", () => {
      expect(adoptionSummaryLabel({ assessed: 2, total: 3, min: 2, max: 4 })).toBe(
        "2 of 3 domains assessed · levels 2 to 4",
      );
    });

    it("shows one level when all assessed domains share it", () => {
      expect(adoptionSummaryLabel({ assessed: 2, total: 2, min: 3, max: 3 })).toBe(
        "2 of 2 domains assessed · level 3",
      );
    });

    it("shows only the count when nothing is assessed", () => {
      expect(adoptionSummaryLabel({ assessed: 0, total: 1, min: null, max: null })).toBe(
        "0 of 1 domain assessed",
      );
    });
  });
});
