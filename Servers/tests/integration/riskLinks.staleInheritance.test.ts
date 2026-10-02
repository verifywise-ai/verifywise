jest.setTimeout(60000);

import { QueryTypes } from "sequelize";
import { cleanupDatabase, createTestUser } from "./helpers";
import { createTestApp, testRequest } from "./setup";
import { sequelize } from "../../database/db";
import { seedTwoTenantContexts } from "./tenant-isolation/tenantIsolation.harness";
import { createTestRisk, createTestModelRisk, createTestVendorRisk } from "../factories";
import { runEvidenceFreshnessSweep } from "../../services/automations/actions/evidenceFreshnessSweep";
import { runStaleInheritanceNotifySweep } from "../../services/automations/actions/staleInheritanceNotifySweep";
import {
  getUnnotifiedStaleChildrenQuery,
  markParentLevelNotifiedQuery,
} from "../../utils/riskLink.utils";

afterEach(async () => {
  await cleanupDatabase();
});

/*
 * Every link below is a straight INSERT, bypassing the controller on purpose:
 * they prove the TRIGGER does the work, not application code.
 */
const readFlag = async (where: string, replacements: Record<string, unknown>) => {
  const rows = (await sequelize.query(
    `SELECT parent_level_changed_at FROM risk_links WHERE ${where}`,
    { replacements, type: QueryTypes.SELECT },
  )) as { parent_level_changed_at: unknown }[];
  return rows[0].parent_level_changed_at;
};

const linkProjectParent = (orgId: number, child: number, parent: number, status = "confirmed") =>
  sequelize.query(
    `INSERT INTO risk_links (organization_id, source_risk_id, target_risk_id, relation_type, status, source)
     VALUES (:orgId, :child, :parent, 'inherits_from', :status, 'user')`,
    { replacements: { orgId, child, parent, status } },
  );

// Stale by age: untouched for longer than EVIDENCE_FRESHNESS_DAYS (90).
const mapStaleEvidence = (orgId: number, riskId: number) =>
  sequelize.query(
    `INSERT INTO evidence_hub (organization_id, evidence_name, evidence_type, description,
                               mapped_risk_ids, created_at, updated_at)
     VALUES (:orgId, 'stale evidence', 'Documentation', 'x',
             :riskIds, NOW() - INTERVAL '200 days', NOW() - INTERVAL '120 days')`,
    { replacements: { orgId, riskIds: `{${riskId}}` } },
  );

const linkIdFor = async (child: number, parent: number): Promise<number> => {
  const rows = (await sequelize.query(
    `SELECT id FROM risk_links WHERE source_risk_id = :child AND target_risk_id = :parent`,
    { replacements: { child, parent }, type: QueryTypes.SELECT },
  )) as { id: number }[];
  return rows[0].id;
};

const readNotified = async (child: number, parent: number) => {
  const rows = (await sequelize.query(
    `SELECT parent_level_notified_at FROM risk_links
      WHERE source_risk_id = :child AND target_risk_id = :parent`,
    { replacements: { child, parent }, type: QueryTypes.SELECT },
  )) as { parent_level_notified_at: unknown }[];
  return rows[0].parent_level_notified_at;
};

describe("stale-inheritance flag", () => {
  it("flags the child when its project-risk parent's level moves", async () => {
    const { owner } = await seedTwoTenantContexts();
    const child = await createTestRisk(owner.orgId, {});
    const parent = await createTestRisk(owner.orgId, {});
    await linkProjectParent(owner.orgId, child, parent);

    await sequelize.query(
      `UPDATE risks SET risk_level_autocalculated = 'High risk' WHERE id = :parent`,
      { replacements: { parent } },
    );

    expect(
      await readFlag(`source_risk_id = :child AND target_risk_id = :parent`, { child, parent }),
    ).not.toBeNull();
  });

  it("flags the child when its model-risk parent's level moves", async () => {
    const { owner } = await seedTwoTenantContexts();
    const child = await createTestRisk(owner.orgId, {});
    const modelRisk = await createTestModelRisk(owner.orgId, {});

    await sequelize.query(
      `INSERT INTO risk_links (organization_id, source_risk_id, target_model_risk_id, relation_type, status, source)
       VALUES (:orgId, :child, :modelRisk, 'inherits_from', 'confirmed', 'user')`,
      { replacements: { orgId: owner.orgId, child, modelRisk } },
    );
    await sequelize.query(`UPDATE model_risks SET risk_level = 'Critical' WHERE id = :modelRisk`, {
      replacements: { modelRisk },
    });

    expect(
      await readFlag(`source_risk_id = :child AND target_model_risk_id = :modelRisk`, {
        child,
        modelRisk,
      }),
    ).not.toBeNull();
  });

  it("flags the child when its vendor-risk parent's level moves", async () => {
    const { owner } = await seedTwoTenantContexts();
    const child = await createTestRisk(owner.orgId, {});
    const vendorRisk = await createTestVendorRisk(owner.orgId, {});

    await sequelize.query(
      `INSERT INTO risk_links (organization_id, source_risk_id, target_vendor_risk_id, relation_type, status, source)
       VALUES (:orgId, :child, :vendorRisk, 'inherits_from', 'confirmed', 'user')`,
      { replacements: { orgId: owner.orgId, child, vendorRisk } },
    );
    await sequelize.query(`UPDATE vendorrisks SET risk_level = 'Critical' WHERE id = :vendorRisk`, {
      replacements: { vendorRisk },
    });

    expect(
      await readFlag(`source_risk_id = :child AND target_vendor_risk_id = :vendorRisk`, {
        child,
        vendorRisk,
      }),
    ).not.toBeNull();
  });

  it("never flags a suggested link", async () => {
    const { owner } = await seedTwoTenantContexts();
    const child = await createTestRisk(owner.orgId, {});
    const parent = await createTestRisk(owner.orgId, {});
    await linkProjectParent(owner.orgId, child, parent, "suggested");

    await sequelize.query(
      `UPDATE risks SET risk_level_autocalculated = 'High risk' WHERE id = :parent`,
      { replacements: { parent } },
    );

    expect(
      await readFlag(`source_risk_id = :child AND target_risk_id = :parent`, { child, parent }),
    ).toBeNull();
  });

  it("never flags a related_to link", async () => {
    const { owner } = await seedTwoTenantContexts();
    const a = await createTestRisk(owner.orgId, {});
    const b = await createTestRisk(owner.orgId, {});
    // risk_links_canonical demands source < target for related_to.
    const [s, t] = a < b ? [a, b] : [b, a];
    await sequelize.query(
      `INSERT INTO risk_links (organization_id, source_risk_id, target_risk_id, relation_type, status, source)
       VALUES (:orgId, :s, :t, 'related_to', 'confirmed', 'user')`,
      { replacements: { orgId: owner.orgId, s, t } },
    );

    await sequelize.query(
      `UPDATE risks SET risk_level_autocalculated = 'High risk' WHERE id = :t`,
      { replacements: { t } },
    );

    expect(await readFlag(`source_risk_id = :s AND target_risk_id = :t`, { s, t })).toBeNull();
  });

  it("does not flag when the same level is written again", async () => {
    const { owner } = await seedTwoTenantContexts();
    const child = await createTestRisk(owner.orgId, {});
    const parent = await createTestRisk(owner.orgId, {});
    await linkProjectParent(owner.orgId, child, parent);

    // Flag it once, then clear the column by hand so the rewrite starts clean.
    await sequelize.query(
      `UPDATE risks SET risk_level_autocalculated = 'High risk' WHERE id = :parent`,
      { replacements: { parent } },
    );
    await sequelize.query(
      `UPDATE risk_links SET parent_level_changed_at = NULL
        WHERE source_risk_id = :child AND target_risk_id = :parent`,
      { replacements: { child, parent } },
    );
    await sequelize.query(
      `UPDATE risks SET risk_level_autocalculated = 'High risk' WHERE id = :parent`,
      { replacements: { parent } },
    );

    expect(
      await readFlag(`source_risk_id = :child AND target_risk_id = :parent`, { child, parent }),
    ).toBeNull();
  });

  it("leaves the flag standing on a non-level edit to the parent", async () => {
    const { owner } = await seedTwoTenantContexts();
    const child = await createTestRisk(owner.orgId, {});
    const parent = await createTestRisk(owner.orgId, {});
    await linkProjectParent(owner.orgId, child, parent);

    await sequelize.query(
      `UPDATE risks SET risk_level_autocalculated = 'High risk' WHERE id = :parent`,
      { replacements: { parent } },
    );
    await sequelize.query(`UPDATE risks SET risk_name = 'x' WHERE id = :parent`, {
      replacements: { parent },
    });

    expect(
      await readFlag(`source_risk_id = :child AND target_risk_id = :parent`, { child, parent }),
    ).not.toBeNull();
  });

  it("clears the flag when the child's own level is edited", async () => {
    const { owner } = await seedTwoTenantContexts();
    const child = await createTestRisk(owner.orgId, {});
    const parent = await createTestRisk(owner.orgId, {});
    await linkProjectParent(owner.orgId, child, parent);

    await sequelize.query(
      `UPDATE risks SET risk_level_autocalculated = 'High risk' WHERE id = :parent`,
      { replacements: { parent } },
    );
    // The child's displayed level is part of the statement: a review.
    await sequelize.query(
      `UPDATE risks SET risk_level_autocalculated = 'Low risk' WHERE id = :child`,
      { replacements: { child } },
    );

    expect(
      await readFlag(`source_risk_id = :child AND target_risk_id = :parent`, { child, parent }),
    ).toBeNull();
  });

  it("keeps the flag on a non-level edit to the child", async () => {
    const { owner } = await seedTwoTenantContexts();
    const child = await createTestRisk(owner.orgId, {});
    const parent = await createTestRisk(owner.orgId, {});
    await linkProjectParent(owner.orgId, child, parent);

    await sequelize.query(
      `UPDATE risks SET risk_level_autocalculated = 'High risk' WHERE id = :parent`,
      { replacements: { parent } },
    );
    // A non-level column is not a review: it must not erase the warning.
    await sequelize.query(`UPDATE risks SET risk_name = 'x' WHERE id = :child`, {
      replacements: { child },
    });

    expect(
      await readFlag(`source_risk_id = :child AND target_risk_id = :parent`, { child, parent }),
    ).not.toBeNull();
  });

  it("keeps the flag when an automated sweep updates the child risk", async () => {
    const { owner } = await seedTwoTenantContexts();
    const child = await createTestRisk(owner.orgId, {});
    const parent = await createTestRisk(owner.orgId, {});
    await linkProjectParent(owner.orgId, child, parent);

    await sequelize.query(
      `UPDATE risks SET risk_level_autocalculated = 'High risk' WHERE id = :parent`,
      { replacements: { parent } },
    );
    expect(
      await readFlag(`source_risk_id = :child AND target_risk_id = :parent`, { child, parent }),
    ).not.toBeNull();

    // The F5 sweep is a machine writer: it updates evidence_stale_at and
    // mitigation_status on the child. That must NOT be mistaken for a human
    // review, or the nightly job silently erases the warning.
    await mapStaleEvidence(owner.orgId, child);
    await runEvidenceFreshnessSweep(owner.orgId);

    expect(
      await readFlag(`source_risk_id = :child AND target_risk_id = :parent`, { child, parent }),
    ).not.toBeNull();
  });

  it("clears the flag through the acknowledge endpoint, idempotently", async () => {
    const { owner } = await seedTwoTenantContexts();
    const child = await createTestRisk(owner.orgId, {});
    const parent = await createTestRisk(owner.orgId, {});
    await linkProjectParent(owner.orgId, child, parent);
    await sequelize.query(
      `UPDATE risks SET risk_level_autocalculated = 'High risk' WHERE id = :parent`,
      { replacements: { parent } },
    );
    expect(
      await readFlag(`source_risk_id = :child AND target_risk_id = :parent`, { child, parent }),
    ).not.toBeNull();

    const linkId = await linkIdFor(child, parent);

    const first = await owner.request.post(`/api/riskLinks/${linkId}/acknowledge-parent-change`);
    expect(first.status).toBe(200);
    expect(
      await readFlag(`source_risk_id = :child AND target_risk_id = :parent`, { child, parent }),
    ).toBeNull();

    // Already reviewed: still a success, not a 404.
    const second = await owner.request.post(`/api/riskLinks/${linkId}/acknowledge-parent-change`);
    expect(second.status).toBe(200);
  });

  it("404s acknowledging a link that does not exist in the org", async () => {
    const { owner } = await seedTwoTenantContexts();

    const res = await owner.request.post(`/api/riskLinks/999999/acknowledge-parent-change`);
    expect(res.status).toBe(404);
  });

  it("notifies the child owner once per parent level change", async () => {
    const { owner } = await seedTwoTenantContexts();
    const child = await createTestRisk(owner.orgId, { risk_owner: owner.userId });
    const parent = await createTestRisk(owner.orgId, {});
    await linkProjectParent(owner.orgId, child, parent);
    await sequelize.query(
      `UPDATE risks SET risk_level_autocalculated = 'High risk' WHERE id = :parent`,
      { replacements: { parent } },
    );

    const first = await runStaleInheritanceNotifySweep(owner.orgId);
    expect(first.notified).toBe(1);
    expect(await readNotified(child, parent)).not.toBeNull();

    // Same change, second run: nothing to send.
    const second = await runStaleInheritanceNotifySweep(owner.orgId);
    expect(second.notified).toBe(0);

    // A new move re-arms the notice.
    await sequelize.query(
      `UPDATE risks SET risk_level_autocalculated = 'Low risk' WHERE id = :parent`,
      { replacements: { parent } },
    );
    const third = await runStaleInheritanceNotifySweep(owner.orgId);
    expect(third.notified).toBe(1);
  });

  it("does not flag another org's link when a model risk level moves", async () => {
    const { owner, attacker } = await seedTwoTenantContexts();
    const childA = await createTestRisk(owner.orgId, {});
    const modelB = await createTestModelRisk(attacker.orgId, {});
    // Cross-org link row (bypasses app validation): org A's child inherits
    // from org B's model. A move in B must not flag A's link.
    await sequelize.query(
      `INSERT INTO risk_links (organization_id, source_risk_id, target_model_risk_id, relation_type, status, source)
       VALUES (:orgId, :child, :modelRisk, 'inherits_from', 'confirmed', 'user')`,
      { replacements: { orgId: owner.orgId, child: childA, modelRisk: modelB } },
    );

    await sequelize.query(`UPDATE model_risks SET risk_level = 'Critical' WHERE id = :modelB`, {
      replacements: { modelB },
    });

    expect(
      await readFlag(`source_risk_id = :child AND target_model_risk_id = :modelRisk`, {
        child: childA,
        modelRisk: modelB,
      }),
    ).toBeNull();
  });

  it("does not flag another org's link when a vendor risk level moves", async () => {
    const { owner, attacker } = await seedTwoTenantContexts();
    const childA = await createTestRisk(owner.orgId, {});
    const vendorB = await createTestVendorRisk(attacker.orgId, {});
    await sequelize.query(
      `INSERT INTO risk_links (organization_id, source_risk_id, target_vendor_risk_id, relation_type, status, source)
       VALUES (:orgId, :child, :vendorRisk, 'inherits_from', 'confirmed', 'user')`,
      { replacements: { orgId: owner.orgId, child: childA, vendorRisk: vendorB } },
    );

    await sequelize.query(`UPDATE vendorrisks SET risk_level = 'Critical' WHERE id = :vendorB`, {
      replacements: { vendorB },
    });

    expect(
      await readFlag(`source_risk_id = :child AND target_vendor_risk_id = :vendorRisk`, {
        child: childA,
        vendorRisk: vendorB,
      }),
    ).toBeNull();
  });

  it("does not stamp a flag that advanced after the sweep read it", async () => {
    const { owner } = await seedTwoTenantContexts();
    const child = await createTestRisk(owner.orgId, { risk_owner: owner.userId });
    const parent = await createTestRisk(owner.orgId, {});
    await linkProjectParent(owner.orgId, child, parent);
    await sequelize.query(
      `UPDATE risks SET risk_level_autocalculated = 'High risk' WHERE id = :parent`,
      { replacements: { parent } },
    );

    // The sweep reads the flag...
    const rows = await getUnnotifiedStaleChildrenQuery(owner.orgId);
    expect(rows).toHaveLength(1);
    const seen = rows[0].parent_changed_at;

    // ...then the parent moves again before the stamp lands.
    await sequelize.query(
      `UPDATE risks SET risk_level_autocalculated = 'Low risk' WHERE id = :parent`,
      { replacements: { parent } },
    );
    await markParentLevelNotifiedQuery(owner.orgId, rows[0].link_id, seen);

    // The new warning is still unnotified — stamping the stale value is a no-op.
    expect(await readNotified(child, parent)).toBeNull();
    expect(await getUnnotifiedStaleChildrenQuery(owner.orgId)).toHaveLength(1);
  });

  it("denies a read-only Auditor all three mutating endpoints", async () => {
    const { owner } = await seedTwoTenantContexts();
    const child = await createTestRisk(owner.orgId, {});
    const parent = await createTestRisk(owner.orgId, {});
    await linkProjectParent(owner.orgId, child, parent);
    const linkId = await linkIdFor(child, parent);

    // Same org, Auditor role: read-only by the role matrix.
    const auditorId = await createTestUser(
      owner.orgId,
      4,
      `auditor-${Date.now()}@test.com`,
      "Password123!",
    );
    const auditorApp = await createTestApp({
      bypassAuth: true,
      mockUser: { userId: auditorId, organizationId: owner.orgId, role: "Auditor" },
    });
    const auditor = testRequest(auditorApp);

    const create = await auditor
      .post("/api/riskLinks")
      .send({ sourceRiskId: child, targetRiskId: parent, relationType: "related_to" });
    expect(create.status).toBe(403);

    const patch = await auditor.patch(`/api/riskLinks/${linkId}`).send({ status: "dismissed" });
    expect(patch.status).toBe(403);

    const ack = await auditor.post(`/api/riskLinks/${linkId}/acknowledge-parent-change`);
    expect(ack.status).toBe(403);
  });

  it("reaches the API as parentLevelChangedAt on the child's own view", async () => {
    const { owner } = await seedTwoTenantContexts();
    const child = await createTestRisk(owner.orgId, {});
    const parent = await createTestRisk(owner.orgId, {});
    await linkProjectParent(owner.orgId, child, parent);

    await sequelize.query(
      `UPDATE risks SET risk_level_autocalculated = 'High risk' WHERE id = :parent`,
      { replacements: { parent } },
    );

    const res = await owner.request.get(`/api/riskLinks/${child}`);
    expect(res.status).toBe(200);
    const row = (res.body.data as any[]).find(
      (link) => link.relationType === "inherits_from" && link.direction === "outgoing",
    );
    expect(row).toBeDefined();
    expect(typeof row.parentLevelChangedAt).toBe("string");
  });
});
