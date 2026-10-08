# Intake EU AI Act risk classification step — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Use case intake forms can require a server-scored EU AI Act risk classification step, and the use case risk wizard uses the same corrected, server-side questionnaire.

**Architecture:** One backend module (`Servers/services/euAiActClassification/`) owns the questionnaire definition (declarative JSON, served to clients), answer validation and versioned scoring. Every completed questionnaire is stored as a run in a new tenant table `eu_ai_act_classifications`, owned by exactly one intake submission or one use case. The public intake form, the approval dialog and the in-app wizard all render the server definition and never score on the client.

**Tech Stack:** Node 22, Express 4, TypeScript, Sequelize 6 raw queries, PostgreSQL 16, Jest; React 19, MUI 7, Vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-10-08-intake-eu-ai-act-risk-step-design.md`

## Global constraints

- Branch per change, never commit to `develop`. Commit format `type(scope): description`.
- Multi-tenancy: every query on the new table filters `organization_id = :organizationId`; unqualified table names (`search_path = verifywise`); migrations use `verifywise.` qualified names.
- Backend gates (run from `Servers/`): `npx tsc --noEmit`, `npm run build` (delete `dist` **and** `.tsbuildinfo` first for a clean build), `npm run format-check`, `npm run i18n:audit:strict`, `npx jest <touched suites>`.
- Frontend gates (run from `Clients/`): `npm run typecheck`, `npm run format-check`, `npm run i18n:audit:strict`, `npx vitest run <touched dirs>` (never `npm run test`, it watches).
- New or changed routes: `cd Servers && npm run generate:swagger && npm run generate:endpoints && npm run check:api-drift`, and commit `Servers/swagger.yaml` and `docs/api-docs/src/config/endpoints.ts`.
- New org-scoped tables must be registered in `Servers/tests/integration/tenant-isolation/tenantIsolation.registry.ts` with an isolation test, or CI fails.
- UI: sentence case; VerifyWise components (`CustomizableButton` with `text=`, `Field`, `Select`, `Checkbox`, `Radio`, `StandardModal`, `Chip`); border `#d0d5dd`, radius 4px, primary `#13715B`; pixel spacing strings (`gap: "8px"`), never MUI numeric multipliers in new code.
- Client UI strings are translated by the DOM translator from `Clients/src/i18n/translations.ts`; every new JSX string needs `de`, `fr` and `es` entries. Backend messages passed to `req.t!()` or thrown as `ValidationException` need `Servers/locales/{en,de,fr}.json` entries.
- Level strings are exactly the `AiRiskClassification` values: `Prohibited`, `High risk`, `Limited risk`, `Minimal risk`, `Out of scope`.
- Dates (ISO): Article 5 and Article 4 `2025-02-02`; Omnibus bans `2026-12-02`; Article 50 `2026-08-02` (50(2) marking for systems already on the market by `2026-12-02`); Annex III `2027-12-02`; Annex I `2028-08-02`.
- Do not depend on PR #4903. Use the dedicated `setUseCaseClassificationQuery` (Task 4) instead of `updateProjectByIdQuery`.
- Never include competitor names in code, comments or commits.

## Review focus

1. **"Out of scope" silently becoming "Minimal risk".** `Clients/src/application/mappers/project.mapper.ts` maps unknown strings to Minimal. Expect the stored level to survive every read path → Task 3 adds a mapper test.
2. **Stale answers after "Back".** A user answers a prohibited practice, goes back and picks "None of these"; answers to now-hidden questions must not reach scoring or storage → Task 1 tests `validateAnswers` drops hidden answers; Task 9 tests the client helper.
3. **A public submitter tampering with the payload** (sending `level`, extra keys, a hidden question's answer, or `["none","manipulation"]`) → Task 7 tests that extra keys are rejected and that the stored result comes from the server.
4. **Approving a submission whose form no longer has the step, or that predates it.** The submission has no run; approval must behave exactly as today → Task 8 tests "no run → unchanged approval".
5. **Omnibus date boundary.** Scoring on 2026-12-01 vs 2026-12-02 must change only the reason text, not the level → Task 2 tests both sides with an injected `now`.

---

### Task 1: Questionnaire v2 definition, visibility and validation (backend, pure)

**Files:**
- Create: `Servers/services/euAiActClassification/types.ts`
- Create: `Servers/services/euAiActClassification/visibility.ts`
- Create: `Servers/services/euAiActClassification/questionnaire.v2.ts`
- Create: `Servers/services/euAiActClassification/validate.ts`
- Test: `Servers/services/euAiActClassification/__tests__/validate.test.ts`

**Interfaces:**
- Produces: types `ClassificationLevel`, `ClassificationRole`, `Question`, `Condition`, `Questionnaire`, `Answers`, `ClassificationReason`, `ClassificationResult`; `visibleQuestions(q: Questionnaire, a: Answers): Question[]`; `QUESTIONNAIRE_V2: Questionnaire`; `validateAnswers(q: Questionnaire, raw: unknown): { errors: string[]; answers: Answers }`.

- [ ] **Step 1: Create the types**

```ts
// Servers/services/euAiActClassification/types.ts
export type ClassificationLevel =
  | "Prohibited"
  | "High risk"
  | "Limited risk"
  | "Minimal risk"
  | "Out of scope";

export type ClassificationRole = "Provider" | "Deployer";

export interface QuestionOption {
  value: string;
  label: string;
  description?: string;
  /** Cannot be combined with other answers ("None of these"). */
  exclusive?: boolean;
}

/** Holds when the referenced question is answered and its answer matches. */
export interface Condition {
  questionId: string;
  anyOf?: string[];
  noneOf?: string[];
}

export interface Question {
  id: string;
  text: string;
  help?: string;
  articleRef: string;
  inputType: "single_select" | "multi_select";
  options: QuestionOption[];
  /** Shown when any group matches; a group matches when all its conditions hold. Omitted: always shown. */
  showWhen?: Condition[][];
}

export interface Questionnaire {
  version: number;
  questions: Question[];
}

export type Answers = Record<string, string | string[]>;

export interface ClassificationReason {
  article: string;
  text: string;
  appliesFrom?: string;
}

export interface ClassificationResult {
  questionnaireVersion: number;
  level: ClassificationLevel;
  role: ClassificationRole | null;
  reasons: ClassificationReason[];
  obligations: ClassificationReason[];
}
```

- [ ] **Step 2: Create the visibility helper**

```ts
// Servers/services/euAiActClassification/visibility.ts
import { Answers, Condition, Question, Questionnaire } from "./types";

const holds = (condition: Condition, answers: Answers): boolean => {
  const answer = answers[condition.questionId];
  const values = answer === undefined ? [] : Array.isArray(answer) ? answer : [answer];
  if (values.length === 0) return false;
  if (condition.anyOf && !values.some((v) => condition.anyOf!.includes(v))) return false;
  if (condition.noneOf && values.some((v) => condition.noneOf!.includes(v))) return false;
  return true;
};

/**
 * The questions to ask for these answers, in order. A hidden question's answer
 * is ignored, so a stale answer left after "Back" cannot reveal later questions.
 */
export const visibleQuestions = (questionnaire: Questionnaire, answers: Answers): Question[] => {
  const effective: Answers = {};
  const visible: Question[] = [];
  for (const question of questionnaire.questions) {
    const shown =
      !question.showWhen ||
      question.showWhen.some((group) => group.every((c) => holds(c, effective)));
    if (!shown) continue;
    visible.push(question);
    if (answers[question.id] !== undefined) effective[question.id] = answers[question.id];
  }
  return visible;
};
```

- [ ] **Step 3: Create the questionnaire definition**

```ts
// Servers/services/euAiActClassification/questionnaire.v2.ts
import { Condition, Question, Questionnaire } from "./types";

const YES_NO = [
  { value: "yes", label: "Yes" },
  { value: "no", label: "No" },
];
const OTHER = { value: "other", label: "Another use in this area" };
const NONE = { value: "none", label: "None of these", exclusive: true };

// Article 5 is cleared when no listed practice applies, real-time biometric
// identification is absent or authorised, and banned content is absent or
// safeguarded. Every combination is one group.
const NO_ART5_PRACTICE: Condition = { questionId: "art5_practices", anyOf: ["none"] };
const RBI_CLEARED: Condition[] = [
  { questionId: "rbi_law_enforcement", anyOf: ["no"] },
  { questionId: "rbi_objective", noneOf: ["none"] },
];
const CONTENT_CLEARED: Condition[] = [
  { questionId: "intimate_content", anyOf: ["no"] },
  { questionId: "intimate_content_safeguards", anyOf: ["yes"] },
];
const NOT_PROHIBITED: Condition[][] = RBI_CLEARED.flatMap((rbi) =>
  CONTENT_CLEARED.map((content) => [NO_ART5_PRACTICE, rbi, content]),
);
const withAll = (groups: Condition[][], extra: Condition[]) =>
  groups.map((group) => [...group, ...extra]);

/** Annex III follow-up question id → the answers that make the system high risk. */
export const ANNEX_III_HIGH_RISK_USES: Record<string, string[]> = {
  biometrics_use: ["remote_identification", "biometric_categorisation", "emotion_recognition"],
  critical_infrastructure_use: ["safety_component"],
  education_use: ["admission", "learning_outcomes", "education_level", "test_monitoring"],
  employment_use: ["recruitment", "work_relationship_decisions", "task_allocation_monitoring"],
  essential_services_use: [
    "public_assistance",
    "creditworthiness",
    "life_health_insurance",
    "emergency_triage",
  ],
  law_enforcement_use: [
    "victim_risk",
    "polygraph",
    "evidence_reliability",
    "offending_risk",
    "profiling",
  ],
  migration_use: ["polygraph", "risk_assessment", "application_examination", "identification"],
  justice_democracy_use: ["judicial_assistance", "election_influence"],
};

// Each property is named (not positional) so the translation-coverage test
// in Clients can find every user-facing string by its key.
const followUp = (def: {
  id: string;
  area: string;
  articleRef: string;
  text: string;
  options: Question["options"];
}): Question => ({
  id: def.id,
  text: def.text,
  articleRef: def.articleRef,
  inputType: "single_select",
  options: [...def.options, OTHER],
  showWhen: [[{ questionId: "annex_iii_areas", anyOf: [def.area] }]],
});

const QUESTIONS: Question[] = [
  {
    id: "scope",
    text: "Is the system developed and used only for scientific research and development, and not placed on the market or put into service?",
    articleRef: "Article 2(6) and 2(8)",
    inputType: "single_select",
    options: [
      { value: "research_only", label: "Yes, research and development only" },
      { value: "in_scope", label: "No, it is or will be placed on the market or used" },
    ],
  },
  {
    id: "role",
    text: "Are you the provider or the deployer of this AI system?",
    articleRef: "Article 3(3) and 3(4)",
    inputType: "single_select",
    options: [
      {
        value: "provider",
        label: "Provider",
        description:
          "We develop the system, or have it developed, and place it on the market or put it into service under our name.",
      },
      {
        value: "deployer",
        label: "Deployer",
        description: "We use the system under our authority in a professional activity.",
      },
    ],
    showWhen: [[{ questionId: "scope", anyOf: ["in_scope"] }]],
  },
  {
    id: "art5_practices",
    text: "Does the system do any of the following?",
    articleRef: "Article 5(1)(a)-(g)",
    inputType: "multi_select",
    options: [
      {
        value: "manipulation",
        label:
          "Uses subliminal, manipulative or deceptive techniques that materially distort people's behaviour and are likely to cause significant harm",
      },
      {
        value: "exploit_vulnerabilities",
        label:
          "Exploits vulnerabilities due to age, disability or a social or economic situation to materially distort behaviour in a way likely to cause significant harm",
      },
      {
        value: "social_scoring",
        label:
          "Evaluates or classifies people based on social behaviour or personal characteristics, leading to unjustified or unrelated detrimental treatment (social scoring)",
      },
      {
        value: "crime_prediction",
        label:
          "Assesses or predicts the risk of a person committing a criminal offence based solely on profiling or personality traits",
      },
      {
        value: "facial_scraping",
        label:
          "Creates or expands facial recognition databases through untargeted scraping of facial images from the internet or CCTV footage",
      },
      {
        value: "emotion_workplace_education",
        label:
          "Infers the emotions of people at work or in education institutions, other than for medical or safety reasons",
      },
      {
        value: "biometric_categorisation",
        label:
          "Categorises people using biometric data to deduce race, political opinions, trade union membership, religious or philosophical beliefs, sex life or sexual orientation",
      },
      NONE,
    ],
    showWhen: [[{ questionId: "role", anyOf: ["provider", "deployer"] }]],
  },
  {
    id: "rbi_law_enforcement",
    text: "Is the system used for real-time remote biometric identification of people in publicly accessible spaces for law enforcement?",
    articleRef: "Article 5(1)(h)",
    inputType: "single_select",
    options: YES_NO,
    showWhen: [[NO_ART5_PRACTICE]],
  },
  {
    id: "rbi_objective",
    text: "Is that use strictly necessary for one of these objectives, with the prior authorisation Article 5(3) requires?",
    articleRef: "Article 5(1)(h), 5(2) and 5(3)",
    inputType: "single_select",
    options: [
      {
        value: "victims_missing",
        label:
          "Targeted search for specific victims of abduction, trafficking in human beings or sexual exploitation, or for missing persons",
      },
      {
        value: "imminent_threat",
        label:
          "Preventing a specific, substantial and imminent threat to life or physical safety, or a genuine and present or foreseeable terrorist attack",
      },
      {
        value: "serious_crime_suspects",
        label:
          "Locating or identifying a person suspected of a serious criminal offence listed in Annex II, punishable by at least four years' custody",
      },
      { value: "none", label: "None of these, or no prior authorisation" },
    ],
    showWhen: [[{ questionId: "rbi_law_enforcement", anyOf: ["yes"] }]],
  },
  {
    id: "intimate_content",
    text: "Can the system generate or manipulate images, video or audio showing real people in intimate situations without their consent, or child sexual abuse material?",
    articleRef: "Article 5, as amended by Regulation (EU) 2026/1744",
    inputType: "single_select",
    options: YES_NO,
    showWhen: RBI_CLEARED.map((rbi) => [NO_ART5_PRACTICE, rbi]),
  },
  {
    id: "intimate_content_safeguards",
    text: "Does the provider apply safeguards that prevent the system from generating such content?",
    help: "Systems with adequate safeguards against generating this content are not covered by the ban.",
    articleRef: "Article 5, as amended by Regulation (EU) 2026/1744",
    inputType: "single_select",
    options: YES_NO,
    showWhen: [[{ questionId: "intimate_content", anyOf: ["yes"] }]],
  },
  {
    id: "safety_function",
    text: "Is the system itself a product, or does it perform a safety function in a product, covered by the EU product legislation listed in Annex I?",
    articleRef: "Article 6(1) and Annex I",
    inputType: "single_select",
    options: [
      {
        value: "section_a",
        label: "Yes: a product under Annex I Section A that needs a third-party conformity assessment",
        description:
          "For example medical devices, in vitro diagnostic devices, toys, lifts, radio equipment, pressure equipment or personal protective equipment.",
      },
      {
        value: "section_b",
        label: "Yes: a product under Annex I Section B",
        description:
          "Vehicles, aviation, marine equipment, rail systems, agricultural and forestry vehicles, or machinery.",
      },
      { value: "no", label: "No" },
    ],
    showWhen: NOT_PROHIBITED,
  },
  {
    id: "annex_iii_areas",
    text: "Is the system intended to be used in any of these areas?",
    articleRef: "Article 6(2) and Annex III",
    inputType: "multi_select",
    options: [
      { value: "biometrics", label: "Biometrics" },
      {
        value: "critical_infrastructure",
        label:
          "Critical infrastructure (digital infrastructure, road traffic, water, gas, heating or electricity supply)",
      },
      { value: "education", label: "Education and vocational training" },
      {
        value: "employment",
        label: "Employment, workers' management and access to self-employment",
      },
      {
        value: "essential_services",
        label:
          "Access to essential private and public services and benefits (public assistance, credit, insurance, emergency services)",
      },
      { value: "law_enforcement", label: "Law enforcement" },
      { value: "migration", label: "Migration, asylum and border control" },
      {
        value: "justice_democracy",
        label: "Administration of justice and democratic processes",
      },
      NONE,
    ],
    showWhen: withAll(NOT_PROHIBITED, [{ questionId: "safety_function", anyOf: ["no"] }]),
  },
  followUp({
    id: "biometrics_use",
    area: "biometrics",
    articleRef: "Annex III, point 1",
    text: "How is the system used in biometrics?",
    options: [
      { value: "remote_identification", label: "Remote biometric identification" },
      {
        value: "verification_only",
        label: "Verification only: confirming that a person is who they claim to be",
      },
      {
        value: "biometric_categorisation",
        label: "Categorising people by sensitive or protected attributes inferred from biometric data",
      },
      { value: "emotion_recognition", label: "Emotion recognition" },
    ],
  }),
  followUp({
    id: "critical_infrastructure_use",
    area: "critical_infrastructure",
    articleRef: "Annex III, point 2",
    text: "How is the system used in critical infrastructure?",
    options: [
      {
        value: "safety_component",
        label:
          "As a safety component in managing or operating critical digital infrastructure, road traffic, or the supply of water, gas, heating or electricity",
      },
    ],
  }),
  followUp({
    id: "education_use",
    area: "education",
    articleRef: "Annex III, point 3",
    text: "How is the system used in education?",
    options: [
      { value: "admission", label: "Deciding access or admission, or assigning people to institutions" },
      { value: "learning_outcomes", label: "Evaluating learning outcomes" },
      { value: "education_level", label: "Assessing the level of education a person will receive or access" },
      { value: "test_monitoring", label: "Monitoring and detecting prohibited behaviour during tests" },
    ],
  }),
  followUp({
    id: "employment_use",
    area: "employment",
    articleRef: "Annex III, point 4",
    text: "How is the system used in employment?",
    options: [
      {
        value: "recruitment",
        label: "Recruiting or selecting people, including targeted job ads and filtering or evaluating applications",
      },
      {
        value: "work_relationship_decisions",
        label: "Making decisions on terms of work, promotion or termination",
      },
      {
        value: "task_allocation_monitoring",
        label: "Allocating tasks based on behaviour or personal traits, or monitoring and evaluating performance",
      },
    ],
  }),
  followUp({
    id: "essential_services_use",
    area: "essential_services",
    articleRef: "Annex III, point 5",
    text: "How is the system used for essential services?",
    options: [
      {
        value: "public_assistance",
        label: "Evaluating eligibility for public assistance benefits and services",
      },
      { value: "creditworthiness", label: "Evaluating creditworthiness or establishing a credit score" },
      { value: "fraud_detection", label: "Detecting financial fraud" },
      {
        value: "life_health_insurance",
        label: "Risk assessment and pricing for life or health insurance",
      },
      {
        value: "emergency_triage",
        label: "Evaluating and classifying emergency calls, dispatching emergency services or emergency patient triage",
      },
    ],
  }),
  followUp({
    id: "law_enforcement_use",
    area: "law_enforcement",
    articleRef: "Annex III, point 6",
    text: "How is the system used in law enforcement?",
    options: [
      { value: "victim_risk", label: "Assessing the risk of a person becoming a victim of crime" },
      { value: "polygraph", label: "As a polygraph or similar tool" },
      { value: "evidence_reliability", label: "Evaluating the reliability of evidence" },
      {
        value: "offending_risk",
        label: "Assessing the risk of offending or re-offending, not solely based on profiling",
      },
      {
        value: "profiling",
        label: "Profiling people in the detection, investigation or prosecution of criminal offences",
      },
    ],
  }),
  followUp({
    id: "migration_use",
    area: "migration",
    articleRef: "Annex III, point 7",
    text: "How is the system used in migration, asylum or border control?",
    options: [
      { value: "polygraph", label: "As a polygraph or similar tool" },
      {
        value: "risk_assessment",
        label: "Assessing security, irregular migration or health risks posed by a person",
      },
      {
        value: "application_examination",
        label: "Examining applications for asylum, visas or residence permits",
      },
      { value: "identification", label: "Detecting, recognising or identifying people" },
      { value: "travel_document_verification", label: "Verifying travel documents" },
    ],
  }),
  followUp({
    id: "justice_democracy_use",
    area: "justice_democracy",
    articleRef: "Annex III, point 8",
    text: "How is the system used in justice or democratic processes?",
    options: [
      {
        value: "judicial_assistance",
        label: "Assisting a judicial authority, or alternative dispute resolution, in researching and interpreting facts and law",
      },
      {
        value: "election_influence",
        label: "Influencing the outcome of an election or referendum, or people's voting behaviour",
      },
      {
        value: "campaign_logistics",
        label: "Organising, optimising or structuring political campaigns administratively or logistically",
      },
    ],
  }),
  {
    id: "profiling",
    text: "Does the system profile people, meaning automated processing of personal data to evaluate aspects such as work performance, economic situation, health, preferences, interests, reliability, behaviour, location or movements?",
    articleRef: "Article 6(3), last subparagraph",
    inputType: "single_select",
    options: YES_NO,
    showWhen: Object.entries(ANNEX_III_HIGH_RISK_USES).map(([questionId, values]) => [
      { questionId, anyOf: values },
    ]),
  },
  {
    id: "derogation",
    text: "Does one of these describe the system, so that it does not materially influence the outcome of decisions?",
    articleRef: "Article 6(3)",
    inputType: "single_select",
    options: [
      { value: "narrow_procedural", label: "It performs a narrow procedural task" },
      {
        value: "improve_human_activity",
        label: "It improves the result of a previously completed human activity",
      },
      {
        value: "detect_patterns",
        label:
          "It detects decision-making patterns or deviations from prior patterns, without replacing or influencing the human assessment without proper human review",
      },
      {
        value: "preparatory_task",
        label: "It performs a preparatory task to an assessment relevant to the Annex III uses",
      },
      { value: "none", label: "None of these" },
    ],
    showWhen: [[{ questionId: "profiling", anyOf: ["no"] }]],
  },
  {
    id: "transparency",
    text: "Does the system do any of the following?",
    articleRef: "Article 50",
    inputType: "multi_select",
    options: [
      {
        value: "interacts",
        label: "Interacts directly with people, for example a chatbot or voice assistant",
      },
      { value: "generates", label: "Generates synthetic audio, images, video or text" },
      {
        value: "emotion_biometric",
        label: "Recognises emotions or categorises people using biometric data",
      },
      {
        value: "deepfake",
        label:
          "Produces deepfakes, or generates or edits text published to inform the public on matters of public interest",
      },
      NONE,
    ],
    showWhen: NOT_PROHIBITED,
  },
];

export const QUESTIONNAIRE_V2: Questionnaire = { version: 2, questions: QUESTIONS };
```

- [ ] **Step 4: Write the failing validation tests**

```ts
// Servers/services/euAiActClassification/__tests__/validate.test.ts
import { describe, it, expect } from "@jest/globals";
import { QUESTIONNAIRE_V2 } from "../questionnaire.v2";
import { validateAnswers } from "../validate";
import { visibleQuestions } from "../visibility";

const MINIMAL = {
  scope: "in_scope",
  role: "deployer",
  art5_practices: ["none"],
  rbi_law_enforcement: "no",
  intimate_content: "no",
  safety_function: "no",
  annex_iii_areas: ["none"],
  transparency: ["none"],
};

describe("validateAnswers", () => {
  it("accepts a complete minimal-risk path", () => {
    const { errors, answers } = validateAnswers(QUESTIONNAIRE_V2, MINIMAL);
    expect(errors).toEqual([]);
    expect(answers).toEqual(MINIMAL);
  });

  it("rejects a non-object", () => {
    expect(validateAnswers(QUESTIONNAIRE_V2, ["scope"]).errors).toEqual([
      "answers must be an object",
    ]);
  });

  it("rejects unknown questions and unknown values", () => {
    const { errors } = validateAnswers(QUESTIONNAIRE_V2, {
      ...MINIMAL,
      level: "Minimal risk",
      scope: "maybe",
    });
    expect(errors).toEqual(
      expect.arrayContaining(['unknown question "level"', 'invalid answer "maybe" for question "scope"']),
    );
  });

  it("rejects an exclusive answer combined with others", () => {
    const { errors } = validateAnswers(QUESTIONNAIRE_V2, {
      ...MINIMAL,
      art5_practices: ["none", "manipulation"],
    });
    expect(errors[0]).toContain("cannot be combined");
  });

  it("rejects a list for a single-select question and a string for a multi-select one", () => {
    const { errors } = validateAnswers(QUESTIONNAIRE_V2, {
      ...MINIMAL,
      scope: ["in_scope"],
      transparency: "none",
    });
    expect(errors).toEqual(
      expect.arrayContaining([
        'question "scope" takes one answer',
        'question "transparency" takes a list of answers',
      ]),
    );
  });

  it("reports a visible question that is not answered", () => {
    const { transparency, ...rest } = MINIMAL;
    void transparency;
    expect(validateAnswers(QUESTIONNAIRE_V2, rest).errors).toEqual([
      'question "transparency" is not answered',
    ]);
  });

  it("drops answers to questions that are hidden by earlier answers", () => {
    const { errors, answers } = validateAnswers(QUESTIONNAIRE_V2, {
      ...MINIMAL,
      employment_use: "recruitment", // hidden: annex_iii_areas is "none"
    });
    expect(errors).toEqual([]);
    expect(answers.employment_use).toBeUndefined();
  });

  it("stops after a prohibited practice", () => {
    const ids = visibleQuestions(QUESTIONNAIRE_V2, {
      scope: "in_scope",
      role: "provider",
      art5_practices: ["social_scoring"],
    }).map((q) => q.id);
    expect(ids).toEqual(["scope", "role", "art5_practices"]);
  });

  it("asks only the scope question when the system is research-only", () => {
    const { errors, answers } = validateAnswers(QUESTIONNAIRE_V2, { scope: "research_only" });
    expect(errors).toEqual([]);
    expect(answers).toEqual({ scope: "research_only" });
  });
});
```

- [ ] **Step 5: Run the tests to verify they fail**

Run: `cd Servers && npx jest services/euAiActClassification`
Expected: FAIL with `Cannot find module '../validate'`.

- [ ] **Step 6: Implement validation**

```ts
// Servers/services/euAiActClassification/validate.ts
import { Answers, Questionnaire } from "./types";
import { visibleQuestions } from "./visibility";

/**
 * Check raw answers against a questionnaire. On success `answers` holds only
 * the answers to visible questions, which is what gets scored and stored.
 */
export const validateAnswers = (
  questionnaire: Questionnaire,
  raw: unknown,
): { errors: string[]; answers: Answers } => {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { errors: ["answers must be an object"], answers: {} };
  }
  const input = raw as Record<string, unknown>;
  const byId = new Map(questionnaire.questions.map((q) => [q.id, q]));
  const errors: string[] = [];

  for (const [id, value] of Object.entries(input)) {
    const question = byId.get(id);
    if (!question) {
      errors.push(`unknown question "${id}"`);
      continue;
    }
    if (question.inputType === "single_select" && Array.isArray(value)) {
      errors.push(`question "${id}" takes one answer`);
      continue;
    }
    if (question.inputType === "multi_select" && !Array.isArray(value)) {
      errors.push(`question "${id}" takes a list of answers`);
      continue;
    }
    const values = Array.isArray(value) ? value : [value];
    const allowed = new Set(question.options.map((o) => o.value));
    for (const v of values) {
      if (typeof v !== "string" || !allowed.has(v)) {
        errors.push(`invalid answer "${String(v)}" for question "${id}"`);
      }
    }
    const exclusive = question.options.filter((o) => o.exclusive).map((o) => o.value);
    if (values.length > 1 && values.some((v) => exclusive.includes(v as string))) {
      errors.push(`"${exclusive.join('", "')}" cannot be combined with other answers for question "${id}"`);
    }
  }
  if (errors.length > 0) return { errors, answers: {} };

  const typed = input as Answers;
  const answers: Answers = {};
  for (const question of visibleQuestions(questionnaire, typed)) {
    const answer = typed[question.id];
    if (answer === undefined || (Array.isArray(answer) && answer.length === 0)) {
      errors.push(`question "${question.id}" is not answered`);
    } else {
      answers[question.id] = answer;
    }
  }
  return errors.length > 0 ? { errors, answers: {} } : { errors, answers };
};
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `cd Servers && npx jest services/euAiActClassification`
Expected: PASS, 9 tests.

- [ ] **Step 8: Commit**

```bash
git add Servers/services/euAiActClassification
git commit -m "feat(eu-ai-act): add questionnaire v2 definition, visibility and answer validation"
```

---

### Task 2: Scoring v2 and the module entry point (backend, pure)

**Files:**
- Create: `Servers/services/euAiActClassification/score.v2.ts`
- Create: `Servers/services/euAiActClassification/registry.ts`
- Create: `Servers/services/euAiActClassification/index.ts`
- Test: `Servers/services/euAiActClassification/__tests__/score.v2.test.ts`

**Interfaces:**
- Consumes: Task 1 types, `QUESTIONNAIRE_V2`, `ANNEX_III_HIGH_RISK_USES`, `validateAnswers`.
- Produces: `scoreV2(answers: Answers, now?: Date): ClassificationResult`; from `registry.ts` (re-exported by `index.ts`): `CURRENT_QUESTIONNAIRE_VERSION = 2`, `getQuestionnaire(version: number): Questionnaire | null`, `scoreClassification(version: number, answers: Answers, now?: Date): ClassificationResult`, and re-exports of `validateAnswers`, `visibleQuestions` and all types.

- [ ] **Step 1: Write the failing scoring tests**

```ts
// Servers/services/euAiActClassification/__tests__/score.v2.test.ts
import { describe, it, expect } from "@jest/globals";
import { scoreV2 } from "../score.v2";
import { Answers } from "../types";

const BASE: Answers = {
  scope: "in_scope",
  role: "deployer",
  art5_practices: ["none"],
  rbi_law_enforcement: "no",
  intimate_content: "no",
  safety_function: "no",
  annex_iii_areas: ["none"],
  transparency: ["none"],
};
const BEFORE_OMNIBUS = new Date("2026-12-01T12:00:00Z");
const AFTER_OMNIBUS = new Date("2026-12-02T12:00:00Z");
const score = (overrides: Answers, now = AFTER_OMNIBUS) => scoreV2({ ...BASE, ...overrides }, now);

describe("scoreV2", () => {
  it("research-only systems are out of scope", () => {
    const result = scoreV2({ scope: "research_only" });
    expect(result.level).toBe("Out of scope");
    expect(result.role).toBeNull();
    expect(result.obligations).toEqual([]);
  });

  it("a system with nothing to report is minimal risk with AI literacy", () => {
    const result = score({});
    expect(result.level).toBe("Minimal risk");
    expect(result.role).toBe("Deployer");
    expect(result.obligations.map((o) => o.article)).toContain("Article 4");
  });

  it.each([
    "manipulation",
    "exploit_vulnerabilities",
    "social_scoring",
    "crime_prediction",
    "facial_scraping",
    "emotion_workplace_education",
    "biometric_categorisation",
  ])("Article 5 practice %s is prohibited", (practice) => {
    expect(score({ art5_practices: [practice] }).level).toBe("Prohibited");
  });

  // Regression: the old wizard prohibited real-time biometric identification
  // outside law enforcement and made it high risk inside.
  it("real-time remote biometric identification for law enforcement without an objective is prohibited", () => {
    expect(score({ rbi_law_enforcement: "yes", rbi_objective: "none" }).level).toBe("Prohibited");
  });

  it("real-time remote biometric identification for an authorised objective is high risk", () => {
    expect(score({ rbi_law_enforcement: "yes", rbi_objective: "victims_missing" }).level).toBe(
      "High risk",
    );
  });

  it("intimate content without safeguards is prohibited, with the start date before 2 Dec 2026", () => {
    const before = score({ intimate_content: "yes", intimate_content_safeguards: "no" }, BEFORE_OMNIBUS);
    const after = score({ intimate_content: "yes", intimate_content_safeguards: "no" }, AFTER_OMNIBUS);
    expect(before.level).toBe("Prohibited");
    expect(after.level).toBe("Prohibited");
    expect(before.reasons[0].text).toMatch(/^Prohibited from 2 December 2026/);
    expect(after.reasons[0].text).not.toMatch(/^Prohibited from/);
    expect(before.reasons[0].appliesFrom).toBe("2026-12-02");
  });

  it("intimate content with safeguards is not prohibited", () => {
    expect(score({ intimate_content: "yes", intimate_content_safeguards: "yes" }).level).toBe(
      "Minimal risk",
    );
  });

  it.each(["section_a", "section_b"])("an Annex I product (%s) is high risk from 2 Aug 2028", (section) => {
    const result = score({ safety_function: section });
    expect(result.level).toBe("High risk");
    expect(result.reasons[0].appliesFrom).toBe("2028-08-02");
  });

  it.each([
    ["biometrics", "biometrics_use", "remote_identification"],
    ["critical_infrastructure", "critical_infrastructure_use", "safety_component"],
    ["education", "education_use", "admission"],
    ["employment", "employment_use", "recruitment"],
    ["essential_services", "essential_services_use", "creditworthiness"],
    ["law_enforcement", "law_enforcement_use", "victim_risk"],
    ["migration", "migration_use", "application_examination"],
    ["justice_democracy", "justice_democracy_use", "election_influence"],
  ])("Annex III area %s with use %s is high risk from 2 Dec 2027", (area, question, use) => {
    const result = score({
      annex_iii_areas: [area],
      [question]: use,
      profiling: "no",
      derogation: "none",
    });
    expect(result.level).toBe("High risk");
    expect(result.reasons.some((r) => r.appliesFrom === "2027-12-02")).toBe(true);
  });

  it.each([
    ["biometrics", "biometrics_use", "verification_only"],
    ["essential_services", "essential_services_use", "fraud_detection"],
    ["migration", "migration_use", "travel_document_verification"],
    ["justice_democracy", "justice_democracy_use", "campaign_logistics"],
  ])("the %s carve-out %s is not high risk and is explained", (area, question, use) => {
    const result = score({ annex_iii_areas: [area], [question]: use });
    expect(result.level).toBe("Minimal risk");
    expect(result.reasons.some((r) => r.text.includes("excluded"))).toBe(true);
  });

  // Regression: the old wizard gave High for any decision domain, including "other".
  it("another use in an Annex III area is not high risk", () => {
    expect(score({ annex_iii_areas: ["employment"], employment_use: "other" }).level).toBe(
      "Minimal risk",
    );
  });

  // Regression: the old wizard gave High to any critical-infrastructure deployer.
  it("a critical-infrastructure organisation using AI outside a safety function is not high risk", () => {
    expect(
      score({ annex_iii_areas: ["critical_infrastructure"], critical_infrastructure_use: "other" }).level,
    ).toBe("Minimal risk");
  });

  it("profiling keeps an Annex III system high risk", () => {
    const result = score({
      annex_iii_areas: ["employment"],
      employment_use: "recruitment",
      profiling: "yes",
    });
    expect(result.level).toBe("High risk");
    expect(result.reasons[0].text).toContain("profiles");
  });

  it("an Article 6(3) derogation is not high risk but must be documented and registered", () => {
    const result = score({
      role: "provider",
      annex_iii_areas: ["employment"],
      employment_use: "recruitment",
      profiling: "no",
      derogation: "narrow_procedural",
    });
    expect(result.level).toBe("Minimal risk");
    expect(result.obligations.map((o) => o.article)).toEqual(
      expect.arrayContaining(["Article 6(4)", "Article 49(2)"]),
    );
  });

  it("transparency triggers make it limited risk with role-specific obligations", () => {
    const provider = score({ role: "provider", transparency: ["interacts", "generates"] });
    const deployer = score({ role: "deployer", transparency: ["deepfake"] });
    expect(provider.level).toBe("Limited risk");
    expect(provider.obligations.map((o) => o.article)).toEqual(
      expect.arrayContaining(["Article 50(1)", "Article 50(2)"]),
    );
    expect(deployer.obligations.map((o) => o.article)).toContain("Article 50(4)");
    expect(deployer.obligations.map((o) => o.article)).not.toContain("Article 50(1)");
  });

  it("a high-risk system keeps its level and adds transparency obligations", () => {
    const result = score({ safety_function: "section_a", role: "provider", transparency: ["interacts"] });
    expect(result.level).toBe("High risk");
    expect(result.obligations.map((o) => o.article)).toEqual(
      expect.arrayContaining(["Article 9", "Article 50(1)"]),
    );
  });

  it("high-risk obligations differ for providers and deployers", () => {
    const provider = score({ role: "provider", safety_function: "section_a" });
    const deployer = score({ role: "deployer", safety_function: "section_a" });
    expect(provider.obligations.map((o) => o.article)).toContain("Article 43");
    expect(deployer.obligations.map((o) => o.article)).toContain("Article 26(1)");
    expect(deployer.obligations.map((o) => o.article)).not.toContain("Article 43");
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd Servers && npx jest services/euAiActClassification/__tests__/score.v2.test.ts`
Expected: FAIL with `Cannot find module '../score.v2'`.

- [ ] **Step 3: Implement scoring**

```ts
// Servers/services/euAiActClassification/score.v2.ts
import { ANNEX_III_HIGH_RISK_USES } from "./questionnaire.v2";
import {
  Answers,
  ClassificationLevel,
  ClassificationReason,
  ClassificationResult,
  ClassificationRole,
} from "./types";

const DATES = {
  article5: "2025-02-02",
  article4: "2025-02-02",
  omnibusBans: "2026-12-02",
  article50: "2026-08-02",
  annexIII: "2027-12-02",
  annexI: "2028-08-02",
};

const ARTICLE_5: Record<string, ClassificationReason> = {
  manipulation: { article: "Article 5(1)(a)", text: "Manipulative or deceptive techniques that materially distort behaviour and are likely to cause significant harm are prohibited." },
  exploit_vulnerabilities: { article: "Article 5(1)(b)", text: "Exploiting vulnerabilities due to age, disability or a social or economic situation is prohibited." },
  social_scoring: { article: "Article 5(1)(c)", text: "Social scoring that leads to unjustified or unrelated detrimental treatment is prohibited." },
  crime_prediction: { article: "Article 5(1)(d)", text: "Predicting criminal offences based solely on profiling or personality traits is prohibited." },
  facial_scraping: { article: "Article 5(1)(e)", text: "Building facial recognition databases through untargeted scraping is prohibited." },
  emotion_workplace_education: { article: "Article 5(1)(f)", text: "Emotion recognition at work or in education institutions, other than for medical or safety reasons, is prohibited." },
  biometric_categorisation: { article: "Article 5(1)(g)", text: "Biometric categorisation to infer sensitive characteristics is prohibited." },
};

const OMNIBUS_BAN = {
  inForce: { text: "AI systems that generate non-consensual intimate imagery of real people or child sexual abuse material are prohibited." },
  upcoming: { text: "Prohibited from 2 December 2026: AI systems that generate non-consensual intimate imagery of real people or child sexual abuse material." },
};

const ANNEX_III_ARTICLE: Record<string, string> = {
  biometrics_use: "Annex III, point 1",
  critical_infrastructure_use: "Annex III, point 2",
  education_use: "Annex III, point 3",
  employment_use: "Annex III, point 4",
  essential_services_use: "Annex III, point 5",
  law_enforcement_use: "Annex III, point 6",
  migration_use: "Annex III, point 7",
  justice_democracy_use: "Annex III, point 8",
};

const CARVE_OUTS: Record<string, Record<string, ClassificationReason>> = {
  biometrics_use: { verification_only: { article: "Annex III, point 1(a)", text: "Biometric verification whose sole purpose is to confirm that a person is who they claim to be is excluded from the high-risk list." } },
  essential_services_use: { fraud_detection: { article: "Annex III, point 5(b)", text: "AI systems used to detect financial fraud are excluded from the high-risk list." } },
  migration_use: { travel_document_verification: { article: "Annex III, point 7(d)", text: "Verification of travel documents is excluded from the high-risk list." } },
  justice_democracy_use: { campaign_logistics: { article: "Annex III, point 8(b)", text: "Tools that organise, optimise or structure political campaigns administratively or logistically are excluded from the high-risk list." } },
};

// Every user-facing sentence is a whole literal (no template strings) so the
// DOM translator can match it against translations.ts.
const DEROGATIONS: Record<string, ClassificationReason> = {
  narrow_procedural: { article: "Article 6(3)(a)", text: "The system performs a narrow procedural task, so it is not high risk." },
  improve_human_activity: { article: "Article 6(3)(b)", text: "The system improves the result of a previously completed human activity, so it is not high risk." },
  detect_patterns: { article: "Article 6(3)(c)", text: "The system detects decision-making patterns without replacing or influencing the human assessment without review, so it is not high risk." },
  preparatory_task: { article: "Article 6(3)(d)", text: "The system performs a preparatory task to an Annex III assessment, so it is not high risk." },
};

const TRANSPARENCY: Record<string, { reason: ClassificationReason; obligation: ClassificationReason; role: ClassificationRole }> = {
  interacts: {
    reason: { article: "Article 50(1)", text: "The system interacts directly with people.", appliesFrom: DATES.article50 },
    obligation: { article: "Article 50(1)", text: "Inform people that they are interacting with an AI system.", appliesFrom: DATES.article50 },
    role: "Provider",
  },
  generates: {
    reason: { article: "Article 50(2)", text: "The system generates synthetic audio, images, video or text.", appliesFrom: DATES.article50 },
    obligation: { article: "Article 50(2)", text: "Mark generated content in a machine-readable format. Systems already on the market must comply by 2 December 2026.", appliesFrom: DATES.article50 },
    role: "Provider",
  },
  emotion_biometric: {
    reason: { article: "Article 50(3)", text: "The system recognises emotions or categorises people using biometric data.", appliesFrom: DATES.article50 },
    obligation: { article: "Article 50(3)", text: "Inform the people exposed to the system.", appliesFrom: DATES.article50 },
    role: "Deployer",
  },
  deepfake: {
    reason: { article: "Article 50(4)", text: "The system produces deepfakes or public-interest text.", appliesFrom: DATES.article50 },
    obligation: { article: "Article 50(4)", text: "Disclose that the content is artificially generated or manipulated.", appliesFrom: DATES.article50 },
    role: "Deployer",
  },
};

const HIGH_RISK_PROVIDER: ClassificationReason[] = [
  { article: "Article 9", text: "Establish a risk management system." },
  { article: "Article 10", text: "Apply data governance to training, validation and testing data." },
  { article: "Article 11", text: "Draw up technical documentation (Annex IV)." },
  { article: "Article 12", text: "Enable automatic event logging." },
  { article: "Article 13", text: "Provide instructions for use to deployers." },
  { article: "Article 14", text: "Design the system for effective human oversight." },
  { article: "Article 15", text: "Achieve appropriate accuracy, robustness and cybersecurity." },
  { article: "Article 17", text: "Put a quality management system in place." },
  { article: "Article 43", text: "Complete the conformity assessment before placing the system on the market." },
  { article: "Article 49", text: "Register the system in the EU database." },
  { article: "Article 72", text: "Run post-market monitoring." },
  { article: "Article 73", text: "Report serious incidents." },
];

const HIGH_RISK_DEPLOYER: ClassificationReason[] = [
  { article: "Article 26(1)", text: "Use the system according to the provider's instructions." },
  { article: "Article 26(2)", text: "Assign human oversight to competent people." },
  { article: "Article 26(4)", text: "Make sure input data is relevant and sufficiently representative." },
  { article: "Article 26(5)", text: "Monitor operation and inform the provider of risks and serious incidents." },
  { article: "Article 26(6)", text: "Keep the automatically generated logs for at least six months." },
  { article: "Article 26(7)", text: "Inform workers' representatives and affected workers before use at the workplace." },
  { article: "Article 26(11)", text: "Inform people that decisions about them are supported by a high-risk AI system." },
  { article: "Article 27", text: "Carry out a fundamental rights impact assessment where required (public bodies, public services, credit scoring, and life or health insurance)." },
];

const AI_LITERACY: ClassificationReason = { article: "Article 4", text: "Ensure sufficient AI literacy of the staff who operate or use the system.", appliesFrom: DATES.article4 };

const asList = (answer: string | string[] | undefined): string[] =>
  answer === undefined ? [] : Array.isArray(answer) ? answer : [answer];

const toRole = (answer: string | string[] | undefined): ClassificationRole | null =>
  answer === "provider" ? "Provider" : answer === "deployer" ? "Deployer" : null;

export const scoreV2 = (answers: Answers, now: Date = new Date()): ClassificationResult => {
  const role = toRole(answers.role);
  const result = (level: ClassificationLevel, reasons: ClassificationReason[], obligations: ClassificationReason[]): ClassificationResult => ({
    questionnaireVersion: 2,
    level,
    role,
    reasons,
    obligations,
  });

  if (answers.scope === "research_only") {
    return result(
      "Out of scope",
      [{ article: "Article 2(6) and 2(8)", text: "AI systems developed and used only for scientific research and development, before being placed on the market or put into service, are outside the scope of the EU AI Act." }],
      [],
    );
  }

  const prohibited: ClassificationReason[] = asList(answers.art5_practices)
    .filter((p) => p !== "none")
    .map((p) => ({ ...ARTICLE_5[p], appliesFrom: DATES.article5 }));
  if (answers.rbi_law_enforcement === "yes" && answers.rbi_objective === "none") {
    prohibited.push({ article: "Article 5(1)(h)", text: "Real-time remote biometric identification in publicly accessible spaces for law enforcement, outside the authorised objectives, is prohibited.", appliesFrom: DATES.article5 });
  }
  if (answers.intimate_content === "yes" && answers.intimate_content_safeguards === "no") {
    const inForce = now.getTime() >= Date.parse(`${DATES.omnibusBans}T00:00:00Z`);
    prohibited.push({
      article: "Article 5, as amended by Regulation (EU) 2026/1744",
      text: inForce ? OMNIBUS_BAN.inForce.text : OMNIBUS_BAN.upcoming.text,
      appliesFrom: DATES.omnibusBans,
    });
  }
  if (prohibited.length > 0) {
    return result("Prohibited", prohibited, [
      { article: "Article 5", text: "Do not place this system on the market, put it into service or use it in the EU." },
    ]);
  }

  const high: ClassificationReason[] = [];
  const notes: ClassificationReason[] = [];
  const extraObligations: ClassificationReason[] = [];

  if (answers.rbi_law_enforcement === "yes") {
    high.push({ article: "Article 5(2)-(3) and Annex III, point 1(a)", text: "Real-time remote biometric identification for an authorised objective needs prior authorisation and is a high-risk system.", appliesFrom: DATES.annexIII });
  }
  if (answers.safety_function === "section_a") {
    high.push({ article: "Article 6(1) and Annex I, Section A", text: "The system is a product, or performs a safety function in a product, under Annex I Section A legislation that requires a third-party conformity assessment.", appliesFrom: DATES.annexI });
  }
  if (answers.safety_function === "section_b") {
    high.push({ article: "Article 6(1), Article 2(2) and Annex I, Section B", text: "The system is part of a product under Annex I Section B. Its high-risk requirements apply through that sector's legislation.", appliesFrom: DATES.annexI });
  }

  for (const [question, carveOuts] of Object.entries(CARVE_OUTS)) {
    const note = carveOuts[answers[question] as string];
    if (note) notes.push(note);
  }

  const annexMatches = Object.entries(ANNEX_III_HIGH_RISK_USES).filter(([question, values]) =>
    values.includes(answers[question] as string),
  );
  if (annexMatches.length > 0) {
    const derogation = answers.derogation as string | undefined;
    if (answers.profiling === "yes") {
      for (const [question] of annexMatches) {
        high.push({ article: ANNEX_III_ARTICLE[question], text: "The system is used for a listed high-risk purpose and profiles people, so the Article 6(3) exemption cannot apply.", appliesFrom: DATES.annexIII });
      }
    } else if (derogation && derogation !== "none") {
      notes.push({ ...DEROGATIONS[derogation], appliesFrom: DATES.annexIII });
      extraObligations.push(
        { article: "Article 6(4)", text: "The provider documents the assessment that the system is not high risk before placing it on the market or putting it into service.", appliesFrom: DATES.annexIII },
        { article: "Article 49(2)", text: "The provider registers the system in the EU database.", appliesFrom: DATES.annexIII },
      );
    } else {
      for (const [question] of annexMatches) {
        high.push({ article: ANNEX_III_ARTICLE[question], text: "The system is used for a purpose listed as high risk in Annex III.", appliesFrom: DATES.annexIII });
      }
    }
  }

  const transparencyKeys = asList(answers.transparency).filter((t) => t !== "none");
  const transparencyReasons = transparencyKeys.map((t) => TRANSPARENCY[t].reason);
  const transparencyObligations = transparencyKeys
    .filter((t) => role === null || TRANSPARENCY[t].role === role)
    .map((t) => TRANSPARENCY[t].obligation);

  const level: ClassificationLevel =
    high.length > 0 ? "High risk" : transparencyKeys.length > 0 ? "Limited risk" : "Minimal risk";
  const highObligations =
    level === "High risk" ? (role === "Provider" ? HIGH_RISK_PROVIDER : HIGH_RISK_DEPLOYER).map((o) => ({ ...o, appliesFrom: high[0].appliesFrom })) : [];

  return result(
    level,
    [...high, ...notes, ...transparencyReasons],
    [...highObligations, ...extraObligations, ...transparencyObligations, AI_LITERACY],
  );
};
```

- [ ] **Step 4: Create the version registry and the module entry point**

Modules inside this folder import `./registry`, never `./index`, so later
additions to `index.ts` cannot create an import cycle.

```ts
// Servers/services/euAiActClassification/registry.ts
import { QUESTIONNAIRE_V2 } from "./questionnaire.v2";
import { scoreV2 } from "./score.v2";
import { Answers, ClassificationResult, Questionnaire } from "./types";

export const CURRENT_QUESTIONNAIRE_VERSION = 2;

const QUESTIONNAIRES: Record<number, Questionnaire> = { 2: QUESTIONNAIRE_V2 };
const SCORERS: Record<number, (answers: Answers, now?: Date) => ClassificationResult> = { 2: scoreV2 };

export const getQuestionnaire = (version: number): Questionnaire | null =>
  QUESTIONNAIRES[version] ?? null;

/** Score with the rules of the version the answers were given under. */
export const scoreClassification = (
  version: number,
  answers: Answers,
  now: Date = new Date(),
): ClassificationResult => {
  const scorer = SCORERS[version];
  if (!scorer) throw new Error(`Unknown EU AI Act questionnaire version ${version}`);
  return scorer(answers, now);
};
```

```ts
// Servers/services/euAiActClassification/index.ts
export * from "./types";
export * from "./registry";
export { validateAnswers } from "./validate";
export { visibleQuestions } from "./visibility";
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd Servers && npx jest services/euAiActClassification`
Expected: PASS (all Task 1 and Task 2 tests).

- [ ] **Step 6: Typecheck, format and commit**

```bash
cd Servers && npx tsc --noEmit && npx prettier --write services/euAiActClassification && npm run format-check
git add Servers/services/euAiActClassification
git commit -m "feat(eu-ai-act): add server-side scoring for questionnaire v2"
```

---

### Task 3: Schema changes and the "Out of scope" level everywhere

**Files:**
- Create: `Servers/database/migrations/20261008120000-add-out-of-scope-ai-risk-classification.js`
- Create: `Servers/database/migrations/20261008120100-add-intake-forms-eu-ai-act-risk-step.js`
- Create: `Servers/database/migrations/20261008120200-create-eu-ai-act-classifications.js`
- Modify: `Servers/domain.layer/enums/ai-risk-classification.enum.ts`
- Modify: `Servers/domain.layer/tests/enums.spec.ts:50-62`
- Modify: `Servers/controllers/intakeForm.ctrl.ts:66-79` (`mapToAiRiskClassification`)
- Modify: `Clients/src/domain/enums/aiRiskClassification.enum.ts`
- Modify: `Clients/src/application/mappers/project.mapper.ts:22-42`
- Modify: `Clients/src/presentation/components/Forms/ProjectForm/index.tsx:301-309`
- Modify: `Clients/src/presentation/components/CreateProjectForm/index.tsx` (the `riskClassificationItems` list near line 196)
- Modify: `Clients/src/presentation/pages/ProjectView/ProjectSettings/index.tsx:55-60`
- Modify: `Clients/src/presentation/components/ProjectsList/ProjectsList.tsx:133-137`
- Modify: `Servers/swagger.yaml:39-48` (`AiRiskClassification` schema enum, maintained by hand)
- Regenerate: `Servers/enum-manifest.json` (`npm run check:enum-drift`)
- Test: `Clients/src/application/mappers/__tests__/project.mapper.outOfScope.test.ts`

**Interfaces:**
- Produces: `AiRiskClassification.OUT_OF_SCOPE = "Out of scope"` (both packages); column `intake_forms.eu_ai_act_risk_step_enabled`; table `eu_ai_act_classifications`.

- [ ] **Step 1: Enum value migration (its own migration: a new value cannot be used in the transaction that adds it)**

```js
// Servers/database/migrations/20261008120000-add-out-of-scope-ai-risk-classification.js
"use strict";

/**
 * Adds 'Out of scope' to verifywise.enum_projects_ai_risk_classification for
 * systems outside the EU AI Act (Article 2(6)/(8), research and development
 * only). Its own migration: PostgreSQL cannot use a new enum value in the
 * transaction that adds it.
 */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(
      `ALTER TYPE verifywise.enum_projects_ai_risk_classification ADD VALUE IF NOT EXISTS 'Out of scope';`,
    );
  },

  async down() {
    // An enum value cannot be dropped without recreating the type and every
    // column that uses it. Rows using it would block that anyway. No-op.
  },
};
```

- [ ] **Step 2: Form column migration**

```js
// Servers/database/migrations/20261008120100-add-intake-forms-eu-ai-act-risk-step.js
"use strict";

/** Per-form toggle for the required EU AI Act risk classification step. */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      ALTER TABLE verifywise.intake_forms
        ADD COLUMN IF NOT EXISTS eu_ai_act_risk_step_enabled BOOLEAN NOT NULL DEFAULT false;
    `);
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(`
      ALTER TABLE verifywise.intake_forms DROP COLUMN IF EXISTS eu_ai_act_risk_step_enabled;
    `);
  },
};
```

- [ ] **Step 3: Runs table migration**

```js
// Servers/database/migrations/20261008120200-create-eu-ai-act-classifications.js
"use strict";

/**
 * One row per completed EU AI Act classification questionnaire. A run belongs
 * to exactly one owner: an intake submission or a use case. Deleting the owner
 * deletes its runs. On approval the submission's run is copied to the new use
 * case rather than shared.
 */
module.exports = {
  async up(queryInterface) {
    const transaction = await queryInterface.sequelize.transaction();
    try {
      await queryInterface.sequelize.query(
        `
        CREATE TABLE IF NOT EXISTS verifywise.eu_ai_act_classifications (
          id SERIAL PRIMARY KEY,
          organization_id INTEGER NOT NULL REFERENCES verifywise.organizations(id) ON DELETE CASCADE,
          use_case_id INTEGER REFERENCES verifywise.projects(id) ON DELETE CASCADE,
          intake_submission_id INTEGER REFERENCES verifywise.intake_submissions(id) ON DELETE CASCADE,
          questionnaire_version INTEGER NOT NULL,
          role VARCHAR(20) CHECK (role IN ('Provider', 'Deployer')),
          answers JSONB NOT NULL,
          result JSONB NOT NULL,
          reviewer_level VARCHAR(50),
          reviewer_justification TEXT,
          reviewed_by INTEGER REFERENCES verifywise.users(id) ON DELETE SET NULL,
          source VARCHAR(10) NOT NULL CHECK (source IN ('wizard', 'intake')),
          created_by INTEGER REFERENCES verifywise.users(id) ON DELETE SET NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          CONSTRAINT eu_ai_act_classifications_one_owner
            CHECK ((use_case_id IS NULL) <> (intake_submission_id IS NULL))
        );
        `,
        { transaction },
      );
      await queryInterface.sequelize.query(
        `CREATE INDEX IF NOT EXISTS idx_eu_ai_act_classifications_use_case
           ON verifywise.eu_ai_act_classifications (organization_id, use_case_id);`,
        { transaction },
      );
      await queryInterface.sequelize.query(
        `CREATE INDEX IF NOT EXISTS idx_eu_ai_act_classifications_submission
           ON verifywise.eu_ai_act_classifications (organization_id, intake_submission_id);`,
        { transaction },
      );
      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(
      `DROP TABLE IF EXISTS verifywise.eu_ai_act_classifications;`,
    );
  },
};
```

- [ ] **Step 4: Run the migrations up, down and up locally**

Run (from `Servers/`, with Postgres running and `Servers/.env` present):
`npx sequelize-cli db:migrate && npx sequelize-cli db:migrate:undo && npx sequelize-cli db:migrate:undo && npx sequelize-cli db:migrate`
Expected: no errors. Then `psql -c "\d verifywise.eu_ai_act_classifications"` shows the table and the `eu_ai_act_classifications_one_owner` check. (`db:migrate:undo` twice undoes the table and the column; the enum migration's down is a no-op.) If the repo's migrate script differs, use `npm run migrate-db`.

- [ ] **Step 5: Add the enum value on both sides**

In `Servers/domain.layer/enums/ai-risk-classification.enum.ts` and `Clients/src/domain/enums/aiRiskClassification.enum.ts`, add after `GENERAL_RISK = "General Risk",`:

```ts
  OUT_OF_SCOPE = "Out of scope",
```

In `Servers/domain.layer/tests/enums.spec.ts`, add `"OUT_OF_SCOPE",` after `"GENERAL_RISK",` in the `verifyEnum(AiRiskClassification, [...])` key list, and in the next `it` block (individual `expect`s) add `expect(AiRiskClassification.OUT_OF_SCOPE).toBe("Out of scope");`.

In `Servers/swagger.yaml`, add `        - 'Out of scope'` after `        - 'General Risk'` in `components.schemas.AiRiskClassification.enum` (the generator merges endpoints but does not derive enums). Then run `cd Servers && npm run check:enum-drift` and commit the regenerated `enum-manifest.json` if it changed.

`project.model.ts` (`DataType.ENUM(...Object.values(AiRiskClassification))`) and `project.validator.ts` (`isIn(Object.values(AiRiskClassification))`) pick it up automatically.

- [ ] **Step 6: Map "out of scope" in the intake approval mapper**

In `Servers/controllers/intakeForm.ctrl.ts`, inside `mapToAiRiskClassification`'s `map`, add:

```ts
    "out of scope": AiRiskClassification.OUT_OF_SCOPE,
```

- [ ] **Step 7: Write the failing client mapper test**

```ts
// Clients/src/application/mappers/__tests__/project.mapper.outOfScope.test.ts
import { describe, it, expect } from "vitest";
import { mapRiskClassification } from "../project.mapper";
import { AiRiskClassification } from "../../../domain/enums/aiRiskClassification.enum";

describe("AI risk classification mapping", () => {
  it("keeps Out of scope instead of falling back to Minimal risk", () => {
    expect(mapRiskClassification("Out of scope")).toBe(AiRiskClassification.OUT_OF_SCOPE);
  });
});
```

Run: `cd Clients && npx vitest run src/application/mappers/__tests__/project.mapper.outOfScope.test.ts`
Expected: FAIL (`Minimal risk` received).

- [ ] **Step 8: Fix the mapper and the level lists**

In `project.mapper.ts`, add to the string `mapping`:

```ts
    "out of scope": AiRiskClassification.OUT_OF_SCOPE,
```

Add `{ _id: 5, name: AiRiskClassification.OUT_OF_SCOPE },` after the `MINIMAL_RISK` entry in the `riskClassificationItems` lists of `ProjectForm/index.tsx`, `CreateProjectForm/index.tsx` and `ProjectSettings/index.tsx`. In `ProjectsList.tsx`, add `{ value: "Out of scope", label: "Out of scope" },` after the `Minimal Risk` option.

- [ ] **Step 9: Run tests and gates**

Run: `cd Clients && npx vitest run src/application/mappers && npm run typecheck`
Run: `cd Servers && npx jest domain.layer/tests/enums.spec.ts && npx tsc --noEmit`
Expected: PASS, 0 type errors.

- [ ] **Step 10: Commit**

```bash
git add Servers/database/migrations/2026100812* Servers/domain.layer Servers/controllers/intakeForm.ctrl.ts Servers/swagger.yaml Servers/enum-manifest.json Clients/src/domain/enums Clients/src/application/mappers Clients/src/presentation/components/Forms/ProjectForm/index.tsx Clients/src/presentation/components/CreateProjectForm/index.tsx Clients/src/presentation/pages/ProjectView/ProjectSettings/index.tsx Clients/src/presentation/components/ProjectsList/ProjectsList.tsx
git commit -m "feat(eu-ai-act): add Out of scope level, intake step column and classification runs table"
```

---

### Task 4: Classification run data access and tenant isolation

**Files:**
- Create: `Servers/utils/euAiActClassification.utils.ts`
- Test: `Servers/utils/__tests__/euAiActClassification.utils.test.ts`
- Modify: `Servers/tests/integration/tenant-isolation/tenantIsolation.registry.ts`
- Create: `Servers/tests/integration/tenant-isolation/eu-ai-act-classifications.isolation.test.ts`

**Interfaces:**
- Consumes: Task 2 types (`Answers`, `ClassificationResult`, `ClassificationRole`).
- Produces:
  - `interface ClassificationRun { id; organizationId; useCaseId: number | null; intakeSubmissionId: number | null; questionnaireVersion: number; role: ClassificationRole | null; answers: Answers; result: ClassificationResult; reviewerLevel: string | null; reviewerJustification: string | null; reviewedBy: number | null; source: "wizard" | "intake"; createdBy: number | null; createdAt: Date }`
  - `insertClassificationRunQuery(run: NewClassificationRun, organizationId: number, transaction?: Transaction): Promise<ClassificationRun>` where `NewClassificationRun = Omit<ClassificationRun, "id" | "organizationId" | "createdAt">`
  - `getLatestRunForUseCaseQuery(useCaseId: number, organizationId: number, transaction?: Transaction): Promise<ClassificationRun | null>`
  - `getLatestRunForSubmissionQuery(submissionId: number, organizationId: number, transaction?: Transaction): Promise<ClassificationRun | null>`
  - `setUseCaseClassificationQuery(useCaseId: number, level: string, role: ClassificationRole | null, userId: number, organizationId: number, transaction: Transaction): Promise<boolean>` (false when no row matched)

- [ ] **Step 1: Write the failing unit tests (mocked DB)**

```ts
// Servers/utils/__tests__/euAiActClassification.utils.test.ts
import { describe, it, expect, jest, beforeEach } from "@jest/globals";

jest.mock("../../database/db", () => ({ sequelize: { query: jest.fn() } }));

import { sequelize } from "../../database/db";
import {
  getLatestRunForSubmissionQuery,
  insertClassificationRunQuery,
  setUseCaseClassificationQuery,
} from "../euAiActClassification.utils";

const query = sequelize.query as unknown as jest.Mock<(...args: any[]) => Promise<any>>;
const sql = () => String(query.mock.calls[0][0]);
const replacements = () => (query.mock.calls[0][1] as any).replacements;

describe("euAiActClassification.utils", () => {
  beforeEach(() => query.mockReset());

  it("scopes inserts to the organization and serialises JSON", async () => {
    query.mockResolvedValue([{ id: 1 }]);
    await insertClassificationRunQuery(
      {
        useCaseId: null,
        intakeSubmissionId: 9,
        questionnaireVersion: 2,
        role: "Deployer",
        answers: { scope: "in_scope" },
        result: { level: "Minimal risk" } as any,
        reviewerLevel: null,
        reviewerJustification: null,
        reviewedBy: null,
        source: "intake",
        createdBy: null,
      },
      5,
    );
    expect(sql()).toContain("INSERT INTO eu_ai_act_classifications");
    expect(replacements().organizationId).toBe(5);
    expect(replacements().answers).toBe('{"scope":"in_scope"}');
  });

  it("reads the latest submission run within the organization", async () => {
    query.mockResolvedValue([]);
    await expect(getLatestRunForSubmissionQuery(9, 5)).resolves.toBeNull();
    expect(sql()).toContain("organization_id = :organizationId");
    expect(sql()).toContain("ORDER BY created_at DESC, id DESC");
  });

  it("updates only the classification columns of a use case in the organization", async () => {
    query.mockResolvedValue([[{ id: 3 }], 1]);
    await expect(
      setUseCaseClassificationQuery(3, "High risk", "Provider", 7, 5, {} as any),
    ).resolves.toBe(true);
    expect(sql()).toContain("UPDATE projects SET ai_risk_classification = :level");
    expect(sql()).toContain("WHERE organization_id = :organizationId AND id = :useCaseId");
  });
});
```

Run: `cd Servers && npx jest utils/__tests__/euAiActClassification.utils.test.ts`
Expected: FAIL with `Cannot find module '../euAiActClassification.utils'`.

- [ ] **Step 2: Implement the utils**

```ts
// Servers/utils/euAiActClassification.utils.ts
import { QueryTypes, Transaction } from "sequelize";
import { sequelize } from "../database/db";
import {
  Answers,
  ClassificationResult,
  ClassificationRole,
} from "../services/euAiActClassification";

export interface ClassificationRun {
  id: number;
  organizationId: number;
  useCaseId: number | null;
  intakeSubmissionId: number | null;
  questionnaireVersion: number;
  role: ClassificationRole | null;
  answers: Answers;
  result: ClassificationResult;
  reviewerLevel: string | null;
  reviewerJustification: string | null;
  reviewedBy: number | null;
  source: "wizard" | "intake";
  createdBy: number | null;
  createdAt: Date;
}

export type NewClassificationRun = Omit<ClassificationRun, "id" | "organizationId" | "createdAt">;

const RUN_COLUMNS = `
  id, organization_id AS "organizationId", use_case_id AS "useCaseId",
  intake_submission_id AS "intakeSubmissionId",
  questionnaire_version AS "questionnaireVersion", role, answers, result,
  reviewer_level AS "reviewerLevel", reviewer_justification AS "reviewerJustification",
  reviewed_by AS "reviewedBy", source, created_by AS "createdBy", created_at AS "createdAt"
`;

export const insertClassificationRunQuery = async (
  run: NewClassificationRun,
  organizationId: number,
  transaction?: Transaction,
): Promise<ClassificationRun> => {
  const rows = (await sequelize.query(
    `INSERT INTO eu_ai_act_classifications
       (organization_id, use_case_id, intake_submission_id, questionnaire_version, role,
        answers, result, reviewer_level, reviewer_justification, reviewed_by, source, created_by)
     VALUES
       (:organizationId, :useCaseId, :intakeSubmissionId, :questionnaireVersion, :role,
        :answers, :result, :reviewerLevel, :reviewerJustification, :reviewedBy, :source, :createdBy)
     RETURNING ${RUN_COLUMNS}`,
    {
      replacements: {
        organizationId,
        useCaseId: run.useCaseId,
        intakeSubmissionId: run.intakeSubmissionId,
        questionnaireVersion: run.questionnaireVersion,
        role: run.role,
        answers: JSON.stringify(run.answers),
        result: JSON.stringify(run.result),
        reviewerLevel: run.reviewerLevel,
        reviewerJustification: run.reviewerJustification,
        reviewedBy: run.reviewedBy,
        source: run.source,
        createdBy: run.createdBy,
      },
      type: QueryTypes.SELECT,
      transaction,
    },
  )) as ClassificationRun[];
  return rows[0];
};

const latestRun = async (
  ownerColumn: "use_case_id" | "intake_submission_id",
  ownerId: number,
  organizationId: number,
  transaction?: Transaction,
): Promise<ClassificationRun | null> => {
  const rows = (await sequelize.query(
    `SELECT ${RUN_COLUMNS} FROM eu_ai_act_classifications
     WHERE organization_id = :organizationId AND ${ownerColumn} = :ownerId
     ORDER BY created_at DESC, id DESC LIMIT 1`,
    { replacements: { organizationId, ownerId }, type: QueryTypes.SELECT, transaction },
  )) as ClassificationRun[];
  return rows[0] ?? null;
};

export const getLatestRunForUseCaseQuery = (
  useCaseId: number,
  organizationId: number,
  transaction?: Transaction,
) => latestRun("use_case_id", useCaseId, organizationId, transaction);

export const getLatestRunForSubmissionQuery = (
  submissionId: number,
  organizationId: number,
  transaction?: Transaction,
) => latestRun("intake_submission_id", submissionId, organizationId, transaction);

/**
 * Set a use case's level (and role, when the questionnaire asked it) without
 * going through the general project update, which also rewrites members and
 * fires the project-updated automation.
 */
export const setUseCaseClassificationQuery = async (
  useCaseId: number,
  level: string,
  role: ClassificationRole | null,
  userId: number,
  organizationId: number,
  transaction: Transaction,
): Promise<boolean> => {
  const [rows] = (await sequelize.query(
    `UPDATE projects SET ai_risk_classification = :level,
       type_of_high_risk_role = COALESCE(:role, type_of_high_risk_role),
       last_updated = NOW(), last_updated_by = :userId
     WHERE organization_id = :organizationId AND id = :useCaseId
     RETURNING id`,
    { replacements: { level, role, userId, organizationId, useCaseId }, transaction },
  )) as [Array<{ id: number }>, number];
  return rows.length > 0;
};
```

- [ ] **Step 3: Run the unit tests**

Run: `cd Servers && npx jest utils/__tests__/euAiActClassification.utils.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 4: Register the table and write the isolation test**

In `tenantIsolation.registry.ts`, add next to the `file_org_settings` entry:

```ts
  {
    name: "eu_ai_act_classifications",
    tables: ["eu_ai_act_classifications"],
    baseRoute: "/api/projects/:id/eu-ai-act-classification",
    testFile: "eu-ai-act-classifications.isolation.test.ts",
  },
```

```ts
// Servers/tests/integration/tenant-isolation/eu-ai-act-classifications.isolation.test.ts
jest.setTimeout(60000);

import { cleanupDatabase } from "../helpers";
import { createTestProject } from "../../factories";
import { seedTwoTenantContexts } from "./tenantIsolation.harness";
import {
  getLatestRunForUseCaseQuery,
  insertClassificationRunQuery,
} from "../../../utils/euAiActClassification.utils";

/**
 * eu_ai_act_classifications — a run written for org A is never returned for
 * org B, even when B asks for A's use case id.
 */
describe("eu_ai_act_classifications tenant isolation", () => {
  afterEach(async () => {
    await cleanupDatabase();
  });

  it("returns a use case's run only to its own organization", async () => {
    const { owner, attacker } = await seedTwoTenantContexts();
    // createTestProject returns the new project's id.
    const projectId = await createTestProject(owner.orgId, owner.userId);

    await insertClassificationRunQuery(
      {
        useCaseId: projectId,
        intakeSubmissionId: null,
        questionnaireVersion: 2,
        role: "Deployer",
        answers: { scope: "research_only" },
        result: {
          questionnaireVersion: 2,
          level: "Out of scope",
          role: null,
          reasons: [],
          obligations: [],
        },
        reviewerLevel: null,
        reviewerJustification: null,
        reviewedBy: null,
        source: "wizard",
        createdBy: owner.userId,
      },
      owner.orgId,
    );

    expect((await getLatestRunForUseCaseQuery(projectId, owner.orgId))?.result.level).toBe(
      "Out of scope",
    );
    expect(await getLatestRunForUseCaseQuery(projectId, attacker.orgId)).toBeNull();
  });
});
```

Task 5 adds the route-level cases to this file once the routes exist.

- [ ] **Step 5: Run the tenant-isolation coverage test**

Run: `cd Servers && npx jest tests/integration/tenant-isolation/tenantIsolation.coverage.test.ts` (needs the integration DB; see `Servers/tests/integration/README` or CI `backend-checks.yml` for the env).
Expected: PASS (the registry entry has its test file).

- [ ] **Step 6: Commit**

```bash
git add Servers/utils/euAiActClassification.utils.ts Servers/utils/__tests__/euAiActClassification.utils.test.ts Servers/tests/integration/tenant-isolation
git commit -m "feat(eu-ai-act): store classification runs per organization"
```

---

### Task 5: Questionnaire, scoring and use case classification API

**Files:**
- Create: `Servers/controllers/euAiActClassification.ctrl.ts`
- Create: `Servers/routes/euAiActClassification.route.ts`
- Modify: `Servers/routes/project.route.ts` (imports + two routes)
- Modify: `Servers/app.ts` (import + `app.use`)
- Modify: `Servers/config/rolePermissions.config.ts` (new key)
- Modify: `Servers/locales/en.json`, `de.json`, `fr.json`
- Test: `Servers/controllers/__tests__/euAiActClassification.ctrl.test.ts`
- Regenerate: `Servers/swagger.yaml`, `docs/api-docs/src/config/endpoints.ts`

**Interfaces:**
- Consumes: Task 2 `getQuestionnaire`, `scoreClassification`, `validateAnswers`, `CURRENT_QUESTIONNAIRE_VERSION`; Task 4 utils; `getProjectByIdQuery` (`utils/project.utils`), `recordMultipleFieldChanges` (`utils/useCaseChangeHistory.utils`).
- Produces (HTTP):
  - `GET /api/eu-ai-act-classification/questionnaire` → `200 { data: Questionnaire }`
  - `POST /api/eu-ai-act-classification/score` body `{ answers }` → `200 { data: ClassificationResult }` | `400`
  - `GET /api/projects/:id/eu-ai-act-classification` → `200 { data: ClassificationRun | null }` | `404`
  - `POST /api/projects/:id/eu-ai-act-classification` body `{ answers }`, permission `useCase.classify` → `200 { data: { run, result } }` | `400` | `403` | `404`

- [ ] **Step 1: Add the permission key**

In `Servers/config/rolePermissions.config.ts`, after the `"intakeForm.edit"` entry:

```ts
  "useCase.classify": {
    module: "Use cases",
    description: "Classify a use case with the EU AI Act risk questionnaire",
    legacyRoles: EDITOR,
  },
```

- [ ] **Step 2: Add backend messages**

Add to `Servers/locales/en.json` (value = key), `de.json` and `fr.json`:

| Key | de | fr |
| --- | --- | --- |
| `The EU AI Act risk classification answers are invalid` | `Die Antworten zur Risikoklassifizierung nach dem EU AI Act sind ungültig` | `Les réponses à la classification des risques selon l'AI Act de l'UE ne sont pas valides` |
| `Complete the EU AI Act risk classification step` | `Schließen Sie den Schritt zur Risikoklassifizierung nach dem EU AI Act ab` | `Terminez l'étape de classification des risques selon l'AI Act de l'UE` |

- [ ] **Step 3: Write the failing controller tests**

```ts
// Servers/controllers/__tests__/euAiActClassification.ctrl.test.ts
import { describe, it, expect, jest, beforeEach } from "@jest/globals";

jest.mock("../../utils/project.utils", () => ({ getProjectByIdQuery: jest.fn() }));
jest.mock("../../utils/euAiActClassification.utils", () => ({
  insertClassificationRunQuery: jest.fn(),
  getLatestRunForUseCaseQuery: jest.fn(),
  setUseCaseClassificationQuery: jest.fn(),
}));
jest.mock("../../utils/useCaseChangeHistory.utils", () => ({
  recordMultipleFieldChanges: jest.fn().mockResolvedValue(undefined),
}));
jest.mock("../../utils/logger/logHelper", () => ({
  logProcessing: jest.fn(),
  logSuccess: jest.fn<any>().mockResolvedValue(undefined),
  logFailure: jest.fn<any>().mockResolvedValue(undefined),
}));
jest.mock("../../utils/i18n.utils", () => ({
  translateError: jest.fn((_, err) => (err as Error).message),
}));
jest.mock("../../database/db", () => ({
  sequelize: { transaction: jest.fn().mockResolvedValue({ commit: jest.fn(), rollback: jest.fn() }) },
}));
jest.mock("../../utils/statusCode.utils", () => ({
  STATUS_CODE: {
    200: (d: any) => ({ message: "OK", data: d }),
    400: (d: any) => ({ message: "Bad Request", data: d }),
    404: (d: any) => ({ message: "Not Found", data: d }),
    500: (d: any) => ({ message: "Internal Server Error", data: d }),
  },
}));

import {
  classifyUseCase,
  getQuestionnaire,
  getUseCaseClassification,
  scoreAnswers,
} from "../euAiActClassification.ctrl";
import { getProjectByIdQuery } from "../../utils/project.utils";
import {
  getLatestRunForUseCaseQuery,
  insertClassificationRunQuery,
  setUseCaseClassificationQuery,
} from "../../utils/euAiActClassification.utils";
import { recordMultipleFieldChanges } from "../../utils/useCaseChangeHistory.utils";

const req = (overrides: any = {}) => ({
  userId: 7,
  organizationId: 5,
  t: (k: string) => k,
  params: {},
  body: {},
  ...overrides,
});
const res = () => {
  const r: any = {};
  r.status = jest.fn<any>().mockReturnValue(r);
  r.json = jest.fn<any>().mockReturnValue(r);
  return r;
};
const MINIMAL = {
  scope: "in_scope",
  role: "provider",
  art5_practices: ["none"],
  rbi_law_enforcement: "no",
  intimate_content: "no",
  safety_function: "section_a",
  transparency: ["none"],
};

describe("euAiActClassification.ctrl", () => {
  beforeEach(() => jest.clearAllMocks());

  it("serves the current questionnaire", async () => {
    const r = res();
    await getQuestionnaire(req() as any, r);
    expect(r.status).toHaveBeenCalledWith(200);
    expect(r.json.mock.calls[0][0].data.version).toBe(2);
  });

  it("scores answers without saving", async () => {
    const r = res();
    await scoreAnswers(req({ body: { answers: MINIMAL } }) as any, r);
    expect(r.status).toHaveBeenCalledWith(200);
    expect(r.json.mock.calls[0][0].data.level).toBe("High risk");
    expect(insertClassificationRunQuery).not.toHaveBeenCalled();
  });

  it("rejects invalid answers with 400", async () => {
    const r = res();
    await scoreAnswers(req({ body: { answers: { scope: "maybe" } } }) as any, r);
    expect(r.status).toHaveBeenCalledWith(400);
  });

  it("returns 404 when the use case is not in the organization", async () => {
    (getProjectByIdQuery as jest.Mock<any>).mockResolvedValue(null);
    const r = res();
    await getUseCaseClassification(req({ params: { id: "3" } }) as any, r);
    expect(r.status).toHaveBeenCalledWith(404);
  });

  it("returns the latest run for a use case", async () => {
    (getProjectByIdQuery as jest.Mock<any>).mockResolvedValue({ id: 3 });
    (getLatestRunForUseCaseQuery as jest.Mock<any>).mockResolvedValue({ id: 11 });
    const r = res();
    await getUseCaseClassification(req({ params: { id: "3" } }) as any, r);
    expect(r.json.mock.calls[0][0].data).toEqual({ id: 11 });
  });

  it("saves a run, sets the level and role, and records history in one transaction", async () => {
    (getProjectByIdQuery as jest.Mock<any>).mockResolvedValue({
      id: 3,
      ai_risk_classification: "Minimal risk",
      type_of_high_risk_role: "Deployer",
    });
    (insertClassificationRunQuery as jest.Mock<any>).mockResolvedValue({ id: 12 });
    (setUseCaseClassificationQuery as jest.Mock<any>).mockResolvedValue(true);
    const r = res();
    await classifyUseCase(req({ params: { id: "3" }, body: { answers: MINIMAL } }) as any, r);
    expect(r.status).toHaveBeenCalledWith(200);
    const run = (insertClassificationRunQuery as jest.Mock<any>).mock.calls[0][0] as any;
    expect(run).toMatchObject({ useCaseId: 3, intakeSubmissionId: null, source: "wizard", role: "Provider" });
    expect(setUseCaseClassificationQuery).toHaveBeenCalledWith(3, "High risk", "Provider", 7, 5, expect.anything());
    expect((recordMultipleFieldChanges as jest.Mock<any>).mock.calls[0][3]).toEqual([
      { fieldName: "AI risk classification", oldValue: "Minimal risk", newValue: "High risk" },
      { fieldName: "Type of high-risk role", oldValue: "Deployer", newValue: "Provider" },
    ]);
  });

  it("rolls back and returns 404 when the use case vanished before the update", async () => {
    (getProjectByIdQuery as jest.Mock<any>).mockResolvedValue({ id: 3 });
    (insertClassificationRunQuery as jest.Mock<any>).mockResolvedValue({ id: 12 });
    (setUseCaseClassificationQuery as jest.Mock<any>).mockResolvedValue(false);
    const r = res();
    await classifyUseCase(req({ params: { id: "3" }, body: { answers: MINIMAL } }) as any, r);
    expect(r.status).toHaveBeenCalledWith(404);
  });
});
```

Run: `cd Servers && npx jest controllers/__tests__/euAiActClassification.ctrl.test.ts`
Expected: FAIL with `Cannot find module '../euAiActClassification.ctrl'`.

- [ ] **Step 4: Implement the controller**

```ts
// Servers/controllers/euAiActClassification.ctrl.ts
import { Request, Response } from "express";
import { sequelize } from "../database/db";
import { STATUS_CODE } from "../utils/statusCode.utils";
import { logFailure, logProcessing, logSuccess } from "../utils/logger/logHelper";
import { translateError } from "../utils/i18n.utils";
import { getProjectByIdQuery } from "../utils/project.utils";
import { recordMultipleFieldChanges } from "../utils/useCaseChangeHistory.utils";
import {
  getLatestRunForUseCaseQuery,
  insertClassificationRunQuery,
  setUseCaseClassificationQuery,
} from "../utils/euAiActClassification.utils";
import {
  CURRENT_QUESTIONNAIRE_VERSION,
  getQuestionnaire as getQuestionnaireDefinition,
  scoreClassification,
  validateAnswers,
} from "../services/euAiActClassification";

const parseId = (value: unknown) => parseInt(Array.isArray(value) ? value[0] : String(value), 10);

const validate = (raw: unknown) =>
  validateAnswers(getQuestionnaireDefinition(CURRENT_QUESTIONNAIRE_VERSION)!, raw);

export async function getQuestionnaire(_req: Request, res: Response) {
  return res
    .status(200)
    .json(STATUS_CODE[200](getQuestionnaireDefinition(CURRENT_QUESTIONNAIRE_VERSION)));
}

export async function scoreAnswers(req: Request, res: Response) {
  const { errors, answers } = validate(req.body?.answers);
  if (errors.length > 0) {
    return res.status(400).json(
      STATUS_CODE[400]({
        message: req.t!("The EU AI Act risk classification answers are invalid"),
        errors,
      }),
    );
  }
  return res
    .status(200)
    .json(STATUS_CODE[200](scoreClassification(CURRENT_QUESTIONNAIRE_VERSION, answers)));
}

export async function getUseCaseClassification(req: Request, res: Response) {
  const useCaseId = parseId(req.params.id);
  try {
    const project = await getProjectByIdQuery(useCaseId, req.organizationId!);
    if (!project) return res.status(404).json(STATUS_CODE[404]({}));
    const run = await getLatestRunForUseCaseQuery(useCaseId, req.organizationId!);
    return res.status(200).json(STATUS_CODE[200](run));
  } catch (error) {
    return res.status(500).json(STATUS_CODE[500](translateError(req, error)));
  }
}

export async function classifyUseCase(req: Request, res: Response) {
  const useCaseId = parseId(req.params.id);
  logProcessing({
    description: `classifying use case ${useCaseId} with the EU AI Act questionnaire`,
    functionName: "classifyUseCase",
    fileName: "euAiActClassification.ctrl.ts",
    userId: req.userId!,
    organizationId: req.organizationId!,
  });

  const { errors, answers } = validate(req.body?.answers);
  if (errors.length > 0) {
    return res.status(400).json(
      STATUS_CODE[400]({
        message: req.t!("The EU AI Act risk classification answers are invalid"),
        errors,
      }),
    );
  }

  const transaction = await sequelize.transaction();
  try {
    const project = await getProjectByIdQuery(useCaseId, req.organizationId!);
    if (!project) {
      await transaction.rollback();
      return res.status(404).json(STATUS_CODE[404]({}));
    }

    const result = scoreClassification(CURRENT_QUESTIONNAIRE_VERSION, answers);
    const run = await insertClassificationRunQuery(
      {
        useCaseId,
        intakeSubmissionId: null,
        questionnaireVersion: CURRENT_QUESTIONNAIRE_VERSION,
        role: result.role,
        answers,
        result,
        reviewerLevel: null,
        reviewerJustification: null,
        reviewedBy: null,
        source: "wizard",
        createdBy: req.userId!,
      },
      req.organizationId!,
      transaction,
    );

    const updated = await setUseCaseClassificationQuery(
      useCaseId,
      result.level,
      result.role,
      req.userId!,
      req.organizationId!,
      transaction,
    );
    if (!updated) {
      await transaction.rollback();
      return res.status(404).json(STATUS_CODE[404]({}));
    }

    const changes: Array<{ fieldName: string; oldValue: string; newValue: string }> = [];
    if ((project.ai_risk_classification ?? "-") !== result.level) {
      changes.push({
        fieldName: "AI risk classification",
        oldValue: String(project.ai_risk_classification ?? "-"),
        newValue: result.level,
      });
    }
    if (result.role && (project.type_of_high_risk_role ?? "-") !== result.role) {
      changes.push({
        fieldName: "Type of high-risk role",
        oldValue: String(project.type_of_high_risk_role ?? "-"),
        newValue: result.role,
      });
    }
    if (changes.length > 0) {
      await recordMultipleFieldChanges(useCaseId, req.userId!, req.organizationId!, changes, transaction);
    }

    await transaction.commit();
    await logSuccess({
      eventType: "Update",
      description: `use case ${useCaseId} classified as ${result.level}`,
      functionName: "classifyUseCase",
      fileName: "euAiActClassification.ctrl.ts",
      userId: req.userId!,
      organizationId: req.organizationId!,
    });
    return res.status(200).json(STATUS_CODE[200]({ run, result }));
  } catch (error) {
    await transaction.rollback();
    await logFailure({
      eventType: "Update",
      description: `failed to classify use case ${useCaseId}`,
      functionName: "classifyUseCase",
      fileName: "euAiActClassification.ctrl.ts",
      error: error as Error,
      userId: req.userId!,
      organizationId: req.organizationId!,
    });
    return res.status(500).json(STATUS_CODE[500](translateError(req, error)));
  }
}
```

The history field labels match `Servers/config/changeHistory.config.ts` (`ai_risk_classification: "AI risk classification"`, `type_of_high_risk_role: "Type of high-risk role"`).

- [ ] **Step 5: Run the controller tests**

Run: `cd Servers && npx jest controllers/__tests__/euAiActClassification.ctrl.test.ts`
Expected: PASS, 7 tests.

Then pin who may classify. In `Servers/config/__tests__/rolePermissions.config.test.ts`, add a case next to "Reviewer holds only contributor and reader-tier permissions", using the same helper those cases use to read a built-in role's permission set:

```ts
it("only Admin and Editor may classify a use case", () => {
  // <permissionsOf> is the helper used by the Reviewer/Auditor cases above.
  expect(permissionsOf("Admin")).toContain("useCase.classify");
  expect(permissionsOf("Editor")).toContain("useCase.classify");
  expect(permissionsOf("Reviewer")).not.toContain("useCase.classify");
  expect(permissionsOf("Auditor")).not.toContain("useCase.classify");
});
```

In that file the helper is `keysFor(role)` (line ~28, returns `Set<PermissionKey>`), so write `expect(keysFor("Auditor").has("useCase.classify")).toBe(false)` and so on; read lines 20-105 first to match.

Then add the route cases to `Servers/tests/integration/tenant-isolation/eu-ai-act-classifications.isolation.test.ts` (from Task 4), inside its `describe`:

```ts
  it("route: the owner can read the classification, another organization gets 404", async () => {
    const { owner, attacker } = await seedTwoTenantContexts();
    const projectId = await createTestProject(owner.orgId, owner.userId);
    // Positive control first, so a missing route cannot pass as "isolated".
    expect((await owner.request.get(`/api/projects/${projectId}/eu-ai-act-classification`)).status).toBe(200);
    expect((await attacker.request.get(`/api/projects/${projectId}/eu-ai-act-classification`)).status).toBe(404);
  });

  it("route: an Editor can classify; Reviewer and Auditor cannot", async () => {
    const editor = (await seedTwoTenantContexts(3)).owner;
    const editorProject = await createTestProject(editor.orgId, editor.userId);
    const ok = await editor.request
      .post(`/api/projects/${editorProject}/eu-ai-act-classification`)
      .send({ answers: { scope: "research_only" } });
    expect(ok.status).toBe(200);

    for (const roleId of [2, 4]) {
      await cleanupDatabase();
      const { owner } = await seedTwoTenantContexts(roleId);
      const projectId = await createTestProject(owner.orgId, owner.userId);
      const denied = await owner.request
        .post(`/api/projects/${projectId}/eu-ai-act-classification`)
        .send({ answers: { scope: "research_only" } });
      expect(denied.status).toBe(403);
    }
  });
```

(`seedTwoTenantContexts(roleId)` seeds both users with that built-in role id: 2 Reviewer, 3 Editor, 4 Auditor.)

- [ ] **Step 6: Wire the routes**

```ts
// Servers/routes/euAiActClassification.route.ts
import express from "express";
import authenticateJWT from "../middleware/auth.middleware";
import { getQuestionnaire, scoreAnswers } from "../controllers/euAiActClassification.ctrl";

const router = express.Router();

router.get("/questionnaire", authenticateJWT, getQuestionnaire);
router.post("/score", authenticateJWT, scoreAnswers);

export default router;
```

In `Servers/routes/project.route.ts` add the imports

```ts
import authorize from "../middleware/accessControl.middleware";
import {
  classifyUseCase,
  getUseCaseClassification,
} from "../controllers/euAiActClassification.ctrl";
```

and, next to the other `/:id` routes:

```ts
router.get("/:id/eu-ai-act-classification", authenticateJWT, getUseCaseClassification);
router.post(
  "/:id/eu-ai-act-classification",
  authenticateJWT,
  authorize("useCase.classify"),
  classifyUseCase,
);
```

In `Servers/app.ts`, import `euAiActClassificationRoutes from "./routes/euAiActClassification.route"` with the other route imports, and add `app.use("/api/eu-ai-act-classification", euAiActClassificationRoutes);` next to `app.use("/api/projects", projectRoutes);`.

- [ ] **Step 7: Regenerate API docs and run gates**

```bash
cd Servers && npm run generate:swagger && npm run generate:endpoints && npm run check:api-drift
npx tsc --noEmit && npx jest config controllers/__tests__/euAiActClassification.ctrl.test.ts && npm run i18n:audit:strict && npm run format-check
```
Expected: drift check passes; jest PASS (including `rolePermissions.config.test.ts`); audit 0 missing.

- [ ] **Step 8: Commit**

```bash
git add Servers/controllers/euAiActClassification.ctrl.ts Servers/controllers/__tests__/euAiActClassification.ctrl.test.ts Servers/routes Servers/app.ts Servers/config Servers/locales Servers/swagger.yaml Servers/tests/integration/tenant-isolation docs/api-docs/src/config/endpoints.ts
git commit -m "feat(eu-ai-act): add questionnaire, scoring and use case classification endpoints"
```

---

### Task 6: Intake form setting and public form definition

**Files:**
- Modify: `Servers/domain.layer/interfaces/i.intakeForm.ts` (`IIntakeForm`, `ICreateIntakeFormInput`, `IUpdateIntakeFormInput`, `IPublicIntakeForm`)
- Modify: `Servers/domain.layer/models/intakeForm/intakeForm.model.ts` (column + `toJSON`-style mapping near line 260)
- Modify: `Servers/utils/intakeForm.utils.ts` (`FORM_SELECT_COLUMNS`, `getFormByPublicIdQuery`, `getActivePublicFormQuery`, `createIntakeFormQuery`, `updateIntakeFormQuery`)
- Modify: `Servers/utils/intakeFormSchema.validation.ts` (new `validateEuAiActRiskStepSetting`)
- Modify: `Servers/controllers/intakeForm.ctrl.ts` (`createIntakeForm`, `updateIntakeForm`, `getPublicFormByPublicId`, `getPublicForm`)
- Modify: `Servers/locales/{en,de,fr}.json`
- Test: `Servers/utils/__tests__/intakeFormSchema.euAiActStep.test.ts`

**Interfaces:**
- Consumes: Task 2 `getQuestionnaire`, `CURRENT_QUESTIONNAIRE_VERSION`; Task 4 `getLatestRunForSubmissionQuery`.
- Produces: form property `euAiActRiskStepEnabled: boolean`; `resolveEuAiActRiskStep(input: { entityType: string; enabled: boolean; schema?: IIntakeFormSchema | null }): { enabled: boolean; errors: string[] }` (forces the step off on non-use-case forms, rejects it with a risk mapping); public GET responses gain `euAiActRiskStep: { questionnaire: Questionnaire } | null` and `previousRiskAnswers?: Answers`.

- [ ] **Step 1: Write the failing validator test**

```ts
// Servers/utils/__tests__/intakeFormSchema.euAiActStep.test.ts
import { describe, it, expect } from "@jest/globals";
import { resolveEuAiActRiskStep } from "../intakeFormSchema.validation";

const field = (entityFieldMapping?: string) =>
  ({ id: "f1", label: "Risk", type: "select", options: [{ label: "High", value: "high" }], entityFieldMapping }) as any;

describe("resolveEuAiActRiskStep", () => {
  it("allows the step on a use case form without a risk mapping", () => {
    expect(
      resolveEuAiActRiskStep({ entityType: "use_case", enabled: true, schema: { version: "1.0", fields: [field("goal")] } as any }),
    ).toEqual({ enabled: true, errors: [] });
  });

  it("forces the step off on a model form", () => {
    expect(resolveEuAiActRiskStep({ entityType: "model", enabled: true, schema: null })).toEqual({
      enabled: false,
      errors: [],
    });
  });

  it("rejects the step together with a question mapped to ai_risk_classification", () => {
    expect(
      resolveEuAiActRiskStep({ entityType: "use_case", enabled: true, schema: { version: "1.0", fields: [field("ai_risk_classification")] } as any }),
    ).toEqual({
      enabled: true,
      errors: [
        "Remove the AI risk classification mapping from the form's questions before turning on the EU AI Act risk classification step",
      ],
    });
  });

  it("allows a risk mapping when the step is off", () => {
    expect(
      resolveEuAiActRiskStep({ entityType: "use_case", enabled: false, schema: { version: "1.0", fields: [field("ai_risk_classification")] } as any }),
    ).toEqual({ enabled: false, errors: [] });
  });
});
```

Run: `cd Servers && npx jest utils/__tests__/intakeFormSchema.euAiActStep.test.ts`
Expected: FAIL (`resolveEuAiActRiskStep` is not a function).

- [ ] **Step 2: Implement the validator**

Append to `Servers/utils/intakeFormSchema.validation.ts`:

```ts
/**
 * The EU AI Act risk step sets the use case's AI risk classification. It only
 * exists on use case forms (forced off elsewhere) and cannot coexist with a
 * question mapped to that field.
 */
export function resolveEuAiActRiskStep(input: {
  entityType: string;
  enabled: boolean;
  schema?: IIntakeFormSchema | null;
}): { enabled: boolean; errors: string[] } {
  const enabled = input.enabled && input.entityType === "use_case";
  if (!enabled) return { enabled: false, errors: [] };
  const mapped = (input.schema?.fields ?? []).some(
    (f) => f?.entityFieldMapping === "ai_risk_classification",
  );
  return {
    enabled,
    errors: mapped
      ? [
          "Remove the AI risk classification mapping from the form's questions before turning on the EU AI Act risk classification step",
        ]
      : [],
  };
}
```

Run the test again. Expected: PASS, 4 tests.

- [ ] **Step 3: Add the messages to the locales**

| Key (en = key) | de | fr |
| --- | --- | --- |
| `Remove the AI risk classification mapping from the form's questions before turning on the EU AI Act risk classification step` | `Entfernen Sie die Zuordnung zur KI-Risikoklassifizierung aus den Fragen des Formulars, bevor Sie den Schritt zur Risikoklassifizierung nach dem EU AI Act aktivieren` | `Supprimez l'association à la classification des risques IA des questions du formulaire avant d'activer l'étape de classification des risques selon l'AI Act de l'UE` |

- [ ] **Step 4: Thread the column through interfaces, model and queries**

- `i.intakeForm.ts`: add `euAiActRiskStepEnabled: boolean;` to `IIntakeForm` and `IPublicIntakeForm`; add `euAiActRiskStepEnabled?: boolean;` to `ICreateIntakeFormInput` and `IUpdateIntakeFormInput`.
- `intakeForm.model.ts`: add, next to the `suggested_questions_enabled` column,

```ts
  @Column({
    type: DataType.BOOLEAN,
    allowNull: false,
    defaultValue: false,
    field: "eu_ai_act_risk_step_enabled",
  })
  euAiActRiskStepEnabled!: boolean;
```

and `euAiActRiskStepEnabled: this.euAiActRiskStepEnabled,` next to `suggestedQuestionsEnabled: this.suggestedQuestionsEnabled,` (line ~260). Match the decorator style of the neighbouring column exactly.
- `intakeForm.utils.ts`:
  - `FORM_SELECT_COLUMNS`: add `eu_ai_act_risk_step_enabled as "euAiActRiskStepEnabled",` after the suggested-questions line.
  - `getFormByPublicIdQuery` and `getActivePublicFormQuery`: add `eu_ai_act_risk_step_enabled as "euAiActRiskStepEnabled",` to their SELECT lists.
  - `createIntakeFormQuery`: add `eu_ai_act_risk_step_enabled` to the column list, `:euAiActRiskStepEnabled` to VALUES, and `euAiActRiskStepEnabled: data.euAiActRiskStepEnabled || false,` to replacements.
  - `updateIntakeFormQuery`: after the `suggestedQuestionsEnabled` block,

```ts
  if (data.euAiActRiskStepEnabled !== undefined) {
    updates.push("eu_ai_act_risk_step_enabled = :euAiActRiskStepEnabled");
    replacements.euAiActRiskStepEnabled = data.euAiActRiskStepEnabled;
  }
```

- [ ] **Step 5: Validate on create and update**

In `createIntakeForm`, add `euAiActRiskStepEnabled` to the `req.body` destructuring, then after the `schemaErrors` check:

```ts
    const riskStep = resolveEuAiActRiskStep({
      entityType,
      enabled: Boolean(euAiActRiskStepEnabled),
      schema,
    });
    if (riskStep.errors.length > 0) {
      await transaction.rollback();
      return res.status(400).json(STATUS_CODE[400](req.t!(riskStep.errors[0])));
    }
```

and pass `euAiActRiskStepEnabled: riskStep.enabled,` to `createIntakeFormQuery`.

In `updateIntakeForm`, add `euAiActRiskStepEnabled` to its destructuring, then after its `schemaErrors` check:

```ts
    const riskStep = resolveEuAiActRiskStep({
      entityType: entityType ?? existingForm.entityType,
      enabled: euAiActRiskStepEnabled ?? existingForm.euAiActRiskStepEnabled,
      schema: schema ?? existingForm.schema,
    });
    if (riskStep.errors.length > 0) {
      await transaction.rollback();
      return res.status(400).json(STATUS_CODE[400](req.t!(riskStep.errors[0])));
    }
```

and pass `euAiActRiskStepEnabled: riskStep.enabled,` to `updateIntakeFormQuery` (so changing a form to a model form also turns the step off). If `updateIntakeForm` has no transaction at that point, drop the `rollback` line. Import `resolveEuAiActRiskStep` next to `validateIntakeFormSchemaLabels`.

- [ ] **Step 6: Return the definition and previous answers from both public GETs**

In `getPublicFormByPublicId` and `getPublicForm`:
- where `previousData` is set from `previousSubmission`, also set `previousRiskAnswers = (await getLatestRunForSubmissionQuery(previousSubmission.id, <orgId>))?.answers;` (`<orgId>` is `tenantInfo.orgId` in the by-id handler and `tenantInfo.id` in the slug handler), declaring `let previousRiskAnswers: Answers | undefined;` next to `previousData`.
- add to the response object, after `previousSubmitterEmail`:

```ts
        euAiActRiskStep: form.euAiActRiskStepEnabled
          ? { questionnaire: getQuestionnaire(CURRENT_QUESTIONNAIRE_VERSION) }
          : null,
        previousRiskAnswers,
```

Import `getQuestionnaire`, `CURRENT_QUESTIONNAIRE_VERSION` and type `Answers` from `../services/euAiActClassification`, and `getLatestRunForSubmissionQuery` from `../utils/euAiActClassification.utils`.

- [ ] **Step 7: Gates and commit**

```bash
cd Servers && npx tsc --noEmit && npx jest utils/__tests__/intakeFormSchema controllers/__tests__/intakeForm && npm run i18n:audit:strict && npm run format-check
git add Servers/domain.layer Servers/utils Servers/controllers/intakeForm.ctrl.ts Servers/locales
git commit -m "feat(intake): per-form EU AI Act risk step setting and public definition"
```

(If `controllers/__tests__/intakeForm*` does not exist, run `npx jest intakeForm` to cover any intake suites.)

---

### Task 7: Intake submission validates, scores and stores the run

**Files:**
- Create: `Servers/services/euAiActClassification/intakeStep.ts`
- Modify: `Servers/services/euAiActClassification/index.ts` (export)
- Modify: `Servers/controllers/intakeForm.ctrl.ts` (`submitPublicFormByPublicId`, `submitPublicForm`)
- Test: `Servers/services/euAiActClassification/__tests__/intakeStep.test.ts`

**Interfaces:**
- Consumes: Task 2, Task 4 `insertClassificationRunQuery`.
- Produces: `prepareIntakeRiskStep(enabled: boolean, rawAnswers: unknown, now?: Date): { ok: true; prepared: PreparedRun | null } | { ok: false; message: string; errors: string[] }` with `PreparedRun = { questionnaireVersion: number; answers: Answers; result: ClassificationResult }`.

- [ ] **Step 1: Write the failing tests**

```ts
// Servers/services/euAiActClassification/__tests__/intakeStep.test.ts
import { describe, it, expect } from "@jest/globals";
import { prepareIntakeRiskStep } from "../intakeStep";

const ANSWERS = {
  scope: "in_scope",
  role: "deployer",
  art5_practices: ["none"],
  rbi_law_enforcement: "no",
  intimate_content: "no",
  safety_function: "no",
  annex_iii_areas: ["none"],
  transparency: ["interacts"],
};

describe("prepareIntakeRiskStep", () => {
  it("does nothing when the step is off, even if answers are sent", () => {
    expect(prepareIntakeRiskStep(false, ANSWERS)).toEqual({ ok: true, prepared: null });
  });

  it("requires answers when the step is on", () => {
    expect(prepareIntakeRiskStep(true, undefined)).toEqual({
      ok: false,
      message: "Complete the EU AI Act risk classification step",
      errors: [],
    });
  });

  it("rejects tampered answers, including a client-sent level", () => {
    const outcome = prepareIntakeRiskStep(true, { ...ANSWERS, level: "Minimal risk" });
    expect(outcome.ok).toBe(false);
  });

  it("scores valid answers on the server", () => {
    const outcome = prepareIntakeRiskStep(true, ANSWERS);
    expect(outcome.ok && outcome.prepared?.result.level).toBe("Limited risk");
    expect(outcome.ok && outcome.prepared?.questionnaireVersion).toBe(2);
  });
});
```

Run: `cd Servers && npx jest services/euAiActClassification/__tests__/intakeStep.test.ts` → FAIL (module missing).

- [ ] **Step 2: Implement**

```ts
// Servers/services/euAiActClassification/intakeStep.ts
import { CURRENT_QUESTIONNAIRE_VERSION, getQuestionnaire, scoreClassification } from "./registry";
import { validateAnswers } from "./validate";
import { Answers, ClassificationResult } from "./types";

export interface PreparedRun {
  questionnaireVersion: number;
  answers: Answers;
  result: ClassificationResult;
}

export type IntakeStepOutcome =
  | { ok: true; prepared: PreparedRun | null }
  | { ok: false; message: string; errors: string[] };

/**
 * Validate and score a public submission's risk step. Returns null when the
 * form has no step. Anything the client sends besides answers is ignored or
 * rejected; the level always comes from the server.
 */
export const prepareIntakeRiskStep = (
  enabled: boolean,
  rawAnswers: unknown,
  now: Date = new Date(),
): IntakeStepOutcome => {
  if (!enabled) return { ok: true, prepared: null };
  if (rawAnswers === undefined || rawAnswers === null) {
    return { ok: false, message: "Complete the EU AI Act risk classification step", errors: [] };
  }
  const version = CURRENT_QUESTIONNAIRE_VERSION;
  const { errors, answers } = validateAnswers(getQuestionnaire(version)!, rawAnswers);
  if (errors.length > 0) {
    return { ok: false, message: "The EU AI Act risk classification answers are invalid", errors };
  }
  return {
    ok: true,
    prepared: { questionnaireVersion: version, answers, result: scoreClassification(version, answers, now) },
  };
};
```

Add `export { prepareIntakeRiskStep } from "./intakeStep";` and `export type { PreparedRun } from "./intakeStep";` to `index.ts`. (`intakeStep.ts` imports `./registry`, so there is no cycle.)

Run the tests. Expected: PASS, 4 tests.

- [ ] **Step 3: Use it in both submit handlers**

Merge these into the controller's existing import statements (Task 6 already imports from both modules; a second `import` line from the same module is fine in TS, but a repeated name is a TS2300 error): `prepareIntakeRiskStep` from `../services/euAiActClassification`, and `insertClassificationRunQuery` from `../utils/euAiActClassification.utils`.

In `submitPublicFormByPublicId` and `submitPublicForm`, destructure `euAiActRiskAnswers` from `req.body` with the other fields. Right after the `validateFormData` block (before the CAPTCHA check), add:

```ts
    const riskStep = prepareIntakeRiskStep(
      Boolean(form.euAiActRiskStepEnabled),
      euAiActRiskAnswers,
    );
    if (!riskStep.ok) {
      return res.status(400).json(
        STATUS_CODE[400]({ message: req.t!(riskStep.message), errors: riskStep.errors }),
      );
    }
```

Inside the transaction, right after `createSubmissionQuery(...)` returns `submission`:

```ts
      if (riskStep.prepared) {
        await insertClassificationRunQuery(
          {
            useCaseId: null,
            intakeSubmissionId: submission.id,
            questionnaireVersion: riskStep.prepared.questionnaireVersion,
            role: riskStep.prepared.result.role,
            answers: riskStep.prepared.answers,
            result: riskStep.prepared.result,
            reviewerLevel: null,
            reviewerJustification: null,
            reviewedBy: null,
            source: "intake",
            createdBy: null,
          },
          <orgId>,
          transaction,
        );
      }
```

(`<orgId>` = `tenantInfo.orgId` by id, `tenantInfo.id` by slug.) The 201 response is unchanged: it must not include the classification.

- [ ] **Step 4: Controller test for both routes**

Create the test file with this shared setup (Task 8 adds more cases to the same file):

```ts
// Servers/controllers/__tests__/intakeForm.riskStep.test.ts
import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import { createHmac } from "crypto";

// intakeForm.ctrl.ts throws at import without a signing secret (CI's coverage
// job sets none), so set one before the controller is required below.
process.env.JWT_SECRET = process.env.JWT_SECRET || "intake-risk-step-test-secret";

jest.mock("../../utils/intakeForm.utils", () => ({
  getTenantByPublicId: jest.fn(),
  getTenantHashBySlug: jest.fn(),
  checkRateLimitQuery: jest.fn(),
  getFormByPublicIdQuery: jest.fn(),
  getActivePublicFormQuery: jest.fn(),
  getIntakeFormByIdQuery: jest.fn(),
  createSubmissionQuery: jest.fn(),
  getSubmissionByIdQuery: jest.fn(),
  approveSubmissionQuery: jest.fn(),
  updateSubmissionRiskQuery: jest.fn<any>().mockResolvedValue(undefined),
  updateSubmissionRiskOverrideQuery: jest.fn<any>().mockResolvedValue(undefined),
}));
jest.mock("../../utils/euAiActClassification.utils", () => ({
  insertClassificationRunQuery: jest.fn(),
  getLatestRunForSubmissionQuery: jest.fn(),
}));
jest.mock("../../utils/project.utils", () => ({ createNewProjectQuery: jest.fn() }));
jest.mock("../../utils/modelInventory.utils", () => ({ createNewModelInventoryQuery: jest.fn() }));
jest.mock("../../utils/useCaseChangeHistory.utils", () => ({
  recordMultipleFieldChanges: jest.fn<any>().mockResolvedValue(undefined),
}));
jest.mock("../../services/intakeFormEmail.service", () => ({
  sendSubmissionReceivedEmail: jest.fn<any>().mockResolvedValue(undefined),
  sendNewSubmissionAdminNotification: jest.fn<any>().mockResolvedValue(undefined),
  sendSubmissionApprovedEmail: jest.fn<any>().mockResolvedValue(undefined),
  sendSubmissionRejectedEmail: jest.fn<any>().mockResolvedValue(undefined),
}));
jest.mock("../../services/intakeRiskScoring.service", () => ({
  calculateSubmissionRisk: jest.fn<any>().mockResolvedValue({}),
}));
jest.mock("../../services/intakeLLM.service", () => ({
  generateSuggestedQuestions: jest.fn(),
  generateFieldGuidance: jest.fn(),
}));
jest.mock("../../utils/aiTrustCentre.utils", () => ({ getCompanyLogoQuery: jest.fn() }));
jest.mock("../../utils/logger/fileLogger", () => ({
  __esModule: true,
  default: { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() },
}));
jest.mock("../../utils/logger/logHelper", () => ({
  logProcessing: jest.fn(),
  logSuccess: jest.fn<any>().mockResolvedValue(undefined),
  logFailure: jest.fn<any>().mockResolvedValue(undefined),
}));
jest.mock("../../utils/i18n.utils", () => ({
  translateError: jest.fn((_, err) => (err as Error).message),
}));
jest.mock("../../utils/statusCode.utils", () => ({
  STATUS_CODE: {
    200: (d: any) => ({ message: "OK", data: d }),
    201: (d: any) => ({ message: "Created", data: d }),
    400: (d: any) => ({ message: "Bad Request", data: d }),
    404: (d: any) => ({ message: "Not Found", data: d }),
    429: (d: any) => ({ message: "Too Many Requests", data: d }),
    500: (d: any) => ({ message: "Internal Server Error", data: d }),
  },
}));
jest.mock("../../database/db", () => ({
  sequelize: { transaction: jest.fn<any>().mockResolvedValue({ commit: jest.fn(), rollback: jest.fn() }) },
}));

/* eslint-disable @typescript-eslint/no-require-imports */
const ctrl = require("../intakeForm.ctrl") as typeof import("../intakeForm.ctrl");
const intake = require("../../utils/intakeForm.utils");
const runs = require("../../utils/euAiActClassification.utils");
const projects = require("../../utils/project.utils");
const history = require("../../utils/useCaseChangeHistory.utils");
/* eslint-enable @typescript-eslint/no-require-imports */

/** Same format as the controller's private createSignedToken. */
const sign = (payload: object) => {
  const data = JSON.stringify(payload);
  const secret = (process.env.JWT_SECRET || process.env.ENCRYPTION_KEY)!;
  const signature = createHmac("sha256", secret).update(data).digest("hex");
  return Buffer.from(JSON.stringify({ data, signature })).toString("base64");
};
const req = (overrides: any = {}) => ({
  userId: 7,
  organizationId: 5,
  ip: "127.0.0.1",
  headers: {},
  lang: "en",
  t: (k: string) => k,
  params: {},
  body: {},
  ...overrides,
});
const res = () => {
  const r: any = {};
  r.status = jest.fn<any>().mockReturnValue(r);
  r.json = jest.fn<any>().mockReturnValue(r);
  return r;
};
const ANSWERS = {
  scope: "in_scope",
  role: "deployer",
  art5_practices: ["none"],
  rbi_law_enforcement: "no",
  intimate_content: "no",
  safety_function: "no",
  annex_iii_areas: ["none"],
  transparency: ["interacts"],
};
const FORM = { id: 1, name: "F", entityType: "use_case", euAiActRiskStepEnabled: true, publicId: "abc" };
```

```ts
const ROUTES = {
  byId: { handler: ctrl.submitPublicFormByPublicId, params: { publicId: "abc" } },
  bySlug: { handler: ctrl.submitPublicForm, params: { tenantSlug: "t", formSlug: "f" } },
};
const submitBody = (extra: object = {}) => ({
  submitterEmail: "a@b.co",
  formData: {},
  captchaToken: sign({ answer: 4, timestamp: Date.now() }),
  captchaAnswer: 4,
  ...extra,
});
const submit = async (route: keyof typeof ROUTES, body: object) => {
  const r = res();
  await ROUTES[route].handler(req({ params: ROUTES[route].params, body }) as any, r);
  return r;
};

describe("public submit with the EU AI Act step", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    intake.getTenantByPublicId.mockResolvedValue({ orgId: 5 });
    intake.getTenantHashBySlug.mockResolvedValue({ id: 5 });
    intake.checkRateLimitQuery.mockResolvedValue(true);
    intake.getFormByPublicIdQuery.mockResolvedValue(FORM);
    intake.getActivePublicFormQuery.mockResolvedValue(FORM);
    intake.getIntakeFormByIdQuery.mockResolvedValue({
      ...FORM,
      schema: { version: "1.0", fields: [] },
      recipients: [],
      riskTierSystem: "eu_ai_act",
      llmKeyId: null,
    });
    intake.createSubmissionQuery.mockResolvedValue({ id: 99 });
    runs.insertClassificationRunQuery.mockResolvedValue({ id: 1 });
  });

  it.each(["byId", "bySlug"] as const)("%s: 400 when the step is on and answers are missing", async (route) => {
    const r = await submit(route, submitBody());
    expect(r.status).toHaveBeenCalledWith(400);
    expect(intake.createSubmissionQuery).not.toHaveBeenCalled();
  });

  it.each(["byId", "bySlug"] as const)("%s: 400 for tampered answers", async (route) => {
    const r = await submit(route, submitBody({ euAiActRiskAnswers: { ...ANSWERS, level: "Minimal risk" } }));
    expect(r.status).toHaveBeenCalledWith(400);
    expect(runs.insertClassificationRunQuery).not.toHaveBeenCalled();
  });

  it.each(["byId", "bySlug"] as const)("%s: stores a server-scored run and returns no classification", async (route) => {
    const r = await submit(route, submitBody({ euAiActRiskAnswers: ANSWERS, level: "Minimal risk" }));
    expect(r.status).toHaveBeenCalledWith(201);
    const run = runs.insertClassificationRunQuery.mock.calls[0][0];
    expect(run).toMatchObject({ intakeSubmissionId: 99, useCaseId: null, source: "intake", createdBy: null });
    expect(run.result.level).toBe("Limited risk");
    const data = r.json.mock.calls[0][0].data;
    expect(data).not.toHaveProperty("result");
    expect(data).not.toHaveProperty("level");
  });

  it.each(["byId", "bySlug"] as const)("%s: stores nothing when the form has no step", async (route) => {
    intake.getFormByPublicIdQuery.mockResolvedValue({ ...FORM, euAiActRiskStepEnabled: false });
    intake.getActivePublicFormQuery.mockResolvedValue({ ...FORM, euAiActRiskStepEnabled: false });
    const r = await submit(route, submitBody());
    expect(r.status).toHaveBeenCalledWith(201);
    expect(runs.insertClassificationRunQuery).not.toHaveBeenCalled();
  });
});
```

If the slug handler reads more fields from `getTenantHashBySlug`'s result than `id`, add them to that mock.

Run: `cd Servers && npx jest controllers/__tests__/intakeForm.riskStep.test.ts services/euAiActClassification`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd Servers && npx tsc --noEmit && npm run format-check
git add Servers/services/euAiActClassification Servers/controllers
git commit -m "feat(intake): validate, score and store the EU AI Act step on public submissions"
```

---

### Task 8: Review preview and approval carry-over

**Files:**
- Modify: `Servers/controllers/intakeForm.ctrl.ts` (`getSubmissionPreview`, `approveSubmission`)
- Modify: `Servers/locales/{en,de,fr}.json`
- Test: `Servers/controllers/__tests__/intakeForm.approveRiskStep.test.ts`

**Interfaces:**
- Consumes: Tasks 2 and 4; `recordMultipleFieldChanges`.
- Produces: preview response key `euAiActClassification: { questionnaire: Questionnaire; answers: Answers; role: ClassificationRole | null; current: ClassificationResult; changedSinceSubmission: boolean; submittedAt: Date } | null`; approve body accepts `euAiActOverride?: { level: string; justification: string }`.

- [ ] **Step 1: Locale keys**

| Key (en = key) | de | fr |
| --- | --- | --- |
| `A justification of at least 10 characters is required when changing the computed EU AI Act classification` | `Eine Begründung von mindestens 10 Zeichen ist erforderlich, wenn Sie die berechnete Klassifizierung nach dem EU AI Act ändern` | `Une justification d'au moins 10 caractères est requise pour modifier la classification calculée selon l'AI Act de l'UE` |
| `Invalid EU AI Act classification level` | `Ungültige Klassifizierungsstufe nach dem EU AI Act` | `Niveau de classification selon l'AI Act de l'UE non valide` |

- [ ] **Step 2: Write the failing approval tests**

Append to `Servers/controllers/__tests__/intakeForm.riskStep.test.ts` (Task 7's file, which already has the mocks and helpers):

```ts
const RUN = {
  id: 3,
  questionnaireVersion: 2,
  role: "Deployer",
  answers: ANSWERS,
  result: { questionnaireVersion: 2, level: "Limited risk", role: "Deployer", reasons: [], obligations: [] },
  createdAt: new Date("2026-10-08T00:00:00Z"),
};
const approve = async (body: object) => {
  const r = res();
  await ctrl.approveSubmission(req({ params: { id: "9" }, body }) as any, r);
  return r;
};

describe("approval with the EU AI Act step", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    intake.getSubmissionByIdQuery.mockResolvedValue({
      id: 9,
      status: "pending",
      formId: 1,
      entityType: "use_case",
      data: {},
      submitterEmail: null,
    });
    intake.getIntakeFormByIdQuery.mockResolvedValue({ id: 1, name: "F", schema: { version: "1.0", fields: [] } });
    intake.approveSubmissionQuery.mockResolvedValue({ id: 9 });
    projects.createNewProjectQuery.mockResolvedValue({ id: 50 });
    runs.insertClassificationRunQuery.mockResolvedValue({ id: 4 });
  });

  it("without a run, approval behaves as before", async () => {
    runs.getLatestRunForSubmissionQuery.mockResolvedValue(null);
    const r = await approve({ confirmedEntityData: { project_title: "P", ai_risk_classification: "high" } });
    expect(r.status).toHaveBeenCalledWith(200);
    expect(projects.createNewProjectQuery.mock.calls[0][0].ai_risk_classification).toBe("High risk");
    expect(runs.insertClassificationRunQuery).not.toHaveBeenCalled();
  });

  it("sets the computed level and role, copies the run and records history", async () => {
    runs.getLatestRunForSubmissionQuery.mockResolvedValue(RUN);
    const r = await approve({ confirmedEntityData: { project_title: "P", ai_risk_classification: "minimal" } });
    expect(r.status).toHaveBeenCalledWith(200);
    expect(projects.createNewProjectQuery.mock.calls[0][0]).toMatchObject({
      ai_risk_classification: "Limited risk",
      type_of_high_risk_role: "Deployer",
    });
    expect(runs.insertClassificationRunQuery.mock.calls[0][0]).toMatchObject({
      useCaseId: 50,
      intakeSubmissionId: null,
      source: "intake",
      reviewerLevel: null,
    });
    expect(history.recordMultipleFieldChanges.mock.calls[0][3]).toEqual([
      {
        fieldName: "AI risk classification",
        oldValue: "-",
        newValue: "Limited risk (from the intake EU AI Act classification)",
      },
    ]);
  });

  it("rejects a changed level without a justification", async () => {
    runs.getLatestRunForSubmissionQuery.mockResolvedValue(RUN);
    const r = await approve({ euAiActOverride: { level: "High risk", justification: "short" } });
    expect(r.status).toHaveBeenCalledWith(400);
    expect(projects.createNewProjectQuery).not.toHaveBeenCalled();
  });

  it("accepts a changed level with a justification and records it", async () => {
    runs.getLatestRunForSubmissionQuery.mockResolvedValue(RUN);
    const r = await approve({
      euAiActOverride: { level: "High risk", justification: "Customer-facing hiring tool" },
    });
    expect(r.status).toHaveBeenCalledWith(200);
    expect(projects.createNewProjectQuery.mock.calls[0][0].ai_risk_classification).toBe("High risk");
    expect(runs.insertClassificationRunQuery.mock.calls[0][0]).toMatchObject({
      reviewerLevel: "High risk",
      reviewerJustification: "Customer-facing hiring tool",
      reviewedBy: 7,
    });
    expect(history.recordMultipleFieldChanges.mock.calls[0][3][0].newValue).toBe(
      "High risk (computed Limited risk; changed by reviewer: Customer-facing hiring tool)",
    );
  });

  it.each(["Catastrophic", "GPAI"])("rejects the level %s", async (level) => {
    runs.getLatestRunForSubmissionQuery.mockResolvedValue(RUN);
    const r = await approve({ euAiActOverride: { level, justification: "A long enough reason" } });
    expect(r.status).toHaveBeenCalledWith(400);
  });

  it("preview returns the current result and flags a change since submission", async () => {
    runs.getLatestRunForSubmissionQuery.mockResolvedValue({
      ...RUN,
      result: { ...RUN.result, level: "Minimal risk" },
    });
    const r = res();
    await ctrl.getSubmissionPreview(req({ params: { id: "9" } }) as any, r);
    const panel = r.json.mock.calls[0][0].data.euAiActClassification;
    expect(panel.current.level).toBe("Limited risk");
    expect(panel.changedSinceSubmission).toBe(true);
  });

  it("preview shows no panel for an unknown questionnaire version instead of failing", async () => {
    runs.getLatestRunForSubmissionQuery.mockResolvedValue({ ...RUN, questionnaireVersion: 99 });
    const r = res();
    await ctrl.getSubmissionPreview(req({ params: { id: "9" } }) as any, r);
    expect(r.status).toHaveBeenCalledWith(200);
    expect(r.json.mock.calls[0][0].data.euAiActClassification).toBeNull();
  });
});
```

Run: `cd Servers && npx jest controllers/__tests__/intakeForm.riskStep.test.ts` → FAIL.

- [ ] **Step 3: Preview**

In `getSubmissionPreview`, before the response:

```ts
    const run = await getLatestRunForSubmissionQuery(submission.id, req.organizationId!);
    // A run made under a version this server no longer knows shows no panel
    // rather than failing the whole preview.
    const runQuestionnaire = run ? getQuestionnaire(run.questionnaireVersion) : null;
    const euAiActClassification = run && runQuestionnaire
      ? (() => {
          const current = scoreClassification(run.questionnaireVersion, run.answers);
          return {
            questionnaire: runQuestionnaire,
            answers: run.answers,
            role: run.role,
            current,
            changedSinceSubmission: current.level !== run.result.level,
            submittedAt: run.createdAt,
          };
        })()
      : null;
```

and add `euAiActClassification,` to the response object.

- [ ] **Step 4: Approval**

In `approveSubmission`, change `const { confirmedEntityData, riskOverride } = req.body;` to also read `euAiActOverride`, and change `const entityData =` to `let entityData: Record<string, unknown> =`. Right after `entityData` is built:

```ts
    // The EU AI Act step owns the use case's level and role: score the stored
    // answers again, apply a justified reviewer change, and ignore whatever
    // the dialog sent for those fields.
    const run =
      submission.entityType === IntakeEntityType.USE_CASE
        ? await getLatestRunForSubmissionQuery(submissionId, req.organizationId!, transaction)
        : null;
    let classification: {
      computed: ClassificationResult;
      finalLevel: string;
      justification: string | null;
    } | null = null;
    if (run) {
      const computed = scoreClassification(run.questionnaireVersion, run.answers);
      const finalLevel = euAiActOverride?.level ?? computed.level;
      // The levels the questionnaire can produce; GPAI and General Risk are not
      // offered here.
      const ALLOWED_LEVELS: string[] = [
        AiRiskClassification.PROHIBITED,
        AiRiskClassification.HIGH_RISK,
        AiRiskClassification.LIMITED_RISK,
        AiRiskClassification.MINIMAL_RISK,
        AiRiskClassification.OUT_OF_SCOPE,
      ];
      if (!ALLOWED_LEVELS.includes(finalLevel)) {
        await transaction.rollback();
        return res.status(400).json(STATUS_CODE[400](req.t!("Invalid EU AI Act classification level")));
      }
      const justification =
        typeof euAiActOverride?.justification === "string" ? euAiActOverride.justification.trim() : "";
      if (finalLevel !== computed.level && justification.length < 10) {
        await transaction.rollback();
        return res.status(400).json(
          STATUS_CODE[400](
            req.t!(
              "A justification of at least 10 characters is required when changing the computed EU AI Act classification",
            ),
          ),
        );
      }
      classification = {
        computed,
        finalLevel,
        justification: finalLevel !== computed.level ? justification : null,
      };
      entityData = {
        ...entityData,
        ai_risk_classification: finalLevel,
        ...(computed.role ? { type_of_high_risk_role: computed.role } : {}),
      };
    }
```

After `entityId = createdProject.id!;` in the use case branch:

```ts
      if (run && classification) {
        await insertClassificationRunQuery(
          {
            useCaseId: entityId,
            intakeSubmissionId: null,
            questionnaireVersion: run.questionnaireVersion,
            role: run.role,
            answers: run.answers,
            result: classification.computed,
            reviewerLevel: classification.justification ? classification.finalLevel : null,
            reviewerJustification: classification.justification,
            reviewedBy: classification.justification ? req.userId! : null,
            source: "intake",
            createdBy: req.userId!,
          },
          req.organizationId!,
          transaction,
        );
        await recordMultipleFieldChanges(
          entityId,
          req.userId!,
          req.organizationId!,
          [
            {
              fieldName: "AI risk classification",
              oldValue: "-",
              newValue: classification.justification
                ? `${classification.finalLevel} (computed ${classification.computed.level}; changed by reviewer: ${classification.justification})`
                : `${classification.finalLevel} (from the intake EU AI Act classification)`,
            },
          ],
          transaction,
        );
      }
```

Imports: merge into the existing statements, adding only names not yet imported. Already imported by now: `AiRiskClassification`, `IntakeEntityType`, `getQuestionnaire`, `CURRENT_QUESTIONNAIRE_VERSION`, `prepareIntakeRiskStep`, `getLatestRunForSubmissionQuery`, `insertClassificationRunQuery`. Add: `scoreClassification` and type `ClassificationResult` (from `../services/euAiActClassification`) and `recordMultipleFieldChanges` (new import from `../utils/useCaseChangeHistory.utils`).

- [ ] **Step 5: Run tests, gates, commit**

```bash
cd Servers && npx jest controllers/__tests__/intakeForm.riskStep.test.ts services/euAiActClassification && npx tsc --noEmit && npm run i18n:audit:strict && npm run format-check
git add Servers/controllers Servers/locales
git commit -m "feat(intake): show the EU AI Act result to reviewers and carry it to the use case"
```

---

### Task 9: Client types, helper, repository and shared questionnaire component

**Files:**
- Create: `Clients/src/domain/types/euAiActClassification.ts`
- Create: `Clients/src/application/utils/euAiActQuestionnaire.ts`
- Create: `Clients/src/application/repository/euAiActClassification.repository.ts`
- Create: `Clients/src/presentation/components/EuAiActQuestionnaire/index.tsx`
- Create: `Clients/src/presentation/components/EuAiActQuestionnaire/QuestionView.tsx`
- Move: `Clients/src/presentation/pages/ProjectView/RiskAnalysisModal/ProgressTracker.tsx` (+ its test) → `Clients/src/presentation/components/EuAiActQuestionnaire/ProgressTracker.tsx`
- Test: `Clients/src/application/utils/__tests__/euAiActQuestionnaire.test.ts`
- Test: `Clients/src/presentation/components/EuAiActQuestionnaire/__tests__/EuAiActQuestionnaire.test.tsx`

**Interfaces:**
- Produces:
  - Types mirroring Task 1/2 (`Questionnaire`, `Question`, `Condition`, `Answers`, `ClassificationResult`, `ClassificationReason`, `ClassificationLevel`, `ClassificationRole`) plus `ClassificationRun` (Task 4 shape).
  - `visibleQuestions(q, a)`, `isAnswered(question, answers): boolean`, `pruneHiddenAnswers(q, a): Answers`.
  - Repository: `getEuAiActQuestionnaire(): Promise<Questionnaire>`, `scoreEuAiActAnswers(answers): Promise<ClassificationResult>`, `saveUseCaseClassification(projectId: number, answers): Promise<{ run: ClassificationRun; result: ClassificationResult }>`, `getLatestUseCaseClassification(projectId: number): Promise<ClassificationRun | null>`.
  - `<EuAiActQuestionnaire questionnaire answers onAnswersChange onComplete completeLabel isCompleting? />`.

- [ ] **Step 1: Types**

Create `Clients/src/domain/types/euAiActClassification.ts` with exactly the declarations of Task 1 Step 1 (copy the file content), plus:

```ts
export interface ClassificationRun {
  id: number;
  useCaseId: number | null;
  intakeSubmissionId: number | null;
  questionnaireVersion: number;
  role: ClassificationRole | null;
  answers: Answers;
  result: ClassificationResult;
  reviewerLevel: string | null;
  reviewerJustification: string | null;
  source: "wizard" | "intake";
  createdAt: string;
}
```

- [ ] **Step 2: Failing helper tests**

```ts
// Clients/src/application/utils/__tests__/euAiActQuestionnaire.test.ts
import { describe, it, expect } from "vitest";
import { isAnswered, pruneHiddenAnswers, visibleQuestions } from "../euAiActQuestionnaire";
import type { Questionnaire } from "../../../domain/types/euAiActClassification";

const Q: Questionnaire = {
  version: 2,
  questions: [
    { id: "a", text: "A", articleRef: "", inputType: "single_select", options: [{ value: "x", label: "X" }, { value: "y", label: "Y" }] },
    { id: "b", text: "B", articleRef: "", inputType: "multi_select", options: [{ value: "p", label: "P" }], showWhen: [[{ questionId: "a", anyOf: ["x"] }]] },
    { id: "c", text: "C", articleRef: "", inputType: "single_select", options: [{ value: "z", label: "Z" }], showWhen: [[{ questionId: "b", anyOf: ["p"] }]] },
  ],
};

describe("euAiActQuestionnaire helper", () => {
  it("hides questions whose conditions do not hold", () => {
    expect(visibleQuestions(Q, { a: "y" }).map((q) => q.id)).toEqual(["a"]);
  });

  it("ignores a stale answer to a question that is now hidden", () => {
    expect(visibleQuestions(Q, { a: "y", b: ["p"] }).map((q) => q.id)).toEqual(["a"]);
  });

  it("prunes answers to hidden questions", () => {
    expect(pruneHiddenAnswers(Q, { a: "y", b: ["p"], c: "z" })).toEqual({ a: "y" });
  });

  it("treats an empty list as unanswered", () => {
    expect(isAnswered(Q.questions[1], { b: [] })).toBe(false);
  });
});
```

Run: `cd Clients && npx vitest run src/application/utils/__tests__/euAiActQuestionnaire.test.ts` → FAIL.

- [ ] **Step 3: Implement the helper**

```ts
// Clients/src/application/utils/euAiActQuestionnaire.ts
// Rendering-only mirror of Servers/services/euAiActClassification/visibility.ts.
// The server validates and scores; this only decides which question to show.
import type {
  Answers,
  Condition,
  Question,
  Questionnaire,
} from "../../domain/types/euAiActClassification";

const holds = (condition: Condition, answers: Answers): boolean => {
  const answer = answers[condition.questionId];
  const values = answer === undefined ? [] : Array.isArray(answer) ? answer : [answer];
  if (values.length === 0) return false;
  if (condition.anyOf && !values.some((v) => condition.anyOf!.includes(v))) return false;
  if (condition.noneOf && values.some((v) => condition.noneOf!.includes(v))) return false;
  return true;
};

export const visibleQuestions = (questionnaire: Questionnaire, answers: Answers): Question[] => {
  const effective: Answers = {};
  const visible: Question[] = [];
  for (const question of questionnaire.questions) {
    const shown =
      !question.showWhen ||
      question.showWhen.some((group) => group.every((c) => holds(c, effective)));
    if (!shown) continue;
    visible.push(question);
    if (answers[question.id] !== undefined) effective[question.id] = answers[question.id];
  }
  return visible;
};

export const isAnswered = (question: Question, answers: Answers): boolean => {
  const answer = answers[question.id];
  return Array.isArray(answer) ? answer.length > 0 : Boolean(answer);
};

export const pruneHiddenAnswers = (questionnaire: Questionnaire, answers: Answers): Answers =>
  Object.fromEntries(
    visibleQuestions(questionnaire, answers)
      .filter((q) => answers[q.id] !== undefined)
      .map((q) => [q.id, answers[q.id]]),
  );
```

Run the test → PASS.

- [ ] **Step 4: Repository**

```ts
// Clients/src/application/repository/euAiActClassification.repository.ts
import { apiServices } from "../../infrastructure/api/networkServices";
import type {
  Answers,
  ClassificationResult,
  ClassificationRun,
  Questionnaire,
} from "../../domain/types/euAiActClassification";

export async function getEuAiActQuestionnaire(): Promise<Questionnaire> {
  const response = await apiServices.get("/eu-ai-act-classification/questionnaire");
  return (response.data as { data: Questionnaire }).data;
}

export async function scoreEuAiActAnswers(answers: Answers): Promise<ClassificationResult> {
  const response = await apiServices.post("/eu-ai-act-classification/score", { answers });
  return (response.data as { data: ClassificationResult }).data;
}

export async function saveUseCaseClassification(
  projectId: number,
  answers: Answers,
): Promise<{ run: ClassificationRun; result: ClassificationResult }> {
  const response = await apiServices.post(`/projects/${projectId}/eu-ai-act-classification`, {
    answers,
  });
  return (response.data as { data: { run: ClassificationRun; result: ClassificationResult } }).data;
}

export async function getLatestUseCaseClassification(
  projectId: number,
): Promise<ClassificationRun | null> {
  const response = await apiServices.get(`/projects/${projectId}/eu-ai-act-classification`);
  return (response.data as { data: ClassificationRun | null }).data;
}
```

- [ ] **Step 5: Move ProgressTracker and write QuestionView**

`git mv` `RiskAnalysisModal/ProgressTracker.tsx` and `RiskAnalysisModal/ProgressTracker.test.tsx` into `components/EuAiActQuestionnaire/` (fix their relative imports; run `grep -rn "ProgressTracker" Clients/src` to update importers).

`QuestionView.tsx` is `RiskAnalysisQuestion.tsx` adapted to the new types: copy that file's styles and markup, and change:
- props to `{ question: Question; answers: Answers; onSelect: (id: string, value: string | string[]) => void }` (types from `domain/types/euAiActClassification`);
- the heading to `{question.text}` (no id prefix), followed by `question.help` in a 13px `text.secondary` `Typography` when present, and `question.articleRef` in a 12px `text.tertiary` `Typography`;
- each option's `desc` to `option.description ?? ""` for radios, and render `option.description` under checkbox labels the same way;
- multi-select `onChange`: when the toggled option is `exclusive` and checked, call `onSelect(question.id, [option.value])`; when a non-exclusive option is checked, drop exclusive values first:

```ts
const exclusiveValues = question.options.filter((o) => o.exclusive).map((o) => o.value);
const current = (Array.isArray(answers[question.id]) ? answers[question.id] : []) as string[];
const next = event.target.checked
  ? option.exclusive
    ? [option.value]
    : [...current.filter((v) => !exclusiveValues.includes(v)), option.value]
  : current.filter((v) => v !== option.value);
onSelect(question.id, next);
```

- [ ] **Step 6: Failing component test**

```tsx
// Clients/src/presentation/components/EuAiActQuestionnaire/__tests__/EuAiActQuestionnaire.test.tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { useState } from "react";
import EuAiActQuestionnaire from "..";
import type { Answers, Questionnaire } from "../../../../domain/types/euAiActClassification";

const Q: Questionnaire = {
  version: 2,
  questions: [
    { id: "scope", text: "Scope?", articleRef: "Art 2", inputType: "single_select", options: [{ value: "research_only", label: "Research" }, { value: "in_scope", label: "In scope" }] },
    { id: "role", text: "Role?", articleRef: "Art 3", inputType: "single_select", options: [{ value: "provider", label: "Provider" }], showWhen: [[{ questionId: "scope", anyOf: ["in_scope"] }]] },
  ],
};

function Harness({ onComplete }: { onComplete: () => void }) {
  const [answers, setAnswers] = useState<Answers>({});
  return (
    <EuAiActQuestionnaire
      questionnaire={Q}
      answers={answers}
      onAnswersChange={setAnswers}
      onComplete={onComplete}
      completeLabel="Continue"
    />
  );
}

describe("EuAiActQuestionnaire", () => {
  it("completes after the only visible question for a research-only system", () => {
    const onComplete = vi.fn();
    render(<Harness onComplete={onComplete} />);
    fireEvent.click(screen.getByLabelText("Research"));
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(onComplete).toHaveBeenCalled();
  });

  it("walks to the follow-up question and back", () => {
    render(<Harness onComplete={vi.fn()} />);
    fireEvent.click(screen.getByLabelText("In scope"));
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByText("Role?")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(screen.getByText("Scope?")).toBeTruthy();
  });

  it("disables the button until the question is answered", () => {
    render(<Harness onComplete={vi.fn()} />);
    // Only "scope" is visible before it is answered, so it is the last question.
    expect((screen.getByRole("button", { name: "Continue" }) as HTMLButtonElement).disabled).toBe(true);
  });
});
```

If `Radio` does not expose an accessible label matching the option label, query with `screen.getByText("Research")` and click it instead; keep the assertions.

- [ ] **Step 7: Implement the component**

```tsx
// Clients/src/presentation/components/EuAiActQuestionnaire/index.tsx
import { useState } from "react";
import { Box, Stack } from "@mui/material";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { CustomizableButton } from "../button/customizable-button";
import ProgressTracker from "./ProgressTracker";
import QuestionView from "./QuestionView";
import {
  isAnswered,
  pruneHiddenAnswers,
  visibleQuestions,
} from "../../../application/utils/euAiActQuestionnaire";
import type { Answers, Questionnaire } from "../../../domain/types/euAiActClassification";

interface EuAiActQuestionnaireProps {
  questionnaire: Questionnaire;
  answers: Answers;
  onAnswersChange: (answers: Answers) => void;
  /** Called on the last visible question; answers are already pruned. */
  onComplete: () => void;
  completeLabel: string;
  isCompleting?: boolean;
}

const EuAiActQuestionnaire = ({
  questionnaire,
  answers,
  onAnswersChange,
  onComplete,
  completeLabel,
  isCompleting = false,
}: EuAiActQuestionnaireProps) => {
  const [index, setIndex] = useState(0);
  const visible = visibleQuestions(questionnaire, answers);
  const position = Math.min(index, visible.length - 1);
  const question = visible[position];
  const isLast = position === visible.length - 1;

  const select = (id: string, value: string | string[]) =>
    onAnswersChange(pruneHiddenAnswers(questionnaire, { ...answers, [id]: value }));

  return (
    <Stack sx={{ gap: "24px" }}>
      <ProgressTracker currentStep={position + 1} totalSteps={visible.length} />
      {question && <QuestionView question={question} answers={answers} onSelect={select} />}
      <Box sx={{ display: "flex", justifyContent: "space-between", gap: "8px" }}>
        <Box>
          {position > 0 && (
            <CustomizableButton
              variant="outlined"
              text="Back"
              icon={<ArrowLeft size={16} />}
              onClick={() => setIndex(position - 1)}
            />
          )}
        </Box>
        <CustomizableButton
          variant="contained"
          text={isLast ? completeLabel : "Next"}
          endIcon={isLast ? undefined : <ArrowRight size={16} />}
          isDisabled={!question || !isAnswered(question, answers) || isCompleting}
          onClick={() => (isLast ? onComplete() : setIndex(position + 1))}
        />
      </Box>
    </Stack>
  );
};

export default EuAiActQuestionnaire;
```

Check `CustomizableButton`'s prop names (`text`, `icon`, `endIcon`, `isDisabled`, `variant`) against `components/button/customizable-button` and adjust to what it exports.

- [ ] **Step 8: Run tests and gates, commit**

```bash
cd Clients && npx vitest run src/application/utils src/presentation/components/EuAiActQuestionnaire && npm run typecheck && npm run format-check
git add Clients/src/domain/types/euAiActClassification.ts Clients/src/application Clients/src/presentation/components/EuAiActQuestionnaire Clients/src/presentation/pages/ProjectView/RiskAnalysisModal
git commit -m "feat(eu-ai-act): client questionnaire component driven by the server definition"
```

---

### Task 10: Rewrite the in-app risk wizard on the server questionnaire

**Files:**
- Modify: `Clients/src/presentation/pages/ProjectView/RiskAnalysisModal/index.tsx`
- Modify: `Clients/src/presentation/pages/ProjectView/RiskAnalysisModal/Result.tsx`
- Delete: `RiskAnalysisModal/questions.config.ts`, `questions.config.test.ts`, `iQuestion.ts`, `RiskAnalysisQuestion.tsx`, `RiskAnalysisQuestion.test.tsx`
- Delete: `Clients/src/presentation/utils/riskClassification.ts`, `Clients/src/presentation/utils/__tests__/riskClassification.test.ts`
- Modify: `RiskAnalysisModal/index.test.tsx`, `RiskAnalysisModal/Result.test.tsx`

**Interfaces:**
- Consumes: Task 9 repository and component; props of `RiskAnalysisModal` stay unchanged (`isOpen`, `setIsOpen`, `projectId`, `setAlert`, `updateClassification`).

- [ ] **Step 1: Rewrite the tests first**

Replace `index.test.tsx` with tests that mock `../../../../application/repository/euAiActClassification.repository`. `vi.mock` is hoisted above top-level constants, so build the fixtures with `vi.hoisted`:

```tsx
const { Q, repo } = vi.hoisted(() => {
  const Q = {
    version: 2,
    questions: [
      {
        id: "scope",
        text: "Scope?",
        articleRef: "Article 2(6) and 2(8)",
        inputType: "single_select",
        options: [
          { value: "research_only", label: "Research" },
          { value: "in_scope", label: "In scope" },
        ],
      },
    ],
  };
  return {
    Q,
    repo: {
      getEuAiActQuestionnaire: vi.fn(),
      getLatestUseCaseClassification: vi.fn(),
      scoreEuAiActAnswers: vi.fn(),
      saveUseCaseClassification: vi.fn(),
    },
  };
});
vi.mock("../../../../application/repository/euAiActClassification.repository", () => repo);

beforeEach(() => {
  localStorage.clear(); // the draft key would otherwise leak between tests
  vi.clearAllMocks();
  repo.getEuAiActQuestionnaire.mockResolvedValue(Q);
  repo.getLatestUseCaseClassification.mockResolvedValue(null);
  repo.scoreEuAiActAnswers.mockResolvedValue({
    questionnaireVersion: 2,
    level: "Out of scope",
    role: null,
    reasons: [{ article: "Article 2(6) and 2(8)", text: "Outside scope." }],
    obligations: [],
  });
  repo.saveUseCaseClassification.mockResolvedValue({ run: { id: 1 }, result: { level: "Out of scope" } });
});
```

Cases:
- "loads the questionnaire and pre-fills the latest run's answers" (`getLatestUseCaseClassification` → `{ answers: { scope: "research_only" } }`; the "Research" option is checked).
- "shows the server result with reasons after View results" (click option, click "View results", expect "Out of scope" and "Article 2(6) and 2(8)" on screen; `scoreEuAiActAnswers` called with `{ scope: "research_only" }`).
- "saves through the classification endpoint and reports the new level" (click "Save results"; `saveUseCaseClassification` called with `(12, { scope: "research_only" })` for `projectId="12"`; `updateClassification` called with `"Out of scope"`).
- "shows an error when the questionnaire fails to load" (`getEuAiActQuestionnaire` rejects → text "Could not load the questionnaire. Try again later.").

Replace `Result.test.tsx` with: renders title per level (`High risk` → "High-risk AI system"; `Out of scope` → "Outside the EU AI Act"), lists each reason's article and text, lists obligations, and shows `appliesFrom` as "Applies from" next to "2 Dec 2027" (two text nodes).

Run: `cd Clients && npx vitest run src/presentation/pages/ProjectView/RiskAnalysisModal` → FAIL.

- [ ] **Step 2: Rewrite `Result.tsx`**

Props: `{ result: ClassificationResult; onRestart?: () => void; onSave?: () => void; isSaving?: boolean }`. Keep the existing header box styling and buttons; change `getLevelConfig` to switch on `result.level`:

```ts
switch (result.level) {
  case "Prohibited": return { color: status.error.text, bgColor: "#FFEBEE", icon: <AlertCircle size={32} />, title: "Prohibited AI system", description: "This system falls under a prohibited practice and cannot be placed on the market or used in the EU." };
  case "High risk": return { color: "#F57C00", bgColor: "#FFF3E0", icon: <AlertTriangle size={32} />, title: "High-risk AI system", description: "This system is high risk and must meet the EU AI Act's requirements for high-risk systems." };
  case "Limited risk": return { color: "#FBC02D", bgColor: "#FFFDE7", icon: <Info size={32} />, title: "Limited risk", description: "This system has transparency obligations under Article 50." };
  case "Minimal risk": return { color: "#388E3C", bgColor: "#E8F5E9", icon: <CheckCircle size={32} />, title: "Minimal risk", description: "No specific EU AI Act obligations apply beyond AI literacy." };
  case "Out of scope": return { color: theme.palette.text.secondary, bgColor: theme.palette.background.accent, icon: <Info size={32} />, title: "Outside the EU AI Act", description: "Research and development systems not placed on the market or used are outside the EU AI Act." };
}
```

Below the header, add two sections, "Why" (`result.reasons`) and "Obligations" (`result.obligations`, hidden when empty), each a list where every item shows `article` in 13px semibold, `text` in 13px, and `appliesFrom` as two sibling elements, `<span>Applies from</span>` and `<span>{date}</span>` with `date = new Date(appliesFrom).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })` (without `timeZone: "UTC"` the ISO date shows a day early west of UTC). Keep them separate: the DOM translator only matches whole text nodes, so "Applies from" must stand alone to be translated. Use `gap: "8px"` spacing and the `#d0d5dd` border with 4px radius for each list container.

- [ ] **Step 3: Rewrite `index.tsx`**

Keep the props interface and `numericProjectId` parsing. Replace state and handlers with:

```tsx
const [questionnaire, setQuestionnaire] = useState<Questionnaire | null>(null);
const [loadError, setLoadError] = useState<string | null>(null);
const [answers, setAnswers] = useState<Answers>({});
const [result, setResult] = useState<ClassificationResult | null>(null);
const [isBusy, setIsBusy] = useState(false);
const STORAGE_KEY = `riskAnalysis_v2_${projectId}`;

useEffect(() => {
  if (!isOpen) return;
  let cancelled = false;
  (async () => {
    try {
      const [definition, latest] = await Promise.all([
        getEuAiActQuestionnaire(),
        getLatestUseCaseClassification(numericProjectId),
      ]);
      if (cancelled) return;
      setQuestionnaire(definition);
      let draft: Answers | null = null;
      try {
        const saved = localStorage.getItem(STORAGE_KEY);
        draft = saved ? (JSON.parse(saved) as Answers) : null;
      } catch {
        draft = null;
      }
      setAnswers(draft ?? latest?.answers ?? {});
    } catch {
      if (!cancelled) setLoadError("Could not load the questionnaire. Try again later.");
    }
  })();
  return () => {
    cancelled = true;
  };
}, [isOpen, numericProjectId, STORAGE_KEY]);

const changeAnswers = (next: Answers) => {
  setAnswers(next);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Draft persistence is a convenience only.
  }
};

const viewResults = async () => {
  setIsBusy(true);
  try {
    setResult(await scoreEuAiActAnswers(answers));
  } catch {
    setAlert({ variant: "error", body: "Could not score the answers. Try again.", isToast: true, visible: true });
  } finally {
    setIsBusy(false);
  }
};

const save = async () => {
  setIsBusy(true);
  try {
    const saved = await saveUseCaseClassification(numericProjectId, answers);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
    setAlert({ variant: "success", body: "Classification saved", isToast: true, visible: true });
    updateClassification(saved.result.level);
    setIsOpen(false);
  } catch {
    setAlert({ variant: "error", body: "Could not save the classification. Try again.", isToast: true, visible: true });
  } finally {
    setIsBusy(false);
  }
};

const restart = () => {
  changeAnswers({});
  setResult(null);
};
```

Render inside the existing `StandardModal` (title "EU AI Act risk classification", remove `customFooter`, add `hideFooter` so no stray Cancel button appears; the questionnaire and `Result` carry their own buttons): `loadError` → MUI `Alert severity="error"`; no questionnaire → `CircularProgress`; `result` → `<Result result={result} onRestart={restart} onSave={save} isSaving={isBusy} />`; otherwise `<EuAiActQuestionnaire questionnaire={questionnaire} answers={answers} onAnswersChange={changeAnswers} onComplete={viewResults} completeLabel="View results" isCompleting={isBusy} />`.

Remove the imports of `questions.config`, `iQuestion`, `classifyRisk`, `updateProject` and `AiRiskClassification`.

- [ ] **Step 4: Delete the old files and check nothing else imports them**

```bash
cd Clients && git rm src/presentation/pages/ProjectView/RiskAnalysisModal/questions.config.ts src/presentation/pages/ProjectView/RiskAnalysisModal/questions.config.test.ts src/presentation/pages/ProjectView/RiskAnalysisModal/iQuestion.ts src/presentation/pages/ProjectView/RiskAnalysisModal/RiskAnalysisQuestion.tsx src/presentation/pages/ProjectView/RiskAnalysisModal/RiskAnalysisQuestion.test.tsx src/presentation/utils/riskClassification.ts src/presentation/utils/__tests__/riskClassification.test.ts
grep -rn "riskClassification\"\|questions.config\|iQuestion\|RiskAnalysisQuestion" src
```
Expected: no matches.

- [ ] **Step 5: Tests and gates, commit**

```bash
cd Clients && npx vitest run src/presentation/pages/ProjectView && npm run typecheck && npm run format-check
git add -A Clients/src/presentation/pages/ProjectView/RiskAnalysisModal Clients/src/presentation/utils
git commit -m "feat(use-cases): risk wizard uses the server EU AI Act questionnaire and saves runs"
```

---

### Task 11: Builder toggle and mapping guard

**Files:**
- Modify: `Clients/src/presentation/pages/IntakeFormBuilder/types.ts` (lines ~100, 122, 140, 750)
- Modify: `Clients/src/presentation/pages/IntakeFormBuilder/index.tsx` (payloads ~267 and ~318, `usedEntityMappings` ~796, settings block after the suggested-questions toggle ~1135)
- Modify: `Clients/src/application/repository/intakeForm.repository.ts` (form input/output types, if typed there)
- Test: `Clients/src/presentation/pages/IntakeFormBuilder/__tests__/EuAiActStepToggle.test.tsx`

**Interfaces:**
- Produces: `euAiActRiskStepEnabled?: boolean` on the client form types; saved through the existing create/update calls.

- [ ] **Step 1: Types and payloads**

Add `euAiActRiskStepEnabled?: boolean;` next to every `suggestedQuestionsEnabled?: boolean;` in `types.ts`, and `euAiActRiskStepEnabled: false,` next to `suggestedQuestionsEnabled: false,` in the default form (line ~750). In `index.tsx`, add `euAiActRiskStepEnabled: form.euAiActRiskStepEnabled ?? false,` next to each `suggestedQuestionsEnabled: form.suggestedQuestionsEnabled ?? false,` (lines ~267 and ~318). Add the field to any create/update input types in `intakeForm.repository.ts` that list `suggestedQuestionsEnabled`.

- [ ] **Step 2: Disable the mapping when the step is on**

At line ~796, where `usedEntityMappings` is computed from other fields, append the reserved mapping:

```ts
usedEntityMappings={[
  ...form.schema.fields
    .filter((f) => f.id !== selectedField.id && f.entityFieldMapping)
    .map((f) => f.entityFieldMapping!),
  ...(form.euAiActRiskStepEnabled ? ["ai_risk_classification"] : []),
]}
```

(Keep the existing expression's exact shape; only add the spread.)

- [ ] **Step 3: Write the failing toggle test**

Render the builder's settings section the way existing builder tests do (`grep -rln "IntakeFormBuilder" Clients/src --include=*.test.tsx` for a harness; if none, extract the new toggle into `EuAiActStepToggle.tsx` with props `{ entityType, enabled, hasRiskMapping, onToggle }` and test that component directly). Cases:
- hidden when `entityType === "model"`;
- clicking calls `onToggle(true)` when there is no risk mapping;
- when `hasRiskMapping` is true, the description adds "Turning this on unmaps the question that sets the AI risk classification. The question stays on the form." and clicking still calls `onToggle(true)`.

Run → FAIL.

- [ ] **Step 4: Implement the toggle**

Create `Clients/src/presentation/pages/IntakeFormBuilder/EuAiActStepToggle.tsx` using the same markup as the suggested-questions toggle (Box + `Checkbox` + two `Typography`), with title "EU AI Act risk classification step" and description "Submitters answer the EU AI Act risk questionnaire before the form's questions. Reviewers see the result, and it becomes the use case's risk classification on approval." When `hasRiskMapping` is true, append the sentence "Turning this on unmaps the question that sets the AI risk classification. The question stays on the form." to the description. Return `null` when `entityType !== "use_case"`.

In `index.tsx`, render it right after the suggested-questions toggle block (outside the `form.llmKeyId &&` condition). The default use case template (`DEFAULT_USE_CASE_FIELDS`, `types.ts:435-445`) maps a question to `ai_risk_classification`, so blocking the toggle would block nearly every form. Instead, turning the step on removes that mapping and keeps the question:

```tsx
<EuAiActStepToggle
  entityType={form.entityType}
  enabled={form.euAiActRiskStepEnabled ?? false}
  hasRiskMapping={form.schema.fields.some((f) => f.entityFieldMapping === "ai_risk_classification")}
  onToggle={(enabled) =>
    updateForm({
      euAiActRiskStepEnabled: enabled,
      ...(enabled
        ? {
            schema: {
              ...form.schema,
              fields: form.schema.fields.map((f) =>
                f.entityFieldMapping === "ai_risk_classification"
                  ? { ...f, entityFieldMapping: undefined }
                  : f,
              ),
            },
          }
        : {}),
    })
  }
/>
```

Check that `updateForm` accepts `schema` in its partial (it updates the form state used for saving); if schema updates go through another setter in `index.tsx`, use that one for the `fields` change. The entity type cannot be changed after creation (`index.tsx:131-135`), so nothing else needs to turn the step off.

The builder's "Preview" button opens the public page (`/${publicId}/use-case-form-intake`), so Task 12 covers "the builder preview shows both steps"; check it in Task 14's browser pass.

- [ ] **Step 5: Tests, gates, commit**

```bash
cd Clients && npx vitest run src/presentation/pages/IntakeFormBuilder && npm run typecheck && npm run format-check
git add Clients/src/presentation/pages/IntakeFormBuilder Clients/src/application/repository/intakeForm.repository.ts
git commit -m "feat(intake): builder toggle for the EU AI Act risk step"
```

---

### Task 12: Two-step public form

**Files:**
- Modify: `Clients/src/application/repository/intakeForm.repository.ts` (`getPublicForm`, `getPublicFormById`, `submitPublicForm`, `submitPublicFormById` types)
- Modify: `Clients/src/presentation/pages/PublicIntakeForm/index.tsx`
- Test: `Clients/src/presentation/pages/PublicIntakeForm/__tests__/PublicIntakeForm.riskStep.test.tsx`

**Interfaces:**
- Consumes: Task 9 component and types.
- Produces: submit payload field `euAiActRiskAnswers?: Answers`.

- [ ] **Step 1: Repository types**

Add to both public GET response types: `euAiActRiskStep?: { questionnaire: Questionnaire } | null; previousRiskAnswers?: Answers;`. Add `euAiActRiskAnswers?: Answers;` to both submit `data` types.

- [ ] **Step 2: Write the failing page tests**

There is no page-level test to copy (only `FormFieldRenderer` and `MathCaptcha` tests exist). Set it up like this:

```tsx
// Clients/src/presentation/pages/PublicIntakeForm/__tests__/PublicIntakeForm.riskStep.test.tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { PublicIntakeForm } from "..";

const repo = vi.hoisted(() => ({
  getPublicFormById: vi.fn(),
  submitPublicFormById: vi.fn(),
  getCaptcha: vi.fn(),
  getPublicForm: vi.fn(),
  submitPublicForm: vi.fn(),
}));
vi.mock("../../../../application/repository/intakeForm.repository", () => repo);

const QUESTIONNAIRE = {
  version: 2,
  questions: [
    {
      id: "scope",
      text: "Scope?",
      articleRef: "Article 2(6) and 2(8)",
      inputType: "single_select",
      options: [
        { value: "research_only", label: "Research" },
        { value: "in_scope", label: "In scope" },
      ],
    },
  ],
};
const formResponse = (extra: object = {}) => ({
  data: {
    form: {
      id: 1,
      name: "Request",
      description: "",
      slug: "request",
      entityType: "use_case",
      schema: { version: "1.0", fields: [] },
      submitButtonText: "Submit",
      designSettings: null,
    },
    ...extra,
  },
});
const renderPage = () =>
  render(
    <MemoryRouter initialEntries={["/abc/use-case-form-intake"]}>
      <Routes>
        <Route path="/:publicId/use-case-form-intake" element={<PublicIntakeForm />} />
        <Route path="/:publicId/use-case-form-intake/success" element={<div>Submitted</div>} />
      </Routes>
    </MemoryRouter>,
  );

beforeEach(() => {
  vi.clearAllMocks();
  repo.getCaptcha.mockResolvedValue({ data: { question: "2 + 2", token: "t" } });
  repo.submitPublicFormById.mockResolvedValue({
    data: { submissionId: 1, resubmissionToken: "r", message: "ok" },
  });
});
```

Check how `MathCaptcha` fetches its question (it may call `getCaptcha` from this repository) and how the email and captcha inputs are labelled (`Email`, and the captcha `Field`'s label), then fill them with `fireEvent.change` before clicking the submit button (named by `submitButtonText`). Cases:
- "shows the risk step first when the form has one, and the form questions after Continue";
- "submits the pruned risk answers with the form" (`submitPublicFormById` payload contains `euAiActRiskAnswers: { scope: "research_only" }`);
- "pre-fills risk answers on a resubmission" (`previousRiskAnswers` given → option checked);
- "a form without the step renders exactly as before" (no "Risk classification" heading; payload has no `euAiActRiskAnswers`).

Run → FAIL.

- [ ] **Step 3: Implement**

In `PublicIntakeForm/index.tsx`:

```tsx
const [riskStep, setRiskStep] = useState<{ questionnaire: Questionnaire } | null>(null);
const [riskAnswers, setRiskAnswers] = useState<Answers>({});
const [step, setStep] = useState<"risk" | "form">("form");
```

In `loadForm`, after `setFormData(...)`:

```tsx
const definition = response.data.euAiActRiskStep ?? null;
setRiskStep(definition);
setStep(definition ? "risk" : "form");
if (response.data.previousRiskAnswers) setRiskAnswers(response.data.previousRiskAnswers);
```

In `onSubmit`'s `payload`, add `...(riskStep ? { euAiActRiskAnswers: riskAnswers } : {}),`.

In the render, inside the card body and before `<Box component="form" ...>`: when `riskStep && step === "risk"`, render instead of the form:

```tsx
<Box sx={{ p: "32px" }}>
  <Typography component="h2" sx={{ fontWeight: 600, color: "#1e293b", mb: "8px", fontSize: "16px" }}>
    Risk classification
  </Typography>
  <Typography sx={{ fontSize: "13px", color: "#475569", mb: "24px" }}>
    Answer these questions about the AI system first. They follow the EU AI Act.
  </Typography>
  <EuAiActQuestionnaire
    questionnaire={riskStep.questionnaire}
    answers={riskAnswers}
    onAnswersChange={setRiskAnswers}
    onComplete={() => setStep("form")}
    completeLabel="Continue"
  />
</Box>
```

and render the existing `<Box component="form" ...>` only when `!riskStep || step === "form"`. At the top of the form (before the resubmission alert), when `riskStep`, add a text button that returns to the step:

```tsx
<CustomizableButton variant="text" text="Back to risk classification" onClick={() => setStep("risk")} />
```

- [ ] **Step 4: Tests, gates, commit**

```bash
cd Clients && npx vitest run src/presentation/pages/PublicIntakeForm && npm run typecheck && npm run format-check
git add Clients/src/presentation/pages/PublicIntakeForm Clients/src/application/repository/intakeForm.repository.ts
git commit -m "feat(intake): public form asks the EU AI Act risk step first"
```

---

### Task 13: Reviewer panel and justified override in the approval dialog

**Files:**
- Create: `Clients/src/presentation/pages/IntakeFormBuilder/EuAiActClassificationPanel.tsx`
- Modify: `Clients/src/presentation/pages/IntakeFormBuilder/SubmissionPreviewModal.tsx`
- Modify: `Clients/src/application/repository/intakeForm.repository.ts` (`getSubmissionPreview` response type, `approveSubmission` data type)
- Test: `Clients/src/presentation/pages/IntakeFormBuilder/__tests__/EuAiActClassificationPanel.test.tsx`
- Test: `Clients/src/presentation/pages/IntakeFormBuilder/__tests__/SubmissionPreviewModal.riskStep.test.tsx`

**Interfaces:**
- Consumes: Task 8 preview key and approve body; Task 9 types.
- Produces: `<EuAiActClassificationPanel classification isPending selectedLevel onLevelChange justification onJustificationChange />`.

- [ ] **Step 1: Repository types**

Add to `getSubmissionPreview`'s `data` type (both places in that function):

```ts
euAiActClassification?: {
  questionnaire: Questionnaire;
  answers: Answers;
  role: ClassificationRole | null;
  current: ClassificationResult;
  changedSinceSubmission: boolean;
  submittedAt: string;
} | null;
```

Add `euAiActOverride?: { level: string; justification: string };` to `approveSubmission`'s `data`.

- [ ] **Step 2: Failing panel tests**

Cases:
- shows the level, each reason's article, the role and each answered question's text with the chosen option labels (resolve labels from `questionnaire`);
- shows "Updated since submission" when `changedSinceSubmission`;
- the justification field appears only when `selectedLevel !== current.level`;
- choosing "Prohibited" shows the warning "Approving creates a use case classified as prohibited.";
- read-only (no select) when `isPending` is false.

Run → FAIL.

- [ ] **Step 3: Implement the panel**

Section box styled like the existing "Risk assessment" section (border `theme.palette.border.dark`, radius 4px, `background.accent`), titled "EU AI Act classification" with the `Scale` lucide icon (16px, strokeWidth 1.5). Content:
- `Chip` with the current level; "Updated since submission" 12px note when flagged; "Role: Provider/Deployer" when set.
- "Why": list of reasons (article semibold, text), as in Task 10's Result.
- "Answers": for each question in `visibleQuestions(questionnaire, answers)`, the question text and the comma-joined option labels.
- When `isPending`: `Select` (id `eu-ai-act-level`, label "Classification for the new use case") with items `Prohibited`, `High risk`, `Limited risk`, `Minimal risk`, `Out of scope` (from `AiRiskClassification`), value `selectedLevel`; when `selectedLevel !== current.level`, a `Field` (id `eu-ai-act-justification`, label "Justification", rows 2, placeholder "Explain why you are changing the computed classification (min. 10 characters)", error "Justification must be at least 10 characters" when 1-9 characters); when `selectedLevel === "Prohibited"`, an `Alert severity="warning"` with "Approving creates a use case classified as prohibited."

- [ ] **Step 4: Wire it into the modal**

In `SubmissionPreviewModal.tsx`:
- add `euAiActClassification` to `PreviewData` and set it from `response.data.euAiActClassification ?? null` in `fetchPreview`;
- state `const [euAiActLevel, setEuAiActLevel] = useState<string>("")` and `const [euAiActJustification, setEuAiActJustification] = useState("")`, reset in `fetchPreview`, with `setEuAiActLevel(response.data.euAiActClassification?.current.level ?? "")`;
- rename the existing section heading "Risk assessment" (`SubmissionPreviewModal.tsx:447`) to "Intake risk score", and its toggle "Override risk assessment" to "Override intake risk score", so the two panels are never confused (the spec requires these labels);
- render `<EuAiActClassificationPanel ... />` as a new section between "Intake risk score" and the entity preview, only when `previewData?.euAiActClassification`;
- in the entity preview's `mappedFields`, when the panel is shown, skip fields mapped to `ai_risk_classification`, and also skip fields mapped to `type_of_high_risk_role` when `euAiActClassification.current.role` is set (approval overwrites both with the computed values, so an editable field would mislead);
- in `handleApprove`, before setting `isApproving`:

```ts
const euAi = previewData?.euAiActClassification;
const changedLevel = euAi && euAiActLevel !== euAi.current.level;
if (changedLevel && euAiActJustification.trim().length < 10) {
  setApproveError("A justification of at least 10 characters is required when changing the EU AI Act classification.");
  return;
}
```

and after building `payload`:

```ts
if (changedLevel) {
  payload.euAiActOverride = { level: euAiActLevel, justification: euAiActJustification.trim() };
}
```

- [ ] **Step 5: Modal test, gates, commit**

`SubmissionPreviewModal.riskStep.test.tsx`: mock `getSubmissionPreview` (with `euAiActClassification`) and `approveSubmission`; change the level to "High risk" without justification → error text shown and `approveSubmission` not called; with a 12-character justification → `approveSubmission` called with `euAiActOverride: { level: "High risk", justification: "Hiring tool." }` (adjust to a ≥10-char string); unchanged level → no `euAiActOverride` key.

```bash
cd Clients && npx vitest run src/presentation/pages/IntakeFormBuilder && npm run typecheck && npm run format-check
git add Clients/src/presentation/pages/IntakeFormBuilder Clients/src/application/repository/intakeForm.repository.ts
git commit -m "feat(intake): reviewers see the EU AI Act result and justify changes"
```

---

### Task 14: Translations, docs and full verification

**Files:**
- Modify: `Clients/src/i18n/translations.ts`
- Create: `Clients/src/i18n/__tests__/euAiActQuestionnaire.translations.test.ts`
- Modify: `shared/user-guide-content/content/ai-governance/intake-forms.ts`
- Modify: `shared/user-guide-content/content/ai-governance/use-cases.ts`
- Modify: `docs/technical/domains/use-cases.md`
- Modify: `CLAUDE.md` (Detailed References row) and the "Last Updated" date

- [ ] **Step 1: Failing translation-coverage test**

```ts
// Clients/src/i18n/__tests__/euAiActQuestionnaire.translations.test.ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { translations } from "../translations";

// The questionnaire and result text is served by the backend and translated in
// the DOM, so the static i18n audit cannot see it. Read the source files.
const read = (file: string) =>
  readFileSync(
    fileURLToPath(new URL(`../../../../Servers/services/euAiActClassification/${file}`, import.meta.url)),
    "utf8",
  );
const SOURCE = read("questionnaire.v2.ts") + read("score.v2.ts");
const strings = [
  ...new Set(
    [...SOURCE.matchAll(/\b(?:text|label|description|help):\s*"((?:[^"\\]|\\.)+)"/g)].map((m) =>
      m[1].replace(/\\"/g, '"'),
    ),
  ),
];

describe("EU AI Act questionnaire translations", () => {
  it("found the questionnaire strings", () => {
    expect(strings.length).toBeGreaterThan(80);
  });

  it.each(["de", "fr", "es"] as const)("every string has a %s translation", (lang) => {
    const missing = strings.filter((s) => !(translations as any)[lang]?.[s]);
    expect(missing).toEqual([]);
  });
});
```

Check the `translations` export name and shape in `translations.ts` (`export const translations: Record<string, Record<string, string>>`, keyed by language) and adjust the import if it differs.

Run: `cd Clients && npx vitest run src/i18n/__tests__/euAiActQuestionnaire.translations.test.ts` → FAIL listing missing strings.

- [ ] **Step 2: Add the translations**

For every string the test reports, and every string `npm run i18n:audit:strict` reports, add an entry to each of the `de`, `fr` and `es` blocks of `translations.ts`, keeping the key identical to the English source. Use formal register (Sie / vous / usted), the EU AI Act's official terminology in each language ("Anbieter"/"Betreiber", "fournisseur"/"déployeur", "proveedor"/"responsable del despliegue"), and keep article references unchanged. Re-run both checks until they pass:

```bash
cd Clients && npx vitest run src/i18n && npm run i18n:audit:strict
```

- [ ] **Step 3: Docs**

- `intake-forms.ts` (user guide): a section "EU AI Act risk classification step": what the toggle does, that it is for use case forms only, that submitters answer the questionnaire before the form, that they do not see the result, and that reviewers see it and can change it with a justification. Only claim what the code does.
- `use-cases.ts` (user guide): update the risk classification wizard section: questions follow Articles 2, 5, 6, 50 and Annexes I and III; results show reasons, dates and obligations; each saved classification is kept; "Out of scope" level.
- `docs/technical/domains/use-cases.md`: a "EU AI Act classification" section: module path, versioning rule (add `questionnaire.vN.ts` + `score.vN.ts`, keep old versions), table `eu_ai_act_classifications` with its one-owner rule, endpoints, permission key `useCase.classify`.
- `CLAUDE.md`: no new row needed if `use-cases.md` covers it; update the "Last Updated" date only if you edit `CLAUDE.md`.
- Mirror the two user-guide files to `~/website/verifywise/content/user-guide/` (same relative paths); do not commit the website repo.

- [ ] **Step 4: Full verification**

```bash
cd Servers && rm -rf dist .tsbuildinfo && npx tsc --noEmit && npm run build && npm run format-check && npm run i18n:audit:strict && npx jest services/euAiActClassification utils controllers config domain.layer && npm run check:api-drift
cd ../Clients && npm run typecheck && npm run format-check && npm run i18n:audit:strict && npx vitest run src/application src/i18n src/presentation/components/EuAiActQuestionnaire src/presentation/pages/ProjectView src/presentation/pages/IntakeFormBuilder src/presentation/pages/PublicIntakeForm && npm run build
```

Expected: all pass. Then, with the dev stack running (`demo-admin@verifywise.local` / `DemoAdmin#1`, org 2), check in a browser:
1. Builder: create a use case form from the default template, turn on the step (the template's risk question loses its mapping and stays on the form), save, and use "Preview": the public page asks the risk step first. A model form shows no toggle.
2. Public link: risk step first; research-only completes in one question; submit.
3. Review dialog: classification panel; change the level without justification → blocked; with justification → approve; the use case shows the level, its history shows the entry.
4. Use case → risk wizard: pre-filled from the intake answers; save; level updates.
5. A form without the step and an old submission without a run still approve as before.

- [ ] **Step 5: Commit**

```bash
git add Clients/src/i18n shared/user-guide-content docs/technical/domains/use-cases.md
git commit -m "docs(eu-ai-act): translations and guides for the intake risk step and wizard"
```

---

## Spec deltas (decided while planning)

- `POST /api/eu-ai-act-classification/score` (authenticated, no write) is added so the wizard can show the result before saving, as it does today.
- `eu_ai_act_classifications.role` is nullable: an out-of-scope run never asks the role.
- Question visibility uses declarative `showWhen` groups so the definition can be served as JSON; the client mirrors only the visibility helper, never scoring.
- The run table stores `reviewed_by`; the spec's column list already named it.
- Turning the step on in the builder removes an existing `ai_risk_classification` mapping (the question stays) instead of blocking the toggle, because the default use case template has that mapping. While the step is on, that mapping is hidden from the field editor's mapping list (the existing `usedEntityMappings` mechanism), not shown disabled. The server still rejects a form that has both (400).
- Approval accepts only the five questionnaire levels (Prohibited, High risk, Limited risk, Minimal risk, Out of scope), not GPAI or General Risk.
- A run under a questionnaire version the server no longer knows shows no panel in review instead of failing the preview.
