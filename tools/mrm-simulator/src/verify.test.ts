import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Finding, FleetModel, IngestResultPoint, SimConfig } from "./types";

const { loginSpy, getRevalidationEventsSpy, getAttestationSummarySpy, fleet } = vi.hoisted(() => {
  const flagged: FleetModel = {
    externalKey: "flagged-model",
    name: "Flagged",
    provider: "in-house",
    tier: "1",
    materialityDrivers: "x",
    dataset: "credit-scoring.csv",
    metricKeys: ["psi"],
    thresholds: [
      {
        metric: "psi",
        op: "gt",
        value_num: 0.2,
        severity: "high",
        breach_action: "notify_flag_revalidation",
      },
    ],
  };
  const quiet: FleetModel = {
    externalKey: "quiet-model",
    name: "Quiet",
    provider: "in-house",
    tier: "2",
    materialityDrivers: "x",
    dataset: "fraud-detection.csv",
    metricKeys: ["auc"],
    thresholds: [
      {
        metric: "auc",
        op: "lt",
        value_num: 0.7,
        severity: "warn",
        breach_action: "notify",
      },
    ],
  };
  return {
    loginSpy: vi.fn(async () => {}),
    getRevalidationEventsSpy: vi.fn(async (_modelId: number): Promise<unknown[]> => []),
    getAttestationSummarySpy: vi.fn(async () => ({ models_total: 2 })),
    fleet: [flagged, quiet],
  };
});

vi.mock("./configLoader", () => ({
  loadConfig: () => fleet,
}));

vi.mock("./jwtClient", () => ({
  JwtClient: class {
    login = loginSpy;
    getRevalidationEvents = getRevalidationEventsSpy;
    getAttestationSummary = getAttestationSummarySpy;
  },
}));

import { runContractChecks, runVerify } from "./verify";

const cfg: SimConfig = {
  baseUrl: "http://localhost:3000",
  email: "e",
  password: "p",
  allowRemote: false,
};

const point = (metric: string, status: IngestResultPoint["status"]): IngestResultPoint => ({
  metric,
  at: "2026-06-01T00:00:00.000Z",
  status,
  pointId: 1,
});

const allHits = (): Record<string, IngestResultPoint[]> => ({
  "credit-scoring-v3": [point("psi", "breach")],
  "loan-approval-v1": [point("gini", "breach")],
  "churn-propensity-v1": [point("psi", "breach")],
});

const expectUx = (findings: Finding[]) => {
  expect(findings.filter((f) => f.category === "ux")).toEqual([
    expect.objectContaining({ severity: "low", title: "Manual UI review checklist" }),
  ]);
};

describe("runContractChecks", () => {
  it("returns no findings when every engineered pair is breach or warn", () => {
    expect(runContractChecks(allHits())).toEqual([]);
    const warned = allHits();
    warned["loan-approval-v1"] = [point("psi", "breach"), point("gini", "warn")];
    expect(runContractChecks(warned)).toEqual([]);
  });

  it("emits one high contract finding per miss: missing key, ok status, or an empty map", () => {
    const missing = allHits();
    delete missing["loan-approval-v1"];
    const missingFindings = runContractChecks(missing);
    expect(missingFindings).toHaveLength(1);
    expect(missingFindings[0]).toMatchObject({
      category: "contract",
      severity: "high",
      title: "Engineered breach never fired for loan-approval-v1/gini",
    });

    const ok = allHits();
    ok["credit-scoring-v3"] = [point("psi", "ok")];
    const okFindings = runContractChecks(ok);
    expect(okFindings).toHaveLength(1);
    expect(okFindings[0].title).toBe("Engineered breach never fired for credit-scoring-v3/psi");

    const empty = runContractChecks({});
    expect(empty).toHaveLength(3);
    expect(empty.map((f) => f.title)).toEqual([
      "Engineered breach never fired for credit-scoring-v3/psi",
      "Engineered breach never fired for loan-approval-v1/gini",
      "Engineered breach never fired for churn-propensity-v1/psi",
    ]);
    expect(empty.every((f) => f.category === "contract" && f.severity === "high")).toBe(true);
  });
});

describe("runVerify", () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    loginSpy.mockClear();
    getRevalidationEventsSpy.mockReset();
    getRevalidationEventsSpy.mockResolvedValue([]);
    getAttestationSummarySpy.mockReset();
    getAttestationSummarySpy.mockResolvedValue({ models_total: fleet.length });
    fetchSpy = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("live backend"));
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it("skips a flagging model that is missing from the cache and still emits the ux checklist", async () => {
    const findings = await runVerify(cfg, {});
    expect(getRevalidationEventsSpy).not.toHaveBeenCalled();
    expect(findings.filter((f) => f.category === "workflow")).toEqual([]);
    expectUx(findings);
    expect(loginSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("emits a high workflow finding when revalidation events are empty", async () => {
    const findings = await runVerify(cfg, { "flagged-model": 7 });
    expect(getRevalidationEventsSpy).toHaveBeenCalledTimes(1);
    expect(getRevalidationEventsSpy).toHaveBeenCalledWith(7);
    const high = findings.filter((f) => f.category === "workflow" && f.severity === "high");
    expect(high).toHaveLength(1);
    expect(high[0].title).toBe("Breach did not create a revalidation event for flagged-model");
    expect(findings.filter((f) => f.severity === "medium")).toEqual([]);
    expectUx(findings);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("emits no revalidation finding when events exist", async () => {
    getRevalidationEventsSpy.mockResolvedValue([{ id: 1 }]);
    const findings = await runVerify(cfg, { "flagged-model": 7 });
    expect(findings.filter((f) => f.category === "workflow")).toEqual([]);
    expectUx(findings);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("emits a medium attestation finding when models_total is below the fleet length", async () => {
    getRevalidationEventsSpy.mockResolvedValue([{ id: 1 }]);
    getAttestationSummarySpy.mockResolvedValue({ models_total: fleet.length - 1 });
    const findings = await runVerify(cfg, { "flagged-model": 7 });
    const medium = findings.filter((f) => f.category === "workflow" && f.severity === "medium");
    expect(medium).toHaveLength(1);
    expect(medium[0]).toMatchObject({
      title: "Attestation summary undercounts the fleet",
      expected: `models_total >= ${fleet.length}`,
      actual: `models_total = ${fleet.length - 1}`,
    });
    expect(findings.filter((f) => f.severity === "high")).toEqual([]);
    expectUx(findings);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("emits no attestation finding when models_total is at or above the fleet length", async () => {
    getRevalidationEventsSpy.mockResolvedValue([{ id: 1 }]);
    for (const total of [fleet.length, fleet.length + 1]) {
      getAttestationSummarySpy.mockResolvedValue({ models_total: total });
      const findings = await runVerify(cfg, { "flagged-model": 7 });
      expect(findings.filter((f) => f.severity === "medium")).toEqual([]);
      expectUx(findings);
    }
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
