import { checkIdOrder, countRuns, expectedRuns } from "./idOrderCheck";

describe("countRuns", () => {
  it("counts maximal consecutive stretches", () => {
    expect(countRuns(["A", "A", "B", "B", "A"])).toBe(3);
    expect(countRuns(["A", "B", "A", "B"])).toBe(4);
    expect(countRuns(["A", "A", "A"])).toBe(1);
    expect(countRuns([])).toBe(0);
    expect(countRuns(["A"])).toBe(1);
  });
});

describe("expectedRuns", () => {
  // Review Focus 3: the general formula, not n*(1-1/k).
  it("uses n + 1 - sum(ni^2)/n, which handles unequal group sizes", () => {
    // n=10, A=8, B=2 -> 10 + 1 - (64+4)/10 = 11 - 6.8 = 4.2
    const values = [...Array(8).fill("A"), ...Array(2).fill("B")];
    expect(expectedRuns(values)).toBeCloseTo(4.2, 6);
  });

  it("differs from the equal-group-size formula when groups are unequal", () => {
    const values = [...Array(8).fill("A"), ...Array(2).fill("B")];
    const wrong = values.length * (1 - 1 / 2); // 5.0
    expect(expectedRuns(values)).not.toBeCloseTo(wrong, 2);
  });

  it("agrees with the equal-group-size formula when groups are equal", () => {
    const values = [...Array(50).fill("A"), ...Array(50).fill("B")];
    // 100 + 1 - (2500+2500)/100 = 101 - 50 = 51; n*(1-1/k) = 50
    expect(expectedRuns(values)).toBeCloseTo(51, 6);
  });
});

describe("checkIdOrder", () => {
  it("flags an attribute assigned in contiguous blocks", () => {
    // The real defect: 14 blocks of ~357 across 5,000 records.
    const races = ["W", "B", "H", "A", "NH", "AI", "TM"];
    const records: Record<string, unknown>[] = [];
    for (const sex of ["Male", "Female"]) {
      for (const race of races) {
        for (let i = 0; i < 357; i++) records.push({ sex, race });
      }
    }
    const findings = checkIdOrder(records, ["sex", "race"]);

    const race = findings.find((f) => f.attribute === "race")!;
    expect(race.observedRuns).toBe(14);
    expect(race.expectedRuns).toBeGreaterThan(4000);
    expect(race.blocked).toBe(true);

    const sex = findings.find((f) => f.attribute === "sex")!;
    expect(sex.observedRuns).toBe(2);
    expect(sex.blocked).toBe(true);
  });

  it("passes a correctly interleaved corpus with unequal group sizes", () => {
    // Deterministic interleave, groups of 700/300. The equal-size formula
    // would mis-expect here; the general one must not flag it.
    const records: Record<string, unknown>[] = [];
    for (let i = 0; i < 1000; i++) records.push({ race: i % 10 < 7 ? "W" : "B" });
    for (let i = records.length - 1; i > 0; i--) {
      const j = (i * 7919) % (i + 1); // fixed permutation, no RNG
      [records[i], records[j]] = [records[j], records[i]];
    }
    const findings = checkIdOrder(records, ["race"]);
    expect(findings[0].blocked).toBe(false);
  });

  it("does not flag a clean two-block attribute as safe by its ratio alone", () => {
    // A two-block split averages position effects over half the data each
    // and they cancel, which is why a clean ratio is not reassurance.
    const records = [...Array(500).fill({ sex: "Male" }), ...Array(500).fill({ sex: "Female" })];
    const f = checkIdOrder(records, ["sex"])[0];
    expect(f.observedRuns).toBe(2);
    expect(f.blocked).toBe(true);
  });

  it("returns an empty list for no attributes", () => {
    expect(checkIdOrder([{ a: 1 }], [])).toEqual([]);
  });
});
