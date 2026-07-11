jest.setTimeout(60000);

import { QueryTypes } from "sequelize";
import { sequelize } from "../../../database/db";
import { cleanupDatabase, createTestUser } from "../helpers";
import { seedTwoTenantContexts } from "./tenantIsolation.harness";
import {
  createTestModelInventory,
  createTestMrmModelRole,
  createTestMrmValidation,
  createTestMrmFinding,
} from "../../factories";
import {
  getAlertExtraRecipientsQuery,
  getAlertRecipientsUnion,
  getOrgMemberIdsQuery,
  maybeAutoOpenFindingForBreach,
  replaceAlertRecipientsQuery,
} from "../../../utils/mrmAlerts.utils";
import {
  MrmEvalStatus,
  MrmThresholdSeverity,
} from "../../../domain.layer/enums/mrmMonitoring.enum";
import { runRevalidationSweep } from "../../../services/automations/actions/mrmRevalidationSweep";
import { sendInAppNotification } from "../../../services/inAppNotification.service";

/**
 * MRM alerts — tenant isolation for recipient storage, the recipient union,
 * the settings API partial semantics (Task 4 section), the breach auto-finding
 * dedup contract (Task 5 section), and the overdue-alert claim (Task 8 section).
 */

describe("MRM alert recipients tenant isolation", () => {
  afterEach(async () => {
    await cleanupDatabase();
  });

  it("stores, replaces and scopes extra recipients per org", async () => {
    const { owner, attacker } = await seedTwoTenantContexts();
    const extraA = await createTestUser(
      owner.orgId,
      3,
      `extra-a-${Date.now()}@test.com`,
      "Password123!",
    );

    await replaceAlertRecipientsQuery(owner.orgId, [extraA, owner.userId]);
    expect(await getAlertExtraRecipientsQuery(owner.orgId)).toEqual(
      [extraA, owner.userId].sort((a, b) => a - b),
    );
    // The other org sees nothing.
    expect(await getAlertExtraRecipientsQuery(attacker.orgId)).toEqual([]);

    // Wholesale replace, including down to empty.
    await replaceAlertRecipientsQuery(owner.orgId, [owner.userId]);
    expect(await getAlertExtraRecipientsQuery(owner.orgId)).toEqual([owner.userId]);
    await replaceAlertRecipientsQuery(owner.orgId, []);
    expect(await getAlertExtraRecipientsQuery(owner.orgId)).toEqual([]);
  });

  it("getOrgMemberIdsQuery only returns ids belonging to the org", async () => {
    const { owner, attacker } = await seedTwoTenantContexts();
    const members = await getOrgMemberIdsQuery(owner.orgId, [owner.userId, attacker.userId]);
    expect(members).toEqual([owner.userId]);
    expect(await getOrgMemberIdsQuery(owner.orgId, [])).toEqual([]);
  });

  it("unions model-role recipients with org extras, deduped", async () => {
    const { owner } = await seedTwoTenantContexts();
    const modelId = await createTestModelInventory(owner.orgId);
    await createTestMrmModelRole(owner.orgId, modelId, owner.userId, { role: "owner" });
    const extra = await createTestUser(
      owner.orgId,
      3,
      `extra-u-${Date.now()}@test.com`,
      "Password123!",
    );
    // Overlap: the owner is ALSO an extra recipient — must appear once.
    await replaceAlertRecipientsQuery(owner.orgId, [owner.userId, extra]);

    const union = await getAlertRecipientsUnion(owner.orgId, modelId);
    expect([...union].sort((a, b) => a - b)).toEqual([owner.userId, extra].sort((a, b) => a - b));
  });
});

describe("MRM settings API partial semantics", () => {
  afterEach(async () => {
    await cleanupDatabase();
  });

  it("GET returns defaults incl. empty recipients; org B never sees org A's config", async () => {
    const { owner, attacker } = await seedTwoTenantContexts();

    const res = await owner.request.get("/api/mrm/settings");
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({
      organization_id: owner.orgId,
      retention_months: 25,
      alert_email_enabled: false,
      breach_auto_open_finding: false,
      alert_recipients: [],
    });

    const put = await owner.request.put("/api/mrm/settings").send({
      alert_email_enabled: true,
      breach_auto_open_finding: true,
      alert_recipients: [owner.userId],
    });
    expect(put.status).toBe(200);
    expect(put.body.data.alert_email_enabled).toBe(true);
    expect(put.body.data.alert_recipients).toEqual([owner.userId]);

    const attackerView = await attacker.request.get("/api/mrm/settings");
    expect(attackerView.status).toBe(200);
    expect(attackerView.body.data.alert_email_enabled).toBe(false);
    expect(attackerView.body.data.alert_recipients).toEqual([]);
  });

  it("PUT is partial: a retention-only body never touches alert fields", async () => {
    const { owner } = await seedTwoTenantContexts();
    await owner.request.put("/api/mrm/settings").send({ alert_email_enabled: true });

    const res = await owner.request.put("/api/mrm/settings").send({ retention_months: 36 });
    expect(res.status).toBe(200);
    expect(res.body.data.retention_months).toBe(36);
    expect(res.body.data.alert_email_enabled).toBe(true); // untouched
  });

  it("PUT rejects invalid bodies with 400", async () => {
    const { owner, attacker } = await seedTwoTenantContexts();

    expect((await owner.request.put("/api/mrm/settings").send({})).status).toBe(400);
    expect(
      (await owner.request.put("/api/mrm/settings").send({ retention_months: 6 })).status,
    ).toBe(400);
    expect(
      (await owner.request.put("/api/mrm/settings").send({ alert_email_enabled: "yes" })).status,
    ).toBe(400);
    expect(
      (await owner.request.put("/api/mrm/settings").send({ alert_recipients: [1.5] })).status,
    ).toBe(400);
    // A user id from another org is rejected — and nothing was stored.
    expect(
      (await owner.request.put("/api/mrm/settings").send({ alert_recipients: [attacker.userId] }))
        .status,
    ).toBe(400);
    expect(await getAlertExtraRecipientsQuery(owner.orgId)).toEqual([]);
  });
});

const findingRows = async (
  orgId: number,
): Promise<{ id: number; auto_metric: string | null; stage: string }[]> =>
  (await sequelize.query(
    `SELECT id, auto_metric, stage FROM mrm_findings
      WHERE organization_id = :orgId ORDER BY id ASC`,
    { replacements: { orgId }, type: QueryTypes.SELECT },
  )) as { id: number; auto_metric: string | null; stage: string }[];

describe("MRM breach auto-open finding", () => {
  afterEach(async () => {
    await cleanupDatabase();
  });

  it("skips when the toggle is off or the status is only a warning", async () => {
    const { owner } = await seedTwoTenantContexts();
    const modelId = await createTestModelInventory(owner.orgId);

    expect(
      await maybeAutoOpenFindingForBreach(
        owner.orgId,
        modelId,
        "psi",
        MrmEvalStatus.BREACH,
        MrmThresholdSeverity.CRITICAL,
        false,
      ),
    ).toBeNull();
    expect(
      await maybeAutoOpenFindingForBreach(
        owner.orgId,
        modelId,
        "psi",
        MrmEvalStatus.WARN,
        MrmThresholdSeverity.WARN,
        true,
      ),
    ).toBeNull();
    expect(await findingRows(owner.orgId)).toEqual([]);
  });

  it("opens one finding with auto_metric, mapped severity, validation link and owner", async () => {
    const { owner } = await seedTwoTenantContexts();
    const modelId = await createTestModelInventory(owner.orgId);
    await createTestMrmModelRole(owner.orgId, modelId, owner.userId, { role: "owner" });
    const validationId = await createTestMrmValidation(owner.orgId, modelId);

    const findingId = await maybeAutoOpenFindingForBreach(
      owner.orgId,
      modelId,
      "psi",
      MrmEvalStatus.BREACH,
      MrmThresholdSeverity.CRITICAL,
      true,
    );
    expect(findingId).not.toBeNull();

    const rows = (await sequelize.query(
      `SELECT title, severity, stage, auto_metric, validation_id, owner_id
         FROM mrm_findings WHERE id = :id`,
      { replacements: { id: findingId }, type: QueryTypes.SELECT },
    )) as any[];
    expect(rows[0]).toMatchObject({
      title: "Metric breach: psi",
      severity: "critical",
      stage: "open",
      auto_metric: "psi",
      validation_id: validationId,
      owner_id: owner.userId,
    });
  });

  it("dedups repeats of the same metric while in flight (incl. within-batch)", async () => {
    const { owner } = await seedTwoTenantContexts();
    const modelId = await createTestModelInventory(owner.orgId);

    const first = await maybeAutoOpenFindingForBreach(
      owner.orgId,
      modelId,
      "psi",
      MrmEvalStatus.BREACH,
      MrmThresholdSeverity.HIGH,
      true,
    );
    // A batch with two breaching points of the same metric runs serially —
    // the second call hits the just-created in-flight finding and skips.
    const second = await maybeAutoOpenFindingForBreach(
      owner.orgId,
      modelId,
      "psi",
      MrmEvalStatus.BREACH,
      MrmThresholdSeverity.HIGH,
      true,
    );
    expect(first).not.toBeNull();
    expect(second).toBeNull();
    // A different metric opens its own finding.
    const other = await maybeAutoOpenFindingForBreach(
      owner.orgId,
      modelId,
      "auc",
      MrmEvalStatus.BREACH,
      MrmThresholdSeverity.HIGH,
      true,
    );
    expect(other).not.toBeNull();
    expect((await findingRows(owner.orgId)).length).toBe(2);
  });

  it("re-opens after the auto-finding is closed; human findings never block dedup", async () => {
    const { owner } = await seedTwoTenantContexts();
    const modelId = await createTestModelInventory(owner.orgId);
    // A HUMAN finding on the same model (auto_metric NULL) must not block.
    await createTestMrmFinding(owner.orgId, modelId, { title: "Human finding" });

    const first = await maybeAutoOpenFindingForBreach(
      owner.orgId,
      modelId,
      "psi",
      MrmEvalStatus.BREACH,
      MrmThresholdSeverity.HIGH,
      true,
    );
    expect(first).not.toBeNull();

    await sequelize.query(`UPDATE mrm_findings SET stage = 'closed' WHERE id = :id`, {
      replacements: { id: first },
    });
    const reopened = await maybeAutoOpenFindingForBreach(
      owner.orgId,
      modelId,
      "psi",
      MrmEvalStatus.BREACH,
      MrmThresholdSeverity.HIGH,
      true,
    );
    expect(reopened).not.toBeNull();
    expect(reopened).not.toBe(first);
  });

  it("dedup is org-scoped: org B opens its own finding for the same metric", async () => {
    const { owner, attacker } = await seedTwoTenantContexts();
    const modelA = await createTestModelInventory(owner.orgId);
    const modelB = await createTestModelInventory(attacker.orgId);

    await maybeAutoOpenFindingForBreach(
      owner.orgId,
      modelA,
      "psi",
      MrmEvalStatus.BREACH,
      MrmThresholdSeverity.HIGH,
      true,
    );
    const bFinding = await maybeAutoOpenFindingForBreach(
      attacker.orgId,
      modelB,
      "psi",
      MrmEvalStatus.BREACH,
      MrmThresholdSeverity.HIGH,
      true,
    );
    expect(bFinding).not.toBeNull();
    expect((await findingRows(owner.orgId)).length).toBe(1);
    expect((await findingRows(attacker.orgId)).length).toBe(1);
  });
});

describe("MRM overdue-validation alert (once-per-lifecycle claim)", () => {
  const mockSend = sendInAppNotification as jest.Mock;
  const PAST_DUE = "2026-01-01T00:00:00Z";

  beforeEach(() => {
    jest.clearAllMocks();
  });
  afterEach(async () => {
    await cleanupDatabase();
  });

  const overdueNotifiedAt = async (validationId: number): Promise<Date | null> => {
    const rows = (await sequelize.query(
      `SELECT overdue_notified_at FROM mrm_validations WHERE id = :validationId`,
      { replacements: { validationId }, type: QueryTypes.SELECT },
    )) as { overdue_notified_at: Date | null }[];
    return rows[0].overdue_notified_at;
  };

  it("notifies once on the first sweep, then stays silent on daily re-runs", async () => {
    const { owner } = await seedTwoTenantContexts();
    const modelId = await createTestModelInventory(owner.orgId);
    await createTestMrmModelRole(owner.orgId, modelId, owner.userId, { role: "owner" });
    const validationId = await createTestMrmValidation(owner.orgId, modelId, {
      next_due: PAST_DUE,
    });

    const summary = await runRevalidationSweep(owner.orgId);
    expect(summary.due).toBe(1);

    expect(mockSend).toHaveBeenCalledTimes(1);
    const [orgArg, notificationArg] = mockSend.mock.calls[0];
    expect(orgArg).toBe(owner.orgId);
    expect(notificationArg.type).toBe("mrm_revalidation_due");
    expect(notificationArg.user_id).toBe(owner.userId);
    expect(await overdueNotifiedAt(validationId)).not.toBeNull();

    // Tomorrow's sweep: same overdue validation, claim already taken — silent.
    jest.clearAllMocks();
    await runRevalidationSweep(owner.orgId);
    expect(mockSend).not.toHaveBeenCalled();
  });

  it("consumes the claim even with no recipients (no spam when roles arrive later)", async () => {
    const { owner } = await seedTwoTenantContexts();
    const modelId = await createTestModelInventory(owner.orgId);
    const validationId = await createTestMrmValidation(owner.orgId, modelId, {
      next_due: PAST_DUE,
    });

    await runRevalidationSweep(owner.orgId);
    expect(mockSend).not.toHaveBeenCalled();
    expect(await overdueNotifiedAt(validationId)).not.toBeNull();
  });

  it("org A's sweep never consumes org B's claim", async () => {
    const { owner, attacker } = await seedTwoTenantContexts();
    const modelB = await createTestModelInventory(attacker.orgId);
    const validationB = await createTestMrmValidation(attacker.orgId, modelB, {
      next_due: PAST_DUE,
    });

    await runRevalidationSweep(owner.orgId);
    expect(await overdueNotifiedAt(validationB)).toBeNull();
  });
});
