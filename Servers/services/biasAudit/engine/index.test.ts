import { computeBiasAudit } from "./index";
import { allCases, exp } from "./__fixtures__/load";
import { computeScoreDistributionTable, ksTwoSample } from "./scoreDistribution";
import { overallMedian } from "./scoringRate";
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

// /code-review: ties and unusable score values.
describe("score handling", () => {
  it("measures the K-S gap only after a whole run of tied values", () => {
    // Identical distributions. The Python's one-step merge reports D = 1 here.
    expect(ksTwoSample([1, 1], [1, 1, 1, 1])).toEqual({ d: 0, p: 1 });
    // A real difference still registers: scipy ks_2samp gives D = 0.5.
    expect(ksTwoSample([1, 1, 2, 2], [1, 1, 1, 1]).d).toBe(0.5);
  });

  it("treats whitespace-only and non-numeric scores as missing, not as 0", () => {
    expect(overallMedian([{ score: "  " }, { score: "  " }, { score: 5 }], "score")).toBe(5);
    expect(overallMedian([{ score: "n/a" }, { score: 3 }, { score: 5 }], "score")).toBe(4);
  });

  it("keeps unusable scores out of score distributions", () => {
    const table = computeScoreDistributionTable({
      records: [
        { sex: "Male", score: "n/a" },
        { sex: "Male", score: "" },
        { sex: "Male", score: 3 },
        { sex: "Female", score: 5 },
      ],
      categoryKey: "sex",
      categoryLabel: "Sex",
    });
    expect(table.overallMean).toBe(4);
    const male = table.groups.find((g) => g.categoryName === "Male")!;
    expect(male.count).toBe(1);
    expect(male.bins.reduce((s, b) => s + b.count, 0)).toBe(1);
  });

  it("computes the overall scoring rate over the same sample as the median", () => {
    // 4 numeric scores (median 2.5, 2 above) and 2 blanks: 2 of 4, not 2 of 6.
    const records = [1, 2, 3, 4, "", " "].map((score, i) => ({
      sex: i % 2 ? "Male" : "Female",
      score,
    }));
    const got = computeBiasAudit(records, {
      ...toConfig(all[0].config),
      metric: "scoring_rate",
      scoreColumn: "score",
    });
    expect(got.overallSelectionRate).toBe(0.5);
  });
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
      // K-S deliberately diverges from the Python, which mishandles ties
      // (see ksTwoSample). The reference is scipy.stats.ks_2samp on the same
      // samples: D = 0.005 for both groups, where the Python reports 0.015
      // and 0.01. The p-values agree at 1.0 either way.
      expect(t.groups.map((g) => g.ksStatistic)).toEqual([0.005, 0.005]);
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

describe("summary backstop when no ratio is computable", () => {
  // Final review C1: every selected record lacks a sex, so every sex rate is
  // 0 and every ratio null. The summary must not read as a clean result.
  it("does not report an absence of flags for a table with no reference rate", () => {
    const records: Record<string, unknown>[] = [];
    for (let i = 0; i < 100; i++) {
      const hasSex = i % 5 < 3;
      records.push({
        sex: hasSex ? (i % 2 ? "Male" : "Female") : "",
        selected: !hasSex && i < 75,
      });
    }
    const got = computeBiasAudit(records, toConfig(all[0].config));
    expect(got.tables[0].rows.every((r) => r.impactRatio === null)).toBe(true);
    expect(got.summary).not.toContain("No adverse impact");
    expect(got.summary).toContain("No impact ratio could be computed for impact ratios by sex");
  });

  it("does not report an absence of flags when no category is configured", () => {
    const c = all.find((x) => x.name === "selection_rate_balanced")!;
    const got = computeBiasAudit(c.records, { ...toConfig(c.config), categories: {} });
    expect(got.tables).toHaveLength(0);
    expect(got.summary).not.toContain("No adverse impact");
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
      expect(got.summary.toLowerCase()).not.toMatch(
        /\b(compliant|certified|passed|bias-free|audited)\b/,
      );
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

  describe("too_few_above degenerate median", () => {
    const scored = [...Array(3).fill(9), ...Array(60).fill(5), ...Array(37).fill(1)].map(
      (score, i) => ({ sex: i % 2 === 0 ? "Male" : "Female", score }),
    );

    it("states the above/total basis without claiming nothing was computed", () => {
      const got = computeBiasAudit(scored, {
        ...toConfig(all[0].config),
        metric: "scoring_rate",
        scoreColumn: "score",
      });
      expect(got.diagnostics.degenerateMedian?.kind).toBe("too_few_above");
      expect(got.summary).toContain(
        "only 3 of 100 records clearing the sample median (5), below the 5.0% floor",
      );
      expect(got.summary).toContain("not a reliable basis for conclusions");
      expect(got.summary).not.toContain("No scoring rate could be computed");
      expect(got.summary).not.toContain("no record scores above it");
      expect(got.summary).not.toContain("No adverse impact");
      expect(got.summary.toLowerCase()).not.toMatch(
        /\b(compliant|certified|passed|bias-free|audited)\b/,
      );
    });
  });

  describe("overall rate percent formatting", () => {
    // Reads the "overall rate" figure out of the summary for n records, k selected.
    function rateFor(k: number, n: number): string {
      const records = Array.from({ length: n }, (_, i) => ({
        sex: i % 2 === 0 ? "Male" : "Female",
        selected: i < k ? 1 : 0,
      }));
      const got = computeBiasAudit(records, {
        ...toConfig(all[0].config),
        metric: "selection_rate",
        outcomeColumn: "selected",
      });
      return /overall rate: ([\d.]+%)/.exec(got.summary)![1];
    }

    it("rounds an exact tie half to even like Python (1/16 -> 6.2%)", () => {
      expect(rateFor(1, 16)).toBe("6.2%");
    });

    it("rounds a float just above a half up (1/2000 -> 0.1%)", () => {
      expect(rateFor(1, 2000)).toBe("0.1%");
    });

    it("rounds an ordinary value normally (1/3 -> 33.3%)", () => {
      expect(rateFor(1, 3)).toBe("33.3%");
    });
  });
});

describe("computeScoreDistributionTable at scale", () => {
  it("handles 300,000 scored records without overflowing the stack", () => {
    const n = 300_000;
    const records = Array.from({ length: n }, (_, i) => ({
      sex: i % 2 === 0 ? "Male" : "Female",
      score: i % 1000,
    }));
    const table = computeScoreDistributionTable({
      records,
      categoryKey: "sex",
      categoryLabel: "Sex",
      bins: 10,
    });
    expect(table.groups.map((g) => g.categoryName).sort()).toEqual(["Female", "Male"]);
    const bins = table.groups[0].bins;
    expect(bins).toHaveLength(10);
    expect(bins[0].lower).toBe(0);
    expect(bins[9].upper).toBe(999);
  });
});
