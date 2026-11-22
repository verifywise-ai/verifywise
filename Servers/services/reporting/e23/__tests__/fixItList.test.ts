import type {
  E23ContradictionsSectionData,
  FrameworkRequirementRow,
  FrameworkRequirementsSectionData,
  MrmModelFacts,
} from "../../../../domain.layer/interfaces/i.reportGeneration";
import { buildE23FixItList } from "../fixItList";
import { FIX_IT_CLOSES_WHEN } from "../e23Text";

const GENERATED_AT = new Date("2026-11-22T12:00:00.000Z");

let nextId = 1;
const row = (over: Partial<FrameworkRequirementRow> = {}): FrameworkRequirementRow => ({
  implId: nextId++,
  level: 2,
  title: `1.${nextId} Requirement ${nextId}`,
  orderNo: nextId,
  status: "In progress",
  owner: "Ann Owner",
  reviewer: null,
  approver: null,
  dueDate: null,
  isDone: false,
  isOverdue: false,
  evidenceCount: 1,
  evidenceFiles: [],
  riskCount: 0,
  ...over,
});

const reqs = (...rows: FrameworkRequirementRow[]): FrameworkRequirementsSectionData => ({
  frameworks: [
    {
      frameworkId: 26,
      frameworkName: "OSFI E-23",
      groups: [
        {
          title: "Group",
          orderNo: 1,
          requirements: rows,
          rollup: {
            total: 0,
            done: 0,
            unassigned: 0,
            noEvidence: 0,
            overdue: 0,
            statusBreakdown: {},
          },
        },
      ],
      rollup: { total: 0, done: 0, unassigned: 0, noEvidence: 0, overdue: 0, statusBreakdown: {} },
    },
  ],
});

const none: E23ContradictionsSectionData = {
  available: true,
  fired: [],
  checked: [],
  notRun: [],
  coverage: {},
};

const model = (over: Partial<MrmModelFacts> = {}): MrmModelFacts => ({
  id: nextId++,
  name: `Model ${nextId}`,
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
  roles: { owner: ["Ann Owner"], developerIds: [], validator: [], approver: ["Bo Approver"] },
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
  lastMetricReceivedAt: "2026-11-20T00:00:00.000Z",
  findings: [],
  ...over,
});

const build = (
  requirements: FrameworkRequirementsSectionData | undefined,
  models: MrmModelFacts[] = [],
  contradictions = none,
) => buildE23FixItList({ requirements, contradictions, models, generatedAt: GENERATED_AT });

describe("buildE23FixItList: requirement sources", () => {
  it("source 3: overdue not-done row is high; overdue and unassigned yields one item", () => {
    const r = row({ isOverdue: true, dueDate: "2026-10-01", owner: "Unknown user" });
    const list = build(reqs(r));
    expect(list.items).toHaveLength(1);
    expect(list.items[0]).toMatchObject({
      severity: "high",
      source: 3,
      owner: "Unassigned",
      dueDate: "2026-10-01",
      overdue: true,
      sortKey: r.orderNo,
    });
    expect(list.items[0].closesWhen).toBe(FIX_IT_CLOSES_WHEN["3"]);
  });

  it("source 2: not done with no owner is medium", () => {
    const list = build(reqs(row({ owner: null })));
    expect(list.items[0]).toMatchObject({ severity: "medium", source: 2, owner: "Unassigned" });
  });

  it("source 4: Needs rework is medium", () => {
    const list = build(reqs(row({ status: "Needs rework" })));
    expect(list.items[0]).toMatchObject({ severity: "medium", source: 4, owner: "Ann Owner" });
  });

  it("source 5: done row without evidence is medium; with evidence gives no item", () => {
    const list = build(
      reqs(
        row({ status: "Implemented", isDone: true, evidenceCount: 0 }),
        row({ status: "Audited", isDone: true }),
      ),
    );
    expect(list.items).toHaveLength(1);
    expect(list.items[0]).toMatchObject({ severity: "medium", source: 5 });
  });

  it("source 6: any other not-done row is low", () => {
    const list = build(reqs(row({ status: "Draft" })));
    expect(list.items[0]).toMatchObject({ severity: "low", source: 6 });
  });

  it("walks L3 children and trims padded titles", () => {
    const child = row({ level: 3, title: "  1.9.1 Child  ", status: "Draft" });
    const list = build(reqs(row({ status: "Implemented", isDone: true, children: [child] })));
    expect(list.items).toHaveLength(1);
    expect(list.items[0].where).toBe("1.9.1 Child");
  });

  it("ignores non-E-23 frameworks and undefined requirements", () => {
    const other = reqs(row());
    other.frameworks[0].frameworkId = 1;
    expect(build(other).items).toEqual([]);
    expect(build(undefined).items).toEqual([]);
  });
});

describe("buildE23FixItList: source 1 contradictions", () => {
  const fired = (ruleId: string) => ({
    ...none,
    fired: [
      {
        ruleId,
        requirement: "2.2.3",
        requirementTitle: "2.2.3 Every model rated   ",
        claimedStatus: "Implemented",
        finding: "2 models have no MRM tier",
        affectedCount: 2,
        examples: ["A", "B"],
        moreCount: 0,
      },
    ],
  });

  it("emits one high item per fired rule using the matched row owner", () => {
    const matched = row({
      title: "2.2.3 Every model rated",
      status: "Implemented",
      isDone: true,
      owner: "Cy Lead",
    });
    const list = build(reqs(matched), [], fired("C2"));
    const item = list.items.find((i) => i.source === 1);
    expect(item).toMatchObject({
      severity: "high",
      what: "2 models have no MRM tier",
      where: "2.2.3 Every model rated",
      owner: "Cy Lead",
      dueDate: null,
      overdue: false,
      closesWhen: "Every model has an MRM tier",
      sortKey: 0,
    });
  });

  it("uses Unassigned when the matched row has no active owner", () => {
    const matched = row({
      title: "2.2.3 Every model rated",
      status: "Implemented",
      isDone: true,
      owner: null,
    });
    const list = build(reqs(matched), [], fired("C2"));
    expect(list.items.find((i) => i.source === 1)?.owner).toBe("Unassigned");
  });
});

describe("buildE23FixItList: source 7 model gaps", () => {
  it("tier 3 model with only no owner role is medium and owner Unassigned", () => {
    const m = model({
      tier: "3",
      roles: { owner: [], developerIds: [], validator: [], approver: ["Bo"] },
    });
    const list = build(undefined, [m]);
    expect(list.items).toHaveLength(1);
    expect(list.items[0]).toMatchObject({
      severity: "medium",
      source: 7,
      where: m.name,
      owner: "Unassigned",
      dueDate: null,
      overdue: false,
    });
    expect(list.items[0].what).toContain("No owner role");
  });

  it("the same model with an open critical finding is high, due date is the earliest finding due", () => {
    const m = model({
      tier: "3",
      roles: { owner: ["Dee"], developerIds: [], validator: [], approver: [] },
      findings: [
        {
          severity: "critical",
          stage: "open",
          dueDate: "2026-12-30T00:00:00.000Z",
          remediationPlanEmpty: false,
        },
        {
          severity: "high",
          stage: "in_progress",
          dueDate: "2026-10-01T00:00:00.000Z",
          remediationPlanEmpty: false,
        },
        {
          severity: "low",
          stage: "open",
          dueDate: "2026-01-01T00:00:00.000Z",
          remediationPlanEmpty: false,
        },
      ],
    });
    const item = build(undefined, [m]).items[0];
    expect(item).toMatchObject({ severity: "high", owner: "Dee", overdue: true });
    expect(item.dueDate).toBe("2026-10-01T00:00:00.000Z");
  });

  it("tier 1 with an overdue validation is high and uses the validation due date", () => {
    const m = model({ hasOpenValidation: true, openValidationNextDue: "2026-11-01T00:00:00.000Z" });
    const item = build(undefined, [m]).items[0];
    expect(item).toMatchObject({
      severity: "high",
      overdue: true,
      dueDate: "2026-11-01T00:00:00.000Z",
    });
    expect(item.what).toContain("Overdue validation");
  });

  it("flags untiered, no approver and tier 1/2 without threshold; skips retired and clean models", () => {
    const gappy = model({
      tier: null,
      roles: { owner: ["X"], developerIds: [], validator: [], approver: [] },
    });
    const t2 = model({ tier: "2", activeThresholds: 0 });
    const list = build(undefined, [gappy, t2, model(), model({ retired: true, tier: null })]);
    expect(list.items).toHaveLength(2);
    const g = list.items.find((i) => i.where === gappy.name)!;
    expect(g.what).toContain("Untiered");
    expect(g.what).toContain("No approver");
    expect(g.severity).toBe("medium");
    const t = list.items.find((i) => i.where === t2.name)!;
    expect(t.what).toContain("No active threshold");
  });

  it("an inventory approver satisfies the approver check", () => {
    const m = model({
      tier: "3",
      roles: { owner: ["X"], developerIds: [], validator: [], approver: [] },
      inventoryApproverId: 4,
    });
    expect(build(undefined, [m]).items).toEqual([]);
  });
});

describe("buildE23FixItList: ordering and counts", () => {
  it("sorts by severity, overdue first, sortKey, then where; counts match", () => {
    const low = row({ status: "Draft", orderNo: 1 });
    const medB = row({ owner: null, orderNo: 5, title: "1.5 B" });
    const medA = row({ owner: null, orderNo: 5, title: "1.5 A" });
    const highLate = row({ isOverdue: true, orderNo: 9, title: "1.9 late" });
    const highEarly = row({ isOverdue: true, orderNo: 2, title: "1.2 early" });
    const list = build(reqs(low, medB, medA, highLate, highEarly));
    expect(list.items.map((i) => i.where)).toEqual([
      "1.2 early",
      "1.9 late",
      "1.5 A",
      "1.5 B",
      low.title,
    ]);
    expect(list.counts).toEqual({ high: 2, medium: 2, low: 1 });
  });

  it("puts overdue items ahead of non-overdue within a severity", () => {
    const ok = model({
      tier: "1",
      name: "A",
      roles: { owner: [], developerIds: [], validator: [], approver: ["x"] },
    });
    const late = model({
      tier: "1",
      name: "Z",
      findings: [
        {
          severity: "high",
          stage: "open",
          dueDate: "2026-01-01T00:00:00.000Z",
          remediationPlanEmpty: false,
        },
      ],
    });
    const list = build(undefined, [ok, late]);
    expect(list.items.map((i) => i.where)).toEqual(["Z", "A"]);
  });
});
