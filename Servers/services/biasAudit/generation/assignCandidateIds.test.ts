import { buildAllocation } from "./allocation";
import {
  assignCandidateIds,
  GENERATED_MIN_RUN_FRACTION,
  IdOrderError,
  measureIdOrder,
  verifyIdOrder,
} from "./assignCandidateIds";
import { countRuns, expectedRuns } from "../idOrderCheck";

const tiers = ["t1", "t2", "t3", "t4", "t5"];
const alloc = (count = 1400) => buildAllocation({ count, tiers, smallSampleExclusion: 0.02 }).rows;
// Simulates the defect: ids assigned by walking the grouped rows.
const byIndex = (count = 1400) =>
  alloc(count).map((r, i) => ({ ...r, candidateId: `C${String(i + 1).padStart(4, "0")}` }));

describe("assignCandidateIds", () => {
  it("assigns one id per row, zero-padded and unique", () => {
    const { assigned } = assignCandidateIds({ rows: alloc(), seed: 5102026 });
    expect(assigned).toHaveLength(1400);
    expect(new Set(assigned.map((a) => a.candidateId)).size).toBe(1400);
    expect(assigned[0].candidateId).toMatch(/^C\d{4}$/);
  });

  it("interleaves protected attributes above the strict threshold", () => {
    const { checks } = assignCandidateIds({ rows: alloc(5000), seed: 5102026 });
    for (const attr of ["sex", "raceEthnicity"]) {
      expect(checks[attr].fraction).toBeGreaterThanOrEqual(GENERATED_MIN_RUN_FRACTION);
    }
  });

  it("uses the strict 0.9 threshold for generated corpora", () => {
    expect(GENERATED_MIN_RUN_FRACTION).toBe(0.9);
  });

  it("is deterministic for a seed", () => {
    const a = assignCandidateIds({ rows: alloc(), seed: 7 });
    const b = assignCandidateIds({ rows: alloc(), seed: 7 });
    expect(a.assigned.map((x) => x.candidateId)).toEqual(b.assigned.map((x) => x.candidateId));
  });

  it("produces a different order for a different seed", () => {
    const a = assignCandidateIds({ rows: alloc(), seed: 7 });
    const b = assignCandidateIds({ rows: alloc(), seed: 8 });
    // Assigned rows come back in ID order, so compare what each ID received.
    const seq = (r: typeof a) =>
      r.assigned.map((x) => `${x.demographics.sex}|${x.demographics.raceEthnicity}|${x.tierKey}`);
    expect(seq(a)).not.toEqual(seq(b));
  });

  it("throws IdOrderError when given rows in stratum order without permuting", () => {
    expect(() => verifyIdOrder(byIndex(), ["sex", "raceEthnicity"])).toThrow(IdOrderError);
  });

  it("names the attribute and both counts in the error", () => {
    expect(() => verifyIdOrder(byIndex(), ["raceEthnicity"])).toThrow(
      /raceEthnicity.*observed.*expected|raceEthnicity.*expected.*observed/is,
    );
  });

  it("measures without throwing, for the release-time check", () => {
    const checks = measureIdOrder(byIndex(), ["raceEthnicity"]);
    expect(checks.raceEthnicity.observed).toBe(14);
    expect(checks.raceEthnicity.fraction).toBeLessThan(0.02);
  });

  it("rejects a digit width too narrow for the population", () => {
    expect(() => assignCandidateIds({ rows: alloc(1400), seed: 7, digits: 2 })).toThrow(
      /digits|too narrow/i,
    );
  });
});

describe("the measured properties of the real defect", () => {
  it("would have measured 14 runs against about 4,286 expected", () => {
    const races = ["W", "B", "H", "A", "NH", "AI", "TM"];
    const values: string[] = [];
    for (const _sex of ["M", "F"]) {
      for (const r of races) for (let i = 0; i < 357; i++) values.push(r);
    }
    expect(countRuns(values)).toBe(14);
    expect(Math.round(expectedRuns(values))).toBe(4285);
  });
});
