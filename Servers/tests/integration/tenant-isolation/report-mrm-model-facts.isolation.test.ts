jest.setTimeout(60000);

import { QueryTypes } from "sequelize";
import { cleanupDatabase } from "../helpers";
import { sequelize } from "../../../database/db";
import { seedTwoTenantContexts } from "./tenantIsolation.harness";
import { createTestModelInventory } from "../../factories";
import { collectMrmModelFacts } from "../../../services/reporting/collectors/mrmModelFacts";

const resolveAll = async (ids: unknown[]) =>
  new Map<number, string>(ids.map((id) => [Number(id), `User ${id}`]));

// Fixed, so the period and the seeded dates do not depend on today.
const GENERATED_AT = new Date("2026-11-22T12:00:00.000Z");
const DAY_MS = 24 * 60 * 60 * 1000;
const isoDay = (d: Date) => d.toISOString().slice(0, 10);
const PERIOD = {
  start: isoDay(new Date(GENERATED_AT.getTime() - 30 * DAY_MS)),
  end: isoDay(new Date(GENERATED_AT.getTime() + DAY_MS)),
};
const IN_PERIOD = new Date(GENERATED_AT.getTime() - DAY_MS).toISOString();

const insertId = async (sql: string, replacements: Record<string, unknown>): Promise<number> => {
  const rows = (await sequelize.query(`${sql} RETURNING id`, {
    replacements,
    type: QueryTypes.SELECT,
  })) as Array<{ id: number }>;
  return rows[0].id;
};

const REPORT = JSON.stringify({
  purpose_scope: { text: "Scope", evidence_links: [] },
  conceptual_soundness: { text: "  ", evidence_links: [] },
  data_review: { text: "Data", evidence_links: [] },
  outcomes_analysis: { text: "Outcomes", evidence_links: [] },
  findings_limitations: { text: "Limits", evidence_links: [] },
});

/** Every MRM row type for one model, written under `orgId`. */
async function seedMrmRows(
  orgId: number,
  modelId: number,
  userId: number,
  o: { signedOffAt: string; nextDue: string; severity: string; metricAt: string },
) {
  await sequelize.query(
    `INSERT INTO mrm_model_roles (organization_id, model_inventory_id, role, user_id, created_at)
     VALUES (:orgId, :modelId, 'owner', :userId, NOW()), (:orgId, :modelId, 'developer', :userId, NOW()),
            (:orgId, :modelId, 'validator', :userId, NOW()), (:orgId, :modelId, 'approver', :userId, NOW())`,
    { replacements: { orgId, modelId, userId } },
  );
  await insertId(
    `INSERT INTO mrm_validations (organization_id, model_inventory_id, stage, outcome, validator_id,
                                  report, signed_off_at, signed_off_by, next_due)
     VALUES (:orgId, :modelId, 'validated', 'validated', :userId, CAST(:report AS jsonb),
             :signedOffAt, :userId, :nextDue)`,
    { orgId, modelId, userId, report: REPORT, signedOffAt: o.signedOffAt, nextDue: o.nextDue },
  );
  await insertId(
    `INSERT INTO mrm_validations (organization_id, model_inventory_id, stage, next_due)
     VALUES (:orgId, :modelId, 'in_validation', :nextDue)`,
    { orgId, modelId, nextDue: o.nextDue },
  );
  await insertId(
    `INSERT INTO mrm_findings (organization_id, model_inventory_id, title, severity, stage,
                               remediation_plan, due_date, created_at)
     VALUES (:orgId, :modelId, 'Finding', :severity, 'open', NULL, :due, :created)`,
    { orgId, modelId, severity: o.severity, due: o.nextDue, created: IN_PERIOD },
  );
  await insertId(
    `INSERT INTO mrm_findings (organization_id, model_inventory_id, title, severity, stage,
                               remediation_plan, closed_at, created_at)
     VALUES (:orgId, :modelId, 'Closed finding', 'low', 'closed', 'Plan', :closed, :created)`,
    { orgId, modelId, closed: IN_PERIOD, created: "2020-01-01T00:00:00Z" },
  );
  await insertId(
    `INSERT INTO mrm_thresholds (organization_id, model_inventory_id, metric, op, value_num,
                                 severity, breach_action, active)
     VALUES (:orgId, :modelId, 'psi', 'gt', 0.2, 'high', 'notify', true)`,
    { orgId, modelId },
  );
  const metricId = await insertId(
    `INSERT INTO mrm_metrics (organization_id, model_inventory_id, metric, value, at, received_at)
     VALUES (:orgId, :modelId, 'psi', 0.3, :at, :at)`,
    { orgId, modelId, at: o.metricAt },
  );
  await insertId(
    `INSERT INTO mrm_metric_evaluations (organization_id, metric_id, status, evaluated_at)
     VALUES (:orgId, :metricId, 'breach', :at)`,
    { orgId, metricId, at: IN_PERIOD },
  );
  await insertId(
    `INSERT INTO mrm_revalidation_events (organization_id, model_inventory_id, trigger_source, fired_at)
     VALUES (:orgId, :modelId, 'breach', :at)`,
    { orgId, modelId, at: IN_PERIOD },
  );
  return { metricId };
}

async function seedModel(orgId: number, userId: number, name: string) {
  const id = await createTestModelInventory(orgId, { model: name, provider: "Acme" });
  await sequelize.query(
    `UPDATE model_inventories
        SET status = 'Approved', mrm_tier = '1', mrm_tiered_at = '2026-01-15T00:00:00Z',
            approver = :userId, intended_use = 'Scoring', limitations = 'Thin data'
      WHERE id = :id AND organization_id = :orgId`,
    { replacements: { id, orgId, userId } },
  );
  return id;
}

describe("Report MRM model facts tenant isolation", () => {
  afterEach(async () => {
    await cleanupDatabase();
  });

  async function setup() {
    const { owner, attacker } = await seedTwoTenantContexts();
    const aModel = await seedModel(owner.orgId, owner.userId, "Org A model");
    const bModel = await seedModel(attacker.orgId, attacker.userId, "Org B model");
    await seedMrmRows(owner.orgId, aModel, owner.userId, {
      signedOffAt: "2026-02-01T00:00:00.000Z",
      nextDue: "2027-02-01T00:00:00.000Z",
      severity: "high",
      metricAt: "2026-02-02T00:00:00.000Z",
    });
    await seedMrmRows(attacker.orgId, bModel, attacker.userId, {
      signedOffAt: "2026-03-01T00:00:00.000Z",
      nextDue: "2027-03-01T00:00:00.000Z",
      severity: "critical",
      metricAt: "2026-03-02T00:00:00.000Z",
    });
    const collect = (orgId: number) =>
      collectMrmModelFacts(orgId, GENERATED_AT, PERIOD, resolveAll);
    return { owner, attacker, aModel, bModel, collect };
  }

  it("returns only the caller's models and their own MRM rows", async () => {
    const { owner, aModel, collect } = await setup();
    const { models, activity } = await collect(owner.orgId);

    expect(models.map((m) => m.id)).toEqual([aModel]);
    const [m] = models;
    const self = `User ${owner.userId}`;
    expect(m).toMatchObject({
      name: "Org A model",
      status: "Approved",
      retired: false,
      tier: "1",
      tieredAt: "2026-01-15T00:00:00.000Z",
      intendedUse: "Scoring",
      limitations: "Thin data",
      inventoryApproverId: owner.userId,
      inventoryApprover: self,
      roles: { owner: [self], developerIds: [owner.userId], validator: [self], approver: [self] },
      hasOpenValidation: true,
      openValidationNextDue: "2027-02-01T00:00:00.000Z",
      latestSignedOff: {
        validatorId: owner.userId,
        outcome: "validated",
        signedOffAt: "2026-02-01T00:00:00.000Z",
        emptyReportSections: ["conceptual_soundness", "conclusion_signoff"],
      },
      nextReviewDue: "2027-02-01T00:00:00.000Z",
      activeThresholds: 1,
      lastMetricReceivedAt: "2026-02-02T00:00:00.000Z",
    });
    expect(m.findings).toHaveLength(2);
    expect(m.findings.find((f) => f.stage === "open")).toEqual({
      severity: "high",
      stage: "open",
      dueDate: "2027-02-01T00:00:00.000Z",
      remediationPlanEmpty: true,
    });
    expect(activity).toEqual({
      period: PERIOD,
      validationsSignedOff: 0, // signed off 2026-02-01, before the period
      findingsOpened: 1,
      findingsClosed: 1,
      breaches: 1,
      revalidationEvents: 1,
    });
  });

  it("ignores org B rows that point at org A's model and metric ids", async () => {
    const { owner, attacker, aModel, collect } = await setup();
    const before = await collect(owner.orgId);

    // Org B rows naming org A's model: later and different values, so any
    // leak through a missing organization predicate changes org A's facts.
    const { metricId: bMetricOnA } = await seedMrmRows(attacker.orgId, aModel, attacker.userId, {
      signedOffAt: IN_PERIOD,
      nextDue: "2028-01-01T00:00:00.000Z",
      severity: "critical",
      metricAt: new Date(GENERATED_AT.getTime() - 60_000).toISOString(),
    });
    // An org A evaluation pointing at org B's metric (which names org A's model).
    await insertId(
      `INSERT INTO mrm_metric_evaluations (organization_id, metric_id, status, evaluated_at)
       VALUES (:orgId, :metricId, 'breach', :at)`,
      { orgId: owner.orgId, metricId: bMetricOnA, at: IN_PERIOD },
    );

    const after = await collect(owner.orgId);
    expect(after).toEqual(before);
  });

  it("returns nothing of org A's when org B collects", async () => {
    const { owner, attacker, bModel, collect } = await setup();
    const { models } = await collect(attacker.orgId);
    expect(models.map((m) => m.id)).toEqual([bModel]);
    expect(models[0].roles.owner).toEqual([`User ${attacker.userId}`]);
    expect(models[0].roles.developerIds).not.toContain(owner.userId);
  });

  it("drops role holders and the inventory approver who are not current members", async () => {
    const { owner, attacker, aModel } = await setup();
    await sequelize.query(
      `INSERT INTO mrm_model_roles (organization_id, model_inventory_id, role, user_id, created_at)
       VALUES (:orgId, :aModel, 'owner', :bUser, NOW()), (:orgId, :aModel, 'developer', :bUser, NOW())`,
      { replacements: { orgId: owner.orgId, aModel, bUser: attacker.userId } },
    );
    await sequelize.query(
      `UPDATE model_inventories SET approver = :bUser WHERE id = :aModel AND organization_id = :orgId`,
      { replacements: { orgId: owner.orgId, aModel, bUser: attacker.userId } },
    );
    const membersOnly = async (ids: unknown[]) =>
      new Map<number, string>(
        ids.filter((id) => Number(id) === owner.userId).map((id) => [Number(id), "Ann Member"]),
      );
    const { models } = await collectMrmModelFacts(owner.orgId, GENERATED_AT, PERIOD, membersOnly);
    expect(models[0].roles.owner).toEqual(["Ann Member"]);
    expect([...models[0].roles.developerIds].sort()).toEqual(
      [owner.userId, attacker.userId].sort(),
    );
    expect(models[0].inventoryApproverId).toBe(attacker.userId);
    expect(models[0].inventoryApprover).toBeNull();
  });

  it("counts period activity by UTC day, inclusive of both ends, and zeros without a period", async () => {
    const { owner, aModel } = await setup();
    for (const at of [
      "2026-02-28T23:59:59.999Z",
      "2026-03-01T00:00:00.000Z",
      "2026-03-31T23:59:59.999Z",
      "2026-04-01T00:00:00.000Z",
    ]) {
      await insertId(
        `INSERT INTO mrm_revalidation_events (organization_id, model_inventory_id, trigger_source, fired_at)
         VALUES (:orgId, :aModel, 'scheduled', :at)`,
        { orgId: owner.orgId, aModel, at },
      );
    }
    const march = { start: "2026-03-01", end: "2026-03-31" };
    const { activity } = await collectMrmModelFacts(owner.orgId, GENERATED_AT, march, resolveAll);
    expect(activity.revalidationEvents).toBe(2);

    const none = await collectMrmModelFacts(owner.orgId, GENERATED_AT, null, resolveAll);
    expect(none.activity).toEqual({
      period: null,
      validationsSignedOff: 0,
      findingsOpened: 0,
      findingsClosed: 0,
      breaches: 0,
      revalidationEvents: 0,
    });
  });

  it("flags retired models and excludes their period activity", async () => {
    const { owner, aModel } = await setup();
    await sequelize.query(
      `UPDATE model_inventories SET status = 'Retired' WHERE id = :aModel AND organization_id = :orgId`,
      { replacements: { orgId: owner.orgId, aModel } },
    );
    const { models, activity } = await collectMrmModelFacts(
      owner.orgId,
      GENERATED_AT,
      PERIOD,
      resolveAll,
    );
    expect(models[0].retired).toBe(true);
    expect(activity).toMatchObject({
      findingsOpened: 0,
      findingsClosed: 0,
      breaches: 0,
      revalidationEvents: 0,
    });
  });
});
