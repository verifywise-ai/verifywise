import { runAudit } from "./index";

const config: any = {
  presetId: "nyc_ll144",
  metric: "selection_rate",
  categories: { sex: { label: "Sex", groups: ["Male", "Female"] } },
  intersectional: { required: false, cross: [] },
  threshold: 0.8,
  smallSampleExclusion: 0.02,
  outcomeColumn: "selected",
  scoreColumn: null,
};

function clean(n = 200) {
  const out: Record<string, unknown>[] = [];
  for (let i = 0; i < n; i++) out.push({ sex: i % 2 ? "Male" : "Female", selected: i % 5 < 2 });
  for (let i = out.length - 1; i > 0; i--) {
    const j = (i * 7919) % (i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

describe("runAudit", () => {
  it("computes a result for a clean dataset", () => {
    const outcome = runAudit(clean(), config, ["sex"]);
    expect(outcome.gates.findings).toEqual([]);
    expect(outcome.order[0].blocked).toBe(false);
    expect(outcome.result).not.toBeNull();
    expect(outcome.result!.tables[0].rows).toHaveLength(2);
  });

  it("returns no result when a hard stop fires", () => {
    const records = [...Array(50)].map((_, i) => ({
      sex: i % 2 ? "Male" : "Female",
      selected: true,
    }));
    const outcome = runAudit(records, config, ["sex"]);
    expect(outcome.gates.mayComputeRatios).toBe(false);
    expect(outcome.result).toBeNull();
  });

  it("reports blocked ordering alongside a computed result", () => {
    // Ordering is a finding about provenance, not a reason to withhold
    // arithmetic: the caller decides what may be shown. 100 of 200 are
    // selected, so no hard stop fires and the result is computed.
    const records = [
      ...Array(100)
        .fill(null)
        .map(() => ({ sex: "Male", selected: true })),
      ...Array(100)
        .fill(null)
        .map(() => ({ sex: "Female", selected: false })),
    ];
    const outcome = runAudit(records, config, ["sex"]);
    expect(outcome.order[0].blocked).toBe(true);
    expect(outcome.gates.mayComputeRatios).toBe(true);
    expect(outcome.result).not.toBeNull();
  });

  it("turns blocked ordering into a PDF-gating warning", () => {
    const records = [
      ...Array(100)
        .fill(null)
        .map((_, i) => ({ sex: "Male", selected: i % 2 === 0 })),
      ...Array(100)
        .fill(null)
        .map((_, i) => ({ sex: "Female", selected: i % 3 === 0 })),
    ];
    const outcome = runAudit(records, config, ["sex"]);
    const finding = outcome.gates.findings.find((f) => f.code === "attribute_order_clustered");
    expect(finding).toBeDefined();
    expect(finding!.severity).toBe("warn");
    expect(finding!.detail).toMatchObject({ attribute: "sex", observedRuns: 2 });
    expect(finding!.message.toLowerCase()).not.toMatch(
      /\b(compliant|certified|passed|bias-free|audited)\b/,
    );
    expect(outcome.gates.mayExportPdf).toBe(false);
    expect(outcome.gates.mayComputeRatios).toBe(true);
    expect(outcome.result).not.toBeNull();
  });

  // Final review C1: all-or-none within a category, not only across the file.
  it("stops when every selected record lacks a value for a category", () => {
    const records: Record<string, unknown>[] = [];
    for (let i = 0; i < 100; i++) {
      const hasSex = i % 5 < 3; // 60 of 100 carry a sex
      records.push({
        sex: hasSex ? (i % 2 ? "Male" : "Female") : "",
        selected: !hasSex && i < 75, // 15 selected, all with blank sex
      });
    }
    const outcome = runAudit(records, config, ["sex"]);
    const f = outcome.gates.findings.find(
      (x) => x.code === "all_or_none_selected" && x.detail?.column === "sex",
    );
    expect(f).toBeDefined();
    expect(f!.severity).toBe("stop");
    expect(f!.detail).toMatchObject({ column: "sex", selected: 0, withValue: 60 });
    expect(outcome.result).toBeNull();
  });

  // Final review I1 and M3: blank demographic values are counted, reported
  // and passed to the engine; whitespace-only counts as blank everywhere.
  it("counts records with a blank demographic value and reports them", () => {
    const records: Record<string, unknown>[] = [];
    for (let i = 0; i < 100; i++) {
      records.push({
        sex: i < 45 ? (i % 3 === 0 ? " " : "") : i % 2 ? "Male" : "Female",
        selected: i % 4 === 0,
      });
    }
    const outcome = runAudit(records, config, []);
    const f = outcome.gates.findings.find((x) => x.code === "demographic_values_missing");
    expect(f).toBeDefined();
    expect(f!.severity).toBe("note");
    expect(f!.detail).toMatchObject({ unknownRecords: 45, byColumn: { sex: 45 } });
    // A note informs; it does not withhold the PDF.
    expect(outcome.gates.mayExportPdf).toBe(true);
    expect(outcome.result!.unknownCount).toBe(45);
    expect(outcome.result!.summary).toContain("45 rows excluded due to missing data.");
    expect(outcome.result!.tables[0].rows.map((r) => r.categoryName)).toEqual(["Female", "Male"]);
  });

  // Final review I2: preconditions the engine would throw on are stops.
  it("returns a stop, not a throw, when scoring mode has no numeric score", () => {
    const records = [...Array(20)].map((_, i) => ({ sex: i % 2 ? "Male" : "Female" }));
    const scoring = { ...config, metric: "scoring_rate", scoreColumn: "score" };
    const outcome = runAudit(records, scoring, ["sex"]);
    expect(outcome.gates.findings.map((x) => x.code)).toContain("score_column_empty");
    expect(outcome.result).toBeNull();
  });

  it("returns a stop, not a throw, when fairness mode lacks its columns", () => {
    const records = [...Array(20)].map((_, i) => ({ sex: i % 2 ? "Male" : "Female" }));
    const fairness = { ...config, metric: "fairness_metrics" };
    const outcome = runAudit(records, fairness, ["sex"]);
    expect(outcome.gates.findings.map((x) => x.code)).toContain("fairness_columns_missing");
    expect(outcome.result).toBeNull();
  });

  // /code-review: inputs that previously reached an exportable result.
  it("stops when the fairness columns exist but hold no values", () => {
    const records = [...Array(40)].map((_, i) => ({
      sex: i % 2 ? "Male" : "Female",
      prediction: null,
      ground_truth: null,
    }));
    const outcome = runAudit(records, { ...config, metric: "fairness_metrics" });
    expect(outcome.gates.findings.map((x) => x.code)).toContain("fairness_columns_missing");
    expect(outcome.result).toBeNull();
  });

  it("stops when every prediction, or every ground truth, is the same", () => {
    const records = [...Array(40)].map((_, i) => ({
      sex: i % 2 ? "Male" : "Female",
      prediction: true,
      ground_truth: i % 3 === 0,
    }));
    const outcome = runAudit(records, { ...config, metric: "fairness_metrics" });
    const f = outcome.gates.findings.find((x) => x.code === "fairness_values_uniform");
    expect(f).toBeDefined();
    expect(f!.detail).toMatchObject({ column: "prediction" });
    expect(outcome.result).toBeNull();
  });

  it("stops on an empty dataset", () => {
    const outcome = runAudit([], config);
    expect(outcome.gates.findings.map((x) => x.code)).toContain("no_records");
    expect(outcome.gates.mayExportPdf).toBe(false);
    expect(outcome.result).toBeNull();
  });

  it("stops when no protected category is configured", () => {
    const outcome = runAudit(clean(), { ...config, categories: {} });
    expect(outcome.gates.findings.map((x) => x.code)).toContain("no_protected_category");
    expect(outcome.result).toBeNull();
  });

  it("stops when the intersectional analysis is required but not crossable", () => {
    const outcome = runAudit(clean(), {
      ...config,
      intersectional: { required: true, cross: ["sex"] },
    });
    expect(outcome.gates.findings.map((x) => x.code)).toContain("intersectional_misconfigured");
    expect(outcome.result).toBeNull();
  });

  it("order-checks every configured category when no attribute list is given", () => {
    const records = [
      ...[...Array(100)].map((_, i) => ({ sex: "Male", selected: i % 2 === 0 })),
      ...[...Array(100)].map((_, i) => ({ sex: "Female", selected: i % 3 === 0 })),
    ];
    const outcome = runAudit(records, config);
    expect(outcome.order.map((o) => o.attribute)).toEqual(["sex"]);
    expect(outcome.gates.findings.map((x) => x.code)).toContain("attribute_order_clustered");
  });

  it("names intersectional cells as the engine's table rows do", () => {
    const inter = {
      ...config,
      categories: {
        sex: { label: "Sex", groups: [] },
        race_ethnicity: { label: "Race/Ethnicity", groups: [] },
      },
      intersectional: { required: true, cross: ["sex", "race_ethnicity"] },
      smallSampleExclusion: null,
    };
    const records: Record<string, unknown>[] = [];
    for (let i = 0; i < 1000; i++) {
      records.push({
        sex: i % 7 === 0 ? "Female" : "Male",
        race_ethnicity: i % 350 === 0 ? "Asian" : "White", // 3 Female-Asian records
        selected: i % 4 === 0,
      });
    }
    const outcome = runAudit(records, inter);
    const f = outcome.gates.findings.find((x) => x.code === "cell_below_statutory_exclusion")!;
    const cells = (f.detail!.cells as Array<{ cell: string }>).map((c) => c.cell);
    const rowNames = outcome
      .result!.tables.find((t) => t.categoryKey === "intersectional")!
      .rows.map((r) => r.categoryName);
    for (const cell of cells) expect(rowNames).toContain(cell);
  });

  // Final review M2: every finding message, all five forbidden words.
  it("never uses forbidden vocabulary in any finding message", () => {
    const scoring = { ...config, metric: "scoring_rate", scoreColumn: "score" };
    const inter = {
      ...config,
      categories: {
        sex: { label: "Sex", groups: [] },
        race_ethnicity: { label: "Race/Ethnicity", groups: [] },
      },
      intersectional: { required: true, cross: ["sex", "race_ethnicity"] },
      smallSampleExclusion: null,
    };
    const scenarios: Array<[any, Record<string, unknown>[], string[]]> = [
      [config, [...Array(10)].map(() => ({ sex: "", selected: true })), ["sex"]],
      [config, [...Array(10)].map(() => ({ sex: "Male", selected: false })), ["sex"]],
      [
        scoring,
        [...Array(100)].map((_, i) => ({ sex: i % 2 ? "Male" : "Female", score: i < 75 ? 3 : 1 })),
        ["sex"],
      ],
      [
        scoring,
        [...Array(100)].map((_, i) => ({ sex: i % 2 ? "Male" : "Female", score: i < 3 ? 2 : 1 })),
        ["sex"],
      ],
      [scoring, [...Array(10)].map((_, i) => ({ sex: i % 2 ? "Male" : "Female" })), ["sex"]],
      [
        { ...config, metric: "fairness_metrics" },
        [...Array(10)].map((_, i) => ({ sex: i % 2 ? "Male" : "Female" })),
        ["sex"],
      ],
      [
        inter,
        [...Array(1000)].map((_, i) => ({
          sex: i < 5 ? "Female" : i < 600 ? "Male" : i < 900 ? "Female" : "",
          race_ethnicity: i < 5 ? "Asian" : "White",
          selected: i % 4 === 0,
        })),
        ["sex", "race_ethnicity"],
      ],
      [config, [], ["sex"]],
      [{ ...config, categories: {} }, clean(), []],
      [{ ...config, intersectional: { required: true, cross: ["sex"] } }, clean(), ["sex"]],
      [
        { ...config, metric: "fairness_metrics" },
        [...Array(20)].map((_, i) => ({
          sex: i % 2 ? "Male" : "Female",
          prediction: true,
          ground_truth: false,
        })),
        ["sex"],
      ],
    ];
    const seen = new Set<string>();
    for (const [cfg, records, attrs] of scenarios) {
      for (const f of runAudit(records, cfg, attrs).gates.findings) {
        seen.add(f.code);
        expect(f.message.toLowerCase()).not.toMatch(
          /\b(compliant|certified|passed|bias-free|audited)\b/,
        );
      }
    }
    expect([...seen].sort()).toEqual(
      [
        "all_or_none_selected",
        "attribute_order_clustered",
        "cell_below_statutory_exclusion",
        "degenerate_median",
        "demographic_column_majority_missing",
        "demographic_values_missing",
        "fairness_columns_missing",
        "fairness_values_uniform",
        "fewer_than_two_groups",
        "intersectional_misconfigured",
        "no_protected_category",
        "no_records",
        "score_column_empty",
        "score_granularity_low",
      ].sort(),
    );
  });

  it("computes a result but blocks the PDF on a warning", () => {
    const inter = {
      ...config,
      categories: {
        sex: { label: "Sex", groups: ["Male", "Female"] },
        race_ethnicity: { label: "Race/Ethnicity", groups: ["White", "Asian"] },
      },
      intersectional: { required: true, cross: ["sex", "race_ethnicity"] },
      smallSampleExclusion: null,
    };
    const records: Record<string, unknown>[] = [];
    for (let i = 0; i < 1000; i++) {
      records.push({
        sex: i < 5 ? "Female" : "Male",
        race_ethnicity: i < 5 ? "Asian" : "White",
        selected: i % 4 === 0,
      });
    }
    const outcome = runAudit(records, inter, ["sex", "race_ethnicity"]);
    expect(outcome.gates.mayComputeRatios).toBe(true);
    expect(outcome.gates.mayExportPdf).toBe(false);
    expect(outcome.result).not.toBeNull();
  });
});
