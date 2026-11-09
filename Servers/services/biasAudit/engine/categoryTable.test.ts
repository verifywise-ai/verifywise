import { computeCategoryTable } from "./categoryTable";
import { round6 } from "./round";
import { byName, exp } from "./__fixtures__/load";

describe("round6", () => {
  it("matches Python on an ordinary repeating fraction", () => {
    expect(round6(3 / 7)).toBe(0.428571);
    expect(round6(1 / 3)).toBe(0.333333);
    expect(round6(2 / 3)).toBe(0.666667);
  });

  // The family toFixed(6) gets wrong: exact binary fractions whose 7th
  // decimal is a true 5. Python rounds these half to even.
  it.each([
    [1 / 128, 0.007812],
    [29 / 128, 0.226562],
    [57 / 128, 0.445312],
    [85 / 128, 0.664062],
    [113 / 128, 0.882812],
    [5 / 128, 0.039062],
    [1 / 256, 0.003906],
  ])("rounds the exact binary half %p to %p, half to even", (input, expected) => {
    expect(round6(input)).toBe(expected);
  });

  it("differs from toFixed(6) on those values, which is why it exists", () => {
    expect(Number((1 / 128).toFixed(6))).toBe(0.007813);
    expect(round6(1 / 128)).toBe(0.007812);
  });

  // Decimal halves are NOT exactly representable, so a tie test on the
  // scaled value misfires here. These must still match Python.
  it("rounds decimal near-halves as Python does", () => {
    expect(round6(0.1234565)).toBe(0.123456);
    expect(round6(0.1234575)).toBe(0.123457);
  });

  it("handles exponential notation, zero, one and negatives", () => {
    expect(round6(5e-7)).toBe(0);
    expect(round6(0)).toBe(0);
    expect(round6(1)).toBe(1);
    expect(round6(-1 / 128)).toBe(-0.007812);
  });

  it("keeps near-ties around 1e-6 apart from true ties, matching Python", () => {
    expect(round6(2.5e-6)).toBe(3e-6);
    expect(round6(3.5e-6)).toBe(3e-6);
    expect(round6(4.5e-6)).toBe(5e-6);
    expect(round6(5e-7)).toBe(0);
  });

  it("is reachable from real group sizes", () => {
    // 1 selected from a group of 128 is an ordinary cell, not a contrived one.
    expect(round6(1 / 128)).toBe(0.007812);
  });
});

describe("computeCategoryTable against the Python oracle", () => {
  it("reproduces selection_rate_balanced", () => {
    const c = byName("selection_rate_balanced");
    const table = computeCategoryTable({
      records: c.records,
      categoryKey: "sex",
      categoryLabel: "Sex",
      totalApplicants: c.records.length,
      threshold: 0.8,
      smallSampleExclusion: null,
      rateOf: (r) => Boolean(r.selected),
    });
    const want = exp("selection_rate_balanced").tables[0];

    expect(table.title).toBe(want.title);
    expect(table.rows.map((r) => r.categoryName)).toEqual(
      want.rows.map((r: any) => r.category_name),
    );
    expect(table.rows.map((r) => r.selectionRate)).toEqual(
      want.rows.map((r: any) => r.selection_rate),
    );
    expect(table.rows.map((r) => r.impactRatio)).toEqual(want.rows.map((r: any) => r.impact_ratio));
    expect(table.rows.map((r) => r.flagged)).toEqual(want.rows.map((r: any) => r.flagged));
  });

  it("reproduces small-sample exclusion, including the null impact ratio", () => {
    const c = byName("selection_rate_small_sample_excluded");
    const table = computeCategoryTable({
      records: c.records,
      categoryKey: "race_ethnicity",
      categoryLabel: "Race/Ethnicity",
      totalApplicants: c.records.length,
      threshold: 0.8,
      smallSampleExclusion: 0.02,
      rateOf: (r) => Boolean(r.selected),
    });
    const want = exp("selection_rate_small_sample_excluded").tables[0];

    expect(table.rows.map((r) => r.excluded)).toEqual(want.rows.map((r: any) => r.excluded));
    expect(table.rows.map((r) => r.impactRatio)).toEqual(want.rows.map((r: any) => r.impact_ratio));
    // An excluded group keeps its rate for transparency but has no ratio.
    const excluded = table.rows.find((r) => r.excluded)!;
    expect(excluded.selectionRate).toBeGreaterThan(0);
    expect(excluded.impactRatio).toBeNull();
  });

  describe("the reference rate under the small-sample exclusion (5-301(d))", () => {
    const row = (group: string, selected: boolean) => ({ group, selected });
    const of = (group: string, total: number, selected: number) =>
      Array.from({ length: total }, (_, i) => row(group, i < selected));
    const rateOf = (r: Record<string, unknown>) => Boolean(r.selected);
    const table = (records: Record<string, unknown>[]) =>
      computeCategoryTable({
        records,
        categoryKey: "group",
        categoryLabel: "Group",
        totalApplicants: records.length,
        threshold: 0.8,
        smallSampleExclusion: 0.02,
        rateOf,
      });

    it("takes the highest rate from non-excluded groups only", () => {
      const t = table([...of("Tiny", 10, 10), ...of("Big", 500, 250), ...of("Other", 490, 196)]);
      expect(t.highestGroup).toBe("Big");
      expect(t.highestRate).toBeCloseTo(0.5);
      const ratio = (name: string) => t.rows.find((r) => r.categoryName === name)!.impactRatio;
      expect(ratio("Big")).toBe(1);
      expect(ratio("Other")).toBeCloseTo(0.8);
    });

    it("still reports an excluded group's count and rate, with no ratio", () => {
      const t = table([...of("Tiny", 10, 10), ...of("Big", 500, 250), ...of("Other", 490, 196)]);
      const tiny = t.rows.find((r) => r.categoryName === "Tiny")!;
      expect(tiny).toMatchObject({
        applicantCount: 10,
        selectedCount: 10,
        selectionRate: 1,
        excluded: true,
        impactRatio: null,
        flagged: false,
      });
    });

    it("computes no ratios when every group is excluded", () => {
      const groups = Array.from({ length: 60 }, (_, g) => of(`G${g}`, 10, g % 2 === 0 ? 5 : 1));
      const t = table(groups.flat());
      expect(t.rows).toHaveLength(60);
      expect(t.rows.every((r) => r.excluded && r.impactRatio === null && !r.flagged)).toBe(true);
      expect(t.highestGroup).toBeNull();
      expect(t.highestRate).toBeNull();
    });
  });

  it("skips records whose group name is blank, as the Python does", () => {
    const c = byName("selection_rate_blank_group_names");
    const table = computeCategoryTable({
      records: c.records,
      categoryKey: "sex",
      categoryLabel: "Sex",
      totalApplicants: c.records.length,
      threshold: 0.8,
      smallSampleExclusion: null,
      rateOf: (r) => Boolean(r.selected),
    });
    const want = exp("selection_rate_blank_group_names").tables[0];
    expect(table.rows.map((r) => r.applicantCount)).toEqual(
      want.rows.map((r: any) => r.applicant_count),
    );
    // Review Focus 5: only 12 of 100 records carry a sex, and nothing here says so.
    const counted = table.rows.reduce((s, r) => s + r.applicantCount, 0);
    expect(counted).toBe(12);
    expect(c.records.length).toBe(100);
  });

  // Final review M3: one definition of blank, shared with the data gates. A
  // whitespace-only value is blank, not a group named " ". This diverges from
  // the Python, which treats " " as a group; no oracle case contains one.
  it("treats a whitespace-only group name as blank", () => {
    const records = [
      ...[...Array(4)].map(() => ({ sex: " ", selected: true })),
      { sex: "Male", selected: true },
      { sex: "Female", selected: false },
    ];
    const table = computeCategoryTable({
      records,
      categoryKey: "sex",
      categoryLabel: "Sex",
      totalApplicants: records.length,
      threshold: 0.8,
      smallSampleExclusion: null,
      rateOf: (r) => Boolean(r.selected),
    });
    expect(table.rows.map((r) => r.categoryName)).toEqual(["Female", "Male"]);
  });

  // Review Focus 2
  it("makes a lone group its own reference, but the ratio is not exactly 1", () => {
    const c = byName("selection_rate_single_group");
    const table = computeCategoryTable({
      records: c.records,
      categoryKey: "sex",
      categoryLabel: "Sex",
      totalApplicants: c.records.length,
      threshold: 0.8,
      smallSampleExclusion: null,
      rateOf: (r) => Boolean(r.selected),
    });
    expect(table.rows).toHaveLength(1);

    // 0.999999, NOT 1.0. The engine divides the ROUNDED rate by the
    // UNROUNDED highest rate: with 20 of 60 selected, round(1/3, 6) is
    // 0.333333 while highestRate stays 0.3333333..., so the quotient is
    // 0.999999. Verified against the Python. Preserve this asymmetry; it
    // affects every ratio whose rate is not exactly representable.
    expect(table.rows[0].impactRatio).toBe(0.999999);
    expect(table.rows[0].flagged).toBe(false);
    expect(table.rows.map((r) => r.impactRatio)).toEqual(
      exp("selection_rate_single_group").tables[0].rows.map((r: any) => r.impact_ratio),
    );
  });
});
