import { runDataGates } from "./dataGates";
import type { BiasAuditConfig } from "./engine/types";

const config: BiasAuditConfig = {
  presetId: "nyc_ll144",
  metric: "selection_rate",
  categories: { sex: { label: "Sex", groups: ["Male", "Female"] } },
  intersectional: { required: false, cross: [] },
  threshold: 0.8,
  smallSampleExclusion: 0.02,
  outcomeColumn: "selected",
  scoreColumn: null,
  predictionColumn: null,
  groundTruthColumn: null,
};

const codes = (r: ReturnType<typeof runDataGates>) => r.findings.map((f) => f.code);

describe("hard stops", () => {
  // Review Focus 5
  it("stops when a demographic column is majority missing", () => {
    const records = [...Array(100)].map((_, i) => ({
      sex: i < 40 ? (i % 2 ? "Male" : "Female") : "",
      selected: i % 3 === 0,
    }));
    const result = runDataGates(records, config);
    expect(codes(result)).toContain("demographic_column_majority_missing");
    expect(result.mayComputeRatios).toBe(false);
    const f = result.findings.find((x) => x.code === "demographic_column_majority_missing")!;
    expect(f.severity).toBe("stop");
    expect(f.detail).toMatchObject({ column: "sex", present: 40, total: 100 });
  });

  it("stops when a required category has fewer than two groups", () => {
    const records = [...Array(50)].map((_, i) => ({ sex: "Male", selected: i % 2 === 0 }));
    const result = runDataGates(records, config);
    expect(codes(result)).toContain("fewer_than_two_groups");
    expect(result.mayComputeRatios).toBe(false);
  });

  // Review Focus 4
  it("stops when every record is selected", () => {
    const records = [...Array(50)].map((_, i) => ({
      sex: i % 2 ? "Male" : "Female",
      selected: true,
    }));
    const result = runDataGates(records, config);
    expect(codes(result)).toContain("all_or_none_selected");
    expect(result.mayComputeRatios).toBe(false);
  });

  it("stops when no record is selected", () => {
    const records = [...Array(50)].map((_, i) => ({
      sex: i % 2 ? "Male" : "Female",
      selected: false,
    }));
    expect(codes(runDataGates(records, config))).toContain("all_or_none_selected");
  });

  it("reads the canonical selected key even when outcomeColumn names another column", () => {
    const renamed: BiasAuditConfig = { ...config, outcomeColumn: "hired" };
    const records = [...Array(50)].map((_, i) => ({
      sex: i % 2 ? "Male" : "Female",
      selected: true,
    }));
    expect(codes(runDataGates(records, renamed))).toContain("all_or_none_selected");
  });

  it("passes a clean dataset with no findings", () => {
    const records = [...Array(200)].map((_, i) => ({
      sex: i % 2 ? "Male" : "Female",
      selected: i % 5 < 2,
    }));
    const result = runDataGates(records, config);
    expect(result.findings).toEqual([]);
    expect(result.mayComputeRatios).toBe(true);
    expect(result.mayExportPdf).toBe(true);
  });

  it("stops below half present and not at exactly half", () => {
    // Ruling: present under 50% of records is a stop. 49 of 100 stops; 50 does not.
    const make = (present: number) =>
      [...Array(100)].map((_, i) => ({
        sex: i < present ? (i % 2 ? "Male" : "Female") : null,
        selected: i % 3 === 0,
      }));
    const low = runDataGates(make(49), config).findings.find(
      (x) => x.code === "demographic_column_majority_missing",
    );
    expect(low!.detail).toMatchObject({ column: "sex", present: 49, total: 100 });
    expect(codes(runDataGates(make(50), config))).not.toContain(
      "demographic_column_majority_missing",
    );
  });

  it("does not raise all_or_none_selected for a scoring-rate dataset with no outcome column", () => {
    const scoring: BiasAuditConfig = { ...config, metric: "scoring_rate", scoreColumn: "score" };
    const records = [...Array(200)].map((_, i) => ({
      sex: i % 2 ? "Male" : "Female",
      score: (i * 7) % 101,
    }));
    expect(codes(runDataGates(records, scoring))).not.toContain("all_or_none_selected");
  });

  it("stops on a too_few_above median with an accurate message", () => {
    const scoring: BiasAuditConfig = { ...config, metric: "scoring_rate", scoreColumn: "score" };
    // 98 records at 3, 2 above: 2% above the median, under the 5% floor.
    const records = [...Array(100)].map((_, i) => ({
      sex: i % 2 ? "Male" : "Female",
      score: i < 2 ? 4 : 3,
    }));
    const result = runDataGates(records, scoring);
    const f = result.findings.find((x) => x.code === "degenerate_median")!;
    expect(f.severity).toBe("stop");
    expect(f.detail).toMatchObject({ kind: "too_few_above", above: 2 });
    expect(f.message).not.toContain("no record scores above");
    expect(result.mayComputeRatios).toBe(false);
  });
});

describe("warnings that gate the PDF only", () => {
  // Review Focus 1, surfaced as a gate
  it("warns on a low-granularity score column and on the degenerate median", () => {
    const scoring: BiasAuditConfig = {
      ...config,
      metric: "scoring_rate",
      scoreColumn: "score",
    };
    const records = [...Array(100)].map((_, i) => ({
      sex: i % 2 ? "Male" : "Female",
      score: i < 75 ? 3 : i < 90 ? 2 : 1,
    }));
    const result = runDataGates(records, scoring);
    expect(codes(result)).toContain("score_granularity_low");
    expect(codes(result)).toContain("degenerate_median");
    // The degenerate median is a stop: no rate can be computed at all.
    expect(result.mayComputeRatios).toBe(false);
  });

  it("warns when an intersectional cell sits below the 2% statutory exclusion", () => {
    const inter: BiasAuditConfig = {
      ...config,
      categories: {
        sex: { label: "Sex", groups: ["Male", "Female"] },
        race_ethnicity: { label: "Race/Ethnicity", groups: ["White", "Asian"] },
      },
      intersectional: { required: true, cross: ["sex", "race_ethnicity"] },
      smallSampleExclusion: null,
    };
    const records = [...Array(1000)].map((_, i) => ({
      sex: i < 5 ? "Female" : "Male",
      race_ethnicity: i < 5 ? "Asian" : "White",
      selected: i % 4 === 0,
    }));
    const result = runDataGates(records, inter);
    expect(codes(result)).toContain("cell_below_statutory_exclusion");
    const f = result.findings.find((x) => x.code === "cell_below_statutory_exclusion")!;
    expect(f.severity).toBe("warn");
    expect(result.mayComputeRatios).toBe(true);
    expect(result.mayExportPdf).toBe(false);
  });

  it("does not warn on a small cell when the exclusion is actually applied", () => {
    // § 5-301(d) permits excluding a category under 2%. The warning exists for
    // the case where such a cell is reported with no exclusion configured, so
    // configuring one must silence it.
    const inter: BiasAuditConfig = {
      ...config,
      categories: {
        sex: { label: "Sex", groups: ["Male", "Female"] },
        race_ethnicity: { label: "Race/Ethnicity", groups: ["White", "Asian"] },
      },
      intersectional: { required: true, cross: ["sex", "race_ethnicity"] },
      smallSampleExclusion: 0.02,
    };
    const records = [...Array(1000)].map((_, i) => ({
      sex: i < 5 ? "Female" : "Male",
      race_ethnicity: i < 5 ? "Asian" : "White",
      selected: i % 4 === 0,
    }));
    expect(codes(runDataGates(records, inter))).not.toContain("cell_below_statutory_exclusion");
  });

  it("does not warn on granularity for a continuous score", () => {
    const scoring: BiasAuditConfig = {
      ...config,
      metric: "scoring_rate",
      scoreColumn: "score",
    };
    const records = [...Array(200)].map((_, i) => ({
      sex: i % 2 ? "Male" : "Female",
      score: (i * 7) % 101,
    }));
    expect(codes(runDataGates(records, scoring))).not.toContain("score_granularity_low");
  });
});

describe("messages", () => {
  it("never uses forbidden vocabulary", () => {
    const records = [...Array(10)].map(() => ({ sex: "", selected: true }));
    const result = runDataGates(records, config);
    const text = result.findings
      .map((f) => f.message)
      .join(" ")
      .toLowerCase();
    for (const word of ["compliant", "certified", "passed", "bias-free"]) {
      expect(text).not.toContain(word);
    }
  });

  it("states 0.80 as a convention and 2% as the statutory rule", () => {
    // The spec's central distinction: one is law, the other is the EEOC
    // four-fifths convention the statute does not adopt. A gate message that
    // blurred them would undo the point.
    const inter: BiasAuditConfig = {
      ...config,
      categories: {
        sex: { label: "Sex", groups: ["Male", "Female"] },
        race_ethnicity: { label: "Race/Ethnicity", groups: ["White", "Asian"] },
      },
      intersectional: { required: true, cross: ["sex", "race_ethnicity"] },
      smallSampleExclusion: null,
    };
    const records = [...Array(1000)].map((_, i) => ({
      sex: i < 5 ? "Female" : "Male",
      race_ethnicity: i < 5 ? "Asian" : "White",
      selected: i % 4 === 0,
    }));
    const f = runDataGates(records, inter).findings.find(
      (x) => x.code === "cell_below_statutory_exclusion",
    )!;
    expect(f.message).toContain("5-301(d)");
    expect(f.message.toLowerCase()).not.toContain("pass mark");
  });
});
