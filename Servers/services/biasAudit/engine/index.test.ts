import { computeBiasAudit } from "./index";
import { allCases, exp } from "./__fixtures__/load";
import type { BiasAuditConfig } from "./types";

const all = allCases();

/** Map the committed snake_case config to the module's camelCase shape. */
function toConfig(c: any): BiasAuditConfig {
  return {
    presetId: c.preset_id,
    metric: c.metric ?? "selection_rate",
    categories: Object.fromEntries(
      Object.entries(c.categories ?? {}).map(([k, v]: [string, any]) => [
        k,
        { label: v.label, groups: v.groups ?? [] },
      ]),
    ),
    intersectional: {
      required: c.intersectional?.required ?? false,
      cross: c.intersectional?.cross ?? [],
    },
    threshold: c.threshold ?? 0.8,
    smallSampleExclusion: c.small_sample_exclusion ?? null,
    outcomeColumn: c.outcome_column ?? "selected",
    scoreColumn: c.score_column ?? null,
    predictionColumn: c.prediction_column ?? null,
    groundTruthColumn: c.ground_truth_column ?? null,
  };
}

describe("computeBiasAudit reproduces the Python oracle on every case", () => {
  for (const c of all) {
    it(`matches ${c.name}`, () => {
      const got = computeBiasAudit(c.records, toConfig(c.config));
      const want = exp(c.name);

      expect(got.metric).toBe(want.metric);
      expect(got.totalApplicants).toBe(want.total_applicants);
      expect(got.totalSelected).toBe(want.total_selected);
      expect(got.overallSelectionRate).toBe(want.overall_selection_rate);
      expect(got.flagsCount).toBe(want.flags_count);
      expect(got.excludedCount).toBe(want.excluded_count);
      expect(got.unknownCount).toBe(want.unknown_count);

      expect(got.tables).toHaveLength(want.tables.length);
      got.tables.forEach((table, i) => {
        const w = want.tables[i];
        expect(table.title).toBe(w.title);
        expect(table.categoryKey).toBe(w.category_key);
        expect(table.rows.map((r) => r.categoryName)).toEqual(
          w.rows.map((r: any) => r.category_name),
        );
        expect(table.rows.map((r) => r.applicantCount)).toEqual(
          w.rows.map((r: any) => r.applicant_count),
        );
        expect(table.rows.map((r) => r.selectedCount)).toEqual(
          w.rows.map((r: any) => r.selected_count),
        );
        expect(table.rows.map((r) => r.selectionRate)).toEqual(
          w.rows.map((r: any) => r.selection_rate),
        );
        expect(table.rows.map((r) => r.impactRatio)).toEqual(
          w.rows.map((r: any) => r.impact_ratio),
        );
        expect(table.rows.map((r) => r.flagged)).toEqual(w.rows.map((r: any) => r.flagged));
        expect(table.rows.map((r) => r.excluded)).toEqual(w.rows.map((r: any) => r.excluded));
      });

      expect(got.scoreDistributionTables).toHaveLength(want.score_distribution_tables.length);
      expect(got.fairnessMetricsTables).toHaveLength(want.fairness_metrics_tables.length);
    });
  }
});

describe("score distribution tables match the Python, K-S included", () => {
  it("reproduces the per-group statistics and the K-S test", () => {
    const c = all.find((x) => x.name === "score_distribution_present")!;
    const got = computeBiasAudit(c.records, toConfig(c.config));
    const want = exp(c.name).score_distribution_tables;

    expect(got.scoreDistributionTables).toHaveLength(want.length);
    got.scoreDistributionTables.forEach((t, i) => {
      const w = want[i];
      expect(t.title).toBe(w.title);
      expect(t.overallMean).toBe(w.overall_mean);
      expect(t.overallMedian).toBe(w.overall_median);
      expect(t.groups.map((g) => g.categoryName)).toEqual(
        w.groups.map((g: any) => g.category_name),
      );
      expect(t.groups.map((g) => g.count)).toEqual(w.groups.map((g: any) => g.count));
      expect(t.groups.map((g) => g.mean)).toEqual(w.groups.map((g: any) => g.mean));
      expect(t.groups.map((g) => g.median)).toEqual(w.groups.map((g: any) => g.median));
      // pstdev, the POPULATION standard deviation, not the sample one.
      expect(t.groups.map((g) => g.std)).toEqual(w.groups.map((g: any) => g.std));
      expect(t.groups.map((g) => g.ksStatistic)).toEqual(w.groups.map((g: any) => g.ks_statistic));
      expect(t.groups.map((g) => g.ksPvalue)).toEqual(w.groups.map((g: any) => g.ks_pvalue));
      // 20 bins, with the edges rounded to 6dp as the Python has them.
      t.groups.forEach((g, gi) => {
        expect(g.bins).toHaveLength(20);
        expect(g.bins.map((b) => b.count)).toEqual(w.groups[gi].bins.map((b: any) => b.count));
        expect(g.bins.map((b) => b.lower)).toEqual(w.groups[gi].bins.map((b: any) => b.lower));
        expect(g.bins.map((b) => b.upper)).toEqual(w.groups[gi].bins.map((b: any) => b.upper));
      });
    });
  });
});

describe("fairness metrics tables match the Python", () => {
  it("reproduces the confusion matrices and the cross-group gaps", () => {
    const c = all.find((x) => x.name === "fairness_metrics_basic")!;
    const got = computeBiasAudit(c.records, toConfig(c.config));
    const want = exp(c.name).fairness_metrics_tables;

    expect(got.fairnessMetricsTables).toHaveLength(want.length);
    const t = got.fairnessMetricsTables[0];
    const w = want[0];

    expect(t.title).toBe(w.title);
    expect(t.groups.map((g) => g.categoryName)).toEqual(w.groups.map((g: any) => g.category_name));
    expect(t.groups.map((g) => g.truePositive)).toEqual(w.groups.map((g: any) => g.true_positive));
    expect(t.groups.map((g) => g.falsePositive)).toEqual(
      w.groups.map((g: any) => g.false_positive),
    );
    expect(t.groups.map((g) => g.trueNegative)).toEqual(w.groups.map((g: any) => g.true_negative));
    expect(t.groups.map((g) => g.falseNegative)).toEqual(
      w.groups.map((g: any) => g.false_negative),
    );
    expect(t.groups.map((g) => g.truePositiveRate)).toEqual(
      w.groups.map((g: any) => g.true_positive_rate),
    );
    expect(t.groups.map((g) => g.falsePositiveRate)).toEqual(
      w.groups.map((g: any) => g.false_positive_rate),
    );
    expect(t.groups.map((g) => g.precision)).toEqual(w.groups.map((g: any) => g.precision));
    expect(t.groups.map((g) => g.accuracy)).toEqual(w.groups.map((g: any) => g.accuracy));

    expect(t.equalOpportunityDifference).toBe(w.equal_opportunity_difference);
    expect(t.equalizedOddsDifference).toBe(w.equalized_odds_difference);
    expect(t.predictiveParityDifference).toBe(w.predictive_parity_difference);
    expect(t.tprMaxGroup).toBe(w.tpr_max_group);
    expect(t.tprMinGroup).toBe(w.tpr_min_group);
  });
});

describe("diagnostics", () => {
  it("carries the degenerate-median diagnostic on the affected case", () => {
    const c = all.find((x) => x.name === "scoring_rate_median_equals_mode")!;
    const got = computeBiasAudit(c.records, toConfig(c.config));
    expect(got.diagnostics.degenerateMedian).not.toBeNull();
    expect(got.diagnostics.degenerateMedian!.atMedian).toBe(75);
  });

  it("carries no diagnostic on a continuous score", () => {
    const c = all.find((x) => x.name === "scoring_rate_continuous")!;
    const got = computeBiasAudit(c.records, toConfig(c.config));
    expect(got.diagnostics.degenerateMedian).toBeNull();
  });

  it("exposes the overall median in scoring mode", () => {
    const c = all.find((x) => x.name === "scoring_rate_continuous")!;
    const got = computeBiasAudit(c.records, toConfig(c.config));
    expect(got.overallMedian).not.toBeNull();
  });
});

describe("summary text", () => {
  it("never claims a clean result when nothing was computed", () => {
    const c = all.find((x) => x.name === "scoring_rate_median_equals_mode")!;
    const got = computeBiasAudit(c.records, toConfig(c.config));
    // The Python says "No adverse impact flags detected" here. We must not.
    expect(exp(c.name).summary).toContain("No adverse impact flags detected");
    expect(got.summary).not.toContain("No adverse impact");
    expect(got.summary.toLowerCase()).toContain("median");
  });

  it("matches the Python's summary where no divergence is intended", () => {
    const c = all.find((x) => x.name === "selection_rate_balanced")!;
    const got = computeBiasAudit(c.records, toConfig(c.config));
    expect(got.summary).toBe(exp(c.name).summary);
  });

  it("reports the unknown-category count required by 5-301(c)", () => {
    const c = all.find((x) => x.name === "selection_rate_balanced")!;
    const got = computeBiasAudit(c.records, toConfig(c.config), 7);
    expect(got.unknownCount).toBe(7);
    expect(got.summary).toContain("7 rows excluded due to missing data.");
  });

  it("uses no forbidden vocabulary", () => {
    for (const c of all) {
      const got = computeBiasAudit(c.records, toConfig(c.config));
      expect(got.summary.toLowerCase()).not.toMatch(/\b(compliant|certified|passed|bias-free)\b/);
    }
  });

  it("rejects an unknown metric mode", () => {
    expect(() =>
      computeBiasAudit([{ sex: "Male" }], {
        ...toConfig(all[0].config),
        metric: "nope" as any,
      }),
    ).toThrow(/unknown metric mode/i);
  });

  it("rejects fairness mode without prediction and ground truth", () => {
    expect(() =>
      computeBiasAudit([{ sex: "Male" }], {
        ...toConfig(all[0].config),
        metric: "fairness_metrics",
      }),
    ).toThrow(/prediction and ground_truth/i);
  });

  it("rejects scoring mode with no numeric score", () => {
    expect(() =>
      computeBiasAudit([{ sex: "Male" }], {
        ...toConfig(all[0].config),
        metric: "scoring_rate",
      }),
    ).toThrow(/score column/i);
  });
});
