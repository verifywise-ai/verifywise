import { describe, it, expect } from "vitest";
import { generatePoints, generateRange } from "./engine";
import { FLEET } from "../scenarios/fleet";

const model = (key: string) => FLEET.find((m) => m.externalKey === key)!;

describe("engine", () => {
  it("generates one point per metric key plus segmented points where thresholds are segmented", () => {
    const pts = generatePoints(model("loan-approval-v1"), 10, new Date("2026-07-01T00:00:00Z"));
    // 4 base metric keys + 1 segmented gini (subprime)
    expect(pts.filter((p) => p.segment === "subprime").length).toBe(1);
    expect(pts.length).toBe(5);
  });

  it("stamps ISO 'at' and finite values", () => {
    const pts = generatePoints(model("credit-scoring-v3"), 0, new Date("2026-07-01T00:00:00Z"));
    for (const p of pts) {
      expect(Number.isFinite(p.value)).toBe(true);
      expect(p.at).toBe("2026-07-01T00:00:00.000Z");
    }
  });

  it("generateRange produces days*perDay points", () => {
    const pts = generateRange(model("fraud-detector-v2"), new Date("2026-06-01T00:00:00Z"), 30);
    expect(pts.length).toBe(30 * 4); // 4 metric keys, no segmented threshold
  });
});
