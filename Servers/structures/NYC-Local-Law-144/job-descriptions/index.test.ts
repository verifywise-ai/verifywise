import { JOB_DESCRIPTIONS, JOB_DESCRIPTION_KEYS } from "./index";
import { findForbidden } from "../../../services/biasAudit/stance/vocabulary";

const KEYS = ["commercial-ae", "operational-hourly"] as const;

describe("job descriptions", () => {
  it("provides exactly the two fixed roles", () => {
    expect(Object.keys(JOB_DESCRIPTIONS).sort()).toEqual([...KEYS].sort());
    expect([...JOB_DESCRIPTION_KEYS].sort()).toEqual([...KEYS].sort());
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

  // Review Focus 3, at generation time
  it("uses only gradable criteria to separate the top two tiers", () => {
    // A criterion that scores everyone the same contributes noise and no
    // signal. On a real engagement a third of the summary score was carried
    // by a category that separated nobody across 5,000 candidates, which
    // pushed the distribution upward and put the median on the top level.
    for (const key of KEYS) {
      const jd = JOB_DESCRIPTIONS[key];
      const gradable = new Set(jd.expectedCriteria.filter((c) => c.gradable).map((c) => c.key));
      const top = jd.tiers[4].criteriaMet;
      const second = jd.tiers[3].criteriaMet;
      const separating = top.filter((k) => !second.includes(k));
      expect(separating.length).toBeGreaterThan(0);
      for (const k of separating) {
        expect(gradable.has(k)).toBe(true);
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
  it("names no real company and no client", () => {
    const all = JSON.stringify(JOB_DESCRIPTIONS).toLowerCase();
    for (const n of ["puck", "spotted zebra", "curately", "verifywise"]) {
      expect(all).not.toContain(n);
    }
  });

  it("uses no forbidden vocabulary", () => {
    // The module's own matcher and list, so this test cannot drift from the lint.
    expect(findForbidden(JSON.stringify(JOB_DESCRIPTIONS))).toEqual([]);
  });

  it("carries no demographic or protected-characteristic language", () => {
    // The JD is the generation input. Demographic terms in it would put a
    // signal into every candidate regardless of their assigned group.
    //
    // Word boundaries, NOT substrings. "age" appears inside "manage a" and
    // "average"; "race" inside "trace" and "embrace"; "male" inside "female".
    // A substring check fails on correct content, which teaches an
    // implementer to weaken the test instead of the text.
    const all = JSON.stringify(JOB_DESCRIPTIONS);
    for (const w of [
      "male",
      "female",
      "hispanic",
      "latino",
      "asian",
      "white",
      "black",
      "disability",
      "disabled",
      "age",
      "aged",
      "young",
      "older",
      "ethnicity",
      "race",
    ]) {
      expect(all).not.toMatch(new RegExp(`\\b${w}\\b`, "i"));
    }
  });
});
