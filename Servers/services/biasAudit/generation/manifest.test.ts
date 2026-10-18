import { buildManifest, canonicalManifest } from "./manifest";

const assigned = [...Array(100)].map((_, i) => ({
  candidateId: `C${String(i + 1).padStart(4, "0")}`,
  demographics: { sex: i % 2 ? "Male" : "Female", raceEthnicity: `R${i % 7}` },
  tierKey: `t${(i % 5) + 1}`,
}));

const entry = (id: string, status: "valid" | "invalid" = "valid", model = "m1", attempt = 1) => ({
  candidateId: id,
  attempt,
  validationStatus: status,
  modelName: model,
  promptHash: "h",
});

describe("buildManifest", () => {
  // Review Focus 1
  it("is rebuilt from the full log, not from one pass", () => {
    // A resumed run that rewrites the manifest from only the resumed pass
    // left a 30-row manifest beside 340 artifacts on a real engagement.
    // Analysing against it would have computed the verdict on 30 candidates
    // and reported it as 340.
    const firstPass = assigned.slice(0, 40).map((a) => entry(a.candidateId));
    const secondPass = assigned.slice(40).map((a) => entry(a.candidateId));
    expect(buildManifest({ assigned, log: [...firstPass, ...secondPass] }).rows).toHaveLength(100);
    expect(buildManifest({ assigned, log: secondPass }).rows).toHaveLength(60);
    // The caller must pass the whole log; this test documents the difference.
  });

  it("takes the highest attempt when a candidate was retried", () => {
    const log = [entry("C0001", "valid", "m2", 2), entry("C0001", "invalid", "m1", 1)];
    const { rows } = buildManifest({ assigned: assigned.slice(0, 1), log });
    expect(rows).toHaveLength(1);
    expect(rows[0].modelName).toBe("m2");
  });

  it("excludes candidates whose latest attempt is invalid", () => {
    const log = assigned.map((a, i) => entry(a.candidateId, i < 90 ? "valid" : "invalid"));
    expect(buildManifest({ assigned, log }).rows).toHaveLength(90);
    const retriedThenFailed = [
      entry("C0001", "valid", "m1", 1),
      entry("C0001", "invalid", "m1", 2),
    ];
    expect(buildManifest({ assigned, log: retriedThenFailed }).rows).toHaveLength(0);
  });

  it("reports log entries for candidates absent from the plan", () => {
    const log = [...assigned.map((a) => entry(a.candidateId)), entry("C9999")];
    const out = buildManifest({ assigned, log });
    expect(out.rows).toHaveLength(100);
    expect(out.unknownCandidateIds).toEqual(["C9999"]);
  });

  it("counts demographics so a caller can verify the balance it asked for", () => {
    const { counts } = buildManifest({ assigned, log: assigned.map((a) => entry(a.candidateId)) });
    expect(counts["sex:Male"]).toBe(50);
    expect(counts["sex:Female"]).toBe(50);
    expect(counts["raceEthnicity:R0"]).toBe(15);
  });

  it("returns intersectional cell sizes keyed sex|race, from valid rows only", () => {
    const log = assigned.map((a) =>
      entry(a.candidateId, a.candidateId === "C0001" ? "invalid" : "valid"),
    );
    const { cellSizes } = buildManifest({ assigned, log });
    // C0001 is Female|R0.
    const full = buildManifest({ assigned, log: assigned.map((a) => entry(a.candidateId)) });
    expect(cellSizes["Female|R0"]).toBe(full.cellSizes["Female|R0"] - 1);
  });

  it("carries no generated text, only demographics and provenance, in candidate order", () => {
    const { rows } = buildManifest({
      assigned,
      log: [...assigned].reverse().map((a) => entry(a.candidateId)),
    });
    const keys = Object.keys(rows[0]);
    expect(keys).not.toContain("text");
    expect(keys).toContain("candidateId");
    expect(keys).toContain("sex");
    expect(rows.map((r) => r.candidateId)).toEqual(assigned.map((a) => a.candidateId));
  });
});

describe("canonicalManifest", () => {
  const { rows } = buildManifest({
    assigned,
    log: assigned.map((a) => entry(a.candidateId)),
  });

  it("serialises a JSONB round trip (keys reordered) to the same text", () => {
    // JSONB reorders object keys; reversing the key order stands in for that.
    const reordered = rows.map((r) =>
      Object.fromEntries(Object.entries(r).reverse()),
    ) as typeof rows;
    expect(Object.keys(reordered[0])).not.toEqual(Object.keys(rows[0]));
    expect(canonicalManifest(reordered)).toBe(canonicalManifest(rows));
  });

  it("refuses rows out of candidate-ID order, or repeated, rather than re-sorting them", () => {
    expect(() => canonicalManifest([...rows].reverse())).toThrow(/candidate-ID order/);
    expect(() => canonicalManifest([rows[0], rows[0]])).toThrow(/candidate-ID order/);
    expect(canonicalManifest([])).toBe("[]");
  });

  it("is sorted-key JSON with no whitespace, rows in candidate-ID order", () => {
    const text = canonicalManifest(rows.slice(0, 1));
    expect(text).toBe(
      '[{"candidateId":"C0001","modelName":"m1","promptHash":"h","raceEthnicity":"R0",' +
        '"sex":"Female","tierKey":"t1"}]',
    );
  });
});
