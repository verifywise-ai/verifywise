import { describe, it, expect } from "vitest";
import { loadConfig, parseConfig } from "./configLoader";

const VALID = `
models:
  - external_key: m1
    name: M1
    provider: in-house
    tier: "1"
    materiality_drivers: x
    dataset: credit-scoring.csv
    segment_col: segment
    metrics: [psi, auc]
    thresholds:
      - { metric: psi, op: gt, value_num: 0.2, severity: high, breach_action: notify }
`;

describe("configLoader", () => {
  it("parses a valid config into FleetModel[]", () => {
    const fleet = parseConfig(VALID);
    expect(fleet).toHaveLength(1);
    expect(fleet[0].externalKey).toBe("m1");
    expect(fleet[0].dataset).toBe("credit-scoring.csv");
    expect(fleet[0].segmentCol).toBe("segment");
    expect(fleet[0].metricKeys).toEqual(["psi", "auc"]);
    expect(fleet[0].thresholds[0].op).toBe("gt");
  });

  it("rejects a model missing dataset", () => {
    const bad = VALID.replace("    dataset: credit-scoring.csv\n", "");
    expect(() => parseConfig(bad)).toThrow(/dataset/i);
  });

  it("rejects a bad threshold op", () => {
    const bad = VALID.replace("op: gt", "op: bogus");
    expect(() => parseConfig(bad)).toThrow(/op/i);
  });

  it("rejects an unknown metric", () => {
    const bad = VALID.replace("metrics: [psi, auc]", "metrics: [psi, wat]");
    expect(() => parseConfig(bad)).toThrow(/metric/i);
  });

  it("loadConfig reads the real config.yaml and returns 4 models", () => {
    const fleet = loadConfig();
    expect(fleet.length).toBe(4);
    expect(fleet.map((m) => m.externalKey)).toContain("credit-scoring-v3");
  });
});
