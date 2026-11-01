jest.setTimeout(60000);

/**
 * Accepting and dismissing vendor research findings against the real test database.
 *
 * Accepting turns a pending finding into a risk of the vendor risk register, the same way the
 * vendor risk form does: the row, the change history and, once the transaction has committed, the
 * related-risk recompute and the action owner's notice. Nothing reaches the register before that.
 * Dismissing records why a finding was not taken.
 *
 * BullMQ and the notification service are mocked by ./setup, so what is queued and who is told is
 * read back from the mocks, never run.
 */

import http from "http";
import { QueryTypes } from "sequelize";
import { cleanupDatabase, createTestUser } from "./helpers";
import { sequelize } from "../../database/db";
// The harness loads ./setup, which registers the mocks of BullMQ and the notification service:
// keep it before the modules that open a queue.
import { seedTwoTenantContexts } from "./tenant-isolation/tenantIsolation.harness";
import type { TenantContext } from "./tenant-isolation/tenantIsolation.harness";
import { createTestApp, testRequest } from "./setup";
import { createTestVendor, createTestVendorRisk } from "../factories";
import { notifyUserAssigned } from "../../services/inAppNotification.service";
import { automationQueue } from "../../services/automations/automationProducer";
import { DISMISS_REASONS, type NewFinding } from "../../domain.layer/interfaces/i.vendorResearch";
import * as researchUtils from "../../utils/vendorResearch.utils";
import { createRunQuery, insertFindingsQuery } from "../../utils/vendorResearch.utils";

beforeEach(() => {
  jest.clearAllMocks();
});

afterEach(async () => {
  await cleanupDatabase();
});

// ---------------------------------------------------------------------------
// Fixtures and helpers
// ---------------------------------------------------------------------------

const FINDING: NewFinding = {
  category: "security_incidents",
  risk_description: "Customer records were exposed in a 2026 breach.",
  impact_description: "Personal data we share with the vendor may have been accessed.",
  action_plan: "Ask the vendor for the incident report and confirm remediation.",
  likelihood: "Possible",
  risk_severity: "Major",
  risk_level: "High Risk",
  rationale: "Because of what the sources say.",
  sources: [
    {
      url: "https://example.com/breach-notice",
      title: "Breach notice",
      quote: "We confirmed unauthorised access to customer records.",
      published_at: "2026-09-01",
    },
  ],
};

const SECOND_FINDING: NewFinding = {
  ...FINDING,
  category: "certifications",
  risk_description: "The vendor's SOC 2 report has lapsed.",
  impact_description: "We cannot rely on the vendor's controls without a current report.",
  action_plan: "Request the current SOC 2 report.",
  likelihood: "Likely",
  risk_severity: "Moderate",
  risk_level: "Medium Risk",
};

const THIRD_FINDING: NewFinding = {
  ...FINDING,
  category: "ai_specific",
  risk_description: "The vendor trains its models on customer data.",
};

const rows = async <T = Record<string, unknown>>(
  sql: string,
  replacements: Record<string, unknown> = {},
): Promise<T[]> => (await sequelize.query(sql, { replacements, type: QueryTypes.SELECT })) as T[];

/** A vendor in `ctx`'s organization whose research run stored `findings`, all pending. */
const seedFindings = async (
  ctx: TenantContext,
  vendorName = "Acme Corp",
  findings: NewFinding[] = [FINDING, SECOND_FINDING, THIRD_FINDING],
) => {
  const vendorId = await createTestVendor(ctx.orgId, { vendor_name: vendorName });
  const run = await createRunQuery({
    organizationId: ctx.orgId,
    vendorId,
    triggerType: "auto",
    requestedBy: null,
  });
  const inserted = await sequelize.transaction((transaction) =>
    insertFindingsQuery(
      { organizationId: ctx.orgId, vendorId, runId: run.id, findings },
      transaction,
    ),
  );
  return { vendorId, runId: run.id, inserted };
};

let userCount = 0;
/** One more user of the organization (an Editor). */
const addUser = (orgId: number) =>
  createTestUser(orgId, 3, `decisions-user-${Date.now()}-${userCount++}@test.com`, "Password123!");

const setAssignee = (vendorId: number, userId: number) =>
  sequelize.query("UPDATE vendors SET assignee = :userId WHERE id = :vendorId", {
    replacements: { userId, vendorId },
  });

/** A request agent for another role of the same organization and user. */
async function requestAs(role: string, ctx: TenantContext) {
  const app: http.Server = await createTestApp({
    bypassAuth: true,
    mockUser: { userId: ctx.userId, organizationId: ctx.orgId, role },
  });
  return testRequest(app);
}

const BASE = "/api/v1/vendor-risk-findings";
const acceptUrl = (findingId: number | string) => `${BASE}/${findingId}/accept`;
const dismissUrl = (findingId: number | string) => `${BASE}/${findingId}/dismiss`;

interface RiskRow {
  id: number;
  organization_id: number;
  vendor_id: number;
  risk_description: string;
  impact_description: string;
  likelihood: string;
  risk_severity: string;
  action_plan: string;
  action_owner: number | null;
  risk_level: string;
  is_deleted: boolean;
  is_demo: boolean;
}

/** The register rows of an organization, oldest first. */
const risksOf = (orgId: number) =>
  rows<RiskRow>(
    `SELECT id, organization_id, vendor_id, risk_description, impact_description, likelihood,
            risk_severity, action_plan, action_owner, risk_level, is_deleted, is_demo
     FROM vendorrisks WHERE organization_id = :orgId ORDER BY id`,
    { orgId },
  );

const countAll = async (table: string): Promise<number> => {
  const [row] = await rows<{ count: string }>(`SELECT count(*) AS count FROM ${table}`);
  return Number(row.count);
};

interface FindingRow {
  status: string;
  dismissed_reason: string | null;
  dismissed_note: string | null;
  accepted_vendor_risk_id: number | null;
  decided_by: number | null;
  decided_at: Date | null;
}

const findingOf = async (id: number): Promise<FindingRow> => {
  const [row] = await rows<FindingRow>(
    `SELECT status, dismissed_reason, dismissed_note, accepted_vendor_risk_id, decided_by, decided_at
     FROM vendor_risk_findings WHERE id = :id`,
    { id },
  );
  return row;
};

const PENDING: FindingRow = {
  status: "pending",
  dismissed_reason: null,
  dismissed_note: null,
  accepted_vendor_risk_id: null,
  decided_by: null,
  decided_at: null,
};

/** The related-risk recompute jobs queued so far, as [name, data, options]. */
const recomputeJobs = () =>
  (automationQueue.add as jest.Mock).mock.calls.filter(
    ([name]) => name === "vendor_risk_link_recompute",
  );

/** Nothing reached the register, and nothing that follows a committed risk happened. */
const expectRegisterUntouched = async () => {
  expect(await countAll("vendorrisks")).toBe(0);
  expect(await countAll("vendor_risk_change_history")).toBe(0);
  expect(recomputeJobs()).toHaveLength(0);
  expect(notifyUserAssigned).not.toHaveBeenCalled();
};

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Whether a request is still unanswered after half a second. */
const isStillWaiting = async (pending: Promise<unknown>): Promise<boolean> =>
  Promise.race([pending.then(() => false), delay(500).then(() => true)]);

/**
 * The answer to `pending`, or null when it is still unanswered after five seconds. A request that
 * should answer at once but queues on a lock fails its assertion that way, instead of hanging the
 * test until jest gives up on it.
 */
const answerOf = <T>(pending: Promise<T>): Promise<T | null> =>
  Promise.race([pending, delay(5000).then(() => null)]);

/**
 * Whether another connection holds the row lock of the finding right now: a lock that is not
 * available is Postgres error 55P03, which `FOR UPDATE NOWAIT` raises instead of waiting.
 */
const isHeldByAnother = async (findingId: number): Promise<boolean> => {
  try {
    await sequelize.transaction((transaction) =>
      sequelize.query("SELECT id FROM vendor_risk_findings WHERE id = :id FOR UPDATE NOWAIT", {
        replacements: { id: findingId },
        type: QueryTypes.SELECT,
        transaction,
      }),
    );
    return false;
  } catch (error) {
    if ((error as { parent?: { code?: string } }).parent?.code === "55P03") {
      return true;
    }
    throw error;
  }
};

/**
 * A decision that is being made: it holds the row lock of the finding, as an accept does between
 * its read and its commit, until `commitAccepted` or `release`.
 */
const startDecision = async (findingId: number) => {
  const holder = await sequelize.transaction();
  let finished = false;
  await sequelize.query("SELECT id FROM vendor_risk_findings WHERE id = :id FOR UPDATE", {
    replacements: { id: findingId },
    type: QueryTypes.SELECT,
    transaction: holder,
  });
  return {
    /** Marks the finding accepted into `vendorRiskId` and lets go of the lock. */
    commitAccepted: async (ctx: TenantContext, vendorRiskId: number) => {
      await researchUtils.markFindingAcceptedQuery(
        { organizationId: ctx.orgId, id: findingId, vendorRiskId, userId: ctx.userId },
        holder,
      );
      await holder.commit();
      finished = true;
    },
    /** Lets go without deciding; harmless once the decision has been committed. */
    release: async () => {
      if (!finished) {
        finished = true;
        await holder.rollback();
      }
    },
  };
};

// ---------------------------------------------------------------------------
// POST /api/v1/vendor-risk-findings/:id/accept
// ---------------------------------------------------------------------------

describe("POST /api/v1/vendor-risk-findings/:id/accept", () => {
  it("creates the risk, records its creation and marks the finding accepted", async () => {
    const { owner } = await seedTwoTenantContexts(3);
    const { vendorId, inserted } = await seedFindings(owner);
    const [finding, bystander] = inserted;
    const assignee = await addUser(owner.orgId);
    await setAssignee(vendorId, assignee);
    const [actor] = await rows<{ name: string; surname: string }>(
      "SELECT name, surname FROM users WHERE id = :id",
      { id: owner.userId },
    );
    const baseUrl = process.env.FRONTEND_URL || "http://localhost:5173";

    const res = await owner.request.post(acceptUrl(finding.id));

    expect(res.status).toBe(200);
    expect(res.body.message).toBe("OK");
    const { vendorRisk, finding: decided } = res.body.data;
    expect(Object.keys(res.body.data).sort()).toEqual(["finding", "vendorRisk"]);
    expect(vendorRisk.id).toEqual(expect.any(Number));

    // Exactly one risk, built from the finding, for the finding's vendor and the vendor's assignee.
    const risks = await risksOf(owner.orgId);
    expect(risks).toEqual([
      {
        id: vendorRisk.id,
        organization_id: owner.orgId,
        vendor_id: vendorId,
        risk_description: FINDING.risk_description,
        impact_description: FINDING.impact_description,
        likelihood: FINDING.likelihood,
        risk_severity: FINDING.risk_severity,
        action_plan: FINDING.action_plan,
        action_owner: assignee,
        risk_level: finding.risk_level,
        is_deleted: false,
        is_demo: false,
      },
    ]);
    expect(risks[0].risk_level).toBe("High Risk");
    expect(vendorRisk).toMatchObject({ id: risks[0].id, risk_level: "High Risk" });

    // The finding is accepted into that risk, by the caller, and says so in the response too.
    expect(decided).toMatchObject({
      id: finding.id,
      status: "accepted",
      accepted_vendor_risk_id: vendorRisk.id,
      decided_by: owner.userId,
    });
    expect(decided.decided_at).toEqual(expect.any(String));
    const stored = await findingOf(finding.id);
    expect(stored).toMatchObject({
      status: "accepted",
      accepted_vendor_risk_id: vendorRisk.id,
      decided_by: owner.userId,
    });
    expect(stored.decided_at).toBeInstanceOf(Date);
    // Accepting one finding leaves the vendor's others pending.
    expect(await findingOf(bystander.id)).toEqual(PENDING);

    // The creation is in the change history, by the caller.
    const history = await rows<{ action: string; new_value: string; changed_by_user_id: number }>(
      `SELECT action, new_value, changed_by_user_id, organization_id
       FROM vendor_risk_change_history WHERE vendor_risk_id = :id`,
      { id: vendorRisk.id },
    );
    expect(history.length).toBeGreaterThan(0);
    for (const entry of history) {
      expect(entry).toMatchObject({
        action: "created",
        changed_by_user_id: owner.userId,
        organization_id: owner.orgId,
      });
    }
    expect(history.map((entry) => entry.new_value)).toEqual(
      expect.arrayContaining([
        FINDING.risk_description,
        FINDING.impact_description,
        FINDING.action_plan,
        "High Risk",
      ]),
    );

    // What follows a committed risk ran, as for the vendor risk form: the recompute is queued and
    // the action owner is told, by name of the person who accepted.
    expect(recomputeJobs().map(([, data]) => data)).toEqual([
      { organizationId: owner.orgId, vendorRiskId: vendorRisk.id },
    ]);
    expect(notifyUserAssigned).toHaveBeenCalledTimes(1);
    expect(notifyUserAssigned).toHaveBeenCalledWith(
      owner.orgId,
      assignee,
      {
        entityType: "Vendor Risk",
        entityId: vendorRisk.id,
        entityName: FINDING.risk_description,
        roleType: "Action Owner",
        entityUrl: `${baseUrl}/vendors?vendorRiskId=${vendorRisk.id}`,
      },
      `${actor.name} ${actor.surname}`,
      baseUrl,
      { parentType: "Vendor", parentName: "Acme Corp", description: FINDING.impact_description },
    );
  });

  it("makes the vendor's assignee the action owner unless the caller says otherwise", async () => {
    const { owner } = await seedTwoTenantContexts(3);
    const { vendorId, inserted } = await seedFindings(owner);
    const [byDefault, withoutOwner, withOwner] = inserted;
    const assignee = await addUser(owner.orgId);
    const chosen = await addUser(owner.orgId);
    await setAssignee(vendorId, assignee);

    const first = await owner.request.post(acceptUrl(byDefault.id)).send({});
    const second = await owner.request
      .post(acceptUrl(withoutOwner.id))
      .send({ action_owner: null });
    const third = await owner.request.post(acceptUrl(withOwner.id)).send({ action_owner: chosen });

    expect([first.status, second.status, third.status]).toEqual([200, 200, 200]);
    const ownerOf = async (res: { body: { data: { vendorRisk: { id: number } } } }) =>
      (await risksOf(owner.orgId)).find((risk) => risk.id === res.body.data.vendorRisk.id)
        ?.action_owner;
    expect(await ownerOf(first)).toBe(assignee);
    expect(await ownerOf(second)).toBeNull();
    expect(await ownerOf(third)).toBe(chosen);
    // Only an owner is told: the explicit null has nobody to tell.
    expect(notifyUserAssigned).toHaveBeenCalledTimes(2);
    expect(recomputeJobs()).toHaveLength(3);
  });

  it("leaves the action owner empty when the vendor has no assignee and none is given", async () => {
    const { owner } = await seedTwoTenantContexts(3);
    const {
      inserted: [finding],
    } = await seedFindings(owner);

    const res = await owner.request.post(acceptUrl(finding.id));

    expect(res.status).toBe(200);
    expect((await risksOf(owner.orgId))[0].action_owner).toBeNull();
    expect(notifyUserAssigned).not.toHaveBeenCalled();
  });

  it("leaves the action owner empty, and still accepts, when the vendor's assignee is a user of another organization", async () => {
    const { owner, attacker } = await seedTwoTenantContexts(3);
    const {
      vendorId,
      inserted: [strangerFinding, ownFinding],
    } = await seedFindings(owner);
    // Nothing in the database ties the assignee of a vendor to the organization of the vendor.
    await setAssignee(vendorId, attacker.userId);

    const res = await owner.request.post(acceptUrl(strangerFinding.id));

    expect(res.status).toBe(200);
    const [risk] = await risksOf(owner.orgId);
    expect(risk.id).toBe(res.body.data.vendorRisk.id);
    expect(risk.action_owner).toBeNull();
    expect(await findingOf(strangerFinding.id)).toMatchObject({
      status: "accepted",
      accepted_vendor_risk_id: risk.id,
    });
    // The user of the other organization is not told about a risk that is not theirs.
    expect(notifyUserAssigned).not.toHaveBeenCalled();
    expect(recomputeJobs()).toHaveLength(1);

    // Positive control: an assignee of the organization becomes the action owner and is told.
    const assignee = await addUser(owner.orgId);
    await setAssignee(vendorId, assignee);
    const again = await owner.request.post(acceptUrl(ownFinding.id));
    expect(again.status).toBe(200);
    const created = (await risksOf(owner.orgId)).find(
      (row) => row.id === again.body.data.vendorRisk.id,
    );
    expect(created?.action_owner).toBe(assignee);
    expect(notifyUserAssigned).toHaveBeenCalledTimes(1);
  });

  it("refuses an action owner who is not a user of the organization, and creates nothing", async () => {
    const { owner, attacker } = await seedTwoTenantContexts(3);
    const {
      inserted: [finding],
    } = await seedFindings(owner);

    // A user of another organization, a user that does not exist, and ids that are not user ids.
    for (const actionOwner of [attacker.userId, 987654321, "5", 0, -1, 1.5, true]) {
      const refused = await owner.request
        .post(acceptUrl(finding.id))
        .send({ action_owner: actionOwner });
      expect({ actionOwner, status: refused.status }).toEqual({ actionOwner, status: 400 });
    }

    expect(await findingOf(finding.id)).toEqual(PENDING);
    await expectRegisterUntouched();

    // Positive control: with a user of the organization the same finding is accepted.
    const own = await addUser(owner.orgId);
    const accepted = await owner.request.post(acceptUrl(finding.id)).send({ action_owner: own });
    expect(accepted.status).toBe(200);
    expect((await risksOf(owner.orgId))[0].action_owner).toBe(own);
  });

  describe("with the values the person edited", () => {
    /** The first two framework ids of the test database. */
    const someFrameworks = async () =>
      (await rows<{ id: number }>("SELECT id FROM frameworks ORDER BY id LIMIT 2")).map(
        (framework) => framework.id,
      );

    it("creates the risk from the edited values, links the frameworks and marks the finding accepted", async () => {
      const { owner } = await seedTwoTenantContexts(3);
      const { vendorId, inserted } = await seedFindings(owner);
      const [finding, bystander] = inserted;
      const chosen = await addUser(owner.orgId);
      const frameworkIds = await someFrameworks();
      expect(frameworkIds).toHaveLength(2);

      const res = await owner.request.post(acceptUrl(finding.id)).send({
        action_owner: chosen,
        // Padding and a NUL, which Postgres refuses in text, are cleaned the way a note is.
        risk_description: "  Customer records were exposed in 2026 \u0000 ",
        impact_description: "Customers' personal data may have been accessed.",
        action_plan: "Ask for the incident report and review it with the DPO.",
        likelihood: "Almost certain",
        risk_severity: "Catastrophic",
        risk_level: "Very high risk",
        // A framework named twice is linked once: the link table's key would refuse it twice.
        frameworks: [...frameworkIds, frameworkIds[0]],
        // Not edits: the finding decides its vendor and its own state.
        vendor_id: 987654321,
        status: "dismissed",
        accepted_vendor_risk_id: 5,
      });

      expect(res.status).toBe(200);
      const { vendorRisk, finding: decided } = res.body.data;
      expect(await risksOf(owner.orgId)).toEqual([
        {
          id: vendorRisk.id,
          organization_id: owner.orgId,
          vendor_id: vendorId,
          risk_description: "Customer records were exposed in 2026",
          impact_description: "Customers' personal data may have been accessed.",
          likelihood: "Almost certain",
          risk_severity: "Catastrophic",
          action_plan: "Ask for the incident report and review it with the DPO.",
          action_owner: chosen,
          risk_level: "Very high risk",
          is_deleted: false,
          is_demo: false,
        },
      ]);
      expect(vendorRisk).toMatchObject({
        id: vendorRisk.id,
        likelihood: "Almost certain",
        risk_level: "Very high risk",
      });
      expect(decided).toMatchObject({
        id: finding.id,
        status: "accepted",
        accepted_vendor_risk_id: vendorRisk.id,
        decided_by: owner.userId,
      });

      // The finding keeps what the research wrote: the edits belong to the risk.
      const [stored] = await rows<{ risk_description: string; likelihood: string }>(
        "SELECT risk_description, likelihood FROM vendor_risk_findings WHERE id = :id",
        { id: finding.id },
      );
      expect(stored).toEqual({
        risk_description: FINDING.risk_description,
        likelihood: FINDING.likelihood,
      });
      expect(await findingOf(bystander.id)).toEqual(PENDING);

      const links = await rows(
        "SELECT framework_id, organization_id FROM frameworks_vendorrisks WHERE vendorrisk_id = :id ORDER BY framework_id",
        { id: vendorRisk.id },
      );
      expect(links).toEqual(
        frameworkIds.map((frameworkId) => ({
          framework_id: frameworkId,
          organization_id: owner.orgId,
        })),
      );

      // The change history and the notice carry the edited risk, not the finding.
      const history = await rows<{ new_value: string }>(
        "SELECT new_value FROM vendor_risk_change_history WHERE vendor_risk_id = :id",
        { id: vendorRisk.id },
      );
      expect(history.map((entry) => entry.new_value)).toEqual(
        expect.arrayContaining(["Customer records were exposed in 2026", "Very high risk"]),
      );
      expect(history.map((entry) => entry.new_value)).not.toContain(FINDING.risk_description);
      expect(notifyUserAssigned).toHaveBeenCalledWith(
        owner.orgId,
        chosen,
        expect.objectContaining({ entityName: "Customer records were exposed in 2026" }),
        expect.any(String),
        expect.any(String),
        expect.objectContaining({
          description: "Customers' personal data may have been accessed.",
        }),
      );
      expect(recomputeJobs()).toHaveLength(1);
    });

    it("keeps the finding's values for what the caller leaves out, and links no frameworks", async () => {
      const { owner } = await seedTwoTenantContexts(3);
      const {
        vendorId,
        inserted: [finding],
      } = await seedFindings(owner);

      const res = await owner.request
        .post(acceptUrl(finding.id))
        .send({ action_plan: "Ask for the audit report instead." });

      expect(res.status).toBe(200);
      expect(await risksOf(owner.orgId)).toEqual([
        {
          id: res.body.data.vendorRisk.id,
          organization_id: owner.orgId,
          vendor_id: vendorId,
          risk_description: FINDING.risk_description,
          impact_description: FINDING.impact_description,
          likelihood: FINDING.likelihood,
          risk_severity: FINDING.risk_severity,
          action_plan: "Ask for the audit report instead.",
          action_owner: null,
          risk_level: "High Risk",
          is_deleted: false,
          is_demo: false,
        },
      ]);
      expect(await countAll("frameworks_vendorrisks")).toBe(0);
    });

    it("works the risk level out from the edited pair when the caller sends none", async () => {
      const { owner } = await seedTwoTenantContexts(3);
      const {
        inserted: [finding],
      } = await seedFindings(owner);

      // The finding is Possible / Major (High); Almost certain / Major is Very High.
      const res = await owner.request
        .post(acceptUrl(finding.id))
        .send({ likelihood: "Almost certain" });

      expect(res.status).toBe(200);
      const [risk] = await risksOf(owner.orgId);
      expect(risk).toMatchObject({ likelihood: "Almost certain", risk_level: "Very High Risk" });
    });

    it("refuses an edit the register cannot take with 400, and creates nothing", async () => {
      const { owner } = await seedTwoTenantContexts(3);
      const {
        inserted: [finding],
      } = await seedFindings(owner);

      const refused: Array<Record<string, unknown>> = [
        { risk_description: "" },
        { risk_description: "a".repeat(501) },
        { impact_description: 5 },
        { impact_description: "   " },
        { action_plan: "a".repeat(1001) },
        { likelihood: "Almost Certain" },
        { likelihood: "Certain" },
        { risk_severity: "Critical" },
        { risk_level: "a".repeat(51) },
        { risk_level: null },
        { frameworks: "3" },
        { frameworks: [0] },
        { frameworks: [1, 1.5] },
        { frameworks: Array.from({ length: 101 }, (_, index) => index + 1) },
      ];
      for (const edit of refused) {
        const res = await owner.request.post(acceptUrl(finding.id)).send(edit);
        expect({ edit: JSON.stringify(edit).slice(0, 80), status: res.status }).toEqual({
          edit: JSON.stringify(edit).slice(0, 80),
          status: 400,
        });
      }

      expect(await findingOf(finding.id)).toEqual(PENDING);
      await expectRegisterUntouched();

      // Positive control: with valid edits the same finding is accepted.
      const accepted = await owner.request
        .post(acceptUrl(finding.id))
        .send({ risk_description: "a".repeat(500), action_plan: "b".repeat(1000) });
      expect(accepted.status).toBe(200);
      const [risk] = await risksOf(owner.orgId);
      expect(risk.risk_description).toHaveLength(500);
      expect(risk.action_plan).toHaveLength(1000);
    });

    it("rolls the whole accept back when a framework does not exist, so that it can be tried again", async () => {
      const { owner } = await seedTwoTenantContexts(3);
      const {
        inserted: [finding],
      } = await seedFindings(owner);

      const res = await owner.request
        .post(acceptUrl(finding.id))
        .send({ risk_description: "An edited description", frameworks: [987654321] });

      // The failed link aborts the transaction: no risk, no history, the finding is still pending.
      expect(res.status).toBe(500);
      expect(await findingOf(finding.id)).toEqual(PENDING);
      await expectRegisterUntouched();
      expect(await countAll("frameworks_vendorrisks")).toBe(0);

      const again = await owner.request
        .post(acceptUrl(finding.id))
        .send({ risk_description: "An edited description" });
      expect(again.status).toBe(200);
      expect((await risksOf(owner.orgId))[0].risk_description).toBe("An edited description");
    });

    it("does not let an edit reach a finding of another organization", async () => {
      const { owner, attacker } = await seedTwoTenantContexts(3);
      const {
        inserted: [finding],
      } = await seedFindings(owner);

      const res = await attacker.request
        .post(acceptUrl(finding.id))
        .send({ risk_description: "Edited by a stranger" });

      expect(res.status).toBe(404);
      expect(await findingOf(finding.id)).toEqual(PENDING);
      await expectRegisterUntouched();
    });
  });

  it("gives one answer 200 and the other 409 when two accepts arrive together, and creates one risk", async () => {
    const { owner } = await seedTwoTenantContexts(3);
    const {
      inserted: [finding],
    } = await seedFindings(owner);

    const [first, second] = await Promise.all([
      owner.request.post(acceptUrl(finding.id)),
      owner.request.post(acceptUrl(finding.id)),
    ]);

    // A smoke test: which request wins is a race, and the loser is refused either at the lock or at
    // the status check, both as 409. That the lock holds is proved by the test below, which holds it.
    expect([first.status, second.status].sort()).toEqual([200, 409]);
    const winner = first.status === 200 ? first : second;
    const risks = await risksOf(owner.orgId);
    expect(risks.map((risk) => risk.id)).toEqual([winner.body.data.vendorRisk.id]);
    expect(await findingOf(finding.id)).toMatchObject({
      status: "accepted",
      accepted_vendor_risk_id: risks[0].id,
    });
    expect(recomputeJobs()).toHaveLength(1);
  });

  it("answers 409 at once while another decision holds the finding, creating no risk", async () => {
    const { owner } = await seedTwoTenantContexts(3);
    const {
      vendorId,
      inserted: [finding],
    } = await seedFindings(owner);

    // Another decision holds the row lock of the finding, as an accept does between its read and its
    // commit. The accept does not queue behind it: a transaction that waits keeps its pooled
    // connection while the one it waits for may still need more, and the pool could run dry. It is
    // refused as a finding that is being decided, and the holder stays locked until the very end.
    const decision = await startDecision(finding.id);
    let pending: Promise<{ status: number }> | undefined;
    try {
      pending = owner.request.post(acceptUrl(finding.id)).then((res) => res);

      const res = await answerOf(pending);

      expect(res?.status).toBe(409);
      // The answer came while the other decision still held the lock: it did not wait for it.
      expect(await isHeldByAnother(finding.id)).toBe(true);
      expect(await risksOf(owner.orgId)).toHaveLength(0);
      expect(await findingOf(finding.id)).toEqual(PENDING);
      expect(recomputeJobs()).toHaveLength(0);
      expect(notifyUserAssigned).not.toHaveBeenCalled();

      // The other decision accepts the finding into a risk of its own and lets go: that risk is the
      // only one, and the finding is its.
      const heldRisk = await createTestVendorRisk(owner.orgId, { vendor_id: vendorId });
      await decision.commitAccepted(owner, heldRisk);

      expect((await risksOf(owner.orgId)).map((risk) => risk.id)).toEqual([heldRisk]);
      expect(await findingOf(finding.id)).toMatchObject({
        status: "accepted",
        accepted_vendor_risk_id: heldRisk,
      });
      expect(recomputeJobs()).toHaveLength(0);
    } finally {
      await decision.release();
      // Never leave a request running into the next test.
      await pending?.catch(() => undefined);
    }
  });

  it("accepts the finding after a refusal at the lock once the other decision let go without deciding", async () => {
    const { owner } = await seedTwoTenantContexts(3);
    const {
      inserted: [finding],
    } = await seedFindings(owner);

    const decision = await startDecision(finding.id);
    let pending: Promise<{ status: number }> | undefined;
    try {
      pending = owner.request.post(acceptUrl(finding.id)).then((res) => res);
      expect((await answerOf(pending))?.status).toBe(409);
      expect(await findingOf(finding.id)).toEqual(PENDING);
    } finally {
      await decision.release();
      await pending?.catch(() => undefined);
    }

    // Positive control: the 409 came from the lock and left nothing behind, so the same request
    // now goes through and creates the one risk.
    const res = await owner.request.post(acceptUrl(finding.id));

    expect(res.status).toBe(200);
    const risks = await risksOf(owner.orgId);
    expect(risks.map((risk) => risk.id)).toEqual([res.body.data.vendorRisk.id]);
    expect(await findingOf(finding.id)).toMatchObject({
      status: "accepted",
      accepted_vendor_risk_id: risks[0].id,
    });
    expect(recomputeJobs()).toHaveLength(1);
  });

  it("answers 409 for a finding that was decided before, and creates nothing", async () => {
    const { owner } = await seedTwoTenantContexts(3);
    const {
      inserted: [accepted, dismissed],
    } = await seedFindings(owner);
    const first = await owner.request.post(acceptUrl(accepted.id));
    expect(first.status).toBe(200);
    const dismissal = await owner.request.post(dismissUrl(dismissed.id)).send({ reason: "other" });
    expect(dismissal.status).toBe(200);
    jest.clearAllMocks();
    const risksBefore = await risksOf(owner.orgId);

    const again = await owner.request.post(acceptUrl(accepted.id));
    const afterDismissal = await owner.request.post(acceptUrl(dismissed.id));

    expect(again.status).toBe(409);
    expect(afterDismissal.status).toBe(409);
    // The convention of the codebase: the status says it, there is no `code`.
    expect(again.body).toEqual({ message: "Conflict", data: expect.any(String) });
    expect(await risksOf(owner.orgId)).toEqual(risksBefore);
    expect(await findingOf(dismissed.id)).toMatchObject({
      status: "dismissed",
      dismissed_reason: "other",
      accepted_vendor_risk_id: null,
    });
    expect(recomputeJobs()).toHaveLength(0);
    expect(notifyUserAssigned).not.toHaveBeenCalled();
  });

  it("answers 404 for a finding that does not exist, and 400 for an id that is not a number", async () => {
    const { owner } = await seedTwoTenantContexts(3);
    const {
      inserted: [finding],
    } = await seedFindings(owner);
    // Positive control: the route works for a real finding.
    expect((await owner.request.post(acceptUrl(finding.id))).status).toBe(200);
    jest.clearAllMocks();
    const risksBefore = await risksOf(owner.orgId);

    expect((await owner.request.post(acceptUrl(987654321))).status).toBe(404);
    // The largest id a number holds exactly is far beyond the ids of the table: still not found.
    expect((await owner.request.post(acceptUrl(Number.MAX_SAFE_INTEGER))).status).toBe(404);
    for (const id of ["abc", "0", "-3", "1.5", "7abc", "1e3", "9".repeat(309)]) {
      const res = await owner.request.post(acceptUrl(id));
      expect({ id, status: res.status }).toEqual({ id, status: 400 });
    }

    expect(await risksOf(owner.orgId)).toEqual(risksBefore);
    expect(recomputeJobs()).toHaveLength(0);
  });

  it.each([
    [2, "Reviewer"],
    [4, "Auditor"],
  ])("refuses the role %i (%s) with 403, and changes nothing", async (roleId) => {
    const { owner } = await seedTwoTenantContexts(roleId);
    const {
      inserted: [finding, other],
    } = await seedFindings(owner);
    // Positive control: an Editor of the same organization can accept, so the 403 below is not a
    // missing route or a finding that cannot be accepted.
    const editor = await requestAs("Editor", owner);
    const control = await editor.post(acceptUrl(other.id));
    expect(control.status).toBe(200);
    jest.clearAllMocks();
    const risksBefore = await risksOf(owner.orgId);

    const denied = await owner.request.post(acceptUrl(finding.id));

    expect(denied.status).toBe(403);
    expect(await findingOf(finding.id)).toEqual(PENDING);
    expect(await risksOf(owner.orgId)).toEqual(risksBefore);
    expect(recomputeJobs()).toHaveLength(0);
    expect(notifyUserAssigned).not.toHaveBeenCalled();
  });

  it("does not let another organization accept a finding, and changes nothing", async () => {
    const { owner, attacker } = await seedTwoTenantContexts(3);
    const {
      inserted: [finding],
    } = await seedFindings(owner);

    const denied = await attacker.request.post(acceptUrl(finding.id));
    const deniedWithOwner = await attacker.request
      .post(acceptUrl(finding.id))
      .send({ action_owner: attacker.userId });

    expect(denied.status).toBe(404);
    expect(deniedWithOwner.status).toBe(404);
    expect(await findingOf(finding.id)).toEqual(PENDING);
    await expectRegisterUntouched();

    // Positive control: the owner accepts the very same finding.
    const accepted = await owner.request.post(acceptUrl(finding.id));
    expect(accepted.status).toBe(200);
    expect(await risksOf(attacker.orgId)).toEqual([]);
    expect((await risksOf(owner.orgId)).map((risk) => risk.id)).toEqual([
      accepted.body.data.vendorRisk.id,
    ]);
  });

  it("does not accept a finding of the organization that points at another organization's vendor", async () => {
    const { owner, attacker } = await seedTwoTenantContexts(3);
    const {
      vendorId,
      inserted: [finding],
    } = await seedFindings(owner);
    // No foreign key ties a finding's organization to its vendor's, so the database accepts a
    // copy of the owner's finding stamped with the attacker's organization.
    const [stray] = await rows<{ id: number }>(
      `INSERT INTO vendor_risk_findings
         (organization_id, vendor_id, run_id, category, risk_description, impact_description,
          action_plan, likelihood, risk_severity, risk_level, sources)
       SELECT :organizationId, vendor_id, run_id, category, risk_description, impact_description,
              action_plan, likelihood, risk_severity, risk_level, sources
       FROM vendor_risk_findings WHERE id = :findingId
       RETURNING id`,
      { organizationId: attacker.orgId, findingId: finding.id },
    );
    // Positive control: the row is the attacker's own, and it names the owner's vendor.
    const [strayRow] = await rows<{ organization_id: number; vendor_id: number }>(
      "SELECT organization_id, vendor_id FROM vendor_risk_findings WHERE id = :id",
      { id: stray.id },
    );
    expect(strayRow).toEqual({ organization_id: attacker.orgId, vendor_id: vendorId });

    const res = await attacker.request.post(acceptUrl(stray.id));

    // The vendor is not the attacker's, so it is not found: no risk is created for it.
    expect(res.status).toBe(404);
    expect(await findingOf(stray.id)).toEqual(PENDING);
    await expectRegisterUntouched();

    // Positive control: the owner accepts its own finding at the same route, so the 404 above is
    // not a missing route.
    const control = await owner.request.post(acceptUrl(finding.id));
    expect(control.status).toBe(200);
    expect((await risksOf(attacker.orgId)).length).toBe(0);
  });

  it("rolls the whole accept back when the finding cannot be marked, so that it can be tried again", async () => {
    const { owner } = await seedTwoTenantContexts(3);
    const {
      vendorId,
      inserted: [finding],
    } = await seedFindings(owner);
    await setAssignee(vendorId, owner.userId);
    const failing = jest
      .spyOn(researchUtils, "markFindingAcceptedQuery")
      .mockRejectedValueOnce(new Error("update failed"));
    try {
      const res = await owner.request.post(acceptUrl(finding.id));
      expect(res.status).toBe(500);
      expect(failing).toHaveBeenCalledTimes(1);
    } finally {
      failing.mockRestore();
    }

    // The risk had been inserted by then; the rollback takes it, its history and its effects away.
    expect(await findingOf(finding.id)).toEqual(PENDING);
    await expectRegisterUntouched();

    const retry = await owner.request.post(acceptUrl(finding.id));
    expect(retry.status).toBe(200);
    expect(await risksOf(owner.orgId)).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// POST /api/v1/vendor-risk-findings/:id/dismiss
// ---------------------------------------------------------------------------

describe("POST /api/v1/vendor-risk-findings/:id/dismiss", () => {
  it("dismisses a pending finding with a reason and a note, and a second dismissal is 409", async () => {
    const { owner } = await seedTwoTenantContexts(3);
    const {
      inserted: [finding, bystander],
    } = await seedFindings(owner);

    const res = await owner.request
      .post(dismissUrl(finding.id))
      .send({ reason: "already_covered", note: "Tracked in the register already." });

    expect(res.status).toBe(200);
    expect(res.body.message).toBe("OK");
    expect(res.body.data).toMatchObject({
      id: finding.id,
      status: "dismissed",
      dismissed_reason: "already_covered",
      dismissed_note: "Tracked in the register already.",
      decided_by: owner.userId,
      accepted_vendor_risk_id: null,
    });
    expect(res.body.data.decided_at).toEqual(expect.any(String));
    const stored = await findingOf(finding.id);
    expect(stored).toMatchObject({
      status: "dismissed",
      dismissed_reason: "already_covered",
      dismissed_note: "Tracked in the register already.",
      decided_by: owner.userId,
    });
    expect(stored.decided_at).toBeInstanceOf(Date);
    expect(await findingOf(bystander.id)).toEqual(PENDING);
    // Dismissing writes nothing to the register.
    await expectRegisterUntouched();

    const again = await owner.request
      .post(dismissUrl(finding.id))
      .send({ reason: "other", note: "Second thoughts." });

    expect(again.status).toBe(409);
    expect(again.body).toEqual({ message: "Conflict", data: expect.any(String) });
    // The first decision stands.
    expect(await findingOf(finding.id)).toEqual(stored);
  });

  it("is 409 for a finding that was accepted, which stays accepted", async () => {
    const { owner } = await seedTwoTenantContexts(3);
    const {
      inserted: [finding],
    } = await seedFindings(owner);
    const accepted = await owner.request.post(acceptUrl(finding.id));
    expect(accepted.status).toBe(200);
    const stored = await findingOf(finding.id);

    const res = await owner.request.post(dismissUrl(finding.id)).send({ reason: "other" });

    expect(res.status).toBe(409);
    expect(await findingOf(finding.id)).toEqual(stored);
  });

  it("waits for an accept that is being made and then answers 409, leaving the finding accepted", async () => {
    const { owner } = await seedTwoTenantContexts(3);
    const {
      vendorId,
      inserted: [finding],
    } = await seedFindings(owner);

    const decision = await startDecision(finding.id);
    try {
      const pending = owner.request
        .post(dismissUrl(finding.id))
        .send({ reason: "other", note: "Not relevant." })
        .then((res) => res);

      expect(await isStillWaiting(pending)).toBe(true);
      expect(await findingOf(finding.id)).toEqual(PENDING);

      const heldRisk = await createTestVendorRisk(owner.orgId, { vendor_id: vendorId });
      await decision.commitAccepted(owner, heldRisk);

      const res = await pending;
      expect(res.status).toBe(409);
      // The accept stands: the dismissal did not overwrite it.
      expect(await findingOf(finding.id)).toMatchObject({
        status: "accepted",
        accepted_vendor_risk_id: heldRisk,
        dismissed_reason: null,
        dismissed_note: null,
      });
    } finally {
      await decision.release();
    }
  });

  it("takes every reason, and a note is optional", async () => {
    const { owner } = await seedTwoTenantContexts(3);
    // The list the service accepts is the list the CHECK constraint of the column must take.
    const reasons = [...DISMISS_REASONS];
    const { inserted } = await seedFindings(
      owner,
      "Acme Corp",
      reasons.map((reason) => ({ ...FINDING, risk_description: `Finding for ${reason}` })),
    );

    for (const [index, reason] of reasons.entries()) {
      const res = await owner.request.post(dismissUrl(inserted[index].id)).send({ reason });
      expect({ reason, status: res.status }).toEqual({ reason, status: 200 });
      expect(await findingOf(inserted[index].id)).toMatchObject({
        status: "dismissed",
        dismissed_reason: reason,
        dismissed_note: null,
      });
    }
  });

  it("takes a note of null as no note: the finding is dismissed and no note is stored", async () => {
    const { owner } = await seedTwoTenantContexts(3);
    const {
      inserted: [finding],
    } = await seedFindings(owner);

    const res = await owner.request
      .post(dismissUrl(finding.id))
      .send({ reason: "not_applicable", note: null });

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      id: finding.id,
      status: "dismissed",
      dismissed_reason: "not_applicable",
      dismissed_note: null,
    });
    expect(await findingOf(finding.id)).toMatchObject({
      status: "dismissed",
      dismissed_reason: "not_applicable",
      dismissed_note: null,
      decided_by: owner.userId,
    });
  });

  it("stores the note trimmed and cleaned: without a NUL, which Postgres refuses, and null when nothing is left", async () => {
    const { owner } = await seedTwoTenantContexts(3);
    const { inserted } = await seedFindings(owner);
    const noteOf = async (note: string, finding: { id: number }) => {
      const res = await owner.request.post(dismissUrl(finding.id)).send({ reason: "other", note });
      return { status: res.status, stored: (await findingOf(finding.id)).dismissed_note };
    };

    // The NUL travels in the JSON body as an escape, as a browser would send it.
    expect(await noteOf("Vendor\u0000 confirmed it is fixed.", inserted[0])).toEqual({
      status: 200,
      stored: "Vendor confirmed it is fixed.",
    });
    expect(await noteOf("   padded   ", inserted[1])).toEqual({ status: 200, stored: "padded" });
    expect(await noteOf("  \u0000 \t ", inserted[2])).toEqual({ status: 200, stored: null });
  });

  it("limits the note to 500 characters, counted as the database counts them", async () => {
    const { owner } = await seedTwoTenantContexts(3);
    const { inserted } = await seedFindings(owner);
    const [fits, tooLong, astral] = inserted;
    const dismiss = (finding: { id: number }, note: string) =>
      owner.request.post(dismissUrl(finding.id)).send({ reason: "other", note });

    const exactly = await dismiss(fits, "n".repeat(500));
    const over = await dismiss(tooLong, "n".repeat(501));
    // 500 emoji are 500 characters to the database and 1000 units to String.length.
    const emoji = await dismiss(astral, "\u{1F600}".repeat(500));

    expect(exactly.status).toBe(200);
    expect(over.status).toBe(400);
    expect(emoji.status).toBe(200);
    expect(await findingOf(tooLong.id)).toEqual(PENDING);
    const [stored] = await rows<{ length: number }>(
      "SELECT char_length(dismissed_note) AS length FROM vendor_risk_findings WHERE id = :id",
      { id: astral.id },
    );
    expect(stored.length).toBe(500);

    // More than 1000 units cannot be 500 characters or fewer: refused, whatever the characters.
    const [first, second] = (await seedFindings(owner, "Globex")).inserted;
    expect((await dismiss(first, "n".repeat(1001))).status).toBe(400);
    expect((await dismiss(second, "\u{1F600}".repeat(501))).status).toBe(400);
    expect(await findingOf(first.id)).toEqual(PENDING);
    expect(await findingOf(second.id)).toEqual(PENDING);
  });

  it("answers 400 for a reason or a note that is not valid, and for an id that is not a number", async () => {
    const { owner } = await seedTwoTenantContexts(3);
    const {
      inserted: [finding],
    } = await seedFindings(owner);
    const attempts: Array<[string, string | number, Record<string, unknown> | undefined]> = [
      ["no body", finding.id, undefined],
      ["no reason", finding.id, { note: "A note." }],
      ["an unknown reason", finding.id, { reason: "because" }],
      ["a reason in capitals", finding.id, { reason: "OTHER" }],
      ["a reason that is a number", finding.id, { reason: 5 }],
      ["a note that is a number", finding.id, { reason: "other", note: 5 }],
      ["an id that is not a number", "abc", { reason: "other" }],
      ["an id of 309 digits", "9".repeat(309), { reason: "other" }],
    ];

    for (const [name, id, body] of attempts) {
      const req = owner.request.post(dismissUrl(id));
      const res = await (body === undefined ? req : req.send(body));
      expect({ name, status: res.status }).toEqual({ name, status: 400 });
    }
    expect(await findingOf(finding.id)).toEqual(PENDING);

    // Positive control: the same finding is dismissed by a valid request.
    const ok = await owner.request.post(dismissUrl(finding.id)).send({ reason: "other" });
    expect(ok.status).toBe(200);
  });

  it("answers 404 for a finding that does not exist", async () => {
    const { owner } = await seedTwoTenantContexts(3);
    const {
      inserted: [finding],
    } = await seedFindings(owner);
    // Positive control: the route works for a real finding.
    expect(
      (await owner.request.post(dismissUrl(finding.id)).send({ reason: "other" })).status,
    ).toBe(200);

    const res = await owner.request.post(dismissUrl(987654321)).send({ reason: "other" });
    const huge = await owner.request
      .post(dismissUrl(Number.MAX_SAFE_INTEGER))
      .send({ reason: "other" });

    expect(res.status).toBe(404);
    expect(huge.status).toBe(404);
  });

  it.each([
    [2, "Reviewer"],
    [4, "Auditor"],
  ])("refuses the role %i (%s) with 403, and changes nothing", async (roleId) => {
    const { owner } = await seedTwoTenantContexts(roleId);
    const {
      inserted: [finding, other],
    } = await seedFindings(owner);
    // Positive control: an Editor of the same organization can dismiss.
    const editor = await requestAs("Editor", owner);
    const control = await editor.post(dismissUrl(other.id)).send({ reason: "other" });
    expect(control.status).toBe(200);

    const denied = await owner.request.post(dismissUrl(finding.id)).send({ reason: "other" });

    expect(denied.status).toBe(403);
    expect(await findingOf(finding.id)).toEqual(PENDING);
  });

  it("does not let another organization dismiss a finding, and changes nothing", async () => {
    const { owner, attacker } = await seedTwoTenantContexts(3);
    const {
      inserted: [finding],
    } = await seedFindings(owner);

    const denied = await attacker.request
      .post(dismissUrl(finding.id))
      .send({ reason: "other", note: "Not ours." });

    expect(denied.status).toBe(404);
    expect(await findingOf(finding.id)).toEqual(PENDING);

    // Positive control: the owner dismisses the very same finding.
    const dismissed = await owner.request.post(dismissUrl(finding.id)).send({ reason: "other" });
    expect(dismissed.status).toBe(200);
    expect(await findingOf(finding.id)).toMatchObject({
      status: "dismissed",
      decided_by: owner.userId,
      dismissed_note: null,
    });
  });
});
