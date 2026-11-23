/**
 * What the formal analyzers (executiveSummary, keyFindings, recommendedActions,
 * e23Gap) are told on an OSFI E-23 run, found by a real end-to-end run:
 * - keyFindings must be able to name a section key (B1);
 * - every prompt carries the "never state compliance or OSFI's view" rule and
 *   the exact number of E-23 requirement groups (B2);
 * - an empty fix-it list buys no invented remediation (B3);
 * - the reference date reads the same day as the cover (B4).
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
jest.mock("playwright", () => ({ chromium: { launch: jest.fn() } }));
// facts imports isoDate from dataCollector, which loads the real sequelize
// instance; unmocked, that opens a DB connection during a unit test.
jest.mock("../../../../database/db", () => ({ sequelize: {} }));

import { keyFindingsSchema } from "../schemas";
import { ANALYZERS } from "../registry";
import { runAnalyzers, type AiBlocks } from "../runAnalyzers";
import { mapAnalysesToSummaries } from "../mapToSummaries";
import { ANALYTICAL_ABSTAIN_REASONS, NO_FIX_IT_ITEMS } from "../abstainReasons";
import { collectFacts, reportReferenceDay } from "../facts";
import { renderReportHtml } from "../../pdfGenerator";
import {
  e23FixItReportData,
  e23ReportData,
  nonKindReportData,
} from "../../tests/helpers/e23ReportData";

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

const SUMMARIES = {
  frameworkRequirements: "Every requirement is self-assessed as done.",
  mrmFleet: "3 of 9 models are untiered.",
  e23Contradictions: "One rule fired: 2.2.3 claims every model is rated.",
};

const finding = (section: string, related: string[] = []) => ({
  text: "Rule C2 fired: 3 of 9 models carry no MRM tier although every model is claimed rated.",
  section,
  severity: "high",
  basis: "observed",
  what_would_close_this: "Every model in scope carries an MRM tier.",
  related_sections: related,
});

const NO_COMPLIANCE_RULE = "Never state or imply that the institution complies with E-23";

beforeEach(() => {
  mockGenerate.mockReset();
  mockSectionSummaries.mockReset().mockResolvedValue(SUMMARIES);
});

describe("B1: keyFindings can name the section keys on an E-23 run", () => {
  it("shows each section's key beside its label and lists the keys the field accepts", () => {
    const prompt = ANALYZERS.keyFindings.buildUserPrompt(e23ReportData(), {
      sectionSummaries: SUMMARIES,
    });
    expect(prompt).toContain(
      "[Where the checklist and the data disagree] (section key: e23Contradictions)",
    );
    expect(prompt).toContain("[Model risk management status] (section key: mrmFleet)");
    expect(prompt).toContain(
      "Section keys in this input (section and related_sections must use these exactly): frameworkRequirements, mrmFleet, e23Contradictions",
    );
  });

  it("validates, keeps and renders a finding attributed to an E-23 section key", async () => {
    const payload = {
      findings: [finding("e23Contradictions", ["mrmFleet"])],
      abstain_reason: null,
    };
    expect(keyFindingsSchema.safeParse(payload).success).toBe(true);
    mockGenerate.mockResolvedValue({ object: payload, attempts: 1, selfCorrected: false });

    const rd = e23ReportData();
    const out = await runAnalyzers({
      reportData: rd,
      llmKey,
      blocks: { ...NONE, keyFindings: true },
    });

    expect(out.keyFindings!.abstained).toBe(false);
    expect(out.keyFindings!.payload.findings[0]).toMatchObject({
      section: "e23Contradictions",
      related_sections: ["mrmFleet"],
    });
    const summaries = mapAnalysesToSummaries(out as any);
    rd.aiSummaries = { ...rd.aiSummaries, ...summaries } as any;
    const html = renderReportHtml(rd);
    expect(html).toContain("Rule C2 fired: 3 of 9 models carry no MRM tier");
    expect(html).toContain("Section: e23Contradictions");
  });

  it("maps a section label the model copied back to its key, on an E-23 run", async () => {
    mockGenerate.mockResolvedValue({
      object: {
        findings: [finding("Model risk management status", ["framework requirements"])],
        abstain_reason: null,
      },
      attempts: 1,
      selfCorrected: false,
    });
    const out = await runAnalyzers({
      reportData: e23ReportData(),
      llmKey,
      blocks: { ...NONE, keyFindings: true },
    });
    expect(out.keyFindings!.payload.findings[0]).toMatchObject({
      section: "mrmFleet",
      related_sections: ["frameworkRequirements"],
    });
  });

  it("leaves a general report's findings exactly as the model wrote them", async () => {
    const object = {
      findings: [finding("Framework requirements", ["Policy Manager"])],
      abstain_reason: null,
    };
    mockGenerate.mockResolvedValue({ object, attempts: 1, selfCorrected: false });
    const out = await runAnalyzers({
      reportData: nonKindReportData(),
      llmKey,
      blocks: { ...NONE, keyFindings: true },
    });
    expect(out.keyFindings!.payload).toEqual(object);
  });
});

describe("B2: the no-compliance rule and the group count reach every formal prompt", () => {
  const extras = { sectionSummaries: SUMMARIES };

  it("carries the rule and the exact E-23 group count in each formal analyzer's prompt", () => {
    const rd = e23ReportData();
    for (const key of [
      "executiveSummary",
      "keyFindings",
      "recommendedActions",
      "e23Gap",
    ] as const) {
      const prompt = ANALYZERS[key].buildUserPrompt(rd, extras);
      expect(prompt).toContain(NO_COMPLIANCE_RULE);
      expect(prompt).toContain("OSFI's view");
      expect(prompt).toContain(
        "E-23 requirement groups in this report: 3 (2 checked against the model risk management records, 1 self-assessment only). The framework itself is not a group.",
      );
    }
    const board = ANALYZERS.executiveSummary.buildUserPrompt(
      e23ReportData({ audience: "board" }),
      extras,
    );
    expect(board).toContain(NO_COMPLIANCE_RULE);
  });

  it("states no group count when the run holds no E-23 requirements", () => {
    const prompt = ANALYZERS.executiveSummary.buildUserPrompt(
      e23ReportData({ notOnFile: true }),
      extras,
    );
    expect(prompt).toContain(NO_COMPLIANCE_RULE);
    expect(prompt).not.toContain("E-23 requirement groups in this report");
  });

  it("adds nothing to a general report's prompts", () => {
    for (const key of ["executiveSummary", "keyFindings", "recommendedActions"] as const) {
      const prompt = ANALYZERS[key].buildUserPrompt(nonKindReportData(), extras);
      expect(prompt).not.toContain(NO_COMPLIANCE_RULE);
      expect(prompt).not.toContain("section key:");
    }
  });
});

describe("B3: an empty fix-it list buys no invented remediation", () => {
  it("abstains without a call, with a stated reason, when the list is complete and empty", async () => {
    const out = await runAnalyzers({
      reportData: e23FixItReportData({ items: [] }),
      llmKey,
      blocks: { ...NONE, recommendedActions: true },
    });
    expect(mockGenerate).not.toHaveBeenCalled();
    expect(out.recommendedActions).toMatchObject({
      abstained: true,
      abstain_reason: NO_FIX_IT_ITEMS,
      payload: null,
    });
    // A statement about the estate, so it prints as written.
    expect(ANALYTICAL_ABSTAIN_REASONS).toContain(NO_FIX_IT_ITEMS);
  });

  it("tells the model not to invent work when the empty list is incomplete", () => {
    const rd = e23FixItReportData({ items: [] });
    rd.sectionNotices = [
      { sectionKey: "e23FixItList", reason: "collection_failed", detail: "E-23 checklist" },
    ];
    expect(ANALYZERS.recommendedActions.abstainWithoutCall!(rd)).toBeNull();
    const prompt = ANALYZERS.recommendedActions.buildUserPrompt(rd, {
      sectionSummaries: SUMMARIES,
    });
    expect(prompt).toContain("The fix-it list has no items");
    expect(prompt).toContain("do not invent remediation");
  });

  it("still calls the model when the list has items, and on a general report", () => {
    expect(ANALYZERS.recommendedActions.abstainWithoutCall!(e23FixItReportData())).toBeNull();
    expect(ANALYZERS.recommendedActions.abstainWithoutCall!(nonKindReportData())).toBeNull();
    expect(ANALYZERS.recommendedActions.abstainWithoutCall!(e23ReportData())).toBeNull();
  });
});

describe("B4: the E-23 reference date is the cover's UTC day", () => {
  const realTz = process.env.TZ;
  beforeAll(() => {
    process.env.TZ = "America/Toronto";
  });
  afterAll(() => {
    process.env.TZ = realTz;
  });

  // 02:00 UTC on the 21st is still the 20th in Toronto.
  const LATE = new Date("2026-11-21T02:00:00Z");

  it("uses the UTC day on an E-23 run, as the cover does", () => {
    const rd = e23ReportData();
    rd.metadata.generatedAt = LATE;
    expect(reportReferenceDay(rd)).toBe("2026-11-21");
    expect(collectFacts(rd).generatedAt).toBe("2026-11-21");
  });

  it("keeps a general report on the local day it always used", () => {
    const rd = nonKindReportData();
    rd.metadata.generatedAt = LATE;
    expect(reportReferenceDay(rd)).toBe("2026-11-20");
    expect(collectFacts(rd).generatedAt).toBe("2026-11-20");
  });
});
