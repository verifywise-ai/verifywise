/**
 * @fileoverview E-23 kind runs: which sections collectAllData builds, the
 * notices it raises when E-23 or the MRM data is missing, and the "at a
 * glance" figures. Non-kind runs must not touch any of it.
 *
 * @module tests/dataCollector.e23
 */

jest.mock("../../../database/db", () => ({
  sequelize: { query: jest.fn().mockResolvedValue([]) },
}));

jest.mock("../../../utils/reporting.utils", () => ({
  getProjectRisksReportQuery: jest.fn().mockResolvedValue([]),
  getAssessmentReportQuery: jest.fn().mockResolvedValue([]),
  getComplianceReportQuery: jest.fn().mockResolvedValue([]),
  getClausesReportQuery: jest.fn().mockResolvedValue([]),
  getAnnexesReportQuery: jest.fn().mockResolvedValue([]),
  getClausesReportQueryISO27001: jest.fn().mockResolvedValue([]),
  getAnnexesReportQueryISO27001: jest.fn().mockResolvedValue([]),
}));

jest.mock("../../../utils/logger/fileLogger", () => ({
  __esModule: true,
  default: { debug: jest.fn(), error: jest.fn(), info: jest.fn(), warn: jest.fn() },
  logStructuredError: jest.fn(),
}));

const mockCollectMrm = jest.fn();
jest.mock("../collectors/mrmModelFacts", () => ({
  ...jest.requireActual("../collectors/mrmModelFacts"),
  collectMrmModelFacts: (...a: unknown[]) => mockCollectMrm(...a),
}));

import * as frameworkRequirements from "../collectors/frameworkRequirements";
import { logStructuredError } from "../../../utils/logger/fileLogger";
import { createScopedDataCollector } from "../dataCollector";
import type { FrameworkTarget } from "../reportScope";
import type {
  FrameworkRequirementRow,
  FrameworkRequirementsSectionData,
  MrmActivity,
  MrmModelFacts,
} from "../../../domain.layer/interfaces/i.reportGeneration";
import { buildMrmFleet } from "../e23/mrmFleet";
import { buildE23FixItView } from "../e23/fixItView";
import { E23_NOT_ON_FILE, NO_FIX_IT_ITEMS } from "../e23/e23Text";

const E23_RUN = {
  reportKind: "osfi_e23",
  reportParameters: { periodStart: "2026-07-01", periodEnd: "2026-09-30" },
};

const e23Target: FrameworkTarget = {
  projectId: 7,
  projectTitle: "Organization",
  isOrganizationalProject: true,
  frameworkId: 26,
  frameworkName: "OSFI E-23",
  projectFrameworkId: 70,
};

const soc2Target: FrameworkTarget = {
  projectId: 7,
  projectTitle: "Organization",
  isOrganizationalProject: true,
  frameworkId: 5,
  frameworkName: "SOC 2",
  projectFrameworkId: 71,
};

const row = (over: Partial<FrameworkRequirementRow>): FrameworkRequirementRow => ({
  implId: 1,
  level: 2,
  title: "1.1 Requirement",
  orderNo: 1,
  status: "Implemented",
  owner: "Ann Owner",
  reviewer: null,
  approver: null,
  dueDate: null,
  isDone: true,
  isOverdue: false,
  evidenceCount: 1,
  evidenceFiles: [],
  riskCount: 0,
  ...over,
});

const rollup = (done: number, total: number) => ({
  total,
  done,
  unassigned: 0,
  noEvidence: 0,
  overdue: 0,
  statusBreakdown: {},
});

// 2.2.3 is C2's requirement (every model rated), claimed done.
const e23Requirements: FrameworkRequirementsSectionData = {
  frameworks: [
    {
      frameworkId: 26,
      frameworkName: "OSFI E-23",
      groups: [
        {
          title: "Model risk management",
          orderNo: 1,
          // The rollup matches the rows: the glance counts the rows.
          requirements: [row({ title: "2.2.3 Rating", implId: 1, orderNo: 1 })],
          rollup: rollup(1, 1),
        },
      ],
      rollup: rollup(1, 1),
    },
  ],
};

const soc2Requirements: FrameworkRequirementsSectionData = {
  frameworks: [{ frameworkId: 5, frameworkName: "SOC 2", groups: [], rollup: rollup(3, 4) }],
};

const model = (over: Partial<MrmModelFacts> = {}): MrmModelFacts => ({
  id: 1,
  name: "Scorecard",
  version: "1",
  provider: null,
  type: null,
  status: "Approved",
  retired: false,
  tier: null,
  tieredAt: null,
  revalidationFlagged: false,
  intendedUse: null,
  limitations: null,
  inventoryApproverId: null,
  inventoryApprover: null,
  roles: { owner: [], developerIds: [], validator: [], approver: [] },
  hasOpenValidation: false,
  openValidationNextDue: null,
  latestSignedOff: null,
  nextReviewDue: null,
  activeThresholds: 0,
  lastMetricReceivedAt: null,
  findings: [],
  ...over,
});

const activity: MrmActivity = {
  period: { start: "2026-07-01", end: "2026-09-30" },
  validationsSignedOff: 0,
  findingsOpened: 0,
  findingsClosed: 0,
  breaches: 0,
  revalidationEvents: 0,
};

const ALL_E23 = [
  "mrmFleet",
  "e23Contradictions",
  "e23FixItList",
  "mrmInventoryAppendix",
  "signOff",
];

const requirementsSpy = () =>
  jest
    .spyOn(frameworkRequirements, "collectFrameworkRequirements")
    .mockImplementation(async (t) => (t.frameworkId === 26 ? e23Requirements : soc2Requirements));

beforeEach(() => {
  jest.restoreAllMocks();
  mockCollectMrm.mockReset().mockResolvedValue({ models: [model()], activity });
  (logStructuredError as jest.Mock).mockReset();
});

describe("E-23 kind run", () => {
  it("collects E-23 requirements for the rules even when frameworkRequirements is off", async () => {
    const spy = requirementsSpy();
    const collector = createScopedDataCollector(10, 1, "organization", [e23Target, soc2Target]);

    const data = await collector.collectAllData(ALL_E23, E23_RUN);

    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0][0]).toBe(e23Target);
    expect(data.sections.frameworkRequirements).toBeUndefined();
    // Kept off the sections for the analyzers (e23Gap), which need them too.
    expect(data.e23Requirements?.frameworks.map((f) => f.frameworkId)).toEqual([26]);
    expect(data.sections.e23Contradictions?.available).toBe(true);
    expect(data.sections.mrmFleet).toBeDefined();
    expect(data.sections.mrmInventoryAppendix).toBeDefined();
    expect(data.sections.e23FixItList).toBeDefined();
    expect(data.sections.signOff).toEqual({});
    expect(data.sectionNotices).toEqual([]);
  });

  it("calls collectMrmModelFacts once with the report period", async () => {
    requirementsSpy();
    const collector = createScopedDataCollector(10, 1, "organization", [e23Target]);

    const data = await collector.collectAllData(ALL_E23, E23_RUN);

    expect(mockCollectMrm).toHaveBeenCalledTimes(1);
    expect(mockCollectMrm).toHaveBeenCalledWith(
      10,
      data.metadata.generatedAt,
      { start: "2026-07-01", end: "2026-09-30" },
      expect.any(Function),
    );
  });

  it("passes a null period when the parameters carry no dates", async () => {
    requirementsSpy();
    const collector = createScopedDataCollector(10, 1, "organization", [e23Target]);

    await collector.collectAllData(ALL_E23, { reportKind: "osfi_e23", reportParameters: {} });

    expect(mockCollectMrm.mock.calls[0][2]).toBeNull();
  });

  it("without E-23 on file: notices, rules unavailable, fleet present, model-only fix-it", async () => {
    requirementsSpy();
    const collector = createScopedDataCollector(10, 1, "organization", [soc2Target]);

    const data = await collector.collectAllData(["frameworkRequirements", ...ALL_E23], E23_RUN);

    expect(data.sections.e23Contradictions?.available).toBe(false);
    expect(data.sectionNotices).toContainEqual({
      sectionKey: "e23Contradictions",
      reason: "no_framework_target",
    });
    expect(data.sectionNotices).toContainEqual({
      sectionKey: "frameworkRequirements",
      reason: "no_framework_target",
    });
    expect(data.sectionNotices).toContainEqual({
      sectionKey: "e23FixItList",
      reason: "no_framework_target",
    });
    expect(data.sections.mrmFleet).toBeDefined();
    const items = data.sections.e23FixItList?.items ?? [];
    expect(items.length).toBeGreaterThan(0);
    expect(items.every((i) => i.source === 7)).toBe(true);
    expect(data.sections.e23Glance?.requirementsAvailable).toBe(false);
  });

  it("without E-23 on file, a run selecting only the fix-it list never calls it clear", async () => {
    requirementsSpy();
    // A model with no gaps, so the list is empty: only the checklist is missing.
    mockCollectMrm.mockResolvedValue({
      models: [
        model({
          tier: "3",
          roles: { owner: ["Olu Owner"], developerIds: [], validator: [], approver: ["Ana"] },
        }),
      ],
      activity,
    });
    const collector = createScopedDataCollector(10, 1, "organization", [soc2Target]);

    const data = await collector.collectAllData(["e23FixItList"], E23_RUN);

    expect(data.sectionNotices).toEqual([
      { sectionKey: "e23FixItList", reason: "no_framework_target" },
    ]);
    expect(data.sections.e23FixItList?.items).toEqual([]);
    const text = JSON.stringify(buildE23FixItView(data, { runId: 1 }));
    expect(text).toContain(E23_NOT_ON_FILE);
    expect(text).not.toContain(NO_FIX_IT_ITEMS);
  });

  it("without any bundled framework: one no_framework_target per requested section", async () => {
    const collector = createScopedDataCollector(10, 1, "organization", []);

    const data = await collector.collectAllData(
      ["frameworkRequirements", "e23Contradictions"],
      E23_RUN,
    );

    expect(data.sectionNotices).toEqual([
      { sectionKey: "frameworkRequirements", reason: "no_framework_target" },
      { sectionKey: "e23Contradictions", reason: "no_framework_target" },
    ]);
  });

  it("a failed E-23 pairing: rules unavailable, each dependent section says why", async () => {
    jest
      .spyOn(frameworkRequirements, "collectFrameworkRequirements")
      .mockRejectedValue(new Error("boom"));
    const collector = createScopedDataCollector(10, 1, "organization", [e23Target]);

    const data = await collector.collectAllData(ALL_E23, E23_RUN);

    expect(data.sections.e23Contradictions?.available).toBe(false);
    expect(data.sectionNotices).toEqual([
      {
        sectionKey: "frameworkRequirements",
        reason: "collection_failed",
        detail: "OSFI E-23 (organization)",
      },
      {
        sectionKey: "e23Contradictions",
        reason: "collection_failed",
        detail: "OSFI E-23 checklist",
      },
      { sectionKey: "e23FixItList", reason: "collection_failed", detail: "OSFI E-23 checklist" },
    ]);
    expect(data.sections.e23Glance?.requirementsAvailable).toBe(false);
  });

  it("a failed E-23 pairing raises no checklist notice on unselected sections", async () => {
    jest
      .spyOn(frameworkRequirements, "collectFrameworkRequirements")
      .mockRejectedValue(new Error("boom"));
    const collector = createScopedDataCollector(10, 1, "organization", [e23Target]);

    const data = await collector.collectAllData(["mrmFleet"], E23_RUN);

    expect(data.sectionNotices).toEqual([
      {
        sectionKey: "frameworkRequirements",
        reason: "collection_failed",
        detail: "OSFI E-23 (organization)",
      },
    ]);
  });

  it("selecting mrmFleet only still computes the glance", async () => {
    requirementsSpy();
    const collector = createScopedDataCollector(10, 1, "organization", [e23Target]);

    const data = await collector.collectAllData(["mrmFleet"], E23_RUN);

    expect(data.sections.e23Contradictions).toBeUndefined();
    expect(data.sections.e23FixItList).toBeUndefined();
    expect(data.sections.mrmInventoryAppendix).toBeUndefined();
    expect(data.sections.signOff).toBeUndefined();
    expect(data.sections.e23Glance).toMatchObject({
      requirementsDone: 1,
      requirementsTotal: 1,
      modelsInScope: 1,
      untiered: 1,
      rulesTotal: 13,
      previous: null,
    });
    // The untiered model fires C2 against the "done" 2.2.3.
    expect(data.sections.e23Glance?.rulesFired).toBeGreaterThan(0);
  });

  it("glance numbers equal the section numbers", async () => {
    requirementsSpy();
    const models = [
      model(),
      model({ id: 2, name: "Pricing", tier: "1", tieredAt: "2026-01-01T00:00:00.000Z" }),
    ];
    mockCollectMrm.mockResolvedValue({ models, activity });
    const collector = createScopedDataCollector(10, 1, "organization", [e23Target]);

    const data = await collector.collectAllData(["frameworkRequirements", ...ALL_E23], E23_RUN);
    const s = data.sections;
    const glance = s.e23Glance!;

    const fw26 = s.frameworkRequirements!.frameworks.find((f) => f.frameworkId === 26)!;
    expect(glance.requirementsDone).toBe(fw26.rollup.done);
    expect(glance.requirementsTotal).toBe(fw26.rollup.total);
    expect(glance.rulesFired).toBe(s.e23Contradictions!.fired.length);
    const coverage = Object.values(s.e23Contradictions!.coverage);
    expect(glance.groupsTotal).toBe(coverage.length);
    expect(glance.groupsChecked).toBe(coverage.filter((c) => c === "checked").length);
    expect(glance.modelsInScope).toBe(s.mrmFleet!.totals.models);
    expect(glance.untiered).toBe(s.mrmFleet!.totals.untiered);
    expect(glance.overdueValidations).toBe(s.mrmFleet!.validationCoverage.overdue);
    expect(glance.openCriticalHigh).toBe(
      s.mrmFleet!.openFindingsBySeverity.critical + s.mrmFleet!.openFindingsBySeverity.high,
    );
    expect(glance.fixIt).toEqual(s.e23FixItList!.counts);
    expect(s.mrmFleet).toEqual(buildMrmFleet(models, activity, data.metadata.generatedAt));
  });

  it("puts the prior run's figures on the glance", async () => {
    requirementsSpy();
    const collector = createScopedDataCollector(10, 1, "organization", [e23Target]);
    const previous = {
      requirementsDone: 0,
      requirementsTotal: 2,
      groupsChecked: 0,
      groupsTotal: 0,
      rulesFired: 0,
      rulesTotal: 13,
      modelsInScope: 0,
      untiered: 0,
      overdueValidations: 0,
      openCriticalHigh: 0,
      fixIt: { high: 0, medium: 0, low: 0 },
      generatedAt: "2026-07-01T00:00:00.000Z",
      requirementsAvailable: true,
    };

    const data = await collector.collectAllData(["mrmFleet"], E23_RUN, {
      priorE23Glance: previous,
    });

    const { requirementsAvailable: _flag, ...figures } = previous;
    expect(data.sections.e23Glance?.previous).toEqual(figures);
    expect(data.sections.e23Glance?.requirementsAvailable).toBe(true);
  });

  it("an MRM read failure: notices per selected MRM section, sections skipped, glance flagged", async () => {
    // One requirement not done and unowned, so the checklist alone yields an item.
    const notDone = row({
      title: "2.2.4 Review",
      implId: 2,
      orderNo: 2,
      isDone: false,
      owner: null,
    });
    jest
      .spyOn(frameworkRequirements, "collectFrameworkRequirements")
      .mockImplementation(async () => ({
        frameworks: [
          {
            ...e23Requirements.frameworks[0],
            groups: [
              {
                ...e23Requirements.frameworks[0].groups[0],
                requirements: [...e23Requirements.frameworks[0].groups[0].requirements, notDone],
              },
            ],
          },
        ],
      }));
    const error = new Error("mrm down");
    mockCollectMrm.mockRejectedValue(error);
    const collector = createScopedDataCollector(10, 1, "organization", [e23Target]);

    const data = await collector.collectAllData(["mrmFleet", "e23FixItList", "signOff"], E23_RUN);

    expect(data.sections.mrmFleet).toBeUndefined();
    // The fix-it list keeps the items the checklist alone can give (sources 2
    // to 6): no rule ran and no model was read. Its notice says the rest is missing.
    expect(data.sections.e23FixItList?.items.map((i) => [i.source, i.where])).toEqual([
      [2, "2.2.4 Review"],
    ]);
    expect(data.sections.e23Contradictions).toBeUndefined();
    expect(data.sections.signOff).toEqual({});
    expect(data.sectionNotices).toEqual([
      {
        sectionKey: "mrmFleet",
        reason: "collection_failed",
        detail: "Model risk management data",
      },
      {
        sectionKey: "e23FixItList",
        reason: "collection_failed",
        detail: "Model risk management data",
      },
    ]);
    expect(data.sections.e23Glance).toMatchObject({
      requirementsDone: 1,
      requirementsTotal: 2,
      modelsInScope: 0,
      rulesFired: 0,
      fixIt: { high: 0, medium: 0, low: 0 },
      mrmUnavailable: true,
    });
    expect(logStructuredError).toHaveBeenCalledWith(
      expect.stringContaining("organizationId=10"),
      error,
      expect.any(String),
      expect.any(String),
    );
  });
});

describe("non-kind run", () => {
  it("never calls collectMrmModelFacts and adds no E-23 sections", async () => {
    requirementsSpy();
    const collector = createScopedDataCollector(10, 1, "organization", [e23Target]);

    const data = await collector.collectAllData(["frameworkRequirements", ...ALL_E23]);

    expect(mockCollectMrm).not.toHaveBeenCalled();
    expect(Object.keys(data.sections)).toEqual(["frameworkRequirements"]);
    expect(data.e23Requirements).toBeUndefined();
    expect(data.sectionNotices).toEqual([]);
  });
});
