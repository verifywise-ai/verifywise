import type {
  E23ContradictionsSectionData,
  E23FixItListSectionData,
  FrameworkRequirementGroup,
  FrameworkRequirementRollup,
  FrameworkRequirementRow,
  FrameworkRequirementsSectionData,
  MrmFleetSectionData,
} from "../../../../domain.layer/interfaces/i.reportGeneration";
import { buildE23Glance, parseStoredE23Glance, toE23GlanceSnapshot } from "../glance";

const rollup = (done: number, total: number): FrameworkRequirementRollup => ({
  total,
  done,
  unassigned: 0,
  noEvidence: 0,
  overdue: 0,
  statusBreakdown: {},
});

const req = (
  title: string,
  isDone: boolean,
  children?: FrameworkRequirementRow[],
): FrameworkRequirementRow => ({
  implId: 0,
  level: 2,
  title,
  orderNo: 0,
  status: isDone ? "Implemented" : "Draft",
  owner: "Ann Owner",
  reviewer: null,
  approver: null,
  dueDate: null,
  isDone,
  isOverdue: false,
  evidenceCount: 1,
  evidenceFiles: [],
  riskCount: 0,
  ...(children && { children }),
});

const group = (requirements: FrameworkRequirementRow[], useCase?: string) =>
  ({
    title: "Governance",
    orderNo: 1,
    ...(useCase && { useCase }),
    requirements,
    rollup: rollup(0, 0),
  }) as FrameworkRequirementGroup;

// 83 E-23 requirements, the first 30 done.
const e23Rows = Array.from({ length: 83 }, (_, i) => req(`2.${i + 1} Requirement`, i < 30));

const requirements: FrameworkRequirementsSectionData = {
  frameworks: [
    { frameworkId: 5, frameworkName: "SOC 2", groups: [], rollup: rollup(9, 9) },
    {
      frameworkId: 26,
      frameworkName: "OSFI E-23",
      groups: [group(e23Rows)],
      rollup: rollup(30, 83),
    },
  ],
};

const contradictions: E23ContradictionsSectionData = {
  available: true,
  fired: [
    {
      ruleId: "C1",
      requirement: "2.1.1",
      requirementTitle: "2.1.1 X",
      claimedStatus: "Implemented",
      finding: "f",
      affectedCount: 1,
      examples: [],
      moreCount: 0,
    },
  ],
  checked: ["C1", "C2"],
  notRun: [],
  coverage: { A: "checked", B: "selfAssessmentOnly", C: "checked" },
};

const fleet = {
  totals: { models: 12, untiered: 3, byTier: { "1": 4, "2": 3, "3": 2 } },
  validationCoverage: { validated: 5, inReview: 2, notStarted: 5, overdue: 4 },
  openFindingsBySeverity: { critical: 1, high: 2, medium: 7, low: 9 },
} as unknown as MrmFleetSectionData;

const fixIt: E23FixItListSectionData = { items: [], counts: { high: 6, medium: 5, low: 4 } };

describe("buildE23Glance", () => {
  it("takes every figure from the sections it summarises", () => {
    const glance = buildE23Glance({ requirements, contradictions, fleet, fixIt, previous: null });
    expect(glance).toEqual({
      requirementsDone: 30,
      requirementsTotal: 83,
      groupsChecked: 2,
      groupsTotal: 3,
      rulesFired: 1,
      rulesTotal: 13,
      modelsInScope: 12,
      untiered: 3,
      overdueValidations: 4,
      openCriticalHigh: 3,
      fixIt: { high: 6, medium: 5, low: 4 },
      requirementsAvailable: true,
      previous: null,
    });
  });

  it("counts a requirement once across pairings, done only when every pairing's row is", () => {
    // Organization project and two use cases. 2.1 is done everywhere; 2.2 is
    // done in two of three; 2.3 nowhere; the L3 2.1.1 is done everywhere.
    const rows = (doneIn2: boolean) => [
      req("2.1 Policy", true, [req("2.1.1 Policy detail", true)]),
      req("2.2 Inventory", doneIn2),
      req("2.3 Roles", false),
    ];
    const glance = buildE23Glance({
      requirements: {
        frameworks: [
          {
            frameworkId: 26,
            frameworkName: "OSFI E-23",
            groups: [
              group(rows(true), "Organization"),
              group(rows(true), "Credit scoring"),
              group(rows(false), "Fraud"),
            ],
            rollup: rollup(9, 12),
          },
        ],
      },
      contradictions,
      fleet,
      fixIt,
      previous: null,
    });
    expect(glance.requirementsDone).toBe(2);
    expect(glance.requirementsTotal).toBe(4);
  });

  it("is all zeros, flagged, when the MRM data could not be read", () => {
    const glance = buildE23Glance({
      requirements: undefined,
      contradictions: undefined,
      fleet: undefined,
      fixIt: undefined,
      mrmUnavailable: true,
      previous: null,
    });
    expect(glance).toMatchObject({
      requirementsDone: 0,
      requirementsTotal: 0,
      groupsChecked: 0,
      groupsTotal: 0,
      rulesFired: 0,
      rulesTotal: 13,
      modelsInScope: 0,
      untiered: 0,
      overdueValidations: 0,
      openCriticalHigh: 0,
      fixIt: { high: 0, medium: 0, low: 0 },
      mrmUnavailable: true,
      requirementsAvailable: false,
    });
  });

  it("marks requirements unavailable when E-23 is not on file", () => {
    const glance = buildE23Glance({
      requirements: undefined,
      contradictions: { ...contradictions, available: false, fired: [], coverage: {} },
      fleet,
      fixIt,
      previous: null,
    });
    expect(glance.requirementsAvailable).toBe(false);
    expect(glance.mrmUnavailable).toBeUndefined();
    expect(glance.requirementsDone).toBe(0);
    expect(glance.modelsInScope).toBe(12);
  });

  it("marks requirements unavailable when only non-E-23 requirements were read", () => {
    const glance = buildE23Glance({
      requirements: { frameworks: [requirements.frameworks[0]] },
      contradictions: { ...contradictions, available: false, fired: [], coverage: {} },
      fleet,
      fixIt,
      previous: null,
    });
    expect(glance.requirementsAvailable).toBe(false);
  });

  it("carries the previous run's figures without its own previous", () => {
    const previous = toE23GlanceSnapshot(
      buildE23Glance({ requirements, contradictions, fleet, fixIt, previous: null }),
      new Date("2026-08-01T00:00:00.000Z"),
    );
    const glance = buildE23Glance({ requirements, contradictions, fleet, fixIt, previous });
    expect(glance.previous).toEqual({
      requirementsDone: 30,
      requirementsTotal: 83,
      groupsChecked: 2,
      groupsTotal: 3,
      rulesFired: 1,
      rulesTotal: 13,
      modelsInScope: 12,
      untiered: 3,
      overdueValidations: 4,
      openCriticalHigh: 3,
      fixIt: { high: 6, medium: 5, low: 4 },
      generatedAt: "2026-08-01T00:00:00.000Z",
    });
  });

  const fullSnapshot = () =>
    toE23GlanceSnapshot(
      buildE23Glance({ requirements, contradictions, fleet, fixIt, previous: null }),
      new Date("2026-08-01T00:00:00.000Z"),
    );

  it("drops model, rule, group and fix-it changes when the previous run had no MRM data", () => {
    const previous = { ...fullSnapshot(), mrmUnavailable: true };
    const glance = buildE23Glance({ requirements, contradictions, fleet, fixIt, previous });
    expect(glance.previous).toMatchObject({
      requirementsDone: 30,
      requirementsTotal: 83,
      rulesTotal: 13,
      modelsInScope: null,
      untiered: null,
      overdueValidations: null,
      openCriticalHigh: null,
      groupsChecked: null,
      groupsTotal: null,
      rulesFired: null,
      fixIt: null,
    });
  });

  it("drops the same changes when this run has no MRM data", () => {
    const glance = buildE23Glance({
      requirements,
      contradictions: undefined,
      fleet: undefined,
      fixIt: undefined,
      mrmUnavailable: true,
      previous: fullSnapshot(),
    });
    expect(glance.previous).toMatchObject({
      requirementsDone: 30,
      modelsInScope: null,
      rulesFired: null,
      fixIt: null,
    });
  });

  it("drops requirement, rule, group and fix-it changes when the previous run had no checklist", () => {
    const previous = { ...fullSnapshot(), requirementsAvailable: false };
    const glance = buildE23Glance({ requirements, contradictions, fleet, fixIt, previous });
    expect(glance.previous).toMatchObject({
      requirementsDone: null,
      requirementsTotal: null,
      groupsChecked: null,
      groupsTotal: null,
      rulesFired: null,
      rulesTotal: 13,
      fixIt: null,
      modelsInScope: 12,
      untiered: 3,
      overdueValidations: 4,
      openCriticalHigh: 3,
    });
  });

  it("drops the same changes when this run has no checklist", () => {
    const glance = buildE23Glance({
      requirements: undefined,
      contradictions: { ...contradictions, available: false, fired: [], coverage: {} },
      fleet,
      fixIt,
      previous: fullSnapshot(),
    });
    expect(glance.previous).toMatchObject({
      requirementsDone: null,
      rulesFired: null,
      fixIt: null,
      modelsInScope: 12,
    });
  });
});

describe("toE23GlanceSnapshot", () => {
  it("stores both availability flags", () => {
    const glance = buildE23Glance({
      requirements: undefined,
      contradictions: undefined,
      fleet: undefined,
      fixIt: undefined,
      mrmUnavailable: true,
      previous: null,
    });
    const snapshot = toE23GlanceSnapshot(glance, new Date("2026-08-01T00:00:00.000Z"));
    expect(snapshot.requirementsAvailable).toBe(false);
    expect(snapshot.mrmUnavailable).toBe(true);
    expect(snapshot).not.toHaveProperty("previous");
    expect(parseStoredE23Glance(JSON.parse(JSON.stringify(snapshot)))).toEqual(snapshot);
  });
});

describe("parseStoredE23Glance", () => {
  const stored = {
    requirementsDone: 30.4,
    requirementsTotal: 83,
    groupsChecked: 2,
    groupsTotal: 3,
    rulesFired: 1,
    rulesTotal: 13,
    modelsInScope: 12,
    untiered: 3,
    overdueValidations: 4,
    openCriticalHigh: 3,
    fixIt: { high: 6, medium: 5, low: 4 },
    generatedAt: "2026-08-01T00:00:00.000Z",
    previous: { requirementsDone: 1 },
    extra: "dropped",
  };

  it("keeps the rounded figures and generatedAt only; an older snapshot counts as available", () => {
    expect(parseStoredE23Glance(stored)).toEqual({
      requirementsAvailable: true,
      requirementsDone: 30,
      requirementsTotal: 83,
      groupsChecked: 2,
      groupsTotal: 3,
      rulesFired: 1,
      rulesTotal: 13,
      modelsInScope: 12,
      untiered: 3,
      overdueValidations: 4,
      openCriticalHigh: 3,
      fixIt: { high: 6, medium: 5, low: 4 },
      generatedAt: "2026-08-01T00:00:00.000Z",
    });
  });

  it("keeps the mrmUnavailable flag", () => {
    expect(parseStoredE23Glance({ ...stored, mrmUnavailable: true })?.mrmUnavailable).toBe(true);
  });

  it("keeps requirementsAvailable false", () => {
    expect(
      parseStoredE23Glance({ ...stored, requirementsAvailable: false })?.requirementsAvailable,
    ).toBe(false);
  });

  it.each([
    ["null", null],
    ["a string", "x"],
    ["a missing figure", { ...stored, untiered: undefined }],
    ["a non-numeric figure", { ...stored, rulesFired: "1" }],
    ["a missing fix-it count", { ...stored, fixIt: { high: 1, medium: 1 } }],
    ["no generatedAt", { ...stored, generatedAt: undefined }],
  ])("rejects %s", (_label, value) => {
    expect(parseStoredE23Glance(value)).toBeNull();
  });
});
