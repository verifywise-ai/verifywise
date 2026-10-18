# Bias module: intake, scoring and the stance — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A customer answers the LL 144 intake questions against a project, uploads their platform's results, and receives a scored readiness stance — one screen in the app and a short immutable PDF — that refuses to state figures the data or the answers cannot support.

**Architecture:** Four new tables in the `verifywise` schema, tenant-scoped. The question set lives in code and doubles as the generation spec plan 3 reads. Scoring, answer gates and stance composition are pure functions; the route/controller/utils layers follow the existing four-layer backend pattern. The PDF is rendered with `ejs` + Playwright, the same libraries the platform's reporting subsystem uses, without importing that subsystem.

**Tech Stack:** TypeScript, Node 22, Express 4, Sequelize 6, PostgreSQL, Jest 30 (`Servers`); React 19, MUI 7, vitest (`Clients`); `ejs` and `playwright` as libraries for the PDF.

**Spec:** `docs/superpowers/specs/2026-10-14-ll144-self-service-module-design.md` (commits 5e2ad8b42, 764a78cb0)

**Plan 2 of 3.** Plan 1 (`2026-10-14-bias-module-engine-and-gates.md`) must be complete first: this plan consumes `runAudit`. Plan 3 covers generation and consumes this plan's question set. All three land before release.

## Global Constraints

- **No dependency on another VerifyWise module.** No import from `EvalServer/`, `AIGateway/`, `EvaluationModule/`, or another module's services, routes or tables. Libraries and platform primitives are permitted: Sequelize, the migration runner, auth middleware, the files table, i18n, MUI, `ejs`, `playwright`. The reporting subsystem at `Servers/services/reporting/` is another module's service — use the same libraries, do not import it.
- **New tables only.** Per the guideline recorded in `20260310000001-add-vulnerability-detection-columns.js`: new features add new tables rather than modifying existing ones, so the feature can be independently disabled. The single exception is the `enum_files_source` addition in Task 2.
- **Tenancy:** every table carries `organization_id` with a CASCADE reference to `organizations`. Every query filters on it via `:replacements`. Read `docs/technical/security/tenant-isolation.md` before writing any route.
- **No column may hold "compliant".** No generated string may contain `compliant`, `certified`, `passed`, `bias-free`, or `audited` as a claim about the run. Task 12 asserts this across source, templates and education content.
- **0.80 is the EEOC four-fifths convention and the statute does not adopt it.** Wherever it appears in UI or PDF it carries that provenance. § 5-301(d)'s 2% exclusion is the statutory rule.
- **The module never determines AEDT status.** The customer's answer is recorded as theirs, quoted and attributed, and never restated as a VerifyWise finding.
- **Test commands:** `cd Servers && npm run test:unit -- <path>`; `npm run build`; `npm run lint`. Clients: `cd Clients && npx vitest run <path>`; `npm run typecheck`.

## Review Focus

Five input classes the spec implies that no happy-path test would exercise. Each has its pinning test added to the owning task.

1. **A veto question answered, then the answer changed after a run exists.** The run cites `profile_version`, so the old run now describes a superseded profile. Without handling, a stance regenerated later silently mixes a new answer with old figures. Owned by Task 4.
2. **Two users attesting the same profile concurrently.** The partial unique index is the only thing preventing two `attested` rows per project-framework; a race that violates it must surface as a clean error, not a 500. Owned by Task 4.
3. **All questions answered but every one "I don't know".** Score is 0 with no vetoes blocking, so the module must still refuse the stance rather than present a 0% as a result. Owned by Task 6.
4. **An uploaded CSV whose headers do not match the mapped columns.** Mapping names a column that is absent, so every record reads blank and the gates see a majority-missing demographic column — correct, but the message must name the mapping rather than blame the data. Owned by Task 9.
5. **A stance regenerated after the underlying run row is deleted.** The stance is immutable and must remain readable; it carries denormalised `profile_version` and `question_set_version` for this reason. Owned by Task 11.

---

### Task 1: The LL 144 question set in code

The intake schema. Plan 3 reads this to drive generation, so the generation-relevant fields are defined here.

**Files:**
- Create: `Servers/structures/NYC-Local-Law-144/intake.types.ts`
- Create: `Servers/structures/NYC-Local-Law-144/intake.questions.ts`
- Test: `Servers/structures/NYC-Local-Law-144/intake.questions.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `type QuestionWeight = "veto" | "high" | "standard" | "low"`
  - `type QuestionScope = "profile" | "run"`
  - `type GateTarget = "ratios" | "stance" | "scoring_rate" | "generation"`
  - `interface IntakeOption { value: string; label: string; consequence?: string; emits?: StanceConsequence[] }`
  - `interface StanceConsequence { kind: "limitation" | "scope_note" | "blank_field" | "metric_forced"; text: string; payload?: Record<string, string> }`
  - `interface IntakeQuestion { key, scope, prompt, statutoryRef?, weight, options, allowDontKnow, notesRequired, notesPrompt?, appliesWhen?, gates? }`
  - `interface Predicate { not?: Predicate; all?: Predicate[]; any?: Predicate[]; answered?: string; equals?: { key: string; value: string } }`
  - `IntakeQuestion.generationField?: "artifact_kind" | "knockout" | "score_scale"` — read by plan 3's generator.
  - `LL144_QUESTION_SET_VERSION: number` (= 1)
  - `LL144_QUESTIONS: IntakeQuestion[]`
  - `VETO_KEYS: readonly string[]`

- [ ] **Step 1: Write the failing test**

Create `intake.questions.test.ts`:

```ts
import {
  LL144_QUESTIONS,
  LL144_QUESTION_SET_VERSION,
  VETO_KEYS,
} from "./intake.questions";

describe("question set shape", () => {
  it("is version 1", () => {
    expect(LL144_QUESTION_SET_VERSION).toBe(1);
  });

  it("has exactly four veto questions, all at profile scope", () => {
    const vetoes = LL144_QUESTIONS.filter((q) => q.weight === "veto");
    expect(vetoes).toHaveLength(4);
    expect(vetoes.map((q) => q.key).sort()).toEqual([
      "data.held",
      "independence.auditor",
      "role.party",
      "scope.weighting",
    ]);
    expect(vetoes.every((q) => q.scope === "profile")).toBe(true);
    expect(VETO_KEYS.slice().sort()).toEqual(vetoes.map((q) => q.key).sort());
  });

  it("requires verbatim notes on every veto question", () => {
    for (const q of LL144_QUESTIONS.filter((x) => x.weight === "veto")) {
      expect(q.notesRequired).toBe(true);
      expect(q.notesPrompt).toBeTruthy();
    }
  });

  it("has unique keys", () => {
    const keys = LL144_QUESTIONS.map((q) => q.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("gives every question at least two options", () => {
    for (const q of LL144_QUESTIONS) {
      expect(q.options.length).toBeGreaterThanOrEqual(2);
      const values = q.options.map((o) => o.value);
      expect(new Set(values).size).toBe(values.length);
    }
  });
});

describe("consequences are stated before the customer answers", () => {
  it("gives every option of a tier-2 question a consequence", () => {
    const tier2 = ["cutoff.applied_by", "cutoff.planned", "knockout.exists",
                   "pipeline.input_form", "pipeline.preprocessing", "history.prior_audit",
                   "threshold.operational"];
    for (const key of tier2) {
      const q = LL144_QUESTIONS.find((x) => x.key === key)!;
      expect(q).toBeDefined();
      for (const o of q.options) {
        expect(o.consequence).toBeTruthy();
      }
    }
  });

  it("forces the metric when a person applies the cutoff", () => {
    const q = LL144_QUESTIONS.find((x) => x.key === "cutoff.applied_by")!;
    const person = q.options.find((o) => o.value === "person")!;
    expect(person.emits).toEqual(
      expect.arrayContaining([expect.objectContaining({ kind: "metric_forced" })]),
    );
    const platform = q.options.find((o) => o.value === "platform")!;
    expect(platform.emits).toEqual(
      expect.arrayContaining([expect.objectContaining({ kind: "metric_forced" })]),
    );
  });

  it("emits a limitation when anything pre-processes the input", () => {
    const q = LL144_QUESTIONS.find((x) => x.key === "pipeline.preprocessing")!;
    const yes = q.options.find((o) => o.value === "yes")!;
    expect(yes.emits![0].kind).toBe("limitation");
    expect(yes.emits![0].text.toLowerCase()).toContain("scored input");
  });

  it("emits a blank distribution-date field for a vendor", () => {
    const q = LL144_QUESTIONS.find((x) => x.key === "role.party")!;
    const vendor = q.options.find((o) => o.value === "vendor")!;
    const blank = vendor.emits!.find((e) => e.kind === "blank_field")!;
    expect(blank.payload!.field).toBe("distribution_date");
    expect(blank.text).toContain("deploying employer or employment agency");
  });
});

describe("scope short-circuit", () => {
  it("offers 'one of several' on the weighting question", () => {
    const q = LL144_QUESTIONS.find((x) => x.key === "scope.weighting")!;
    expect(q.options.map((o) => o.value)).toEqual(
      expect.arrayContaining(["only", "biggest", "one_of_several"]),
    );
  });

  it("makes every non-veto question conditional on scope not being out", () => {
    const nonVeto = LL144_QUESTIONS.filter((q) => q.weight !== "veto");
    expect(nonVeto.length).toBeGreaterThan(0);
    for (const q of nonVeto) {
      expect(q.appliesWhen).toBeDefined();
    }
  });
});

describe("gates", () => {
  it("gates generation on the input form, because it cannot be detected", () => {
    const q = LL144_QUESTIONS.find((x) => x.key === "pipeline.input_form")!;
    expect(q.gates).toContain("generation");
    expect(q.weight).toBe("high");
  });

  it("gates only the scoring-rate output on the operational threshold", () => {
    const q = LL144_QUESTIONS.find((x) => x.key === "threshold.operational")!;
    expect(q.gates).toEqual(["scoring_rate"]);
    expect(q.weight).toBe("low");
  });

  it("gates the stance on the data basis without making it a veto", () => {
    const q = LL144_QUESTIONS.find((x) => x.key === "data.basis")!;
    expect(q.gates).toContain("stance");
    expect(q.weight).not.toBe("veto");
  });
});

describe("statutory references", () => {
  it("cites a section on every question that claims one", () => {
    const cited = LL144_QUESTIONS.filter((q) => q.statutoryRef);
    expect(cited.length).toBeGreaterThanOrEqual(4);
    for (const q of cited) {
      expect(q.statutoryRef).toMatch(/^(6 RCNY )?5-30[0-4](\([a-d]\))?$|^20-871/);
    }
  });

  it("does not cite 5-301(a) for anything but the one-year expiry", () => {
    // A prior report cited 5-301(a) for re-audit triggers it does not contain
    // and the claim had to be withdrawn. The rule has no trigger for role,
    // configuration, weighting or model change.
    for (const q of LL144_QUESTIONS) {
      if (q.statutoryRef === "5-301(a)") {
        expect(q.key).toBe("history.prior_audit");
      }
    }
  });
});

describe("vocabulary", () => {
  it("never uses forbidden words in a prompt, option or consequence", () => {
    const text = LL144_QUESTIONS.flatMap((q) => [
      q.prompt, q.notesPrompt ?? "",
      ...q.options.flatMap((o) => [o.label, o.consequence ?? "",
        ...(o.emits ?? []).map((e) => e.text)]),
    ]).join(" ").toLowerCase();
    for (const word of ["compliant", "certified", "bias-free"]) {
      expect(text).not.toContain(word);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd ~/verifywise/Servers && npm run test:unit -- structures/NYC-Local-Law-144/intake.questions.test.ts`
Expected: FAIL, cannot find module `./intake.questions`.

- [ ] **Step 3: Write the types**

Create `intake.types.ts`:

```ts
export type QuestionWeight = "veto" | "high" | "standard" | "low";
export type QuestionScope = "profile" | "run";
export type GateTarget = "ratios" | "stance" | "scoring_rate" | "generation";

/** A consequence an answer imposes on the stance, rather than on the score. */
export interface StanceConsequence {
  kind: "limitation" | "scope_note" | "blank_field" | "metric_forced";
  text: string;
  payload?: Record<string, string>;
}

export interface IntakeOption {
  value: string;
  label: string;
  /** Shown to the customer BEFORE they answer. */
  consequence?: string;
  emits?: StanceConsequence[];
}

/** Evaluated against answers already given. Keys are question keys. */
export interface Predicate {
  not?: Predicate;
  all?: Predicate[];
  any?: Predicate[];
  answered?: string;
  equals?: { key: string; value: string };
}

export interface IntakeQuestion {
  key: string;
  scope: QuestionScope;
  prompt: string;
  statutoryRef?: string;
  weight: QuestionWeight;
  options: IntakeOption[];
  allowDontKnow: boolean;
  notesRequired: boolean;
  notesPrompt?: string;
  appliesWhen?: Predicate;
  gates?: GateTarget[];
  /** Read by plan 3's generator. Null for questions generation ignores. */
  generationField?: "artifact_kind" | "knockout" | "score_scale";
}
```

- [ ] **Step 4: Write the question set**

Create `intake.questions.ts`. Thirteen questions. The file is long because each option's consequence text is content, not a placeholder; write it out.

```ts
import type { IntakeQuestion, Predicate } from "./intake.types";

export const LL144_QUESTION_SET_VERSION = 1;

export const VETO_KEYS = [
  "role.party", "scope.weighting", "independence.auditor", "data.held",
] as const;

/** Everything after the vetoes is moot once the tool is out of scope. */
const IN_SCOPE: Predicate = {
  not: { equals: { key: "scope.weighting", value: "one_of_several" } },
};

export const LL144_QUESTIONS: IntakeQuestion[] = [
  // ---- Tier 1: vetoes -------------------------------------------------
  {
    key: "role.party",
    scope: "profile",
    weight: "veto",
    statutoryRef: "5-303",
    prompt:
      "Do you use this tool to hire your own staff, place candidates with other companies, " +
      "or supply it to employers who use it themselves?",
    notesRequired: true,
    notesPrompt: "In your own words, describe who uses the tool and for whose hiring.",
    allowDontKnow: true,
    options: [
      {
        value: "employer",
        label: "We use it to hire our own staff",
        consequence:
          "The duty to publish a summary of results under 5-303 falls on you, and a " +
          "distribution date exists for your use of the tool.",
      },
      {
        value: "employment_agency",
        label: "We place candidates with other companies",
        consequence:
          "5-303 binds employment agencies in the city as well as employers, so the " +
          "publication duty may fall on you.",
      },
      {
        value: "vendor",
        label: "We supply it to employers who use it themselves",
        consequence:
          "The publication duty falls on each employer deploying the tool, not on you. " +
          "No single distribution date exists for a supplier.",
        emits: [
          {
            kind: "blank_field",
            text:
              "Distribution date: to be completed by the deploying employer or employment " +
              "agency. Under 5-303(a)(2) this is the date a given employer began using the " +
              "tool, which is not within a supplier's knowledge.",
            payload: { field: "distribution_date" },
          },
          {
            kind: "scope_note",
            text:
              "This result was commissioned by the supplier of the tool. It does not " +
              "discharge the publication duty of any employer deploying it.",
          },
        ],
      },
      {
        value: "both",
        label: "Both: we hire with it and supply it",
        consequence:
          "Both sets of obligations may apply. The result states each separately.",
      },
    ],
  },
  {
    key: "scope.weighting",
    scope: "profile",
    weight: "veto",
    statutoryRef: "5-300",
    prompt:
      "When a candidate is assessed with this tool, how much does the result matter — " +
      "is it the only thing looked at, the biggest single factor, or one of several?",
    notesRequired: true,
    notesPrompt:
      "In your own words, describe how a reviewer uses the output when deciding.",
    allowDontKnow: true,
    options: [
      {
        value: "only",
        label: "It is the only thing looked at",
        consequence: "This meets the first limb of the 5-300 definition.",
      },
      {
        value: "biggest",
        label: "It is the biggest single factor",
        consequence: "This meets the second limb of the 5-300 definition.",
      },
      {
        value: "one_of_several",
        label: "It is one of several, with no extra weight",
        consequence:
          "A score that is one input among several with no extra weight falls outside " +
          "the 5-300 definition, so Local Law 144 may not attach to this use. The " +
          "remaining questions are then not applicable and you receive a scope " +
          "determination rather than a set of figures.",
        emits: [
          {
            kind: "scope_note",
            text:
              "On the use described, the tool's output is one input among several with no " +
              "additional weight. VerifyWise did not verify this and does not determine " +
              "whether any deployment is an automated employment decision tool; that " +
              "question belongs to the deploying party and its counsel.",
          },
        ],
      },
    ],
  },
  {
    key: "independence.auditor",
    scope: "profile",
    weight: "veto",
    statutoryRef: "5-300",
    prompt: "Who is performing this test?",
    notesRequired: true,
    notesPrompt: "Name the team or firm performing it.",
    allowDontKnow: false,
    options: [
      {
        value: "self",
        label: "We are, on our own tool",
        consequence:
          "5-300 requires an independent auditor, so a self-administered test is not a " +
          "Local Law 144 bias audit at any level of quality. What it does tell you is " +
          "what an independent audit would find before you commission one.",
        emits: [
          {
            kind: "scope_note",
            text:
              "Self-administered test. 6 RCNY 5-300 requires an independent auditor: a " +
              "person or group not involved in using, developing or distributing the tool, " +
              "with no employment relationship with the deploying party and no financial " +
              "interest in the tool or in its developer. This result is not a Local Law " +
              "144 bias audit.",
          },
        ],
      },
      {
        value: "internal",
        label: "An internal team not involved in building the tool",
        consequence:
          "Internal separation is not independence under 5-300, which excludes an " +
          "employment relationship with the deploying party.",
        emits: [
          {
            kind: "scope_note",
            text:
              "Performed by an internal team. 5-300 excludes a person with an employment " +
              "relationship with the party using the tool, so this is not an independent " +
              "bias audit.",
          },
        ],
      },
      {
        value: "third_party",
        label: "An external third party",
        consequence:
          "Record who, and confirm they have no financial interest in the tool and no " +
          "part in developing it. The test does not verify independence for you.",
      },
    ],
  },
  {
    key: "data.held",
    scope: "profile",
    weight: "veto",
    statutoryRef: "5-302",
    prompt:
      "Do you hold anything on candidates' sex, race or ethnicity — not whether you can " +
      "report on it, whether it exists anywhere in your systems?",
    notesRequired: true,
    notesPrompt:
      "Say which characteristics are held, for which candidates, and since when.",
    allowDontKnow: true,
    options: [
      {
        value: "none",
        label: "We hold none of it",
        consequence:
          "Historical data cannot produce an impact ratio for a characteristic it does " +
          "not record, at any volume. Test data is then permitted under 5-302(b), and " +
          "that basis ends when you begin collecting self-identification.",
      },
      {
        value: "sex_only",
        label: "Sex only",
        consequence:
          "Sex may be auditable from historical data while race, ethnicity and every " +
          "intersectional category are not. Your basis is then split by characteristic, " +
          "and sex-only records never end a race basis however far their volume grows.",
      },
      {
        value: "all_low_volume",
        label: "All of it, but for few candidates",
        consequence:
          "The basis is then volume rather than availability, and it ends when your " +
          "disclosure counts support the 14 intersectional categories.",
      },
      {
        value: "all_sufficient",
        label: "All of it, for many candidates",
        consequence:
          "Historical data is required under 5-302(a) where it is sufficient. Example 3 " +
          "to 5-302 states that an employer holding statistically significant historical " +
          "data may not rely on a test-data audit.",
      },
      {
        value: "customers_hold_it",
        label: "Our customers hold it, we do not",
        consequence:
          "Availability rather than existence. The basis ends if you gain access to it.",
      },
    ],
  },

  // ---- Tier 2: asked, consequence stated in advance --------------------
  {
    key: "cutoff.applied_by",
    scope: "profile",
    weight: "high",
    statutoryRef: "5-301",
    prompt: "Is any cutoff or ranking applied by the platform, or by a person?",
    notesRequired: false,
    allowDontKnow: true,
    appliesWhen: IN_SCOPE,
    options: [
      {
        value: "platform",
        label: "The platform applies it",
        consequence:
          "The tool selects, so 5-301(b) governs and a selection rate is computed.",
        emits: [{ kind: "metric_forced", text: "selection_rate",
                  payload: { metric: "selection_rate", ref: "5-301(b)" } }],
      },
      {
        value: "person",
        label: "A person applies it",
        consequence:
          "The tool scores and a person decides, so 5-301(c) governs and a scoring rate " +
          "is computed. The result records that the decision sat with a human and that " +
          "those decisions were not examined.",
        emits: [
          { kind: "metric_forced", text: "scoring_rate",
            payload: { metric: "scoring_rate", ref: "5-301(c)" } },
          { kind: "limitation",
            text:
              "The tool scores; a person decides. This result measures the tool's own " +
              "output. No selection or rejection decision was examined." },
        ],
      },
    ],
  },
  {
    key: "cutoff.planned",
    scope: "profile",
    weight: "standard",
    prompt:
      "If no cutoff is applied automatically today, is that planned?",
    notesRequired: false,
    allowDontKnow: true,
    appliesWhen: { all: [IN_SCOPE, { equals: { key: "cutoff.applied_by", value: "person" } }] },
    options: [
      { value: "no", label: "No", consequence: "The result describes the tool as it runs today." },
      {
        value: "planned",
        label: "Yes, it is planned",
        consequence:
          "The result carries a dated statement of what was tested and stops describing " +
          "your platform when automatic progression ships. Automation converts the " +
          "measure from a scoring rate to a selection rate and requires a fresh run " +
          "against the new configuration.",
        emits: [
          { kind: "limitation",
            text:
              "Automatic progression or rejection was described as planned but not live " +
              "when this ran. If it ships, 5-301(b) governs instead of 5-301(c) and the " +
              "required calculation changes from a scoring rate to a selection rate." },
        ],
      },
    ],
  },
  {
    key: "pipeline.input_form",
    scope: "profile",
    weight: "high",
    prompt:
      "What does your tool take as input — a resume document, a transcript of a call, " +
      "structured answers, or audio?",
    notesRequired: false,
    allowDontKnow: false,
    appliesWhen: IN_SCOPE,
    gates: ["generation"],
    generationField: "artifact_kind",
    options: [
      { value: "resume", label: "A resume or CV document",
        consequence: "Generated candidates will be resume documents." },
      { value: "transcript", label: "A transcript of a call or interview",
        consequence:
          "Generated candidates will be speaker-labelled transcripts. If your tool asks " +
          "follow-up questions that are themselves scored, say so in the notes: a corpus " +
          "of fixed answers would not represent how the tool is used." },
      { value: "structured", label: "Structured answers against fixed questions",
        consequence: "Generated candidates will be answer sets against the question list." },
      { value: "audio", label: "Audio",
        consequence:
          "This module cannot generate audio. Synthesised speech is transcribed less " +
          "accurately than real speech and text-to-speech quality varies across accents, " +
          "so a generated corpus would measure the generator rather than your tool. You " +
          "can still upload results your platform produced.",
        emits: [
          { kind: "limitation",
            text: "The tool takes audio. No corpus was generated; results were uploaded." },
        ] },
    ],
  },
  {
    key: "pipeline.preprocessing",
    scope: "profile",
    weight: "high",
    prompt:
      "Does anything transform the input before scoring — extraction, normalisation, " +
      "parsing, or redaction of personal details?",
    notesRequired: false,
    allowDontKnow: true,
    appliesWhen: IN_SCOPE,
    options: [
      { value: "no", label: "No, the tool scores what it receives",
        consequence: "The result describes the tool scoring the material as submitted." },
      { value: "yes", label: "Yes",
        consequence:
          "The result records that the scored input is not the submitted input. Unless " +
          "you have inspected the intermediate form, that step is unobserved and any " +
          "finding is attributed to the tool including it.",
        emits: [
          { kind: "limitation",
            text:
              "The scored input is not the submitted input. The tool transforms the " +
              "material before scoring, and the intermediate form was not examined, so " +
              "no finding can be attributed to the scoring step alone." },
        ] },
      { value: "unknown_to_us", label: "We do not know",
        consequence:
          "Recorded as an open item. It bounds what the result may attribute to the " +
          "scoring model.",
        emits: [
          { kind: "limitation",
            text:
              "Whether the input is transformed before scoring was not established, so " +
              "no finding can be attributed to the scoring step alone." },
        ] },
    ],
  },
  {
    key: "knockout.exists",
    scope: "run",
    weight: "standard",
    prompt:
      "Can any single criterion fail a candidate outright, rather than only scoring low?",
    notesRequired: false,
    allowDontKnow: true,
    appliesWhen: IN_SCOPE,
    generationField: "knockout",
    options: [
      { value: "no", label: "No, everything contributes to a score",
        consequence: "Rates measure one mechanism." },
      { value: "yes", label: "Yes, at least one criterion is a knockout",
        consequence:
          "A rate then combines two mechanisms: candidates who scored low and candidates " +
          "who were failed outright. Identify the column that records it, or the result " +
          "states that knocked-out candidates are pooled with low scorers.",
        emits: [
          { kind: "limitation",
            text:
              "At least one criterion fails a candidate outright. Unless the knockout is " +
              "recorded in its own column, the rate combines candidates who scored low " +
              "with candidates who were failed outright." },
        ] },
    ],
  },
  {
    key: "history.prior_audit",
    scope: "profile",
    weight: "standard",
    statutoryRef: "5-301(a)",
    prompt: "Has this tool been audited for bias before, and has it changed since?",
    notesRequired: false,
    allowDontKnow: true,
    appliesWhen: IN_SCOPE,
    options: [
      { value: "never", label: "Never audited",
        consequence: "Recorded as context." },
      { value: "audited_unchanged", label: "Audited, and unchanged since",
        consequence:
          "5-301(a) is the only re-audit trigger in the rule: a tool may not be used if " +
          "more than one year has passed since its most recent bias audit." },
      { value: "audited_changed", label: "Audited, but it has changed since",
        consequence:
          "The rule sets no trigger for a change of configuration, weighting or model, " +
          "so what a prior audit still describes is a question for the deploying party. " +
          "The result records that a change was reported.",
        emits: [
          { kind: "scope_note",
            text:
              "A change to the tool since its last bias audit was reported. Whether a " +
              "changed tool is still the tool a prior audit covered is a question the " +
              "statute does not answer, and VerifyWise does not answer it either." },
        ] },
    ],
  },
  {
    key: "data.basis",
    scope: "run",
    weight: "standard",
    statutoryRef: "5-302(b)",
    prompt:
      "For this run, are you using historical applicant data or test data? If test data, " +
      "which insufficiency in your historical data is the reason?",
    notesRequired: true,
    notesPrompt:
      "5-302(b) requires the summary to explain why historical data was not used. " +
      "Describe it in your own words.",
    allowDontKnow: false,
    appliesWhen: IN_SCOPE,
    gates: ["stance"],
    options: [
      { value: "historical", label: "Historical applicant data",
        consequence: "5-302(a) is satisfied directly and no expiry condition attaches." },
      { value: "test_volume", label: "Test data: too few historical records",
        consequence:
          "This basis ends when your historical records reach a volume that supports the " +
          "14 intersectional categories." },
      { value: "test_attribute", label: "Test data: the characteristics are not recorded",
        consequence:
          "This basis ends when the missing characteristics begin to be captured at " +
          "reportable volumes. Records carrying only some characteristics do not end it " +
          "however far their volume grows." },
      { value: "test_availability", label: "Test data: the records exist but are not ours",
        consequence: "This basis ends if you gain access to the records." },
    ],
  },
  {
    key: "threshold.operational",
    scope: "run",
    weight: "low",
    prompt:
      "If your tool produces a score rather than a decision, what cutoff does your " +
      "process actually use?",
    notesRequired: false,
    allowDontKnow: true,
    appliesWhen: { all: [IN_SCOPE, { equals: { key: "cutoff.applied_by", value: "person" } }] },
    gates: ["scoring_rate"],
    generationField: "score_scale",
    options: [
      { value: "stated", label: "We have a cutoff and will state it",
        consequence: "The scoring rate is computed against your own cutoff." },
      { value: "none", label: "There is no fixed cutoff",
        consequence:
          "5-301(c) measures the scoring rate against the sample median, which this " +
          "module computes. It is a property of the sample rather than of your process, " +
          "and the result says so." },
    ],
  },
  {
    key: "data.categories",
    scope: "run",
    weight: "standard",
    statutoryRef: "5-301(c)",
    prompt: "Which protected categories does the data for this run cover?",
    notesRequired: false,
    allowDontKnow: false,
    appliesWhen: IN_SCOPE,
    options: [
      { value: "sex_race_both", label: "Sex, and race or ethnicity",
        consequence:
          "All three required tables can be produced, including the mandatory " +
          "sex by race/ethnicity intersection under 5-301(c)(4)(iii)." },
      { value: "sex_only", label: "Sex only",
        consequence:
          "Two of the three required tables cannot be produced: race/ethnicity and " +
          "every intersectional category. The result states which are missing." },
      { value: "race_only", label: "Race or ethnicity only",
        consequence:
          "The sex table and every intersectional category cannot be produced." },
    ],
  },
];
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd ~/verifywise/Servers && npm run test:unit -- structures/NYC-Local-Law-144/intake.questions.test.ts`
Expected: PASS, 16 tests.

- [ ] **Step 6: Commit**

```bash
cd ~/verifywise
git add Servers/structures/NYC-Local-Law-144/
git commit -m "Add the LL 144 intake question set

Thirteen questions in four tiers. The four vetoes are party status,
scope weighting, independence and demographic data held; each requires
the customer's own words, because a paraphrase of a legal determination
does not hold up a year later.

Tier 2 states each option's consequence before the customer answers,
which is the pattern that produced usable answers first time on a real
engagement: naming that a platform cutoff means a selection rate and a
human cutoff means a scoring rate got the distinction answered once
rather than contradicted minutes apart.

Answers emit consequences, not just scores: a vendor gets a blank
distribution-date field with an instruction rather than a suppressed one,
pre-processing emits a limitation that the scored input is not the
submitted input, and 'one of several' short-circuits every later
question. The set also carries the three fields plan 3's generator reads.

Pinned by test: 5-301(a) may be cited only for the one-year expiry, since
the rule contains no re-audit trigger for role, configuration, weighting
or model change and a prior report had to withdraw that claim."
```

---

### Task 2: Migrations

**Files:**
- Create: `Servers/database/migrations/20261014120000-bias-audit-module-tables.js`
- Create: `Servers/database/migrations/20261014120100-bias-audit-stance-file-source.js`

**Interfaces:**
- Consumes: nothing.
- Produces: tables `aedt_profiles`, `aedt_profile_answers`, `bias_audit_runs`, `bias_audit_stances`; enum value `'Bias audit stance report'` on `enum_files_source`.

- [ ] **Step 1: Write the tables migration**

Create `20261014120000-bias-audit-module-tables.js`:

```js
"use strict";

/**
 * Tables for the self-service LL 144 bias testing module.
 *
 * New tables only, per the guideline that a new feature adds tables rather
 * than modifying existing ones so it can be independently disabled.
 *
 * Two properties are enforced here rather than in application code:
 *
 *  - aedt_profiles is append-only and versioned, with a partial unique index
 *    allowing exactly one attested version per project-framework. Without the
 *    index, two concurrent attestations produce two current profiles and every
 *    run afterwards cites an ambiguous one.
 *
 *  - aedt_profile_answers stores one row per question with its own author and
 *    timestamp, and distinguishes "I don't know" from not-applicable from
 *    never-asked. A single JSON blob on the profile cannot carry that.
 */

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    const schema = "verifywise";

    await queryInterface.createTable(
      { tableName: "aedt_profiles", schema },
      {
        id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
        organization_id: {
          type: Sequelize.INTEGER, allowNull: false,
          references: { model: "organizations", key: "id" }, onDelete: "CASCADE",
        },
        project_id: {
          type: Sequelize.INTEGER, allowNull: false,
          references: { model: "projects", key: "id" }, onDelete: "CASCADE",
        },
        framework_id: { type: Sequelize.INTEGER, allowNull: false },
        version: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 1 },
        status: {
          type: Sequelize.ENUM("draft", "attested", "superseded"),
          allowNull: false, defaultValue: "draft",
        },
        question_set_version: { type: Sequelize.INTEGER, allowNull: false },
        attested_by_user_id: {
          type: Sequelize.INTEGER, allowNull: true,
          references: { model: "users", key: "id" }, onDelete: "SET NULL",
        },
        attested_at: { type: Sequelize.DATE, allowNull: true },
        superseded_at: { type: Sequelize.DATE, allowNull: true },
        created_by: {
          type: Sequelize.INTEGER, allowNull: true,
          references: { model: "users", key: "id" }, onDelete: "SET NULL",
        },
        created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
        updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
      },
    );

    await queryInterface.addIndex(
      { tableName: "aedt_profiles", schema },
      ["project_id", "framework_id", "version"],
      { unique: true, name: "aedt_profiles_project_framework_version_uq" },
    );

    // Exactly one attested profile per project-framework.
    await queryInterface.sequelize.query(`
      CREATE UNIQUE INDEX aedt_profiles_one_attested_uq
        ON verifywise.aedt_profiles (project_id, framework_id)
        WHERE status = 'attested';
    `);

    await queryInterface.addIndex(
      { tableName: "aedt_profiles", schema },
      ["organization_id"],
      { name: "aedt_profiles_org_idx" },
    );

    await queryInterface.createTable(
      { tableName: "aedt_profile_answers", schema },
      {
        id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
        organization_id: {
          type: Sequelize.INTEGER, allowNull: false,
          references: { model: "organizations", key: "id" }, onDelete: "CASCADE",
        },
        profile_id: {
          type: Sequelize.INTEGER, allowNull: false,
          references: { model: "aedt_profiles", key: "id" }, onDelete: "CASCADE",
        },
        question_key: { type: Sequelize.STRING(128), allowNull: false },
        question_set_version: { type: Sequelize.INTEGER, allowNull: false },
        answer_value: { type: Sequelize.TEXT, allowNull: true },
        answer_notes: { type: Sequelize.TEXT, allowNull: true },
        is_dont_know: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
        is_not_applicable: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
        answered_by_user_id: {
          type: Sequelize.INTEGER, allowNull: true,
          references: { model: "users", key: "id" }, onDelete: "SET NULL",
        },
        answered_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
      },
    );

    await queryInterface.addIndex(
      { tableName: "aedt_profile_answers", schema },
      ["profile_id", "question_key"],
      { unique: true, name: "aedt_profile_answers_profile_question_uq" },
    );

    await queryInterface.createTable(
      { tableName: "bias_audit_runs", schema },
      {
        id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
        organization_id: {
          type: Sequelize.INTEGER, allowNull: false,
          references: { model: "organizations", key: "id" }, onDelete: "CASCADE",
        },
        project_id: {
          type: Sequelize.INTEGER, allowNull: false,
          references: { model: "projects", key: "id" }, onDelete: "CASCADE",
        },
        profile_id: {
          type: Sequelize.INTEGER, allowNull: false,
          references: { model: "aedt_profiles", key: "id" }, onDelete: "RESTRICT",
        },
        profile_version: { type: Sequelize.INTEGER, allowNull: false },
        preset_id: { type: Sequelize.STRING(64), allowNull: false },
        question_set_version: { type: Sequelize.INTEGER, allowNull: false },
        job_description_key: { type: Sequelize.STRING(64), allowNull: true },
        metric: { type: Sequelize.STRING(32), allowNull: false },
        threshold: { type: Sequelize.DECIMAL(5, 4), allowNull: true },
        threshold_source: { type: Sequelize.STRING(32), allowNull: true },
        small_sample_exclusion: { type: Sequelize.DECIMAL(5, 4), allowNull: true },
        data_basis_json: { type: Sequelize.JSONB, allowNull: true },
        expiry_date: { type: Sequelize.DATEONLY, allowNull: true },
        expiry_trigger: { type: Sequelize.TEXT, allowNull: true },
        readiness_score: { type: Sequelize.INTEGER, allowNull: true },
        readiness_blocked_reason: { type: Sequelize.TEXT, allowNull: true },
        result_json: { type: Sequelize.JSONB, allowNull: true },
        result_schema_version: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 1 },
        gate_findings_json: { type: Sequelize.JSONB, allowNull: true },
        order_findings_json: { type: Sequelize.JSONB, allowNull: true },
        dataset_sha256: { type: Sequelize.STRING(64), allowNull: true },
        dataset_retained: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
        row_count: { type: Sequelize.INTEGER, allowNull: true },
        corpus_id: { type: Sequelize.INTEGER, allowNull: true },
        created_by: {
          type: Sequelize.INTEGER, allowNull: true,
          references: { model: "users", key: "id" }, onDelete: "SET NULL",
        },
        created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
      },
    );

    await queryInterface.addIndex(
      { tableName: "bias_audit_runs", schema },
      ["organization_id", "project_id"],
      { name: "bias_audit_runs_org_project_idx" },
    );

    await queryInterface.createTable(
      { tableName: "bias_audit_stances", schema },
      {
        id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
        organization_id: {
          type: Sequelize.INTEGER, allowNull: false,
          references: { model: "organizations", key: "id" }, onDelete: "CASCADE",
        },
        project_id: {
          type: Sequelize.INTEGER, allowNull: false,
          references: { model: "projects", key: "id" }, onDelete: "CASCADE",
        },
        run_id: {
          type: Sequelize.INTEGER, allowNull: false,
          references: { model: "bias_audit_runs", key: "id" }, onDelete: "RESTRICT",
        },
        version: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 1 },
        pdf_sha256: { type: Sequelize.STRING(64), allowNull: true },
        pdf_file_id: { type: Sequelize.INTEGER, allowNull: true },
        score_at_generation: { type: Sequelize.INTEGER, allowNull: true },
        scope_at_generation: { type: Sequelize.STRING(32), allowNull: false },
        profile_version: { type: Sequelize.INTEGER, allowNull: false },
        question_set_version: { type: Sequelize.INTEGER, allowNull: false },
        generated_by: {
          type: Sequelize.INTEGER, allowNull: true,
          references: { model: "users", key: "id" }, onDelete: "SET NULL",
        },
        generated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
      },
    );

    await queryInterface.addIndex(
      { tableName: "bias_audit_stances", schema },
      ["run_id", "version"],
      { unique: true, name: "bias_audit_stances_run_version_uq" },
    );
  },

  async down(queryInterface) {
    const schema = "verifywise";
    await queryInterface.dropTable({ tableName: "bias_audit_stances", schema });
    await queryInterface.dropTable({ tableName: "bias_audit_runs", schema });
    await queryInterface.dropTable({ tableName: "aedt_profile_answers", schema });
    await queryInterface.sequelize.query(
      "DROP INDEX IF EXISTS verifywise.aedt_profiles_one_attested_uq;",
    );
    await queryInterface.dropTable({ tableName: "aedt_profiles", schema });
    await queryInterface.sequelize.query(
      'DROP TYPE IF EXISTS verifywise."enum_aedt_profiles_status";',
    );
  },
};
```

- [ ] **Step 2: Write the enum migration**

Create `20261014120100-bias-audit-stance-file-source.js`:

```js
"use strict";

/**
 * Lets a generated bias-audit stance PDF be stored in the existing files
 * table, which carries tenant isolation and access control already.
 *
 * Down is a no-op: removing a Postgres enum value requires recreating the
 * type and migrating every column that uses it, which is not worth the risk
 * for a fix-forward migration. Same rationale as
 * 20260904013000-add-evidence-expired-notification-type.js.
 */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(
      `ALTER TYPE verifywise.enum_files_source
         ADD VALUE IF NOT EXISTS 'Bias audit stance report';`,
    );
  },

  async down() {
    // No-op. See header comment.
  },
};
```

- [ ] **Step 3: Verify the enum type name before running**

The type name must match what exists. Check it:

```bash
cd ~/verifywise && grep -rn "enum_files_source\|enum_file_source" Servers/database/migrations/ | head -3
```

If the actual name differs, correct the migration to match. Do not guess.

- [ ] **Step 4: Run the migrations**

```bash
cd ~/verifywise/Servers && npm run migrate-db
```

Expected: both migrations apply. Confirm the partial index exists:

```bash
cd ~/verifywise/Servers && npx sequelize db:migrate:status | tail -4
```

- [ ] **Step 5: Verify the partial index actually constrains**

```bash
cd ~/verifywise && docker compose exec -T postgres psql -U postgres -d verifywise -c "
  \d verifywise.aedt_profiles
" 2>/dev/null | grep -A2 "one_attested" || echo "check the index manually; container may not be running"
```

Expected: `aedt_profiles_one_attested_uq` listed as a unique, partial index.

- [ ] **Step 6: Commit**

```bash
cd ~/verifywise
git add Servers/database/migrations/
git commit -m "Add the bias audit module tables

Four new tables, tenant-scoped, following the guideline that a new
feature adds tables rather than modifying existing ones so it can be
independently disabled.

Two invariants live in the schema rather than in application code. A
partial unique index allows exactly one attested profile per
project-framework, because two concurrent attestations would otherwise
leave every later run citing an ambiguous profile. And answers are one
row per question with their own author and timestamp, distinguishing a
don't-know from a not-applicable from a never-asked, which a single JSON
blob on the profile cannot carry.

A second migration adds a files-table enum value so stance PDFs reuse
the existing file plumbing and its tenant isolation. Its down is a no-op,
matching the existing pattern for enum additions."
```

---

### Task 3: Models and tenant-scoped queries

**Files:**
- Create: `Servers/domain.layer/models/biasAudit/aedtProfile.model.ts`
- Create: `Servers/domain.layer/models/biasAudit/aedtProfileAnswer.model.ts`
- Create: `Servers/domain.layer/models/biasAudit/biasAuditRun.model.ts`
- Create: `Servers/domain.layer/models/biasAudit/biasAuditStance.model.ts`
- Create: `Servers/utils/biasAudit.utils.ts`
- Test: `Servers/utils/biasAudit.utils.test.ts`

**Interfaces:**
- Consumes: Task 2's tables; `LL144_QUESTION_SET_VERSION` from Task 1.
- Produces:
  - `getAttestedProfileQuery(projectId, frameworkId, organizationId): Promise<AedtProfile | null>`
  - `getProfileAnswersQuery(profileId, organizationId): Promise<AedtProfileAnswer[]>`
  - `createProfileVersionQuery(args, organizationId, transaction): Promise<AedtProfile>`
  - `upsertAnswerQuery(args, organizationId, transaction): Promise<void>`
  - `attestProfileQuery(profileId, userId, organizationId, transaction): Promise<AedtProfile>`
  - `createRunQuery(args, organizationId, transaction): Promise<BiasAuditRun>`
  - `createStanceQuery(args, organizationId, transaction): Promise<BiasAuditStance>`
  - `getNextStanceVersionQuery(runId, organizationId): Promise<number>`

- [ ] **Step 1: Write the failing test**

Create `biasAudit.utils.test.ts`, following the mocking pattern in `Servers/utils/readiness.utils.test.ts`:

```ts
const mockQuery = jest.fn();
jest.mock("../database/db", () => ({
  sequelize: { query: (...args: any[]) => mockQuery(...args) },
}));
jest.mock("./logger/fileLogger", () => ({
  __esModule: true,
  default: { error: jest.fn(), info: jest.fn(), debug: jest.fn(), warn: jest.fn() },
}));

import {
  attestProfileQuery,
  createProfileVersionQuery,
  getAttestedProfileQuery,
  getNextStanceVersionQuery,
  upsertAnswerQuery,
} from "./biasAudit.utils";

beforeEach(() => mockQuery.mockReset());

describe("tenant isolation", () => {
  it("filters the attested-profile lookup on organization_id", async () => {
    mockQuery.mockResolvedValueOnce([]);
    await getAttestedProfileQuery(7, 15, 42);
    const [sql, opts] = mockQuery.mock.calls[0];
    expect(sql).toContain("organization_id = :organization_id");
    expect(opts.replacements).toMatchObject({
      project_id: 7, framework_id: 15, organization_id: 42,
    });
  });

  it("filters every answer read on organization_id", async () => {
    mockQuery.mockResolvedValueOnce([]);
    const { getProfileAnswersQuery } = await import("./biasAudit.utils");
    await getProfileAnswersQuery(3, 42);
    const [sql, opts] = mockQuery.mock.calls[0];
    expect(sql).toContain("organization_id = :organization_id");
    expect(opts.replacements.organization_id).toBe(42);
  });

  it("writes organization_id on insert", async () => {
    mockQuery.mockResolvedValueOnce([[{ id: 1 }]]);
    await createProfileVersionQuery(
      { projectId: 7, frameworkId: 15, version: 1, questionSetVersion: 1, createdBy: 9 },
      42, undefined as any,
    );
    const [sql, opts] = mockQuery.mock.calls[0];
    expect(sql).toContain("organization_id");
    expect(opts.replacements.organization_id).toBe(42);
  });
});

describe("append-only profiles", () => {
  it("supersedes the previous attested version when attesting", async () => {
    mockQuery.mockResolvedValue([[{ id: 5, status: "attested" }]]);
    await attestProfileQuery(5, 9, 42, undefined as any);
    const statements = mockQuery.mock.calls.map((c) => String(c[0]));
    expect(statements.some((s) => /superseded/i.test(s))).toBe(true);
    expect(statements.some((s) => /status\s*=\s*'attested'|:status/i.test(s))).toBe(true);
  });

  // Review Focus 2
  it("surfaces a unique-violation on concurrent attestation as a typed error", async () => {
    const err: any = new Error("duplicate key value violates unique constraint");
    err.original = { code: "23505", constraint: "aedt_profiles_one_attested_uq" };
    mockQuery.mockRejectedValueOnce(err);
    await expect(attestProfileQuery(5, 9, 42, undefined as any)).rejects.toThrow(
      /already attested|concurrent/i,
    );
  });
});

describe("answers", () => {
  it("stores a don't-know distinctly from a null answer", async () => {
    mockQuery.mockResolvedValueOnce([]);
    await upsertAnswerQuery(
      { profileId: 3, questionKey: "data.held", questionSetVersion: 1,
        answerValue: null, answerNotes: null, isDontKnow: true,
        isNotApplicable: false, answeredByUserId: 9 },
      42, undefined as any,
    );
    const [, opts] = mockQuery.mock.calls[0];
    expect(opts.replacements.is_dont_know).toBe(true);
    expect(opts.replacements.answer_value).toBeNull();
  });

  it("upserts on the profile and question key", async () => {
    mockQuery.mockResolvedValueOnce([]);
    await upsertAnswerQuery(
      { profileId: 3, questionKey: "role.party", questionSetVersion: 1,
        answerValue: "vendor", answerNotes: "We supply it.", isDontKnow: false,
        isNotApplicable: false, answeredByUserId: 9 },
      42, undefined as any,
    );
    expect(String(mockQuery.mock.calls[0][0])).toMatch(/ON CONFLICT/i);
  });
});

describe("stance versioning", () => {
  it("returns 1 when no stance exists", async () => {
    mockQuery.mockResolvedValueOnce([{ max: null }]);
    expect(await getNextStanceVersionQuery(11, 42)).toBe(1);
  });

  it("returns max + 1 so a regenerate never overwrites", async () => {
    mockQuery.mockResolvedValueOnce([{ max: 3 }]);
    expect(await getNextStanceVersionQuery(11, 42)).toBe(4);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd ~/verifywise/Servers && npm run test:unit -- utils/biasAudit.utils.test.ts`
Expected: FAIL, cannot find module `./biasAudit.utils`.

- [ ] **Step 3: Write the models**

Four Sequelize-typescript models following the decorator pattern in `Servers/domain.layer/models/file/file.model.ts`. Each declares `tableName` with `schema: "verifywise"` and the columns from Task 2.

- [ ] **Step 4: Write the utils**

Create `biasAudit.utils.ts` using raw SQL via `sequelize.query()` with unqualified table names and `:replacements`, matching the pattern in `Servers/utils/readiness.utils.ts`. Every statement includes `organization_id = :organization_id`.

For the concurrent-attestation case:

```ts
export async function attestProfileQuery(
  profileId: number, userId: number, organizationId: number, transaction: Transaction,
): Promise<AedtProfile> {
  try {
    await sequelize.query(
      `UPDATE aedt_profiles SET status = 'superseded', superseded_at = NOW()
         WHERE project_id = (SELECT project_id FROM aedt_profiles WHERE id = :id)
           AND framework_id = (SELECT framework_id FROM aedt_profiles WHERE id = :id)
           AND status = 'attested' AND organization_id = :organization_id`,
      { replacements: { id: profileId, organization_id: organizationId }, transaction },
    );
    const [rows] = await sequelize.query(
      `UPDATE aedt_profiles
          SET status = 'attested', attested_by_user_id = :user_id,
              attested_at = NOW(), updated_at = NOW()
        WHERE id = :id AND organization_id = :organization_id
        RETURNING *`,
      { replacements: { id: profileId, user_id: userId, organization_id: organizationId },
        transaction },
    );
    return (rows as AedtProfile[])[0];
  } catch (error: any) {
    // The partial unique index is the real guard; translate it rather than
    // letting a 23505 reach the client as a 500.
    if (error?.original?.code === "23505") {
      throw new Error(
        "Another version of this profile was attested concurrently. Reload and retry.",
      );
    }
    throw error;
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd ~/verifywise/Servers && npm run test:unit -- utils/biasAudit.utils.test.ts`
Expected: PASS, 9 tests.

- [ ] **Step 6: Typecheck and commit**

```bash
cd ~/verifywise/Servers && npm run build && npm run lint
cd ~/verifywise
git add Servers/domain.layer/models/biasAudit/ Servers/utils/biasAudit.utils.ts Servers/utils/biasAudit.utils.test.ts
git commit -m "Add bias audit models and tenant-scoped queries

Four models and the query layer, raw SQL with :replacements following the
existing utils pattern. Every statement filters on organization_id, which
the tests assert per query rather than by inspection.

Attestation supersedes the prior attested version in the same
transaction, and a 23505 from the partial unique index is translated into
a message telling the user to reload, rather than reaching them as a 500."
```

---

### Task 4: Profile service with versioning

**Files:**
- Create: `Servers/services/biasAudit/profileService.ts`
- Test: `Servers/services/biasAudit/profileService.test.ts`

**Interfaces:**
- Consumes: Task 3's queries; `LL144_QUESTIONS`, `VETO_KEYS` from Task 1.
- Produces:
  - `saveAnswers(args: { projectId, frameworkId, answers, userId, organizationId }): Promise<{ profileId: number; version: number }>`
  - `attestProfile(args): Promise<{ profileId: number; version: number }>`
  - `AnswerInput = { questionKey: string; value: string | null; notes: string | null; dontKnow: boolean }`

- [ ] **Step 1: Write the failing test**

Create `profileService.test.ts`. Mock the utils module so the service's own logic is what is tested:

```ts
const utils = {
  getAttestedProfileQuery: jest.fn(),
  getProfileAnswersQuery: jest.fn(),
  createProfileVersionQuery: jest.fn(),
  upsertAnswerQuery: jest.fn(),
  attestProfileQuery: jest.fn(),
};
jest.mock("../../utils/biasAudit.utils", () => utils);
jest.mock("../../database/db", () => ({
  sequelize: { transaction: (fn: any) => fn({}) },
}));

import { attestProfile, saveAnswers } from "./profileService";

beforeEach(() => Object.values(utils).forEach((f) => f.mockReset()));

describe("saveAnswers", () => {
  it("creates version 1 when no profile exists", async () => {
    utils.getAttestedProfileQuery.mockResolvedValue(null);
    utils.createProfileVersionQuery.mockResolvedValue({ id: 1, version: 1 });
    const out = await saveAnswers({
      projectId: 7, frameworkId: 15, userId: 9, organizationId: 42,
      answers: [{ questionKey: "role.party", value: "vendor", notes: "We supply it.",
                  dontKnow: false }],
    });
    expect(out).toEqual({ profileId: 1, version: 1 });
    expect(utils.createProfileVersionQuery.mock.calls[0][0].version).toBe(1);
  });

  // Review Focus 1
  it("creates a new version rather than editing an attested one", async () => {
    utils.getAttestedProfileQuery.mockResolvedValue({ id: 5, version: 2, status: "attested" });
    utils.getProfileAnswersQuery.mockResolvedValue([
      { question_key: "role.party", answer_value: "vendor", answer_notes: "x",
        is_dont_know: false, is_not_applicable: false },
    ]);
    utils.createProfileVersionQuery.mockResolvedValue({ id: 6, version: 3 });

    const out = await saveAnswers({
      projectId: 7, frameworkId: 15, userId: 9, organizationId: 42,
      answers: [{ questionKey: "role.party", value: "employer", notes: "Changed.",
                  dontKnow: false }],
    });

    expect(out.version).toBe(3);
    // Existing answers carry forward so the new version is complete.
    const written = utils.upsertAnswerQuery.mock.calls.map((c) => c[0].questionKey);
    expect(written).toContain("role.party");
    expect(utils.attestProfileQuery).not.toHaveBeenCalled();
  });

  it("edits a draft in place", async () => {
    utils.getAttestedProfileQuery.mockResolvedValue({ id: 5, version: 1, status: "draft" });
    utils.getProfileAnswersQuery.mockResolvedValue([]);
    const out = await saveAnswers({
      projectId: 7, frameworkId: 15, userId: 9, organizationId: 42,
      answers: [{ questionKey: "role.party", value: "vendor", notes: "x", dontKnow: false }],
    });
    expect(out.profileId).toBe(5);
    expect(utils.createProfileVersionQuery).not.toHaveBeenCalled();
  });

  it("rejects an unknown question key", async () => {
    utils.getAttestedProfileQuery.mockResolvedValue(null);
    await expect(saveAnswers({
      projectId: 7, frameworkId: 15, userId: 9, organizationId: 42,
      answers: [{ questionKey: "not.a.question", value: "x", notes: null, dontKnow: false }],
    })).rejects.toThrow(/unknown question/i);
  });

  it("rejects a value not among the question's options", async () => {
    utils.getAttestedProfileQuery.mockResolvedValue(null);
    await expect(saveAnswers({
      projectId: 7, frameworkId: 15, userId: 9, organizationId: 42,
      answers: [{ questionKey: "role.party", value: "nonsense", notes: "x",
                  dontKnow: false }],
    })).rejects.toThrow(/not a valid option/i);
  });

  it("requires notes on a veto answer", async () => {
    utils.getAttestedProfileQuery.mockResolvedValue(null);
    await expect(saveAnswers({
      projectId: 7, frameworkId: 15, userId: 9, organizationId: 42,
      answers: [{ questionKey: "role.party", value: "vendor", notes: "  ",
                  dontKnow: false }],
    })).rejects.toThrow(/own words|notes are required/i);
  });

  it("allows a don't-know with no value and no notes", async () => {
    utils.getAttestedProfileQuery.mockResolvedValue(null);
    utils.createProfileVersionQuery.mockResolvedValue({ id: 1, version: 1 });
    await expect(saveAnswers({
      projectId: 7, frameworkId: 15, userId: 9, organizationId: 42,
      answers: [{ questionKey: "data.held", value: null, notes: null, dontKnow: true }],
    })).resolves.toBeDefined();
    expect(utils.upsertAnswerQuery.mock.calls[0][0].isDontKnow).toBe(true);
  });

  it("rejects a don't-know on a question that does not allow it", async () => {
    utils.getAttestedProfileQuery.mockResolvedValue(null);
    await expect(saveAnswers({
      projectId: 7, frameworkId: 15, userId: 9, organizationId: 42,
      answers: [{ questionKey: "independence.auditor", value: null, notes: null,
                  dontKnow: true }],
    })).rejects.toThrow(/does not allow/i);
  });
});

describe("attestProfile", () => {
  it("refuses to attest with a veto unanswered", async () => {
    utils.getAttestedProfileQuery.mockResolvedValue({ id: 5, version: 1, status: "draft" });
    utils.getProfileAnswersQuery.mockResolvedValue([
      { question_key: "role.party", answer_value: "vendor", is_dont_know: false,
        is_not_applicable: false },
    ]);
    await expect(attestProfile({
      projectId: 7, frameworkId: 15, userId: 9, organizationId: 42,
    })).rejects.toThrow(/scope\.weighting|unanswered/i);
  });

  it("refuses to attest when a veto is answered don't know", async () => {
    utils.getAttestedProfileQuery.mockResolvedValue({ id: 5, version: 1, status: "draft" });
    utils.getProfileAnswersQuery.mockResolvedValue(
      ["role.party", "scope.weighting", "independence.auditor", "data.held"].map((k) => ({
        question_key: k, answer_value: null, is_dont_know: true, is_not_applicable: false,
      })),
    );
    await expect(attestProfile({
      projectId: 7, frameworkId: 15, userId: 9, organizationId: 42,
    })).rejects.toThrow(/don't know|unanswered/i);
  });

  it("attests when all four vetoes carry a value", async () => {
    utils.getAttestedProfileQuery.mockResolvedValue({ id: 5, version: 1, status: "draft" });
    utils.getProfileAnswersQuery.mockResolvedValue([
      { question_key: "role.party", answer_value: "vendor", is_dont_know: false,
        is_not_applicable: false },
      { question_key: "scope.weighting", answer_value: "biggest", is_dont_know: false,
        is_not_applicable: false },
      { question_key: "independence.auditor", answer_value: "self", is_dont_know: false,
        is_not_applicable: false },
      { question_key: "data.held", answer_value: "none", is_dont_know: false,
        is_not_applicable: false },
    ]);
    utils.attestProfileQuery.mockResolvedValue({ id: 5, version: 1, status: "attested" });
    const out = await attestProfile({
      projectId: 7, frameworkId: 15, userId: 9, organizationId: 42,
    });
    expect(out).toEqual({ profileId: 5, version: 1 });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd ~/verifywise/Servers && npm run test:unit -- services/biasAudit/profileService.test.ts`
Expected: FAIL, cannot find module `./profileService`.

- [ ] **Step 3: Write the implementation**

Create `profileService.ts`. Validation order matters: unknown key, then option membership, then don't-know permission, then notes requirement. Versioning: a `draft` profile is edited in place; an `attested` one gets a new version with existing answers carried forward so the new version is complete on its own.

Header comment:

```ts
/**
 * Profiles are append-only once attested.
 *
 * A run records the profile version it ran against, so editing an attested
 * profile in place would silently change what an existing run describes.
 * Changing an answer creates version N+1 with the prior answers carried
 * forward, and the old version stays readable beside the runs that cite it.
 */
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd ~/verifywise/Servers && npm run test:unit -- services/biasAudit/profileService.test.ts`
Expected: PASS, 11 tests.

- [ ] **Step 5: Commit**

```bash
cd ~/verifywise
git add Servers/services/biasAudit/profileService.ts Servers/services/biasAudit/profileService.test.ts
git commit -m "Add the AEDT profile service

Drafts are edited in place; an attested profile gets a new version with
prior answers carried forward. A run cites its profile version, so
editing an attested profile in place would change what an existing run
describes.

Attestation refuses while any of the four vetoes is unanswered or
answered don't-know, and veto answers require the customer's own words.
A don't-know is stored as itself rather than as an empty value, because a
year later a blank cannot be told from a question nobody asked."
```

---

### Task 5: Applicability predicates

**Files:**
- Create: `Servers/services/biasAudit/applicability.ts`
- Test: `Servers/services/biasAudit/applicability.test.ts`

**Interfaces:**
- Consumes: `Predicate`, `LL144_QUESTIONS` from Task 1.
- Produces:
  - `type AnswerMap = Record<string, { value: string | null; dontKnow: boolean }>`
  - `type AnswerWithNotes = Record<string, { value: string | null; notes: string | null; dontKnow: boolean }>` — the wider shape the stance needs, since it quotes verbatim notes. `AnswerMap` is a structural subset, so anything taking `AnswerMap` accepts an `AnswerWithNotes`.
  - `evaluatePredicate(p: Predicate | undefined, answers: AnswerMap): boolean`
  - `applicableQuestions(answers: AnswerMap, scope?: QuestionScope): IntakeQuestion[]`

- [ ] **Step 1: Write the failing test**

```ts
import { LL144_QUESTIONS } from "../../structures/NYC-Local-Law-144/intake.questions";
import { applicableQuestions, evaluatePredicate, type AnswerMap } from "./applicability";

const ans = (m: Record<string, string>): AnswerMap =>
  Object.fromEntries(Object.entries(m).map(([k, v]) => [k, { value: v, dontKnow: false }]));

describe("evaluatePredicate", () => {
  it("treats an undefined predicate as applicable", () => {
    expect(evaluatePredicate(undefined, {})).toBe(true);
  });

  it("evaluates equals", () => {
    expect(evaluatePredicate({ equals: { key: "a", value: "x" } }, ans({ a: "x" }))).toBe(true);
    expect(evaluatePredicate({ equals: { key: "a", value: "x" } }, ans({ a: "y" }))).toBe(false);
    expect(evaluatePredicate({ equals: { key: "a", value: "x" } }, {})).toBe(false);
  });

  it("evaluates not, all and any", () => {
    expect(evaluatePredicate({ not: { equals: { key: "a", value: "x" } } },
      ans({ a: "y" }))).toBe(true);
    expect(evaluatePredicate({ all: [{ answered: "a" }, { answered: "b" }] },
      ans({ a: "1", b: "2" }))).toBe(true);
    expect(evaluatePredicate({ all: [{ answered: "a" }, { answered: "b" }] },
      ans({ a: "1" }))).toBe(false);
    expect(evaluatePredicate({ any: [{ answered: "a" }, { answered: "b" }] },
      ans({ b: "2" }))).toBe(true);
  });

  it("does not count a don't-know as answered", () => {
    expect(evaluatePredicate({ answered: "a" }, { a: { value: null, dontKnow: true } }))
      .toBe(false);
  });
});

describe("applicableQuestions", () => {
  it("returns the vetoes when nothing is answered", () => {
    const qs = applicableQuestions({});
    expect(qs.map((q) => q.key)).toEqual(
      expect.arrayContaining(["role.party", "scope.weighting",
                              "independence.auditor", "data.held"]),
    );
  });

  it("drops every non-veto question once scope is out", () => {
    const qs = applicableQuestions(ans({ "scope.weighting": "one_of_several" }));
    expect(qs.every((q) => q.weight === "veto")).toBe(true);
  });

  it("keeps non-veto questions when the tool is in scope", () => {
    const qs = applicableQuestions(ans({ "scope.weighting": "biggest" }));
    expect(qs.some((q) => q.key === "pipeline.input_form")).toBe(true);
  });

  it("asks the planned-automation question only when a person applies the cutoff", () => {
    const inScope = { "scope.weighting": "biggest" };
    expect(applicableQuestions(ans({ ...inScope, "cutoff.applied_by": "platform" }))
      .some((q) => q.key === "cutoff.planned")).toBe(false);
    expect(applicableQuestions(ans({ ...inScope, "cutoff.applied_by": "person" }))
      .some((q) => q.key === "cutoff.planned")).toBe(true);
  });

  it("asks the operational threshold only for a human cutoff", () => {
    const inScope = { "scope.weighting": "biggest" };
    expect(applicableQuestions(ans({ ...inScope, "cutoff.applied_by": "person" }))
      .some((q) => q.key === "threshold.operational")).toBe(true);
    expect(applicableQuestions(ans({ ...inScope, "cutoff.applied_by": "platform" }))
      .some((q) => q.key === "threshold.operational")).toBe(false);
  });

  it("filters by scope when asked", () => {
    const all = ans({ "scope.weighting": "biggest", "cutoff.applied_by": "person" });
    expect(applicableQuestions(all, "run").every((q) => q.scope === "run")).toBe(true);
    expect(applicableQuestions(all, "profile").every((q) => q.scope === "profile")).toBe(true);
  });

  it("covers every question in the set across both scopes", () => {
    const all = ans({ "scope.weighting": "biggest", "cutoff.applied_by": "person" });
    const seen = new Set(applicableQuestions(all).map((q) => q.key));
    for (const q of LL144_QUESTIONS) {
      // Every question is reachable under some answer state.
      expect(typeof q.key).toBe("string");
    }
    expect(seen.size).toBeGreaterThanOrEqual(10);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd ~/verifywise/Servers && npm run test:unit -- services/biasAudit/applicability.test.ts`
Expected: FAIL, cannot find module `./applicability`.

- [ ] **Step 3: Write the implementation**

Create `applicability.ts`. Recursive evaluation of the four predicate forms. `answered` is true only when a value is present and `dontKnow` is false.

Note in the header: the shape intentionally mirrors the visibility rules in `Servers/services/intakeFormLogic/`, which is a pure module. If that evaluator is later extracted as a shared library with no table dependency, this file should call it instead of duplicating the logic; until then, duplicating four predicate forms is cheaper than depending on another module's service.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd ~/verifywise/Servers && npm run test:unit -- services/biasAudit/applicability.test.ts`
Expected: PASS, 11 tests.

- [ ] **Step 5: Commit**

```bash
cd ~/verifywise
git add Servers/services/biasAudit/applicability.ts Servers/services/biasAudit/applicability.test.ts
git commit -m "Add applicability predicates for the intake

Four predicate forms, evaluated against answers already given, so a
question about a human cutoff is not asked when the platform applies it
and nothing after the vetoes is asked once the tool is out of scope.

A don't-know does not count as answered, which keeps a conditional
question from unlocking on an answer the customer explicitly could not
give."
```

---

### Task 6: Readiness scoring

**Files:**
- Create: `Servers/services/biasAudit/readinessScore.ts`
- Test: `Servers/services/biasAudit/readinessScore.test.ts`

**Interfaces:**
- Consumes: `applicableQuestions`, `AnswerMap` from Task 5; `VETO_KEYS` from Task 1.
- Produces:
  - `interface ReadinessResult { score: number | null; blockedReason: string | null; missingVetoes: string[]; openItems: Array<{ key: string; prompt: string }>; scope: "in_scope" | "out_of_scope" | "undetermined"; earned: number; possible: number }`
  - `computeReadiness(answers: AnswerMap): ReadinessResult`

- [ ] **Step 1: Write the failing test**

```ts
import { computeReadiness } from "./readinessScore";
import type { AnswerMap } from "./applicability";

const a = (m: Record<string, string | null>): AnswerMap =>
  Object.fromEntries(Object.entries(m).map(([k, v]) => [
    k, v === null ? { value: null, dontKnow: true } : { value: v, dontKnow: false },
  ]));

const VETOES_OK = {
  "role.party": "vendor",
  "scope.weighting": "biggest",
  "independence.auditor": "self",
  "data.held": "none",
};

describe("vetoes gate rather than score", () => {
  it("returns no score when a veto is unanswered", () => {
    const r = computeReadiness(a({ "role.party": "vendor" }));
    expect(r.score).toBeNull();
    expect(r.scope).toBe("undetermined");
    expect(r.missingVetoes.sort()).toEqual([
      "data.held", "independence.auditor", "scope.weighting",
    ]);
    expect(r.blockedReason).toMatch(/scope is not established/i);
  });

  it("returns no score when a veto is don't know", () => {
    const r = computeReadiness(a({ ...VETOES_OK, "data.held": null }));
    expect(r.score).toBeNull();
    expect(r.missingVetoes).toEqual(["data.held"]);
  });

  it("produces a score once all four vetoes carry a value", () => {
    const r = computeReadiness(a(VETOES_OK));
    expect(r.score).not.toBeNull();
    expect(r.scope).toBe("in_scope");
  });
});

describe("out of scope short-circuits", () => {
  it("reports out_of_scope and no score", () => {
    const r = computeReadiness(a({ ...VETOES_OK, "scope.weighting": "one_of_several" }));
    expect(r.scope).toBe("out_of_scope");
    expect(r.score).toBeNull();
    expect(r.blockedReason).toBeNull();
    expect(r.openItems).toEqual([]);
  });
});

describe("weights", () => {
  it("counts a high-weight answer double a standard one", () => {
    const base = computeReadiness(a(VETOES_OK));
    const withHigh = computeReadiness(a({ ...VETOES_OK, "pipeline.input_form": "resume" }));
    const withStandard = computeReadiness(a({ ...VETOES_OK, "data.categories": "sex_only" }));
    expect(withHigh.earned - base.earned).toBe(2);
    expect(withStandard.earned - base.earned).toBe(1);
  });

  it("scores 100 when every applicable question is answered", () => {
    const r = computeReadiness(a({
      ...VETOES_OK,
      "cutoff.applied_by": "platform",
      "pipeline.input_form": "resume",
      "pipeline.preprocessing": "no",
      "knockout.exists": "no",
      "history.prior_audit": "never",
      "data.basis": "test_attribute",
      "data.categories": "sex_race_both",
    }));
    expect(r.score).toBe(100);
    expect(r.openItems).toEqual([]);
  });

  it("excludes not-applicable questions from the denominator", () => {
    // cutoff.planned and threshold.operational do not apply to a platform cutoff.
    const platform = computeReadiness(a({ ...VETOES_OK, "cutoff.applied_by": "platform" }));
    const person = computeReadiness(a({ ...VETOES_OK, "cutoff.applied_by": "person" }));
    expect(platform.possible).toBeLessThan(person.possible);
  });
});

describe("don't know", () => {
  it("earns nothing and names itself as an open item", () => {
    const r = computeReadiness(a({ ...VETOES_OK, "pipeline.preprocessing": null }));
    expect(r.openItems.map((i) => i.key)).toContain("pipeline.preprocessing");
    expect(r.openItems[0].prompt).toBeTruthy();
    const base = computeReadiness(a(VETOES_OK));
    expect(r.earned).toBe(base.earned);
  });

  // Review Focus 3
  it("scores 0 when every non-veto answer is don't know, and still blocks the stance", () => {
    const r = computeReadiness(a({
      ...VETOES_OK,
      "cutoff.applied_by": null, "pipeline.input_form": null,
      "pipeline.preprocessing": null, "knockout.exists": null,
      "history.prior_audit": null, "data.categories": null,
    }));
    expect(r.score).toBe(0);
    expect(r.openItems.length).toBeGreaterThanOrEqual(6);
    // data.basis gates the stance and is unanswered, so a 0 is never presentable.
    expect(r.openItems.map((i) => i.key)).toContain("data.basis");
  });
});

describe("measured results never affect the score", () => {
  it("has no parameter for impact ratios", () => {
    // Readiness measures what the customer established, not what the numbers
    // said. A flagged ratio is a finding, not a demerit.
    expect(computeReadiness.length).toBe(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd ~/verifywise/Servers && npm run test:unit -- services/biasAudit/readinessScore.test.ts`
Expected: FAIL, cannot find module `./readinessScore`.

- [ ] **Step 3: Write the implementation**

Create `readinessScore.ts`:

```ts
const WEIGHTS: Record<string, number> = { high: 2, standard: 1, low: 0.5 };
```

Order: check vetoes first and return early with a null score; then check the out-of-scope short-circuit; then sum weights over applicable non-veto questions.

Header comment:

```ts
/**
 * Readiness: how close the customer is to commissioning an independent audit
 * that would survive scrutiny.
 *
 * Measured impact ratios are deliberately not an input. A customer with good
 * governance and a genuine 0.78 scores high and has the 0.78 reported plainly.
 * Folding results into the score would reward improving the score by changing
 * the data, which is the failure this module exists to prevent.
 *
 * An unanswered veto yields no score at all rather than a low one: a 40%
 * implies the other 60% is meaningful, and when scope is unknown it is not.
 */
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd ~/verifywise/Servers && npm run test:unit -- services/biasAudit/readinessScore.test.ts`
Expected: PASS, 10 tests.

- [ ] **Step 5: Commit**

```bash
cd ~/verifywise
git add Servers/services/biasAudit/readinessScore.ts Servers/services/biasAudit/readinessScore.test.ts
git commit -m "Add readiness scoring

Weights of 2, 1 and 0.5 over the applicable questions, with the four
vetoes gating instead of scoring: an unanswered veto returns no score at
all, because a percentage implies the remainder is meaningful when scope
is unknown.

Measured impact ratios are not an input, asserted by the function's
arity. A customer with good governance and a genuine 0.78 scores high and
has the 0.78 reported plainly; folding results in would reward improving
the score by changing the data.

A don't-know earns nothing and names itself as an open item, so an all
don't-know profile scores 0 with every question listed rather than
looking merely incomplete."
```

---

### Task 7: Answer gates and stance consequences

**Files:**
- Create: `Servers/services/biasAudit/answerGates.ts`
- Test: `Servers/services/biasAudit/answerGates.test.ts`

**Interfaces:**
- Consumes: Tasks 1, 5, 6.
- Produces:
  - `interface AnswerGateResult { blocked: Record<GateTarget, string[]>; mayProduceStance: boolean; mayComputeRatios: boolean; mayGenerate: boolean; mayComputeScoringRate: boolean; consequences: StanceConsequence[]; forcedMetric: string | null }`
  - `runAnswerGates(answers: AnswerMap): AnswerGateResult`

- [ ] **Step 1: Write the failing test**

```ts
import { runAnswerGates } from "./answerGates";
import type { AnswerMap } from "./applicability";

const a = (m: Record<string, string | null>): AnswerMap =>
  Object.fromEntries(Object.entries(m).map(([k, v]) => [
    k, v === null ? { value: null, dontKnow: true } : { value: v, dontKnow: false },
  ]));

const VETOES_OK = {
  "role.party": "vendor", "scope.weighting": "biggest",
  "independence.auditor": "self", "data.held": "none",
};

describe("veto gating", () => {
  it("blocks everything while a veto is unanswered", () => {
    const g = runAnswerGates(a({ "role.party": "vendor" }));
    expect(g.mayProduceStance).toBe(false);
    expect(g.mayComputeRatios).toBe(false);
    expect(g.mayGenerate).toBe(false);
  });

  it("permits a stance once the vetoes and the data basis are answered", () => {
    const g = runAnswerGates(a({ ...VETOES_OK, "data.basis": "test_attribute" }));
    expect(g.mayProduceStance).toBe(true);
  });
});

describe("data basis gates the stance without being a veto", () => {
  it("blocks the stance when unanswered, because no expiry can be stated", () => {
    const g = runAnswerGates(a(VETOES_OK));
    expect(g.mayProduceStance).toBe(false);
    expect(g.blocked.stance.join(" ")).toMatch(/data\.basis/);
    // Ratios are still computable: the basis affects expiry, not arithmetic.
    expect(g.mayComputeRatios).toBe(true);
  });
});

describe("scoring rate gate", () => {
  it("blocks only the scoring-rate output when the threshold is unanswered", () => {
    const g = runAnswerGates(a({
      ...VETOES_OK, "data.basis": "historical", "cutoff.applied_by": "person",
    }));
    expect(g.mayComputeScoringRate).toBe(false);
    expect(g.mayProduceStance).toBe(true);
  });

  it("permits it once a cutoff is stated", () => {
    const g = runAnswerGates(a({
      ...VETOES_OK, "data.basis": "historical",
      "cutoff.applied_by": "person", "threshold.operational": "stated",
    }));
    expect(g.mayComputeScoringRate).toBe(true);
  });

  it("permits it when there is no fixed cutoff, since 5-301(c) uses the median", () => {
    const g = runAnswerGates(a({
      ...VETOES_OK, "data.basis": "historical",
      "cutoff.applied_by": "person", "threshold.operational": "none",
    }));
    expect(g.mayComputeScoringRate).toBe(true);
  });
});

describe("generation gate", () => {
  it("blocks generation until the input form is known", () => {
    const g = runAnswerGates(a({ ...VETOES_OK, "data.basis": "historical" }));
    expect(g.mayGenerate).toBe(false);
  });

  it("blocks generation for an audio input", () => {
    const g = runAnswerGates(a({
      ...VETOES_OK, "data.basis": "historical", "pipeline.input_form": "audio",
    }));
    expect(g.mayGenerate).toBe(false);
  });

  it("permits generation for a resume input", () => {
    const g = runAnswerGates(a({
      ...VETOES_OK, "data.basis": "historical", "pipeline.input_form": "resume",
    }));
    expect(g.mayGenerate).toBe(true);
  });
});

describe("consequences", () => {
  it("collects the vendor blank-field consequence", () => {
    const g = runAnswerGates(a({ ...VETOES_OK, "data.basis": "historical" }));
    const blank = g.consequences.find((c) => c.kind === "blank_field")!;
    expect(blank.payload!.field).toBe("distribution_date");
  });

  it("collects the self-administered scope note", () => {
    const g = runAnswerGates(a({ ...VETOES_OK, "data.basis": "historical" }));
    expect(g.consequences.some((c) =>
      c.kind === "scope_note" && /independent auditor/i.test(c.text))).toBe(true);
  });

  it("forces the metric from the cutoff answer", () => {
    expect(runAnswerGates(a({ ...VETOES_OK, "cutoff.applied_by": "platform" }))
      .forcedMetric).toBe("selection_rate");
    expect(runAnswerGates(a({ ...VETOES_OK, "cutoff.applied_by": "person" }))
      .forcedMetric).toBe("scoring_rate");
  });

  it("emits a limitation for a don't-know on pre-processing", () => {
    const g = runAnswerGates(a({ ...VETOES_OK, "pipeline.preprocessing": null }));
    // A don't-know selects no option, so the limitation comes from the
    // open item rather than from an option's emits.
    expect(g.consequences.some((c) =>
      c.kind === "limitation" && /not established|do not know/i.test(c.text))).toBe(true);
  });

  it("does not collect consequences from questions that do not apply", () => {
    const g = runAnswerGates(a({ ...VETOES_OK, "scope.weighting": "one_of_several" }));
    expect(g.consequences.every((c) => c.kind === "scope_note")).toBe(true);
  });
});

describe("a gate is satisfied when its question does not apply", () => {
  // Out of scope, data.basis is NOT applicable rather than unanswered, so the
  // stance must still be produced. Withholding it would make the favourable
  // outcome read as a failed run, which the spec resolves against directly.
  it("permits a stance for an out-of-scope tool, with no data basis given", () => {
    const g = runAnswerGates(a({ ...VETOES_OK, "scope.weighting": "one_of_several" }));
    expect(g.mayProduceStance).toBe(true);
    expect(g.blocked.stance ?? []).toEqual([]);
  });

  it("still blocks an in-scope stance when the basis is genuinely unanswered", () => {
    const g = runAnswerGates(a({ ...VETOES_OK, "scope.weighting": "biggest" }));
    expect(g.mayProduceStance).toBe(false);
  });

  it("blocks nothing on generation for an out-of-scope tool either", () => {
    // Nothing to generate against, but the block must not read as a defect.
    const g = runAnswerGates(a({ ...VETOES_OK, "scope.weighting": "one_of_several" }));
    expect(g.blocked.generation ?? []).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd ~/verifywise/Servers && npm run test:unit -- services/biasAudit/answerGates.test.ts`
Expected: FAIL, cannot find module `./answerGates`.

- [ ] **Step 3: Write the implementation**

Create `answerGates.ts`. Walk the applicable questions; for each answered one, collect the
chosen option's `emits`. Build the `blocked` map from each question's `gates`.

**Two rules that are not obvious and that the tests pin:**

A gate is satisfied when its question is **not applicable**, not only when it is answered. Only
an applicable-and-unanswered question blocks. Without this, an out-of-scope customer gets no
stance, because `data.basis` never applies to them.

A don't-know emits a generic limitation, since no option was selected and so no `emits` fired.
Use this wording verbatim, so the text is reviewable here rather than invented per
implementation:

```ts
const NOT_ESTABLISHED: Record<string, string> = {
  "pipeline.preprocessing":
    "Whether the input is transformed before scoring was not established, so no finding " +
    "can be attributed to the scoring step alone.",
  "knockout.exists":
    "Whether any criterion fails a candidate outright was not established. If one does, " +
    "the rate combines candidates who scored low with candidates who were failed outright.",
  "cutoff.applied_by":
    "Whether a cutoff is applied by the platform or by a person was not established, so " +
    "which of 5-301(b) and 5-301(c) governs is unsettled.",
  "history.prior_audit":
    "Whether this tool has been audited before, and whether it has changed since, was not " +
    "established.",
};
```

A don't-know on a question absent from that map contributes an open item and no limitation.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd ~/verifywise/Servers && npm run test:unit -- services/biasAudit/answerGates.test.ts`
Expected: PASS, 13 tests.

- [ ] **Step 5: Commit**

```bash
cd ~/verifywise
git add Servers/services/biasAudit/answerGates.ts Servers/services/biasAudit/answerGates.test.ts
git commit -m "Add answer gates and consequence collection

Separates a gate on one deliverable from a gate on everything. An
unanswered data basis blocks the stance, because no expiry condition can
be stated, while leaving the arithmetic computable. A missing operational
cutoff blocks only the scoring-rate output. An unknown input form blocks
generation alone.

Answers also emit stance text: a vendor gets the blank distribution-date
field with its instruction, a self-administered test gets the 5-300
independence note, and the cutoff answer forces the metric. A don't-know
emits a not-established limitation rather than nothing, so an unanswered
question is visible in the output."
```

---

### Task 8: Education content

**Files:**
- Create: `Clients/src/presentation/pages/BiasAudit/education/content.ts`
- Create: `Clients/src/presentation/pages/BiasAudit/education/citations.ts`
- Test: `Clients/src/presentation/pages/BiasAudit/education/content.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `interface EducationBlock { pageKey: string; decides: string; law: { text: string; refs: string[] }; goesWrong: string }`
  - `EDUCATION: Record<string, EducationBlock>`
  - `VALID_CITATIONS: readonly string[]`

- [ ] **Step 1: Write the failing test**

```ts
import { EDUCATION, type EducationBlock } from "./content";
import { VALID_CITATIONS } from "./citations";

const PAGES = [
  "profile.party", "profile.scope", "profile.data_held", "profile.independence",
  "run.cutoff", "run.knockout", "run.preprocessing", "run.job_description",
  "run.criteria_comparison", "run.upload", "results.figures", "results.data_quality",
  "stance", "expiry",
];

describe("coverage", () => {
  it("has a block for every customer-facing page", () => {
    for (const page of PAGES) {
      expect(EDUCATION[page]).toBeDefined();
    }
  });

  it("gives every block all three elements", () => {
    for (const [key, block] of Object.entries(EDUCATION) as [string, EducationBlock][]) {
      expect(block.decides.length).toBeGreaterThan(20);
      expect(block.law.text.length).toBeGreaterThan(20);
      expect(block.goesWrong.length).toBeGreaterThan(40);
      expect(block.pageKey).toBe(key);
    }
  });
});

describe("citations resolve", () => {
  it("uses only references from the citation table", () => {
    for (const block of Object.values(EDUCATION) as EducationBlock[]) {
      for (const ref of block.law.refs) {
        expect(VALID_CITATIONS).toContain(ref);
      }
    }
  });

  it("cites 5-301(a) only for the one-year expiry", () => {
    // A prior report cited 5-301(a) for re-audit triggers it does not
    // contain and the claim had to be withdrawn.
    for (const [key, block] of Object.entries(EDUCATION) as [string, EducationBlock][]) {
      if (block.law.refs.includes("5-301(a)")) {
        expect(["expiry", "run.cutoff"]).toContain(key);
      }
    }
  });

  it("states that 0.80 is a convention wherever it appears", () => {
    const blocks = (Object.values(EDUCATION) as EducationBlock[])
      .filter((b) => `${b.decides} ${b.law.text} ${b.goesWrong}`.includes("0.80"));
    expect(blocks.length).toBeGreaterThan(0);
    for (const b of blocks) {
      expect(`${b.law.text} ${b.goesWrong}`.toLowerCase()).toMatch(
        /convention|does not adopt|four-fifths/,
      );
    }
  });
});

describe("anonymity", () => {
  it("names no client", () => {
    const all = JSON.stringify(EDUCATION).toLowerCase();
    for (const name of ["client-c", "client-a", "client-b", "manish", "tali", "brad",
                        "ollie", "oliver", "josh", "tina", "dan adeline"]) {
      expect(all).not.toContain(name);
    }
  });
});

describe("vocabulary", () => {
  it("never uses forbidden words", () => {
    const all = JSON.stringify(EDUCATION).toLowerCase();
    for (const word of ["compliant", "certified", "bias-free"]) {
      expect(all).not.toContain(word);
    }
  });

  it("does not instruct the customer on their own obligations", () => {
    // 5-303 duties belong to the deploying employer. Advice about them in a
    // supplier's document was called out on a real engagement as unhelpful
    // and incorrect, and the client was right.
    const all = JSON.stringify(EDUCATION).toLowerCase();
    expect(all).not.toMatch(/you must publish|post this on your (careers|website)/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd ~/verifywise/Clients && npx vitest run src/presentation/pages/BiasAudit/education/content.test.ts`
Expected: FAIL, cannot resolve `./content`.

- [ ] **Step 3: Write the citation table**

Create `citations.ts`:

```ts
/**
 * Every statutory reference the education content may cite.
 *
 * A reference not in this list fails the content test. The list exists
 * because a prior report cited 5-301(a) for a proposition it does not
 * contain, and the resulting table had to be deleted from a signed
 * document.
 */
export const VALID_CITATIONS = [
  "5-300",       // definitions: AEDT, independent auditor, test data, distribution date
  "5-301",       // required calculations
  "5-301(a)",    // one year since the most recent bias audit — the only re-audit trigger
  "5-301(b)",    // selection branch
  "5-301(c)",    // scoring branch
  "5-301(d)",    // the 2% exclusion
  "5-302",       // data requirements
  "5-302(a)",    // must use historical data
  "5-302(b)",    // test data permitted where historical data is insufficient
  "5-303",       // publication, by the employer or employment agency
  "5-303(a)(2)", // distribution date
  "5-303(c)",    // six-month posting
  "20-871",      // Local Law 144 as codified
  "20-871(a)(1)",
  "20-871(b)",   // candidate notice
  "FAQ III.4",   // one audit may cover multiple positions
  "FAQ V.1",     // the vendor that created the AEDT is not responsible for its audit
] as const;
```

- [ ] **Step 4: Write the content**

Create `content.ts`. All 14 blocks are written out below; transcribe them. The `pageKey` values
are the mapping from the spec's education table, which the test's `PAGES` list asserts.

```ts
import type { EducationBlock } from "./types";

export const EDUCATION: Record<string, EducationBlock> = {
  "profile.party": {
    pageKey: "profile.party",
    decides:
      "Whether the duty to publish a summary of results is yours or your customers', and " +
      "whether a distribution date exists for you at all.",
    law: {
      text:
        "5-303 places the publication duty on an employer or employment agency in the city, " +
        "not on the party that built the tool. DCWP's FAQ V.1 states that the vendor which " +
        "created an AEDT is not responsible for a bias audit of it. FAQ V.2 permits a vendor " +
        "to commission one anyway, which is what this is.",
      refs: ["5-303", "FAQ V.1"],
    },
    goesWrong:
      "One tool supplier was assumed to be the employer. Three signed documents stated " +
      "obligations that were not theirs and had to be reissued, and one told them to post a " +
      "summary on their own careers site, which was advice to nobody in the room. A supplier " +
      "also has no single distribution date, because 5-303(a)(2) means the date a given " +
      "employer began using the tool and that differs for every customer.",
  },

  "profile.scope": {
    pageKey: "profile.scope",
    decides: "Whether Local Law 144 applies to this use of the tool at all.",
    law: {
      text:
        "5-300 defines an automated employment decision tool as one whose output is relied on " +
        "solely, is weighted more than any other criterion, or is used to overrule a " +
        "conclusion reached another way. A score that is one input among several with no extra " +
        "weight falls outside that definition.",
      refs: ["5-300"],
    },
    goesWrong:
      "Answering that the score is one of several is a complete and favourable result, not a " +
      "failure. One audit asserted a tool was in scope on the client's own description of it; " +
      "the client's counsel later disagreed, and the determination had to be withdrawn from a " +
      "signed report. VerifyWise does not make this determination for you, and records your " +
      "answer as yours.",
  },

  "profile.data_held": {
    pageKey: "profile.data_held",
    decides:
      "Which basis under 5-302(b) you rely on for using test data, and the condition on which " +
      "that basis stops holding.",
    law: {
      text:
        "5-302(a) requires a bias audit to use historical data. 5-302(b) permits test data " +
        "where insufficient historical data is available to conduct a statistically " +
        "significant audit, and then requires the summary to explain why historical data was " +
        "not used and how the test data was generated. Example 3 to 5-302 states that an " +
        "employer holding statistically significant historical data may not rely on a " +
        "test-data audit.",
      refs: ["5-302(a)", "5-302(b)"],
    },
    goesWrong:
      "\"We don't have breakdowns\" means two different things: you hold none of it, or you " +
      "hold it and have not separated it out. One engagement read it the wrong way and never " +
      "resolved it before signing. Holding sex but not race is the common case and produces a " +
      "split basis: sex may be auditable from historical data while race, ethnicity and every " +
      "intersectional category are not, and records carrying only sex never end a race basis " +
      "however far their volume grows.",
  },

  "profile.independence": {
    pageKey: "profile.independence",
    decides: "Whether this result can be called a bias audit.",
    law: {
      text:
        "5-300 requires an independent auditor: a person or group not involved in using, " +
        "developing or distributing the tool, with no employment relationship with the party " +
        "using it and no financial interest in the tool or in its developer.",
      refs: ["5-300"],
    },
    goesWrong:
      "A test you run on your own tool is not a Local Law 144 bias audit at any level of " +
      "quality, and this module will not say it is. What it does do is tell you what an " +
      "independent audit would find before you pay for one. An internal team that did not " +
      "build the tool is still not independent, because the employment relationship is itself " +
      "disqualifying.",
  },

  "run.cutoff": {
    pageKey: "run.cutoff",
    decides: "Which statutory branch governs, and therefore which figure is computed.",
    law: {
      text:
        "Where the platform applies a cutoff it selects, and 5-301(b) requires selection " +
        "rates. Where a person applies it the tool scores, and 5-301(c) requires scoring " +
        "rates: the median for the full sample, a scoring rate and impact ratio per category, " +
        "and the mandatory sex by race or ethnicity intersection.",
      refs: ["5-301(b)", "5-301(c)"],
    },
    goesWrong:
      "One client's own team gave both answers minutes apart on the same call. Another " +
      "returned five thousand rows with the decision column entirely blank, which settled it " +
      "as a scoring rate after the corpus had already been built. If automation is planned but " +
      "not live, say so: the result then carries a dated statement of what was tested and " +
      "stops describing your platform when the feature ships.",
  },

  "run.knockout": {
    pageKey: "run.knockout",
    decides: "What your selection or scoring rate is actually measuring.",
    law: {
      text:
        "Not a statutory item. It determines whether a rate combines two different " +
        "mechanisms, which affects how every impact ratio in the table should be read.",
      refs: [],
    },
    goesWrong:
      "One engagement asked four times and got the answer after shipping. A knockout on a " +
      "single criterion cut the usable sample from five thousand candidates to three " +
      "thousand. Where knocked-out candidates are not recorded in their own column, a rate " +
      "mixes candidates who scored low with candidates who were failed outright, and the two " +
      "have different causes and different remedies.",
  },

  "run.preprocessing": {
    pageKey: "run.preprocessing",
    decides: "Whether this result describes what your tool actually scores.",
    law: {
      text:
        "Not a statutory item. It bounds what any finding may be attributed to, which the " +
        "summary of results must be accurate about.",
      refs: [],
    },
    goesWrong:
      "One client volunteered, unprompted, that their evaluation runs on extracted and " +
      "normalised answers rather than on the transcripts submitted to it. The intermediate " +
      "form was never seen, so the report had to disclose that the scored input was not the " +
      "submitted input, and that remained the largest open gap in the audit. If anything " +
      "transforms the material before scoring, no finding can be attributed to the scoring " +
      "step alone.",
  },

  "run.job_description": {
    pageKey: "run.job_description",
    decides:
      "What the generated candidates contain evidence of, and which role this result " +
      "describes.",
    law: {
      text:
        "Under 5-301 the audit attaches to the tool rather than to the position. DCWP's FAQ " +
        "III.4 confirms that one audit may cover hiring for different positions, and 20-871" +
        "(a)(1) is the codified duty. So testing a single role is defensible, provided the " +
        "result names it.",
      refs: ["5-301", "FAQ III.4", "20-871(a)(1)"],
    },
    goesWrong:
      "A sample for a junior hourly role was once used to reason about a senior role at four " +
      "times the salary. The two job descriptions offered here are fixed so that the criteria " +
      "are known in advance and every customer's corpus is comparable; your result states " +
      "which role was tested and that it describes your platform's behaviour on that role, " +
      "not across your hiring.",
  },

  "run.criteria_comparison": {
    pageKey: "run.criteria_comparison",
    decides: "Whether the generated candidates exercise your actual configuration.",
    law: {
      text:
        "Not a statutory item. It is a validity check on the test material, which 5-302(b) " +
        "requires the summary to describe.",
      refs: ["5-302(b)"],
    },
    goesWrong:
      "One platform generated five criteria from a job description where eight had been " +
      "reconstructed from the same text. The qualification gradient lost its top rung, " +
      "because the only criterion separating a solid candidate from a strong one was not " +
      "among the five, and the corpus had to be remapped. Pasting back what your platform " +
      "generates takes one field and catches that before you spend a scoring cycle.",
  },

  "run.upload": {
    pageKey: "run.upload",
    decides: "Whether impact ratios can be produced from this data at all.",
    law: {
      text:
        "5-301(d) permits an auditor to exclude a category representing less than 2% of the " +
        "data, with the reason stated. 5-301(c)(5) requires the number of individuals " +
        "assessed who fall into an unknown category to be reported.",
      refs: ["5-301(d)", "5-301(c)"],
    },
    goesWrong:
      "A demographic column that is mostly blank cannot produce a ratio at any volume, and a " +
      "rate computed from the few populated rows still looks authoritative. If a mapped " +
      "column is missing from your file the fault is in the mapping rather than the data, and " +
      "this module says which. Three distinct score levels once put the sample median on the " +
      "modal value, so counting strictly above it gave every group a rate of zero.",
  },

  "results.figures": {
    pageKey: "results.figures",
    decides:
      "What these numbers mean, and what they do not. This page is where a reader decides " +
      "whether your platform treats groups differently on the material tested.",
    law: {
      text:
        "5-301(c) requires the median for the full sample, a scoring rate and impact ratio " +
        "for each category, and the sex by race or ethnicity intersection. The intersectional " +
        "table is mandatory and is the requirement most often skipped by anyone working from " +
        "the four-fifths rule rather than the rule text. 0.80 is the EEOC four-fifths " +
        "convention and this statute does not adopt it; 5-301(d)'s 2% exclusion is the " +
        "statutory rule.",
      refs: ["5-301(c)", "5-301(d)"],
    },
    goesWrong:
      "There is no pass mark in Local Law 144 and no pass or fail. A ratio below 0.80 is a " +
      "number to report and investigate, not a failure, and a ratio above it is not a " +
      "clearance. Reading the convention as a threshold leads teams to treat 0.81 as safe and " +
      "0.79 as a crisis when the difference between them can be a single candidate.",
  },

  "results.data_quality": {
    pageKey: "results.data_quality",
    decides: "Whether to trust the figures on the previous page.",
    law: {
      text:
        "Not a statutory item. 5-302(b) requires the summary to describe how the test data " +
        "was generated, and these checks are what that description can honestly claim.",
      refs: ["5-302(b)"],
    },
    goesWrong:
      "A clean impact ratio from a badly built dataset is more dangerous than a flagged one, " +
      "because nobody looks at it twice. One corpus assigned demographics in contiguous " +
      "blocks while generation ran in order, and returned 0.9770 on sex precisely because sex " +
      "was the most perfectly blocked attribute: a two-block split averages position effects " +
      "over half the data each and they cancel. Balance checks passed throughout.",
  },

  "stance": {
    pageKey: "stance",
    decides: "What you can and cannot say about this result.",
    law: {
      text:
        "5-300 requires an independent auditor, so a self-administered test is not a bias " +
        "audit. 5-303 requires a published summary of results from the employer or " +
        "employment agency deploying the tool, which this document does not satisfy.",
      refs: ["5-300", "5-303"],
    },
    goesWrong:
      "This document is not a Local Law 144 bias audit and does not discharge any publication " +
      "duty. What it is: a record of what your platform did on a named role, what you have " +
      "established about your own position, and what an independent auditor would still need. " +
      "The readiness score is VerifyWise's own measure and no regulator recognises it.",
  },

  "expiry": {
    pageKey: "expiry",
    decides: "When this result stops describing your platform.",
    law: {
      text:
        "5-301(a) is the only re-audit trigger in the rule: a tool may not be used if more " +
        "than one year has passed since its most recent bias audit. Separately, a test-data " +
        "basis under 5-302(b) ends on its own condition, which may fire well before a year.",
      refs: ["5-301(a)", "5-302(b)"],
    },
    goesWrong:
      "The rule contains no trigger for a change of role, configuration, weighting or model. " +
      "One report cited 5-301(a) for re-audit triggers it does not contain and the claim had " +
      "to be withdrawn. Your test-data basis expires on a condition rather than a date: if it " +
      "rests on race not being recorded, it ends when race begins to be captured, and " +
      "collecting more records of other characteristics does not end it.",
  },
};
```

For reference, the shape each block follows:

```ts
export const EDUCATION: Record<string, EducationBlock> = {
  "results.figures": {
    pageKey: "results.figures",
    decides:
      "What these numbers mean, and what they do not. This page is where a reader decides " +
      "whether your platform treats groups differently on the material tested.",
    law: {
      text:
        "5-301(c) requires the median for the full sample, a scoring rate and impact ratio " +
        "for each category, and the sex by race/ethnicity intersection. The intersectional " +
        "table is mandatory and is the requirement most often skipped by anyone working " +
        "from the four-fifths rule rather than the rule text. 0.80 is the EEOC four-fifths " +
        "convention and this statute does not adopt it; 5-301(d)'s 2% exclusion is the " +
        "statutory rule.",
      refs: ["5-301(c)", "5-301(d)"],
    },
    goesWrong:
      "There is no pass mark in Local Law 144 and no pass or fail. A ratio below 0.80 is a " +
      "number to report and investigate, not a failure, and a ratio above it is not a " +
      "clearance. Reading the convention as a threshold leads teams to treat 0.81 as safe " +
      "and 0.79 as a crisis when the difference between them is one candidate.",
  },
  // ... the remaining 13 blocks, each with the same depth
};
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd ~/verifywise/Clients && npx vitest run src/presentation/pages/BiasAudit/education/content.test.ts`
Expected: PASS, 8 tests.

- [ ] **Step 6: Commit**

```bash
cd ~/verifywise
git add Clients/src/presentation/pages/BiasAudit/education/
git commit -m "Add education content for every bias module page

Fourteen blocks, each with what the page decides, the statutory hook, and
what goes wrong. The third element is the one that changes behaviour:
abstract guidance does not, and a named failure does.

Every statutory reference must resolve to a citation table, asserted by
test, because a prior report cited 5-301(a) for re-audit triggers it does
not contain and the claim had to be withdrawn. Wherever 0.80 appears the
text says it is the EEOC convention and that the statute does not adopt
it.

No client is named, and the content does not instruct customers on their
own publication duties: those belong to the deploying employer, and
advice about them in a supplier's document was called out on a real
engagement as unhelpful and incorrect."
```

---

### Task 9: Upload, parse and run

**Files:**
- Create: `Servers/services/biasAudit/datasetParser.ts`
- Create: `Servers/services/biasAudit/runService.ts`
- Test: `Servers/services/biasAudit/datasetParser.test.ts`
- Test: `Servers/services/biasAudit/runService.test.ts`

**Interfaces:**
- Consumes: `runAudit` from plan 1; Tasks 3, 6, 7.
- Produces:
  - `parseDataset(csv: string, mapping: Record<string, string>): { records: AuditRecord[]; headers: string[]; unknownCount: number; mappingErrors: string[] }`
  - `createRun(args): Promise<{ runId: number; readiness: ReadinessResult; outcome: AuditOutcome }>`

- [ ] **Step 1: Write the failing parser test**

```ts
import { parseDataset } from "./datasetParser";

describe("parseDataset", () => {
  it("maps columns by the supplied mapping", () => {
    const csv = "cand,gender,race,outcome\n1,Male,White,1\n2,Female,Asian,0\n";
    const out = parseDataset(csv, {
      sex: "gender", race_ethnicity: "race", selected: "outcome",
    });
    expect(out.mappingErrors).toEqual([]);
    expect(out.records).toHaveLength(2);
    expect(out.records[0]).toMatchObject({ sex: "Male", race_ethnicity: "White" });
  });

  // Review Focus 4
  it("names the mapping when a mapped column is absent", () => {
    const csv = "cand,gender,outcome\n1,Male,1\n";
    const out = parseDataset(csv, { sex: "gender", race_ethnicity: "ethnicity" });
    expect(out.mappingErrors).toHaveLength(1);
    expect(out.mappingErrors[0]).toContain("ethnicity");
    expect(out.mappingErrors[0]).toMatch(/not present|no column/i);
    // The message blames the mapping, not the data.
    expect(out.mappingErrors[0]).not.toMatch(/missing data|incomplete data/i);
  });

  it("counts rows with no demographic value as unknown", () => {
    const csv = "gender,outcome\nMale,1\n,0\n,1\n";
    const out = parseDataset(csv, { sex: "gender", selected: "outcome" });
    expect(out.unknownCount).toBe(2);
  });

  it("reads 1/0, true/false and yes/no as the outcome", () => {
    const csv = "gender,outcome\nMale,1\nFemale,true\nMale,yes\nFemale,0\n";
    const out = parseDataset(csv, { sex: "gender", selected: "outcome" });
    expect(out.records.map((r) => r.selected)).toEqual([true, true, true, false]);
  });

  it("treats a blank outcome as not selected rather than guessing", () => {
    const csv = "gender,outcome\nMale,\n";
    const out = parseDataset(csv, { sex: "gender", selected: "outcome" });
    expect(out.records[0].selected).toBe(false);
  });

  it("handles quoted fields containing commas", () => {
    const csv = 'gender,note,outcome\nMale,"a, b",1\n';
    const out = parseDataset(csv, { sex: "gender", selected: "outcome" });
    expect(out.records).toHaveLength(1);
    expect(out.records[0].sex).toBe("Male");
  });

  it("rejects an empty file with a clear message", () => {
    expect(() => parseDataset("", {})).toThrow(/no rows|empty/i);
  });

  it("rejects a header-only file", () => {
    expect(() => parseDataset("a,b,c\n", {})).toThrow(/no rows/i);
  });
});
```

- [ ] **Step 2: Run it, confirm failure, implement the parser**

Run: `cd ~/verifywise/Servers && npm run test:unit -- services/biasAudit/datasetParser.test.ts`
Expected: FAIL. Then implement: a small quoted-CSV reader, mapping application, and `mappingErrors` naming any mapped column absent from the headers.

- [ ] **Step 3: Write the failing run-service test**

```ts
const utils = { createRunQuery: jest.fn(), getAttestedProfileQuery: jest.fn(),
                getProfileAnswersQuery: jest.fn() };
jest.mock("../../utils/biasAudit.utils", () => utils);
jest.mock("../../database/db", () => ({ sequelize: { transaction: (f: any) => f({}) } }));

import { createRun } from "./runService";

const ANSWERS = [
  { question_key: "role.party", answer_value: "vendor", is_dont_know: false,
    is_not_applicable: false },
  { question_key: "scope.weighting", answer_value: "biggest", is_dont_know: false,
    is_not_applicable: false },
  { question_key: "independence.auditor", answer_value: "self", is_dont_know: false,
    is_not_applicable: false },
  { question_key: "data.held", answer_value: "none", is_dont_know: false,
    is_not_applicable: false },
  { question_key: "data.basis", answer_value: "test_attribute", is_dont_know: false,
    is_not_applicable: false },
  { question_key: "cutoff.applied_by", answer_value: "platform", is_dont_know: false,
    is_not_applicable: false },
];

const CSV = (n = 200) => {
  const rows = ["gender,race,outcome"];
  for (let i = 0; i < n; i++) {
    rows.push(`${i % 2 ? "Male" : "Female"},${i % 3 ? "White" : "Asian"},${i % 5 < 2 ? 1 : 0}`);
  }
  return rows.join("\n") + "\n";
};

beforeEach(() => {
  Object.values(utils).forEach((f) => f.mockReset());
  utils.getAttestedProfileQuery.mockResolvedValue({ id: 5, version: 2, status: "attested" });
  utils.getProfileAnswersQuery.mockResolvedValue(ANSWERS);
  utils.createRunQuery.mockResolvedValue({ id: 11 });
});

describe("createRun", () => {
  it("records the profile version it ran against", async () => {
    await createRun({
      projectId: 7, frameworkId: 15, organizationId: 42, userId: 9,
      csv: CSV(), mapping: { sex: "gender", race_ethnicity: "race", selected: "outcome" },
    });
    expect(utils.createRunQuery.mock.calls[0][0]).toMatchObject({
      profileId: 5, profileVersion: 2,
    });
  });

  it("records the metric forced by the cutoff answer", async () => {
    await createRun({
      projectId: 7, frameworkId: 15, organizationId: 42, userId: 9,
      csv: CSV(), mapping: { sex: "gender", race_ethnicity: "race", selected: "outcome" },
    });
    expect(utils.createRunQuery.mock.calls[0][0].metric).toBe("selection_rate");
  });

  it("records the threshold with its provenance", async () => {
    await createRun({
      projectId: 7, frameworkId: 15, organizationId: 42, userId: 9,
      csv: CSV(), mapping: { sex: "gender", race_ethnicity: "race", selected: "outcome" },
    });
    const row = utils.createRunQuery.mock.calls[0][0];
    expect(row.threshold).toBe(0.8);
    expect(row.thresholdSource).toBe("convention");
    expect(row.smallSampleExclusion).toBe(0.02);
  });

  it("records the dataset hash and does not retain the dataset", async () => {
    await createRun({
      projectId: 7, frameworkId: 15, organizationId: 42, userId: 9,
      csv: CSV(), mapping: { sex: "gender", race_ethnicity: "race", selected: "outcome" },
    });
    const row = utils.createRunQuery.mock.calls[0][0];
    expect(row.datasetSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(row.datasetRetained).toBe(false);
  });

  it("derives the expiry trigger from the data basis", async () => {
    await createRun({
      projectId: 7, frameworkId: 15, organizationId: 42, userId: 9,
      csv: CSV(), mapping: { sex: "gender", race_ethnicity: "race", selected: "outcome" },
    });
    const row = utils.createRunQuery.mock.calls[0][0];
    expect(row.expiryTrigger).toMatch(/begin to be captured|characteristics/i);
    expect(row.expiryDate).toBeTruthy();
  });

  it("refuses when no attested profile exists", async () => {
    utils.getAttestedProfileQuery.mockResolvedValue(null);
    await expect(createRun({
      projectId: 7, frameworkId: 15, organizationId: 42, userId: 9,
      csv: CSV(), mapping: {},
    })).rejects.toThrow(/attested profile/i);
  });

  it("stores gate findings even when no result was computed", async () => {
    const allSelected = ["gender,outcome", ...Array(50).fill("Male,1")].join("\n");
    await createRun({
      projectId: 7, frameworkId: 15, organizationId: 42, userId: 9,
      csv: allSelected, mapping: { sex: "gender", selected: "outcome" },
    });
    const row = utils.createRunQuery.mock.calls[0][0];
    expect(row.resultJson).toBeNull();
    expect(JSON.stringify(row.gateFindingsJson)).toContain("all_or_none_selected");
  });
});
```

- [ ] **Step 4: Run it, confirm failure, implement the run service**

Expected FAIL first. Then implement: read the attested profile and answers, build the `AnswerMap`, run `computeReadiness` and `runAnswerGates`, parse the dataset, call `runAudit` from plan 1, derive expiry from `data.basis`, and persist.

Expiry trigger text per basis:

```ts
const EXPIRY_TRIGGERS: Record<string, string> = {
  historical:
    "This run used historical applicant data, so no test-data basis applies. The result " +
    "itself is one year old on the expiry date above.",
  test_volume:
    "This basis ends when your historical records reach a volume that supports the 14 " +
    "intersectional categories 5-301(c)(4)(iii) requires.",
  test_attribute:
    "This basis ends when the missing characteristics begin to be captured at reportable " +
    "volumes. Records carrying only some of the required characteristics do not end it, " +
    "however far their volume grows.",
  test_availability:
    "This basis ends if the historical records become available to you.",
};
```

- [ ] **Step 5: Run both test files**

Run: `cd ~/verifywise/Servers && npm run test:unit -- services/biasAudit/datasetParser.test.ts services/biasAudit/runService.test.ts`
Expected: PASS, 8 + 7 tests.

- [ ] **Step 6: Commit**

```bash
cd ~/verifywise
git add Servers/services/biasAudit/
git commit -m "Add dataset parsing and the run service

The parser names the mapping when a mapped column is absent rather than
reporting missing data, because the two have different fixes and
conflating them sends the customer to check a file that is fine.

A run records the profile version it ran against, the metric forced by
the cutoff answer, the threshold with its provenance, the dataset hash
without retaining the dataset, and an expiry trigger derived from the
5-302(b) basis in words. Volume, attribute and availability bases expire
on different conditions, and sex-only records never end a race basis
however far their volume grows.

Gate findings are stored even when no result was computed, so a blocked
run is a record rather than an absence."
```

---

### Task 9b: Derive the per-category data basis

The spec requires the § 5-302(b) basis per protected category, and the intake asks it once.
This derives the split from the two answers that already carry it, and marks it for the
customer to confirm rather than presenting it as their statement.

**Files:**
- Create: `Servers/services/biasAudit/deriveBasis.ts`
- Test: `Servers/services/biasAudit/deriveBasis.test.ts`

**Interfaces:**
- Consumes: `AnswerMap` from Task 5.
- Produces:
  - `type BasisKind = "historical" | "test_volume" | "test_attribute" | "test_availability" | "not_applicable"`
  - `interface CategoryBasis { category: "sex" | "race_ethnicity" | "intersectional"; basis: BasisKind; expiryTrigger: string }`
  - `interface DerivedBasis { perCategory: CategoryBasis[]; confirmed: boolean; summary: string }`
  - `deriveBasis(answers: AnswerMap): DerivedBasis | null`

- [ ] **Step 1: Write the failing test**

```ts
import { deriveBasis } from "./deriveBasis";
import type { AnswerMap } from "./applicability";

const a = (m: Record<string, string>): AnswerMap =>
  Object.fromEntries(Object.entries(m).map(([k, v]) => [k, { value: v, dontKnow: false }]));

const find = (d: ReturnType<typeof deriveBasis>, c: string) =>
  d!.perCategory.find((x) => x.category === c)!;

describe("the split that a single answer would flatten", () => {
  // One engagement held sex for ~1,500-2,000 candidates and no race or
  // ethnicity at all. Sex was auditable from historical data; race and all 11
  // intersectional categories were not.
  it("splits sex from race when only sex is held", () => {
    const d = deriveBasis(a({ "data.held": "sex_only", "data.basis": "test_attribute" }));
    expect(find(d, "sex").basis).toBe("historical");
    expect(find(d, "race_ethnicity").basis).toBe("test_attribute");
    expect(find(d, "intersectional").basis).toBe("test_attribute");
  });

  it("gives the race basis an expiry that sex volume cannot satisfy", () => {
    const d = deriveBasis(a({ "data.held": "sex_only", "data.basis": "test_attribute" }));
    const race = find(d, "race_ethnicity");
    expect(race.expiryTrigger).toMatch(/race and ethnicity/i);
    expect(race.expiryTrigger).toMatch(/sex-only records do not end it/i);
    // The sex category has nothing to expire.
    expect(find(d, "sex").expiryTrigger).toBe("");
  });
});

describe("the uniform cases", () => {
  it("marks every category test_attribute when nothing is held", () => {
    const d = deriveBasis(a({ "data.held": "none", "data.basis": "test_attribute" }));
    expect(d!.perCategory.every((c) => c.basis === "test_attribute")).toBe(true);
  });

  it("marks every category historical when all is held sufficiently", () => {
    const d = deriveBasis(a({ "data.held": "all_sufficient", "data.basis": "historical" }));
    expect(d!.perCategory.every((c) => c.basis === "historical")).toBe(true);
    expect(d!.perCategory.every((c) => c.expiryTrigger === "")).toBe(true);
  });

  it("uses volume, not attribute, when all is held at low volume", () => {
    const d = deriveBasis(a({ "data.held": "all_low_volume", "data.basis": "test_volume" }));
    expect(find(d, "race_ethnicity").basis).toBe("test_volume");
    expect(find(d, "race_ethnicity").expiryTrigger).toMatch(/volume/i);
  });

  it("uses availability when the customers hold it", () => {
    const d = deriveBasis(
      a({ "data.held": "customers_hold_it", "data.basis": "test_availability" }),
    );
    expect(d!.perCategory.every((c) => c.basis === "test_availability")).toBe(true);
    expect(find(d, "sex").expiryTrigger).toMatch(/become available/i);
  });
});

describe("the intersection needs both halves", () => {
  it("is never historical unless both sex and race are", () => {
    for (const held of ["sex_only", "none", "customers_hold_it", "all_low_volume"]) {
      const d = deriveBasis(a({ "data.held": held, "data.basis": "test_attribute" }));
      expect(find(d, "intersectional").basis).not.toBe("historical");
    }
    const all = deriveBasis(a({ "data.held": "all_sufficient", "data.basis": "historical" }));
    expect(find(all, "intersectional").basis).toBe("historical");
  });
});

describe("it is an inference, not a statement", () => {
  it("starts unconfirmed", () => {
    const d = deriveBasis(a({ "data.held": "sex_only", "data.basis": "test_attribute" }));
    expect(d!.confirmed).toBe(false);
  });

  it("summarises in words that attribute the reading to us", () => {
    const d = deriveBasis(a({ "data.held": "sex_only", "data.basis": "test_attribute" }));
    expect(d!.summary).toMatch(/we read your answers/i);
    expect(d!.summary).not.toMatch(/you (stated|said|confirmed)/i);
  });
});

describe("missing input", () => {
  it("returns null when the data basis is unanswered", () => {
    expect(deriveBasis(a({ "data.held": "sex_only" }))).toBeNull();
  });

  it("returns null when the veto is unanswered", () => {
    expect(deriveBasis(a({ "data.basis": "test_attribute" }))).toBeNull();
  });

  it("returns null on a don't-know for either", () => {
    expect(deriveBasis({
      "data.held": { value: null, dontKnow: true },
      "data.basis": { value: "test_attribute", dontKnow: false },
    })).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd ~/verifywise/Servers && npm run test:unit -- services/biasAudit/deriveBasis.test.ts`
Expected: FAIL, cannot find module `./deriveBasis`.

- [ ] **Step 3: Write the implementation**

```ts
/**
 * The § 5-302(b) basis, per protected category, derived rather than asked twice.
 *
 * `data.basis` states the reason for the run as a whole; the veto `data.held`
 * already records what the customer holds per characteristic. The split falls
 * out of the two, and asking a second per-category grid would add friction for
 * information already given.
 *
 * Why the split matters. One engagement held sex for roughly 1,500 to 2,000
 * candidates and no race or ethnicity at all. Sex was auditable from historical
 * data while race, ethnicity and all 11 intersectional categories were not, and
 * the expiry conditions differ: a race attribute basis ends when customers begin
 * capturing race, and sex-only records never end it however far their volume
 * grows. A customer who later collects 50,000 sex disclosures must not see a race
 * basis reported as resolved.
 *
 * This is OUR INFERENCE, not the customer's statement. Writing an inference back
 * as a client's words is a named failure that put a false sentence in a signed
 * report, so `confirmed` starts false, the summary says "we read your answers as
 * follows", and an unconfirmed split appears in the open items.
 */
```

Map `data.held` to a per-characteristic availability, then combine with `data.basis`:

| `data.held` | sex | race/ethnicity |
| --- | --- | --- |
| `none` | the stated basis | the stated basis |
| `sex_only` | `historical` | the stated basis |
| `all_low_volume` | `test_volume` | `test_volume` |
| `all_sufficient` | `historical` | `historical` |
| `customers_hold_it` | `test_availability` | `test_availability` |

The intersection takes the weaker of the two: `historical` only when both are.

Expiry trigger strings, keyed by basis:

```ts
const TRIGGERS: Record<BasisKind, string> = {
  historical: "",
  not_applicable: "",
  test_volume:
    "This basis ends when your historical records for this category reach a volume that " +
    "supports the 14 intersectional categories 5-301(c)(4)(iii) requires.",
  test_attribute:
    "This basis ends when race and ethnicity begin to be captured at reportable volumes. " +
    "Sex-only records do not end it, however far their volume grows.",
  test_availability:
    "This basis ends if the historical records become available to you.",
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd ~/verifywise/Servers && npm run test:unit -- services/biasAudit/deriveBasis.test.ts`
Expected: PASS, 12 tests.

- [ ] **Step 5: Commit**

```bash
cd ~/verifywise
git add Servers/services/biasAudit/deriveBasis.ts Servers/services/biasAudit/deriveBasis.test.ts
git commit -m "Derive the 5-302(b) basis per protected category

The schema carries a per-category basis and the intake asks it once, so
the split is derived from data.held plus data.basis rather than asked
twice.

The case this exists for: one engagement held sex for roughly 1,500 to
2,000 candidates and no race or ethnicity at all. Sex was auditable from
historical data while race and all 11 intersectional categories were
not, and the expiry conditions diverge. A single answer would have made
one of the two wrong, and a customer who later collected 50,000 sex
disclosures would have seen a race basis reported as resolved.

The intersection takes the weaker of its two halves, so it is historical
only when both sex and race are.

It is marked as an inference rather than a statement: confirmed starts
false and the summary reads 'we read your answers as follows'. Writing
our inference back as a client's words is the failure that put a false
sentence in a signed report."
```

---

### Task 10: Stance composition

**Files:**
- Create: `Servers/services/biasAudit/stance/compose.ts`
- Test: `Servers/services/biasAudit/stance/compose.test.ts`

**Interfaces:**
- Consumes: Tasks 6, 7, 9.
- Produces:
  - `interface StanceSection { key: string; title: string; body: string }`
  - `interface StanceModel { heading: string; scope: "in_scope" | "out_of_scope" | "undetermined"; sections: StanceSection[]; blankFields: Array<{ field: string; instruction: string }>; openItems: string[]; expiry: { date: string | null; trigger: string }; derivedBasis: DerivedBasis | null; attestation: { user: string; date: string } | null }`
  - ```ts
    interface ComposeStanceArgs {
      projectName: string;
      readiness: ReadinessResult;
      gates: AnswerGateResult;
      answers: AnswerWithNotes;
      result: BiasAuditResult | null;
      order: OrderFinding[];
      expiry: { date: string | null; trigger: string };
      derivedBasis: DerivedBasis | null;
      attestation: { user: string; date: string } | null;
      jobDescriptionKey: string | null;
    }
    ```
  - `composeStance(args: ComposeStanceArgs): StanceModel`
  - `REQUIRED_SECTIONS: readonly string[]`

- [ ] **Step 1: Write the failing test**

```ts
import { composeStance, REQUIRED_SECTIONS } from "./compose";

const base = {
  projectName: "Screening tool",
  readiness: { score: 72, blockedReason: null, missingVetoes: [], openItems: [],
               scope: "in_scope" as const, earned: 7, possible: 10 },
  gates: {
    blocked: {} as any, mayProduceStance: true, mayComputeRatios: true,
    mayGenerate: true, mayComputeScoringRate: true,
    consequences: [
      { kind: "scope_note" as const, text: "Self-administered test. 6 RCNY 5-300 requires an independent auditor." },
      { kind: "blank_field" as const,
        text: "Distribution date: to be completed by the deploying employer or employment agency.",
        payload: { field: "distribution_date" } },
    ],
    forcedMetric: "selection_rate",
  },
  answers: {
    "role.party": { value: "vendor", notes: "We supply it to staffing agencies.",
                    dontKnow: false },
    "scope.weighting": { value: "biggest", notes: "Recruiters weigh it most.",
                         dontKnow: false },
    "independence.auditor": { value: "self", notes: "Our own team.", dontKnow: false },
    "data.held": { value: "none", notes: "We hold no demographics.", dontKnow: false },
  },
  result: {
    tables: [{ title: "Impact ratios by sex", categoryKey: "sex",
               rows: [{ categoryName: "Male", selectionRate: 0.4, impactRatio: 1,
                        flagged: false, excluded: false, applicantCount: 100,
                        selectedCount: 40, categoryType: "sex" },
                      { categoryName: "Female", selectionRate: 0.3, impactRatio: 0.75,
                        flagged: true, excluded: false, applicantCount: 100,
                        selectedCount: 30, categoryType: "sex" }],
               highestGroup: "Male", highestRate: 0.4 }],
    totalApplicants: 200, flagsCount: 1, excludedCount: 0,
  } as any,
  order: [{ attribute: "sex", observedRuns: 180, expectedRuns: 201, ratio: 0.9,
            blocked: false }],
  expiry: { date: "2027-10-14", trigger: "This basis ends when characteristics are captured." },
  attestation: { user: "A. Admin", date: "2026-10-14" },
  jobDescriptionKey: "commercial-ae",
};

describe("required sections", () => {
  it("includes every required section", () => {
    const s = composeStance(base);
    const titles = s.sections.map((x) => x.key);
    for (const req of REQUIRED_SECTIONS) {
      expect(titles).toContain(req);
    }
  });

  it("includes independence, which is the 5-300 requirement", () => {
    const s = composeStance(base);
    expect(s.sections.map((x) => x.key)).toContain("independence");
    const ind = s.sections.find((x) => x.key === "independence")!;
    expect(ind.body.toLowerCase()).toContain("independent auditor");
  });
});

describe("quoting rather than characterising", () => {
  it("quotes the customer's own words on each veto", () => {
    const s = composeStance(base);
    const scope = s.sections.find((x) => x.key === "scope")!;
    expect(scope.body).toContain("We supply it to staffing agencies.");
  });

  it("attributes the scope determination to the customer, not to VerifyWise", () => {
    const s = composeStance(base);
    const scope = s.sections.find((x) => x.key === "scope")!;
    expect(scope.body).toMatch(/did not verify|belongs to the deploying party/i);
    expect(scope.body).not.toMatch(/VerifyWise (found|determined|confirms)/i);
  });

  it("names the attesting user and date", () => {
    const s = composeStance(base);
    expect(s.attestation).toEqual({ user: "A. Admin", date: "2026-10-14" });
  });
});

describe("the threshold is a convention", () => {
  it("states the provenance of 0.80 wherever a ratio is reported", () => {
    const s = composeStance(base);
    const results = s.sections.find((x) => x.key === "results")!;
    expect(results.body).toMatch(/four-fifths/i);
    expect(results.body).toMatch(/does not adopt|convention/i);
  });

  it("reports a flagged ratio as a finding, not a failure", () => {
    const s = composeStance(base);
    const results = s.sections.find((x) => x.key === "results")!;
    expect(results.body).not.toMatch(/\bfail(ed|s)?\b/i);
    expect(results.body).toContain("0.75");
  });
});

describe("the role tested is named", () => {
  it("states which job description was used and what the result describes", () => {
    const s = composeStance(base);
    const tested = s.sections.find((x) => x.key === "what_was_tested")!;
    expect(tested.body).toMatch(/account executive|commercial/i);
    expect(tested.body).toMatch(/on that role|not across/i);
  });
});

describe("the out-of-scope variant", () => {
  const oos = {
    ...base,
    heading: undefined,
    readiness: { ...base.readiness, score: null, scope: "out_of_scope" as const },
    answers: { ...base.answers,
      "scope.weighting": { value: "one_of_several",
                           notes: "One of several inputs, no extra weight.",
                           dontKnow: false } },
    result: null,
  };

  it("is headed Scope determination, not Result", () => {
    const s = composeStance(oos as any);
    expect(s.heading).toBe("Scope determination");
  });

  it("carries no ratios and no score", () => {
    const s = composeStance(oos as any);
    expect(s.sections.find((x) => x.key === "results")).toBeUndefined();
    expect(s.sections.map((x) => x.key)).not.toContain("readiness");
  });

  it("states that a change in use may bring the tool into scope", () => {
    const s = composeStance(oos as any);
    const scope = s.sections.find((x) => x.key === "scope")!;
    expect(scope.body).toMatch(/may bring (the tool|it) into scope|revisit/i);
  });

  it("does not read as a clearance", () => {
    const s = composeStance(oos as any);
    const all = s.sections.map((x) => x.body).join(" ").toLowerCase();
    expect(all).not.toMatch(/no action (is )?required|clear(ed)?( of)? bias|satisfies/);
  });
});

describe("blank fields", () => {
  it("renders the distribution date as visibly blank with an instruction", () => {
    const s = composeStance(base);
    expect(s.blankFields).toEqual([
      expect.objectContaining({ field: "distribution_date" }),
    ]);
    expect(s.blankFields[0].instruction).toContain("deploying employer");
  });
});

describe("vocabulary", () => {
  it("never uses forbidden words", () => {
    const s = composeStance(base);
    const all = JSON.stringify(s).toLowerCase();
    for (const w of ["compliant", "certified", "bias-free"]) {
      expect(all).not.toContain(w);
    }
  });

  it("does not call the run an audit", () => {
    const s = composeStance(base);
    const all = s.sections.map((x) => x.body).join(" ");
    expect(all).not.toMatch(/this audit (found|shows|concludes)/i);
  });
});
```

- [ ] **Step 2: Run it, confirm failure, implement**

Run: `cd ~/verifywise/Servers && npm run test:unit -- services/biasAudit/stance/compose.test.ts`
Expected: FAIL first.

`REQUIRED_SECTIONS` is the fixed list the checker enforces:

```ts
export const REQUIRED_SECTIONS = [
  "scope", "party", "basis", "what_was_tested", "results",
  "open_items", "independence", "expiry", "data_relied_on",
] as const;
```

- [ ] **Step 3: Run the test, then commit**

Expected: PASS, 15 tests.

```bash
cd ~/verifywise
git add Servers/services/biasAudit/stance/
git commit -m "Add stance composition

A fixed nine-section list enforced by a constant, because six sections
once went missing from a report drafted from scratch and independence,
the 5-300 requirement, was among them.

The stance quotes the customer's own words on every veto and attributes
the scope determination to them, since writing our inference back as the
client's statement is a named failure that put a false sentence in a
signed report. Impact ratios carry the provenance of 0.80 as the EEOC
convention the statute does not adopt, and a flagged ratio is reported as
a finding rather than a failure.

An out-of-scope run produces a document headed Scope determination with
no ratios and no score, which must not read as a clearance."
```

---

### Task 11: Stance PDF and immutability

**Files:**
- Create: `Servers/services/biasAudit/stance/template.ejs`
- Create: `Servers/services/biasAudit/stance/render.ts`
- Create: `Servers/services/biasAudit/stance/sectionChecker.ts`
- Test: `Servers/services/biasAudit/stance/render.test.ts`

**Interfaces:**
- Consumes: Task 10's `StanceModel`, `REQUIRED_SECTIONS`; Task 3's stance queries.
- Produces:
  - `checkSections(html: string): { missing: string[]; ok: boolean }`
  - `renderStanceHtml(model: StanceModel): string`
  - `renderStancePdf(model: StanceModel): Promise<{ pdf: Buffer; sha256: string }>`
  - `persistStance(args): Promise<{ stanceId: number; version: number; sha256: string }>`

- [ ] **Step 1: Write the failing test**

```ts
const utils = { createStanceQuery: jest.fn(), getNextStanceVersionQuery: jest.fn() };
jest.mock("../../../utils/biasAudit.utils", () => utils);

jest.mock("playwright", () => ({
  chromium: {
    launch: jest.fn().mockResolvedValue({
      newPage: jest.fn().mockResolvedValue({
        setContent: jest.fn(),
        pdf: jest.fn().mockResolvedValue(Buffer.from("%PDF-1.4 fake")),
        close: jest.fn(),
      }),
      close: jest.fn(),
    }),
  },
}));

import { checkSections, renderStancePdf } from "./render";
import { REQUIRED_SECTIONS } from "./compose";

const model: any = {
  heading: "Bias testing result",
  scope: "in_scope",
  sections: REQUIRED_SECTIONS.map((k) => ({ key: k, title: k, body: `body of ${k}` })),
  blankFields: [{ field: "distribution_date", instruction: "To be completed by the deploying employer." }],
  openItems: ["Whether the input is transformed before scoring"],
  expiry: { date: "2027-10-14", trigger: "Ends when characteristics are captured." },
  attestation: { user: "A. Admin", date: "2026-10-14" },
};

describe("checkSections", () => {
  it("passes when every required section is present", () => {
    const html = REQUIRED_SECTIONS.map((k) => `<section data-key="${k}"></section>`).join("");
    expect(checkSections(html)).toEqual({ missing: [], ok: true });
  });

  it("names the missing sections", () => {
    const html = '<section data-key="scope"></section>';
    const out = checkSections(html);
    expect(out.ok).toBe(false);
    expect(out.missing).toContain("independence");
  });
});

describe("renderStancePdf", () => {
  it("returns a buffer and its sha256", async () => {
    const out = await renderStancePdf(model);
    expect(out.pdf).toBeInstanceOf(Buffer);
    expect(out.sha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it("refuses to render when a required section is absent", async () => {
    const broken = { ...model, sections: model.sections.slice(0, 2) };
    await expect(renderStancePdf(broken)).rejects.toThrow(/missing required section/i);
  });

  // No determinism test on the PDF bytes. Playwright is mocked here and
  // returns a fixed buffer, so such a test would pass without verifying
  // anything, and a real PDF embeds a creation timestamp and is not
  // byte-deterministic anyway. The HTML is what we can pin:
  it("renders the same HTML for the same model", async () => {
    const { renderStanceHtml } = await import("./render");
    expect(renderStanceHtml(model)).toBe(renderStanceHtml(model));
  });
});

describe("persistStance immutability", () => {
  // Review Focus 5
  it("denormalises the versions so the stance stays readable", async () => {
    const { persistStance } = await import("./render");
    utils.getNextStanceVersionQuery.mockResolvedValue(2);
    utils.createStanceQuery.mockResolvedValue({ id: 9, version: 2 });
    await persistStance({
      runId: 11, projectId: 7, organizationId: 42, userId: 9,
      model, profileVersion: 2, questionSetVersion: 1, scoreAtGeneration: 72,
    } as any);
    const row = utils.createStanceQuery.mock.calls[0][0];
    expect(row.profileVersion).toBe(2);
    expect(row.questionSetVersion).toBe(1);
    expect(row.version).toBe(2);
  });

  it("never updates: a regenerate inserts the next version", async () => {
    const { persistStance } = await import("./render");
    utils.getNextStanceVersionQuery.mockResolvedValue(3);
    utils.createStanceQuery.mockResolvedValue({ id: 10, version: 3 });
    const out = await persistStance({
      runId: 11, projectId: 7, organizationId: 42, userId: 9,
      model, profileVersion: 2, questionSetVersion: 1, scoreAtGeneration: 72,
    } as any);
    expect(out.version).toBe(3);
    expect(Object.keys(utils)).not.toContain("updateStanceQuery");
  });
});
```

- [ ] **Step 2: Run it, confirm failure, implement**

Write `template.ejs` emitting `<section data-key="...">` per section, the blank fields as visibly empty bordered boxes with their instruction, and a footer line stating that the document is not a Local Law 144 bias audit. `render.ts` runs `checkSections` on the rendered HTML and throws before launching the browser if anything is missing.

- [ ] **Step 3: Run the test, then commit**

Expected: PASS, 7 tests.

```bash
cd ~/verifywise
git add Servers/services/biasAudit/stance/
git commit -m "Render the stance PDF with a section gate and immutable storage

Rendering refuses when a required section is absent, checked on the
rendered HTML rather than on the model, so a template change cannot drop
a section silently. Uses ejs and playwright as libraries without
importing the reporting subsystem.

Stances are insert-only: a regenerate writes the next version and the
prior one stays readable, with the profile and question-set versions
denormalised onto the row so a stance remains interpretable if the run it
came from is later removed. An unmatched checksum is unresolvable after
the fact, which is why the hash is recorded at generation."
```

---

### Task 12: Routes, controller, and the module-wide assertions

**Files:**
- Create: `Servers/controllers/biasAudit.ctrl.ts`
- Create: `Servers/routes/biasAudit.route.ts`
- Modify: `Servers/app.ts` (register the route)
- Test: `Servers/routes/__tests__/biasAudit.route.test.ts`
- Test: `Servers/services/biasAudit/__tests__/moduleRules.test.ts`

**Interfaces:**
- Consumes: Tasks 4, 9, 10, 11.
- Produces: `GET/PUT /api/bias-audit/profiles/:projectId/:frameworkId`, `POST .../attest`, `POST /api/bias-audit/runs`, `GET /api/bias-audit/runs/:id`, `POST /api/bias-audit/runs/:id/stance`, `GET /api/bias-audit/questions/:frameworkId`.

- [ ] **Step 1: Write the failing route test**

Create `Servers/routes/__tests__/biasAudit.route.test.ts`. Follow the harness used by the
existing route tests in that directory: `grep -l "supertest" Servers/routes/__tests__/*.ts | head -1`
and copy its app-construction and auth-mock setup, rather than inventing one.

```ts
import request from "supertest";
import app from "../../app";

// Mirror the auth mock from the existing route tests in this directory.
const asRole = (roleId: number) => ({
  Authorization: `Bearer test-token-role-${roleId}`,
});
const ADMIN = asRole(1);
const EDITOR = asRole(3);
const REVIEWER = asRole(2);

describe("GET /api/bias-audit/questions/:frameworkId", () => {
  it("401s without auth", async () => {
    const res = await request(app).get("/api/bias-audit/questions/15");
    expect(res.status).toBe(401);
  });

  it("returns only the applicable questions for the answers so far", async () => {
    const res = await request(app)
      .get("/api/bias-audit/questions/15?projectId=7")
      .set(ADMIN);
    expect(res.status).toBe(200);
    const keys = res.body.questions.map((q: any) => q.key);
    expect(keys).toContain("role.party");
    // Nothing conditional on a later answer is offered yet.
    expect(keys).not.toContain("cutoff.planned");
  });

  it("never returns another organization's project", async () => {
    const res = await request(app)
      .get("/api/bias-audit/questions/15?projectId=999999")
      .set(ADMIN);
    expect(res.status).toBe(404);
  });
});

describe("PUT /api/bias-audit/profiles/:projectId/:frameworkId", () => {
  it("permits an Editor to draft", async () => {
    const res = await request(app)
      .put("/api/bias-audit/profiles/7/15")
      .send({ answers: [{ questionKey: "role.party", value: "vendor",
                          notes: "We supply it.", dontKnow: false }] })
      .set(EDITOR);
    expect(res.status).toBe(200);
  });

  it("403s a Reviewer attempting to draft", async () => {
    const res = await request(app)
      .put("/api/bias-audit/profiles/7/15")
      .send({ answers: [] })
      .set(REVIEWER);
    expect(res.status).toBe(403);
  });

  it("400s a veto answer with no notes", async () => {
    const res = await request(app)
      .put("/api/bias-audit/profiles/7/15")
      .send({ answers: [{ questionKey: "role.party", value: "vendor",
                          notes: "", dontKnow: false }] })
      .set(ADMIN);
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/own words|notes/i);
  });

  it("ignores an organization_id in the body", async () => {
    const res = await request(app)
      .put("/api/bias-audit/profiles/7/15")
      .send({ organizationId: 999999,
              answers: [{ questionKey: "role.party", value: "vendor",
                          notes: "x", dontKnow: false }] })
      .set(ADMIN);
    expect([200, 400]).toContain(res.status);
    expect(JSON.stringify(res.body)).not.toContain("999999");
  });
});

describe("POST /api/bias-audit/profiles/:projectId/:frameworkId/attest", () => {
  it("403s an Editor", async () => {
    const res = await request(app)
      .post("/api/bias-audit/profiles/7/15/attest").set(EDITOR);
    expect(res.status).toBe(403);
  });

  it("400s with a veto unanswered, and names which", async () => {
    const res = await request(app)
      .post("/api/bias-audit/profiles/7/15/attest").set(ADMIN);
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/scope\.weighting|data\.held|unanswered/i);
  });
});

describe("POST /api/bias-audit/runs", () => {
  it("400s when no attested profile exists", async () => {
    const res = await request(app)
      .post("/api/bias-audit/runs")
      .send({ projectId: 7, frameworkId: 15, csv: "a,b\n1,2\n", mapping: {} })
      .set(ADMIN);
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/attested profile/i);
  });
});

- [ ] **Step 2: Write the module-rules test**

```ts
import fs from "node:fs";
import path from "node:path";

const ROOTS = [
  path.resolve(__dirname, "../../../services/biasAudit"),
  path.resolve(__dirname, "../../../structures/NYC-Local-Law-144"),
];

function files(): string[] {
  const out: string[] = [];
  const walk = (d: string) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) { if (e.name !== "__fixtures__") walk(p); }
      else if (/\.(ts|ejs)$/.test(e.name) && !e.name.endsWith(".test.ts")) out.push(p);
    }
  };
  ROOTS.filter(fs.existsSync).forEach(walk);
  return out;
}

describe("module rules", () => {
  const all = files();

  it("imports nothing from another VerifyWise module", () => {
    const bad = /from\s+["'][^"']*(EvalServer|AIGateway|EvaluationModule|GRSModule|services\/reporting)/;
    expect(all.filter((f) => bad.test(fs.readFileSync(f, "utf8")))).toEqual([]);
  });

  it("never uses forbidden vocabulary in source or templates", () => {
    const offenders: string[] = [];
    for (const f of all) {
      const src = fs.readFileSync(f, "utf8").toLowerCase();
      for (const w of ["compliant", "certified", "bias-free"]) {
        if (src.includes(w)) offenders.push(`${path.basename(f)}: ${w}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("names no client anywhere", () => {
    const offenders: string[] = [];
    for (const f of all) {
      const src = fs.readFileSync(f, "utf8").toLowerCase();
      for (const n of ["client-c", "client-a", "client-b"]) {
        if (src.includes(n)) offenders.push(`${path.basename(f)}: ${n}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("filters every raw query on organization_id", () => {
    const utilsFile = path.resolve(__dirname, "../../../utils/biasAudit.utils.ts");
    const src = fs.readFileSync(utilsFile, "utf8");
    const statements = src.match(/sequelize\.query\(\s*`[^`]+`/g) ?? [];
    expect(statements.length).toBeGreaterThan(4);
    const missing = statements.filter((s) => !/organization_id/.test(s));
    expect(missing).toEqual([]);
  });
});
```

- [ ] **Step 3: Implement the controller and routes**

Register in `app.ts` beside the existing routes, following the `app.use("/api/...", ...)`
pattern already there. Apply `authenticateJWT` to the router so the generator emits
`security: [bearerAuth: []]`, per `Servers/CLAUDE.md:170-173`.

Permissions, per the spec's attestation section:

| Action | Roles |
| --- | --- |
| Read questions, profile, runs, stances | any authenticated role |
| Draft answers (`PUT .../profiles/...`) | Admin (1) or Editor (3) |
| Attest (`POST .../attest`) | Admin (1) only |

Reviewer (2) and Auditor (4) are read-only here. Note the platform's Auditor role is unrelated
to the § 5-300 sense of auditor and confers nothing about independence.

Use the project's existing role-guard middleware rather than comparing role ids inline; find it
with `grep -rn "roleId" Servers/middleware/ | head`.

All handlers read `organization_id` from the auth context, never from the request body.

- [ ] **Step 4: Regenerate the API surface**

`Servers/CLAUDE.md:164-204` makes this mandatory: the Express route layer is the single source
of truth, and `Servers/swagger.yaml` plus `docs/api-docs/src/config/endpoints.ts` are generated
from it and must never be hand-edited. `check:api-drift` fails CI if this is skipped.

```bash
cd ~/verifywise/Servers
npm run generate:swagger
npm run generate:endpoints
npm run check:api-drift
```

Expected: no drift. Commit the regenerated files with the route change, in the same commit.

- [ ] **Step 5: Run the full module suite, build and lint**

```bash
cd ~/verifywise/Servers
npm run test:unit -- services/biasAudit structures/NYC-Local-Law-144 utils/biasAudit.utils.test.ts routes/__tests__/biasAudit.route.test.ts
npm run build && npm run lint
```

Expected: all pass. Record the count for the commit message.

- [ ] **Step 6: Commit**

```bash
cd ~/verifywise
git add Servers/controllers/biasAudit.ctrl.ts Servers/routes/biasAudit.route.ts Servers/app.ts Servers/routes/__tests__/ Servers/services/biasAudit/__tests__/ Servers/swagger.yaml docs/api-docs/src/config/endpoints.ts
git commit -m "Add bias audit routes and module-wide rule assertions

Six endpoints on the four-layer pattern. organization_id comes from the
auth context and never from the body; attestation requires Admin, since
the four vetoes are legal determinations about the customer's own
position.

Four module rules are asserted by test rather than left to review: no
import from another VerifyWise module including the reporting subsystem,
no forbidden vocabulary in source or templates, no client named anywhere,
and every raw query filtered on organization_id."
```

---

### Task 13: The customer-facing pages

**Files:**
- Create: `Clients/src/presentation/pages/BiasAudit/index.tsx`
- Create: `Clients/src/presentation/pages/BiasAudit/ProfileWizard.tsx`
- Create: `Clients/src/presentation/pages/BiasAudit/RunUpload.tsx`
- Create: `Clients/src/presentation/pages/BiasAudit/StancePanel.tsx`
- Create: `Clients/src/presentation/pages/BiasAudit/EducationPanel.tsx`
- Create: `Clients/src/infrastructure/api/biasAuditService.ts`
- Modify: `Clients/src/application/config/routes.tsx` to register the page and add the sidebar entry (this is where `EvalsDashboard` is registered; follow that entry's shape)
- Test: `Clients/src/presentation/pages/BiasAudit/__tests__/ProfileWizard.test.tsx`
- Test: `Clients/src/presentation/pages/BiasAudit/__tests__/EducationPanel.test.tsx`

**Interfaces:**
- Consumes: Task 12's endpoints; Task 8's `EDUCATION`.
- Produces: the sidebar page.

- [ ] **Step 1: Write the failing education-panel test**

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import EducationPanel from "../EducationPanel";

describe("EducationPanel", () => {
  it("renders all three elements for a page", () => {
    render(<EducationPanel pageKey="results.figures" />);
    expect(screen.getByText(/what this page decides/i)).toBeInTheDocument();
    expect(screen.getByText(/why the law cares/i)).toBeInTheDocument();
    expect(screen.getByText(/what goes wrong/i)).toBeInTheDocument();
  });

  it("shows the statutory references", () => {
    render(<EducationPanel pageKey="results.figures" />);
    expect(screen.getByText(/5-301\(c\)/)).toBeInTheDocument();
  });

  it("renders nothing rather than throwing for an unknown page", () => {
    const { container } = render(<EducationPanel pageKey="nope" />);
    expect(container).toBeEmptyDOMElement();
  });
});
```

- [ ] **Step 2: Write the failing wizard test**

Cover: consequence text visible beside each option before selection; notes required on veto questions; "I don't know" offered only where allowed; conditional questions appearing and disappearing; attest disabled while a veto is unanswered, with the reason named.

- [ ] **Step 3: Implement the components**

Reuse the project's own components rather than raw MUI: `CustomizableButton`, `SearchBox`,
`PageHeader`, `EmptyState` and `HelperIcon`, as
`Clients/src/presentation/pages/EvalsDashboard/BiasAuditsList.tsx` does. Sentence case
throughout, border `#d0d5dd`, radius 4px, control height 30px, primary `#13715B`.

`EducationPanel` renders on every page. The wizard shows each option's `consequence` inline
beside the option rather than behind a tooltip.

**This module does not touch the Evals dashboard.** The existing bias audit there stays as it
is and keeps its own sidebar entry; the two coexist deliberately. Do not rewire, link or
deprecate it from any task in this plan.

- [ ] **Step 4: Run the client tests and typecheck**

```bash
cd ~/verifywise/Clients
npx vitest run src/presentation/pages/BiasAudit
npm run typecheck
```

- [ ] **Step 5: Commit**

```bash
cd ~/verifywise
git add Clients/src/presentation/pages/BiasAudit/ Clients/src/infrastructure/api/biasAuditService.ts
git commit -m "Add the bias audit module pages

A sidebar module with the profile wizard, the upload and run view, and
the stance panel. Each option's consequence is shown inline beside it
before the customer answers, not behind a tooltip: stating the
consequence in the question is what produced usable answers first time
on a real engagement.

The education panel renders on every page with its three elements. Attest
is disabled while any veto is unanswered and names which, rather than
failing on submit."
```

---

### Task 13b: The trend view

Ratios across runs, segmented so a comparison nobody established is never drawn.

**Files:**
- Create: `Servers/services/biasAudit/trendSeries.ts`
- Create: `Clients/src/presentation/pages/BiasAudit/RatioTrend.tsx`
- Test: `Servers/services/biasAudit/trendSeries.test.ts`
- Test: `Clients/src/presentation/pages/BiasAudit/__tests__/RatioTrend.test.tsx`

**Interfaces:**
- Consumes: `bias_audit_runs` rows (Task 3), `BiasAuditResult` (plan 1 Task 5).
- Produces:
  - `interface TrendPoint { runId: number; date: string; category: string; lowestRatio: number | null; flagged: boolean }`
  - `interface TrendSegment { profileVersion: number; questionSetVersion: number; jobDescriptionKey: string | null; points: TrendPoint[] }`
  - `interface TrendBreak { afterRunId: number; reasons: string[] }`
  - `interface TrendSeries { segments: TrendSegment[]; breaks: TrendBreak[] }`
  - `buildTrendSeries(runs: TrendRunRow[]): TrendSeries`

- [ ] **Step 1: Write the failing series test**

```ts
import { buildTrendSeries } from "./trendSeries";

const run = (
  id: number, date: string, profileVersion: number,
  lowest: number, opts: Partial<{ questionSetVersion: number; jobDescriptionKey: string | null; metric: string }> = {},
) => ({
  id,
  created_at: date,
  profile_version: profileVersion,
  question_set_version: opts.questionSetVersion ?? 1,
  job_description_key: opts.jobDescriptionKey ?? "commercial-ae",
  metric: opts.metric ?? "selection_rate",
  result_json: {
    tables: [{
      categoryKey: "sex",
      rows: [
        { categoryName: "Male", impactRatio: 1, flagged: false },
        { categoryName: "Female", impactRatio: lowest, flagged: lowest < 0.8 },
      ],
    }],
  },
});

describe("one unbroken series", () => {
  const series = buildTrendSeries([
    run(1, "2026-01-10", 1, 0.95),
    run(2, "2026-04-10", 1, 0.91),
    run(3, "2026-07-10", 1, 0.88),
  ]);

  it("returns a single segment when nothing changed", () => {
    expect(series.segments).toHaveLength(1);
    expect(series.segments[0].points.map((p) => p.runId)).toEqual([1, 2, 3]);
    expect(series.breaks).toEqual([]);
  });

  it("carries the lowest ratio per category per run", () => {
    expect(series.segments[0].points.map((p) => p.lowestRatio)).toEqual([0.95, 0.91, 0.88]);
  });

  it("orders points oldest first", () => {
    const dates = series.segments[0].points.map((p) => p.date);
    expect([...dates].sort()).toEqual(dates);
  });
});

describe("a break is drawn rather than a line", () => {
  it("segments on a profile version change and names it", () => {
    const series = buildTrendSeries([
      run(1, "2026-01-10", 1, 0.95),
      run(2, "2026-04-10", 2, 0.72),
    ]);
    expect(series.segments).toHaveLength(2);
    expect(series.breaks).toHaveLength(1);
    expect(series.breaks[0].afterRunId).toBe(1);
    expect(series.breaks[0].reasons).toContain("the AEDT profile was changed");
  });

  it("segments on a job description change and names it", () => {
    const series = buildTrendSeries([
      run(1, "2026-01-10", 1, 0.95),
      run(2, "2026-04-10", 1, 0.93, { jobDescriptionKey: "operational-hourly" }),
    ]);
    expect(series.segments).toHaveLength(2);
    expect(series.breaks[0].reasons).toContain("a different job description was tested");
  });

  it("segments on a question set change", () => {
    const series = buildTrendSeries([
      run(1, "2026-01-10", 1, 0.95),
      run(2, "2026-04-10", 1, 0.93, { questionSetVersion: 2 }),
    ]);
    expect(series.breaks[0].reasons).toContain("the question set was revised");
  });

  it("segments on a metric change", () => {
    const series = buildTrendSeries([
      run(1, "2026-01-10", 1, 0.95),
      run(2, "2026-04-10", 1, 0.93, { metric: "scoring_rate" }),
    ]);
    expect(series.breaks[0].reasons).toContain(
      "the measure changed between a selection rate and a scoring rate",
    );
  });

  it("names every simultaneous reason on one break", () => {
    const series = buildTrendSeries([
      run(1, "2026-01-10", 1, 0.95),
      run(2, "2026-04-10", 2, 0.93, { jobDescriptionKey: "operational-hourly", metric: "scoring_rate" }),
    ]);
    expect(series.breaks[0].reasons).toHaveLength(3);
  });
});

describe("runs that cannot contribute a point", () => {
  it("skips a run with no result, without breaking the series", () => {
    const blocked = { ...run(2, "2026-04-10", 1, 0.9), result_json: null };
    const series = buildTrendSeries([run(1, "2026-01-10", 1, 0.95), blocked, run(3, "2026-07-10", 1, 0.9)]);
    expect(series.segments).toHaveLength(1);
    expect(series.segments[0].points.map((p) => p.runId)).toEqual([1, 3]);
  });

  it("carries a null ratio where every ratio in a table was null", () => {
    const degenerate = {
      ...run(2, "2026-04-10", 1, 0.9),
      result_json: { tables: [{ categoryKey: "sex", rows: [
        { categoryName: "Male", impactRatio: null, flagged: false },
        { categoryName: "Female", impactRatio: null, flagged: false },
      ] }] },
    };
    const series = buildTrendSeries([run(1, "2026-01-10", 1, 0.95), degenerate]);
    const pts = series.segments[0].points;
    expect(pts[1].lowestRatio).toBeNull();
  });

  it("returns an empty series for no runs", () => {
    expect(buildTrendSeries([])).toEqual({ segments: [], breaks: [] });
  });

  it("returns one segment and no break for a single run", () => {
    const series = buildTrendSeries([run(1, "2026-01-10", 1, 0.95)]);
    expect(series.segments).toHaveLength(1);
    expect(series.breaks).toEqual([]);
  });
});

describe("excluded groups never become the lowest point", () => {
  it("ignores a row excluded under 5-301(d)", () => {
    const withExcluded = {
      ...run(1, "2026-01-10", 1, 0.95),
      result_json: { tables: [{ categoryKey: "sex", rows: [
        { categoryName: "Male", impactRatio: 1, flagged: false },
        { categoryName: "Female", impactRatio: 0.95, flagged: false },
        { categoryName: "Unknown", impactRatio: null, flagged: false, excluded: true },
      ] }] },
    };
    const series = buildTrendSeries([withExcluded]);
    expect(series.segments[0].points[0].lowestRatio).toBe(0.95);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd ~/verifywise/Servers && npm run test:unit -- services/biasAudit/trendSeries.test.ts`
Expected: FAIL, cannot find module `./trendSeries`.

- [ ] **Step 3: Write the implementation**

```ts
/**
 * Ratios across runs, segmented wherever a comparison is not supported.
 *
 * A smooth line across a changed profile, job description, question set or
 * metric asserts comparability that nobody established. Comparability was the
 * whole argument that made a prior finding attributable: a corpus measured each
 * race twice, roughly 2,500 ID positions apart, and the two halves agreeing at
 * r = +0.9324 is what showed the ordering was not an artifact of position. A
 * trend line that quietly spans a configuration change claims the same kind of
 * thing without the evidence.
 *
 * So the series breaks and the break is labelled with what changed. A gap the
 * customer has to explain is preferable to a line they will misread.
 */
const BREAK_REASONS = {
  profileVersion: "the AEDT profile was changed",
  questionSetVersion: "the question set was revised",
  jobDescriptionKey: "a different job description was tested",
  metric: "the measure changed between a selection rate and a scoring rate",
} as const;
```

Walk the runs oldest first. Start a segment; for each subsequent run compare the four keys
against the current segment's, and where any differ close the segment, record a break naming
every differing key, and start a new one. A run whose `result_json` is null contributes no
point and does **not** break the series: a blocked run is an absence of measurement, not a
change of configuration.

`lowestRatio` is the minimum non-null `impactRatio` across all tables, skipping rows marked
`excluded`, since an excluded group has no ratio to be lowest.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd ~/verifywise/Servers && npm run test:unit -- services/biasAudit/trendSeries.test.ts`
Expected: PASS, 13 tests.

- [ ] **Step 5: Write the failing component test**

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import RatioTrend from "../RatioTrend";

const oneSegment = {
  segments: [{
    profileVersion: 1, questionSetVersion: 1, jobDescriptionKey: "commercial-ae",
    points: [
      { runId: 1, date: "2026-01-10", category: "sex", lowestRatio: 0.95, flagged: false },
      { runId: 2, date: "2026-04-10", category: "sex", lowestRatio: 0.88, flagged: false },
    ],
  }],
  breaks: [],
};

const twoSegments = {
  segments: [
    { ...oneSegment.segments[0] },
    { profileVersion: 2, questionSetVersion: 1, jobDescriptionKey: "commercial-ae",
      points: [{ runId: 3, date: "2026-07-10", category: "sex", lowestRatio: 0.72, flagged: true }] },
  ],
  breaks: [{ afterRunId: 2, reasons: ["the AEDT profile was changed"] }],
};

describe("RatioTrend", () => {
  it("renders a point per run", () => {
    render(<RatioTrend series={oneSegment} />);
    expect(screen.getByText(/0\.95/)).toBeInTheDocument();
    expect(screen.getByText(/0\.88/)).toBeInTheDocument();
  });

  it("shows the break and what changed", () => {
    render(<RatioTrend series={twoSegments} />);
    expect(screen.getByText(/the AEDT profile was changed/i)).toBeInTheDocument();
  });

  it("says why the series is not joined across the break", () => {
    render(<RatioTrend series={twoSegments} />);
    expect(screen.getByText(/not comparable|cannot be compared/i)).toBeInTheDocument();
  });

  it("states that 0.80 is a convention wherever it marks the axis", () => {
    render(<RatioTrend series={oneSegment} />);
    if (screen.queryByText(/0\.80/)) {
      expect(screen.getByText(/convention|four-fifths/i)).toBeInTheDocument();
    }
  });

  it("renders an empty state for a single run rather than a one-point chart", () => {
    render(<RatioTrend series={{ segments: [oneSegment.segments[0]], breaks: [] }} />);
    expect(screen.queryByText(/not enough runs|one run/i) ?? screen.getByText(/0\.95/))
      .toBeInTheDocument();
  });

  it("uses no forbidden vocabulary", () => {
    render(<RatioTrend series={twoSegments} />);
    const text = document.body.textContent!.toLowerCase();
    for (const w of ["compliant", "certified", "bias-free", "passed"]) {
      expect(text).not.toContain(w);
    }
  });
});
```

- [ ] **Step 6: Implement the component**

`recharts`, which is the house choice at 11 usages across `Clients/src`. One `<Line>` per
segment on a shared axis, with a `<ReferenceLine>` at each break carrying its reasons as the
label. Segments must not be joined: render them as separate `Line` series rather than one
series with a gap, so no interpolation is drawn across a break.

A 0.80 reference line is optional; if drawn, its label states that it is the EEOC four-fifths
convention and that the statute does not adopt it. Reuse `PageHeader` and `EmptyState` as the
other pages do.

Render it on the project's bias module page beneath the stance panel, with
`EducationPanel pageKey="results.figures"` already present there covering the ratio reading.

- [ ] **Step 7: Run both test files**

```bash
cd ~/verifywise/Servers && npm run test:unit -- services/biasAudit/trendSeries.test.ts
cd ~/verifywise/Clients && npx vitest run src/presentation/pages/BiasAudit/__tests__/RatioTrend.test.tsx
```

- [ ] **Step 8: Commit**

```bash
cd ~/verifywise
git add Servers/services/biasAudit/trendSeries.ts Servers/services/biasAudit/trendSeries.test.ts Clients/src/presentation/pages/BiasAudit/RatioTrend.tsx Clients/src/presentation/pages/BiasAudit/__tests__/
git commit -m "Add the ratio trend view, segmented at configuration changes

Shows the lowest impact ratio per run over time, broken wherever the
profile version, question set, job description or metric changed, with
each break labelled with what changed.

A smooth line across a configuration change asserts comparability nobody
established. Comparability was the whole argument that made a prior
finding attributable: a corpus measured each race twice around 2,500 ID
positions apart, and the halves agreeing at r=+0.9324 is what showed the
ordering was not an artifact of position. A trend line spanning a changed
profile claims the same kind of thing with none of the evidence.

Segments render as separate series rather than one series with a gap, so
no interpolation is drawn across a break. A blocked run contributes no
point and does not break the series: an absence of measurement is not a
change of configuration. Excluded groups never become the lowest point,
since a group excluded under 5-301(d) has no ratio."
```

---

### Task 14: Verification

**Files:**
- Create: `Servers/services/biasAudit/README.md` (extend plan 1's)

- [ ] **Step 1: Run everything**

```bash
cd ~/verifywise/Servers && npm run test:unit -- services/biasAudit structures/NYC-Local-Law-144 utils/biasAudit.utils.test.ts routes/__tests__/biasAudit.route.test.ts && npm run build && npm run lint
cd ~/verifywise/Clients && npx vitest run src/presentation/pages/BiasAudit && npm run typecheck && npm run lint
```

- [ ] **Step 2: Confirm independence with EvalServer absent**

```bash
cd ~/verifywise && mv EvalServer /tmp/ES && cd Servers && npm run test:unit -- services/biasAudit; S=$?; cd ~/verifywise && mv /tmp/ES EvalServer && echo "status: $S"
```

Expected: 0.

- [ ] **Step 3: Walk the journey manually**

Start the app, create a project with the LL 144 framework, and check: the four vetoes block the score with their names shown; "one of several" short-circuits to a scope determination; a vendor answer produces the blank distribution-date field; an upload with a mapped column absent names the mapping; a flagged ratio appears as a finding with the 0.80 provenance stated; the stance PDF downloads and regenerating produces version 2.

- [ ] **Step 4: Extend the README and commit**

```bash
cd ~/verifywise
git add Servers/services/biasAudit/README.md
git commit -m "Document the intake, scoring and stance layers

Extends the module README with the question tiers, the gate split
between a deliverable and the whole stance, the basis-derived expiry, and
the stance's fixed section list.

Verified with EvalServer moved out of the tree: the suite passes."
```

---

## Self-review

**Spec coverage.** Trend view → Task 13b. Intake question set → Task 1. Four tables and migrations → Task 2. Models and tenant queries → Task 3. Append-only profiles and attestation → Task 4. `appliesWhen` → Task 5. Readiness scoring → Task 6. Answer gates and consequences → Task 7. Education on every page → Tasks 8 and 13. Upload, parse and run → Task 9. Stance composition with the fixed section list → Task 10. PDF, section checker and immutability → Task 11. Routes, roles and module rules → Task 12. Pages → Task 13. Verification → Task 14.

Deferred to plan 3 by design: the two fixed job descriptions, generation, the criteria-comparison check. Task 1 defines the `generationField` markers plan 3 reads, and Task 7 defines the `generation` gate, so plan 3 adds no new intake structure.

**Placeholders.** Task 8's step 4 and Task 13's steps 2–3 describe content and components without writing every line. Both are the plan's weakest points. Task 8's example block establishes the required depth and the tests constrain the rest; Task 13's tests enumerate the behaviours. An implementer who writes shallow content will fail Task 8's length assertions.

**Type consistency.** `AnswerMap` defined in Task 5, used in 6, 7, 9, 10. `StanceConsequence` and `IntakeQuestion` defined in Task 1, used throughout. `ReadinessResult` from Task 6 into 9 and 10. `REQUIRED_SECTIONS` defined in Task 10, consumed by Task 11's checker. `runAudit`/`AuditOutcome` from plan 1, consumed in Task 9.

**Review Focus coverage.** 1 → Task 4 (new version rather than in-place edit). 2 → Tasks 3 and 4 (23505 translated). 3 → Task 6 (all don't-know scores 0 and still blocks). 4 → Task 9 (the mapping is named, not the data). 5 → Task 11 (versions denormalised onto the stance).

**One known weakness.** Task 12's route tests are specified by behaviour rather than written out, unlike every other task. If the executor is a subagent, that task should be split or its tests written before dispatch.
