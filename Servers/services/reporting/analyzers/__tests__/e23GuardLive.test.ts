/**
 * Round 3 of the E-23 prose guard (G2, I1–I3), driven by a live run
 * (claude-sonnet-5-5, runs 12–16) in which the round-2 guard rejected mostly
 * correct text. The fixture is that run's data, rebuilt from the real E-23
 * structure: 16 groups and 83 requirements, 6 groups checked (37
 * requirements), 13 models, 5 open findings, period 2026-07-01 to 2026-09-30,
 * position as at 2026-11-23.
 *
 * Each "correct" item is a sentence the live guard rejected, with the
 * surrounding sentences of the same item where the derivation depends on them
 * (the stored payloads are the post-retry ones, so an item the guard rejected
 * is rebuilt from its rejected sentence and its siblings in that run).
 * No LLM call: generateObjectWithSelfCorrection is mocked.
 */
const mockGenerate = jest.fn();
const mockSectionSummaries = jest.fn();

jest.mock("../../../../advisor/llmSelfCorrect", () => ({
  generateObjectWithSelfCorrection: (...a: any[]) => mockGenerate(...a),
}));
jest.mock("../../../../advisor/llmModelFactory", () => {
  const actual = jest.requireActual("../../../../advisor/llmModelFactory");
  return { ...actual, createModelFromKey: jest.fn(() => "model") };
});
jest.mock("../sectionSummaries", () => ({
  runSectionSummaries: (...a: any[]) => mockSectionSummaries(...a),
}));
jest.mock("../../../../utils/logger/fileLogger", () => ({
  __esModule: true,
  default: { debug: jest.fn(), error: jest.fn(), info: jest.fn(), warn: jest.fn() },
}));
// facts imports isoDate from dataCollector, which loads the real sequelize
// instance; unmocked, that opens a DB connection during a unit test.
jest.mock("../../../../database/db", () => ({ sequelize: {} }));

import type {
  FrameworkRequirementGroup,
  ReportData,
} from "../../../../domain.layer/interfaces/i.reportGeneration";
import { osfiE23Structure } from "../../../../structures/OSFI-E-23/osfi-e23.structure";
import { ANALYZERS } from "../registry";
import { runAnalyzers, type AiBlocks } from "../runAnalyzers";
import { collectFactsInput } from "../collectAnalyzerInputs";
import { E23_GUARD_REJECTED } from "../abstainReasons";
import { findViolations, guardContext, type GuardContext } from "../e23Guard";
import { e23ReportData, nonKindReportData } from "../../tests/helpers/e23ReportData";

const llmKey: any = { id: 9, name: "openai", key: "sk", url: null, model: "m" };
const NONE: AiBlocks = {
  sectionSummaries: false,
  executiveSummary: false,
  keyFindings: false,
  recommendedActions: false,
  riskAnalysis: false,
  complianceGap: false,
  vendorRisk: false,
  e23Gap: false,
};

const CHECKED = new Set([
  "Principle 2.1 – Model identification (C.1)",
  "Principle 2.2 – Model risk rating (C.2)",
  "Principle 3.1 – Policies, procedures and controls (D.1)",
  "Principle 3.4 – Model review (D.2)",
  "Model approval (D.2)",
  "Principle 3.6 – Model monitoring (D.2)",
]);

/** The live run's data: the real E-23 groups, 51 Implemented and 32 Audited. */
function liveRun(): ReportData {
  const rd = e23ReportData({ noContradictions: true, noPrevious: true });
  rd.metadata.generatedAt = new Date("2026-11-23T15:00:00Z");
  rd.metadata.reportParameters = {
    ...rd.metadata.reportParameters,
    institutionName: "Kestrel Bay Financial Group",
    periodStart: "2026-07-01",
    periodEnd: "2026-09-30",
  };
  let n = 0;
  const groups: FrameworkRequirementGroup[] = osfiE23Structure.seed.structure.map((g, gi) => {
    const requirements = g.items.map((item, i) => {
      n += 1;
      return {
        implId: gi * 100 + i,
        level: 2,
        title: item.title,
        orderNo: i,
        status: n <= 51 ? "Implemented" : "Audited",
        owner: "Dana Reviewer",
        reviewer: null,
        approver: null,
        // 20 requirements carry a due date, all in the future.
        dueDate: n <= 20 ? "2027-03-31" : null,
        isDone: true,
        isOverdue: false,
        evidenceCount: 1,
        evidenceFiles: ["policy.pdf"],
        riskCount: 0,
      };
    });
    const total = requirements.length;
    return {
      title: g.title,
      orderNo: gi,
      requirements,
      rollup: { total, done: total, unassigned: 0, noEvidence: 0, overdue: 0, statusBreakdown: {} },
    };
  });
  rd.sections.frameworkRequirements = {
    frameworks: [
      {
        frameworkId: 26,
        frameworkName: "OSFI E-23",
        groups,
        rollup: {
          total: 83,
          done: 83,
          unassigned: 0,
          noEvidence: 0,
          overdue: 0,
          statusBreakdown: {},
        },
      },
    ],
  };
  rd.sections.e23Contradictions = {
    available: true,
    fired: [],
    checked: Array.from({ length: 13 }, (_, i) => `C${i + 1}`) as any,
    notRun: [],
    coverage: Object.fromEntries(
      groups.map((g) => [g.title, CHECKED.has(g.title) ? "checked" : "selfAssessmentOnly"]),
    ),
  };
  const sev = (critical: number, high: number, medium: number, low: number) => ({
    critical,
    high,
    medium,
    low,
  });
  rd.sections.mrmFleet = {
    totals: { models: 13, untiered: 0, byTier: { "1": 5, "2": 5, "3": 3 } },
    validationCoverage: { validated: 13, inReview: 0, notStarted: 0, overdue: 0 },
    openFindingsBySeverity: sev(0, 0, 3, 2),
    monitoring: { withActiveThresholds: 13, withRecentMetric: 13 },
    activity: {
      period: { start: "2026-07-01", end: "2026-09-30" },
      validationsSignedOff: 4,
      findingsOpened: 3,
      findingsClosed: 2,
      breaches: 0,
      revalidationEvents: 0,
    },
    perTier: [
      {
        tier: "1",
        models: 5,
        tieringCurrent: 5,
        validated: 5,
        monitoringActive: 5,
        openFindings: 3,
        criticalHighFindings: 0,
        openBySeverity: sev(0, 0, 2, 1),
      },
      {
        tier: "2",
        models: 5,
        tieringCurrent: 5,
        validated: 5,
        monitoringActive: 5,
        openFindings: 1,
        criticalHighFindings: 0,
        openBySeverity: sev(0, 0, 1, 0),
      },
      {
        tier: "3",
        models: 3,
        tieringCurrent: 3,
        validated: 3,
        monitoringActive: 3,
        openFindings: 1,
        criticalHighFindings: 0,
        openBySeverity: sev(0, 0, 0, 1),
      },
    ],
    exceptions: [],
  };
  delete rd.sections.e23Glance;
  return rd;
}

const SUMMARIES = {
  frameworkRequirements: "All 83 requirements are done: 51 Implemented and 32 Audited.",
  mrmFleet: "All 13 models are validated with none open; 5 findings are open.",
  e23Contradictions: "None of the 13 rules fired.",
};

const extrasFor = (rd: ReportData) => {
  const { formalFacts } = collectFactsInput(rd);
  return { sectionSummaries: SUMMARIES, facts: formalFacts, formalFacts };
};

let rd: ReportData;
let ctx: GuardContext;
let gapCtx: GuardContext;
beforeAll(() => {
  rd = liveRun();
  ctx = guardContext(ANALYZERS.keyFindings.buildUserPrompt(rd, extrasFor(rd)), rd);
  gapCtx = guardContext(ANALYZERS.e23Gap.buildUserPrompt(rd, extrasFor(rd)), rd);
});

const finding = (text: string, close: string | null = null) => ({
  text,
  section: "mrmFleet",
  severity: "low",
  basis: "observed",
  what_would_close_this: close,
  related_sections: [],
});
const violationsOfFinding = (text: string, close: string | null = null) =>
  findViolations("keyFindings", { findings: [finding(text, close)], abstain_reason: null }, ctx);
const violationsOfNarrative = (narrative: string) =>
  findViolations("e23Gap", { narrative, principles: [], abstain_reason: null }, gapCtx);
const violationsOfSummary = (summary: string) =>
  findViolations("executiveSummary", { summary, abstain_reason: null }, ctx);

describe("G2 (a): negated compliance wording passes, affirmative wording is still caught", () => {
  it.each([
    "This report does not state that any requirement is fulfilled or that the institution complies with E-23.",
    "It is not a statement that any requirement is fulfilled.",
    "It is not a finding that the institution complies with E-23 or that any requirement is fulfilled, and it carries no view on behalf of OSFI.",
    "The comparison does not itself assess compliance with E-23.",
    "This is a statement about the records and the self-assessed statuses only, and it is not a conclusion that any E-23 requirement is satisfied.",
  ])("passes %p", (sentence) => {
    expect(violationsOfNarrative(sentence)).toEqual([]);
  });

  it.each([
    "The institution complies with E-23 in every checked group.",
    "Every requirement is fulfilled, and the institution is compliant with E-23.",
    "It is not a statement about evidence, but the institution is fully compliant.",
    "No rule fired, so the institution complies with E-23.",
  ])("catches %p", (sentence) => {
    expect(violationsOfNarrative(sentence).map((v) => v.reason)).toContain("compliance");
  });
});

describe("G2 (b): one-step derivations, per-section counts and dates from the input", () => {
  it.each([
    // 13 − 4 = 9, all three in the item.
    [
      "The data therefore places at most 4 of the 13 validations in that period, and it does not show when the other 9 were completed.",
    ],
    [
      "All 13 models are validated with none open. 4 validation sign-offs fall in the 2026-07-01 to 2026-09-30 period, so the other 9 validated models were signed off before that period or outside its counted activity.",
      "The next report can show sign-off dates for the 9 models without a sign-off in the period.",
    ],
    [
      "4 of the 13 models had a validation signed off in the period. The data supplies no validation dates or cadence for the other 9 models.",
    ],
    // Per-section group counts the input now states (I1).
    [
      "Section B (Principles 1.1 to 1.3) has 0 of 3 groups checked, and D.2 has 3 of 8 checked (review, approval, monitoring).",
    ],
    [
      "The checked groups are unevenly spread: section B has 0 of 3 groups checked, section C has 2 of 3, D.1 has 1 of 1, and D.2 has 3 of 8 (review, approval, monitoring).",
    ],
    [
      "The register carries a closure date and an evidence-review result for each requirement, starting with the largest groups: Principle 2.2 (8 requirements) and the D.2 block (42 requirements across 8 groups).",
    ],
    [
      "The other five D.2 groups are self-assessment only by design and hold 26 of the 42 D.2 requirements (design rationale 3, data 6, development 6, deployment 6, decommission 5). That is about 31% of all 83 requirements.",
    ],
    // Days between two input dates, and the day after one.
    [
      "The activity window also ends 54 days before the reference date of 2026-11-23, so nothing recorded covers 2026-10-01 to 2026-11-23.",
    ],
    // A ratio of two figures in the same item.
    [
      "In the period, 3 findings were opened and 2 were closed. Closure ran at about 67% of the rate of opening.",
    ],
    ["Tier 1 holds 3 of the 5 open findings (60%) but only 5 of the 13 models (about 38%)."],
  ] as Array<[string, string?]>)("passes %p", (...row: [string, string?]) => {
    // A rest parameter: a second named one would read to Jest as `done`.
    const [text, close] = row;
    expect(violationsOfFinding(text, close ?? null)).toEqual([]);
  });

  it("passes the rest of the live run's rejected sentences", () => {
    expect(
      violationsOfFinding(
        "All 13 models are validated with none open, and 4 validations were signed off in the period. At least 9 validations therefore were not signed off in that period, and the data gives no sign-off dates to show how current they are.",
      ),
    ).toEqual([]);
    const principle = {
      group: "Principle 3.6 – Model monitoring (D.2)",
      position: "consistent",
      explanation:
        "All 13 models have active thresholds and a metric received in the last 90 days, with 0 breaches in the period, so the records do not contradict the 7/7 done status.",
      basis: "observed",
      what_would_close_this: null,
    };
    expect(
      findViolations(
        "e23Gap",
        { narrative: "x".repeat(40), principles: [principle], abstain_reason: null },
        gapCtx,
      ).filter((v) => v.field === "principles"),
    ).toEqual([]);
  });

  it("passes the e23Gap narrative sentences on requirement totals by coverage", () => {
    expect(
      violationsOfNarrative(
        "Six of the 16 requirement groups are compared with the records, covering 37 of the 83 requirements. The other 10 groups, covering 46 of the 83 requirements, are self-assessment only.",
      ),
    ).toEqual([]);
  });

  it("passes a percentage of a total named earlier in the same paragraph", () => {
    expect(
      violationsOfSummary(
        "All 83 requirements are self-assessed as done. Of these, 51 (61.4 percent) are Implemented and 32 (38.6 percent) are Audited.",
      ),
    ).toEqual([]);
  });

  it("still rejects a percentage built from two unrelated figures (6 groups over 13 models)", () => {
    const found = violationsOfSummary(
      "The rules check 6 of 16 groups against the records of 13 models. The rule-based verification covers only 46 percent of the framework.",
    );
    expect(found.map((v) => v.reason)).toContain("percentage");
  });

  it("still rejects a number no single operation on the item's figures yields", () => {
    expect(
      violationsOfFinding(
        "4 validations were signed off in the period, against 21 models in scope.",
      ).map((v) => v.reason),
    ).toContain("number");
  });

  it("still rejects a section group count the input does not state", () => {
    expect(
      violationsOfFinding("Section B has 0 of 4 groups checked.").map((v) => v.reason),
    ).toEqual(expect.arrayContaining(["groupCount"]));
  });
});

describe("G2 (c): only a period figure put in the monitoring window is a period error", () => {
  it.each([
    "All 13 models have active thresholds and a metric received in the last 90 days, and 0 threshold breaches were recorded in the period.",
    "Monitoring shows 13 of 13 models with active thresholds and 13 of 13 with a metric received in the last 90 days, and 0 threshold breaches and 0 revalidation events in the period.",
    "All 13 models have active thresholds and a metric received within the last 90 days, and no threshold breaches were recorded in the period.",
  ])("passes %p", (sentence) => {
    expect(violationsOfSummary(sentence)).toEqual([]);
  });

  it("catches activity counts attributed to the 90-day window", () => {
    expect(
      violationsOfSummary(
        "During the 90-day monitoring window ending 23 November 2026, 4 validation sign-offs were recorded.",
      ).map((v) => v.reason),
    ).toContain("period");
  });
});

describe("I2: internal field names", () => {
  it("rejects a camelCase identifier in prose", () => {
    const found = violationsOfFinding(
      "The next report shows validatedNothingOpen still equal to the model count, with overdueValidations at 0.",
    );
    expect(found.map((v) => v.reason)).toContain("identifier");
  });

  it("gives an E-23 run's facts human labels, not field names", () => {
    const { facts, formalFacts } = collectFactsInput(liveRun());
    for (const block of [facts, formalFacts]) {
      expect(block).not.toMatch(/\b[a-z]+[A-Z][A-Za-z0-9]*\b/);
      expect(block).not.toMatch(/\w=\d/);
      expect(block).toContain("validated with none open: 13");
      expect(block).toContain("rules that fired: 0");
    }
  });

  it("leaves a general report's facts exactly as before", () => {
    const { facts } = collectFactsInput(nonKindReportData());
    expect(facts).toMatch(/\w=\d/);
  });
});

describe("I1 and I3: what the formal analyzers are given on an E-23 run", () => {
  it("states requirement dates and evidence, per-section groups, tiers and fired rules plainly", () => {
    const prompt = ANALYZERS.executiveSummary.buildUserPrompt(rd, extrasFor(rd));
    expect(prompt).toContain(
      "E-23 requirements: 83 in total; done 83 (Implemented 51, Audited 32); with a due date 20; overdue 0; with an owner 83; with evidence attached 83; without evidence 0.",
    );
    expect(prompt).toContain(
      "- Section D.2: 8 groups (3 checked, 5 self-assessment only); 42 requirements (16 in checked groups, 26 in self-assessment-only groups)",
    );
    expect(prompt).toContain("- Section B: 3 groups (0 checked, 3 self-assessment only)");
    expect(prompt).toContain(
      "- All groups: 16 groups (6 checked, 10 self-assessment only); 83 requirements (37 in checked groups, 46 in self-assessment-only groups)",
    );
    expect(prompt).toContain("- Principle 2.2 – Model risk rating (C.2): 8 requirements, checked");
    expect(prompt).toContain(
      "- Tier 1: models 5, tiering current 5, validated 5, monitoring active 5, open findings 3 (critical 0, high 0, medium 2, low 1)",
    );
    expect(prompt).toContain(
      "Rules checked: 13; rules that fired: 0 of 13 (no contradiction found); rules not run: 0.",
    );
  });

  it("puts the same plain rules line in the contradictions text", () => {
    const prompt = ANALYZERS.e23Gap.buildUserPrompt(rd, extrasFor(rd));
    expect(prompt).toContain(
      "Rules checked: 13; rules that fired: 0 of 13 (no contradiction found)",
    );
  });

  it("adds nothing to a general report", () => {
    const prompt = ANALYZERS.executiveSummary.buildUserPrompt(nonKindReportData(), {
      sectionSummaries: SUMMARIES,
    });
    expect(prompt).not.toContain("E-23 requirements:");
    expect(prompt).not.toContain("Section D.2");
  });
});

describe("G2 (d): drop a sentence, then an item, before abstaining a section", () => {
  beforeEach(() => {
    mockGenerate.mockReset();
    mockSectionSummaries.mockReset().mockResolvedValue(SUMMARIES);
  });

  const GOOD =
    "None of the 13 rules checked against the records fired. All 83 requirements are done.";
  const BAD = "The institution is fully compliant with E-23.";

  it("drops only the offending sentence of the executive summary", async () => {
    mockGenerate.mockResolvedValue({
      object: { summary: `${GOOD} ${BAD}`, abstain_reason: null },
      attempts: 1,
    });
    const out = await runAnalyzers({
      reportData: liveRun(),
      llmKey,
      blocks: { ...NONE, executiveSummary: true },
      extras: { formalFacts: extrasFor(liveRun()).formalFacts },
    });
    const r = out.executiveSummary!;
    expect(r.abstained).toBe(false);
    expect(r.payload.summary).toBe(GOOD);
    expect(r.guardRejections).toContainEqual(
      expect.objectContaining({ stage: "removed", field: "summary", sentence: BAD }),
    );
  });

  it("keeps a paragraph break when it drops a sentence", async () => {
    mockGenerate.mockResolvedValue({
      object: {
        summary: `${GOOD}\n\n${BAD} All 13 models are validated with none open.`,
        abstain_reason: null,
      },
      attempts: 1,
    });
    const out = await runAnalyzers({
      reportData: liveRun(),
      llmKey,
      blocks: { ...NONE, executiveSummary: true },
      extras: { formalFacts: extrasFor(liveRun()).formalFacts },
    });
    expect(out.executiveSummary!.payload.summary).toBe(
      `${GOOD}\n\nAll 13 models are validated with none open.`,
    );
  });

  it("abstains only when what is left is under the schema minimum", async () => {
    mockGenerate.mockResolvedValue({ object: { summary: BAD, abstain_reason: null }, attempts: 1 });
    const out = await runAnalyzers({
      reportData: liveRun(),
      llmKey,
      blocks: { ...NONE, executiveSummary: true },
    });
    expect(out.executiveSummary).toMatchObject({
      abstained: true,
      abstain_reason: E23_GUARD_REJECTED,
    });
  });

  it("keeps a finding whose bad sentence leaves enough text, and nulls a closing condition that is all bad", async () => {
    const payload = {
      findings: [
        finding(
          `All 13 models are validated with none open. ${BAD}`,
          "The next report shows validatedNothingOpen at 13.",
        ),
      ],
      abstain_reason: null,
    };
    mockGenerate.mockResolvedValue({ object: payload, attempts: 1 });
    const out = await runAnalyzers({
      reportData: liveRun(),
      llmKey,
      blocks: { ...NONE, keyFindings: true },
      extras: { formalFacts: extrasFor(liveRun()).formalFacts },
    });
    const r = out.keyFindings!;
    expect(r.abstained).toBe(false);
    expect(r.payload.findings[0]).toMatchObject({
      text: "All 13 models are validated with none open.",
      what_would_close_this: null,
    });
  });
});
