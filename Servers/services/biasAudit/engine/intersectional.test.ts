import { computeIntersectionalTable } from "./intersectional";
import { byName, exp } from "./__fixtures__/load";

describe("computeIntersectionalTable against the Python oracle", () => {
  const c = byName("selection_rate_intersectional");
  const want = exp("selection_rate_intersectional").tables.find(
    (t: any) => t.category_key === "intersectional",
  );

  const table = computeIntersectionalTable({
    records: c.records,
    crossKeys: ["sex", "race_ethnicity"],
    totalApplicants: c.records.length,
    threshold: 0.8,
    smallSampleExclusion: 0.02,
    rateOf: (r) => Boolean(r.selected),
  });

  it("produces the mandatory 14 cells required by 5-301(c)", () => {
    expect(table.rows).toHaveLength(14);
    expect(want.rows).toHaveLength(14);
  });

  it("matches the Python's cell names and order", () => {
    expect(table.rows.map((r) => r.categoryName)).toEqual(
      want.rows.map((r: any) => r.category_name),
    );
  });

  it("joins the crossed values with ' - ', which is also the sort key", () => {
    // engine.py:291. A different separator reorders the table, and the first
    // cell in sort order is a candidate for the reference rate.
    expect(table.rows.every((r) => r.categoryName.includes(" - "))).toBe(true);
  });

  it("matches the Python's rates and impact ratios", () => {
    expect(table.rows.map((r) => r.selectionRate)).toEqual(
      want.rows.map((r: any) => r.selection_rate),
    );
    expect(table.rows.map((r) => r.impactRatio)).toEqual(want.rows.map((r: any) => r.impact_ratio));
  });

  it("matches the Python's flags and exclusions", () => {
    expect(table.rows.map((r) => r.flagged)).toEqual(want.rows.map((r: any) => r.flagged));
    expect(table.rows.map((r) => r.excluded)).toEqual(want.rows.map((r: any) => r.excluded));
  });

  it("matches the Python's title, highest group and highest rate", () => {
    expect(table.title).toBe(want.title);
    expect(table.highestGroup).toBe(want.highest_group);
    expect(table.highestRate).toBe(want.highest_rate);
  });

  it("skips a record missing either half of the cross", () => {
    const partial = [
      { sex: "Male", race_ethnicity: "White", selected: true },
      { sex: "Male", selected: true },
      { race_ethnicity: "White", selected: true },
    ];
    const t = computeIntersectionalTable({
      records: partial,
      crossKeys: ["sex", "race_ethnicity"],
      totalApplicants: 3,
      threshold: 0.8,
      smallSampleExclusion: null,
      rateOf: (r) => Boolean(r.selected),
    });
    expect(t.rows).toHaveLength(1);
    expect(t.rows[0].applicantCount).toBe(1);
  });

  it("returns no impact ratios when nothing was selected", () => {
    // Mirrors the Python's `highest_rate > 0` guard: with no selections there
    // is no reference rate, so every ratio is null rather than 1.0.
    const none = [
      { sex: "Male", race_ethnicity: "White", selected: false },
      { sex: "Female", race_ethnicity: "Asian", selected: false },
    ];
    const t = computeIntersectionalTable({
      records: none,
      crossKeys: ["sex", "race_ethnicity"],
      totalApplicants: 2,
      threshold: 0.8,
      smallSampleExclusion: null,
      rateOf: (r) => Boolean(r.selected),
    });
    expect(t.rows).toHaveLength(2);
    expect(t.rows.every((r) => r.impactRatio === null)).toBe(true);
    expect(t.rows.every((r) => r.flagged === false)).toBe(true);
    expect(t.highestRate).toBeNull();
  });
});

describe("the intersectional reference rate under the small-sample exclusion", () => {
  const records = [
    ...Array.from({ length: 10 }, () => ({ a: "X", b: "Tiny", selected: true })),
    ...Array.from({ length: 500 }, (_, i) => ({ a: "X", b: "Big", selected: i < 250 })),
    ...Array.from({ length: 490 }, (_, i) => ({ a: "Y", b: "Big", selected: i < 196 })),
  ];

  it("does not let an excluded cell set the reference or name highestGroup", () => {
    const t = computeIntersectionalTable({
      records,
      crossKeys: ["a", "b"],
      totalApplicants: records.length,
      threshold: 0.8,
      smallSampleExclusion: 0.02,
      rateOf: (r) => Boolean(r.selected),
    });
    expect(t.highestGroup).toBe("X - Big");
    expect(t.highestRate).toBeCloseTo(0.5);
    expect(t.rows.find((r) => r.categoryName === "X - Tiny")).toMatchObject({
      excluded: true,
      impactRatio: null,
      selectionRate: 1,
    });
    expect(t.rows.find((r) => r.categoryName === "Y - Big")!.impactRatio).toBeCloseTo(0.8);
  });

  it("computes no ratios when every cell is excluded", () => {
    const small = Array.from({ length: 60 }, (_, g) =>
      Array.from({ length: 10 }, () => ({ a: `A${g}`, b: "B", selected: true })),
    ).flat();
    const t = computeIntersectionalTable({
      records: small,
      crossKeys: ["a", "b"],
      totalApplicants: small.length,
      threshold: 0.8,
      smallSampleExclusion: 0.02,
      rateOf: (r) => Boolean(r.selected),
    });
    expect(t.rows.every((r) => r.excluded && r.impactRatio === null)).toBe(true);
    expect(t.highestGroup).toBe("");
    expect(t.highestRate).toBeNull();
  });
});
