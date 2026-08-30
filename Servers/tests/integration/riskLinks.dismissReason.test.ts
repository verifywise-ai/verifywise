jest.setTimeout(60000);

import { cleanupDatabase } from "./helpers";
import { sequelize } from "../../database/db";
import { seedTwoTenantContexts } from "./tenant-isolation/tenantIsolation.harness";
import { createTestRisk } from "../factories";
import { updateRiskLinkStatusQuery } from "../../utils/riskLink.utils";

afterEach(async () => {
  await cleanupDatabase();
});

/** Unqualified: search_path is `verifywise`. */
const seedSuggestion = async (orgId: number, a: number, b: number): Promise<number> => {
  const [rows]: any = await sequelize.query(
    `INSERT INTO risk_links
       (organization_id, source_risk_id, target_risk_id, relation_type, status, source)
     VALUES (:orgId, :a, :b, 'related_to', 'suggested', 'derived')
     RETURNING id`,
    { replacements: { orgId, a: Math.min(a, b), b: Math.max(a, b) } },
  );
  return rows[0].id;
};

const readDismissal = async (id: number) => {
  const [rows]: any = await sequelize.query(
    `SELECT dismiss_reason, dismiss_note, status FROM risk_links WHERE id = :id`,
    { replacements: { id } },
  );
  return rows[0];
};

describe("dismissal reasons across the undo round-trip", () => {
  it("clears both columns when a dismissal is undone and re-made without a reason", async () => {
    const { owner } = await seedTwoTenantContexts();
    const a = await createTestRisk(owner.orgId, {});
    const b = await createTestRisk(owner.orgId, {});
    const id = await seedSuggestion(owner.orgId, a, b);

    await updateRiskLinkStatusQuery(
      id, owner.orgId, "dismissed", owner.userId, "not_related", "nothing in common",
    );
    expect(await readDismissal(id)).toMatchObject({
      status: "dismissed",
      dismiss_reason: "not_related",
      dismiss_note: "nothing in common",
    });

    // Undo.
    await updateRiskLinkStatusQuery(id, owner.orgId, "suggested", null, null, null);
    expect(await readDismissal(id)).toMatchObject({
      status: "suggested",
      dismiss_reason: null,
      dismiss_note: null,
    });

    // Dismiss again, this time saying nothing. The first reason must NOT
    // come back. This is the assertion the whole task exists for.
    await updateRiskLinkStatusQuery(id, owner.orgId, "dismissed", owner.userId, null, null);
    expect(await readDismissal(id)).toMatchObject({
      status: "dismissed",
      dismiss_reason: null,
      dismiss_note: null,
    });
  });

  it("clears the reason when a dismissed link is confirmed", async () => {
    // A confirmed row carrying "these aren't actually related" would poison
    // the exact report C3 exists to feed.
    const { owner } = await seedTwoTenantContexts();
    const a = await createTestRisk(owner.orgId, {});
    const b = await createTestRisk(owner.orgId, {});
    const id = await seedSuggestion(owner.orgId, a, b);

    await updateRiskLinkStatusQuery(id, owner.orgId, "dismissed", owner.userId, "too_weak", null);
    await updateRiskLinkStatusQuery(id, owner.orgId, "confirmed", owner.userId, null, null);

    expect(await readDismissal(id)).toMatchObject({
      status: "confirmed",
      dismiss_reason: null,
      dismiss_note: null,
    });
  });

  it("never overwrites another organization's dismissal reason", async () => {
    const { owner, attacker } = await seedTwoTenantContexts();
    const a = await createTestRisk(owner.orgId, {});
    const b = await createTestRisk(owner.orgId, {});
    const id = await seedSuggestion(owner.orgId, a, b);

    await updateRiskLinkStatusQuery(
      id, owner.orgId, "dismissed", owner.userId, "not_related", null,
    );

    // Written to be discriminating on purpose. Asserting against a *pristine*
    // suggested row would pass even if the organization_id clause were dropped,
    // because `attacker.userId` might not satisfy the decided_by_user_id foreign
    // key and the UPDATE would fail for the wrong reason. Here the attacker's
    // user is real and the transition is legal, so the only thing standing
    // between this call and a successful overwrite is the org guard.
    await updateRiskLinkStatusQuery(
      id, attacker.orgId, "confirmed", attacker.userId, null, null,
    );

    expect(await readDismissal(id)).toMatchObject({
      status: "dismissed",
      dismiss_reason: "not_related",
    });
  });
});

