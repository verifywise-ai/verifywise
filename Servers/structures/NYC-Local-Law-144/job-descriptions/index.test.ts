import { JOB_DESCRIPTIONS, JOB_DESCRIPTION_KEYS } from "./index";
import type { JobDescriptionKey } from "./types";
import { findForbidden } from "../../../services/biasAudit/stance/vocabulary";

const KEYS = ["commercial-ae", "operational-hourly"] as const;

// Every authored string, one by one. Matching over JSON.stringify output would
// miss a word at the start of a line, because "\n" is serialised as two
// characters and the word then follows a backslash-n with no word boundary.
function rawStrings(key: JobDescriptionKey): string[] {
  const jd = JOB_DESCRIPTIONS[key];
  return [
    jd.roleTitle,
    jd.body,
    ...jd.expectedCriteria.flatMap((c) => [c.label, c.description]),
    ...jd.tiers.flatMap((t) => [t.label, t.narrative]),
  ];
}

describe("job descriptions", () => {
  it("provides exactly the two fixed roles", () => {
    expect(Object.keys(JOB_DESCRIPTIONS).sort()).toEqual([...KEYS].sort());
    expect([...JOB_DESCRIPTION_KEYS].sort()).toEqual([...KEYS].sort());
    for (const k of JOB_DESCRIPTION_KEYS) expect(JOB_DESCRIPTIONS[k].key).toBe(k);
  });

  it("gives each a real body, not a stub, and a title that fits a run's job description", () => {
    for (const key of KEYS) {
      expect(JOB_DESCRIPTIONS[key].body.length).toBeGreaterThan(600);
      expect(JOB_DESCRIPTIONS[key].roleTitle).toBeTruthy();
      // Task 10 stores the role title as a run's job_description_key (VARCHAR(64)).
      expect(JOB_DESCRIPTIONS[key].roleTitle.length).toBeLessThanOrEqual(64);
    }
  });

  it("names at least five expected criteria each", () => {
    for (const key of KEYS) {
      const c = JOB_DESCRIPTIONS[key].expectedCriteria;
      expect(c.length).toBeGreaterThanOrEqual(5);
      expect(new Set(c.map((x) => x.key)).size).toBe(c.length);
      for (const crit of c) {
        expect(crit.description.length).toBeGreaterThan(30);
      }
    }
  });
});

describe("qualification tiers", () => {
  it("defines five tiers per role", () => {
    for (const key of KEYS) {
      expect(JOB_DESCRIPTIONS[key].tiers).toHaveLength(5);
    }
  });

  it("makes the tiers strictly increasing in criteria met", () => {
    for (const key of KEYS) {
      const counts = JOB_DESCRIPTIONS[key].tiers.map((t) => t.criteriaMet.length);
      for (let i = 1; i < counts.length; i++) {
        expect(counts[i]).toBeGreaterThan(counts[i - 1]);
      }
    }
  });

  it("moves up by gradable criteria only, never dropping one", () => {
    // A criterion that scores everyone the same contributes noise and no
    // signal, so each step up must add gradable criteria and nothing else.
    for (const key of KEYS) {
      const jd = JOB_DESCRIPTIONS[key];
      const gradable = new Set(jd.expectedCriteria.filter((c) => c.gradable).map((c) => c.key));
      for (let i = 1; i < jd.tiers.length; i++) {
        const prev = jd.tiers[i - 1].criteriaMet;
        const cur = jd.tiers[i].criteriaMet;
        for (const k of prev) expect(cur).toContain(k);
        const added = cur.filter((k) => !prev.includes(k));
        expect(added.length).toBeGreaterThan(0);
        for (const k of added) expect(gradable.has(k)).toBe(true);
      }
    }
  });

  it("holds every non-gradable criterion constant across the tiers", () => {
    for (const key of KEYS) {
      const jd = JOB_DESCRIPTIONS[key];
      for (const c of jd.expectedCriteria.filter((x) => !x.gradable)) {
        const present = jd.tiers.map((t) => t.criteriaMet.includes(c.key));
        expect(new Set(present).size).toBe(1);
      }
    }
  });

  it("references only declared criteria in every tier", () => {
    for (const key of KEYS) {
      const jd = JOB_DESCRIPTIONS[key];
      const declared = new Set(jd.expectedCriteria.map((c) => c.key));
      for (const tier of jd.tiers) {
        for (const k of tier.criteriaMet) expect(declared.has(k)).toBe(true);
      }
    }
  });
});

describe("the two roles sit at opposite ends of the signal spectrum", () => {
  it("gives the commercial role more gradable criteria than the hourly one", () => {
    const ae = JOB_DESCRIPTIONS["commercial-ae"].expectedCriteria.filter((c) => c.gradable);
    const hourly = JOB_DESCRIPTIONS["operational-hourly"].expectedCriteria.filter(
      (c) => c.gradable,
    );
    expect(ae.length).toBeGreaterThan(hourly.length);
  });
});

describe("content rules", () => {
  it("uses no forbidden vocabulary", () => {
    // The module's own matcher and list, so this test cannot drift from the lint.
    for (const key of KEYS) {
      for (const text of rawStrings(key)) expect(findForbidden(text)).toEqual([]);
    }
  });

  it("carries no demographic or protected-characteristic language", () => {
    // The JD is the generation input. Demographic terms in it would put a
    // signal into every candidate regardless of their assigned group.
    //
    // Word boundaries, NOT substrings. "age" appears inside "manage a" and
    // "average"; "race" inside "trace" and "embrace"; "male" inside "female".
    // A substring check fails on correct content, which teaches an
    // implementer to weaken the test instead of the text.
    const words = [
      "male",
      "female",
      "man",
      "woman",
      "men",
      "women",
      "gender",
      "sex",
      "he",
      "she",
      "his",
      "her",
      "him",
      "hers",
      "himself",
      "herself",
      "hispanic",
      "latino",
      "latina",
      "asian",
      "white",
      "black",
      "ethnicity",
      "race",
      "racial",
      "religion",
      "religious",
      "national origin",
      "nationality",
      "native speaker",
      "citizen",
      "citizenship",
      "pregnancy",
      "pregnant",
      "veteran",
      "disability",
      "disabled",
      "age",
      "aged",
      "young",
      "younger",
      "older",
    ];
    for (const key of KEYS) {
      for (const text of rawStrings(key)) {
        for (const w of words) {
          expect({ w, hit: new RegExp(`\\b${w}\\b`, "i").test(text) }).toEqual({ w, hit: false });
        }
      }
    }
  });
});
