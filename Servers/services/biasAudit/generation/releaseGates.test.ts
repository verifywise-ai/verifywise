import { runReleaseGates } from "./releaseGates";
import { MIN_PER_CELL, LL144_RACE, LL144_SEX, cellKey } from "./allocation";
import { findForbidden } from "../stance/vocabulary";

const cells = LL144_SEX.flatMap((sex) =>
  LL144_RACE.map((raceEthnicity) => cellKey({ sex, raceEthnicity })),
);

const base = {
  jobDescriptionKey: "commercial-ae",
  recordCount: 5000,
  manifestRowCount: 5000,
  idOrderChecks: {
    sex: { observed: 2498, expected: 2500.5, fraction: 0.999 },
    raceEthnicity: { observed: 4300, expected: 4286.7, fraction: 1.003 },
  },
  cellSizes: Object.fromEntries(cells.map((c) => [c, 357])),
  modelsObserved: { "pinned-model-1": 5000 },
  criteriaVerdict: "close" as const,
};

const codes = (f: ReturnType<typeof runReleaseGates>) => f.map((x) => x.code);

describe("a clean corpus releases", () => {
  it("returns no findings", () => {
    expect(runReleaseGates(base)).toEqual([]);
  });
});

describe("hard stops", () => {
  it("stops on blocked ID order", () => {
    const f = runReleaseGates({
      ...base,
      idOrderChecks: { raceEthnicity: { observed: 14, expected: 4286.7, fraction: 0.003 } },
    });
    expect(codes(f)).toContain("id_order_blocked");
    expect(f[0].severity).toBe("stop");
    expect(f[0].message).toMatch(/raceEthnicity/);
    expect(f[0].message).toMatch(/14/);
    expect(f[0].message).toMatch(/4287|4286/);
  });

  it("does not stop at exactly the strict threshold", () => {
    const f = runReleaseGates({
      ...base,
      idOrderChecks: { sex: { observed: 90, expected: 100, fraction: 0.9 } },
    });
    expect(codes(f)).not.toContain("id_order_blocked");
  });

  it("stops when the manifest row count does not match the corpus", () => {
    const f = runReleaseGates({ ...base, manifestRowCount: 30 });
    expect(codes(f)).toContain("manifest_count_mismatch");
    expect(f.find((x) => x.code === "manifest_count_mismatch")!.message).toMatch(
      /30.*5000|5000.*30/,
    );
  });

  it("stops on a cell too small to support a ratio", () => {
    const f = runReleaseGates({ ...base, cellSizes: { ...base.cellSizes, [cells[0]]: 12 } });
    const finding = f.find((x) => x.code === "cell_too_small")!;
    expect(finding.severity).toBe("stop");
    expect(finding.message).toContain(cells[0]);
    expect(finding.message).toContain("12");
    expect(finding.message).not.toMatch(/2%/);
  });

  it("treats a cell missing from cellSizes as empty", () => {
    const { [cells[0]]: _dropped, ...rest } = base.cellSizes;
    const f = runReleaseGates({ ...base, cellSizes: rest });
    expect(f.find((x) => x.code === "cell_too_small")!.message).toContain(cells[0]);
  });

  it("uses the allocation floor, MIN_PER_CELL, as the threshold", () => {
    const at = runReleaseGates({
      ...base,
      cellSizes: { ...base.cellSizes, [cells[0]]: MIN_PER_CELL },
    });
    const below = runReleaseGates({
      ...base,
      cellSizes: { ...base.cellSizes, [cells[0]]: MIN_PER_CELL - 1 },
    });
    expect(codes(at)).not.toContain("cell_too_small");
    expect(codes(below)).toContain("cell_too_small");
  });
});

describe("warnings", () => {
  it("warns when the corpus came from more than one model", () => {
    const f = runReleaseGates({ ...base, modelsObserved: { m1: 4000, m2: 1000 } });
    const w = f.find((x) => x.code === "multiple_models")!;
    expect(w.severity).toBe("warn");
    expect(w.message).toMatch(/not one configuration/i);
  });

  it("warns on divergent criteria", () => {
    const f = runReleaseGates({ ...base, criteriaVerdict: "divergent" });
    expect(f.find((x) => x.code === "criteria_divergent")!.severity).toBe("warn");
  });

  it("does not warn when criteria were simply not supplied", () => {
    const f = runReleaseGates({ ...base, criteriaVerdict: "not_supplied" });
    expect(codes(f)).not.toContain("criteria_divergent");
  });
});

describe("messages", () => {
  it("uses no forbidden vocabulary", () => {
    const f = runReleaseGates({
      ...base,
      manifestRowCount: 30,
      criteriaVerdict: "divergent",
      modelsObserved: { m1: 1, m2: 1 },
      idOrderChecks: { sex: { observed: 2, expected: 2500, fraction: 0.001 } },
      cellSizes: { ...base.cellSizes, [cells[0]]: 1 },
    });
    expect(f.length).toBeGreaterThanOrEqual(5);
    expect(findForbidden(f.map((x) => x.message).join(" "))).toEqual([]);
  });
});
