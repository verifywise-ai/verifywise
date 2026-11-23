/**
 * The deterministic guard on the OSFI E-23 formal report's AI prose (G1): it
 * runs after parsing on an E-23 run and does not rely on the model obeying the
 * prompt. The bad sentences below are verbatim (or verbatim fragments) from a
 * real end-to-end run; the input is the executive summary prompt built from a
 * fixture shaped like that run (16 groups, 6 checked, 83 requirements, 0 of 13
 * rules fired, period 1 July to 30 September, position as at 23 November).
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
import { ANALYZERS } from "../registry";
import { runAnalyzers, type AiBlocks } from "../runAnalyzers";
import { collectFacts, formalFactsView, renderFacts } from "../facts";
import { ANALYTICAL_ABSTAIN_REASONS, E23_GUARD_REJECTED } from "../abstainReasons";
import { checkProse, guardContext, type GuardContext } from "../e23Guard";
import { e23ReportData, nonKindReportData } from "../../tests/helpers/e23ReportData";

const llmKey: any = { id: 9, name: "openai", key: "sk", url: null, model: "gpt-4o-mini" };

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

const GROUP_NAMES = [
  "Purpose and scope",
  "Model risk appetite",
  "Model inventory and governance",
  "Model rating",
  "Model development",
  "Model review and validation",
  "Model deployment",
  "Model monitoring",
  "Model decommission",
  "Roles and responsibilities",
  "Policies and procedures",
  "Data governance",
  "Third-party models",
  "Use of AI models",
  "Documentation",
  "Reporting to senior management",
];
const CHECKED = new Set(GROUP_NAMES.slice(2, 8));

/** An E-23 run shaped like the real one: 16 groups (6 checked), 83 requirements, all done. */
function kestrelBay(): ReportData {
  const rd = e23ReportData({ noContradictions: true, noPrevious: true });
  rd.metadata.generatedAt = new Date("2026-11-23T15:00:00Z");
  rd.metadata.reportParameters = {
    ...rd.metadata.reportParameters,
    institutionName: "Kestrel Bay",
    periodStart: "2026-07-01",
    periodEnd: "2026-09-30",
  };
  const groups: FrameworkRequirementGroup[] = GROUP_NAMES.map((title, g) => {
    const n = g === 0 ? 8 : 5;
    return {
      title,
      orderNo: g,
      requirements: Array.from({ length: n }, (_, i) => ({
        implId: g * 100 + i,
        level: 2,
        title: `Requirement ${title} ${String.fromCharCode(97 + i)}`,
        orderNo: i,
        status: "Implemented",
        owner: "Dana Reviewer",
        reviewer: null,
        approver: null,
        dueDate: null,
        isDone: true,
        isOverdue: false,
        evidenceCount: 1,
        evidenceFiles: ["policy.pdf"],
        riskCount: 0,
      })),
      rollup: { total: n, done: n, unassigned: 0, noEvidence: 0, overdue: 0, statusBreakdown: {} },
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
      GROUP_NAMES.map((t) => [t, CHECKED.has(t) ? "checked" : "selfAssessmentOnly"]),
    ),
  };
  rd.sections.mrmFleet = {
    totals: { models: 7, untiered: 0, byTier: { "1": 2, "2": 3, "3": 2 } },
    validationCoverage: { validated: 4, inReview: 1, notPassed: 0, notStarted: 2, overdue: 0 },
    openFindingsBySeverity: { critical: 0, high: 1, medium: 2, low: 1 },
    monitoring: { withActiveThresholds: 6, withRecentMetric: 6 },
    activity: {
      period: { start: "2026-07-01", end: "2026-09-30" },
      validationsSignedOff: 4,
      findingsOpened: 2,
      findingsClosed: 1,
      breaches: 0,
      revalidationEvents: 1,
    },
    perTier: [
      {
        tier: "1",
        models: 2,
        tieringCurrent: 2,
        validated: 2,
        monitoringActive: 2,
        openFindings: 2,
        criticalHighFindings: 1,
      },
      {
        tier: "2",
        models: 3,
        tieringCurrent: 3,
        validated: 2,
        monitoringActive: 3,
        openFindings: 1,
        criticalHighFindings: 0,
      },
      {
        tier: "3",
        models: 2,
        tieringCurrent: 2,
        validated: 0,
        monitoringActive: 1,
        openFindings: 1,
        criticalHighFindings: 0,
      },
    ],
    exceptions: [],
  };
  delete rd.sections.e23Glance;
  return rd;
}

const SUMMARIES = {
  frameworkRequirements: "Every one of the 83 requirements is marked implemented or audited.",
  mrmFleet: "Seven models are in scope; two have not started validation.",
  e23Contradictions: "No rule fired across the 13 rules checked.",
};

const extrasFor = (rd: ReportData) => ({
  sectionSummaries: SUMMARIES,
  formalFacts: renderFacts(formalFactsView(collectFacts(rd))),
});

let ctx: GuardContext;
let rd: ReportData;
beforeAll(() => {
  rd = kestrelBay();
  ctx = guardContext(ANALYZERS.executiveSummary.buildUserPrompt(rd, extrasFor(rd)), rd);
});

const BAD: Array<[string, string]> = [
  [
    "Kestrel Bay's compliance posture is operationally sound in the areas subjected to data verification.",
    "compliance",
  ],
  [
    "Zero fired, indicating either exceptional compliance or limited validation power.",
    "compliance",
  ],
  [
    "This apparent full compliance rests on a materially constrained validation scope.",
    "compliance",
  ],
  [
    "The priority is closing the asymmetry between claimed and independently verified compliance posture.",
    "compliance",
  ],
  ["Kestrel Bay has satisfied the formal completion of all 83 requirements.", "compliance"],
  ["The self-assessment runs across 17 requirement groups.", "groupCount"],
  ["The checklist is organised into 17 framework components.", "groupCount"],
  [
    "Only 5 of 16 requirement groups were tested against the records, and the remaining 11 rest on attestation.",
    "pair",
  ],
  ["The rule-based verification covers only 46 percent of the framework.", "percentage"],
  ["Tier 1 models carry 3 of the 5 medium-severity findings.", "pair"],
  [
    "During the 90-day monitoring window ending 23 November 2026, 4 validation sign-offs were recorded.",
    "period",
  ],
  ["Monitoring rests on metric data as of 2026-09-30.", "asAt"],
  ["The rule definitions used for the comparison are not disclosed.", "misreading"],
  [
    "The 10 self-assessment only groups are a verification gap the institution should close.",
    "misreading",
  ],
];

const CLEAN = [
  "83 of 83 requirements are marked implemented or audited.",
  "0 of 13 rules fired.",
  "6 of 16 groups were checked against the model risk management records.",
  "Groups marked self-assessment only are outside what this report's rules check by design.",
  "Between 2026-07-01 and 2026-09-30, 4 validations were signed off and 2 findings were opened.",
  "Position as at 2026-11-23: 7 models are in scope, 6 of them with a metric received in the last 90 days.",
  "Of the 7 models in scope, 2 have not started validation, which is 29 percent of the fleet.",
  "One high-severity finding remains open in Tier 1.",
  "This report does not express a compliance opinion on E-23.",
  "Rule C10 did not fire.",
];

describe("G1 guard: what it catches", () => {
  it.each(BAD)("catches %p", (sentence, reason) => {
    const found = checkProse(sentence, ctx);
    expect(found.map((v) => v.reason)).toContain(reason);
  });

  it.each(CLEAN)("passes %p", (sentence) => {
    expect(checkProse(sentence, ctx)).toEqual([]);
  });
});

/**
 * The same run with the sample report's fleet: 13 models (5, 5, 3 by tier), 5
 * open findings (medium 3, low 2; tier 1 holds 3), monitoring on all 13, and
 * no breach or revalidation event in the period.
 */
function sampleFleet(): ReportData {
  const r = kestrelBay();
  r.sections.mrmFleet = {
    ...r.sections.mrmFleet!,
    totals: { models: 13, untiered: 0, byTier: { "1": 5, "2": 5, "3": 3 } },
    openFindingsBySeverity: { critical: 0, high: 0, medium: 3, low: 2 },
    monitoring: { withActiveThresholds: 13, withRecentMetric: 13 },
    activity: { ...r.sections.mrmFleet!.activity, breaches: 0, revalidationEvents: 0 },
    perTier: [
      {
        tier: "1",
        models: 5,
        tieringCurrent: 5,
        validated: 5,
        monitoringActive: 5,
        openFindings: 3,
        criticalHighFindings: 0,
      },
      {
        tier: "2",
        models: 5,
        tieringCurrent: 5,
        validated: 5,
        monitoringActive: 5,
        openFindings: 1,
        criticalHighFindings: 0,
      },
      {
        tier: "3",
        models: 3,
        tieringCurrent: 3,
        validated: 3,
        monitoringActive: 3,
        openFindings: 1,
        criticalHighFindings: 0,
      },
    ],
  };
  return r;
}

/** The executive summary prompt of `r`, plus any line an analyzer's own data block would add. */
const ctxFor = (r: ReportData, extra = ""): GuardContext =>
  guardContext(`${ANALYZERS.executiveSummary.buildUserPrompt(r, extrasFor(r))}\n${extra}`, r);

/**
 * Sentences a reviewer checked against the sample run's real figures: each was
 * rejected and each is right. Next to each, a near miss the rule must still catch.
 */
describe("G1 guard: reviewed false positives pass, near misses still fail", () => {
  let fleet: GuardContext;
  beforeAll(() => {
    fleet = ctxFor(sampleFleet());
  });

  it("percentage: a cited figure over a report total of the same kind (46 of 83 requirements)", () => {
    const c = ctxFor(sampleFleet(), "Self-assessment only: 10 groups holding 46 requirements.");
    expect(
      checkProse(
        "The other 10 groups, holding 46 requirements or 55.4 percent, are self-assessment only by design.",
        c,
      ),
    ).toEqual([]);
    // No total of any kind gives 60 percent.
    expect(
      checkProse(
        "The other 10 groups, holding 46 requirements or 60 percent, are outside the rules.",
        c,
      ).map((v) => v.reason),
    ).toContain("percentage");
    // 10/83 is 12 percent, but groups over requirements is no percentage of anything.
    expect(
      checkProse("The other 10 groups are 12 percent of the framework.", c).map((v) => v.reason),
    ).toContain("percentage");
  });

  it("compliance: 'nothing' negates its clause, a bare consequence still does not", () => {
    expect(
      checkProse(
        "It does not certify anything, and it says nothing about how OSFI would view the institution.",
        fleet,
      ),
    ).toEqual([]);
    expect(
      checkProse("No rule fired, so the institution complies with E-23.", fleet).map(
        (v) => v.reason,
      ),
    ).toContain("compliance");
    expect(
      checkProse("Nothing fired, and OSFI would view that favourably.", fleet).map((v) => v.reason),
    ).toContain("compliance");
  });

  it("number: a decimal quotient of two cited figures, at its written precision", () => {
    expect(
      checkProse(
        "Open model findings stand at 5 (medium 3, low 2, with no critical or high), and tier 1 holds 3 of them (60%): 2 medium and 1 low across its 5 models, or 0.6 per model against 0.2 for tier 2 (1 across 5) and 0.33 for tier 3 (1 across 3).",
        fleet,
      ),
    ).toEqual([]);
    expect(
      checkProse("Tier 1 holds 3 open findings across its 5 models, or 0.6 per model.", fleet),
    ).toEqual([]);
    // 3/5 is 0.6, and no two figures here give 0.5.
    expect(
      checkProse("Tier 1 holds 3 open findings across its 5 models, or 0.5 per model.", fleet).map(
        (v) => v.reason,
      ),
    ).toContain("number");
    // 1/3 written to two places is 0.33, not 0.34.
    expect(
      checkProse("Tier 3 holds 1 open finding across its 3 models, or 0.34 per model.", fleet).map(
        (v) => v.reason,
      ),
    ).toContain("number");
  });

  it("period: the period's own dates tie the activity figure to it", () => {
    expect(
      checkProse(
        "Monitoring is active on all 13, each has a metric received within the last 90 days, and no threshold breach or revalidation event was recorded between 2026-07-01 and 2026-09-30.",
        fleet,
      ),
    ).toEqual([]);
    expect(
      checkProse(
        "The records show active thresholds on 13 of 13 models, a metric received in the last 90 days for 13 of 13, and 0 threshold breaches.",
        fleet,
      ).map((v) => v.reason),
    ).toContain("period");
    // A date that is not the period's start or end does not name the period.
    expect(
      checkProse(
        "In the last 90 days up to 2026-11-23, 0 threshold breaches were recorded.",
        fleet,
      ).map((v) => v.reason),
    ).toContain("period");
  });

  it("groupCount: 0 groups is never an invented total", () => {
    const c = ctxFor(sampleFleet(), "Section B: 15 requirements across 3 groups.");
    expect(
      checkProse(
        "Section B (15 requirements across 3 groups, including organizational enablement and model risk reporting) has 0 groups checked.",
        c,
      ),
    ).toEqual([]);
    expect(checkProse("Section B has 4 groups checked.", c).map((v) => v.reason)).toContain(
      "groupCount",
    );
  });

  it("identifier: a field name in prose is still caught", () => {
    expect(
      checkProse(
        "The 100 percent self-assessed completion reported in frameworkRequirements is corroborated by records only for those 37 requirements.",
        fleet,
      ).map((v) => v.reason),
    ).toContain("identifier");
  });
});

describe("G1 prompt: the E-23 header states the by-design scope and the dates", () => {
  it("says self-assessment-only groups are no gap, and ties activity counts to the period", () => {
    const prompt = ANALYZERS.executiveSummary.buildUserPrompt(rd, extrasFor(rd));
    expect(prompt).toContain(
      "Groups marked 'self-assessment only' are outside what this report's rules check by design; do not describe them as a gap, weakness or verification shortfall of the institution.",
    );
    expect(prompt).toContain(
      "E-23 requirement groups in this report: 16 (6 checked against the model risk management records, 10 self-assessment only). The framework itself is not a group.",
    );
    expect(prompt).toContain("Position as at 2026-11-23");
    expect(prompt).toContain("cover the reporting period 2026-07-01 to 2026-09-30 only");
  });

  it("adds none of it to a general report", () => {
    const prompt = ANALYZERS.executiveSummary.buildUserPrompt(nonKindReportData(), {
      sectionSummaries: SUMMARIES,
    });
    expect(prompt).not.toContain("self-assessment only");
    expect(prompt).not.toContain("Position as at");
  });
});

const summaryPayload = (summary: string) => ({ summary, abstain_reason: null });
const finding = (text: string) => ({
  text,
  section: "frameworkRequirements",
  severity: "medium",
  basis: "observed",
  what_would_close_this: null,
  related_sections: [],
});

describe("G1 guard in runAnalyzers", () => {
  beforeEach(() => {
    mockGenerate.mockReset();
    mockSectionSummaries.mockReset().mockResolvedValue(SUMMARIES);
  });

  const GOOD = `${CLEAN[0]} ${CLEAN[1]} ${CLEAN[2]} ${CLEAN[3]}`;
  const BAD_SUMMARY = `${CLEAN[0]} ${BAD[0][0]} ${CLEAN[2]}`;

  it("re-issues once with feedback naming the sentence, and keeps a clean answer", async () => {
    mockGenerate
      .mockResolvedValueOnce({ object: summaryPayload(BAD_SUMMARY), attempts: 1 })
      .mockResolvedValueOnce({ object: summaryPayload(GOOD), attempts: 1 });
    const out = await runAnalyzers({
      reportData: kestrelBay(),
      llmKey,
      blocks: { ...NONE, executiveSummary: true },
      extras: { formalFacts: extrasFor(kestrelBay()).formalFacts },
    });
    expect(mockGenerate).toHaveBeenCalledTimes(2);
    expect(mockGenerate.mock.calls[1][0].system).toContain(BAD[0][0]);
    const r = out.executiveSummary!;
    expect(r.abstained).toBe(false);
    expect(r.payload.summary).toBe(GOOD);
    expect(r.guardRetried).toBe(true);
    expect(r.guardRejections).toEqual([
      expect.objectContaining({ stage: "retried", field: "summary", reason: "compliance" }),
    ]);
  });

  it("drops the sentence that still makes the claim after the re-issue, keeping the rest", async () => {
    mockGenerate.mockResolvedValue({ object: summaryPayload(BAD_SUMMARY), attempts: 1 });
    const out = await runAnalyzers({
      reportData: kestrelBay(),
      llmKey,
      blocks: { ...NONE, executiveSummary: true },
      extras: { formalFacts: extrasFor(kestrelBay()).formalFacts },
    });
    expect(mockGenerate).toHaveBeenCalledTimes(2);
    const r = out.executiveSummary!;
    expect(r.abstained).toBe(false);
    expect(r.payload.summary).toBe(`${CLEAN[0]} ${CLEAN[2]}`);
    expect(r.guardRejections!.some((g) => g.stage === "removed")).toBe(true);
  });

  it("abstains with a stated reason when nothing sound is left", async () => {
    mockGenerate.mockResolvedValue({ object: summaryPayload(BAD[0][0]), attempts: 1 });
    const out = await runAnalyzers({
      reportData: kestrelBay(),
      llmKey,
      blocks: { ...NONE, executiveSummary: true },
    });
    expect(mockGenerate).toHaveBeenCalledTimes(2);
    expect(out.executiveSummary).toMatchObject({
      abstained: true,
      abstain_reason: E23_GUARD_REJECTED,
      payload: null,
    });
    expect(ANALYTICAL_ABSTAIN_REASONS).toContain(E23_GUARD_REJECTED);
  });

  it("drops only the offending key finding when the rest is sound", async () => {
    const payload = {
      findings: [finding(CLEAN[0]), finding(BAD[5][0]), finding(CLEAN[1])],
      abstain_reason: null,
    };
    mockGenerate.mockResolvedValue({ object: payload, attempts: 1 });
    const out = await runAnalyzers({
      reportData: kestrelBay(),
      llmKey,
      blocks: { ...NONE, keyFindings: true },
      extras: { formalFacts: extrasFor(kestrelBay()).formalFacts },
    });
    const r = out.keyFindings!;
    expect(r.abstained).toBe(false);
    expect(r.payload.findings.map((f: any) => f.text)).toEqual([CLEAN[0], CLEAN[1]]);
    expect(r.guardRejections).toContainEqual(
      expect.objectContaining({
        stage: "removed",
        field: "findings",
        index: 1,
        reason: "groupCount",
      }),
    );
  });

  it("leaves a general report's prose alone: no guard, no re-issue", async () => {
    const object = summaryPayload(`${BAD[0][0]} ${BAD[5][0]}`);
    mockGenerate.mockResolvedValue({ object, attempts: 1 });
    const out = await runAnalyzers({
      reportData: nonKindReportData(),
      llmKey,
      blocks: { ...NONE, executiveSummary: true },
    });
    expect(mockGenerate).toHaveBeenCalledTimes(1);
    expect(out.executiveSummary!.payload).toEqual(object);
    expect(out.executiveSummary!.guardRejections).toBeUndefined();
  });
});
