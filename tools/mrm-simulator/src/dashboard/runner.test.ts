import { describe, it, expect, vi } from "vitest";
import { runDashboardSimulation, RunnerDeps } from "./runner";
import { DashboardEvent } from "./events";
import { FleetModel, ThresholdSpec } from "../types";

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

  const oneDay = {
    cfg: { baseUrl: "http://localhost:3000", email: "e", password: "p", allowRemote: false },
    startDate: new Date("2026-06-01T00:00:00.000Z"),
    days: 1,
  };

  const withThresholds = (thresholds: ThresholdSpec[], metricKeys: string[] = ["psi"]): FleetModel => ({
    ...model,
    metricKeys,
    thresholds,
  });

  const spec = (over: Partial<ThresholdSpec> & Pick<ThresholdSpec, "op">): ThresholdSpec => ({
    metric: "psi",
    value_num: 0.2,
    value_lo: null,
    value_hi: null,
    severity: "high",
    breach_action: "notify_flag_revalidation",
    segment: null,
    window: null,
    ...over,
  });

  const runDay = async (fleet: FleetModel[], computeMetrics: RunnerDeps["computeMetrics"]) => {
    const events: DashboardEvent[] = [];
    const deps: RunnerDeps = {
      loadConfig: () => fleet,
      runSetup: async () => ({ token: "mrm_x", models: {}, findings: [] }),
      makeIngestClient: () => ({
        pushBatch: async (_key, points) =>
          points.map((p) => ({ metric: p.metric, at: p.at, status: "ok" as const, pointId: 1 })),
      }),
      computeMetrics,
    };
    await runDashboardSimulation(deps, oneDay, (e) => events.push(e));
    return events;
  };

  const metricsOf = (events: DashboardEvent[]) =>
    events.filter((e): e is Extract<DashboardEvent, { type: "metric" }> => e.type === "metric");
  const breachesOf = (events: DashboardEvent[]) =>
    events.filter((e): e is Extract<DashboardEvent, { type: "breach" }> => e.type === "breach");

  it("gte breaches at the boundary and stays ok below it", async () => {
    const fleet = [withThresholds([spec({ op: "gte" })])];
    const at = await runDay(fleet, () => ({ psi: 0.2 }));
    expect(metricsOf(at)[0]).toMatchObject({ segment: "overall", status: "breach", value: 0.2 });
    expect(breachesOf(at)).toHaveLength(1);

    const below = await runDay(fleet, () => ({ psi: 0.1999 }));
    expect(metricsOf(below)[0]).toMatchObject({ status: "ok" });
    expect(breachesOf(below)).toHaveLength(0);
  });

  it("lt breaches below the boundary and stays ok at it", async () => {
    const fleet = [withThresholds([spec({ op: "lt" })])];
    const below = await runDay(fleet, () => ({ psi: 0.1999 }));
    expect(metricsOf(below)[0]).toMatchObject({ status: "breach", value: 0.1999 });
    expect(breachesOf(below)).toHaveLength(1);

    const at = await runDay(fleet, () => ({ psi: 0.2 }));
    expect(metricsOf(at)[0]).toMatchObject({ status: "ok" });
    expect(breachesOf(at)).toHaveLength(0);
  });

  it("lte breaches at the boundary and stays ok above it", async () => {
    const fleet = [withThresholds([spec({ op: "lte" })])];
    const at = await runDay(fleet, () => ({ psi: 0.2 }));
    expect(metricsOf(at)[0]).toMatchObject({ status: "breach", value: 0.2 });
    expect(breachesOf(at)).toHaveLength(1);

    const above = await runDay(fleet, () => ({ psi: 0.2001 }));
    expect(metricsOf(above)[0]).toMatchObject({ status: "ok" });
    expect(breachesOf(above)).toHaveLength(0);
  });

  it("outside stays ok inside the band and breaches below lo or above hi", async () => {
    const fleet = [withThresholds([spec({ op: "outside", value_num: null, value_lo: 0.45, value_hi: 0.75 })])];
    const inside = await runDay(fleet, () => ({ psi: 0.6 }));
    expect(metricsOf(inside)[0]).toMatchObject({ status: "ok", value: 0.6 });
    expect(breachesOf(inside)).toHaveLength(0);

    const low = await runDay(fleet, () => ({ psi: 0.4 }));
    expect(metricsOf(low)[0]).toMatchObject({ status: "breach", value: 0.4 });
    expect(breachesOf(low)).toHaveLength(1);

    const high = await runDay(fleet, () => ({ psi: 0.8 }));
    expect(metricsOf(high)[0]).toMatchObject({ status: "breach", value: 0.8 });
    expect(breachesOf(high)).toHaveLength(1);
  });

  it("emits warn status and a warn breach when severity is warn", async () => {
    const events = await runDay(
      [withThresholds([spec({ op: "gt", severity: "warn" })])],
      () => ({ psi: 0.25 }),
    );
    expect(metricsOf(events)[0]).toMatchObject({ status: "warn", value: 0.25 });
    expect(breachesOf(events)[0]).toMatchObject({ severity: "warn", value: 0.25 });
  });

  it("emits a segmented metric and a breach when that segment's threshold fails", async () => {
    const fleetModel = withThresholds(
      [spec({ metric: "gini", op: "lt", value_num: 0.45, segment: "subprime" })],
      ["gini"],
    );
    fleetModel.segmentCol = "segment";
    const events = await runDay([fleetModel], () => ({
      gini: 0.62,
      fairness: { subprime: { gini: 0.3 } },
    }));
    expect(metricsOf(events).find((e) => e.segment === "subprime")).toMatchObject({
      metric: "gini",
      value: 0.3,
      status: "breach",
    });
    expect(breachesOf(events)).toEqual([
      expect.objectContaining({ metric: "gini", value: 0.3, flagged: true }),
    ]);
  });

  it("flags a breach only when breach_action is notify_flag_revalidation", async () => {
    const flagged: FleetModel = { ...withThresholds([spec({ op: "gt" })]), externalKey: "flagged" };
    const plain: FleetModel = {
      ...withThresholds([spec({ op: "gt", breach_action: "notify" })]),
      externalKey: "plain",
    };
    const breaches = breachesOf(await runDay([flagged, plain], () => ({ psi: 0.3 })));
    expect(breaches.find((b) => b.externalKey === "flagged")).toMatchObject({ flagged: true });
    expect(breaches.find((b) => b.externalKey === "plain")).toMatchObject({ flagged: false });
  });
});
