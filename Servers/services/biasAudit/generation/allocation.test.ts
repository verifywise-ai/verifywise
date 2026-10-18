import { buildAllocation, cellKey, LL144_RACE, LL144_SEX, MIN_PER_CELL } from "./allocation";

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

  it("produces exactly the requested count", () => {
    expect(buildAllocation({ count: 5000, tiers, smallSampleExclusion: 0.02 }).rows).toHaveLength(
      5000,
    );
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
    const races = rows.map((r) => r.demographics.raceEthnicity);
    let changes = 0;
    for (let i = 1; i < races.length; i++) if (races[i] !== races[i - 1]) changes++;
    expect(changes).toBeLessThan(50); // grouped, not interleaved
  });
});
