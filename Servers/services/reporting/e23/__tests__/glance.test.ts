import type {
  E23ContradictionsSectionData,
  E23FixItListSectionData,
  FrameworkRequirementRollup,
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

const requirements: FrameworkRequirementsSectionData = {
  frameworks: [
    { frameworkId: 5, frameworkName: "SOC 2", groups: [], rollup: rollup(9, 9) },
    { frameworkId: 26, frameworkName: "OSFI E-23", groups: [], rollup: rollup(30, 83) },
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
      previous: null,
    });
  });

  it("pools E-23 rollups when several entries carry framework 26", () => {
    const glance = buildE23Glance({
      requirements: {
        frameworks: [
          { frameworkId: 26, frameworkName: "OSFI E-23", groups: [], rollup: rollup(1, 83) },
          { frameworkId: 26, frameworkName: "OSFI E-23", groups: [], rollup: rollup(2, 83) },
        ],
      },
      contradictions,
      fleet,
      fixIt,
      previous: null,
    });
    expect(glance.requirementsDone).toBe(3);
    expect(glance.requirementsTotal).toBe(166);
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
    });
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

  it("keeps the rounded figures and generatedAt only", () => {
    expect(parseStoredE23Glance(stored)).toEqual({
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
