import type {
  FrameworkRequirementRow,
  FrameworkRequirementsSectionData,
  MrmModelFacts,
} from "../../../../domain.layer/interfaces/i.reportGeneration";
import { getStructureById } from "../../../../structures";
import { E23_RULES, evaluateE23Rules } from "../contradictionRules";

const GENERATED_AT = new Date("2026-11-22T12:00:00.000Z");
const DAY_MS = 24 * 60 * 60 * 1000;
const daysBefore = (days: number) => new Date(GENERATED_AT.getTime() - days * DAY_MS).toISOString();

const rollup = { total: 0, done: 0, unassigned: 0, noEvidence: 0, overdue: 0, statusBreakdown: {} };

const row = (title: string, status: string, orderNo = 1): FrameworkRequirementRow => ({
  implId: orderNo,
  level: 2,
  title,
  orderNo,
  status,
  owner: null,
  reviewer: null,
  approver: null,
  dueDate: null,
  isDone: status === "Implemented" || status === "Audited",
  isOverdue: false,
  evidenceCount: 0,
  evidenceFiles: [],
  riskCount: 0,
});

/**
 * The organization's E-23 checklist built from the real structure, every
 * requirement "Implemented" unless overridden by its number.
 */
const e23Requirements = (
  statusByNumber: Record<string, string> = {},
  opts: { drop?: string[]; useCase?: string } = {},
) => {
  const structure = getStructureById(26)!;
  return structure.seed.structure.map((l1, gi) => ({
    title: l1.title,
    orderNo: gi + 1,
    ...(opts.useCase ? { useCase: opts.useCase } : {}),
    requirements: (l1.items ?? [])
      .filter((l2) => !(opts.drop ?? []).includes(l2.title.split(" ")[0]))
      .map((l2, i) =>
        row(l2.title, statusByNumber[l2.title.split(" ")[0]] ?? "Implemented", i + 1),
      ),
    rollup,
  }));
};

const section = (
  groups: FrameworkRequirementsSectionData["frameworks"][number]["groups"],
): FrameworkRequirementsSectionData => ({
  frameworks: [{ frameworkId: 26, frameworkName: "OSFI E-23", groups, rollup }],
});

let nextId = 1;
/** A model that trips no rule. */
const model = (over: Partial<MrmModelFacts> = {}): MrmModelFacts => ({
  id: nextId++,
  name: `Model ${String(nextId).padStart(3, "0")}`,
  version: "1.0",
  provider: "Acme",
  type: "Classifier",
  status: "Approved",
  retired: false,
  tier: "1",
  tieredAt: "2026-01-01T00:00:00.000Z",
  revalidationFlagged: false,
  intendedUse: null,
  limitations: null,
  inventoryApproverId: null,
  inventoryApprover: null,
  roles: { owner: ["Ann Owner"], developerIds: [5], validator: ["Val"], approver: ["Al Approver"] },
  hasOpenValidation: false,
  openValidationNextDue: null,
  latestSignedOff: {
    validatorId: 9,
    outcome: "validated",
    signedOffAt: "2026-06-01T00:00:00.000Z",
    emptyReportSections: [],
  },
  nextReviewDue: "2027-06-01T00:00:00.000Z",
  activeThresholds: 1,
  lastMetricReceivedAt: daysBefore(2),
  findings: [],
  ...over,
});

const evaluate = (
  models: MrmModelFacts[],
  requirements: FrameworkRequirementsSectionData | undefined = section(e23Requirements()),
) => evaluateE23Rules({ requirements, models, generatedAt: GENERATED_AT });

const firedIds = (models: MrmModelFacts[], requirements?: FrameworkRequirementsSectionData) =>
  evaluate(models, requirements).fired.map((f) => f.ruleId);

const fires = (ruleId: string, m: MrmModelFacts) => firedIds([model(), m]).includes(ruleId);

const finding = (over: Partial<MrmModelFacts["findings"][number]> = {}) => ({
  severity: "high",
  stage: "open",
  dueDate: null,
  remediationPlanEmpty: false,
  ...over,
});

describe("E23_RULES", () => {
  it("has C1 to C13 in order, each with a requirement number, description and condition", () => {
    expect(E23_RULES.map((r) => r.id)).toEqual(Array.from({ length: 13 }, (_, i) => `C${i + 1}`));
    for (const r of E23_RULES) {
      expect(r.requirement).toMatch(/^\d+\.\d+\.\d+$/);
      expect(r.description.length).toBeGreaterThan(5);
      expect(r.dataCondition.length).toBeGreaterThan(5);
    }
  });

  it("states the tier cadence and metric window in the conditions", () => {
    const c3 = E23_RULES.find((r) => r.id === "C3")!;
    expect(c3.dataCondition).toContain("tier 1 12 months, tier 2 18, tier 3 24");
    const c11 = E23_RULES.find((r) => r.id === "C11")!;
    expect(c11.dataCondition).toContain("90 days");
  });
});

describe("evaluateE23Rules", () => {
  it("is clean for a healthy fleet and checks every rule", () => {
    const result = evaluate([model(), model()]);
    expect(result.available).toBe(true);
    expect(result.fired).toEqual([]);
    expect(result.checked).toEqual(E23_RULES.map((r) => r.id));
    expect(result.notRun).toEqual([]);
  });

  it("is unavailable when the E-23 framework is not in the requirements", () => {
    const other: FrameworkRequirementsSectionData = {
      frameworks: [{ frameworkId: 5, frameworkName: "SOC 2", groups: [], rollup }],
    };
    for (const req of [undefined, other]) {
      const result = evaluateE23Rules({
        requirements: req,
        models: [model({ tier: null })],
        generatedAt: GENERATED_AT,
      });
      expect(result).toEqual({
        available: false,
        fired: [],
        checked: [],
        notRun: [],
        coverage: {},
      });
    }
  });

  describe("C1 no models", () => {
    it("fires with no non-retired models", () => {
      const result = evaluate([model({ retired: true, status: "Retired" })]);
      const c1 = result.fired.find((f) => f.ruleId === "C1")!;
      expect(c1).toMatchObject({
        requirement: "2.1.4",
        requirementTitle: "2.1.4 Enterprise-level model inventory as system of record",
        claimedStatus: "Implemented",
        finding: "No models in the inventory",
        affectedCount: 0,
        examples: [],
        moreCount: 0,
      });
    });
    it("is silent with one model", () => {
      expect(firedIds([model()])).not.toContain("C1");
    });
  });

  describe("C2 untiered", () => {
    it("fires for a model with no tier", () => {
      expect(fires("C2", model({ tier: null, tieredAt: null }))).toBe(true);
    });
    it("is silent for a tiered model", () => {
      expect(fires("C2", model({ tier: "3" }))).toBe(false);
    });
  });

  describe("C3 stale rating", () => {
    const cases: Array<["1" | "2" | "3", string, string]> = [
      ["1", "2025-11-22T12:00:00.000Z", "2025-11-21T12:00:00.000Z"],
      ["2", "2025-05-22T12:00:00.000Z", "2025-05-21T12:00:00.000Z"],
      ["3", "2024-11-22T12:00:00.000Z", "2024-11-21T12:00:00.000Z"],
    ];
    it.each(cases)(
      "tier %s: silent exactly at cadence, fires one day past",
      (tier, atCadence, pastCadence) => {
        const base = { tier, latestSignedOff: null } as Partial<MrmModelFacts>;
        expect(fires("C3", model({ ...base, tieredAt: atCadence }))).toBe(false);
        expect(fires("C3", model({ ...base, tieredAt: pastCadence }))).toBe(true);
      },
    );

    it("a sign-off later than the tiering date resets the clock", () => {
      const m = model({
        tier: "1",
        tieredAt: "2024-01-01T00:00:00.000Z",
        latestSignedOff: {
          validatorId: 9,
          outcome: "validated",
          signedOffAt: daysBefore(30),
          emptyReportSections: [],
        },
      });
      expect(fires("C3", m)).toBe(false);
    });

    it("fires for a tiered model never affirmed (no tiering date, no sign-off)", () => {
      expect(fires("C3", model({ tier: "2", tieredAt: null, latestSignedOff: null }))).toBe(true);
    });

    it("fires when flagged for revalidation with no open validation", () => {
      expect(fires("C3", model({ revalidationFlagged: true }))).toBe(true);
      expect(fires("C3", model({ revalidationFlagged: true, hasOpenValidation: true }))).toBe(
        false,
      );
    });

    it("ignores untiered models (C2 covers them)", () => {
      expect(fires("C3", model({ tier: null, tieredAt: null, revalidationFlagged: true }))).toBe(
        false,
      );
    });
  });

  describe("C4 no owner", () => {
    it("fires with no owner role", () => {
      expect(
        fires(
          "C4",
          model({ roles: { owner: [], developerIds: [], validator: [], approver: ["A"] } }),
        ),
      ).toBe(true);
    });
    it("is silent with an owner", () => {
      expect(fires("C4", model())).toBe(false);
    });
  });

  describe("C5 validator also developer", () => {
    it("fires when the latest validator holds the developer role", () => {
      expect(
        fires(
          "C5",
          model({ roles: { owner: ["O"], developerIds: [9], validator: [], approver: ["A"] } }),
        ),
      ).toBe(true);
    });
    it("is silent when the validator is not a developer", () => {
      expect(fires("C5", model())).toBe(false);
      expect(fires("C5", model({ latestSignedOff: null }))).toBe(false);
    });
  });

  describe("C6 overdue validation", () => {
    it("fires when the open validation is past due", () => {
      expect(
        fires("C6", model({ hasOpenValidation: true, openValidationNextDue: daysBefore(1) })),
      ).toBe(true);
    });
    it("is silent exactly at due time", () => {
      expect(
        fires(
          "C6",
          model({ hasOpenValidation: true, openValidationNextDue: GENERATED_AT.toISOString() }),
        ),
      ).toBe(false);
    });
  });

  describe("C7 incomplete validation report", () => {
    const signed = (emptyReportSections: string[]) => ({
      validatorId: 9,
      outcome: "validated",
      signedOffAt: "2026-06-01T00:00:00.000Z",
      emptyReportSections,
    });
    it("fires when a report section is empty", () => {
      expect(fires("C7", model({ latestSignedOff: signed(["data_review"]) }))).toBe(true);
    });
    it("is silent when every section is filled", () => {
      expect(fires("C7", model({ latestSignedOff: signed([]) }))).toBe(false);
    });
  });

  describe("C8 no approver", () => {
    const noApprover = { owner: ["O"], developerIds: [], validator: [], approver: [] };
    it("fires with neither an approver role nor an inventory approver", () => {
      expect(fires("C8", model({ roles: noApprover }))).toBe(true);
    });
    it("is silent with only an inventory approver", () => {
      expect(fires("C8", model({ roles: noApprover, inventoryApproverId: 3 }))).toBe(false);
    });
  });

  describe("C9 approved with unmitigated finding", () => {
    it("fires for an approved model with an open high finding and no plan", () => {
      expect(fires("C9", model({ findings: [finding({ remediationPlanEmpty: true })] }))).toBe(
        true,
      );
    });
    it("is silent with a remediation plan", () => {
      expect(fires("C9", model({ findings: [finding({ remediationPlanEmpty: false })] }))).toBe(
        false,
      );
    });
    it("is silent once remediation is planned, for medium findings, or when not approved", () => {
      expect(
        fires(
          "C9",
          model({
            findings: [finding({ stage: "remediation_planned", remediationPlanEmpty: true })],
          }),
        ),
      ).toBe(false);
      expect(
        fires(
          "C9",
          model({ findings: [finding({ severity: "medium", remediationPlanEmpty: true })] }),
        ),
      ).toBe(false);
      expect(
        fires(
          "C9",
          model({ status: "Pending", findings: [finding({ remediationPlanEmpty: true })] }),
        ),
      ).toBe(false);
    });
  });

  describe("C10 no thresholds on a tier 1 or 2 model", () => {
    it("fires for tier 2 without active thresholds", () => {
      expect(fires("C10", model({ tier: "2", activeThresholds: 0 }))).toBe(true);
    });
    it("is silent for tier 3 without thresholds", () => {
      expect(fires("C10", model({ tier: "3", activeThresholds: 0 }))).toBe(false);
    });
  });

  describe("C11 stale metrics", () => {
    it("fires when the last metric is older than 90 days", () => {
      expect(fires("C11", model({ lastMetricReceivedAt: daysBefore(91) }))).toBe(true);
      expect(fires("C11", model({ lastMetricReceivedAt: null }))).toBe(true);
    });
    it("is silent at exactly 90 days or with no thresholds", () => {
      expect(fires("C11", model({ lastMetricReceivedAt: daysBefore(90) }))).toBe(false);
      expect(
        fires("C11", model({ activeThresholds: 0, tier: "3", lastMetricReceivedAt: null })),
      ).toBe(false);
    });
  });

  describe("C12 overdue critical or high finding", () => {
    it("fires for a resolved-but-overdue finding", () => {
      expect(
        fires("C12", model({ findings: [finding({ stage: "resolved", dueDate: daysBefore(1) })] })),
      ).toBe(true);
    });
    it("is silent when closed, not yet due, or low severity", () => {
      expect(
        fires("C12", model({ findings: [finding({ stage: "closed", dueDate: daysBefore(1) })] })),
      ).toBe(false);
      expect(
        fires("C12", model({ findings: [finding({ dueDate: GENERATED_AT.toISOString() })] })),
      ).toBe(false);
      expect(
        fires("C12", model({ findings: [finding({ severity: "low", dueDate: daysBefore(1) })] })),
      ).toBe(false);
    });
  });

  describe("C13 approved but not validated", () => {
    const outcome = (o: string) => ({
      validatorId: 9,
      outcome: o,
      signedOffAt: "2026-06-01T00:00:00.000Z",
      emptyReportSections: [],
    });
    it("fires for an approved model whose latest outcome is not_validated", () => {
      expect(fires("C13", model({ latestSignedOff: outcome("not_validated") }))).toBe(true);
    });
    it("is silent when the model is not approved", () => {
      expect(
        fires("C13", model({ status: "Pending", latestSignedOff: outcome("not_validated") })),
      ).toBe(false);
    });
  });

  it("never counts a retired model", () => {
    const retired = model({
      retired: true,
      status: "Retired",
      tier: null,
      roles: { owner: [], developerIds: [], validator: [], approver: [] },
    });
    expect(firedIds([model(), retired])).toEqual([]);
  });

  it("is silent when the requirement is In progress even though the condition holds", () => {
    const req = section(e23Requirements({ "2.2.3": "In progress" }));
    const result = evaluate([model({ tier: null, tieredAt: null })], req);
    expect(result.fired.map((f) => f.ruleId)).not.toContain("C2");
    expect(result.checked).toContain("C2");
  });

  it("reports count, finding sentence and up to five sorted examples", () => {
    const names = ["Zeta", "alpha", "Delta", "Beta", "Gamma", "Epsilon", "Eta"];
    const result = evaluate(names.map((name) => model({ name, tier: null, tieredAt: null })));
    const c2 = result.fired.find((f) => f.ruleId === "C2")!;
    expect(c2).toMatchObject({
      requirement: "2.2.3",
      requirementTitle: "2.2.3 Every model rated through a defined process",
      claimedStatus: "Implemented",
      finding: "7 models have no MRM tier",
      affectedCount: 7,
      examples: ["alpha", "Beta", "Delta", "Epsilon", "Eta"],
      moreCount: 2,
    });
  });

  it("uses the singular for one affected model", () => {
    const result = evaluate([model(), model({ tier: null, tieredAt: null })]);
    const c2 = result.fired.find((f) => f.ruleId === "C2")!;
    expect(c2.finding).toBe("1 model has no MRM tier");
    expect(c2.moreCount).toBe(0);
  });

  it("lists a rule whose requirement is missing under notRun, never fired", () => {
    const req = section(e23Requirements({}, { drop: ["2.2.3"] }));
    const result = evaluate([model({ tier: null, tieredAt: null })], req);
    expect(result.notRun).toEqual([
      {
        ruleId: "C2",
        requirement: "2.2.3",
        reason: "requirement 2.2.3 not found in this organization's E-23 checklist",
      },
    ]);
    expect(result.fired.map((f) => f.ruleId)).not.toContain("C2");
    expect(result.checked).not.toContain("C2");
  });

  it("labels group coverage from the rules", () => {
    const result = evaluate([model()]);
    expect(result.coverage["Principle 2.2 – Model risk rating (C.2)"]).toBe("checked");
    expect(result.coverage["Principle 1.3 – Use of models (B.3)"]).toBe("selfAssessmentOnly");
    expect(result.coverage["Model approval (D.2)"]).toBe("checked");
  });

  it("marks a group self-assessment only when its rule requirement is missing", () => {
    const req = section(e23Requirements({}, { drop: ["2.1.4"] }));
    const result = evaluate([model()], req);
    expect(result.coverage["Principle 2.1 – Model identification (C.1)"]).toBe(
      "selfAssessmentOnly",
    );
  });

  it("fires when one of two E-23 pairings claims the requirement done", () => {
    const groups = [
      ...e23Requirements({ "2.2.3": "In progress" }, { useCase: "Use case A" }),
      ...e23Requirements({ "2.2.3": "Audited" }, { useCase: "Use case B" }),
    ];
    const result = evaluate([model({ tier: null, tieredAt: null })], section(groups));
    const c2 = result.fired.find((f) => f.ruleId === "C2")!;
    expect(c2.claimedStatus).toBe("Audited");
    expect(Object.keys(result.coverage)).toHaveLength(getStructureById(26)!.seed.structure.length);
  });
});
