import { computeCategoryTable } from "./categoryTable";
import { aboveMedian, detectDegenerateMedian, overallMedian } from "./scoringRate";
import { byName, exp } from "./__fixtures__/load";

describe("overallMedian", () => {
  it("matches statistics.median on an even-length sample", () => {
    // Python statistics.median averages the two middle values.
    expect(overallMedian([{ s: 1 }, { s: 2 }, { s: 3 }, { s: 4 }], "s")).toBe(2.5);
  });

  it("returns null when no record carries a score", () => {
    expect(overallMedian([{ s: null }, {}], "s")).toBeNull();
  });
});

describe("scoring rate against the Python oracle", () => {
  it("reproduces scoring_rate_continuous, strictly above the median", () => {
    const c = byName("scoring_rate_continuous");
    const median = overallMedian(c.records, "score")!;
    const table = computeCategoryTable({
      records: c.records,
      categoryKey: "sex",
      categoryLabel: "Sex",
      totalApplicants: c.records.length,
      threshold: 0.8,
      smallSampleExclusion: null,
      rateOf: aboveMedian(median, "score"),
      titlePrefix: "Scoring rate impact ratios",
    });
    const want = exp("scoring_rate_continuous").tables[0];

    expect(table.title).toBe(want.title);
    expect(table.rows.map((r) => r.selectionRate)).toEqual(
      want.rows.map((r: any) => r.selection_rate),
    );
    expect(table.rows.map((r) => r.impactRatio)).toEqual(want.rows.map((r: any) => r.impact_ratio));
  });
  it("reproduces the rounding-half case", () => {
    const c = byName("scoring_rate_rounding_half");
    const median = overallMedian(c.records, "score")!;
    const table = computeCategoryTable({
      records: c.records,
      categoryKey: "sex",
      categoryLabel: "Sex",
      totalApplicants: c.records.length,
      threshold: 0.8,
      smallSampleExclusion: null,
      rateOf: aboveMedian(median, "score"),
      titlePrefix: "Scoring rate impact ratios",
    });
    const want = exp("scoring_rate_rounding_half").tables[0];
    expect(table.rows.map((r) => r.selectionRate)).toEqual(
      want.rows.map((r: any) => r.selection_rate),
    );
    expect(table.rows.map((r) => r.impactRatio)).toEqual(want.rows.map((r: any) => r.impact_ratio));
  });
});

// Review Focus 1
describe("detectDegenerateMedian", () => {
  it("flags a three-level score whose median equals the modal value", () => {
    const c = byName("scoring_rate_median_equals_mode");
    const d = detectDegenerateMedian(c.records, "score")!;

    expect(d).not.toBeNull();
    expect(d.median).toBe(3);
    expect(d.atMedian).toBe(75);
    expect(d.total).toBe(100);
    expect(d.distinctValues).toBe(3);
  });

  it("confirms the arithmetic it is warning about: every rate zero, every ratio null", () => {
    const c = byName("scoring_rate_median_equals_mode");
    const median = overallMedian(c.records, "score")!;
    const table = computeCategoryTable({
      records: c.records,
      categoryKey: "sex",
      categoryLabel: "Sex",
      totalApplicants: c.records.length,
      threshold: 0.8,
      smallSampleExclusion: null,
      rateOf: aboveMedian(median, "score"),
      titlePrefix: "Scoring rate impact ratios",
    });
    const want = exp("scoring_rate_median_equals_mode").tables[0];

    // Matches the Python exactly...
    expect(table.rows.map((r) => r.selectionRate)).toEqual(
      want.rows.map((r: any) => r.selection_rate),
    );
    // ...and that output is all zeros with no ratios, which is why the
    // diagnostic above exists. The Python's own summary for this case reads
    // "No adverse impact flags detected", which a caller must not surface.
    expect(table.rows.every((r) => r.selectionRate === 0)).toBe(true);
    expect(table.rows.every((r) => r.impactRatio === null)).toBe(true);
    expect(exp("scoring_rate_median_equals_mode").summary).toContain(
      "No adverse impact flags detected",
    );
  });

  it("returns null for a continuous score, where the median separates the sample", () => {
    const c = byName("scoring_rate_continuous");
    expect(detectDegenerateMedian(c.records, "score")).toBeNull();
  });

  it("flags a two-value score column", () => {
    const records = [...Array(50)].map((_, i) => ({ score: i < 40 ? 1 : 0 }));
    const d = detectDegenerateMedian(records, "score")!;
    expect(d.distinctValues).toBe(2);
    expect(d.median).toBe(1);
    expect(d.kind).toBe("none_above");
  });

  // The near-degenerate case, which is the more dangerous of the two.
  it("flags a column where a handful clear the median, and says so", () => {
    // 97 at level 1, 3 at level 2. Verified against the Python: this yields
    // Male IR 0.50 FLAGGED and Female IR 1.0, from 1 record against 2.
    const records = [...Array(100)].map((_, i) => ({
      sex: i % 2 ? "Female" : "Male",
      score: i < 3 ? 2 : 1,
    }));
    const d = detectDegenerateMedian(records, "score")!;
    expect(d).not.toBeNull();
    expect(d.kind).toBe("too_few_above");
    expect(d.above).toBe(3);
    expect(d.total).toBe(100);
    expect(d.aboveFraction).toBeCloseTo(0.03, 6);
    expect(d.floor).toBe(0.05);
  });

  it("confirms the near-degenerate arithmetic it is warning about", () => {
    const records = [...Array(100)].map((_, i) => ({
      sex: i % 2 ? "Female" : "Male",
      score: i < 3 ? 2 : 1,
    }));
    const median = overallMedian(records, "score")!;
    const table = computeCategoryTable({
      records,
      categoryKey: "sex",
      categoryLabel: "Sex",
      totalApplicants: 100,
      threshold: 0.8,
      smallSampleExclusion: null,
      rateOf: aboveMedian(median, "score"),
      titlePrefix: "Scoring rate impact ratios",
    });
    // An adverse-impact flag decided by one record against two.
    //
    // `i % 2 ? "Female" : "Male"` makes index 0 Male, so of indices 0, 1 and
    // 2 the two Males clear the median and the single Female does not. The
    // engine gives Male n=50 sel=2 rate=0.04 IR=1.0, and Female n=50 sel=1
    // rate=0.02 IR=0.5 FLAGGED. The brief's Python note names the groups the
    // other way round; the point of the test does not depend on which group
    // takes the flag, and the assertions below pin the engine's arithmetic.
    const female = table.rows.find((r) => r.categoryName === "Female")!;
    expect(female.impactRatio).toBe(0.5);
    expect(female.flagged).toBe(true);
    expect(female.selectedCount).toBe(1);

    const male = table.rows.find((r) => r.categoryName === "Male")!;
    expect(male.impactRatio).toBe(1);
    expect(male.flagged).toBe(false);
    expect(male.selectedCount).toBe(2);

    // The substance: a flag at 0.50 resting on a one-record difference.
    expect(female.selectedCount + male.selectedCount).toBe(3);
  });

  it("does not flag a sample where enough clear the median", () => {
    // 10 of 100 above the median of 1: a 0.10 fraction, over the 0.05 floor.
    const records = [...Array(100)].map((_, i) => ({ score: i < 10 ? 2 : 1 }));
    expect(detectDegenerateMedian(records, "score")).toBeNull();
  });
});
