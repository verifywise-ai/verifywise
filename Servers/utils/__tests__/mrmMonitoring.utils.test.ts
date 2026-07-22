/**
 * Tests for the MRM (Model Risk Management) — Branch 2 threshold-evaluation
 * engine. This is the correctness-critical, examiner-inspected core: a wrong
 * verdict here is what a bank examiner would flag. The functions under test are
 * PURE (no I/O), so these exercise them directly with no DB.
 *
 * The db module is mocked only so importing the utils file (which imports
 * sequelize) does not attempt a real connection — none of these tests touch it.
 */

import { describe, it, expect } from "@jest/globals";
import { jest } from "@jest/globals";

jest.mock("../../database/db", () => ({
  __esModule: true,
  sequelize: { query: jest.fn(), transaction: jest.fn() },
}));

import {
  DEFAULT_SEGMENT,
  DEFAULT_WINDOW,
  EvaluableThreshold,
  evaluatePoint,
  evaluateThreshold,
  normalizeSegment,
  normalizeWindow,
  selectThreshold,
  severityToBreachStatus,
  snapshotThreshold,
  thresholdMatchesPoint,
  thresholdSpecificity,
} from "../mrmMonitoring.utils";
import {
  MrmBreachAction,
  MrmEvalStatus,
  MrmThresholdOp,
  MrmThresholdSeverity,
} from "../../domain.layer/enums/mrmMonitoring.enum";

// A permissive threshold factory so each test states only what it cares about.
function threshold(over: Partial<EvaluableThreshold> = {}): EvaluableThreshold {
  return {
    id: 1,
    metric: "psi",
    segment: null,
    window: null,
    op: MrmThresholdOp.GT,
    value_num: 0.25,
    value_lo: null,
    value_hi: null,
    severity: MrmThresholdSeverity.HIGH,
    breach_action: MrmBreachAction.NOTIFY,
    active: true,
    ...over,
  };
}

describe("normalizeWindow / normalizeSegment", () => {
  it("maps a missing window to the empty-string sentinel", () => {
    expect(normalizeWindow(undefined)).toBe(DEFAULT_WINDOW);
    expect(normalizeWindow(null)).toBe(DEFAULT_WINDOW);
    expect(normalizeWindow("7d")).toBe("7d");
    // An explicit empty string is preserved (it IS the sentinel).
    expect(normalizeWindow("")).toBe("");
  });

  it("maps a missing or empty segment to 'overall'", () => {
    expect(normalizeSegment(undefined)).toBe(DEFAULT_SEGMENT);
    expect(normalizeSegment(null)).toBe(DEFAULT_SEGMENT);
    expect(normalizeSegment("")).toBe(DEFAULT_SEGMENT);
    expect(normalizeSegment("under_30")).toBe("under_30");
  });
});

describe("evaluateThreshold — the 5 operator shapes", () => {
  it("gt: breach strictly above value_num", () => {
    const t = threshold({ op: MrmThresholdOp.GT, value_num: 0.25 });
    expect(evaluateThreshold(MrmThresholdOp.GT, 0.26, t)).toBe(true);
    expect(evaluateThreshold(MrmThresholdOp.GT, 0.25, t)).toBe(false); // boundary NOT a breach
    expect(evaluateThreshold(MrmThresholdOp.GT, 0.24, t)).toBe(false);
  });

  it("gte: breach at or above value_num", () => {
    const t = threshold({ op: MrmThresholdOp.GTE, value_num: 0.25 });
    expect(evaluateThreshold(MrmThresholdOp.GTE, 0.25, t)).toBe(true); // boundary IS a breach
    expect(evaluateThreshold(MrmThresholdOp.GTE, 0.2499, t)).toBe(false);
  });

  it("lt: breach strictly below value_num", () => {
    const t = threshold({ op: MrmThresholdOp.LT, value_num: 0.7 });
    expect(evaluateThreshold(MrmThresholdOp.LT, 0.69, t)).toBe(true);
    expect(evaluateThreshold(MrmThresholdOp.LT, 0.7, t)).toBe(false); // boundary NOT a breach
  });

  it("lte: breach at or below value_num", () => {
    const t = threshold({ op: MrmThresholdOp.LTE, value_num: 0.7 });
    expect(evaluateThreshold(MrmThresholdOp.LTE, 0.7, t)).toBe(true); // boundary IS a breach
    expect(evaluateThreshold(MrmThresholdOp.LTE, 0.71, t)).toBe(false);
  });

  it("outside: breach when strictly below lo OR strictly above hi", () => {
    const t = threshold({
      op: MrmThresholdOp.OUTSIDE,
      value_num: null,
      value_lo: 0.2,
      value_hi: 0.8,
    });
    expect(evaluateThreshold(MrmThresholdOp.OUTSIDE, 0.1, t)).toBe(true); // below lo
    expect(evaluateThreshold(MrmThresholdOp.OUTSIDE, 0.9, t)).toBe(true); // above hi
    expect(evaluateThreshold(MrmThresholdOp.OUTSIDE, 0.5, t)).toBe(false); // inside band
    expect(evaluateThreshold(MrmThresholdOp.OUTSIDE, 0.2, t)).toBe(false); // on lo boundary
    expect(evaluateThreshold(MrmThresholdOp.OUTSIDE, 0.8, t)).toBe(false); // on hi boundary
  });

  it("treats a malformed threshold (missing operand) as NOT a breach, never throws", () => {
    const scalarNoValue = threshold({ op: MrmThresholdOp.GT, value_num: null });
    expect(evaluateThreshold(MrmThresholdOp.GT, 999, scalarNoValue)).toBe(false);
    const bandNoBounds = threshold({
      op: MrmThresholdOp.OUTSIDE,
      value_num: null,
      value_lo: null,
      value_hi: null,
    });
    expect(evaluateThreshold(MrmThresholdOp.OUTSIDE, 999, bandNoBounds)).toBe(false);
  });
});

describe("severityToBreachStatus mapping", () => {
  it("warn severity → status warn (soft breach)", () => {
    expect(severityToBreachStatus(MrmThresholdSeverity.WARN)).toBe(MrmEvalStatus.WARN);
  });
  it("high/critical severity → status breach (hard breach)", () => {
    expect(severityToBreachStatus(MrmThresholdSeverity.HIGH)).toBe(MrmEvalStatus.BREACH);
    expect(severityToBreachStatus(MrmThresholdSeverity.CRITICAL)).toBe(MrmEvalStatus.BREACH);
  });
});

describe("thresholdMatchesPoint", () => {
  const point = { metric: "psi", value: 0.3, segment: "overall", window: "" };

  it("matches an unscoped threshold (any segment / any window)", () => {
    expect(thresholdMatchesPoint(threshold({ segment: null, window: null }), point)).toBe(true);
  });

  it("does not match a different metric", () => {
    expect(thresholdMatchesPoint(threshold({ metric: "auc" }), point)).toBe(false);
  });

  it("does not match an inactive threshold", () => {
    expect(thresholdMatchesPoint(threshold({ active: false }), point)).toBe(false);
  });

  it("matches when the threshold segment equals the point segment", () => {
    const p = { ...point, segment: "under_30" };
    expect(thresholdMatchesPoint(threshold({ segment: "under_30" }), p)).toBe(true);
    expect(thresholdMatchesPoint(threshold({ segment: "over_30" }), p)).toBe(false);
  });

  it("treats 'overall' / '' segment as unscoped", () => {
    const p = { ...point, segment: "under_30" };
    expect(thresholdMatchesPoint(threshold({ segment: "overall" }), p)).toBe(true);
    expect(thresholdMatchesPoint(threshold({ segment: "" }), p)).toBe(true);
  });

  it("matches when the threshold window equals the point window", () => {
    const p = { ...point, window: "7d" };
    expect(thresholdMatchesPoint(threshold({ window: "7d" }), p)).toBe(true);
    expect(thresholdMatchesPoint(threshold({ window: "30d" }), p)).toBe(false);
    // null/'' window on the threshold = any window
    expect(thresholdMatchesPoint(threshold({ window: null }), p)).toBe(true);
  });
});

describe("thresholdSpecificity + selectThreshold tie-breaks", () => {
  const point = { metric: "psi", value: 0.3, segment: "under_30", window: "7d" };

  it("scores segment+window pinned above segment-only above unscoped", () => {
    expect(thresholdSpecificity(threshold({ segment: "under_30", window: "7d" }))).toBe(3);
    expect(thresholdSpecificity(threshold({ segment: "under_30", window: null }))).toBe(2);
    expect(thresholdSpecificity(threshold({ segment: null, window: "7d" }))).toBe(1);
    expect(thresholdSpecificity(threshold({ segment: null, window: null }))).toBe(0);
  });

  it("most-specific wins when all matching thresholds agree on the breach outcome", () => {
    // All three are GT 0.25 → all breach at 0.3; with no breach conflict, specificity decides.
    const unscoped = threshold({ id: 10, segment: null, window: null });
    const segmentPinned = threshold({ id: 11, segment: "under_30", window: null });
    const both = threshold({ id: 12, segment: "under_30", window: "7d" });
    const winner = selectThreshold([unscoped, segmentPinned, both], point);
    expect(winner?.id).toBe(12);
  });

  it("CONSERVATIVE: a catch-all breach beats a MORE-specific passing threshold (no masking)", () => {
    // The examiner-critical case. A loose segment-specific threshold must NOT be able
    // to silently suppress a catch-all breach. Breach wins regardless of specificity.
    const segmentPassing = threshold({
      id: 50,
      segment: "under_30",
      window: "7d", // most specific (spec 3)
      op: MrmThresholdOp.GT,
      value_num: 0.9, // 0.3 !> 0.9 → passes
    });
    const catchallBreaching = threshold({
      id: 51,
      segment: null,
      window: null, // least specific (spec 0)
      op: MrmThresholdOp.GT,
      value_num: 0.25, // 0.3 > 0.25 → breaches
    });
    const winner = selectThreshold([segmentPassing, catchallBreaching], point);
    expect(winner?.id).toBe(51); // the breaching catch-all, NOT the specific passing one
  });

  it("on equal specificity, a breaching threshold wins over a passing one", () => {
    // Both unscoped, same specificity. One breaches at 0.3, one does not.
    const passing = threshold({ id: 20, op: MrmThresholdOp.GT, value_num: 0.9 }); // 0.3 !> 0.9 → pass
    const breaching = threshold({ id: 21, op: MrmThresholdOp.GT, value_num: 0.25 }); // 0.3 > 0.25 → breach
    const winner = selectThreshold([passing, breaching], point);
    expect(winner?.id).toBe(21);
  });

  it("on equal specificity + both breaching, higher severity wins", () => {
    const warn = threshold({ id: 30, value_num: 0.1, severity: MrmThresholdSeverity.WARN });
    const critical = threshold({ id: 31, value_num: 0.1, severity: MrmThresholdSeverity.CRITICAL });
    const winner = selectThreshold([warn, critical], point);
    expect(winner?.id).toBe(31);
  });

  it("final tie-break is the lowest (oldest) id, deterministically", () => {
    const a = threshold({ id: 41, value_num: 0.1, severity: MrmThresholdSeverity.HIGH });
    const b = threshold({ id: 40, value_num: 0.1, severity: MrmThresholdSeverity.HIGH });
    const winner = selectThreshold([a, b], point);
    expect(winner?.id).toBe(40);
  });

  it("returns null when no threshold matches", () => {
    expect(selectThreshold([threshold({ metric: "auc" })], point)).toBeNull();
    expect(selectThreshold([], point)).toBeNull();
  });
});

describe("evaluatePoint — end-to-end verdict", () => {
  const point = { metric: "psi", value: 0.3, segment: "overall", window: "" };

  it("no matching threshold → no_threshold, not silent", () => {
    const result = evaluatePoint(point, []);
    expect(result.status).toBe(MrmEvalStatus.NO_THRESHOLD);
    expect(result.breached).toBe(false);
    expect(result.threshold).toBeNull();
    expect(result.snapshot).toBeNull();
  });

  it("matching threshold, within bounds → ok", () => {
    const t = threshold({ op: MrmThresholdOp.GT, value_num: 0.5 }); // 0.3 !> 0.5
    const result = evaluatePoint(point, [t]);
    expect(result.status).toBe(MrmEvalStatus.OK);
    expect(result.breached).toBe(false);
    expect(result.threshold?.id).toBe(t.id);
    expect(result.snapshot).not.toBeNull();
  });

  it("warn-severity breach → warn", () => {
    const t = threshold({
      op: MrmThresholdOp.GT,
      value_num: 0.25,
      severity: MrmThresholdSeverity.WARN,
    });
    const result = evaluatePoint(point, [t]);
    expect(result.status).toBe(MrmEvalStatus.WARN);
    expect(result.breached).toBe(true);
  });

  it("high/critical-severity breach → breach", () => {
    const high = threshold({
      op: MrmThresholdOp.GT,
      value_num: 0.25,
      severity: MrmThresholdSeverity.HIGH,
    });
    expect(evaluatePoint(point, [high]).status).toBe(MrmEvalStatus.BREACH);
    const critical = threshold({
      op: MrmThresholdOp.GT,
      value_num: 0.25,
      severity: MrmThresholdSeverity.CRITICAL,
    });
    expect(evaluatePoint(point, [critical]).status).toBe(MrmEvalStatus.BREACH);
  });

  it("snapshots the evaluated threshold shape for immutability", () => {
    const t = threshold({
      op: MrmThresholdOp.OUTSIDE,
      value_num: null,
      value_lo: 0.2,
      value_hi: 0.8,
      severity: MrmThresholdSeverity.CRITICAL,
      segment: "under_30",
      window: "7d",
    });
    const snap = snapshotThreshold(t);
    expect(snap).toEqual({
      op: MrmThresholdOp.OUTSIDE,
      value_num: undefined,
      value_lo: 0.2,
      value_hi: 0.8,
      severity: MrmThresholdSeverity.CRITICAL,
      segment: "under_30",
      window: "7d",
    });
  });
});
