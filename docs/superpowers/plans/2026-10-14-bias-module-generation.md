# Bias module: synthetic corpus generation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The module generates a balanced synthetic corpus against one of two fixed job descriptions, driven by the customer's intake answers, with the demographic manifest held separately so their platform scores blind. It refuses to release a corpus whose candidate IDs carry a protected attribute in blocks. The customer scores the corpus on their own platform, uploads the scores, and gets a stance that names the corpus it was built from.

**Architecture:** A deterministic plan (allocation, qualification tiers, seeded ID permutation) computed before any network call, then one LLM call per record through the Vercel AI Gateway, appended to a per-record log, then release gates. The planning, prompt and gate layers are pure functions; only the generator touches the network. The gateway key is deployment configuration and never reaches the client.

**Tech Stack:** TypeScript, Node 22, Jest 30, Vitest; Vercel AI Gateway over an OpenAI-compatible HTTP API (`LLM_API_KEY`, `LLM_BASE_URL`, `LLM_MODEL`); BullMQ for the background job, which the platform already runs.

**Spec:** `docs/superpowers/specs/2026-10-14-ll144-self-service-module-design.md` (commits 5e2ad8b42, 764a78cb0)

**Plan 3 of 3.** Plans 1 and 2 must be complete: this plan consumes `countRuns`/`expectedRuns`/`checkIdOrder` from plan 1 and the question set's `generationField` markers plus the `generation` gate from plan 2. All three land before release.

**Worktree:** every command runs in `/Users/gorkemcetin/verifywise-ll144-12b` (branch `feat/ll144-generation`). Never the main checkout `~/verifywise`, which runs the demo.

## Amendments (2026-10-18)

Amended in place after the pre-flight scan, so each task's text carries its rulings. Detail and reasons: `.superpowers/sdd/2026-10-14-bias-module-generation/preflight-scan.md` and the "Ruling:" lines in `.superpowers/sdd/2026-10-14-bias-module-generation/progress.md` (the ledger wins where they differ).

- **Tasks renumbered** to plain integers. 8 is now server only (routes, job, module rules). 9 is the generation page (was 8b; the settings page is gone). 10 is new: corpus → run → stance. 11 is end-to-end verification (was 9).
- **Gateway key is deployment env only** (`LLM_API_KEY`, `LLM_BASE_URL`, `LLM_MODEL`). No `bias_audit_settings` table, no settings endpoints, no settings page. Task 4's `settings.ts` reads env, refuses with a typed "not configured" error that never carries the key, and has its own tests.
- **New table `bias_audit_corpus_records`**, an append-only per-record log. Resume rebuilds from it, and the download streams its latest valid rows. The corpus row gains release findings, criteria comparison, models observed, cell sizes, knockout, `heartbeat_at`, statuses `blocked`/`failed`, and a JD text hash. `bias_audit_runs.corpus_id` gets its FK. The migration moved into Task 5, with a new RLS migration and tenant-isolation registration.
- **Vocabulary:** three JD wordings changed ("handed to you", "where licensed", "licensed to operate"). Manifest statuses are `"valid" | "invalid"`. Every vocabulary test uses `findForbidden`.
- **New pure `generation/prompt.ts`, `generation/names.ts` and `validateRecord`.** A record's only demographic signal is a plausible name drawn from its sex × race/ethnicity cell. Qualifications come from the tier narrative only, and the prompt never contains the group's words.
- **Release gates run from the job** at completion (wired in Task 7). The ID-order check is recomputed on the manifest. Tier separation is no longer a release gate; it is a run-time data-quality warning in Task 10. `MIN_PER_CELL` is exported from `allocation.ts`.
- **Resume:** BullMQ retries, `heartbeat_at` staleness marks a corpus `failed`, and `POST /corpora/:id/resume` restarts it. The worker is registered in `Servers/jobs/worker.ts`.
- **Routes** use `authorize("biasAudit.read" | "biasAudit.edit")` plus `assertProjectAccess`, and a non-member gets 404. `GET /job-descriptions` and `GET /corpora` added. Count defaults to 5,000 (min 700, max 10,000).
- **Knockout** is recorded (`yes | no | dont_know`) and printed in the stance. It does not change generation in v1.
- **Commands:** Servers tests run as `npm run test:unit -- <paths>`, never bare `npx jest`. Clients tests run as `npx vitest run <paths> --no-file-parallelism`. The end-to-end smoke is 700 records on a throwaway database.

Three rulings are marked SURFACE TO USER in the ledger: names as the demographic signal, env-only key, and knockout recorded but not used in generation.

## Global Constraints

- **No dependency on another VerifyWise module.** No import from `EvalServer/`, `AIGateway/`, `EvaluationModule/`, or another module's services, routes or tables. The platform AI Gateway is specifically excluded: generation calls the Vercel AI Gateway directly. BullMQ, Sequelize, auth middleware and the files table are platform primitives and are permitted.
- **The gateway key is deployment configuration and never leaves the server.** It is set by VerifyWise as operator in `LLM_API_KEY` (with `LLM_BASE_URL` and `LLM_MODEL`). There is no per-organization key, no endpoint that reads or writes it, and no page that shows it. It is never logged and never appears in an error message. Tasks 4 and 8 assert this.
- **No spend tracking.** Cost is immaterial: a comparable 4,918-record run cost USD 1.42.
- **The model is pinned in config (`LLM_MODEL`); the model observed is read from each response.** Credentials do not select the provider, config does, and two prior corpora went through ten and eleven models before anyone noticed. A corpus routed across models is not one configuration.
- **Never map allocation rows onto candidate IDs with `zip` or by index.** Use the seeded permutation. This defect shipped twice in the Python tooling, producing a false race impact ratio of 0.8050 at p = 0.0010 that survived its own permutation test.
- **Generated corpora use the strict ID-order threshold, 0.9 of expected runs, as a hard gate.** Uploaded data uses 0.5 (plan 1). A seeded permutation measures 1.0043 on 7 categories over 5,000 records and 0.9762 on an unequal 700/300 split, so 0.9 does not reject a correct interleave.
- **The demographic manifest is never written into a corpus artifact.** It is stored separately and hashed separately, so the customer's platform scores material carrying no demographic column. A record's only group signal is its candidate's name (Task 5).
- **No forbidden vocabulary** in source, prompts, job descriptions or generated artifacts. The list and matcher are `FORBIDDEN_WORDS`/`findForbidden` in `Servers/services/biasAudit/stance/vocabulary.ts`. Every test imports them and does not keep its own list. `moduleIndependence.test.ts` also scans module source files for the words as **substrings** ("bypassed" fails it), so source under `services/biasAudit/` must not contain them inside other words either.
- **Pure files stay pure.** `moduleIndependence.test.ts` requires every file in `services/biasAudit/` to import only from inside the module (or `structures/NYC-Local-Law-144`), with no node builtins and no I/O, unless the file is listed in its `IO_LAYER` map with a reason. Each task that adds an I/O file adds its `IO_LAYER` entry.
- **Raw queries live in `Servers/utils/biasAudit.utils.ts`.** `moduleRules.test.ts` requires each `sequelize.query(` there to be a template literal that mentions `organization_id`.
- **Test commands:** `cd /Users/gorkemcetin/verifywise-ll144-12b/Servers && npm run test:unit -- <paths>`, never bare `npx jest <pattern>` (a pattern can match an integration file that truncates the dev database); `npm run build`; `npm run lint`. Clients: `cd /Users/gorkemcetin/verifywise-ll144-12b/Clients && npx vitest run <paths> --no-file-parallelism`, `npm run typecheck`, `npm run lint`, `npm run i18n:audit:strict`, `npm run format-check`.
- **Never touch the dev database `verifywise` or the demo.** Anything that needs a live database runs on a throwaway one (Task 11).

## Review Focus

1. **A generation run that fails partway.** Records 1–2,000 exist, 2,001–5,000 do not. Resuming must not rewrite the manifest from only the resumed pass: that produced a 30-row manifest beside 340 artifacts on a real engagement, which would have computed a verdict on 30 candidates and reported it as 340. Owned by Task 5 (log and resume) and Task 8 (retry, heartbeat, resume endpoint).
2. **A gateway that silently routes to a different model mid-run.** Every record succeeds and the corpus is not one configuration. Owned by Task 4 (read per response), Task 7 (warning) and Task 10 (stance).
3. **A corpus where one qualification tier does not separate candidates.** A criterion that scores everyone the same contributes noise and no signal; on a real engagement a third of the summary score was carried by a category that separated nobody, which pushed the distribution upward and put the median on the top level. Owned by Task 1 (only gradable criteria separate the top tiers, at generation time) and Task 10 (a warning on the scored run, since scores exist only after the customer scores the corpus).
4. **A customer whose platform generates criteria far from the expected set.** The corpus does not exercise their configuration, and the ratios describe our material rather than their tool. Owned by Task 6, stored by Task 8, printed by Task 10.
5. **Two concurrent generation runs for the same project.** Both write a manifest and both claim the project's corpus. Owned by Task 5 (partial unique index) and Task 8 (stale `running` rows freed by heartbeat).

---

### Task 1: The two fixed job descriptions

**Files:**
- Create: `Servers/structures/NYC-Local-Law-144/job-descriptions/types.ts`
- Create: `Servers/structures/NYC-Local-Law-144/job-descriptions/commercialAe.ts`
- Create: `Servers/structures/NYC-Local-Law-144/job-descriptions/operationalHourly.ts`
- Create: `Servers/structures/NYC-Local-Law-144/job-descriptions/index.ts`
- Test: `Servers/structures/NYC-Local-Law-144/job-descriptions/index.test.ts`

File names are camelCase (the utility-file convention); the spec's kebab-case layout is illustrative.

**Interfaces:**
- Consumes: `findForbidden` from `Servers/services/biasAudit/stance/vocabulary.ts` (test only).
- Produces:
  - `interface ExpectedCriterion { key: string; label: string; description: string; gradable: boolean }`
  - `type JobDescriptionKey = "commercial-ae" | "operational-hourly"`
  - `interface JobDescription { key: JobDescriptionKey; roleTitle: string; body: string; expectedCriteria: ExpectedCriterion[]; tiers: QualificationTier[] }`
  - `interface QualificationTier { key: string; label: string; criteriaMet: string[]; narrative: string }`
  - `JOB_DESCRIPTIONS: Record<JobDescriptionKey, JobDescription>`
  - `JOB_DESCRIPTION_KEYS: readonly JobDescriptionKey[]`

- [ ] **Step 1: Write the failing test**

```ts
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
    for (const n of ["client-c", "client-a", "client-b", "verifywise"]) {
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
    for (const w of ["male", "female", "hispanic", "latino", "asian", "white",
                     "black", "disability", "disabled", "age", "aged", "young",
                     "older", "ethnicity", "race"]) {
      expect(all).not.toMatch(new RegExp(`\\b${w}\\b`, "i"));
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/gorkemcetin/verifywise-ll144-12b/Servers && npm run test:unit -- structures/NYC-Local-Law-144/job-descriptions/index.test.ts`
Expected: FAIL, cannot find module `./index`.

- [ ] **Step 3: Write the types and the commercial role**

Create `types.ts` with the interfaces above, then `commercialAe.ts`. **Declaration order matters.** `BODY` and `NARRATIVES` (step 3b) must be declared *above* the exported object. Referenced before their `const` declarations, they hit the temporal dead zone and the module throws on load. `operationalHourly.ts` in step 4 already has the right order. The file reads: imports, doc comment, `const BODY`, `const NARRATIVES`, then:

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
// const BODY = ...       (step 3b, declared here)
// const NARRATIVES = ... (step 3b, declared here)

export const COMMERCIAL_AE: JobDescription = {
  key: "commercial-ae",
  roleTitle: "Account Executive",
  body: BODY,
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
      criteriaMet: [], narrative: NARRATIVES.t1_strongly_under },
    { key: "t2_under", label: "Underqualified",
      criteriaMet: ["outbound_experience"], narrative: NARRATIVES.t2_under },
    { key: "t3_borderline", label: "Borderline",
      criteriaMet: ["outbound_experience", "full_cycle_ownership"],
      narrative: NARRATIVES.t3_borderline },
    { key: "t4_qualified", label: "Qualified",
      criteriaMet: ["outbound_experience", "full_cycle_ownership", "cycle_length",
                    "deal_size"], narrative: NARRATIVES.t4_qualified },
    { key: "t5_strongly_qualified", label: "Strongly qualified",
      criteriaMet: ["outbound_experience", "full_cycle_ownership", "cycle_length",
                    "deal_size", "quota_attainment"],
      narrative: NARRATIVES.t5_strongly_qualified },
  ],
};
```

- [ ] **Step 3b: Transcribe the commercial role's text**

The `body` and the five `narrative` values. Transcribe them; they are prompt
material and the generator reads them verbatim, so two implementers inventing their own would
produce incomparable gradients and destroy the cross-customer comparability that fixing the job
description exists to provide.

```ts
const BODY = `Account Executive, New Business

We are hiring an Account Executive to own new-business revenue for a mid-market software
product. You will carry an individual quota, generate a substantial share of your own
pipeline, and run deals from first contact through to signature.

What the role involves

Owning a personal revenue target and reporting against it each quarter. Building pipeline
through your own outbound activity as well as working leads handed to you. Running discovery
with prospective customers, mapping their requirements, and qualifying out early where there
is no fit. Managing a deal through evaluation, security review and procurement, coordinating
whichever internal specialists each stage needs. Negotiating commercial terms within an
approval framework and closing the contract. Handing over to onboarding and staying involved
through the first renewal conversation.

What we are looking for

Experience carrying an individual revenue target, with a track record of meeting it. We are
interested in the target you personally owned rather than one shared across a team or pooled
across a region.

Experience with contract values in the range this role handles, which is typically five to
low six figures annually, and with the stakeholder count that comes with deals of that size.

Experience with sales cycles of three to nine months, including the evaluation and procurement
stages that make a cycle run that long, rather than transactional cycles measured in days.

Full-cycle ownership: deals you took from first contact to signature yourself, rather than
qualifying leads for someone else to close or inheriting late-stage opportunities.

Outbound capability: you have generated your own pipeline rather than working inbound leads
exclusively. Candidates whose pipeline came only from outbound activity, and those who
combined outbound with inbound, both satisfy this.

Familiarity with a comparable sector is useful but not required; we have hired successfully
from adjacent markets.

How we assess

Candidates are assessed against the criteria above. We are looking for evidence in your own
words about deals you personally ran, with the numbers attached where you have them.`;
```

Note two wordings that come from real criteria mismatches. **Individual** appears wherever the
criterion means a personal quota, because a team or pooled target does not satisfy it and a
generated candidate must be unambiguous about which it had. And the outbound criterion is
deliberately broader than "outbound only", since a candidate with only outbound experience must
still satisfy a criterion phrased as pipeline generation.

The five tier narratives, which the generator uses to write a candidate at that level:

```ts
const NARRATIVES = {
  t1_strongly_under: `Write a candidate with no evidence of any criterion. Their background is
    in a role adjacent to sales but not carrying revenue: customer support, account
    coordination, inside sales support, or a non-commercial role entirely. They have never
    owned a target. Where they mention revenue it belongs to a team or a manager. No deal
    sizes, no cycle lengths, no outbound activity. The writing should be competent and the
    candidate plausible: they are underqualified for this role, not careless or unemployable.`,

  t2_under: `Write a candidate who satisfies outbound experience only. They have generated
    their own pipeline, through cold calling, sequenced email or social outreach, and can
    describe that activity concretely with volumes or meeting counts. But they have never
    owned a deal end to end: they book meetings or qualify opportunities and hand them to an
    Account Executive. No individual quota, no contract values they closed, no cycle they ran
    through procurement. This is a strong SDR or BDR rather than a weak AE.`,

  t3_borderline: `Write a candidate who satisfies outbound experience and full-cycle
    ownership. They generate their own pipeline and they close their own deals, described
    first-hand from discovery through signature. But the deals are small and fast: contract
    values in the low four figures, cycles of two to six weeks, single-stakeholder decisions
    with no procurement or security review. They may mention a target without being specific
    about whether it was theirs alone. This candidate could plausibly grow into the role and a
    reasonable reviewer could argue either way.`,

  t4_qualified: `Write a candidate who satisfies outbound experience, full-cycle ownership,
    cycle length and deal size, but not quota attainment. They run deals of the right size
    through cycles of the right length, with multiple stakeholders, security review and
    procurement described concretely. Their pipeline is partly self-generated. What is absent
    is any claim about hitting a number: they describe deals and process without stating a
    target they owned or what they delivered against it, and no attainment figure appears
    anywhere.`,

  t5_strongly_qualified: `Write a candidate who satisfies all five gradable criteria. Same
    profile as the qualified tier, and additionally they state an individual quota they
    personally carried and their attainment against it, with figures, across more than one
    year. The quota is unambiguously theirs rather than a team or regional number. This is the
    only tier where attainment appears, and it is what separates this candidate from the one
    below.`,
};
```

The top tier is separated from the one below by `quota_attainment` alone, which is a gradable
criterion. Task 1's test asserts exactly that, because a criterion that scores everyone the
same contributes noise and no signal: on one engagement a third of a summary score was carried
by a category that separated nobody across five thousand candidates, which pushed the whole
distribution upward and put the median on the top level.

- [ ] **Step 4: Write the operational role**

Create `operationalHourly.ts` with the same shape. Fewer gradable criteria by design: this is
the harder case, where a tool may score everyone similarly, and the module should be able to
show that rather than hide it.

```ts
import type { JobDescription } from "./types";

/**
 * Fixed job description 2 of 2: an operational hourly role with fewer gradable
 * attributes.
 *
 * This is the harder case deliberately. Hourly roles have less to grade than
 * commercial ones, so a tool may score every candidate similarly and the
 * resulting impact ratios sit near 1.00 for reasons that have nothing to do
 * with fairness. A customer should be able to see that, and the module should
 * not present it as a clean result.
 *
 * On one engagement a third of a summary score was carried by a category that
 * separated nobody across five thousand candidates, which pushed the whole
 * distribution upward and put the sample median on the top level. Only
 * gradable criteria separate the top two tiers here, for that reason.
 */
const BODY = `Warehouse Operations Associate

We are hiring Operations Associates for a distribution facility running two shifts. The role
is hourly, on site, and involves picking, packing, scanning and moving stock to a daily
throughput target.

What the role involves

Picking orders against a handheld scanner to a rate target, with accuracy checked on a sample
basis. Packing to the specification for each carrier. Operating a pallet truck and, where
licensed, a counterbalance or reach truck. Cycle counting and reporting discrepancies. Keeping
the working area to the site's safety standard, including reporting near misses. Covering
either shift pattern as the rota requires, including some weekend rotation.

What we are looking for

Experience in a warehouse, distribution, production or stockroom environment, with the pace
and the physical standing that involves.

A current forklift certification, or a lapsed one you are willing to renew. We will fund
renewal for the right candidate, so a lapsed certificate is not a barrier.

A verifiable record of reliable attendance in a shift role, since the rota depends on cover.
Where you have attendance or punctuality figures from a previous employer, include them.

Experience working to a measured rate or throughput target, and the ability to say what your
rate was.

Comfort with handheld scanning or warehouse management systems, at the level of using one
daily rather than administering it.

Availability for the shift pattern described, including the weekend rotation.

How we assess

Candidates are assessed against the criteria above. Concrete detail about the environments you
have worked in, the rates you held and the equipment you are licensed to operate is more useful
than general statements about work ethic.`;

const NARRATIVES = {
  t1_strongly_under: `Write a candidate with no evidence of any criterion. No warehouse,
    distribution, production or stockroom background; their experience is in an unrelated
    setting such as retail front-of-house, hospitality or administration. No certification, no
    rate figures, no shift work, and no mention of scanning systems. Where they discuss
    reliability it is general rather than evidenced. The candidate should read as capable and
    employable but plainly new to this kind of work.`,

  t2_under: `Write a candidate who satisfies the environment criterion only. They have worked
    in a warehouse, stockroom or production setting and can describe it concretely: the goods,
    the layout, what a shift involved. But no certification of any kind, no rate or throughput
    figure they can state, and their shift history is short or interrupted. They may mention a
    scanner in passing without it being part of their daily work.`,

  t3_borderline: `Write a candidate who satisfies the environment and the systems criteria.
    Solid warehouse background with daily handheld scanner or WMS use described first-hand. No
    forklift certification, current or lapsed. They reference working to targets without
    giving a figure, and their attendance record is unstated rather than poor. A reasonable
    reviewer could argue this candidate either way, which is what this tier is for.`,

  t4_qualified: `Write a candidate who satisfies the environment, systems, certification and
    shift-availability criteria, but not the measured-rate criterion. Strong warehouse
    background, current forklift certification named specifically, daily scanner use, and
    explicit availability for both shifts including weekend rotation. What is absent is any
    rate figure: they describe the work and the equipment without stating what throughput they
    held or what the target was.`,

  t5_strongly_qualified: `Write a candidate who satisfies all five gradable criteria. Same
    profile as the qualified tier, and additionally they state a measured rate or throughput
    figure they personally held, with the unit and the target alongside it, over a stated
    period. This is the only tier where a rate figure appears, and it is what separates this
    candidate from the one below.`,
};

export const OPERATIONAL_HOURLY: JobDescription = {
  key: "operational-hourly",
  roleTitle: "Warehouse Operations Associate",
  body: BODY,
  expectedCriteria: [
    { key: "environment_experience", label: "Warehouse or production environment",
      description:
        "Experience in a warehouse, distribution, production or stockroom setting, with the " +
        "pace and standing it involves.",
      gradable: true },
    { key: "certification", label: "Forklift certification",
      description:
        "A current forklift certification, or a lapsed one the candidate is willing to renew.",
      gradable: true },
    { key: "measured_rate", label: "Measured rate or throughput",
      description:
        "Experience working to a measured rate target, with a figure the candidate can state.",
      gradable: true },
    { key: "systems_use", label: "Scanning or WMS use",
      description:
        "Daily use of a handheld scanner or warehouse management system, as a user.",
      gradable: true },
    { key: "shift_availability", label: "Shift availability",
      description:
        "Availability for the stated shift pattern, including the weekend rotation.",
      gradable: false },
    { key: "attendance_record", label: "Attendance record",
      description:
        "A verifiable record of reliable attendance in a shift role, with figures where held.",
      gradable: false },
  ],
  tiers: [
    { key: "t1_strongly_under", label: "Strongly underqualified",
      criteriaMet: [], narrative: NARRATIVES.t1_strongly_under },
    { key: "t2_under", label: "Underqualified",
      criteriaMet: ["environment_experience"], narrative: NARRATIVES.t2_under },
    { key: "t3_borderline", label: "Borderline",
      criteriaMet: ["environment_experience", "systems_use"],
      narrative: NARRATIVES.t3_borderline },
    { key: "t4_qualified", label: "Qualified",
      criteriaMet: ["environment_experience", "systems_use", "certification",
                    "shift_availability"],
      narrative: NARRATIVES.t4_qualified },
    { key: "t5_strongly_qualified", label: "Strongly qualified",
      criteriaMet: ["environment_experience", "systems_use", "certification",
                    "shift_availability", "measured_rate"],
      narrative: NARRATIVES.t5_strongly_qualified },
  ],
};
```

Four gradable criteria against the commercial role's five, which Task 1's test asserts as the
difference between the two roles. `shift_availability` and `attendance_record` are marked
non-gradable because almost every candidate satisfies them, so they add no separation; the top
two tiers are separated by `measured_rate`, which is gradable.

- [ ] **Step 5: Write the index and run the test**

`index.ts` exports `JOB_DESCRIPTIONS = { "commercial-ae": COMMERCIAL_AE, "operational-hourly": OPERATIONAL_HOURLY }`, `JOB_DESCRIPTION_KEYS` and re-exports the types.

Run: `cd /Users/gorkemcetin/verifywise-ll144-12b/Servers && npm run test:unit -- structures/NYC-Local-Law-144/job-descriptions/index.test.ts services/biasAudit/__tests__/moduleRules.test.ts`
Expected: PASS, 11 tests in the new file. `moduleRules.test.ts` scans `structures/NYC-Local-Law-144` for forbidden words and still passes.

- [ ] **Step 6: Commit**

```bash
cd /Users/gorkemcetin/verifywise-ll144-12b
git add Servers/structures/NYC-Local-Law-144/job-descriptions/
git commit -m "feat(bias-audit): add the two fixed job descriptions

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
every candidate's prompt regardless of their assigned group, and pass
the module's vocabulary matcher."
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
  - `cellKey(d: Demographics): string`, which returns `${sex}|${raceEthnicity}`. This is the one cell key every later task uses.
  - `LL144_SEX: readonly string[]`, `LL144_RACE: readonly string[]`, with values exactly as `LL144_CONFIG.categories` spells them in `services/biasAudit/runService.ts:54-65` ("Male", "Female"; "Hispanic or Latino", "White", "Black or African American", "Native Hawaiian or Pacific Islander", "Asian", "Native American or Alaska Native", "Two or more races"). Task 10 injects these values into a scored run, so they must match the engine's groups. This file is pure and cannot import `runService.ts`, so it restates them, and Task 10 asserts that they are equal.
  - `MIN_PER_CELL = 50`, which Task 7 reuses.

- [ ] **Step 1: Write the failing test**

```ts
import {
  buildAllocation, cellKey, LL144_RACE, LL144_SEX, MIN_PER_CELL,
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

  it("produces exactly the requested count", () => {
    expect(buildAllocation({ count: 5000, tiers, smallSampleExclusion: 0.02 }).rows)
      .toHaveLength(5000);
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
    expect(() => buildAllocation({ count: 699, tiers, smallSampleExclusion: 0.02 }))
      .toThrow(/at least 700/i);
    expect(() => buildAllocation({ count: 700, tiers, smallSampleExclusion: 0.02 }))
      .not.toThrow();
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
```

- [ ] **Step 2: Run it, confirm failure, implement**

Run: `cd /Users/gorkemcetin/verifywise-ll144-12b/Servers && npm run test:unit -- services/biasAudit/generation/allocation.test.ts`
Expected: FAIL, cannot find module `./allocation`.

Fill the rows **cell by cell in a fixed order** (stratum order: `LL144_SEX` outer, `LL144_RACE` inner), and round-robin the tiers *within* each cell. `count % 14` leftover rows go one each to the first cells in that order. Do not round-robin across cells: that interleaves the rows and fails the stratum-order test, which pins grouped output on purpose because Task 3 is the guard. Refuse `count < MIN_PER_CELL * 14` with a message that says "at least 700" and "per cell". The file stays pure: no imports from outside the module.

- [ ] **Step 3: Run the test, then commit**

Run: `cd /Users/gorkemcetin/verifywise-ll144-12b/Servers && npm run test:unit -- services/biasAudit/generation/allocation.test.ts services/biasAudit/__tests__/moduleIndependence.test.ts`
Expected: PASS, 9 tests in `allocation.test.ts`; module independence still green.

```bash
cd /Users/gorkemcetin/verifywise-ll144-12b
git add Servers/services/biasAudit/generation/allocation.ts Servers/services/biasAudit/generation/allocation.test.ts
git commit -m "feat(bias-audit): add demographic allocation for generated corpora

Balances all 14 intersectional cells, which is what makes the mandatory
sex by race/ethnicity table reportable at all: a real applicant pool
often cannot support it. At 5,000 each cell holds 357 candidates.

A balanced allocation clears 5-301(d)'s 2% exclusion by construction at
any size, since each cell is always 1/14 of the sample. The exclusion is
therefore not the binding constraint on volume and the module does not
claim it is. The binding constraint is per-cell count, which is
statistical power: a real effect of a previously measured size
reproduced the correct ordering 37% of the time at 100 per group and 62%
at 357. A count below 50 per cell (MIN_PER_CELL, exported for the
release gates) is refused.

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
- Consumes: `checkIdOrder` (and, in the test, `countRuns`/`expectedRuns`) from `../idOrderCheck` (plan 1, `services/biasAudit/idOrderCheck.ts:22,37,62`); `AllocationRow` from Task 2.
- Produces:
  - `class IdOrderError extends Error`
  - `GENERATED_MIN_RUN_FRACTION = 0.9`
  - `type IdOrderChecks = Record<string, { observed: number; expected: number; fraction: number }>`
  - `assignCandidateIds(args: { rows: AllocationRow[]; seed: number; digits?: number; attributes?: string[] }): { assigned: Array<{ candidateId: string } & AllocationRow>; checks: IdOrderChecks }`. `digits` defaults to `Math.max(4, String(rows.length).length)`, and `attributes` defaults to `["sex", "raceEthnicity"]`.
  - `measureIdOrder(assigned: Array<{ candidateId: string } & AllocationRow>, attributes: string[]): IdOrderChecks`. It sorts by `candidateId`, flattens `demographics` into `{ sex, raceEthnicity }` records, and calls `checkIdOrder`. It never throws. Task 7 uses it on the manifest at release.
  - `verifyIdOrder(assigned, attributes, minFraction = GENERATED_MIN_RUN_FRACTION): IdOrderChecks`. It is `measureIdOrder` plus the threshold, and throws `IdOrderError` naming the attribute, the observed count and the expected count. The run-count logic exists once, in `checkIdOrder`.

- [ ] **Step 1: Write the failing test**

```ts
import { buildAllocation } from "./allocation";
import {
  assignCandidateIds, GENERATED_MIN_RUN_FRACTION, IdOrderError, measureIdOrder, verifyIdOrder,
} from "./assignCandidateIds";
import { countRuns, expectedRuns } from "../idOrderCheck";

const tiers = ["t1", "t2", "t3", "t4", "t5"];
const alloc = (count = 1400) =>
  buildAllocation({ count, tiers, smallSampleExclusion: 0.02 }).rows;
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
    expect(() => verifyIdOrder(byIndex(), ["sex", "raceEthnicity"])).toThrow(IdOrderError);
  });

  it("names the attribute and both counts in the error", () => {
    expect(() => verifyIdOrder(byIndex(), ["raceEthnicity"]))
      .toThrow(/raceEthnicity.*observed.*expected|raceEthnicity.*expected.*observed/is);
  });

  it("measures without throwing, for the release-time check", () => {
    const checks = measureIdOrder(byIndex(), ["raceEthnicity"]);
    expect(checks.raceEthnicity.observed).toBe(14);
    expect(checks.raceEthnicity.fraction).toBeLessThan(0.01);
  });

  it("rejects a digit width too narrow for the population", () => {
    expect(() => assignCandidateIds({ rows: alloc(1400), seed: 7, digits: 2 }))
      .toThrow(/digits|too narrow/i);
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
```

- [ ] **Step 2: Run it, confirm failure, implement**

Run: `cd /Users/gorkemcetin/verifywise-ll144-12b/Servers && npm run test:unit -- services/biasAudit/generation/assignCandidateIds.test.ts`
Expected: FAIL, cannot find module `./assignCandidateIds`.

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

Use a seeded LCG for the permutation (Fisher–Yates driven by the LCG) so it is deterministic without a dependency. `assignCandidateIds` calls `verifyIdOrder` before returning, so an unpermuted plan can never leave this function. `measureIdOrder` maps `checkIdOrder`'s `observedRuns/expectedRuns/ratio` onto `observed/expected/fraction`; do not recompute runs here.

- [ ] **Step 3: Run the test, then commit**

Run: `cd /Users/gorkemcetin/verifywise-ll144-12b/Servers && npm run test:unit -- services/biasAudit/generation/assignCandidateIds.test.ts services/biasAudit/__tests__/moduleIndependence.test.ts`
Expected: PASS, 10 tests in `assignCandidateIds.test.ts`.

```bash
cd /Users/gorkemcetin/verifywise-ll144-12b
git add Servers/services/biasAudit/generation/assignCandidateIds.ts Servers/services/biasAudit/generation/assignCandidateIds.test.ts
git commit -m "feat(bias-audit): assign candidate IDs by seeded permutation, with a hard gate

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
against 4,285 expected. The run counting is plan 1's checkIdOrder;
measureIdOrder exposes it without the throw for the release-time check."
```

---

### Task 4: The Vercel AI Gateway client and its configuration

**Files:**
- Create: `Servers/services/biasAudit/generation/gatewayClient.ts`
- Create: `Servers/services/biasAudit/generation/settings.ts`
- Modify: `Servers/services/biasAudit/__tests__/moduleIndependence.test.ts` (adds two `IO_LAYER` entries)
- Modify: `Servers/.env.example` (adds three variables)
- Test: `Servers/services/biasAudit/generation/gatewayClient.test.ts`
- Test: `Servers/services/biasAudit/generation/settings.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `interface GatewaySettings { baseUrl: string; apiKey: string; model: string }`
  - `class GatewayNotConfiguredError extends Error { code: "gateway_not_configured"; missing: string[] }`. `missing` holds variable **names** only.
  - `getGatewaySettings(env: NodeJS.ProcessEnv = process.env): GatewaySettings` throws `GatewayNotConfiguredError`.
  - `isGatewayConfigured(env: NodeJS.ProcessEnv = process.env): boolean`
  - `interface CompletionResult { text: string; modelObserved: string; promptHash: string }`
  - `complete(settings: GatewaySettings, prompt: string, opts?: { retries?: number; retryDelayMs?: number }): Promise<CompletionResult>`

The key is deployment configuration: `LLM_API_KEY`, `LLM_BASE_URL`, `LLM_MODEL`, set by VerifyWise as operator. There is no per-organization store. `getGatewaySettings` takes no organization.

- [ ] **Step 1: Write the failing client test**

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
      text: async () => "unauthorized for key test-key-do-not-log",
    });
    await expect(complete(settings, "p")).rejects.toThrow(
      expect.objectContaining({
        message: expect.not.stringContaining("test-key-do-not-log"),
      }) as any,
    );
  });

  it("is absent from an error raised on a network failure", async () => {
    mockFetch.mockRejectedValue(new Error("connect ECONNREFUSED test-key-do-not-log"));
    await expect(complete(settings, "p")).rejects.toThrow(
      expect.objectContaining({
        message: expect.not.stringContaining("test-key-do-not-log"),
      }) as any,
    );
  });

  it("is absent from a thrown error on a malformed response", async () => {
    mockFetch.mockResolvedValue({ ok: true, json: async () => ({ nope: true }) });
    await expect(complete(settings, "p")).rejects.toThrow(/unexpected response/i);
    await expect(complete(settings, "p")).rejects.toThrow(
      expect.objectContaining({
        message: expect.not.stringContaining("test-key-do-not-log"),
      }) as any,
    );
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

- [ ] **Step 2: Write the failing settings test**

```ts
import { getGatewaySettings, GatewayNotConfiguredError, isGatewayConfigured } from "./settings";

const full = {
  LLM_API_KEY: "sk-secret-value-123",
  LLM_BASE_URL: "https://gateway.example/v1/",
  LLM_MODEL: "pinned-model-1",
};

describe("getGatewaySettings", () => {
  it("reads all three variables, trimming a trailing slash from the base URL", () => {
    expect(getGatewaySettings(full)).toEqual({
      apiKey: "sk-secret-value-123",
      baseUrl: "https://gateway.example/v1",
      model: "pinned-model-1",
    });
    expect(isGatewayConfigured(full)).toBe(true);
  });

  it("refuses with a typed error naming the missing variables", () => {
    const { LLM_API_KEY: _k, ...noKey } = full;
    expect(() => getGatewaySettings(noKey)).toThrow(GatewayNotConfiguredError);
    try {
      getGatewaySettings(noKey);
    } catch (e: any) {
      expect(e.code).toBe("gateway_not_configured");
      expect(e.missing).toEqual(["LLM_API_KEY"]);
    }
    expect(isGatewayConfigured(noKey)).toBe(false);
  });

  it("never puts the key in the error when another variable is missing", () => {
    // The model is pinned in config; a key without a model is not configured.
    const { LLM_MODEL: _m, ...noModel } = full;
    try {
      getGatewaySettings(noModel);
      throw new Error("should have thrown");
    } catch (e: any) {
      expect(e).toBeInstanceOf(GatewayNotConfiguredError);
      expect(e.missing).toEqual(["LLM_MODEL"]);
      expect(JSON.stringify({ message: e.message, ...e })).not.toContain("sk-secret-value-123");
    }
  });

  it("treats blank values as missing", () => {
    expect(() => getGatewaySettings({ ...full, LLM_BASE_URL: "   " }))
      .toThrow(GatewayNotConfiguredError);
  });
});
```

- [ ] **Step 3: Run both, confirm failure, implement**

Run: `cd /Users/gorkemcetin/verifywise-ll144-12b/Servers && npm run test:unit -- services/biasAudit/generation/gatewayClient.test.ts services/biasAudit/generation/settings.test.ts`
Expected: FAIL, cannot find modules.

Every throw path in `gatewayClient.ts` constructs its own message and never interpolates the response body or the caught error's message, since both can contain the key. Scrub defensively anyway:

```ts
function scrub(text: string, key: string): string {
  return key ? text.split(key).join("[redacted]") : text;
}
```

The prompt hash is `sha256` of the prompt (`node:crypto`), computed here, so the pure files never need a builtin. A response with no string `model` or no `choices[0].message.content` is an "unexpected response" error.

`settings.ts` reads only the three env variables (`process.env` by default; tests pass an object). It never decrypts, reads a table, or falls back to anything. The error message says "Generation is not configured on this deployment: <names> unset." and nothing else.

Add to `Servers/.env.example`, with a comment that VerifyWise sets these as operator and that they are never shown to a customer:

```
# LL 144 bias module corpus generation (Vercel AI Gateway, OpenAI-compatible).
# Set by VerifyWise as operator; never returned by any endpoint.
LLM_API_KEY=
LLM_BASE_URL=
LLM_MODEL=
```

Add to `IO_LAYER` in `services/biasAudit/__tests__/moduleIndependence.test.ts`:

```ts
  [path.join(MODULE, "generation", "gatewayClient.ts")]:
    "calls the Vercel AI Gateway with fetch and hashes each prompt with node:crypto",
  [path.join(MODULE, "generation", "settings.ts")]:
    "reads the gateway's three deployment variables from process.env",
```

- [ ] **Step 4: Run the tests, then commit**

Run: `cd /Users/gorkemcetin/verifywise-ll144-12b/Servers && npm run test:unit -- services/biasAudit/generation/gatewayClient.test.ts services/biasAudit/generation/settings.test.ts services/biasAudit/__tests__/moduleIndependence.test.ts`
Expected: PASS, 14 tests across the two new files (10 + 4); module independence green.

```bash
cd /Users/gorkemcetin/verifywise-ll144-12b
git add Servers/services/biasAudit/generation/gatewayClient.ts Servers/services/biasAudit/generation/gatewayClient.test.ts Servers/services/biasAudit/generation/settings.ts Servers/services/biasAudit/generation/settings.test.ts Servers/services/biasAudit/__tests__/moduleIndependence.test.ts Servers/.env.example
git commit -m "feat(bias-audit): add the Vercel AI Gateway client and its configuration

OpenAI-compatible HTTP, matching the configuration that produced five
delivered audits. The key, base URL and pinned model are deployment
variables set by VerifyWise as operator (LLM_API_KEY, LLM_BASE_URL,
LLM_MODEL). There is no per-organization store, so no customer can
enter or read the key; with any variable unset, generation refuses with
a typed not-configured error that names the variables and never the key.

The model observed is read from each response rather than assumed from
config, because credentials do not select the provider and two prior
corpora went through ten and eleven models before anyone noticed. A
corpus routed across models is not one configuration.

Tests assert the key is absent from errors raised on a failed request,
a network failure and a malformed response, each of which can carry it
in the text being wrapped, and from the not-configured error."
```

---

### Task 5: The generation job with a resumable, append-only log

**Files:**
- Create: `Servers/database/migrations/<TS1>-bias-audit-corpora.js`
- Create: `Servers/database/migrations/<TS2>-rls-policies-bias-audit-corpora.js`
- Create: `Servers/services/biasAudit/generation/names.ts`
- Create: `Servers/services/biasAudit/generation/prompt.ts`
- Create: `Servers/services/biasAudit/generation/manifest.ts`
- Create: `Servers/services/biasAudit/generation/corpusCsv.ts`
- Create: `Servers/services/biasAudit/generation/generateCorpus.ts`
- Modify: `Servers/utils/biasAudit.utils.ts` (the corpus and record queries)
- Modify: `Servers/services/biasAudit/__tests__/moduleIndependence.test.ts` (`IO_LAYER` entry for `generateCorpus.ts`)
- Modify: `Servers/tests/integration/tenant-isolation/tenantIsolation.registry.ts` (two tables)
- Modify: `docs/technical/domains/data-retention.md` (retention statement)
- Test: `Servers/services/biasAudit/generation/names.test.ts`
- Test: `Servers/services/biasAudit/generation/prompt.test.ts`
- Test: `Servers/services/biasAudit/generation/manifest.test.ts`
- Test: `Servers/services/biasAudit/generation/corpusCsv.test.ts`
- Test: `Servers/services/biasAudit/generation/generateCorpus.test.ts`
- Test: `Servers/utils/biasAudit.utils.test.ts` (extend)

The migrations live here, not in Task 4, because this is the first task that reads or writes the tables. **Generate both timestamps at execution time** with `date +%Y%m%d%H%M%S` (`Servers/CLAUDE.md:28`). Run it once for `<TS1>`, then again at least a second later for `<TS2>`. Both must sort after `20261017133420-bias-audit-stance-profile-id.js`.

**Interfaces:**
- Consumes: Tasks 1–4; `isUniqueViolation` from `services/biasAudit/serviceHelpers.ts:42`; `findForbidden` from `../stance/vocabulary`.
- Produces:
  - ```ts
    // names.ts (pure)
    export const NAME_METHOD: string;          // the sentence the stance prints
    export function nameFor(d: Demographics, candidateId: string, seed: number): string;

    // prompt.ts (pure)
    export type ArtifactKind = "resume" | "transcript" | "structured";
    export const RECORD_MAX_CHARS = 12000;
    export function buildPrompt(args: {
      jobDescription: JobDescription; tierKey: string; artifactKind: ArtifactKind;
      candidateName: string;
    }): string;
    export type RecordInvalidReason =
      "empty" | "too_long" | "forbidden_words" | "demographic_field" | "wrong_shape";
    export function validateRecord(text: string, artifactKind: ArtifactKind):
      { ok: true } | { ok: false; reason: RecordInvalidReason };

    // manifest.ts (pure)
    interface AssignedRow {
      candidateId: string;
      demographics: { sex: string; raceEthnicity: string };
      tierKey: string;
    }
    interface GenerationLogEntry {
      candidateId: string;
      attempt: number;
      validationStatus: "valid" | "invalid";
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
    }
    function buildManifest(args: { assigned: AssignedRow[]; log: GenerationLogEntry[] }): {
      rows: ManifestRow[];                        // valid only, sorted by candidateId
      counts: Record<string, number>;             // "sex:Male", "raceEthnicity:Asian"
      cellSizes: Record<string, number>;          // keyed by cellKey(): "Male|Asian"
      unknownCandidateIds: string[];
    };

    // corpusCsv.ts (pure)
    export const CORPUS_CSV_HEADER = ["candidate_id", "artifact_kind", "artifact"] as const;
    export function corpusCsvHeaderLine(): string;            // ends with "\r\n"
    export function corpusCsvRow(r: { candidateId: string; artifactKind: ArtifactKind; text: string }): string;

    // generateCorpus.ts (I/O)
    interface CreateCorpusArgs {
      projectId: number;
      profileId: number;
      profileVersion: number;
      organizationId: number;
      userId: number;
      jobDescriptionKey: JobDescriptionKey;
      artifactKind: ArtifactKind;                 // from pipeline.input_form
      knockout: "yes" | "no" | "dont_know";       // from knockout.exists; recorded, not used
      criteriaSupplied: string | null;
      criteriaComparison: unknown;                // Task 6's CriteriaComparison; stored as JSON
      count: number;
    }
    function createCorpus(args: CreateCorpusArgs): Promise<{ corpusId: number }>;
    function runCorpusGeneration(args: { corpusId: number; organizationId: number }):
      Promise<{ status: "complete"; recordCount: number; modelsObserved: Record<string, number> }>;
    function jobDescriptionSha256(jd: JobDescription): string;
    ```
  - Appended to `Servers/utils/biasAudit.utils.ts`, each a template literal filtered on `organization_id`: `createCorpusQuery`, `getCorpusQuery`, `updateCorpusStatusQuery`, `touchCorpusHeartbeatQuery`, `markStaleCorporaFailedQuery`, `appendCorpusRecordQuery`, `listCorpusLogQuery` (all attempts, metadata only, no text), `countValidCorpusRecordsQuery`, `listLatestValidRecordsPageQuery(corpusId, organizationId, afterCandidateId, limit)` (keyset pagination, returns `candidate_id, text`), and the row type `CorpusRow`.
  - Tables `bias_audit_corpora` and `bias_audit_corpus_records`, and the FK `bias_audit_runs.corpus_id → bias_audit_corpora(id)`.

`artifactKind` and `knockout` come from the question set's `generationField` markers (`pipeline.input_form` at `intake.questions.ts:316` and `knockout.exists` at `:404-411`). Task 8's service resolves them from the attested profile. These functions do not read answers themselves.

- [ ] **Step 1: Write the migrations**

Copy the raw-SQL, single-transaction style of `Servers/database/migrations/20261014120000-bias-audit-module-tables.js`: `queryInterface.sequelize.transaction(async (t) => { await q(\`CREATE TABLE verifywise.… \`) … })`. Use its FK style for `organizations`, `projects`, `aedt_profiles` and `users`. Do not use `createTable`.

**`bias_audit_corpora`**

```
id                         SERIAL PRIMARY KEY
organization_id            INTEGER NOT NULL  → organizations ON DELETE CASCADE
project_id                 INTEGER NOT NULL  → projects ON DELETE CASCADE
profile_id                 INTEGER NOT NULL  → aedt_profiles
profile_version            INTEGER NOT NULL
job_description_key        VARCHAR(32) NOT NULL CHECK (job_description_key IN ('commercial-ae','operational-hourly'))
job_description_sha256     CHAR(64) NOT NULL  -- the fixed text the corpus was built from
artifact_kind              VARCHAR(16) NOT NULL CHECK (artifact_kind IN ('resume','transcript','structured'))
knockout                   VARCHAR(16) NOT NULL CHECK (knockout IN ('yes','no','dont_know'))
requested_count            INTEGER NOT NULL CHECK (requested_count BETWEEN 700 AND 10000)
record_count               INTEGER           -- valid records at completion
seed                       INTEGER NOT NULL
model_pinned               TEXT NOT NULL
name_method                TEXT NOT NULL
criteria_supplied          TEXT
criteria_comparison_json   JSONB NOT NULL
models_observed_json       JSONB
cell_sizes_json            JSONB
id_order_check_json        JSONB
release_findings_json      JSONB
manifest_json              JSONB
manifest_sha256            CHAR(64)
corpus_sha256              CHAR(64)
status                     VARCHAR(16) NOT NULL DEFAULT 'running'
                           CHECK (status IN ('running','complete','blocked','failed'))
failure_code               VARCHAR(64)
heartbeat_at               TIMESTAMPTZ NOT NULL DEFAULT now()
generated_by               INTEGER → users ON DELETE SET NULL
generated_at               TIMESTAMPTZ NOT NULL DEFAULT now()
completed_at               TIMESTAMPTZ
```

A partial unique index prevents two running corpora per project:

```sql
CREATE UNIQUE INDEX bias_audit_corpora_one_running_uq
  ON verifywise.bias_audit_corpora (project_id)
  WHERE status = 'running';
CREATE INDEX bias_audit_corpora_org_project_idx
  ON verifywise.bias_audit_corpora (organization_id, project_id);
```

**`bias_audit_corpus_records`** is the append-only log. Every attempt is a new row, and nothing updates or deletes a row. Task 8 adds a rule test for that.

```
id                  BIGSERIAL PRIMARY KEY
organization_id     INTEGER NOT NULL → organizations ON DELETE CASCADE
corpus_id           INTEGER NOT NULL → bias_audit_corpora ON DELETE CASCADE
candidate_id        VARCHAR(16) NOT NULL
attempt             SMALLINT NOT NULL CHECK (attempt >= 1)
text                TEXT NOT NULL
model_name          TEXT NOT NULL
prompt_hash         CHAR(64) NOT NULL
validation_status   VARCHAR(8) NOT NULL CHECK (validation_status IN ('valid','invalid'))
invalid_reason      VARCHAR(32)
created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
UNIQUE (corpus_id, candidate_id, attempt)
```

In the same migration:

```sql
ALTER TABLE verifywise.bias_audit_runs
  ADD CONSTRAINT bias_audit_runs_corpus_id_fkey
  FOREIGN KEY (corpus_id) REFERENCES verifywise.bias_audit_corpora(id) ON DELETE SET NULL;
```

`down` drops the FK, then the two tables.

**`<TS2>-rls-policies-bias-audit-corpora.js`** is a copy of `20261014120200-rls-policies-bias-audit-tables.js` with `const TABLES = ["bias_audit_corpora", "bias_audit_corpus_records"];`.

In `Servers/tests/integration/tenant-isolation/tenantIsolation.registry.ts`, append `"bias_audit_corpora"` and `"bias_audit_corpus_records"` to the `bias_audit` entry's `tables` (`:156-161`). Task 8 extends `bias-audit.isolation.test.ts` once the routes exist.

Retention: a generated corpus is synthetic and contains no real applicant data, so corpora and their records are retained indefinitely, outside the platform's data-retention subsystem. Add a short paragraph saying so, naming both tables, to `docs/technical/domains/data-retention.md`, so the retention registry review does not flag them.

- [ ] **Step 2: Write the failing names and prompt tests**

The ruling: a record carries its group only as a plausible name for the assigned sex × race/ethnicity cell. Pronouns are added only where the artifact form is written in the third person, and none of the three v1 forms are, so v1 sends the name alone. Nothing else demographic enters the prompt, and qualifications come only from the assigned tier's narrative. With no group signal at all, every group's scores would differ only by noise and the balanced allocation would test nothing. Name-based correspondence testing is the standard method.

`names.ts` holds two tables: first names by sex and race/ethnicity, and surnames by race/ethnicity, each list at least 20 entries. Source them from published name–ethnicity data. Use Tzioumis (2018), "Demographic aspects of first names", *Scientific Data* 5:180025, for first names, taking those with at least a 0.75 share in the cell's category and at least 50 occurrences. Use the US Census Bureau 2010 surname file for surnames, taking those with at least a 0.75 share and at least 1,000 occurrences. Put the sources and thresholds in the file's header comment. Both sources merge Native Hawaiian or Pacific Islander into Asian. For that cell, hand-select names documented as specific to it, mark them in a comment, and record it as an open item in the ledger for review. The "Two or more races" cell draws from all lists combined, so its names carry a sex signal only. `NAME_METHOD` states all of this in one or two plain sentences, with no forbidden word, and the stance prints it.

```ts
// names.test.ts
import { LL144_RACE, LL144_SEX } from "./allocation";
import { NAME_METHOD, nameFor } from "./names";
import { findForbidden } from "../stance/vocabulary";

describe("nameFor", () => {
  it("returns a first name and surname for every cell", () => {
    for (const sex of LL144_SEX) for (const raceEthnicity of LL144_RACE) {
      expect(nameFor({ sex, raceEthnicity }, "C0001", 7)).toMatch(/^\S+ \S+/);
    }
  });

  it("is deterministic for a candidate and seed, and varies across candidates", () => {
    const d = { sex: "Female", raceEthnicity: "White" };
    expect(nameFor(d, "C0001", 7)).toBe(nameFor(d, "C0001", 7));
    const names = new Set(["C0001", "C0002", "C0003", "C0004", "C0005", "C0006"]
      .map((id) => nameFor(d, id, 7)));
    expect(names.size).toBeGreaterThan(1);
  });

  it("throws on a cell outside the LL 144 categories", () => {
    expect(() => nameFor({ sex: "X", raceEthnicity: "White" }, "C0001", 7)).toThrow();
  });
});

describe("NAME_METHOD", () => {
  it("states the method in plain words the stance can print", () => {
    expect(NAME_METHOD).toMatch(/name/i);
    expect(findForbidden(NAME_METHOD)).toEqual([]);
  });
});
```

```ts
// prompt.test.ts
import { JOB_DESCRIPTIONS } from "../../../structures/NYC-Local-Law-144/job-descriptions";
import { LL144_RACE, LL144_SEX } from "./allocation";
import { nameFor } from "./names";
import { buildPrompt, RECORD_MAX_CHARS, validateRecord, type ArtifactKind } from "./prompt";
import { findForbidden } from "../stance/vocabulary";

const jd = JOB_DESCRIPTIONS["commercial-ae"];
const KINDS: ArtifactKind[] = ["resume", "transcript", "structured"];
// The words for every group, and generic demographic terms. Whole words.
const GROUP_WORDS = /\b(male|female|man|woman|men|women|gender|sex|race|racial|ethnic|ethnicity|hispanic|latino|latina|latinx|white|black|african|asian|native|hawaiian|pacific|islander|alaska|indian|multiracial|biracial)\b/i;

describe("buildPrompt", () => {
  it("carries the job description and the assigned tier's narrative", () => {
    const p = buildPrompt({ jobDescription: jd, tierKey: "t3_borderline",
                            artifactKind: "resume", candidateName: "Ana Ruiz" });
    expect(p).toContain(jd.body);
    expect(p).toContain(jd.tiers[2].narrative);
    expect(p).toContain("Ana Ruiz");
  });

  it("takes qualifications from the assigned tier only", () => {
    const p = buildPrompt({ jobDescription: jd, tierKey: "t3_borderline",
                            artifactKind: "resume", candidateName: "Ana Ruiz" });
    for (const t of jd.tiers.filter((x) => x.key !== "t3_borderline")) {
      expect(p).not.toContain(t.narrative);
    }
  });

  it("never states the assigned group, for any cell and any artifact form", () => {
    for (const key of ["commercial-ae", "operational-hourly"] as const) {
      for (const sex of LL144_SEX) for (const raceEthnicity of LL144_RACE) {
        for (const artifactKind of KINDS) {
          const p = buildPrompt({
            jobDescription: JOB_DESCRIPTIONS[key], tierKey: "t5_strongly_qualified",
            artifactKind, candidateName: "Sam Lee",
          });
          expect(p).not.toMatch(GROUP_WORDS);
          expect(p).not.toContain(sex);
          expect(p).not.toContain(raceEthnicity);
        }
      }
    }
  });

  it("sends no pronouns for the v1 artifact forms", () => {
    for (const artifactKind of KINDS) {
      const p = buildPrompt({ jobDescription: jd, tierKey: "t1_strongly_under",
                              artifactKind, candidateName: "Sam Lee" });
      expect(p).not.toMatch(/pronoun/i);
    }
  });

  it("uses no forbidden vocabulary in any prompt", () => {
    for (const artifactKind of KINDS) {
      const p = buildPrompt({ jobDescription: jd, tierKey: "t4_qualified",
                              artifactKind, candidateName: nameFor(
                                { sex: "Male", raceEthnicity: "Asian" }, "C0001", 1) });
      expect(findForbidden(p)).toEqual([]);
    }
  });

  it("refuses an unknown tier", () => {
    expect(() => buildPrompt({ jobDescription: jd, tierKey: "t9",
                               artifactKind: "resume", candidateName: "Sam Lee" }))
      .toThrow(/tier/i);
  });
});

describe("validateRecord", () => {
  const resume = "Sam Lee\nExperience\nAccount Executive, 2019-2024\nSkills\nNegotiation";
  const transcript = "Interviewer: Tell me about a deal.\nCandidate: I ran it.\n" +
                     "Interviewer: How long?\nCandidate: Six months.";
  const structured = JSON.stringify({ summary: "x", experience: ["y"], skills: ["z"] });

  it("accepts a well-formed record of each kind", () => {
    expect(validateRecord(resume, "resume")).toEqual({ ok: true });
    expect(validateRecord(transcript, "transcript")).toEqual({ ok: true });
    expect(validateRecord(structured, "structured")).toEqual({ ok: true });
  });

  it("refuses empty and over-long text", () => {
    expect(validateRecord("  ", "resume")).toEqual({ ok: false, reason: "empty" });
    expect(validateRecord("x\n".repeat(RECORD_MAX_CHARS), "resume"))
      .toEqual({ ok: false, reason: "too_long" });
  });

  it("refuses forbidden vocabulary, by the module's matcher", () => {
    const word = ["pas", "sed"].join(""); // kept out of this source file as one token
    expect(validateRecord(`${resume}\nI ${word} the exam`, "resume"))
      .toEqual({ ok: false, reason: "forbidden_words" });
  });

  it("refuses a demographic field in any form", () => {
    expect(validateRecord(`${resume}\nGender: F`, "resume"))
      .toEqual({ ok: false, reason: "demographic_field" });
    expect(validateRecord(JSON.stringify({ summary: "x", ethnicity: "y" }), "structured"))
      .toEqual({ ok: false, reason: "demographic_field" });
  });

  it("refuses a record whose shape does not match its form", () => {
    expect(validateRecord(resume, "transcript")).toEqual({ ok: false, reason: "wrong_shape" });
    expect(validateRecord("not json", "structured")).toEqual({ ok: false, reason: "wrong_shape" });
  });
});
```

(Test files are excluded from the substring scan, but the joined token keeps the habit consistent.)

- [ ] **Step 3: Write the failing manifest and CSV tests**

```ts
// manifest.test.ts
import { buildManifest } from "./manifest";

const assigned = [...Array(100)].map((_, i) => ({
  candidateId: `C${String(i + 1).padStart(4, "0")}`,
  demographics: { sex: i % 2 ? "Male" : "Female", raceEthnicity: `R${i % 7}` },
  tierKey: `t${(i % 5) + 1}`,
}));

const entry = (id: string, status: "valid" | "invalid" = "valid", model = "m1", attempt = 1) => ({
  candidateId: id, attempt, validationStatus: status, modelName: model, promptHash: "h",
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
  });

  it("returns intersectional cell sizes keyed sex|race, from valid rows only", () => {
    const log = assigned.map((a) => entry(a.candidateId, a.candidateId === "C0001" ? "invalid" : "valid"));
    const { cellSizes } = buildManifest({ assigned, log });
    // C0001 is Female|R0.
    const full = buildManifest({ assigned, log: assigned.map((a) => entry(a.candidateId)) });
    expect(cellSizes["Female|R0"]).toBe(full.cellSizes["Female|R0"] - 1);
  });

  it("carries no generated text, only demographics and provenance, in candidate order", () => {
    const { rows } = buildManifest({ assigned, log: [...assigned].reverse().map((a) => entry(a.candidateId)) });
    const keys = Object.keys(rows[0]);
    expect(keys).not.toContain("text");
    expect(keys).toContain("candidateId");
    expect(keys).toContain("sex");
    expect(rows.map((r) => r.candidateId)).toEqual(assigned.map((a) => a.candidateId));
  });
});
```

```ts
// corpusCsv.test.ts
import { CORPUS_CSV_HEADER, corpusCsvHeaderLine, corpusCsvRow } from "./corpusCsv";

describe("corpus CSV", () => {
  it("has exactly candidate_id, artifact_kind and artifact, and no demographic or tier column", () => {
    expect([...CORPUS_CSV_HEADER]).toEqual(["candidate_id", "artifact_kind", "artifact"]);
    expect(corpusCsvHeaderLine()).toBe("candidate_id,artifact_kind,artifact\r\n");
  });

  it("quotes commas, quotes and newlines (RFC 4180)", () => {
    expect(corpusCsvRow({ candidateId: "C0001", artifactKind: "resume", text: 'a, "b"\nc' }))
      .toBe('C0001,resume,"a, ""b""\nc"\r\n');
  });

  it("neutralises a leading formula character", () => {
    expect(corpusCsvRow({ candidateId: "C0002", artifactKind: "resume", text: "=SUM(A1)" }))
      .toBe("C0002,resume,'=SUM(A1)\r\n");
  });
});
```

- [ ] **Step 4: Write the failing corpus test**

`generateCorpus.test.ts` mocks `../../../utils/biasAudit.utils`, `./gatewayClient` (`complete`), `./settings` (`getGatewaySettings` returns a fixed settings object), and `../../../database/db` (`sequelize.transaction` runs its callback). It keeps the real `assignCandidateIds` except where a test overrides `verifyIdOrder` through `jest.mock("./assignCandidateIds", () => ({ ...jest.requireActual("./assignCandidateIds"), verifyIdOrder: jest.fn(jest.requireActual<any>("./assignCandidateIds").verifyIdOrder) }))`. A helper `corpusRow(overrides)` returns a `running` 700-record `commercial-ae` resume corpus with a fixed seed. A helper `logFor(n)` builds `n` valid log entries for the first `n` candidate IDs of that plan.

```ts
describe("createCorpus", () => {
  it("gates ID order on the plan before inserting or spending anything", async () => {
    (verifyIdOrder as jest.Mock).mockImplementationOnce(() => {
      throw new IdOrderError("raceEthnicity: observed 14, expected 4286.7");
    });
    await expect(createCorpus(args)).rejects.toThrow(IdOrderError);
    expect(mockUtils.createCorpusQuery).not.toHaveBeenCalled();
    expect(mockComplete).not.toHaveBeenCalled();
  });

  it("refuses before inserting when the gateway is not configured", async () => {
    mockSettings.getGatewaySettings.mockImplementationOnce(() => {
      throw new GatewayNotConfiguredError(["LLM_API_KEY"]);
    });
    await expect(createCorpus(args)).rejects.toThrow(GatewayNotConfiguredError);
    expect(mockUtils.createCorpusQuery).not.toHaveBeenCalled();
  });

  it("records the pinned model, seed, JD hash, knockout, name method and comparison", async () => {
    mockUtils.createCorpusQuery.mockResolvedValueOnce({ id: 3 });
    await createCorpus({ ...args, knockout: "dont_know" });
    const row = mockUtils.createCorpusQuery.mock.calls[0][0];
    expect(row).toMatchObject({
      modelPinned: "pinned-model-1", knockout: "dont_know", requestedCount: 700,
      jobDescriptionSha256: jobDescriptionSha256(JOB_DESCRIPTIONS["commercial-ae"]),
      nameMethod: NAME_METHOD, criteriaComparison: args.criteriaComparison,
    });
    expect(Number.isInteger(row.seed)).toBe(true);
  });

  // Review Focus 5
  it("refuses a second concurrent run for the same project", async () => {
    const err: any = new Error("duplicate key");
    err.original = { code: "23505", constraint: "bias_audit_corpora_one_running_uq" };
    mockUtils.createCorpusQuery.mockRejectedValueOnce(err);
    await expect(createCorpus(args)).rejects.toThrow(/already running/i);
  });
});

describe("runCorpusGeneration", () => {
  it("records every model observed, not the pinned one", async () => {
    mockUtils.getCorpusQuery.mockResolvedValue(corpusRow());
    mockUtils.listCorpusLogQuery.mockResolvedValue([]);
    mockComplete
      .mockResolvedValueOnce({ text: RESUME, modelObserved: "m1", promptHash: "h".repeat(64) })
      .mockResolvedValue({ text: RESUME, modelObserved: "m2", promptHash: "h".repeat(64) });
    const out = await runCorpusGeneration({ corpusId: 3, organizationId: 1 });
    expect(out.modelsObserved).toEqual({ m1: 1, m2: 699 });
  });

  // Review Focus 1
  it("resumes from the log: generates only what is missing and builds the manifest from all of it", async () => {
    mockUtils.getCorpusQuery.mockResolvedValue(corpusRow());
    mockUtils.listCorpusLogQuery.mockResolvedValue(logFor(300));
    mockComplete.mockResolvedValue({ text: RESUME, modelObserved: "m1", promptHash: "h".repeat(64) });
    await runCorpusGeneration({ corpusId: 3, organizationId: 1 });
    expect(mockComplete).toHaveBeenCalledTimes(400);
    const done = mockUtils.updateCorpusStatusQuery.mock.calls.at(-1)![0];
    expect(done.manifest).toHaveLength(700);
  });

  it("leaves the corpus running after a mid-run failure, with every finished record logged", async () => {
    mockUtils.getCorpusQuery.mockResolvedValue(corpusRow());
    mockUtils.listCorpusLogQuery.mockResolvedValue([]);
    let calls = 0;
    mockComplete.mockImplementation(async () => {
      if (++calls > 100) throw new Error("gateway request failed (status 500)");
      return { text: RESUME, modelObserved: "m1", promptHash: "h".repeat(64) };
    });
    await expect(runCorpusGeneration({ corpusId: 3, organizationId: 1 })).rejects.toThrow();
    expect(mockUtils.appendCorpusRecordQuery).toHaveBeenCalledTimes(100);
    expect(mockUtils.updateCorpusStatusQuery).not.toHaveBeenCalled();
    // BullMQ retries the job (Task 8); the next attempt resumes from these 100.
  });

  it("retries an invalid record as a new attempt, never overwriting the first", async () => {
    mockUtils.getCorpusQuery.mockResolvedValue(corpusRow());
    mockUtils.listCorpusLogQuery.mockResolvedValue(logFor(699));
    mockComplete
      .mockResolvedValueOnce({ text: "  ", modelObserved: "m1", promptHash: "h".repeat(64) })
      .mockResolvedValueOnce({ text: RESUME, modelObserved: "m1", promptHash: "h".repeat(64) });
    await runCorpusGeneration({ corpusId: 3, organizationId: 1 });
    const appended = mockUtils.appendCorpusRecordQuery.mock.calls.map((c) => c[0]);
    expect(appended.map((r) => [r.attempt, r.validationStatus, r.invalidReason]))
      .toEqual([[1, "invalid", "empty"], [2, "valid", null]]);
  });

  it("touches the heartbeat at least every 25 records", async () => {
    mockUtils.getCorpusQuery.mockResolvedValue(corpusRow());
    mockUtils.listCorpusLogQuery.mockResolvedValue([]);
    mockComplete.mockResolvedValue({ text: RESUME, modelObserved: "m1", promptHash: "h".repeat(64) });
    await runCorpusGeneration({ corpusId: 3, organizationId: 1 });
    expect(mockUtils.touchCorpusHeartbeatQuery.mock.calls.length).toBeGreaterThanOrEqual(700 / 25);
  });

  it("stores separate manifest and corpus hashes on the completion write", async () => {
    mockUtils.getCorpusQuery.mockResolvedValue(corpusRow());
    mockUtils.listCorpusLogQuery.mockResolvedValue(logFor(700));
    mockUtils.listLatestValidRecordsPageQuery
      .mockResolvedValueOnce(pageOf(700)).mockResolvedValueOnce([]);
    await runCorpusGeneration({ corpusId: 3, organizationId: 1 });
    const done = mockUtils.updateCorpusStatusQuery.mock.calls.at(-1)![0];
    expect(done.status).toBe("complete");
    expect(done.manifestSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(done.corpusSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(done.manifestSha256).not.toBe(done.corpusSha256);
  });

  it("never sends the assigned group to the gateway", async () => {
    mockUtils.getCorpusQuery.mockResolvedValue(corpusRow());
    mockUtils.listCorpusLogQuery.mockResolvedValue(logFor(690));
    mockComplete.mockResolvedValue({ text: RESUME, modelObserved: "m1", promptHash: "h".repeat(64) });
    await runCorpusGeneration({ corpusId: 3, organizationId: 1 });
    for (const [, prompt] of mockComplete.mock.calls) {
      expect(prompt).not.toMatch(/\b(male|female|hispanic|latino|white|black|asian|native|race|ethnicity)\b/i);
    }
  });
});
```

`RESUME` is a fixture string that passes `validateRecord(…, "resume")`. `pageOf(n)` returns `n` `{ candidate_id, text }` rows.

- [ ] **Step 5: Run them, confirm failure, implement**

Run: `cd /Users/gorkemcetin/verifywise-ll144-12b/Servers && npm run test:unit -- services/biasAudit/generation/names.test.ts services/biasAudit/generation/prompt.test.ts services/biasAudit/generation/manifest.test.ts services/biasAudit/generation/corpusCsv.test.ts services/biasAudit/generation/generateCorpus.test.ts`
Expected: FAIL, cannot find modules.

Implementation notes:

- `prompt.ts`: the prompt consists of a fixed instruction for the artifact form, the JD body, the assigned tier's narrative, and the line `The candidate's name is <name>.` Each form's instruction (resume; interview transcript with `Interviewer:` and `Candidate:` lines; a JSON object with `summary`, `experience`, `skills`) asks for the candidate's own record of their work. It says to describe any licence or certification with a noun ("holds a current forklift licence"), not an adjective, and not to describe the candidate as checked, approved or graded by anyone. That steers output away from the forbidden words without the prompt containing them. `validateRecord` uses `findForbidden`. Its demographic check flags a resume or transcript line starting with `Gender|Sex|Race|Ethnicity|Age|Date of birth|Nationality` followed by `:`, and a structured key matching the same set.
- `generateCorpus.ts`, `createCorpus`: get settings (refuse before anything if not configured), draw the seed with `crypto.randomInt(1, 2 ** 31 - 1)`, build the plan (`buildAllocation` → `assignCandidateIds`, whose `verifyIdOrder` gates before any insert), then insert the `running` row. Map a unique violation through `isUniqueViolation` to `ConflictException("A corpus is already running for this project…")`. The plan is not stored. It is re-derived from `seed`, `requested_count` and the JD, so it is identical on every resume.
- `runCorpusGeneration`: load the corpus and re-derive the plan. Read the full log with `listCorpusLogQuery`. For each candidate in candidate-ID order whose latest attempt is not `valid`, and that has fewer than 3 attempts: build the prompt with `nameFor`, call `complete` (with `retries: 3`), run `validateRecord`, and append the attempt. Touch the heartbeat every 25 records. Do not catch gateway errors: the job fails, BullMQ retries it (Task 8), and the retry resumes from the log. When every candidate is valid or out of attempts, re-read the log and run `buildManifest`. Compute `manifestSha256` over the manifest JSON. Compute `corpusSha256` over exactly the bytes the download will serve (`corpusCsvHeaderLine()` then `corpusCsvRow` for each page of `listLatestValidRecordsPageQuery`, 500 rows a page), so a customer's hash of their download matches. Write `status: 'complete'`, `record_count`, `models_observed_json`, `cell_sizes_json`, `manifest_json` and both hashes in one `updateCorpusStatusQuery`. Task 7 changes the status to `complete` or `blocked` by the release gates.
- `knockout` is recorded and does not change generation (ledger ruling). The spec's "adjusted by `knockout.exists`" is an open item.
- Add `IO_LAYER` entry: `[path.join(MODULE, "generation", "generateCorpus.ts")]: "plans and runs a corpus: reads and appends records through utils/biasAudit.utils, calls the gateway client, hashes with node:crypto"`.
- `utils/biasAudit.utils.test.ts`: extend it with one test per new query asserting the SQL mentions `organization_id`, and that `listCorpusLogQuery` selects no `text` column (the log read is metadata only).

- [ ] **Step 6: Run everything this task touches, then commit**

Run: `cd /Users/gorkemcetin/verifywise-ll144-12b/Servers && npm run test:unit -- services/biasAudit/generation utils/biasAudit.utils.test.ts services/biasAudit/__tests__ && npm run build && npm run lint`
Expected: PASS (names 4, prompt 11, manifest 7, corpusCsv 3, generateCorpus 11); build and lint clean.

```bash
cd /Users/gorkemcetin/verifywise-ll144-12b
git add Servers/database/migrations/ Servers/services/biasAudit/generation/ Servers/utils/biasAudit.utils.ts Servers/utils/biasAudit.utils.test.ts Servers/services/biasAudit/__tests__/moduleIndependence.test.ts Servers/tests/integration/tenant-isolation/tenantIsolation.registry.ts docs/technical/domains/data-retention.md
git commit -m "feat(bias-audit): add corpus generation with an append-only record log

Every attempt at every record is appended to bias_audit_corpus_records
and never updated. The manifest is rebuilt by joining the deterministic
plan (re-derived from the stored seed) to the full log, not written from
the records of the current pass. A resumed run that rewrote it from one
pass left a 30-row manifest beside 340 artifacts on a real engagement:
analysing against it would have computed the verdict on 30 candidates
and reported it as 340.

A record's only group signal is a plausible name drawn from its sex and
race/ethnicity cell; the prompt never states the group, and the
qualification level comes from the tier narrative alone. The name
method is stored on the corpus for the stance.

The ID-order gate runs on the plan before the first request, since the
gate is cheap and generation is not. Every model observed is counted from
the responses. A partial unique index refuses a second concurrent run per
project. The manifest and the corpus are hashed separately; the corpus
hash covers exactly the bytes the download serves.

Corpora are synthetic and retained indefinitely, outside the retention
subsystem, as data-retention.md now states."
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

Task 8 runs it server-side when a corpus is created and stores the result in `criteria_comparison_json`. Task 10 prints it in the stance.

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

Run: `cd /Users/gorkemcetin/verifywise-ll144-12b/Servers && npm run test:unit -- services/biasAudit/criteriaComparison.test.ts`
Expected: FAIL, cannot find module.

Token-overlap scoring against each expected criterion's label plus description, with a match threshold. `close` when at most one expected criterion is unmatched; `divergent` otherwise. Pure: it imports only `JOB_DESCRIPTIONS`.

- [ ] **Step 3: Run the test, then commit**

Run: `cd /Users/gorkemcetin/verifywise-ll144-12b/Servers && npm run test:unit -- services/biasAudit/criteriaComparison.test.ts services/biasAudit/__tests__/moduleIndependence.test.ts`
Expected: PASS, 9 tests.

```bash
cd /Users/gorkemcetin/verifywise-ll144-12b
git add Servers/services/biasAudit/criteriaComparison.ts Servers/services/biasAudit/criteriaComparison.test.ts
git commit -m "feat(bias-audit): add the criteria-comparison check

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
- Modify: `Servers/services/biasAudit/generation/generateCorpus.ts` (run the gates at completion)
- Test: `Servers/services/biasAudit/generation/releaseGates.test.ts`
- Test: `Servers/services/biasAudit/generation/generateCorpus.test.ts` (extend)

**Interfaces:**
- Consumes: `MIN_PER_CELL` (Task 2); `measureIdOrder`, `GENERATED_MIN_RUN_FRACTION`, `IdOrderChecks` (Task 3); `buildManifest` (Task 5); `CriteriaComparison` (Task 6); `findForbidden` (test).
- Produces:
  - `interface ReleaseFinding { code: string; severity: "stop" | "warn"; message: string }`
  - ```ts
    interface ReleaseGateArgs {
      jobDescriptionKey: string;
      /** Distinct candidates with a valid latest record in the log. */
      recordCount: number;
      manifestRowCount: number;
      /** measureIdOrder on the MANIFEST rows in candidate-ID order, not the
       *  plan: records that never validated drop out, and the spec's gate
       *  "runs on output". */
      idOrderChecks: IdOrderChecks;
      /** buildManifest().cellSizes, keyed sex|race. */
      cellSizes: Record<string, number>;
      modelsObserved: Record<string, number>;
      criteriaVerdict: "close" | "divergent" | "not_supplied";
    }
    ```
  - `runReleaseGates(args: ReleaseGateArgs): ReleaseFinding[]`
  - Codes: `id_order_blocked`, `cell_too_small`, `manifest_count_mismatch` (stops); `multiple_models`, `criteria_divergent` (warnings).

Tier separation is **not** a release gate. Scores exist only after the customer scores the corpus, so a tier that fails to separate is detected in Task 10 on the scored run. At generation time, Task 1's structural test is the guard.

- [ ] **Step 1: Write the failing test**

```ts
import { runReleaseGates } from "./releaseGates";
import { MIN_PER_CELL, LL144_RACE, LL144_SEX, cellKey } from "./allocation";
import { findForbidden } from "../stance/vocabulary";

const cells = LL144_SEX.flatMap((sex) =>
  LL144_RACE.map((raceEthnicity) => cellKey({ sex, raceEthnicity })));

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
    const f = runReleaseGates({ ...base, cellSizes: { ...base.cellSizes, [cells[0]]: 12 } });
    const finding = f.find((x) => x.code === "cell_too_small")!;
    expect(finding.severity).toBe("stop");
    expect(finding.message).toContain(cells[0]);
    expect(finding.message).not.toMatch(/2%/);
  });

  it("uses the allocation floor, MIN_PER_CELL, as the threshold", () => {
    const at = runReleaseGates({ ...base, cellSizes: { ...base.cellSizes, [cells[0]]: MIN_PER_CELL } });
    const below = runReleaseGates({ ...base, cellSizes: { ...base.cellSizes, [cells[0]]: MIN_PER_CELL - 1 } });
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
      modelsObserved: { m1: 1, m2: 1 },
      idOrderChecks: { sex: { observed: 2, expected: 2500, fraction: 0.001 } },
      cellSizes: { ...base.cellSizes, [cells[0]]: 1 },
    });
    expect(findForbidden(f.map((x) => x.message).join(" "))).toEqual([]);
  });
});
```

- [ ] **Step 2: Run it, confirm failure, implement**

Run: `cd /Users/gorkemcetin/verifywise-ll144-12b/Servers && npm run test:unit -- services/biasAudit/generation/releaseGates.test.ts`
Expected: FAIL, cannot find module.

`id_order_blocked` fires for any attribute with `fraction < GENERATED_MIN_RUN_FRACTION`, and names the attribute plus the rounded observed and expected counts. `cell_too_small` fires for each cell below `MIN_PER_CELL` and names the cell and its count. Pure.

- [ ] **Step 3: Wire the gates into the job's completion**

In `runCorpusGeneration`, after `buildManifest`:

```ts
const idOrderChecks = measureIdOrder(
  manifest.rows.map((r) => ({
    candidateId: r.candidateId,
    demographics: { sex: r.sex, raceEthnicity: r.raceEthnicity },
    tierKey: r.tierKey,
  })),
  ["sex", "raceEthnicity"],
);
const findings = runReleaseGates({
  jobDescriptionKey: corpus.job_description_key,
  recordCount: await countValidCorpusRecordsQuery(corpusId, organizationId),
  manifestRowCount: manifest.rows.length,
  idOrderChecks,
  cellSizes: manifest.cellSizes,
  modelsObserved,
  criteriaVerdict: corpus.criteria_comparison_json.verdict,
});
const status = findings.some((f) => f.severity === "stop") ? "blocked" : "complete";
```

The same `updateCorpusStatusQuery` call that writes the hashes also writes `status`, `release_findings_json: findings` and `id_order_check_json: idOrderChecks`. A `blocked` corpus keeps its records and manifest for inspection, but Task 8's download refuses it. The return type widens to `status: "complete" | "blocked"`.

Add to `generateCorpus.test.ts`:

```ts
it("blocks release when a gate stops, and stores the findings", async () => {
  mockUtils.getCorpusQuery.mockResolvedValue(corpusRow());
  // One candidate never validated: its cell drops to 49, below MIN_PER_CELL.
  mockUtils.listCorpusLogQuery.mockResolvedValue(logForAllButOneInvalid(700));
  mockUtils.countValidCorpusRecordsQuery.mockResolvedValue(699);
  mockComplete.mockResolvedValue({ text: "  ", modelObserved: "m1", promptHash: "h".repeat(64) });
  await runCorpusGeneration({ corpusId: 3, organizationId: 1 });
  const done = mockUtils.updateCorpusStatusQuery.mock.calls.at(-1)![0];
  expect(done.status).toBe("blocked");
  expect(done.releaseFindings.map((f: any) => f.code)).toContain("cell_too_small");
});

it("measures ID order on the manifest it releases, not on the plan", async () => {
  mockUtils.getCorpusQuery.mockResolvedValue(corpusRow());
  mockUtils.listCorpusLogQuery.mockResolvedValue(logFor(700));
  mockUtils.countValidCorpusRecordsQuery.mockResolvedValue(700);
  await runCorpusGeneration({ corpusId: 3, organizationId: 1 });
  const done = mockUtils.updateCorpusStatusQuery.mock.calls.at(-1)![0];
  const expected = measureIdOrder(
    done.manifest.map((r: any) => ({ candidateId: r.candidateId,
      demographics: { sex: r.sex, raceEthnicity: r.raceEthnicity }, tierKey: r.tierKey })),
    ["sex", "raceEthnicity"],
  );
  expect(done.idOrderCheck).toEqual(expected);
  expect(done.status).toBe("complete");
  expect(done.releaseFindings).toEqual([]);
});
```

`logForAllButOneInvalid(n)` marks the last candidate's attempts 1–3 `invalid`, so it is out of attempts.

- [ ] **Step 4: Run the tests, then commit**

Run: `cd /Users/gorkemcetin/verifywise-ll144-12b/Servers && npm run test:unit -- services/biasAudit/generation services/biasAudit/__tests__`
Expected: PASS, 9 tests in `releaseGates.test.ts`, 13 in `generateCorpus.test.ts`.

```bash
cd /Users/gorkemcetin/verifywise-ll144-12b
git add Servers/services/biasAudit/generation/
git commit -m "feat(bias-audit): add release gates for a generated corpus

A corpus is not released on a blocked ID-order check, a manifest row
count that disagrees with the corpus, or an intersectional cell below
the allocation floor. Each corresponds to a real failure: a false race
finding from block ordering, a 30-row manifest beside 340 artifacts, and
cells too small to report.

The gates run from the job when generation completes. The ID-order
check is measured again on the manifest that ships rather than the plan,
since records that never validate drop out of it. A stop leaves the
corpus blocked, with its findings stored and no download.

Warnings cover a corpus that came from more than one model, which is not
one configuration, and criteria that diverge materially from the
expected set. Criteria not supplied is deliberately not a warning; the
stance records it. Tier separation is not a release gate: it needs
scores, which exist only once the customer has scored the corpus."
```

---

### Task 8: Routes, the background job, and module-wide rules

Server only. The page is Task 9.

**Files:**
- Create: `Servers/services/biasAudit/generation/generationJob.ts`
- Create: `Servers/services/biasAudit/corpusService.ts`
- Modify: `Servers/services/biasAudit/profileDecision.ts` (generation gate in the attested decision)
- Modify: `Servers/jobs/worker.ts` (register the worker)
- Modify: `Servers/controllers/biasAudit.ctrl.ts`
- Modify: `Servers/routes/biasAudit.route.ts`
- Modify: `Servers/utils/biasAudit.utils.ts` (`listCorporaQuery`)
- Modify: `Servers/services/biasAudit/__tests__/moduleIndependence.test.ts` (`IO_LAYER`: `generationJob.ts`, `corpusService.ts`)
- Modify: `Servers/services/biasAudit/__tests__/moduleRules.test.ts` (three new rules)
- Modify: `Servers/swagger.yaml`, `docs/api-docs/src/config/endpoints.ts` (regenerated)
- Test: `Servers/services/biasAudit/profileDecision.test.ts` (extend)
- Test: `Servers/services/biasAudit/corpusService.test.ts`
- Test: `Servers/services/biasAudit/generation/generationJob.test.ts`
- Test: `Servers/controllers/__tests__/biasAudit.ctrl.test.ts` (extend)
- Test: `Servers/routes/__tests__/biasAudit.route.test.ts` (extend)
- Test: `Servers/tests/integration/tenant-isolation/bias-audit.isolation.test.ts` (extend)

**Interfaces:**
- Consumes: Tasks 1–7; `assertProjectAccess` (`services/biasAudit/projectAccess.ts:28`); `runAnswerGates` (`answerGates.ts:94,108`); `LL144_FRAMEWORK_ID` (`controllers/biasAudit.ctrl.ts:47`, which is 12); `REDIS_URL` (`database/redis.ts`).
- Produces:
  - `ProfileDecision` gains `mayGenerate: boolean; generationBlocked: string[]` (from `runAnswerGates(answers).mayGenerate` and `.blocked.generation`).
  - `corpusService.ts`: `startCorpusGeneration(input)`, `listCorpora(scope)`, `getCorpusView(corpusId, viewer)`, `streamCorpusDownload(corpusId, viewer, write: (chunk: string) => void)`, `resumeCorpus(corpusId, viewer)`, `getJobDescriptionsView()`.
  - `generationJob.ts`: `CORPUS_QUEUE = "bias-audit-corpus-generation"`, `enqueueCorpusGeneration(corpusId, organizationId)`, `processCorpusJob(job)`, `onCorpusJobFailed(job, error)`, `createCorpusGenerationWorker()`.
  - Seven endpoints under `/api/bias-audit`:

| Method | Path | Permission | Access |
| --- | --- | --- | --- |
| GET | `/job-descriptions` | `biasAudit.read` | any org member |
| POST | `/criteria-comparison` | `biasAudit.edit` | any org member (preview, stores nothing) |
| POST | `/corpora` | `biasAudit.edit` | `assertProjectAccess` |
| GET | `/corpora` | `biasAudit.read` | `assertProjectAccess` (query `projectId`, `frameworkId`) |
| GET | `/corpora/:id` | `biasAudit.read` | `assertProjectAccess` on the corpus's project |
| GET | `/corpora/:id/download` | `biasAudit.read` | `assertProjectAccess` on the corpus's project |
| POST | `/corpora/:id/resume` | `biasAudit.edit` | `assertProjectAccess` on the corpus's project |

A corpus in another organization, or in a project the caller is not a member of, gets the same 404. `frameworkId` must be `LL144_FRAMEWORK_ID`; import the constant and do not write 12 literally.

- [ ] **Step 1: Write the failing module-rule additions**

Add three rules to `services/biasAudit/__tests__/moduleRules.test.ts`. The import ban and the vocabulary scan already exist there and in `moduleIndependence.test.ts`, so do not duplicate them:

```ts
it("never logs the gateway key or the settings object", () => {
  const offenders: string[] = [];
  for (const f of sourceFilesUnder(path.join(MODULE, "generation")).concat(
    path.join(MODULE, "corpusService.ts"))) {
    const src = fs.readFileSync(f, "utf8");
    if (/(console\.(log|error|warn|info)|logger\.\w+|log(Processing|Success|Failure))\([^)]*\b(apiKey|settings|LLM_API_KEY)\b/.test(src)) {
      offenders.push(path.relative(MODULE, f));
    }
  }
  expect(offenders).toEqual([]);
});

it("never maps allocation rows onto candidate ids by zip or index", () => {
  const offenders: string[] = [];
  for (const f of sourceFilesUnder(path.join(MODULE, "generation"))) {
    if (f.endsWith("assignCandidateIds.ts")) continue;
    const src = fs.readFileSync(f, "utf8");
    if (/rows\s*\.\s*map\s*\(\s*\(?\s*\w+\s*,\s*i\w*\s*\)?\s*=>[\s\S]{0,120}candidateId/.test(src)) {
      offenders.push(path.relative(MODULE, f));
    }
  }
  expect(offenders).toEqual([]);
});

it("keeps the corpus record log append-only", () => {
  const src = fs.readFileSync(UTILS_FILE, "utf8");
  expect(src).not.toMatch(/UPDATE\s+(verifywise\.)?bias_audit_corpus_records/i);
  expect(src).not.toMatch(/DELETE\s+FROM\s+(verifywise\.)?bias_audit_corpus_records/i);
});
```

Reuse the file's existing constants for `MODULE` and the utils path. If it has no `sourceFilesUnder` helper, add one: a recursive walk returning non-test `.ts` files.

- [ ] **Step 2: Write the failing profile-decision test**

In `profileDecision.test.ts`: `decideProfile` with `pipeline.input_form = "audio"` returns `mayGenerate: false` and a `generationBlocked` entry naming `pipeline.input_form`. With `"resume"` and every veto answered, it returns `mayGenerate: true, generationBlocked: []`.

- [ ] **Step 3: Write the failing service and job tests**

`corpusService.test.ts` mocks `../../utils/biasAudit.utils`, `./projectAccess`, `./generation/generateCorpus`, `./generation/generationJob` and `./generation/settings`. Cases:

1. `startCorpusGeneration` refuses with `ConflictException` (409) naming `pipeline.input_form` when the attested profile's answers block generation (audio). `createCorpus` is not called.
2. With no attested profile it throws `NotFoundException`, and nothing is created.
3. It resolves `artifactKind` from `pipeline.input_form` and `knockout` from `knockout.exists`: `"yes"` → `"yes"`, `is_dont_know` → `"dont_know"`, unanswered → `"dont_know"`. It passes them to `createCorpus`.
4. It stores `compareCriteria(key, criteriaSupplied)`, with verdict `not_supplied` when `criteriaSupplied` is null, as `criteriaComparison`.
5. It calls `markStaleCorporaFailedQuery(projectId, organizationId, 15)` before `createCorpus`, so a crashed worker's `running` row frees the unique index. It then calls `enqueueCorpusGeneration(corpusId, organizationId)`.
6. `getCorpusView` for a corpus whose project `assertProjectAccess` rejects throws the same `NotFoundException` as a missing corpus. The view never includes `manifest_json` or record text.
7. `streamCorpusDownload` throws `ConflictException` unless status is `complete` (`blocked`, `running` and `failed` each refuse). For a complete corpus, the first chunk is exactly `candidate_id,artifact_kind,artifact\r\n`, and the SHA-256 of all chunks equals the stored `corpus_sha256`.
8. `resumeCorpus` refuses a `complete` or `blocked` corpus (409). For a `failed` corpus, or a `running` one whose heartbeat is older than 15 minutes, it sets `running` (a unique violation maps to "already running") and re-enqueues.
9. `getJobDescriptionsView()` returns `key`, `roleTitle`, `body` and `expectedCriteria` (`key`, `label`, `description`) for both roles, plus `generationAvailable: isGatewayConfigured()`. `JSON.stringify` of it contains no tier narrative text and no `LLM_` value.

`generationJob.test.ts`:

1. `processCorpusJob({ data: { corpusId: 3, organizationId: 1 } })` calls `runCorpusGeneration` with those values.
2. `onCorpusJobFailed` marks the corpus `failed` with a `failure_code` only when `job.attemptsMade >= job.opts.attempts`. Before that it does nothing, since BullMQ will retry and the retry resumes from the log.
3. `enqueueCorpusGeneration` adds a job named `generate` with `jobId: "corpus-3"`, `attempts: 3` and exponential backoff.

- [ ] **Step 4: Write the failing controller and route tests**

`routes/__tests__/biasAudit.route.test.ts`: add `getJobDescriptions`, `compareCriteria`, `createCorpus`, `listCorpora`, `getCorpus`, `downloadCorpus` and `resumeCorpus` to the `jest.mock("../../controllers/biasAudit.ctrl", …)` list. A handler missing from it comes in `undefined`, and the router throws when the module loads. Add the seven rows to `ROUTES` with the permissions in the table above. The existing loop then checks each path, method, permission and handler.

`controllers/__tests__/biasAudit.ctrl.test.ts`: mock `../../services/biasAudit/corpusService` alongside the existing service mocks. Cases:

1. `createCorpus` defaults `count` to 5000 when absent. It returns 400 for 699, 10001, `"abc"` and 700.5, without calling the service. It accepts 700 and 10000.
2. `createCorpus` maps `GatewayNotConfiguredError` to 503 with a message saying generation is not available on this deployment. With `process.env.LLM_API_KEY = "sk-ctrl-secret"` set for the test, the response body does not contain it.
3. `createCorpus` passes the service's `ConflictException` (generation gate) through as 409 with its message.
4. `createCorpus` returns 400 for a `jobDescriptionKey` outside the two keys and for a `frameworkId` other than `LL144_FRAMEWORK_ID`.
5. `downloadCorpus` sets `Content-Type: text/csv; charset=utf-8` and `Content-Disposition: attachment; filename="corpus-<id>.csv"`, and writes what the service streams.
6. `getJobDescriptions` responds with the service view, and no response from any corpus handler contains `apiKey`.

`bias-audit.isolation.test.ts`: add cases where a user of org B gets 404 on `GET /api/bias-audit/corpora/:id` and `GET /api/bias-audit/corpora/:id/download` for an org A corpus, and on `POST /api/bias-audit/corpora/:id/resume`. Insert the corpus row directly, following the file's existing seeding.

- [ ] **Step 5: Run them, confirm failure**

Run: `cd /Users/gorkemcetin/verifywise-ll144-12b/Servers && npm run test:unit -- services/biasAudit/__tests__ services/biasAudit/profileDecision.test.ts services/biasAudit/corpusService.test.ts services/biasAudit/generation/generationJob.test.ts controllers/__tests__/biasAudit.ctrl.test.ts routes/__tests__/biasAudit.route.test.ts`
Expected: FAIL on the new cases; the existing ones still pass.

- [ ] **Step 6: Implement the job, service, controller and routes**

- `generationJob.ts`: follow `services/automations/automationWorker.ts:636` and `services/slack/slackWorker.ts`, which use factories and `connection: { url: REDIS_URL }`. The queue is `CORPUS_QUEUE`. The worker runs with `concurrency: 1` and `lockDuration: 10 * 60_000`, calls `processCorpusJob`, and `worker.on("failed", onCorpusJobFailed)`. Register it in `Servers/jobs/worker.ts` next to the other two: `const corpusGenerationWorker = createCorpusGenerationWorker();` and add it to `workers`.
- `corpusService.ts`: every read and write goes through `utils/biasAudit.utils.ts` (`listCorporaQuery` is new here), filtered on `organization_id`. A corpus-scoped call loads the corpus by id and organization, then runs `assertProjectAccess(corpus.project_id, organizationId, viewer, corpusNotFound(id))`, so a non-member and another organization both get the 404. The download pages `listLatestValidRecordsPageQuery` 500 rows at a time into `write`. It never buffers the whole corpus.
- Controller handlers parse and validate input: integers, `count` (default 5000, min 700, max 10000), `jobDescriptionKey` in `JOB_DESCRIPTION_KEYS`, `frameworkId === LL144_FRAMEWORK_ID`, and `criteriaSupplied` (string up to 10,000 characters, or absent). They call the service and use the controller's existing logging and error mapping. `GatewayNotConfiguredError` maps to 503. Nothing that touches settings is logged.
- Routes, in `routes/biasAudit.route.ts` (mounted at `/api/bias-audit`, `app.ts:417`). Declare `GET /corpora` before `GET /corpora/:id`.
- Add the `IO_LAYER` entries: `generationJob.ts` ("runs corpus generation under BullMQ and marks a corpus failed through utils/biasAudit.utils after its last retry") and `corpusService.ts` ("reads and writes corpora through utils/biasAudit.utils, checks project access, and enqueues the generation job").

- [ ] **Step 7: Regenerate the API surface**

Mandatory per `Servers/CLAUDE.md:164-204`; `check:api-drift` fails CI otherwise.

```bash
cd /Users/gorkemcetin/verifywise-ll144-12b/Servers
npm run generate:swagger && npm run generate:endpoints && npm run check:api-drift
```

Confirm all seven paths appear in `swagger.yaml` (near the existing bias-audit paths, `:24435`) and in `biasAuditEndpoints` in `docs/api-docs/src/config/endpoints.ts`.

- [ ] **Step 8: Run everything**

```bash
cd /Users/gorkemcetin/verifywise-ll144-12b/Servers
npm run test:unit -- services/biasAudit structures/NYC-Local-Law-144 utils/biasAudit.utils.test.ts controllers/__tests__/biasAudit.ctrl.test.ts routes/__tests__/biasAudit.route.test.ts
npm run build && npm run lint && npm run format-check
```

The isolation test is an integration test, and the dev database is never used for it. Task 11 runs it against the throwaway database.

- [ ] **Step 9: Commit**

```bash
cd /Users/gorkemcetin/verifywise-ll144-12b
git add Servers/services/biasAudit/ Servers/jobs/worker.ts Servers/controllers/biasAudit.ctrl.ts Servers/controllers/__tests__/biasAudit.ctrl.test.ts Servers/routes/biasAudit.route.ts Servers/routes/__tests__/biasAudit.route.test.ts Servers/utils/biasAudit.utils.ts Servers/utils/biasAudit.utils.test.ts Servers/tests/integration/tenant-isolation/bias-audit.isolation.test.ts Servers/swagger.yaml docs/api-docs/src/config/endpoints.ts
git commit -m "feat(bias-audit): add generation routes, the background job and module rules

Seven endpoints under /api/bias-audit: the two job descriptions (without
the tier narratives, which are prompt material), a criteria-comparison
preview, and create, list, view, download and resume for corpora. Reads
use biasAudit.read and writes biasAudit.edit; every corpus route also
runs the project-member check, so another organization and a non-member
both get 404. Count defaults to 5,000, with 700 and 10,000 as bounds.

Generation runs as a BullMQ job that resumes from the record log on
every retry. A heartbeat older than 15 minutes marks a crashed corpus
failed, which frees the one-running-per-project index, and a failed
corpus can be resumed. A download is served only for a complete corpus
and carries candidate_id, artifact_kind and artifact, with no
demographic or tier column, so the customer's platform scores blind.

Three rules are added to the module's rule test: no log call carries the
gateway key or settings, no allocation row is mapped onto a candidate ID
by index outside the permutation, and nothing updates or deletes a
record in the append-only log."
```

---

### Task 9: The generation page

Split from Task 8 so the page carries its own tests. There is no settings page: the key is deployment configuration (Task 4).

**Files:**
- Create: `Clients/src/presentation/pages/BiasAudit/GenerateCorpus.tsx`
- Modify: `Clients/src/presentation/pages/BiasAudit/sections.ts` (add `"generate"`)
- Modify: `Clients/src/presentation/pages/BiasAudit/BiasAuditSidebar.tsx` (the item)
- Modify: `Clients/src/presentation/pages/BiasAudit/index.tsx` (mount the section)
- Modify: `Clients/src/infrastructure/api/aedtBiasAuditService.ts` (client methods and types)
- Modify: `Clients/src/application/hooks/useAedtBiasAudit.ts` (hooks)
- Modify: `Clients/src/i18n/translations.ts` (de/fr/es)
- Test: `Clients/src/presentation/pages/BiasAudit/__tests__/GenerateCorpus.test.tsx`
- Test: `Clients/src/presentation/pages/BiasAudit/__tests__/BiasAuditSidebar.test.tsx` (extend)
- Test: `Clients/src/presentation/pages/BiasAudit/__tests__/BiasAuditPage.test.tsx` (extend)

**Interfaces:**
- Consumes: Task 8's endpoints and `attestedDecision.mayGenerate`/`generationBlocked`; `EducationPanel` with `pageKey="run.job_description"` and `"run.criteria_comparison"` (both keys exist in `education/content.ts:85,97`).
- Produces:
  - Methods on the `AedtBiasAuditService` class (exported as `aedtBiasAuditService`, `aedtBiasAuditService.ts:427`). Not on `biasAuditService.ts`, which is the Evals client. The methods are `getJobDescriptions()`, `compareCriteria({ jobDescriptionKey, criteriaSupplied })`, `createCorpus({ projectId, frameworkId, jobDescriptionKey, criteriaSupplied, count })`, `listCorpora(projectId, frameworkId)`, `getCorpus(id)`, `downloadCorpus(id)` (a blob, saved as `corpus-<id>.csv` the way `downloadStance` saves), and `resumeCorpus(id)`. Types: `AedtJobDescription`, `AedtCriteriaComparison`, `AedtCorpus` (`status: "running" | "complete" | "blocked" | "failed"`, `releaseFindings`, `cellSizes`, `modelsObserved`, `recordCount`, `requestedCount`). `AedtProfileView.attestedDecision` gains `mayGenerate: boolean; generationBlocked: string[]`.
  - Hooks: `useAedtJobDescriptions`, `useAedtCorpora(projectId, frameworkId)` (refetches every 5 s while any corpus is `running`), `useCreateAedtCorpus`, `useCompareAedtCriteria`, `useResumeAedtCorpus`.
  - `GenerateCorpus` (default export) with props `{ projectId: number; frameworkId: number; canEdit: boolean; mayGenerate: boolean; blockedReason: string | null }`.
  - Section `"generate"` in `BIAS_AUDIT_SECTIONS`, after `"profile"`.

- [ ] **Step 1: Write the failing page test**

Render the page inside the same QueryClient wrapper `RunUpload.test.tsx` uses.

```tsx
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import GenerateCorpus from "../GenerateCorpus";
import { renderWithQueryClient } from "./biasAuditPageHarness"; // or RunUpload.test.tsx's wrapper

const svc = vi.hoisted(() => ({
  getJobDescriptions: vi.fn(),
  compareCriteria: vi.fn(),
  createCorpus: vi.fn(),
  listCorpora: vi.fn(),
  resumeCorpus: vi.fn(),
  downloadCorpus: vi.fn(),
}));
vi.mock("../../../../infrastructure/api/aedtBiasAuditService", () => ({
  aedtBiasAuditService: svc,
}));

const JDS = {
  generationAvailable: true,
  jobDescriptions: [
    { key: "commercial-ae", roleTitle: "Account Executive", body: "Account Executive, New Business…",
      expectedCriteria: [{ key: "quota_attainment", label: "Quota attainment", description: "…" }] },
    { key: "operational-hourly", roleTitle: "Warehouse Operations Associate", body: "Warehouse…",
      expectedCriteria: [{ key: "measured_rate", label: "Measured rate or throughput", description: "…" }] },
  ],
};
const props = { projectId: 7, frameworkId: 12, canEdit: true, mayGenerate: true, blockedReason: null };

beforeEach(() => {
  Object.values(svc).forEach((f) => f.mockReset());
  svc.getJobDescriptions.mockResolvedValue(JDS);
  svc.listCorpora.mockResolvedValue([]);
});

describe("GenerateCorpus", () => {
  it("offers exactly the two fixed job descriptions, with no free-text alternative", async () => {
    renderWithQueryClient(<GenerateCorpus {...props} />);
    expect(await screen.findByText("Account Executive")).toBeInTheDocument();
    expect(screen.getByText("Warehouse Operations Associate")).toBeInTheDocument();
    expect(screen.queryByLabelText(/paste.*job description|own job description/i)).toBeNull();
  });

  it("states that the result describes the role tested, not all hiring", async () => {
    renderWithQueryClient(<GenerateCorpus {...props} />);
    expect(await screen.findByTestId("aedt-generate-role-statement"))
      .toHaveTextContent(/that role/i);
  });

  it("disables generation and names the reason when the gate blocks", async () => {
    renderWithQueryClient(<GenerateCorpus {...props} mayGenerate={false}
      blockedReason="pipeline.input_form is audio, which this module cannot generate" />);
    expect(await screen.findByTestId("aedt-generate-corpus")).toBeDisabled();
    expect(screen.getByText(/pipeline\.input_form/)).toBeInTheDocument();
  });

  it("disables generation when the deployment has no gateway configured", async () => {
    svc.getJobDescriptions.mockResolvedValue({ ...JDS, generationAvailable: false });
    renderWithQueryClient(<GenerateCorpus {...props} />);
    expect(await screen.findByText(/not available on this deployment/i)).toBeInTheDocument();
    expect(screen.getByTestId("aedt-generate-corpus")).toBeDisabled();
  });

  it("runs the criteria comparison and shows a divergent verdict", async () => {
    svc.compareCriteria.mockResolvedValue({
      verdict: "divergent", unmatchedExpected: ["cycle_length", "deal_size"],
      unmatchedSupplied: [], matched: [], supplied: ["Communication"],
    });
    renderWithQueryClient(<GenerateCorpus {...props} />);
    await userEvent.click(await screen.findByText("Account Executive"));
    await userEvent.type(screen.getByLabelText(/criteria your platform/i), "Communication");
    await userEvent.click(screen.getByTestId("aedt-compare-criteria"));
    await waitFor(() =>
      expect(screen.getByText(/may not exercise your configuration/i)).toBeInTheDocument());
    expect(screen.getByText(/cycle_length/)).toBeInTheDocument();
  });

  it("generates without a comparison, at the default count", async () => {
    svc.createCorpus.mockResolvedValue({ corpusId: 3 });
    renderWithQueryClient(<GenerateCorpus {...props} />);
    await userEvent.click(await screen.findByText("Account Executive"));
    await userEvent.click(screen.getByTestId("aedt-generate-corpus"));
    await waitFor(() => expect(svc.createCorpus).toHaveBeenCalled());
    expect(svc.createCorpus.mock.calls[0][0]).toEqual({
      projectId: 7, frameworkId: 12, jobDescriptionKey: "commercial-ae",
      criteriaSupplied: null, count: 5000,
    });
  });

  it("refuses a count below 700 without calling the server", async () => {
    renderWithQueryClient(<GenerateCorpus {...props} />);
    await userEvent.click(await screen.findByText("Account Executive"));
    const count = screen.getByLabelText(/number of records/i);
    await userEvent.clear(count);
    await userEvent.type(count, "300");
    expect(screen.getByText(/at least 700/i)).toBeInTheDocument();
    expect(screen.getByTestId("aedt-generate-corpus")).toBeDisabled();
  });

  it("lists corpora with the action each status allows", async () => {
    svc.listCorpora.mockResolvedValue([
      { id: 1, status: "complete", jobDescriptionKey: "commercial-ae", recordCount: 700,
        requestedCount: 700, releaseFindings: [], cellSizes: {}, modelsObserved: { m1: 700 } },
      { id: 2, status: "failed", jobDescriptionKey: "commercial-ae", recordCount: null,
        requestedCount: 700, releaseFindings: [], cellSizes: {}, modelsObserved: {} },
      { id: 3, status: "blocked", jobDescriptionKey: "commercial-ae", recordCount: 699,
        requestedCount: 700, cellSizes: {}, modelsObserved: { m1: 699 },
        releaseFindings: [{ code: "cell_too_small", severity: "stop",
                            message: "Cell Male|Asian holds 49 records" }] },
    ]);
    renderWithQueryClient(<GenerateCorpus {...props} />);
    expect(await screen.findByTestId("aedt-download-corpus-1")).toBeEnabled();
    expect(screen.getByTestId("aedt-resume-corpus-2")).toBeEnabled();
    expect(screen.queryByTestId("aedt-download-corpus-3")).toBeNull();
    expect(screen.getByText(/Male\|Asian holds 49/)).toBeInTheDocument();
  });

  it("never uses forbidden vocabulary", async () => {
    // Clients cannot import Servers/services/biasAudit/stance/vocabulary.ts;
    // same list, same whole-word rule. Built from fragments so the words
    // themselves never sit in source.
    renderWithQueryClient(<GenerateCorpus {...props} />);
    await screen.findByText("Account Executive");
    const text = document.body.textContent!.toLowerCase();
    const words = [["compl", "iant"], ["certi", "fied"], ["pas", "sed"],
                   ["bias", "-free"], ["audi", "ted"]].map((p) => p.join(""));
    for (const w of words) {
      expect(text).not.toMatch(new RegExp(`(?<![a-z0-9])${w}(?![a-z0-9])`));
    }
  });
});
```

Extend `BiasAuditSidebar.test.tsx`: the sidebar shows a "Generate" item that links to `/bias-audit/7/generate`. Extend `BiasAuditPage.test.tsx`: `/bias-audit/7/generate` renders `GenerateCorpus`, and `parseSection("generate")` returns `"generate"`.

- [ ] **Step 2: Run them, confirm failure**

Run: `cd /Users/gorkemcetin/verifywise-ll144-12b/Clients && npx vitest run src/presentation/pages/BiasAudit --no-file-parallelism`
Expected: FAIL on the new tests.

- [ ] **Step 3: Implement**

Copy the component patterns from `pages/BiasAudit/RunUpload.tsx` and `StancePanel.tsx`: `CustomizableButton` (with `text=`, not `label=`) and `testId`, `Field`, `Select`, `cardSx`/`titleSx` from `./styles`, and `palette` from the theme. Keep the house rules: sentence case, border `#d0d5dd`, radius 4px, controls 30px high, primary `#13715B`, pixel spacing strings.

The page shows:
- The two job descriptions as selectable cards (role title, criteria labels). The selected card shows the full body with a "Copy job description" button, since the customer runs it through their own platform.
- The role statement, `data-testid="aedt-generate-role-statement"`: "The result describes your tool on that role, not across all of your hiring."
- `EducationPanel pageKey="run.job_description"`.
- A criteria text area labelled "Criteria your platform generated", a compare button (`testId="aedt-compare-criteria"`), and `EducationPanel pageKey="run.criteria_comparison"` beside it. A divergent verdict shows "The corpus may not exercise your configuration well" and lists the unmatched criteria.
- A "Number of records" field (default 5000, min 700, max 10000, error "Use at least 700 records, 50 per cell" below the minimum).
- The generate button (`testId="aedt-generate-corpus"`). It is disabled while `!canEdit`, `!mayGenerate`, `!generationAvailable`, no job description is chosen, or the count is invalid. The reason is shown beside it. When the gateway is absent, the reason reads: "Generation is not available on this deployment. Contact VerifyWise."
- The corpus list: status, records, models observed, release findings, download for `complete` (`aedt-download-corpus-<id>`), and resume for `failed` (`aedt-resume-corpus-<id>`).

In `index.tsx`, mount it for section `"generate"` with `mayGenerate`/`generationBlocked.join("; ")` from `profileView.attestedDecision`. With no attested profile, `mayGenerate` is false and the reason reads "Attest the profile first." Add the sidebar item between profile and runs. If `useActiveModule` lists the module's sections, update it too.

Add de/fr/es to `Clients/src/i18n/translations.ts` for every new visible string and aria-label, following commits b3f8b3c45 and 8ec779790.

- [ ] **Step 4: Run the tests and every Clients gate**

```bash
cd /Users/gorkemcetin/verifywise-ll144-12b/Clients
npx vitest run src/presentation/pages/BiasAudit src/application/hooks/__tests__/useAedtBiasAudit.test.ts --no-file-parallelism
npm run typecheck && npm run lint && npm run i18n:audit:strict && npm run format-check
```

Expected: PASS (9 new in `GenerateCorpus.test.tsx`, plus the sidebar and page additions). All four gates clean. `typecheck` is not optional: the build does not run `tsc`.

- [ ] **Step 5: Commit**

```bash
cd /Users/gorkemcetin/verifywise-ll144-12b
git add Clients/src/presentation/pages/BiasAudit/ Clients/src/infrastructure/api/aedtBiasAuditService.ts Clients/src/application/hooks/useAedtBiasAudit.ts Clients/src/i18n/translations.ts
git commit -m "feat(bias-audit): add the corpus generation page

A generate section in the bias module, between the profile and runs. It
offers exactly the two fixed job descriptions with no free-text
alternative, since the restriction is what makes the expected criteria
known in advance and every corpus comparable, and states that the result
describes the role tested rather than all of the customer's hiring, which
is the 5-301 position: the audit attaches to the tool, so one role is
defensible provided it is named.

The criteria comparison runs before generation and a divergent result is
shown with the unmatched criteria. Generation is disabled, with the
reason beside the button, while the attested profile blocks it or the
deployment has no gateway configured. The corpus list offers a download
only for a complete corpus and a resume for a failed one, and shows
release findings for a blocked one.

There is no settings page: the gateway key is deployment configuration
and never reaches the client."
```

---

### Task 10: Corpus → run → stance

The customer's scored file carries `candidate_id` plus a score or selection and **no demographics**, by design. This task joins it to the manifest, records which corpus the run came from, keeps the trend honest about the change of data source, and puts the corpus into the stance. Spec S:323, S:639-642, S:676, S:697 and S:855-856 require it.

**Files:**
- Create: `Servers/services/biasAudit/corpusJoin.ts`
- Modify: `Servers/services/biasAudit/runService.ts` (`CreateRunInput.corpusId`, the corpus branch in `createRun`)
- Modify: `Servers/controllers/biasAudit.ctrl.ts` (parse `corpusId` in `createRun`)
- Modify: `Servers/services/biasAudit/trendSeries.ts` (provenance break)
- Modify: `Servers/utils/biasAudit.utils.ts` (`TrendRunRow` + `listTrendRunsQuery` join the corpus)
- Modify: `Servers/services/biasAudit/stance/compose.ts` (`ComposeStanceArgs.corpus`, `testedBody`)
- Modify: `Servers/services/biasAudit/stance/render.ts` (`tested.corpus`)
- Modify: `Servers/services/biasAudit/stance/sectionChecker.ts` (corpus facts)
- Modify: `Servers/templates/biasAudit/stance.ejs` (corpus rows)
- Modify: `Servers/services/biasAudit/stanceService.ts` (load the corpus for a corpus run)
- Modify: `Clients/src/presentation/pages/BiasAudit/RunUpload.tsx`, `Clients/src/infrastructure/api/aedtBiasAuditService.ts` (`createRun` sends `corpusId`), `Clients/src/application/hooks/useAedtBiasAudit.ts`, `Clients/src/i18n/translations.ts`
- Test: `Servers/services/biasAudit/corpusJoin.test.ts`
- Test: `Servers/services/biasAudit/runService.test.ts`, `trendSeries.test.ts`, `stance/compose.test.ts`, `stance/render.test.ts`, `stanceService.test.ts` (extend)
- Test: `Clients/src/presentation/pages/BiasAudit/__tests__/RunUpload.test.tsx` (extend)

**Interfaces:**
- Consumes: Task 5's `ManifestRow`, `CorpusRow`, `getCorpusQuery`; Task 1's `JOB_DESCRIPTIONS`; Task 2's `LL144_SEX`/`LL144_RACE`/`cellKey`; Task 6's `CriteriaComparison`; Task 8's `listCorpora`; `sameJobDescription` (`jobDescription.ts`); `RECORD_KEYS`, `GateFinding`.
- Produces:
  - ```ts
    // corpusJoin.ts (pure)
    export const CORPUS_ID_KEY = "candidate_id";
    export const TIER_SEPARATION_MIN = 0.02;
    export function joinScoresToManifest(records: AuditRecord[], manifest: ManifestRow[]):
      { ok: true; records: AuditRecord[] } | { ok: false; findings: GateFinding[] };
    export function tierSeparationFindings(
      records: AuditRecord[],               // joined, before candidate_id is dropped
      manifest: ManifestRow[],
      metric: "selection_rate" | "scoring_rate",
      tierOrder: string[],
    ): GateFinding[];
    ```
    `joinScoresToManifest` refuses blank IDs (`corpus_id_blank`), IDs not in the manifest (`corpus_ids_unknown`, naming up to five), duplicate IDs (`corpus_ids_duplicate`), and manifest IDs absent from the file (`corpus_ids_missing`, with the count). On success it sets each record's `sex` and `race_ethnicity` from the manifest and drops `candidate_id`.
  - `CreateRunInput.corpusId: number | null`.
  - `TrendRun` / `TrendRunRow` gain `corpus_id: number | null; corpus_job_description_sha256: string | null`, and `TrendSegment` gains `corpusId: number | null` and `corpusJobDescriptionSha256: string | null`.
  - ```ts
    // compose.ts
    export interface CorpusStanceFacts {
      corpusId: number;
      roleTitle: string;
      recordCount: number;
      modelPinned: string;
      modelsObserved: Record<string, number>;
      cellSizes: Record<string, number>;
      criteria: { verdict: "close" | "divergent" | "not_supplied"; unmatchedExpected: string[] };
      knockout: "yes" | "no" | "dont_know";
      nameMethod: string;
    }
    // ComposeStanceArgs gains: corpus: CorpusStanceFacts | null
    ```
  - `checkSections(html, required?, opts?: { corpus?: boolean })`: with `corpus: true`, `missing` also lists any absent `what_was_tested.corpus.<fact>` for the facts `corpus`, `models`, `cell_sizes` and `criteria`.

- [ ] **Step 1: Write the failing join test**

```ts
import { joinScoresToManifest, tierSeparationFindings } from "./corpusJoin";

const manifest = [...Array(28)].map((_, i) => ({
  candidateId: `C${String(i + 1).padStart(4, "0")}`,
  sex: i % 2 ? "Male" : "Female",
  raceEthnicity: ["White", "Asian"][i % 2 === 0 ? 0 : 1],
  tierKey: `t${(i % 5) + 1}`,
  modelName: "m1", promptHash: "h",
}));
const upload = (ids: string[]) => ids.map((id) => ({ candidate_id: id, selected: true }));

describe("joinScoresToManifest", () => {
  it("injects sex and race/ethnicity from the manifest and drops the id", () => {
    const out = joinScoresToManifest(upload(manifest.map((m) => m.candidateId)), manifest);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.records[0]).toEqual({ selected: true, sex: "Female", race_ethnicity: "White" });
    expect(out.records[0]).not.toHaveProperty("candidate_id");
  });

  it("refuses an id the manifest does not hold, naming it", () => {
    const out = joinScoresToManifest(upload([...manifest.map((m) => m.candidateId), "C9999"]), manifest);
    expect(out.ok).toBe(false);
    if (out.ok) return;
    const f = out.findings.find((x) => x.code === "corpus_ids_unknown")!;
    expect(f.message).toContain("C9999");
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
    const rates: Record<string, number> = { t1: 0, t2: 0.2, t3: 0.4, t4: 0.6, t5: 1 };
    let n = 0;
    const recs = manifest.map((m) => ({ candidate_id: m.candidateId,
      selected: (n++ % 10) / 10 < rates[m.tierKey] }));
    expect(tierSeparationFindings(recs, manifest, "selection_rate", tiers)).toEqual([]);
  });

  it("warns, naming both tiers, when adjacent tiers do not separate", () => {
    const f = tierSeparationFindings(joined((t) => t === "t4" || t === "t5"),
                                     manifest, "selection_rate", tiers);
    const w = f.find((x) => x.code === "tier_does_not_separate")!;
    expect(w.severity).toBe("warn");
    expect(w.message).toMatch(/t4.*t5|t5.*t4/);
  });

  it("scales scores to the observed range for a scoring-rate run", () => {
    const recs = manifest.map((m) => ({ candidate_id: m.candidateId,
      score: { t1: 10, t2: 20, t3: 30, t4: 40, t5: 40.1 }[m.tierKey as "t1"] }));
    const f = tierSeparationFindings(recs, manifest, "scoring_rate", tiers);
    expect(f.map((x) => x.code)).toContain("tier_does_not_separate");
  });
});
```

A tier's value is its selection rate, or its mean score scaled to [0, 1] by the observed minimum and maximum. A warning fires for each adjacent pair whose upper tier exceeds the lower by less than `TIER_SEPARATION_MIN`, reversals included. It is a data-quality warning, not a stop. `mayExportStoredRun` (`dataGates.ts`) reads only stops; confirm that, and the stance shows the warning with the run's other findings.

- [ ] **Step 2: Write the failing run, trend and stance tests**

`runService.test.ts` (its existing mocks of utils and db stay):

1. `LL144_SEX`/`LL144_RACE` from `./generation/allocation` equal `LL144_CONFIG.categories.sex.groups` and `.race_ethnicity.groups`.
2. With `corpusId` set and `getCorpusQuery` returning a `complete` corpus for the same project, `createRun` accepts a mapping of only `candidate_id` plus the outcome key. It refuses a category key in the mapping with a 400 ("the corpus supplies sex and race/ethnicity"). It runs the engine on joined records, stores `corpusId`, and stores `jobDescriptionKey = JOB_DESCRIPTIONS[corpus.job_description_key].roleTitle`.
3. A client `jobDescriptionKey` that differs from the role title by `sameJobDescription` is refused with a 400. A null one, or one equal under collation, is accepted.
4. A corpus in another project or organization → `NotFoundException`. A corpus that is not `complete` → `ConflictException`.
5. Join refusals (unknown, duplicate, missing, blank ID) → `ValidationException` with the finding's message. No run is stored.
6. A run whose tiers do not separate is stored with a `tier_does_not_separate` warning in `gateFindingsJson`.

`trendSeries.test.ts`:

1. An uploaded run followed by a corpus run with the same `job_description_key` breaks the series, with reason "the data source changed between uploaded and generated data".
2. Two corpus runs whose corpora share `corpus_job_description_sha256` do not break, even with different `corpus_id`s.
3. Two corpus runs whose JD hashes differ break, with "the fixed job description text changed between corpora".

`stance/compose.test.ts`:

1. With `corpus` set, the `what_was_tested` body says "Job description tested: the VerifyWise fixed job description for Account Executive." It does not say "Job description tested: Account Executive." as a customer span, and no `job_description` blank field is added.
2. It states the criteria outcome for each verdict. "close" gives "matched the expected set". "divergent" names the unmatched criteria. "not_supplied" gives "built against expected criteria that were not confirmed against the platform's own output".
3. It states the knockout record: "yes" says knocked-out candidates are pooled with low scorers in these rates, and "dont_know" says it is not established.
4. It prints `nameMethod`.
5. With more than one model in `modelsObserved`, it says "not one configuration".
6. With `corpus: null`, the body is unchanged from today: the existing tests still pass untouched.
7. `findForbidden` over the full composed corpus stance is empty.

`stance/render.test.ts`: the rendered HTML for a corpus stance has `data-fact` markers `corpus`, `models`, `cell_sizes` and `criteria` inside `section[data-key="what_was_tested"]`. `checkSections(html, REQUIRED_SECTIONS, { corpus: true })` is ok. With the template's corpus rows removed (render with `tested.corpus = null` but check with `{ corpus: true }`), `missing` lists the four facts.

`stanceService.test.ts`: for a run with `corpus_id`, `generateStance` loads the corpus with `getCorpusQuery(run.corpus_id, organizationId)` and passes `CorpusStanceFacts` built from its row to `composeStance` and to the evidence. For a run without one, it passes `corpus: null`.

- [ ] **Step 3: Write the failing upload test**

In `RunUpload.test.tsx`, mock `aedtBiasAuditService.listCorpora` to return one complete corpus (`id: 3`, `jobDescriptionKey: "commercial-ae"`, role title shown from `getJobDescriptions`).

1. Choosing "Scored from generated corpus #3" (select `testId="aedt-run-corpus"`) hides the sex and race/ethnicity mapping selects and the job description field. It shows "Job description: Account Executive (fixed)" and adds a required "Candidate ID column" mapping.
2. Submitting sends `corpusId: 3`, `mapping: { candidate_id: <header>, selected: <header> }` and no `jobDescription`.
3. With no complete corpus, the corpus select is absent and the existing flow is unchanged.

- [ ] **Step 4: Run them, confirm failure**

```bash
cd /Users/gorkemcetin/verifywise-ll144-12b/Servers
npm run test:unit -- services/biasAudit/corpusJoin.test.ts services/biasAudit/runService.test.ts services/biasAudit/trendSeries.test.ts services/biasAudit/stance services/biasAudit/stanceService.test.ts
cd /Users/gorkemcetin/verifywise-ll144-12b/Clients
npx vitest run src/presentation/pages/BiasAudit/__tests__/RunUpload.test.tsx --no-file-parallelism
```

Expected: FAIL on the new cases.

- [ ] **Step 5: Implement**

- `corpusJoin.ts`: pure. It imports only `AuditRecord`/`GateFinding` types from inside the module and `ManifestRow` as a type from `./generation/manifest`.
- `runService.createRun`: when `corpusId !== null`, load the corpus (`getCorpusQuery(corpusId, organizationId)`). Return 404 if it is absent or `corpus.project_id !== projectId`, and 409 unless it is `complete`. The allowed mapping keys become `{ CORPUS_ID_KEY, outcomeKey }`. Parse as today, then run `joinScoresToManifest(parsed.records, corpus.manifest_json)` and throw `ValidationException` with the joined finding messages on refusal. Run `tierSeparationFindings` on the joined records before the ID is dropped. Run the engine on the joined records and append the tier findings to the outcome's gate findings. Store `corpusId` and the derived `jobDescriptionKey`. The existing uploaded-data path is untouched.
- Controller `createRun`: parse optional `corpusId` with the controller's existing positive-integer parser, and pass `null` when absent.
- `listTrendRunsQuery`: add `r.corpus_id, c.job_description_sha256 AS corpus_job_description_sha256` with `LEFT JOIN bias_audit_corpora c ON c.id = r.corpus_id AND c.organization_id = :organization_id`. `trendSeries.reasonsBetween` adds the two provenance reasons. Keep the title comparison as it is.
- `compose.ts`: `testedBody` branches on `args.corpus`. Every new line is VerifyWise text, so none is a customer span. The existing customer-span candidate for `jobDescriptionKey` simply does not match the new wording. The `job_description` blank field is skipped when `corpus` is set.
- `render.ts`: `tested.corpus` = `{ corpus: "#<id>, <recordCount> synthetic records", models: "m1 (700)", cellSizes: "smallest <n>, largest <m> across 14 cells", criteria: "<verdict in words>" }` or `null`. `RunEvidenceRow`/`evidenceFromRun` take the facts from the stance service.
- `stance.ejs`: inside the `what_was_tested` `<dl>`, when `tested.corpus` is set, add four `<dt data-fact="corpus|models|cell_sizes|criteria">` rows with their `<dd>`. The facts go in the PDF, and the section checker reads them from the HTML.
- `sectionChecker.ts`: with `opts.corpus`, find the `what_was_tested` section's HTML and require each `data-fact`. It stays pure.
- `stanceService.generateStance`: when `run.corpus_id` is set, load the corpus and build `CorpusStanceFacts` (role title from `JOB_DESCRIPTIONS`; `criteria` from `criteria_comparison_json`; the rest from the row). Pass it to `composeStance`, `evidenceFromRun` and the checker. Corpus stances call `checkSections(html, REQUIRED_SECTIONS, { corpus: true })`.
- Clients: `createRun` appends `corpusId` when set and omits `jobDescription` for a corpus run. `RunUpload` reads complete corpora with `useAedtCorpora`. Add de/fr/es strings.

- [ ] **Step 6: Run everything, then commit**

```bash
cd /Users/gorkemcetin/verifywise-ll144-12b/Servers
npm run test:unit -- services/biasAudit structures/NYC-Local-Law-144 utils/biasAudit.utils.test.ts controllers/__tests__/biasAudit.ctrl.test.ts routes/__tests__/biasAudit.route.test.ts
npm run build && npm run lint && npm run format-check
cd /Users/gorkemcetin/verifywise-ll144-12b/Clients
npx vitest run src/presentation/pages/BiasAudit --no-file-parallelism
npm run typecheck && npm run lint && npm run i18n:audit:strict && npm run format-check
```

```bash
cd /Users/gorkemcetin/verifywise-ll144-12b
git add Servers/services/biasAudit/ Servers/controllers/biasAudit.ctrl.ts Servers/utils/biasAudit.utils.ts Servers/utils/biasAudit.utils.test.ts Servers/templates/biasAudit/stance.ejs Clients/src/presentation/pages/BiasAudit/ Clients/src/infrastructure/api/aedtBiasAuditService.ts Clients/src/application/hooks/useAedtBiasAudit.ts Clients/src/i18n/translations.ts
git commit -m "feat(bias-audit): score a generated corpus and carry it into the stance

The customer's scored file carries candidate_id and a score or selection
and no demographics, by design. An upload marked as scored from a corpus
is joined to that corpus's manifest on candidate_id; unknown, duplicate,
blank or missing IDs are refused rather than dropped, and sex and
race/ethnicity are injected from the manifest. The run records the
corpus and takes the fixed role title as its job description; a typed
title that names a different job is refused.

A qualification tier that does not separate candidates from its
neighbour is reported as a data-quality warning on the scored run, the
first point at which scores exist.

The trend breaks where the data source changes between uploaded and
generated data, or where the fixed job description text differs between
corpora, so a line never joins runs that measured different material.

The stance's what-was-tested section names the fixed job description,
the corpus, the models that produced it, the cell sizes, the criteria
comparison outcome, the knockout answer and how candidate names were
chosen. The section checker requires the corpus facts in the rendered
HTML of a corpus stance."
```

---

### Task 11: End-to-end verification

Runs entirely in the worktree, against a **throwaway database**. Never use the dev database `verifywise`, the main checkout, or the demo. Use ports 3100 (API) and 5180 (client), and Redis db 5.

- [ ] **Step 1: Run the full unit suites and gates across both packages**

```bash
cd /Users/gorkemcetin/verifywise-ll144-12b/Servers
npm run test:unit -- services/biasAudit structures/NYC-Local-Law-144 utils/biasAudit.utils.test.ts controllers/__tests__/biasAudit.ctrl.test.ts routes/__tests__/
npm run build && npm run lint && npm run format-check
cd /Users/gorkemcetin/verifywise-ll144-12b/Clients
npx vitest run src/presentation/pages/BiasAudit src/application/hooks/__tests__/useAedtBiasAudit.test.ts --no-file-parallelism
npm run typecheck && npm run lint && npm run i18n:audit:strict && npm run format-check
```

Module independence from EvalServer and AIGateway is proven statically by `services/biasAudit/__tests__/moduleIndependence.test.ts`, which is in the first command. Nothing is moved out of the tree.

- [ ] **Step 2: Create and migrate the throwaway database**

```bash
cd /Users/gorkemcetin/verifywise-ll144-12b/Servers
export DB_NAME=verifywise_ll144_smoke
node -e "require('dotenv').config(); console.log(process.env.DB_NAME)"   # must print verifywise_ll144_smoke
createdb -h localhost -U "$(node -e "require('dotenv').config(); console.log(process.env.DB_USER)")" verifywise_ll144_smoke
npx sequelize db:migrate
```

If the check prints anything other than `verifywise_ll144_smoke`, stop. dotenv does not override a variable already set, so the exported `DB_NAME` wins over `Servers/.env`.

The module's tenant-isolation test truncates the tables it touches, so it gets a second throwaway database of its own. `tests/integration/globalSetup.js` refuses the dev database and creates a missing one:

```bash
DB_NAME=verifywise_ll144_iso npm run test:integration -- tests/integration/tenant-isolation/bias-audit.isolation.test.ts tests/integration/tenant-isolation/tenantIsolation.coverage.test.ts
```

Afterwards, drop it with `dropdb -h localhost -U <DB_USER> verifywise_ll144_iso`.

- [ ] **Step 3: Start the stack on the smoke ports**

In the same shell, with `DB_NAME` still exported, plus `PORT=3100`, `REDIS_URL=redis://localhost:6379/5` and the three `LLM_*` variables:

```bash
cd /Users/gorkemcetin/verifywise-ll144-12b/Servers
npm run build
node dist/index.js            # API on 3100 (not `npm start`, which migrates)
node dist/jobs/worker.js      # second terminal, same environment
cd /Users/gorkemcetin/verifywise-ll144-12b/Clients
VITE_APP_PORT=5180 VITE_APP_API_BASE_URL=http://localhost:3100 npm run dev
```

If `Servers/.env.example` names a CORS or frontend-URL variable, set it to `http://localhost:5180`. Create the first organization and admin through the app's own sign-up at `http://localhost:5180`. Check health with real requests: API `curl -s -o /dev/null -w '%{http_code}' http://localhost:3100/api/bias-audit/job-descriptions` (401 unauthenticated means alive), client 200.

- [ ] **Step 4: Generate a 700-record corpus against the live gateway**

700 is the floor, at 50 per cell. That is about 700 gateway calls and about USD 0.20 at the quoted rate. Create a project, answer and attest the profile with `pipeline.input_form = resume`, then generate against `commercial-ae` with no criteria supplied. Verify on the corpus row and the download:

- `status = complete` and `release_findings_json = []`. A `cell_too_small` stop here means records failed validation three times. Read their `invalid_reason` in `bias_audit_corpus_records` and fix the cause (prompt or validator). Do not lower the floor.
- `id_order_check_json` shows a fraction of at least 0.9 for both `sex` and `raceEthnicity`. Below that, the permutation is wrong and the gate caught it. Fix the permutation; do not lower the threshold.
- `models_observed_json` holds exactly one model, equal to `LLM_MODEL`.
- `manifest_json` has 700 rows, `record_count = 700`, and all 14 values in `cell_sizes_json` are 50.
- The downloaded CSV's header is exactly `candidate_id,artifact_kind,artifact`, and its SHA-256 equals `corpus_sha256`.
- Kill the worker mid-run on a second corpus, restart it, and confirm the corpus completes with 700 manifest rows and no candidate generated twice as `valid`. That is Review Focus 1, live.

- [ ] **Step 5: Walk the whole journey**

Profile → attest → generate → download → score the CSV outside the app (a script that adds a `selected` column, deliberately leaving tier 4 and tier 5 inseparable) → upload as "Scored from generated corpus" → stance. Check:

- The run's job description is "Account Executive".
- The run carries the `tier_does_not_separate` warning.
- The trend shows a provenance break against any earlier uploaded run.
- The stance names the fixed job description, the corpus, the model set, the cell sizes, the criteria outcome ("not supplied" wording), the knockout record and the name method.
- `checkSections` with `{ corpus: true }` reported nothing missing during stance generation.
- Regenerating the stance produces version 2.

- [ ] **Step 6: Tear down**

Stop the API, worker and client. `dropdb -h localhost -U <DB_USER> verifywise_ll144_smoke`. Flush only Redis db 5: `redis-cli -n 5 FLUSHDB`.

- [ ] **Step 7: Extend the README and commit**

Document in `Servers/services/biasAudit/README.md`: the generation chain, the two fixed job descriptions, the name method, the record log and resume, the release gates, the env-only gateway configuration, and the corpus → run → stance join.

```bash
cd /Users/gorkemcetin/verifywise-ll144-12b
git add Servers/services/biasAudit/README.md
git commit -m "docs(bias-audit): document generation and verify the module end to end

Records the generation chain, the two fixed job descriptions, how
candidate names carry the only group signal, the append-only record log
and resume, the release gates, the env-only gateway configuration and
the join from a scored corpus to a run and its stance.

Verified on a throwaway database: a 700-record corpus generated against
the live gateway, released with no findings, measured ID-order
fractions of <sex> and <raceEthnicity>, one observed model, 50 records
in each of the 14 cells, and a download whose hash matches the stored
corpus hash. A worker killed mid-run resumed to a full 700-row manifest.
Independence from EvalServer and AIGateway is asserted by the module
independence test."
```

Replace `<sex>` and `<raceEthnicity>` with the measured fractions.

---

## Self-review

**Spec coverage.** Two fixed job descriptions → Task 1. Allocation balanced across 14 cells, with a per-cell power floor → Task 2. Seeded ID assignment and the hard gate → Task 3. Vercel AI Gateway with deployment-level configuration and per-record model recording → Task 4. Generation, name-only group signal, append-only log, manifest separation and resumability → Task 5. Criteria comparison → Task 6. Release gates on the manifest, wired at completion → Task 7. Routes, job, resume and module rules → Task 8. The generation page → Task 9. Corpus → run (`corpus_id`, S:323), criteria outcome, model set and cell sizes in the stance (S:639-642, S:676, S:697), and the success criterion "generate, score, upload, obtain a stance" (S:855-856) → Task 10. Verification → Task 11.

**Placeholders.** None in the tasks' content. Task 1's two job-description bodies and ten tier narratives are written out in steps 3b and 4. The name lists in Task 5 are specified by source and threshold rather than written out, because they must be drawn from the cited data, not invented. The migration timestamps are generated at execution time on purpose (`Servers/CLAUDE.md:28`). Task 11's commit message carries two measured values to fill in.

**Type consistency.** `AllocationRow`, `cellKey`, `MIN_PER_CELL` and `LL144_SEX`/`LL144_RACE` are defined in Task 2 and consumed in 3, 5, 7 and 10. `IdOrderChecks`/`measureIdOrder` are defined in Task 3 and consumed in 7. `GatewaySettings`/`CompletionResult`/`GatewayNotConfiguredError` are defined in Task 4 and consumed in 5 and 8. `JobDescription`/`JobDescriptionKey`/`JOB_DESCRIPTION_KEYS` are defined in Task 1 and consumed in 5, 6, 8 and 10. `ManifestRow` and the `"valid" | "invalid"` status are defined in Task 5 and consumed in 7 and 10. `CriteriaComparison.verdict` from Task 6 feeds Task 7's `criteriaVerdict` and Task 10's `CorpusStanceFacts.criteria`. `countRuns`/`expectedRuns`/`checkIdOrder` come from plan 1 and are consumed in Task 3. Cell keys are `sex|race` everywhere.

**Review Focus coverage.** 1 → Task 5 (manifest from the full log, resume tests), Task 8 (retry, heartbeat, resume endpoint) and Task 11 (killed worker, live). 2 → Task 4 (model read from the response), Task 7 (multi-model warning) and Task 10 (model set in the stance). 3 → Task 1 (gradable criteria separate the top tiers) and Task 10 (tier-separation warning on the scored run). 4 → Task 6 (divergent verdict), Task 8 (stored on the corpus) and Task 10 (in the stance). 5 → Task 5 (partial unique index) and Task 8 (stale `running` rows freed).

**Open items carried forward.** Knockout is recorded and does not change generation (spec "adjusted" is unspecified). The names in the Native Hawaiian or Pacific Islander cell are hand-selected, because both name sources merge it with Asian. Both are in the ledger.

**One deliberate omission.** No matched-pair or redaction-probe corpus. Both are real designs from the engagements and both need a client round trip to be worth anything, which is the workbench rather than this module.
