import { joinScoresToManifest, tierSeparationFindings } from "./corpusJoin";

const manifest = [...Array(28)].map((_, i) => ({
  candidateId: `C${String(i + 1).padStart(4, "0")}`,
  sex: i % 2 ? "Male" : "Female",
  raceEthnicity: ["White", "Asian"][i % 2 === 0 ? 0 : 1],
  tierKey: `t${(i % 5) + 1}`,
  modelName: "m1",
  promptHash: "h",
}));
const upload = (ids: string[]) => ids.map((id) => ({ candidate_id: id, selected: true }));

describe("joinScoresToManifest", () => {
  it("injects sex and race/ethnicity from the manifest and drops the id", () => {
    const out = joinScoresToManifest(upload(manifest.map((m) => m.candidateId)), manifest);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.records[0]).toEqual({ selected: true, sex: "Female", race_ethnicity: "White" });
    expect(out.records[0]).not.toHaveProperty("candidate_id");
    expect(out.records).toHaveLength(28);
  });

  it("refuses an id the manifest does not hold, naming it", () => {
    const out = joinScoresToManifest(
      upload([...manifest.map((m) => m.candidateId), "C9999"]),
      manifest,
    );
    expect(out.ok).toBe(false);
    if (out.ok) return;
    const f = out.findings.find((x) => x.code === "corpus_ids_unknown")!;
    expect(f.severity).toBe("stop");
    expect(f.message).toContain("C9999");
  });

  it("names at most five unknown ids and counts the rest", () => {
    const extra = ["X1", "X2", "X3", "X4", "X5", "X6", "X7"];
    const out = joinScoresToManifest(
      upload([...manifest.map((m) => m.candidateId), ...extra]),
      manifest,
    );
    if (out.ok) throw new Error("expected a refusal");
    const f = out.findings.find((x) => x.code === "corpus_ids_unknown")!;
    expect(f.message).toContain("X5 and 2 more");
    expect(f.message).not.toContain("X6");
  });

  it("counts an unknown id once however often it repeats", () => {
    const out = joinScoresToManifest(
      upload([...manifest.map((m) => m.candidateId), "X1", "X1", "X1"]),
      manifest,
    );
    if (out.ok) throw new Error("expected a refusal");
    const f = out.findings.find((x) => x.code === "corpus_ids_unknown")!;
    expect(f.message).toMatch(/^1 candidate ID\(s\) are not in this corpus: X1\./);
  });

  it("refuses a duplicate id", () => {
    const ids = manifest.map((m) => m.candidateId);
    const out = joinScoresToManifest(upload([...ids, ids[0]]), manifest);
    expect(!out.ok && out.findings.map((x) => x.code)).toContain("corpus_ids_duplicate");
  });

  it("refuses a file missing some of the corpus, with the count", () => {
    const out = joinScoresToManifest(upload(manifest.slice(3).map((m) => m.candidateId)), manifest);
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.findings.find((x) => x.code === "corpus_ids_missing")!.message).toMatch(/\b3\b/);
  });

  it("refuses a blank id", () => {
    const out = joinScoresToManifest(upload(["", ...manifest.map((m) => m.candidateId)]), manifest);
    expect(!out.ok && out.findings.map((x) => x.code)).toContain("corpus_id_blank");
  });
});

// Review Focus 3, on the scored run
describe("tierSeparationFindings", () => {
  const tiers = ["t1", "t2", "t3", "t4", "t5"];
  const joined = (rate: (tier: string) => boolean) =>
    manifest.map((m) => ({ candidate_id: m.candidateId, selected: rate(m.tierKey) }));

  it("is silent when every tier selects more than the one below", () => {
    const perTier: Record<string, number> = { t1: 0, t2: 1, t3: 2, t4: 4, t5: 6 };
    const counts: Record<string, number> = {};
    const recs = manifest.map((m) => {
      counts[m.tierKey] = (counts[m.tierKey] ?? 0) + 1;
      return { candidate_id: m.candidateId, selected: counts[m.tierKey] <= perTier[m.tierKey] };
    });
    expect(tierSeparationFindings(recs, manifest, "selection_rate", tiers)).toEqual([]);
  });

  it("notes, naming both tiers, when adjacent tiers do not separate", () => {
    const f = tierSeparationFindings(
      joined((t) => t === "t4" || t === "t5"),
      manifest,
      "selection_rate",
      tiers,
    );
    const w = f.find((x) => x.code === "tier_does_not_separate" && /t5/.test(x.message))!;
    expect(w.severity).toBe("note");
    expect(w.message).toMatch(/t4.*t5|t5.*t4/);
  });

  it("names tiers by their labels when given them", () => {
    const f = tierSeparationFindings(
      joined((t) => t === "t4" || t === "t5"),
      manifest,
      "selection_rate",
      tiers,
      { t4: "Qualified", t5: "Strongly qualified" },
    );
    const w = f.find((x) => x.detail?.upper === "t5")!;
    expect(w.message).toContain('"Strongly qualified" does not sit above "Qualified"');
  });

  it("reports a reversal, where the upper tier sits below the lower", () => {
    const f = tierSeparationFindings(
      joined((t) => t !== "t5"),
      manifest,
      "selection_rate",
      tiers,
    );
    expect(f.map((x) => x.detail?.upper)).toContain("t5");
  });

  it("scales scores to the observed range for a scoring-rate run", () => {
    const recs = manifest.map((m) => ({
      candidate_id: m.candidateId,
      score: { t1: 10, t2: 20, t3: 30, t4: 40, t5: 40.1 }[m.tierKey as "t1"],
    }));
    const f = tierSeparationFindings(recs, manifest, "scoring_rate", tiers);
    expect(f.map((x) => x.code)).toContain("tier_does_not_separate");
    expect(f).toHaveLength(1);
  });

  it("skips a tier with no readable values", () => {
    const recs = manifest.map((m) => ({
      candidate_id: m.candidateId,
      score: m.tierKey === "t3" ? null : Number(m.tierKey.slice(1)) * 10,
    }));
    expect(tierSeparationFindings(recs, manifest, "scoring_rate", tiers)).toEqual([]);
  });
});
