jest.setTimeout(60000);

import { cleanupDatabase } from "../helpers";
import { sequelize } from "../../../database/db";
import { QueryTypes } from "sequelize";
import { seedTwoTenantContexts } from "./tenantIsolation.harness";
import { createTestModelInventory, createTestMrmValidation } from "../../factories";
import { rescheduleNextReviewForTierQuery, signoffValidationQuery } from "../../../utils/mrm.utils";
import { runRevalidationSweep } from "../../../services/automations/actions/mrmRevalidationSweep";
import { MrmTier, MrmValidationOutcome } from "../../../domain.layer/enums/mrm.enum";

/**
 * MRM periodic review scheduling: sign-off sets next_due from the model's tier,
 * and the daily sweep opens the next validation once that date has passed. The
 * sweep is per organization, so one org's run never opens work for another.
 */

async function setTier(modelId: number, tier: string | null): Promise<void> {
  await sequelize.query(`UPDATE model_inventories SET mrm_tier = :tier WHERE id = :id`, {
    replacements: { id: modelId, tier },
  });
}

async function setStatus(modelId: number, status: string): Promise<void> {
  await sequelize.query(`UPDATE model_inventories SET status = :status WHERE id = :id`, {
    replacements: { id: modelId, status },
  });
}

/** A validated row signed off at `signedOffAt` whose next review fell due at `nextDue`. */
async function seedValidated(
  orgId: number,
  modelId: number,
  signedOffAt: Date,
  nextDue: Date,
): Promise<number> {
  const id = await createTestMrmValidation(orgId, modelId);
  await sequelize.query(
    `UPDATE mrm_validations
        SET stage = 'validated', outcome = 'validated', signed_off_at = :signedOffAt,
            next_due = :nextDue
      WHERE id = :id`,
    { replacements: { id, signedOffAt, nextDue } },
  );
  return id;
}

async function validationsFor(
  orgId: number,
  modelId: number,
): Promise<{ id: number; stage: string; next_due: Date | null }[]> {
  return (await sequelize.query(
    `SELECT id, stage, next_due FROM mrm_validations
      WHERE organization_id = :orgId AND model_inventory_id = :modelId
      ORDER BY id`,
    { replacements: { orgId, modelId }, type: QueryTypes.SELECT },
  )) as { id: number; stage: string; next_due: Date | null }[];
}

describe("MRM periodic review scheduling", () => {
  afterEach(async () => {
    await cleanupDatabase();
  });

  it("sets next_due at sign-off from the model's tier", async () => {
    const { owner } = await seedTwoTenantContexts();
    const tier1 = await createTestModelInventory(owner.orgId);
    const tier3 = await createTestModelInventory(owner.orgId);
    await setTier(tier1, "1");
    await setTier(tier3, "3");
    const v1 = await createTestMrmValidation(owner.orgId, tier1);
    const v3 = await createTestMrmValidation(owner.orgId, tier3);

    const signed1 = await signoffValidationQuery(v1, owner.orgId, {
      outcome: MrmValidationOutcome.VALIDATED,
      signed_off_by: owner.userId,
    });
    const signed3 = await signoffValidationQuery(v3, owner.orgId, {
      outcome: MrmValidationOutcome.VALIDATED,
      signed_off_by: owner.userId,
    });

    const months = (from: Date, to: Date) =>
      (to.getUTCFullYear() - from.getUTCFullYear()) * 12 + (to.getUTCMonth() - from.getUTCMonth());
    const [row1] = await validationsFor(owner.orgId, tier1);
    const [row3] = await validationsFor(owner.orgId, tier3);
    expect(row1.next_due).not.toBeNull();
    expect(row3.next_due).not.toBeNull();
    expect(months(new Date(signed1!.signed_off_at!), new Date(row1.next_due!))).toBe(12);
    expect(months(new Date(signed3!.signed_off_at!), new Date(row3.next_due!))).toBe(24);
  });

  it("leaves next_due empty when the model has no tier", async () => {
    const { owner } = await seedTwoTenantContexts();
    const modelId = await createTestModelInventory(owner.orgId);
    const v = await createTestMrmValidation(owner.orgId, modelId);

    await signoffValidationQuery(v, owner.orgId, {
      outcome: MrmValidationOutcome.VALIDATED,
      signed_off_by: owner.userId,
    });

    const [row] = await validationsFor(owner.orgId, modelId);
    expect(row.next_due).toBeNull();
  });

  it("keeps a future due date on an untiered model at sign-off and clears a past one", async () => {
    const { owner } = await seedTwoTenantContexts();
    const futureModel = await createTestModelInventory(owner.orgId);
    const pastModel = await createTestModelInventory(owner.orgId);
    const future = new Date(Date.now() + 90 * 24 * 3600 * 1000);
    const vf = await createTestMrmValidation(owner.orgId, futureModel, {
      next_due: future.toISOString(),
    });
    const vp = await createTestMrmValidation(owner.orgId, pastModel, {
      next_due: "2025-01-01T00:00:00Z",
    });

    for (const id of [vf, vp]) {
      await signoffValidationQuery(id, owner.orgId, {
        outcome: MrmValidationOutcome.VALIDATED,
        signed_off_by: owner.userId,
      });
    }

    const [rowF] = await validationsFor(owner.orgId, futureModel);
    const [rowP] = await validationsFor(owner.orgId, pastModel);
    expect(new Date(rowF.next_due!).toISOString()).toBe(future.toISOString());
    expect(rowP.next_due).toBeNull();
  });

  it("re-dates the next review from the last sign-off when the tier changes", async () => {
    const { owner, attacker } = await seedTwoTenantContexts();
    const modelId = await createTestModelInventory(owner.orgId);
    await setTier(modelId, "3");
    const signedOffAt = new Date("2025-01-15T00:00:00Z");
    await seedValidated(owner.orgId, modelId, signedOffAt, new Date("2027-01-15T00:00:00Z"));

    // Another organization cannot re-date it.
    const foreign = await sequelize.transaction((tx) =>
      rescheduleNextReviewForTierQuery(modelId, attacker.orgId, MrmTier.TIER_1, tx),
    );
    expect(foreign).toBeNull();

    const due = await sequelize.transaction((tx) =>
      rescheduleNextReviewForTierQuery(modelId, owner.orgId, MrmTier.TIER_1, tx),
    );
    expect(due?.toISOString()).toBe("2026-01-15T00:00:00.000Z");
    const [row] = await validationsFor(owner.orgId, modelId);
    expect(new Date(row.next_due!).toISOString()).toBe("2026-01-15T00:00:00.000Z");

    // The new date has passed, so the next sweep opens the review.
    const summary = await runRevalidationSweep(owner.orgId, new Date("2026-02-01T00:00:00Z"));
    expect(summary.opened).toBe(1);
  });

  it("does not sign off a validation from another organization", async () => {
    const { owner, attacker } = await seedTwoTenantContexts();
    const modelId = await createTestModelInventory(owner.orgId);
    await setTier(modelId, "1");
    const v = await createTestMrmValidation(owner.orgId, modelId);

    const signed = await signoffValidationQuery(v, attacker.orgId, {
      outcome: MrmValidationOutcome.VALIDATED,
      signed_off_by: attacker.userId,
    });

    expect(signed).toBeNull();
    const [row] = await validationsFor(owner.orgId, modelId);
    expect(row.stage).toBe("not_started");
    expect(row.next_due).toBeNull();
  });

  it("opens a revalidation for a lapsed model in its own organization only", async () => {
    const { owner, attacker } = await seedTwoTenantContexts();
    const modelId = await createTestModelInventory(owner.orgId);
    await setTier(modelId, "1");
    const nextDue = new Date("2026-01-15T00:00:00Z");
    await seedValidated(owner.orgId, modelId, new Date("2025-01-15T00:00:00Z"), nextDue);
    const now = new Date("2026-02-01T00:00:00Z");

    // The other organization's sweep must not touch this model.
    const other = await runRevalidationSweep(attacker.orgId, now);
    expect(other.opened).toBe(0);
    expect(await validationsFor(owner.orgId, modelId)).toHaveLength(1);

    const summary = await runRevalidationSweep(owner.orgId, now);
    expect(summary.opened).toBe(1);
    const rows = await validationsFor(owner.orgId, modelId);
    expect(rows).toHaveLength(2);
    expect(rows[1].stage).toBe("not_started");
    expect(new Date(rows[1].next_due!).toISOString()).toBe(nextDue.toISOString());

    // A second run finds the open validation and does not open another.
    const again = await runRevalidationSweep(owner.orgId, now);
    expect(again.opened).toBe(0);
    expect(await validationsFor(owner.orgId, modelId)).toHaveLength(2);
  });

  it("gives an open validation with no due date the missed date, and nudges it once", async () => {
    const { owner } = await seedTwoTenantContexts();
    const modelId = await createTestModelInventory(owner.orgId);
    await setTier(modelId, "1");
    const nextDue = new Date("2026-01-15T00:00:00Z");
    await seedValidated(owner.orgId, modelId, new Date("2025-01-15T00:00:00Z"), nextDue);
    // Opened by a breach or a manual start: no due date.
    const openId = await createTestMrmValidation(owner.orgId, modelId);
    const now = new Date("2026-02-01T00:00:00Z");
    const events = async () =>
      (
        (await sequelize.query(
          `SELECT id FROM mrm_revalidation_events
            WHERE organization_id = :orgId AND resulting_validation_id = :id`,
          { replacements: { orgId: owner.orgId, id: openId }, type: QueryTypes.SELECT },
        )) as unknown[]
      ).length;

    const first = await runRevalidationSweep(owner.orgId, now);
    expect(first).toMatchObject({ opened: 0, annotated: 1 });
    const rows = await validationsFor(owner.orgId, modelId);
    expect(rows).toHaveLength(2);
    expect(new Date(rows[1].next_due!).toISOString()).toBe(nextDue.toISOString());
    expect(await events()).toBe(1);

    // Now overdue and not started: annotated and alerted once more, then left alone.
    const second = await runRevalidationSweep(owner.orgId, now);
    expect(second.annotated).toBe(1);
    expect(await events()).toBe(2);

    const third = await runRevalidationSweep(owner.orgId, now);
    expect(third).toMatchObject({ due: 0, opened: 0, annotated: 0 });
    expect(await events()).toBe(2);
  });

  it("includes a lapsed model whose status is empty", async () => {
    const { owner } = await seedTwoTenantContexts();
    const modelId = await createTestModelInventory(owner.orgId);
    await setTier(modelId, "2");
    await sequelize.query(`UPDATE model_inventories SET status = NULL WHERE id = :id`, {
      replacements: { id: modelId },
    });
    await seedValidated(
      owner.orgId,
      modelId,
      new Date("2024-06-15T00:00:00Z"),
      new Date("2025-12-15T00:00:00Z"),
    );

    const summary = await runRevalidationSweep(owner.orgId, new Date("2026-02-01T00:00:00Z"));
    expect(summary.opened).toBe(1);
  });

  it("skips retired models and reviews not yet due", async () => {
    const { owner } = await seedTwoTenantContexts();
    const retired = await createTestModelInventory(owner.orgId);
    const notDue = await createTestModelInventory(owner.orgId);
    await setTier(retired, "1");
    await setTier(notDue, "1");
    await setStatus(retired, "Retired");
    await seedValidated(
      owner.orgId,
      retired,
      new Date("2025-01-15T00:00:00Z"),
      new Date("2026-01-15T00:00:00Z"),
    );
    await seedValidated(
      owner.orgId,
      notDue,
      new Date("2025-06-15T00:00:00Z"),
      new Date("2026-06-15T00:00:00Z"),
    );

    const summary = await runRevalidationSweep(owner.orgId, new Date("2026-02-01T00:00:00Z"));

    expect(summary.opened).toBe(0);
    expect(await validationsFor(owner.orgId, retired)).toHaveLength(1);
    expect(await validationsFor(owner.orgId, notDue)).toHaveLength(1);
  });
});
