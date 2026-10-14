# Bias module: synthetic corpus generation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The module generates a balanced synthetic corpus against one of two fixed job descriptions, driven by the customer's intake answers, with the demographic manifest held separately so their platform scores blind — and refuses to release a corpus whose candidate IDs carry a protected attribute in blocks.

**Architecture:** A deterministic plan (allocation, qualification tiers, seeded ID permutation) computed before any network call, then one LLM call per record through the Vercel AI Gateway, then release gates. The planning and gate layers are pure functions; only the generator touches the network. The module-scoped API key never reaches the client.

**Tech Stack:** TypeScript, Node 22, Jest 30; Vercel AI Gateway over an OpenAI-compatible HTTP API (`LLM_API_KEY`, `LLM_BASE_URL`); BullMQ for the background job, which the platform already runs.

**Spec:** `docs/superpowers/specs/2026-10-14-ll144-self-service-module-design.md` (commits 5e2ad8b42, 764a78cb0)

**Plan 3 of 3.** Plans 1 and 2 must be complete: this plan consumes `countRuns`/`expectedRuns` from plan 1 and the question set's `generationField` markers plus the `generation` gate from plan 2. All three land before release.

## Global Constraints

- **No dependency on another VerifyWise module.** No import from `EvalServer/`, `AIGateway/`, `EvaluationModule/`, or another module's services, routes or tables. The platform AI Gateway is specifically excluded: generation calls the Vercel AI Gateway directly. BullMQ, Sequelize, auth middleware and the files table are platform primitives and are permitted.
- **The API key is module-scoped and never leaves the server.** Stored in the bias module's own settings, entered by VerifyWise, never returned by any endpoint, never logged, never in an error message. Task 8 asserts this.
- **No spend tracking.** Cost is immaterial: a comparable 4,918-record run cost USD 1.42.
- **The model is pinned in config; the model observed is read from each response.** Credentials do not select the provider, config does, and two prior corpora went through ten and eleven models before anyone noticed. A corpus routed across models is not one configuration.
- **Never map allocation rows onto candidate IDs with `zip` or by index.** Use the seeded permutation. This defect shipped twice in the Python tooling, producing a false race impact ratio of 0.8050 at p = 0.0010 that survived its own permutation test.
- **Generated corpora use the strict ID-order threshold, 0.9 of expected runs, as a hard gate.** Uploaded data uses 0.5 (plan 1). A seeded permutation measures 1.0043 on 7 categories over 5,000 records and 0.9762 on an unequal 700/300 split, so 0.9 does not reject a correct interleave.
- **The demographic manifest is never written into a corpus artifact.** It is stored separately and hashed separately, so the customer's platform scores material carrying no demographic signal.
- **No forbidden vocabulary** (`compliant`, `certified`, `passed`, `bias-free`) in source, prompts, job descriptions or generated artifacts. Task 8 asserts this.
- **Test commands:** `cd Servers && npm run test:unit -- <path>`; `npm run build`; `npm run lint`.

## Review Focus

1. **A generation run that fails partway.** Records 1–2,000 exist, 2,001–5,000 do not. Resuming must not rewrite the manifest from only the resumed pass: that produced a 30-row manifest beside 340 artifacts on a real engagement, which would have computed a verdict on 30 candidates and reported it as 340. Owned by Task 5.
- **2. A gateway that silently routes to a different model mid-run.** Every record succeeds and the corpus is not one configuration. Owned by Task 4.
3. **A corpus where one qualification tier does not separate candidates.** A criterion that scores everyone the same contributes noise and no signal; on a real engagement a third of the summary score was carried by a category that separated nobody, which pushed the distribution upward and put the median on the top level. Owned by Task 7.
4. **A customer whose platform generates criteria far from the expected set.** The corpus does not exercise their configuration, and the ratios describe our material rather than their tool. Owned by Task 6.
5. **Two concurrent generation runs for the same project.** Both write a manifest and both claim the project's corpus. Owned by Task 5.

---

### Task 1: The two fixed job descriptions

**Files:**
- Create: `Servers/structures/NYC-Local-Law-144/job-descriptions/types.ts`
- Create: `Servers/structures/NYC-Local-Law-144/job-descriptions/commercialAe.ts`
- Create: `Servers/structures/NYC-Local-Law-144/job-descriptions/operationalHourly.ts`
- Create: `Servers/structures/NYC-Local-Law-144/job-descriptions/index.ts`
- Test: `Servers/structures/NYC-Local-Law-144/job-descriptions/index.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `interface ExpectedCriterion { key: string; label: string; description: string; gradable: boolean }`
  - `interface JobDescription { key: "commercial-ae" | "operational-hourly"; roleTitle: string; body: string; expectedCriteria: ExpectedCriterion[]; tiers: QualificationTier[] }`
  - `interface QualificationTier { key: string; label: string; criteriaMet: string[]; narrative: string }`
  - `JOB_DESCRIPTIONS: Record<string, JobDescription>`

- [ ] **Step 1: Write the failing test**

```ts
import { JOB_DESCRIPTIONS } from "./index";

const KEYS = ["commercial-ae", "operational-hourly"];

describe("job descriptions", () => {
  it("provides exactly the two fixed roles", () => {
    expect(Object.keys(JOB_DESCRIPTIONS).sort()).toEqual(KEYS.sort());
  });

  it("gives each a real body, not a stub", () => {
    for (const key of KEYS) {
      expect(JOB_DESCRIPTIONS[key].body.length).toBeGreaterThan(600);
      expect(JOB_DESCRIPTIONS[key].roleTitle).toBeTruthy();
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

  // Review Focus 3
  it("uses only gradable criteria to separate the top two tiers", () => {
    // A criterion that scores everyone the same contributes noise and no
    // signal. On a real engagement a third of the summary score was carried
    // by a category that separated nobody across 5,000 candidates, which
    // pushed the distribution upward and put the median on the top level.
    for (const key of KEYS) {
      const jd = JOB_DESCRIPTIONS[key];
      const gradable = new Set(
        jd.expectedCriteria.filter((c) => c.gradable).map((c) => c.key),
      );
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
    const hourly = JOB_DESCRIPTIONS["operational-hourly"].expectedCriteria
      .filter((c) => c.gradable);
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
    const all = JSON.stringify(JOB_DESCRIPTIONS).toLowerCase();
    for (const w of ["compliant", "certified", "bias-free"]) {
      expect(all).not.toContain(w);
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
    const all = JSON.stringify(JOB_DESCRIPTIONS);
    for (const w of ["male", "female", "hispanic", "latino", "asian", "white",
                     "black", "disability", "disabled", "age", "aged", "young",
                     "older", "ethnicity", "race"]) {
      expect(all).not.toMatch(new RegExp(`\\b${w}\\b`, "i"));
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd ~/verifywise/Servers && npm run test:unit -- structures/NYC-Local-Law-144/job-descriptions/index.test.ts`
Expected: FAIL, cannot find module `./index`.

- [ ] **Step 3: Write the types and the commercial role**

Create `types.ts` with the four interfaces above, then `commercialAe.ts`:

```ts
import type { JobDescription } from "./types";

/**
 * Fixed job description 1 of 2: a commercial role with clearly gradable
 * attributes, so the qualification gradient separates candidates.
 *
 * Fixing the job description is a deliberate restriction. The expected
 * criteria are known ahead of time, so the gradient is designed and tested
 * once rather than derived per customer; every customer's corpus is
 * comparable; and the criteria-comparison check in Task 6 is only possible
 * because the expected set is fixed.
 *
 * Under 5-301 the audit attaches to the tool rather than the position
 * (FAQ III.4, confirmed at 20-871(a)(1)), so testing one role is
 * defensible. The stance names which role was tested.
 */
export const COMMERCIAL_AE: JobDescription = {
  key: "commercial-ae",
  roleTitle: "Account Executive",
  body: `...`,  // 600+ words: responsibilities, requirements, quota, cycle length
  expectedCriteria: [
    { key: "quota_attainment", label: "Quota attainment",
      description: "Evidence of individually carrying and meeting a revenue target.",
      gradable: true },
    { key: "deal_size", label: "Deal size",
      description: "Typical contract value handled, as a band.", gradable: true },
    { key: "cycle_length", label: "Sales cycle length",
      description: "Experience with cycles of the length this role runs.", gradable: true },
    { key: "full_cycle_ownership", label: "Full-cycle ownership",
      description: "Owning a deal from first contact through to close.", gradable: true },
    { key: "outbound_experience", label: "Outbound experience",
      description: "Generating pipeline rather than working inbound leads only.",
      gradable: true },
    { key: "sector_familiarity", label: "Sector familiarity",
      description: "Working in a comparable sector.", gradable: false },
  ],
  tiers: [
    { key: "t1_strongly_under", label: "Strongly underqualified",
      criteriaMet: [], narrative: "..." },
    { key: "t2_under", label: "Underqualified",
      criteriaMet: ["outbound_experience"], narrative: "..." },
    { key: "t3_borderline", label: "Borderline",
      criteriaMet: ["outbound_experience", "full_cycle_ownership"], narrative: "..." },
    { key: "t4_qualified", label: "Qualified",
      criteriaMet: ["outbound_experience", "full_cycle_ownership", "cycle_length",
                    "deal_size"], narrative: "..." },
    { key: "t5_strongly_qualified", label: "Strongly qualified",
      criteriaMet: ["outbound_experience", "full_cycle_ownership", "cycle_length",
                    "deal_size", "quota_attainment"], narrative: "..." },
  ],
};
```

Write the `body` and each `narrative` out in full; the tests assert length and the generator reads them as prompt material.

Two wording notes drawn from real criteria mismatches. Use **individual** where the criterion means a personal quota, because a team or pooled target does not satisfy it and a generated candidate must be unambiguous. And keep `outbound_experience` broader than "outbound only", since a candidate with only outbound may not satisfy a criterion phrased as full pipeline generation.

- [ ] **Step 4: Write the operational role**

Create `operationalHourly.ts` with the same shape. Fewer gradable criteria by design: this is the harder case, where a tool may score everyone similarly, and the module should be able to show that.

- [ ] **Step 5: Write the index and run the test**

Run: `cd ~/verifywise/Servers && npm run test:unit -- structures/NYC-Local-Law-144/job-descriptions/index.test.ts`
Expected: PASS, 11 tests.

- [ ] **Step 6: Commit**

```bash
cd ~/verifywise
git add Servers/structures/NYC-Local-Law-144/job-descriptions/
git commit -m "Add the two fixed job descriptions

A commercial role with clearly gradable attributes and an operational
hourly role with fewer. The pair sits at opposite ends of the signal
spectrum deliberately: the hourly case is where a tool may score everyone
similarly, and the module should be able to show that.

Fixing the job description makes the expected criteria known ahead of
time, so the gradient is designed and tested once rather than derived per
customer, every corpus is comparable, and the criteria-comparison check
becomes possible at all.

Only gradable criteria separate the top two tiers, asserted by test. A
criterion that scores everyone the same contributes noise and no signal:
on a real engagement a third of a summary score was carried by a category
that separated nobody across 5,000 candidates, which pushed the
distribution upward and put the median on the top level.

The job descriptions carry no demographic language, since the JD reaches
every candidate's prompt regardless of their assigned group."
```

---

### Task 2: Demographic allocation

**Files:**
- Create: `Servers/services/biasAudit/generation/allocation.ts`
- Test: `Servers/services/biasAudit/generation/allocation.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `interface Demographics { sex: string; raceEthnicity: string }`
  - `interface AllocationRow { demographics: Demographics; tierKey: string }`
  - `buildAllocation(args: { count: number; tiers: string[]; smallSampleExclusion: number }): { rows: AllocationRow[]; cellSizes: Record<string, number>; smallestCellFraction: number }`
  - `LL144_SEX: readonly string[]`, `LL144_RACE: readonly string[]`

- [ ] **Step 1: Write the failing test**

```ts
import { buildAllocation, LL144_RACE, LL144_SEX } from "./allocation";

describe("categories", () => {
  it("uses the two sexes and seven race categories LL 144 requires", () => {
    expect(LL144_SEX).toHaveLength(2);
    expect(LL144_RACE).toHaveLength(7);
  });
});

describe("buildAllocation", () => {
  const tiers = ["t1", "t2", "t3", "t4", "t5"];

  it("produces exactly the requested count", () => {
    expect(buildAllocation({ count: 5000, tiers, smallSampleExclusion: 0.02 }).rows)
      .toHaveLength(5000);
  });

  it("balances across all 14 intersectional cells", () => {
    const { cellSizes } = buildAllocation({ count: 5000, tiers, smallSampleExclusion: 0.02 });
    expect(Object.keys(cellSizes)).toHaveLength(14);
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
        count, tiers, smallSampleExclusion: 0.02,
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
    expect(() => buildAllocation({ count: 200, tiers, smallSampleExclusion: 0.02 }))
      .toThrow(/per cell|statistical power|at least 700/i);
    expect(() => buildAllocation({ count: 700, tiers, smallSampleExclusion: 0.02 }))
      .not.toThrow();
  });

  it("balances tiers within every cell", () => {
    const { rows } = buildAllocation({ count: 1400, tiers, smallSampleExclusion: 0.02 });
    const byCell = new Map<string, Record<string, number>>();
    for (const r of rows) {
      const cell = `${r.demographics.sex}|${r.demographics.raceEthnicity}`;
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
```

- [ ] **Step 2: Run it, confirm failure, implement**

Round-robin the 14 cells and the tiers within each. The "stratum order" test must pass: this function deliberately returns grouped rows, and Task 3 is the guard.

- [ ] **Step 3: Run the test, then commit**

Expected: PASS, 8 tests.

```bash
cd ~/verifywise
git add Servers/services/biasAudit/generation/
git commit -m "Add demographic allocation for generated corpora

Balances all 14 intersectional cells, which is what makes the mandatory
sex by race/ethnicity table reportable at all: a real applicant pool
often cannot support it. At 5,000 each cell holds 357 candidates.

A balanced allocation clears 5-301(d)'s 2% exclusion by construction at
any size, since each cell is always 1/14 of the sample. The exclusion is
therefore not the binding constraint on volume and the module does not
claim it is. The binding constraint is per-cell count, which is
statistical power: a real effect of a previously measured size
reproduced the correct ordering 37% of the time at 100 per group and 62%
at 357. A count below 50 per cell is refused.

Rows come back in stratum order deliberately, and a test pins that. The
ID assignment in the next task is what stops that order reaching
generation."
```

---

### Task 3: Seeded candidate-ID assignment with the release gate

The guard against the defect that shipped twice.

**Files:**
- Create: `Servers/services/biasAudit/generation/assignCandidateIds.ts`
- Test: `Servers/services/biasAudit/generation/assignCandidateIds.test.ts`

**Interfaces:**
- Consumes: `import { countRuns, expectedRuns } from "../idOrderCheck"` (plan 1 Task 7, one level up from `generation/`); `AllocationRow` from Task 2.
- Produces:
  - `class IdOrderError extends Error`
  - `GENERATED_MIN_RUN_FRACTION = 0.9`
  - `assignCandidateIds(args: { rows: AllocationRow[]; seed: number; digits?: number; attributes?: string[] }): { assigned: Array<{ candidateId: string } & AllocationRow>; checks: Record<string, { observed: number; expected: number; fraction: number }> }`
  - `verifyIdOrder(assigned: Array<{ candidateId: string } & AllocationRow>, attributes: string[], minFraction?: number): void` — throws `IdOrderError`. Exported so release gates can re-check without re-deriving.

- [ ] **Step 1: Write the failing test**

```ts
import { buildAllocation } from "./allocation";
import {
  assignCandidateIds, GENERATED_MIN_RUN_FRACTION, IdOrderError,
} from "./assignCandidateIds";

const tiers = ["t1", "t2", "t3", "t4", "t5"];
const alloc = (count = 1400) =>
  buildAllocation({ count, tiers, smallSampleExclusion: 0.02 }).rows;

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
    expect(a.assigned.map((x) => x.candidateId)).toEqual(
      b.assigned.map((x) => x.candidateId),
    );
  });

  it("produces a different order for a different seed", () => {
    const a = assignCandidateIds({ rows: alloc(), seed: 7 });
    const b = assignCandidateIds({ rows: alloc(), seed: 8 });
    expect(a.assigned.map((x) => x.candidateId)).not.toEqual(
      b.assigned.map((x) => x.candidateId),
    );
  });

  it("throws IdOrderError when given rows in stratum order without permuting", () => {
    // Simulates the defect: ids assigned by walking the grouped rows.
    const rows = alloc(1400);
    const byIndex = rows.map((r, i) => ({
      ...r, candidateId: `C${String(i + 1).padStart(4, "0")}`,
    }));
    const { verifyIdOrder } = require("./assignCandidateIds");
    expect(() => verifyIdOrder(byIndex, ["sex", "raceEthnicity"]))
      .toThrow(IdOrderError);
  });

  it("names the attribute and both counts in the error", () => {
    const rows = alloc(1400);
    const byIndex = rows.map((r, i) => ({
      ...r, candidateId: `C${String(i + 1).padStart(4, "0")}`,
    }));
    const { verifyIdOrder } = require("./assignCandidateIds");
    try {
      verifyIdOrder(byIndex, ["raceEthnicity"]);
      throw new Error("should have thrown");
    } catch (e: any) {
      expect(e.message).toMatch(/raceEthnicity/);
      expect(e.message).toMatch(/observed/i);
      expect(e.message).toMatch(/expected/i);
    }
  });

  it("rejects a digit width too narrow for the population", () => {
    expect(() => assignCandidateIds({ rows: alloc(1400), seed: 7, digits: 2 }))
      .toThrow(/digits|too narrow/i);
  });
});

describe("the measured properties of the real defect", () => {
  it("would have measured 14 runs against about 4,286 expected", () => {
    const { countRuns, expectedRuns } = require("../idOrderCheck");
    const races = ["W", "B", "H", "A", "NH", "AI", "TM"];
    const values: string[] = [];
    for (const _sex of ["M", "F"]) {
      for (const r of races) for (let i = 0; i < 357; i++) values.push(r);
    }
    expect(countRuns(values)).toBe(14);
    expect(Math.round(expectedRuns(values))).toBe(4285);
  });
});
```

- [ ] **Step 2: Run it, confirm failure, implement**

```ts
/**
 * Map allocation rows onto candidate IDs by a seeded permutation.
 *
 * NEVER zip or index allocation rows onto candidate IDs. `buildAllocation`
 * returns rows in stratum order, so walking them puts every protected
 * category in a contiguous ID range, and generation runs in ID order.
 * Anything that varies over the course of a run then maps onto one category
 * instead of spreading across all of them.
 *
 * This is not hypothetical. It shipped twice in the audit tooling this module
 * replaces. One corpus produced a lowest race impact ratio of 0.8050 with
 * three intersectional cells below 0.80, and it survived its own permutation
 * test at p = 0.0010: it looked like a finding about the tool. The corpus had
 * to be rebuilt and the client asked to rescore.
 *
 * Neither balance checks nor blueprint-independence tests catch it. Balance is
 * perfect while ordering is broken, and blueprints are byte-identical under
 * demographic permutation because the defect is in generation order. A clean
 * ratio is not reassurance either: on that corpus sex was the most perfectly
 * blocked attribute, one split at the midpoint, and returned 0.9770, because a
 * two-block split averages position effects over half the corpus each and they
 * cancel.
 *
 * So the gate lives here, beside the assignment, not in the caller. Four
 * planners were written against an equivalent allocation function in the
 * Python tooling; two permuted and two did not, and both that did not shipped
 * the defect — the second after the lesson had been written down elsewhere.
 */
export const GENERATED_MIN_RUN_FRACTION = 0.9;
```

Use a seeded LCG for the permutation so it is deterministic without a dependency. Export `verifyIdOrder` separately so it can be called again before release (Task 7).

- [ ] **Step 3: Run the test, then commit**

Expected: PASS, 10 tests.

```bash
cd ~/verifywise
git add Servers/services/biasAudit/generation/
git commit -m "Assign candidate IDs by seeded permutation, with a hard gate

The guard against a defect that shipped twice in the tooling this module
replaces. Allocation returns rows in stratum order and generation runs in
ID order, so assigning IDs by walking those rows puts every protected
category in a contiguous range: one corpus produced a lowest race impact
ratio of 0.8050 with three intersectional cells below 0.80, surviving its
own permutation test at p=0.0010, and had to be rebuilt and rescored.

The gate sits beside the assignment rather than in the caller, because
four planners were written against an equivalent function and the two
that forgot to permute both shipped the defect, the second after the
lesson was documented elsewhere.

Generated corpora use the strict 0.9 threshold. A seeded permutation
measures 1.0043 on 7 categories over 5,000 records, so the strict gate
does not reject correct work, while the real defect measured 14 runs
against 4,285 expected."
```

---

### Task 4: The Vercel AI Gateway client

**Files:**
- Create: `Servers/services/biasAudit/generation/gatewayClient.ts`
- Create: `Servers/services/biasAudit/generation/settings.ts`
- Test: `Servers/services/biasAudit/generation/gatewayClient.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `interface GatewaySettings { baseUrl: string; apiKey: string; model: string }`
  - `getGatewaySettings(organizationId: number): Promise<GatewaySettings>`
  - `interface CompletionResult { text: string; modelObserved: string; promptHash: string }`
  - `complete(settings: GatewaySettings, prompt: string, opts?): Promise<CompletionResult>`

- [ ] **Step 1: Write the failing test**

```ts
const mockFetch = jest.fn();
global.fetch = mockFetch as any;

import { complete } from "./gatewayClient";

const settings = {
  baseUrl: "https://gateway.example/v1",
  apiKey: "test-key-do-not-log",
  model: "pinned-model-1",
};

const ok = (model: string, text = "generated text") => ({
  ok: true,
  json: async () => ({ model, choices: [{ message: { content: text } }] }),
});

beforeEach(() => mockFetch.mockReset());

describe("complete", () => {
  it("sends the pinned model and returns the text", async () => {
    mockFetch.mockResolvedValue(ok("pinned-model-1"));
    const out = await complete(settings, "write a resume");
    expect(out.text).toBe("generated text");
    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.model).toBe("pinned-model-1");
  });

  // Review Focus 2
  it("records the model the response actually came from", async () => {
    mockFetch.mockResolvedValue(ok("some-other-model"));
    const out = await complete(settings, "p");
    expect(out.modelObserved).toBe("some-other-model");
    // Credentials do not select the provider, config does. Two prior corpora
    // went through ten and eleven models before anyone noticed, so the
    // observed model is read from the response, never assumed from config.
  });

  it("hashes the prompt so a corpus records what produced each record", async () => {
    mockFetch.mockResolvedValue(ok("pinned-model-1"));
    const a = await complete(settings, "same prompt");
    const b = await complete(settings, "same prompt");
    const c = await complete(settings, "different prompt");
    expect(a.promptHash).toBe(b.promptHash);
    expect(a.promptHash).not.toBe(c.promptHash);
    expect(a.promptHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("authenticates with a bearer token", async () => {
    mockFetch.mockResolvedValue(ok("pinned-model-1"));
    await complete(settings, "p");
    const headers = mockFetch.mock.calls[0][1].headers;
    expect(headers.Authorization).toBe("Bearer test-key-do-not-log");
  });
});

describe("the key never leaks", () => {
  it("is absent from an error raised on a failed request", async () => {
    mockFetch.mockResolvedValue({
      ok: false, status: 401,
      text: async () => 'unauthorized for key test-key-do-not-log',
    });
    await expect(complete(settings, "p")).rejects.toThrow(
      expect.objectContaining({
        message: expect.not.stringContaining("test-key-do-not-log"),
      }) as any,
    );
  });

  it("is absent from an error raised on a network failure", async () => {
    mockFetch.mockRejectedValue(new Error("connect ECONNREFUSED test-key-do-not-log"));
    try {
      await complete(settings, "p");
      throw new Error("should have thrown");
    } catch (e: any) {
      expect(e.message).not.toContain("test-key-do-not-log");
    }
  });

  it("is absent from a thrown error on a malformed response", async () => {
    mockFetch.mockResolvedValue({ ok: true, json: async () => ({ nope: true }) });
    try {
      await complete(settings, "p");
      throw new Error("should have thrown");
    } catch (e: any) {
      expect(e.message).not.toContain("test-key-do-not-log");
      expect(e.message).toMatch(/unexpected response/i);
    }
  });
});

describe("retries", () => {
  it("retries a 429 and succeeds", async () => {
    mockFetch
      .mockResolvedValueOnce({ ok: false, status: 429, text: async () => "slow down" })
      .mockResolvedValueOnce(ok("pinned-model-1"));
    const out = await complete(settings, "p", { retries: 1, retryDelayMs: 0 });
    expect(out.text).toBe("generated text");
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("gives up after the configured retries", async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 500, text: async () => "boom" });
    await expect(complete(settings, "p", { retries: 2, retryDelayMs: 0 }))
      .rejects.toThrow(/gateway request failed/i);
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });

  it("does not retry a 400", async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 400, text: async () => "bad" });
    await expect(complete(settings, "p", { retries: 3, retryDelayMs: 0 })).rejects.toThrow();
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run it, confirm failure, implement**

Every throw path constructs its own message and never interpolates the response body or the caught error's message, since both can contain the key. Scrub defensively:

```ts
function scrub(text: string, key: string): string {
  return key ? text.split(key).join("[redacted]") : text;
}
```

`settings.ts` reads the module's own settings row; `LLM_API_KEY`/`LLM_BASE_URL` env vars are the fallback for local development.

- [ ] **Step 3: Run the test, then commit**

Expected: PASS, 10 tests.

```bash
cd ~/verifywise
git add Servers/services/biasAudit/generation/
git commit -m "Add the Vercel AI Gateway client

OpenAI-compatible HTTP, matching the configuration that produced five
delivered audits. Module-scoped key, separate from other platform keys,
never returned by an endpoint.

The model observed is read from each response rather than assumed from
config, because credentials do not select the provider and two prior
corpora went through ten and eleven models before anyone noticed. A
corpus routed across models is not one configuration.

Three tests assert the key is absent from errors raised on a failed
request, a network failure and a malformed response, each of which can
carry it in the text being wrapped."
```

---

### Task 5: The generation job with resumable manifests

**Files:**
- Create: `Servers/services/biasAudit/generation/manifest.ts`
- Create: `Servers/services/biasAudit/generation/generateCorpus.ts`
- Create: `Servers/database/migrations/20261014130000-bias-audit-corpora.js`
- Modify: `Servers/utils/biasAudit.utils.ts` — append the three corpus queries
- Test: `Servers/services/biasAudit/generation/manifest.test.ts`
- Test: `Servers/services/biasAudit/generation/generateCorpus.test.ts`

**Interfaces:**
- Consumes: Tasks 1–4.
- Produces:
  - ```ts
    interface AssignedRow {
      candidateId: string;
      demographics: { sex: string; raceEthnicity: string };
      tierKey: string;
    }

    interface GenerationLogEntry {
      candidateId: string;
      validationStatus: "passed" | "failed";
      modelName: string;
      promptHash: string;
    }

    interface ManifestRow {
      candidateId: string;
      sex: string;
      raceEthnicity: string;
      tierKey: string;
      modelName: string;
      promptHash: string;
      validationStatus: string;
    }

    interface GenerateCorpusArgs {
      projectId: number;
      profileId: number;
      profileVersion: number;
      organizationId: number;
      userId: number;
      jobDescriptionKey: "commercial-ae" | "operational-hourly";
      artifactKind: "resume" | "transcript" | "structured";   // from pipeline.input_form
      knockoutExists: boolean;                                 // from knockout.exists
      count: number;
      seed: number;
    }
    ```
  - `buildManifest(args: { assigned: AssignedRow[]; log: GenerationLogEntry[] }): { rows: ManifestRow[]; counts: Record<string, number> }`
  - `generateCorpus(args: GenerateCorpusArgs): Promise<{ corpusId: number; recordCount: number; modelsObserved: Record<string, number> }>`
  - `createCorpusQuery`, `updateCorpusStatusQuery`, `getCorpusQuery` — appended to `Servers/utils/biasAudit.utils.ts`, following the tenant-scoped pattern established there.
  - tables `bias_audit_corpora` and `bias_audit_settings`

`artifactKind` and `knockoutExists` come from the question set's `generationField` markers
(`pipeline.input_form` and `knockout.exists`). The caller resolves them from the attested
profile; this function does not read answers itself.

- [ ] **Step 1: Write the migration**

Two tables. Follow the `createTable` pattern from plan 2 Task 2, schema `verifywise`, with
`organization_id` referencing `organizations` ON DELETE CASCADE.

**`bias_audit_corpora`** — columns per the spec, plus `status`
(`running` / `complete` / `failed`), `seed`, `models_observed_json`, `id_order_check_json`,
`manifest_sha256`, `corpus_sha256`, `manifest_json`, `record_count`, `artifact_kind`,
`job_description_key`, `profile_id`, `profile_version`, `generated_by`, `generated_at`.

A partial unique index prevents two running corpora per project:

```sql
CREATE UNIQUE INDEX bias_audit_corpora_one_running_uq
  ON verifywise.bias_audit_corpora (project_id)
  WHERE status = 'running';
```

**`bias_audit_settings`** — the module-scoped gateway credentials. Nothing else in these plans
creates this table, and Task 4's `getGatewaySettings` reads it, so it belongs here.

```
id, organization_id        unique, one row per organization
base_url                   text
api_key_encrypted          text, never returned by any endpoint
model                      text, the pinned model
updated_by, updated_at
```

Unique on `organization_id` alone, following
`20261012091252-shadow-ai-settings-unique-org.js`.

Retention: a generated corpus is synthetic and contains no real applicant data, so corpora are
retained indefinitely and this module is deliberately outside the platform's data-retention
subsystem. Stated here rather than left to inference.

- [ ] **Step 2: Write the failing manifest test**

```ts
import { buildManifest } from "./manifest";

const assigned = [...Array(100)].map((_, i) => ({
  candidateId: `C${String(i + 1).padStart(4, "0")}`,
  demographics: { sex: i % 2 ? "Male" : "Female", raceEthnicity: `R${i % 7}` },
  tierKey: `t${(i % 5) + 1}`,
}));

const entry = (id: string, status = "passed", model = "m1") => ({
  candidateId: id, validationStatus: status, modelName: model, promptHash: "h",
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
    const full = buildManifest({ assigned, log: [...firstPass, ...secondPass] });
    const resumedOnly = buildManifest({ assigned, log: secondPass });
    expect(full.rows).toHaveLength(100);
    expect(resumedOnly.rows).toHaveLength(60);
    // The caller must pass the whole log; this test documents the difference.
  });

  it("takes the last occurrence when a candidate was retried", () => {
    const log = [
      entry("C0001", "failed", "m1"),
      entry("C0001", "passed", "m2"),
    ];
    const { rows } = buildManifest({ assigned: assigned.slice(0, 1), log });
    expect(rows).toHaveLength(1);
    expect(rows[0].modelName).toBe("m2");
  });

  it("excludes records that never passed validation", () => {
    const log = assigned.map((a, i) => entry(a.candidateId, i < 90 ? "passed" : "failed"));
    expect(buildManifest({ assigned, log }).rows).toHaveLength(90);
  });

  it("warns when the log names a candidate absent from the plan", () => {
    const log = [...assigned.map((a) => entry(a.candidateId)), entry("C9999")];
    const { rows } = buildManifest({ assigned, log });
    expect(rows).toHaveLength(100);
  });

  it("counts demographics so a caller can verify the balance it asked for", () => {
    const log = assigned.map((a) => entry(a.candidateId));
    const { counts } = buildManifest({ assigned, log });
    expect(counts["sex:Male"]).toBe(50);
    expect(counts["sex:Female"]).toBe(50);
  });

  it("carries no generated text, only demographics and provenance", () => {
    const log = assigned.map((a) => entry(a.candidateId));
    const { rows } = buildManifest({ assigned, log });
    const keys = Object.keys(rows[0]);
    expect(keys).not.toContain("text");
    expect(keys).not.toContain("content");
    expect(keys).toContain("candidateId");
    expect(keys).toContain("sex");
  });
});
```

- [ ] **Step 3: Write the failing corpus test**

Mock the gateway client and the utils. Cover: the ID-order gate runs on the assigned plan before any network call; a mid-run failure leaves `status = 'running'` and resuming completes from the full log; `modelsObserved` counts every distinct model; the manifest hash and corpus hash differ; the manifest is not written into the corpus artifact.

```ts
it("gates ID order before spending anything on generation", async () => {
  // The gate is cheap and the generation is not; a blocked plan must fail
  // before the first request.
  // ... assert mockComplete was never called
});

it("records every model observed, not the pinned one", async () => {
  mockComplete
    .mockResolvedValueOnce({ text: "a", modelObserved: "m1", promptHash: "h" })
    .mockResolvedValue({ text: "b", modelObserved: "m2", promptHash: "h" });
  const out = await generateCorpus({ /* count: 14 */ } as any);
  expect(Object.keys(out.modelsObserved).sort()).toEqual(["m1", "m2"]);
});

// Review Focus 5
it("refuses a second concurrent run for the same project", async () => {
  const err: any = new Error("duplicate key");
  err.original = { code: "23505", constraint: "bias_audit_corpora_one_running_uq" };
  mockUtils.createCorpusQuery.mockRejectedValueOnce(err);
  await expect(generateCorpus({} as any)).rejects.toThrow(/already running/i);
});

it("keeps the manifest out of the corpus artifact", async () => {
  const out = await generateCorpus({} as any);
  const corpus = mockUtils.createCorpusQuery.mock.calls[0][0];
  expect(corpus.manifestSha256).not.toBe(corpus.corpusSha256);
  // The artifact the customer receives carries no demographic column.
});
```

- [ ] **Step 4: Implement, run both test files**

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd ~/verifywise
git add Servers/services/biasAudit/generation/ Servers/database/migrations/
git commit -m "Add corpus generation with a resumable manifest

The manifest is rebuilt by joining the deterministic plan to the full
append-only log, not written from the records of the current pass. A
resumed run that rewrote it from one pass left a 30-row manifest beside
340 artifacts on a real engagement: analysing against it would have
computed the verdict on 30 candidates and reported it as 340.

The ID-order gate runs on the plan before the first request, since the
gate is cheap and generation is not. Every model observed is counted from
the responses. A partial unique index refuses a second concurrent run per
project, so two manifests cannot both claim the project's corpus.

The manifest is stored and hashed separately from the corpus, so the
artifact the customer sends to their platform carries no demographic
column and their tool scores blind."
```

---

### Task 6: The criteria-comparison check

**Files:**
- Create: `Servers/services/biasAudit/criteriaComparison.ts`
- Test: `Servers/services/biasAudit/criteriaComparison.test.ts`

**Interfaces:**
- Consumes: `JOB_DESCRIPTIONS` from Task 1.
- Produces:
  - `interface CriteriaComparison { supplied: string[]; matched: Array<{ expected: string; supplied: string; score: number }>; unmatchedExpected: string[]; unmatchedSupplied: string[]; verdict: "close" | "divergent" | "not_supplied" }`
  - `compareCriteria(jobDescriptionKey: string, suppliedText: string | null): CriteriaComparison`

- [ ] **Step 1: Write the failing test**

```ts
import { compareCriteria } from "./criteriaComparison";

describe("compareCriteria", () => {
  it("reports not_supplied for empty input", () => {
    expect(compareCriteria("commercial-ae", null).verdict).toBe("not_supplied");
    expect(compareCriteria("commercial-ae", "   ").verdict).toBe("not_supplied");
  });

  it("matches a close set", () => {
    const supplied = [
      "Quota attainment", "Deal size", "Sales cycle length",
      "Full-cycle ownership", "Outbound experience", "Sector familiarity",
    ].join("\n");
    const out = compareCriteria("commercial-ae", supplied);
    expect(out.verdict).toBe("close");
    expect(out.unmatchedExpected).toEqual([]);
  });

  it("tolerates different wording for the same criterion", () => {
    const supplied = [
      "Has carried an individual revenue target",
      "Typical contract value",
      "Length of sales cycles handled",
      "Owns deals end to end",
      "Generates own pipeline",
      "Industry background",
    ].join("\n");
    const out = compareCriteria("commercial-ae", supplied);
    expect(out.matched.length).toBeGreaterThanOrEqual(4);
  });

  // Review Focus 4
  it("reports divergent when the platform generates a materially different set", () => {
    // Five generated criteria against eight reconstructed forced a full
    // remap on a real engagement, and the gradient lost its top rung
    // because the only criterion separating solid from strong was dropped.
    const supplied = ["Communication", "Teamwork", "Availability"].join("\n");
    const out = compareCriteria("commercial-ae", supplied);
    expect(out.verdict).toBe("divergent");
    expect(out.unmatchedExpected.length).toBeGreaterThan(2);
  });

  it("names which expected criteria were not matched", () => {
    const supplied = ["Quota attainment", "Deal size"].join("\n");
    const out = compareCriteria("commercial-ae", supplied);
    expect(out.unmatchedExpected).toContain("cycle_length");
    expect(out.unmatchedExpected).toContain("full_cycle_ownership");
  });

  it("names criteria the platform generated that we did not expect", () => {
    const supplied = [
      "Quota attainment", "Deal size", "Sales cycle length", "Full-cycle ownership",
      "Outbound experience", "Sector familiarity", "Security clearance",
    ].join("\n");
    const out = compareCriteria("commercial-ae", supplied);
    expect(out.unmatchedSupplied.some((s) => /clearance/i.test(s))).toBe(true);
  });

  it("parses a comma-separated list as well as newlines", () => {
    const out = compareCriteria("commercial-ae", "Quota attainment, Deal size");
    expect(out.supplied).toHaveLength(2);
  });

  it("parses a numbered or bulleted list", () => {
    const out = compareCriteria(
      "commercial-ae", "1. Quota attainment\n2. Deal size\n- Sales cycle length",
    );
    expect(out.supplied).toHaveLength(3);
  });

  it("rejects an unknown job description key", () => {
    expect(() => compareCriteria("nope", "x")).toThrow(/unknown job description/i);
  });
});
```

- [ ] **Step 2: Run it, confirm failure, implement**

Token-overlap scoring against each expected criterion's label plus description, with a match threshold. `close` when at most one expected criterion is unmatched; `divergent` otherwise.

- [ ] **Step 3: Run the test, then commit**

Expected: PASS, 9 tests.

```bash
cd ~/verifywise
git add Servers/services/biasAudit/criteriaComparison.ts Servers/services/biasAudit/criteriaComparison.test.ts
git commit -m "Add the criteria-comparison check

One text field, comparing the criteria the customer's platform generates
from the fixed job description against the set the corpus was built
against. It is only possible because the job description is fixed.

It catches the failure that cost a real engagement a full remap: five
generated criteria against eight reconstructed from the same job
description, where the gradient lost its top rung because the only
criterion separating a solid candidate from a strong one was not among
the five.

Not supplied is a distinct verdict from divergent: the stance says the
corpus was built against criteria that were never confirmed against the
platform's own output, rather than implying agreement."
```

---

### Task 7: Release gates for a generated corpus

**Files:**
- Create: `Servers/services/biasAudit/generation/releaseGates.ts`
- Test: `Servers/services/biasAudit/generation/releaseGates.test.ts`

**Interfaces:**
- Consumes: Tasks 1–6; plan 1's `countRuns`/`expectedRuns`.
- Produces:
  - `interface ReleaseFinding { code: string; severity: "stop" | "warn"; message: string }`
  - ```ts
    interface ReleaseGateArgs {
      jobDescriptionKey: string;
      recordCount: number;
      manifestRowCount: number;
      /** Keyed by attribute. Deliberately a different shape from plan 1's
       *  OrderFinding[], which describes uploaded data; this one comes from
       *  assignCandidateIds' `checks` and is keyed rather than listed. */
      idOrderChecks: Record<string, { observed: number; expected: number; fraction: number }>;
      /** Recomputed FROM THE MANIFEST, not from the plan: failed records are
       *  excluded from the manifest, so a 5,000-record plan can yield uneven
       *  cells. */
      cellSizes: Record<string, number>;
      modelsObserved: Record<string, number>;
      tierSeparation: Record<string, number>;
      criteriaVerdict: "close" | "divergent" | "not_supplied";
    }
    ```
  - `runReleaseGates(args: ReleaseGateArgs): ReleaseFinding[]`
  - Codes: `id_order_blocked`, `cell_too_small`, `tier_does_not_separate`, `multiple_models`, `manifest_count_mismatch`, `criteria_divergent`

- [ ] **Step 1: Write the failing test**

```ts
import { runReleaseGates } from "./releaseGates";

const base = {
  jobDescriptionKey: "commercial-ae",
  recordCount: 5000,
  manifestRowCount: 5000,
  idOrderChecks: {
    sex: { observed: 2498, expected: 2500.5, fraction: 0.999 },
    raceEthnicity: { observed: 4300, expected: 4286.7, fraction: 1.003 },
  },
  cellSizes: Object.fromEntries([...Array(14)].map((_, i) => [`c${i}`, 357])),
  modelsObserved: { "pinned-model-1": 5000 },
  tierSeparation: { t1: 0.1, t2: 0.3, t3: 0.5, t4: 0.7, t5: 0.9 },
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
    expect(f[0].message).toMatch(/14/);
    expect(f[0].message).toMatch(/4287|4286/);
  });

  it("stops when the manifest row count does not match the corpus", () => {
    const f = runReleaseGates({ ...base, manifestRowCount: 30 });
    expect(codes(f)).toContain("manifest_count_mismatch");
    expect(f.find((x) => x.code === "manifest_count_mismatch")!.message)
      .toMatch(/30.*5000|5000.*30/);
  });

  it("stops on a cell too small to support a ratio", () => {
    // Not the 2% exclusion: a balanced corpus always clears that. This is
    // per-cell count, which is statistical power.
    const f = runReleaseGates({
      ...base, cellSizes: { ...base.cellSizes, c0: 12 },
    });
    expect(codes(f)).toContain("cell_too_small");
    expect(f.find((x) => x.code === "cell_too_small")!.severity).toBe("stop");
    expect(f.find((x) => x.code === "cell_too_small")!.message).not.toMatch(/2%/);
  });
});

describe("warnings", () => {
  it("warns when the corpus came from more than one model", () => {
    const f = runReleaseGates({
      ...base, modelsObserved: { "m1": 4000, "m2": 1000 },
    });
    const w = f.find((x) => x.code === "multiple_models")!;
    expect(w.severity).toBe("warn");
    expect(w.message).toMatch(/not one configuration/i);
  });

  // Review Focus 3
  it("warns when a tier does not separate candidates from its neighbour", () => {
    const f = runReleaseGates({
      ...base, tierSeparation: { t1: 0.1, t2: 0.3, t3: 0.5, t4: 0.89, t5: 0.9 },
    });
    const w = f.find((x) => x.code === "tier_does_not_separate")!;
    expect(w).toBeDefined();
    expect(w.message).toMatch(/t4|t5/);
  });

  it("warns on divergent criteria", () => {
    const f = runReleaseGates({ ...base, criteriaVerdict: "divergent" });
    expect(codes(f)).toContain("criteria_divergent");
  });

  it("does not warn when criteria were simply not supplied", () => {
    // Not supplied is recorded in the stance, not a release warning: the
    // corpus is as good as it was going to be either way.
    const f = runReleaseGates({ ...base, criteriaVerdict: "not_supplied" });
    expect(codes(f)).not.toContain("criteria_divergent");
  });
});

describe("messages", () => {
  it("uses no forbidden vocabulary", () => {
    const f = runReleaseGates({
      ...base, manifestRowCount: 30, criteriaVerdict: "divergent",
    });
    const text = f.map((x) => x.message).join(" ").toLowerCase();
    for (const w of ["compliant", "certified", "bias-free"]) {
      expect(text).not.toContain(w);
    }
  });
});
```

- [ ] **Step 2: Run it, confirm failure, implement**

- [ ] **Step 3: Run the test, then commit**

Expected: PASS, 9 tests.

```bash
cd ~/verifywise
git add Servers/services/biasAudit/generation/
git commit -m "Add release gates for a generated corpus

A corpus is not released on a blocked ID-order check, a manifest row
count that disagrees with the corpus, or an intersectional cell too small to
support a ratio. Each of the three corresponds to a real failure: a false
race finding from block ordering, a 30-row manifest beside 340 artifacts,
and cells too small to report.

Warnings cover a corpus that came from more than one model, which is not
one configuration; a qualification tier that does not separate candidates
from its neighbour, since a criterion scoring everyone the same
contributes noise and no signal; and criteria that diverge materially
from the expected set.

Criteria not supplied is deliberately not a warning. The corpus is as
good either way, and the stance records that the expected criteria were
never confirmed against the platform's own output."
```

---

### Task 8: Routes, the background job, and module-wide assertions

**Files:**
- Create: `Servers/services/biasAudit/generation/generationJob.ts`
- Modify: `Servers/controllers/biasAudit.ctrl.ts`
- Modify: `Servers/routes/biasAudit.route.ts`
- Create: `Clients/src/presentation/pages/BiasAudit/GenerateCorpus.tsx`
- Create: `Clients/src/presentation/pages/BiasAudit/BiasModuleSettings.tsx`
- Test: `Servers/services/biasAudit/generation/__tests__/generationRules.test.ts`
- Test: `Servers/routes/__tests__/biasAuditGeneration.route.test.ts`

**Interfaces:**
- Consumes: everything above.
- Produces: `POST /api/bias-audit/corpora`, `GET /api/bias-audit/corpora/:id`, `GET .../download`, `POST /api/bias-audit/criteria-comparison`, `PUT /api/bias-audit/settings/gateway` (Admin only).

- [ ] **Step 1: Write the module-rules test**

```ts
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(__dirname, "..");
const files = (): string[] => {
  const out: string[] = [];
  const walk = (d: string) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) { if (!e.name.startsWith("__")) walk(p); }
      else if (e.name.endsWith(".ts") && !e.name.endsWith(".test.ts")) out.push(p);
    }
  };
  walk(ROOT);
  return out;
};

describe("generation module rules", () => {
  const all = files();

  it("never imports the platform AI Gateway or another module", () => {
    const bad = /from\s+["'][^"']*(AIGateway|EvalServer|EvaluationModule|aiGateway)/;
    expect(all.filter((f) => bad.test(fs.readFileSync(f, "utf8")))).toEqual([]);
  });

  it("never logs the API key", () => {
    const offenders: string[] = [];
    for (const f of all) {
      const src = fs.readFileSync(f, "utf8");
      // A log call whose argument mentions the key or the whole settings object.
      if (/(console\.(log|error|warn)|logger\.\w+)\([^)]*\b(apiKey|settings)\b/.test(src)) {
        offenders.push(path.basename(f));
      }
    }
    expect(offenders).toEqual([]);
  });

  it("never maps allocation rows onto ids by zip or index", () => {
    const offenders: string[] = [];
    for (const f of all) {
      const src = fs.readFileSync(f, "utf8");
      if (/rows\s*\.\s*map\s*\(\s*\(?\s*\w+\s*,\s*i\w*\s*\)?\s*=>[\s\S]{0,120}candidateId/
            .test(src) && !f.endsWith("assignCandidateIds.ts")) {
        offenders.push(path.basename(f));
      }
    }
    expect(offenders).toEqual([]);
  });

  it("uses no forbidden vocabulary", () => {
    const offenders: string[] = [];
    for (const f of all) {
      const src = fs.readFileSync(f, "utf8").toLowerCase();
      for (const w of ["compliant", "certified", "bias-free"]) {
        if (src.includes(w)) offenders.push(`${path.basename(f)}: ${w}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
```

- [ ] **Step 2: Write the failing route test**

Cover: the settings endpoint requires Admin; a GET of settings never returns the key; `POST /corpora` is refused when the `generation` gate blocks; a download returns the corpus without a demographic column; another organization's corpus is 404.

```ts
it("never returns the api key from the settings endpoint", async () => {
  const res = await request(app).get("/api/bias-audit/settings/gateway")
    .set(authAsAdmin);
  expect(res.status).toBe(200);
  expect(JSON.stringify(res.body)).not.toMatch(/sk-|apiKey|test-key/);
  expect(res.body).toMatchObject({ configured: true });
});

it("refuses generation while the generation gate blocks", async () => {
  // pipeline.input_form unanswered
  const res = await request(app).post("/api/bias-audit/corpora")
    .send({ projectId: 7, frameworkId: 15, jobDescriptionKey: "commercial-ae" })
    .set(authAsAdmin);
  expect(res.status).toBe(400);
  expect(res.body.message).toMatch(/pipeline\.input_form|input form/i);
});

it("serves a corpus download with no demographic column", async () => {
  const res = await request(app).get("/api/bias-audit/corpora/3/download")
    .set(authAsAdmin);
  expect(res.status).toBe(200);

  // Assert on the HEADER ROW, not the body. Generated resume prose legitimately
  // contains "embrace", "trace" and "manage a", so a body-wide /sex|race/ check
  // fails on correct content.
  const header = res.text.split("\n")[0].split(",").map((h) => h.trim().toLowerCase());
  for (const forbidden of ["sex", "gender", "race", "race_ethnicity", "ethnicity",
                           "age", "age_band", "disability", "tier",
                           "qualification_tier"]) {
    expect(header).not.toContain(forbidden);
  }
  expect(header).toContain("candidate_id");
});
```

- [ ] **Step 3: Implement the job, controller, routes and pages**

The job runs under BullMQ, which the platform already operates. The settings page is Admin-only and write-only for the key: the GET returns `{ configured: boolean, model: string, baseUrl: string }` and never the key itself.

The generate page shows the chosen job description, the criteria-comparison field, and the release findings. Education content from plan 2's Task 8 renders on both pages (`run.job_description`, `run.criteria_comparison`).

- [ ] **Step 4: Regenerate the API surface**

Mandatory per `Servers/CLAUDE.md:164-204`; `check:api-drift` fails CI otherwise.

```bash
cd ~/verifywise/Servers
npm run generate:swagger && npm run generate:endpoints && npm run check:api-drift
```

Commit the regenerated `swagger.yaml` and `docs/api-docs/src/config/endpoints.ts` with the
route change.

- [ ] **Step 5: Run everything**

```bash
cd ~/verifywise/Servers
npm run test:unit -- services/biasAudit structures/NYC-Local-Law-144 routes/__tests__/biasAudit
npm run build && npm run lint
cd ~/verifywise/Clients && npx vitest run src/presentation/pages/BiasAudit && npm run typecheck
```

- [ ] **Step 5: Commit**

```bash
cd ~/verifywise
git add Servers/services/biasAudit/generation/ Servers/controllers/ Servers/routes/ Clients/src/presentation/pages/BiasAudit/
git commit -m "Add generation routes, the background job and module rules

Five endpoints. The gateway settings endpoint is Admin-only and
write-only for the key: a GET returns whether it is configured, the
pinned model and the base URL, never the key.

Four rules are asserted by test: no import of the platform AI Gateway or
any other module, no log call carrying the key or the settings object, no
mapping of allocation rows onto candidate IDs by index outside the
permutation function, and no forbidden vocabulary.

A corpus download carries no demographic column, so the customer's
platform scores blind."
```

---

### Task 9: End-to-end verification

- [ ] **Step 1: Run the full suite across both packages**

```bash
cd ~/verifywise/Servers && npm run test:unit -- services/biasAudit structures/NYC-Local-Law-144 utils/biasAudit.utils.test.ts routes/__tests__/ && npm run build && npm run lint
cd ~/verifywise/Clients && npx vitest run src/presentation/pages/BiasAudit && npm run typecheck && npm run lint
```

- [ ] **Step 2: Confirm independence with both services absent**

```bash
cd ~/verifywise && mv EvalServer /tmp/ES && mv AIGateway /tmp/AG
cd Servers && npm run test:unit -- services/biasAudit; S=$?
cd ~/verifywise && mv /tmp/ES EvalServer && mv /tmp/AG AIGateway
echo "status with EvalServer and AIGateway absent: $S"
```

Expected: 0.

- [ ] **Step 3: Generate a small real corpus against the gateway**

With the module settings configured, generate 140 records (10 per cell) against `commercial-ae`. Verify: the ID-order check reports a fraction above 0.9 for both attributes; `models_observed_json` holds exactly one model; the manifest row count equals the record count; the downloaded corpus has no demographic column; and the 14 cells are within one record of each other.

Record the measured ID-order fractions in the commit message. If either is below 0.9 the permutation is wrong and the gate has caught it — fix the permutation, do not lower the threshold.

- [ ] **Step 4: Walk the whole journey**

Profile → attest → generate → download → score externally → upload → stance. Check the stance names the role tested, carries the criteria-comparison outcome, states the model set, and that regenerating produces version 2.

- [ ] **Step 5: Extend the README and commit**

```bash
cd ~/verifywise
git add Servers/services/biasAudit/README.md
git commit -m "Document generation and verify the module end to end

Records the generation chain, the two fixed job descriptions, the
release gates and the settings contract.

Verified with both EvalServer and AIGateway moved out of the tree: the
suite passes, which is the independence claim demonstrated rather than
asserted. A 140-record corpus generated against the live gateway, with
the measured ID-order fractions and single observed model recorded here."
```

---

## Self-review

**Spec coverage.** Two fixed job descriptions → Task 1. Allocation balanced across 14 cells, with a per-cell power floor → Task 2. Seeded ID assignment and the hard gate → Task 3. Vercel AI Gateway with the module-scoped key and per-record model recording → Task 4. Generation, manifest separation and resumability → Task 5. Criteria comparison → Task 6. Release gates → Task 7. Routes, job, settings and pages → Task 8. Verification → Task 9.

**Placeholders.** Task 1's `body` and `narrative` fields are marked `...` with the instruction to write them out, constrained by length assertions. Task 8's implementation step describes the pages rather than writing the JSX. Both are weaker than the rest; Task 1's are content the tests bound, and Task 8's are the thinnest tasks in all three plans.

**Type consistency.** `AllocationRow` defined in Task 2, consumed in 3 and 5. `GatewaySettings`/`CompletionResult` defined in Task 4, consumed in 5. `JobDescription`/`ExpectedCriterion` defined in Task 1, consumed in 2, 6, 7. `countRuns`/`expectedRuns` from plan 1, consumed in Task 3. `CriteriaComparison.verdict` from Task 6 feeds Task 7's `criteriaVerdict`.

**Review Focus coverage.** 1 → Task 5 (manifest from the full log, with the 30-vs-340 difference asserted). 2 → Task 4 (model read from the response) and Task 7 (multi-model warning). 3 → Task 1 (gradable criteria separate the top tiers) and Task 7 (tier separation warning). 4 → Task 6 (divergent verdict). 5 → Task 5 (partial unique index on a running corpus).

**One deliberate omission.** No matched-pair or redaction-probe corpus. Both are real designs from the engagements and both need a client round trip to be worth anything, which is the workbench rather than this module.
