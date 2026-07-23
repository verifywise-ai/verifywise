import { describe, it, expect, vi } from "vitest";
import { runDashboardSimulation, RunnerDeps } from "./runner";
import { DashboardEvent } from "./events";
import { FleetModel } from "../types";

const model: FleetModel = {
  externalKey: "credit-scoring-v3",
  name: "Credit scoring v3",
  provider: "in-house",
  tier: "1",
  materialityDrivers: "x",
  dataset: "credit-scoring.csv",
  metricKeys: ["psi"],
  thresholds: [
    { metric: "psi", op: "gt", value_num: 0.2, value_lo: null, value_hi: null, severity: "high", breach_action: "notify_flag_revalidation", segment: null, window: null },
  ],
};

const makeDeps = (): RunnerDeps => ({
  loadConfig: () => [model],
  runSetup: vi.fn(async () => ({ token: "mrm_x", models: { "credit-scoring-v3": 5 }, findings: [] })),
  makeIngestClient: () => ({
    pushBatch: vi.fn(async (_key: string, points: any[]) =>
      points.map((p) => ({ metric: p.metric, at: p.at, status: (p.value > 0.2 ? "breach" : "ok") as "breach" | "ok", pointId: 1 })),
    ),
  }),
  // day 0 → psi 0.1 (ok); day 1 → psi 0.25 (breach)
  computeMetrics: (_ds: string, period: string) => ({ psi: period.endsWith("02") ? 0.25 : 0.1 }),
});

describe("runDashboardSimulation", () => {
  it("emits run_started, metrics, a breach, pushes, and run_done", async () => {
    const events: DashboardEvent[] = [];
    await runDashboardSimulation(
      makeDeps(),
      { cfg: { baseUrl: "http://localhost:3000", email: "e", password: "p", allowRemote: false }, startDate: new Date("2026-06-01T00:00:00Z"), days: 2 },
      (e) => events.push(e),
    );
    const types = events.map((e) => e.type);
    expect(types[0]).toBe("run_started");
    expect(types.at(-1)).toBe("run_done");
    expect(types).toContain("metric");
    expect(types).toContain("push");
    const breach = events.find((e) => e.type === "breach");
    expect(breach).toBeTruthy();
    expect((breach as any).externalKey).toBe("credit-scoring-v3");
    expect((breach as any).flagged).toBe(true);
    const done = events.find((e) => e.type === "run_done") as any;
    expect(done.totals.breaches).toBe(1);
    expect(done.totals.computed).toBeGreaterThan(0);
  });

  it("emits an error event and stops when compute throws", async () => {
    const deps = makeDeps();
    deps.computeMetrics = () => { throw new Error("boom for credit-scoring-v3"); };
    const events: DashboardEvent[] = [];
    await runDashboardSimulation(
      deps,
      { cfg: { baseUrl: "http://localhost:3000", email: "e", password: "p", allowRemote: false }, startDate: new Date("2026-06-01T00:00:00Z"), days: 2 },
      (e) => events.push(e),
    );
    expect(events.some((e) => e.type === "error")).toBe(true);
    expect(events.some((e) => e.type === "run_done")).toBe(false);
  });
});
