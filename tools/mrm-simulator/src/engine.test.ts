import { describe, it, expect, vi } from "vitest";

vi.mock("./computeClient", () => ({
  computeMetrics: vi.fn(() => ({
    psi: 0.22,
    auc: 0.81,
    gini: 0.62,
    ks: 0.4,
    fairness: { subprime: { gini: 0.41 }, prime: { gini: 0.64 }, overall: { gini: 0.62 } },
  })),
}));

import { generatePoints } from "./engine";
import { FleetModel } from "./types";

const model: FleetModel = {
  externalKey: "loan-approval-v1",
  name: "Loan",
  provider: "in-house",
  tier: "2",
  materialityDrivers: "x",
  dataset: "loan-approval.csv",
  segmentCol: "segment",
  metricKeys: ["psi", "auc", "gini", "ks"],
  thresholds: [
    { metric: "gini", op: "outside", value_lo: 0.45, value_hi: 0.75, severity: "high", breach_action: "notify_flag_revalidation", segment: "subprime", window: null, value_num: null },
  ],
};

describe("engine (compute-backed)", () => {
  it("emits an overall point per metric plus a segmented gini point", () => {
    const pts = generatePoints(model, 0, new Date("2026-06-28T00:00:00Z"));
    // 4 overall (psi/auc/gini/ks) + 1 segmented gini (subprime)
    expect(pts.filter((p) => p.segment === "overall").length).toBe(4);
    const seg = pts.find((p) => p.segment === "subprime");
    expect(seg?.metric).toBe("gini");
    expect(seg?.value).toBe(0.41);
  });

  it("stamps ISO 'at' and finite values", () => {
    const pts = generatePoints(model, 0, new Date("2026-06-28T00:00:00Z"));
    for (const p of pts) {
      expect(Number.isFinite(p.value)).toBe(true);
      expect(p.at).toBe("2026-06-28T00:00:00.000Z");
    }
  });
});
