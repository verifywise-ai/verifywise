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
