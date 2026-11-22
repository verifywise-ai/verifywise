import type {
  MrmActivity,
  MrmModelFacts,
} from "../../../../domain.layer/interfaces/i.reportGeneration";
import { buildInventoryAppendix, buildMrmFleet, METRIC_STALE_DAYS } from "../mrmFleet";

const GENERATED_AT = new Date("2026-11-22T12:00:00.000Z");
const DAY_MS = 24 * 60 * 60 * 1000;

const activity: MrmActivity = {
  period: { start: "2026-08-01", end: "2026-10-31" },
  validationsSignedOff: 2,
  findingsOpened: 3,
  findingsClosed: 1,
  breaches: 4,
  revalidationEvents: 5,
};

let nextId = 1;
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
  roles: { owner: ["Ann Owner"], developerIds: [], validator: [], approver: [] },
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

describe("buildMrmFleet", () => {
  it("returns zeros and no exceptions for an empty fleet", () => {
    const fleet = buildMrmFleet([], activity, GENERATED_AT);
    expect(fleet.totals).toEqual({ models: 0, untiered: 0, byTier: { "1": 0, "2": 0, "3": 0 } });
    expect(fleet.validationCoverage).toEqual({
      validated: 0,
      inReview: 0,
      notStarted: 0,
      overdue: 0,
    });
    expect(fleet.openFindingsBySeverity).toEqual({ critical: 0, high: 0, medium: 0, low: 0 });
    expect(fleet.monitoring).toEqual({ withActiveThresholds: 0, withRecentMetric: 0 });
    expect(fleet.perTier.every((t) => t.models === 0 && t.openFindings === 0)).toBe(true);
    expect(fleet.exceptions).toEqual([]);
    expect(fleet.activity).toEqual(activity);
  });

  it("excludes retired models from every count", () => {
    const retired = model({
      status: "Retired",
      retired: true,
      tier: null,
      tieredAt: null,
      roles: { owner: [], developerIds: [], validator: [], approver: [] },
      hasOpenValidation: true,
      openValidationNextDue: "2020-01-01T00:00:00.000Z",
      findings: [
        { severity: "critical", stage: "open", dueDate: null, remediationPlanEmpty: true },
      ],
    });
    const retiredTiered = model({ status: "Retired", retired: true, tier: "2" });
    const fleet = buildMrmFleet([retired, retiredTiered], activity, GENERATED_AT);
    expect(fleet.totals).toEqual({ models: 0, untiered: 0, byTier: { "1": 0, "2": 0, "3": 0 } });
    expect(fleet.validationCoverage).toEqual({
      validated: 0,
      inReview: 0,
      notStarted: 0,
      overdue: 0,
    });
    expect(fleet.openFindingsBySeverity.critical).toBe(0);
    expect(fleet.monitoring).toEqual({ withActiveThresholds: 0, withRecentMetric: 0 });
    expect(fleet.perTier.every((t) => t.models === 0 && t.validated === 0)).toBe(true);
    expect(fleet.exceptions).toEqual([]);
  });

  it("counts totals, tiers and per-tier rows", () => {
    const fleet = buildMrmFleet(
      [
        model({ tier: "1" }),
        model({ tier: "2", activeThresholds: 0, tieredAt: null }),
        model({ tier: null, tieredAt: null }),
      ],
      activity,
      GENERATED_AT,
    );
    expect(fleet.totals).toEqual({ models: 3, untiered: 1, byTier: { "1": 1, "2": 1, "3": 0 } });
    expect(fleet.perTier.map((t) => t.tier)).toEqual(["1", "2", "3"]);
    const t2 = fleet.perTier.find((t) => t.tier === "2")!;
    expect(t2).toEqual({
      tier: "2",
      models: 1,
      tieringCurrent: 0,
      validated: 1,
      monitoringActive: 0,
      openFindings: 0,
      criticalHighFindings: 0,
    });
    expect(fleet).not.toHaveProperty("perTier.0.attestationStatus");
  });

  it("treats a next due exactly at generation as not overdue, one ms earlier as overdue", () => {
    const atBoundary = model({
      hasOpenValidation: true,
      openValidationNextDue: GENERATED_AT.toISOString(),
    });
    const justBefore = model({
      hasOpenValidation: true,
      openValidationNextDue: new Date(GENERATED_AT.getTime() - 1).toISOString(),
    });
    expect(buildMrmFleet([atBoundary], activity, GENERATED_AT).validationCoverage).toMatchObject({
      inReview: 1,
      overdue: 0,
    });
    const overdue = buildMrmFleet([justBefore], activity, GENERATED_AT);
    expect(overdue.validationCoverage).toMatchObject({ inReview: 0, overdue: 1 });
    expect(overdue.exceptions[0].issues).toContain("Overdue validation");
  });

  it("counts not started models and models with no signed-off outcome", () => {
    const fleet = buildMrmFleet(
      [model({ latestSignedOff: null, nextReviewDue: null })],
      activity,
      GENERATED_AT,
    );
    expect(fleet.validationCoverage).toEqual({
      validated: 0,
      inReview: 0,
      notStarted: 1,
      overdue: 0,
    });
  });

  it(`treats a metric exactly ${METRIC_STALE_DAYS} days old as recent and 1 ms older as stale`, () => {
    const at = new Date(GENERATED_AT.getTime() - METRIC_STALE_DAYS * DAY_MS);
    const recent = model({ lastMetricReceivedAt: at.toISOString() });
    const stale = model({ lastMetricReceivedAt: new Date(at.getTime() - 1).toISOString() });
    const none = model({ lastMetricReceivedAt: null });
    expect(buildMrmFleet([recent], activity, GENERATED_AT).monitoring.withRecentMetric).toBe(1);
    expect(buildMrmFleet([stale], activity, GENERATED_AT).monitoring.withRecentMetric).toBe(0);
    expect(buildMrmFleet([none], activity, GENERATED_AT).monitoring.withRecentMetric).toBe(0);
  });

  it("counts a resolved finding as open and a closed one as not", () => {
    const fleet = buildMrmFleet(
      [
        model({
          findings: [
            { severity: "high", stage: "resolved", dueDate: null, remediationPlanEmpty: false },
            { severity: "critical", stage: "closed", dueDate: null, remediationPlanEmpty: false },
            { severity: "low", stage: "in_progress", dueDate: null, remediationPlanEmpty: false },
          ],
        }),
      ],
      activity,
      GENERATED_AT,
    );
    expect(fleet.openFindingsBySeverity).toEqual({ critical: 0, high: 1, medium: 0, low: 1 });
    const t1 = fleet.perTier.find((t) => t.tier === "1")!;
    expect(t1.openFindings).toBe(2);
    expect(t1.criticalHighFindings).toBe(1);
  });

  it("lists only models with an exception, sorted by name", () => {
    const clean = model({ name: "Clean" });
    const zeta = model({
      name: "Zeta",
      tier: null,
      tieredAt: null,
      roles: { owner: [], developerIds: [], validator: [], approver: [] },
      findings: [
        { severity: "critical", stage: "open", dueDate: null, remediationPlanEmpty: true },
      ],
    });
    const alpha = model({
      name: "Alpha",
      tier: "3",
      findings: [{ severity: "high", stage: "closed", dueDate: null, remediationPlanEmpty: true }],
      hasOpenValidation: true,
      openValidationNextDue: "2026-01-01T00:00:00.000Z",
    });
    const fleet = buildMrmFleet([zeta, clean, alpha], activity, GENERATED_AT);
    expect(fleet.exceptions).toEqual([
      { name: "Alpha", tier: "3", issues: ["Overdue validation"] },
      {
        name: "Zeta",
        tier: null,
        issues: ["Untiered", "No owner role", "Open critical or high finding"],
      },
    ]);
  });
});

describe("buildInventoryAppendix", () => {
  it("splits retired models into their own table, each sorted by name", () => {
    const data = buildInventoryAppendix([
      model({ name: "b-model" }),
      model({ name: "Old", status: "Retired", retired: true }),
      model({ name: "A-model" }),
    ]);
    expect(data.active.map((r) => r.name)).toEqual(["A-model", "b-model"]);
    expect(data.retired.map((r) => r.name)).toEqual(["Old"]);
  });

  it("truncates limitations over 300 characters and keeps shorter ones whole", () => {
    const long = "x".repeat(301);
    const exact = "y".repeat(300);
    const data = buildInventoryAppendix([
      model({ name: "Long", limitations: long }),
      model({ name: "Exact", limitations: exact }),
    ]);
    const byName = Object.fromEntries(data.active.map((r) => [r.name, r]));
    expect(byName.Long.limitations).toBe(`${"x".repeat(300)}…`);
    expect(byName.Exact.limitations).toBe(exact);
  });

  it("maps roles, latest validation, thresholds and open findings into the row", () => {
    const [row] = buildInventoryAppendix([
      model({
        name: "M",
        roles: { owner: ["Ann", "Bob"], developerIds: [3], validator: [], approver: [] },
        inventoryApprover: "Cat",
        activeThresholds: 0,
        findings: [
          { severity: "low", stage: "open", dueDate: null, remediationPlanEmpty: true },
          { severity: "low", stage: "closed", dueDate: null, remediationPlanEmpty: true },
        ],
      }),
    ]).active;
    expect(row).toMatchObject({
      owner: "Ann, Bob",
      approver: "Cat",
      latestOutcome: "validated",
      latestSignedOffAt: "2026-06-01T00:00:00.000Z",
      nextReviewDue: "2027-06-01T00:00:00.000Z",
      activeThresholds: false,
      openFindings: 1,
    });
  });

  it("prefers approver role names over the inventory approver and leaves blanks null", () => {
    const [row] = buildInventoryAppendix([
      model({
        roles: { owner: [], developerIds: [], validator: [], approver: ["Dan"] },
        inventoryApprover: "Cat",
        latestSignedOff: null,
        nextReviewDue: null,
      }),
    ]).active;
    expect(row).toMatchObject({
      owner: null,
      approver: "Dan",
      latestOutcome: null,
      latestSignedOffAt: null,
    });
  });
});
