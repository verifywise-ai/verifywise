import {
  buildAllocation,
  cellKey,
  MAX_COUNT,
  LL144_RACE,
  LL144_SEX,
  MIN_PER_CELL,
} from "./allocation";

describe("categories", () => {
  it("uses the two sexes and seven race categories LL 144 requires", () => {
    expect(LL144_SEX).toHaveLength(2);
    expect(LL144_RACE).toHaveLength(7);
  });

  it("exports the per-cell floor", () => {
    expect(MIN_PER_CELL).toBe(50);
  });
});

describe("buildAllocation", () => {
  const tiers = ["t1", "t2", "t3", "t4", "t5"];

  it("gives every cell the same tier mix and reports the achieved count", () => {
    const r = buildAllocation({ count: 5000, tiers, smallSampleExclusion: 0.02 });
    expect(r.rows).toHaveLength(4970);
    expect(r.count).toBe(4970);
    expect(Object.values(r.cellSizes).every((n) => n === 355)).toBe(true);
    const perCellTier = new Map<string, number>();
    for (const row of r.rows) {
      const k = `${cellKey(row.demographics)}#${row.tierKey}`;
      perCellTier.set(k, (perCellTier.get(k) ?? 0) + 1);
    }
    expect(perCellTier.size).toBe(70);
    expect([...perCellTier.values()].every((n) => n === 71)).toBe(true);
  });

  it("rounds a request down to a whole number per tier per cell", () => {
    expect(buildAllocation({ count: 700, tiers, smallSampleExclusion: 0.02 }).count).toBe(700);
    expect(buildAllocation({ count: 769, tiers, smallSampleExclusion: 0.02 }).count).toBe(700);
  });

  it("shares one frozen demographics object per cell", () => {
    const { rows } = buildAllocation({ count: 700, tiers, smallSampleExclusion: 0.02 });
    expect(Object.isFrozen(rows[0].demographics)).toBe(true);
    expect(rows[0].demographics).toBe(rows[1].demographics);
  });

  it("rejects bad inputs with their own errors", () => {
    const ok = { count: 1400, tiers, smallSampleExclusion: 0.02 };
    expect(() => buildAllocation({ ...ok, count: 1400.5 })).toThrow(/whole number/);
    expect(() => buildAllocation({ ...ok, count: NaN })).toThrow(/whole number/);
    expect(() => buildAllocation({ ...ok, count: MAX_COUNT + 1 })).toThrow(/exceed/);
    expect(() => buildAllocation({ ...ok, tiers: [] })).toThrow(/At least one tier/);
    expect(() => buildAllocation({ ...ok, tiers: ["a", " "] })).toThrow(/blank/);
    expect(() => buildAllocation({ ...ok, tiers: ["a", "a"] })).toThrow(/unique/);
    expect(() => buildAllocation({ ...ok, smallSampleExclusion: 0 })).toThrow(/between 0 and 1/);
    expect(() => buildAllocation({ ...ok, smallSampleExclusion: 1 })).toThrow(/between 0 and 1/);
    expect(() => buildAllocation({ ...ok, smallSampleExclusion: NaN })).toThrow(/between 0 and 1/);
    expect(() => buildAllocation({ ...ok, count: MAX_COUNT })).not.toThrow();
  });

  it("balances across all 14 intersectional cells, keyed sex|race", () => {
    const { cellSizes } = buildAllocation({ count: 5000, tiers, smallSampleExclusion: 0.02 });
    expect(Object.keys(cellSizes)).toHaveLength(14);
    expect(cellSizes[cellKey({ sex: "Female", raceEthnicity: "Asian" })]).toBeGreaterThan(0);
    const sizes = Object.values(cellSizes);
    expect(Math.max(...sizes) - Math.min(...sizes)).toBeLessThanOrEqual(1);
  });

  it("clears the 2% statutory exclusion by construction, at any size", () => {
    // A balanced allocation puts every cell at 1/14 = 7.14% of the sample,
    // which clears 5-301(d)'s 2% threshold regardless of the count. The
    // exclusion is therefore NOT the binding constraint on volume, and the
    // module must not claim it is.
    for (const count of [700, 1400, 5000]) {
      const { smallestCellFraction } = buildAllocation({
        count,
        tiers,
        smallSampleExclusion: 0.02,
      });
      expect(smallestCellFraction).toBeGreaterThan(0.02);
      expect(smallestCellFraction).toBeCloseTo(1 / 14, 2);
    }
  });

  it("refuses a count whose per-cell size is too small to mean anything", () => {
    // The binding constraint is per-cell COUNT, which is statistical power,
    // not the statutory exclusion. Simulating from observed within-race
    // distributions, a real effect of a previously measured size reproduced
    // the correct ordering 37% of the time at 100 per group and 62% at 357.
    // The floor is 50 per cell (700 records); below that a ratio is noise.
    expect(() => buildAllocation({ count: 200, tiers, smallSampleExclusion: 0.02 })).toThrow(
      /per cell|statistical power|at least 700/i,
    );
    expect(() => buildAllocation({ count: 699, tiers, smallSampleExclusion: 0.02 })).toThrow(
      /at least 700/i,
    );
    expect(() => buildAllocation({ count: 700, tiers, smallSampleExclusion: 0.02 })).not.toThrow();
  });

  it("balances tiers within every cell", () => {
    const { rows } = buildAllocation({ count: 1400, tiers, smallSampleExclusion: 0.02 });
    const byCell = new Map<string, Record<string, number>>();
    for (const r of rows) {
      const cell = cellKey(r.demographics);
      const counts = byCell.get(cell) ?? {};
      counts[r.tierKey] = (counts[r.tierKey] ?? 0) + 1;
      byCell.set(cell, counts);
    }
    for (const counts of byCell.values()) {
      const vals = tiers.map((t) => counts[t] ?? 0);
      expect(Math.max(...vals) - Math.min(...vals)).toBeLessThanOrEqual(1);
    }
  });

  it("is deterministic for the same inputs", () => {
    const a = buildAllocation({ count: 1400, tiers, smallSampleExclusion: 0.02 });
    const b = buildAllocation({ count: 1400, tiers, smallSampleExclusion: 0.02 });
    expect(JSON.stringify(a.rows)).toBe(JSON.stringify(b.rows));
  });

  it("returns rows in stratum order, which is why IDs must be permuted", () => {
    // build* deliberately returns grouped rows. Assigning IDs by walking
    // them in order puts every category in a contiguous ID range, and
    // generation runs in ID order. Task 3 is what prevents that.
    const { rows } = buildAllocation({ count: 1400, tiers, smallSampleExclusion: 0.02 });
    const expected: string[] = [];
    for (const sex of LL144_SEX) for (const race of LL144_RACE) expected.push(`${sex}|${race}`);
    const blocks: string[] = [];
    for (const r of rows) {
      const k = cellKey(r.demographics);
      if (blocks[blocks.length - 1] !== k) blocks.push(k);
    }
    expect(blocks).toEqual(expected);
  });
});
