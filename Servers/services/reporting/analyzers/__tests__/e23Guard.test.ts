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
    validationCoverage: { validated: 4, inReview: 1, notStarted: 2, overdue: 0 },
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

  it("abstains with a stated reason when the re-issue still makes the claim", async () => {
    mockGenerate.mockResolvedValue({ object: summaryPayload(BAD_SUMMARY), attempts: 1 });
    const out = await runAnalyzers({
      reportData: kestrelBay(),
      llmKey,
      blocks: { ...NONE, executiveSummary: true },
    });
    expect(mockGenerate).toHaveBeenCalledTimes(2);
    const r = out.executiveSummary!;
    expect(r).toMatchObject({ abstained: true, abstain_reason: E23_GUARD_REJECTED, payload: null });
    expect(r.guardRejections!.some((g) => g.stage === "removed")).toBe(true);
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
