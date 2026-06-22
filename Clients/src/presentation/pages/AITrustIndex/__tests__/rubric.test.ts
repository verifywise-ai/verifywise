import { describe, it, expect } from "vitest";
import { summarizeDomains, INDICATOR_LABELS, INDICATOR_GAP_LABELS, AWARD_LABELS } from "../rubric";

describe("rubric", () => {
  it("AWARD_LABELS.half is Partial (upstream fix not regressed)", () => {
    expect(AWARD_LABELS.half).toBe("Partial");
  });
  it("LABELS and GAP_LABELS cover the same indicator ids", () => {
    const a = Object.keys(INDICATOR_LABELS).sort();
    const b = Object.keys(INDICATOR_GAP_LABELS).sort();
    expect(a).toEqual(b);
  });
  it("summarizeDomains computes credit over applicable indicators", () => {
    const ind = {
      "D1.1": { award: "full" as const },
      "D1.2": { award: "half" as const },
      "D1.3": { award: "zero" as const, subFlag: "SILENT" as const },
      "D1.4": { award: "zero" as const, subFlag: "NA" as const },
    };
    const d1 = summarizeDomains(ind).find((d) => d.id === "D1")!;
    expect(d1.applicable).toBe(3); // NA excluded
    expect(d1.full).toBe(1);
    expect(d1.half).toBe(1);
    expect(d1.zero).toBe(1);
    expect(d1.ratio).toBeCloseTo((1 + 0.5) / 3, 5);
  });
});
