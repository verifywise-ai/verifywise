jest.setTimeout(60000);

import { QueryTypes } from "sequelize";
import { cleanupDatabase } from "./helpers";
import { sequelize } from "../../database/db";
import { seedTwoTenantContexts } from "./tenant-isolation/tenantIsolation.harness";
import { createTestModelRisk, createTestRisk, createTestVendorRisk } from "../factories";
import {
  createAgentHierarchyLinkQuery,
  getHierarchyPairsQuery,
  getRiskPromptRowsQuery,
} from "../../utils/riskLink.utils";

afterEach(async () => {
  await cleanupDatabase();
});

describe("getRiskPromptRowsQuery", () => {
  it("returns the four prompt columns for this org's live risks only", async () => {
    const { owner, attacker } = await seedTwoTenantContexts();
    const subject = await createTestRisk(owner.orgId, {
      risk_name: "Model drift",
      risk_description: "The production model degrades against the training set.",
      risk_category: ["Strategic risk"],
      ai_lifecycle_phase: "Deployment & integration",
    });
    const deleted = await createTestRisk(owner.orgId, { risk_name: "Gone" });
    const theirs = await createTestRisk(attacker.orgId, { risk_name: "Not yours" });
    await sequelize.query(`UPDATE risks SET is_deleted = true WHERE id = :id`, {
      replacements: { id: deleted },
    });

    const rows = await getRiskPromptRowsQuery(owner.orgId, [subject, deleted, theirs]);

    expect(rows).toEqual([
      {
        id: subject,
        risk_name: "Model drift",
        risk_description: "The production model degrades against the training set.",
        risk_category: ["Strategic risk"],
        ai_lifecycle_phase: "Deployment & integration",
      },
    ]);
  });

  it("returns nothing for an empty id list without touching the database", async () => {
    const { owner } = await seedTwoTenantContexts();
    expect(await getRiskPromptRowsQuery(owner.orgId, [])).toEqual([]);
  });
});

describe("getHierarchyPairsQuery", () => {
  it("returns every status, in child/parent terms, for edges touching the ids", async () => {
    const { owner, attacker } = await seedTwoTenantContexts();
    const child = await createTestRisk(owner.orgId);
    const parent = await createTestRisk(owner.orgId);
    const outsider = await createTestRisk(owner.orgId);
    const untouched = await createTestRisk(owner.orgId);
    const theirChild = await createTestRisk(attacker.orgId);
    const theirParent = await createTestRisk(attacker.orgId);

    const insert = async (orgId: number, c: number, p: number, status: string) => {
      await sequelize.query(
        `INSERT INTO risk_links (organization_id, source_risk_id, target_risk_id,
                                 relation_type, status, source, created_at)
         VALUES (:orgId, :c, :p, 'inherits_from', :status, 'agent', NOW())`,
        { replacements: { orgId, c, p, status } },
      );
    };

    await insert(owner.orgId, child, parent, "suggested");
    await insert(owner.orgId, outsider, parent, "dismissed");
    await insert(owner.orgId, untouched, child, "confirmed");
    await insert(attacker.orgId, theirChild, theirParent, "confirmed");

    const pairs = await getHierarchyPairsQuery(owner.orgId, [child, parent]);

    // The `untouched -> child` edge is in because it touches `child`, and it
    // must be: it is exactly what makes `child` ineligible as someone's child.
    expect(pairs).toHaveLength(3);
    expect(pairs).toContainEqual({ childRiskId: child, parentRiskId: parent, parentEntityType: "risk", status: "suggested" });
    expect(pairs).toContainEqual({ childRiskId: outsider, parentRiskId: parent, parentEntityType: "risk", status: "dismissed" });
    expect(pairs).toContainEqual({ childRiskId: untouched, parentRiskId: child, parentEntityType: "risk", status: "confirmed" });
  });

  it("returns nothing for an empty id list", async () => {
    const { owner } = await seedTwoTenantContexts();
    expect(await getHierarchyPairsQuery(owner.orgId, [])).toEqual([]);
  });

  it("returns a cross-entity parent with its entity type, not a null id", async () => {
    const { owner } = await seedTwoTenantContexts();
    const child = await createTestRisk(owner.orgId, {});
    const vendorRisk = await createTestVendorRisk(owner.orgId, {});
    await sequelize.query(
      `INSERT INTO risk_links (organization_id, source_risk_id, target_vendor_risk_id,
                               relation_type, status, source)
       VALUES (:orgId, :child, :vendorRisk, 'inherits_from', 'dismissed', 'agent')`,
      { replacements: { orgId: owner.orgId, child, vendorRisk } },
    );

    expect(await getHierarchyPairsQuery(owner.orgId, [child])).toEqual([
      {
        childRiskId: child,
        parentRiskId: vendorRisk,
        parentEntityType: "vendor_risk",
        status: "dismissed",
      },
    ]);
  });

  it("still reports a plain risk parent as entity type risk", async () => {
    const { owner } = await seedTwoTenantContexts();
    const child = await createTestRisk(owner.orgId, {});
    const parent = await createTestRisk(owner.orgId, {});
    await sequelize.query(
      `INSERT INTO risk_links (organization_id, source_risk_id, target_risk_id,
                               relation_type, status, source)
       VALUES (:orgId, :child, :parent, 'inherits_from', 'suggested', 'agent')`,
      { replacements: { orgId: owner.orgId, child, parent } },
    );

    expect(await getHierarchyPairsQuery(owner.orgId, [child])).toEqual([
      {
        childRiskId: child,
        parentRiskId: parent,
        parentEntityType: "risk",
        status: "suggested",
      },
    ]);
  });
});

describe("createAgentHierarchyLinkQuery", () => {
  it("stores a suggested/agent row with the model's reason, and refuses it twice", async () => {
    const { owner } = await seedTwoTenantContexts();
    const child = await createTestRisk(owner.orgId);
    const parent = await createTestRisk(owner.orgId);
    const input = {
      organizationId: owner.orgId,
      childRiskId: child,
      parent: { id: parent, entityType: "risk" as const },
      reason: "Both describe drift in the same deployed model.",
    };

    const id = await createAgentHierarchyLinkQuery(input);
    expect(id).not.toBeNull();
    expect(await createAgentHierarchyLinkQuery(input)).toBeNull();

    const [rows] = await sequelize.query(
      `SELECT source_risk_id, target_risk_id, relation_type, status, source,
              score::float8 AS score, reasons, decided_at
         FROM risk_links WHERE id = :id`,
      { replacements: { id } },
    );
    expect(rows[0]).toMatchObject({
      // source = child, target = parent. The canonical CHECK exempts
      // inherits_from, so the row must survive in exactly this order.
      source_risk_id: child,
      target_risk_id: parent,
      relation_type: "inherits_from",
      status: "suggested",
      source: "agent",
      score: 0,
    });
    expect((rows[0] as any).decided_at).toBeNull();
    expect((rows[0] as any).reasons).toEqual([
      { signal: "hierarchy", weight: 0, detail: "Both describe drift in the same deployed model." },
    ]);
  });
});

describe("createAgentHierarchyLinkQuery cross-entity parents", () => {
  it("writes a model risk parent to target_model_risk_id with its own signal", async () => {
    const { owner } = await seedTwoTenantContexts();
    const child = await createTestRisk(owner.orgId, {});
    const modelRisk = await createTestModelRisk(owner.orgId, {});

    const id = await createAgentHierarchyLinkQuery({
      organizationId: owner.orgId,
      childRiskId: child,
      parent: { id: modelRisk, entityType: "model_risk" },
      reason: "The model risk is the upstream cause of this project risk.",
    });

    const [row]: any[] = await sequelize.query(
      `SELECT target_risk_id, target_model_risk_id, target_vendor_risk_id,
              relation_type, status, source, reasons
         FROM risk_links WHERE id = :id`,
      { replacements: { id }, type: QueryTypes.SELECT },
    );
    expect(row).toMatchObject({
      target_risk_id: null,
      target_model_risk_id: modelRisk,
      target_vendor_risk_id: null,
      relation_type: "inherits_from",
      status: "suggested",
      source: "agent",
    });
    expect(row.reasons).toEqual([
      {
        signal: "cross_entity_hierarchy",
        weight: 0,
        detail: "The model risk is the upstream cause of this project risk.",
      },
    ]);
  });

  it("writes a vendor risk parent to target_vendor_risk_id", async () => {
    const { owner } = await seedTwoTenantContexts();
    const child = await createTestRisk(owner.orgId, {});
    const vendorRisk = await createTestVendorRisk(owner.orgId, {});

    const id = await createAgentHierarchyLinkQuery({
      organizationId: owner.orgId,
      childRiskId: child,
      parent: { id: vendorRisk, entityType: "vendor_risk" },
      reason: "The vendor's own risk is the umbrella over this one.",
    });

    const [row]: any[] = await sequelize.query(
      `SELECT target_vendor_risk_id FROM risk_links WHERE id = :id`,
      { replacements: { id }, type: QueryTypes.SELECT },
    );
    expect(row.target_vendor_risk_id).toBe(vendorRisk);
  });

  // The C2 regression guard: a plain risk parent must be untouched by this change.
  it("still writes a plain risk parent under the hierarchy signal", async () => {
    const { owner } = await seedTwoTenantContexts();
    const child = await createTestRisk(owner.orgId, {});
    const parent = await createTestRisk(owner.orgId, {});

    const id = await createAgentHierarchyLinkQuery({
      organizationId: owner.orgId,
      childRiskId: child,
      parent: { id: parent, entityType: "risk" },
      reason: "Both are instances of the same underlying failure.",
    });

    const [row]: any[] = await sequelize.query(
      `SELECT target_risk_id, target_model_risk_id, target_vendor_risk_id, reasons
         FROM risk_links WHERE id = :id`,
      { replacements: { id }, type: QueryTypes.SELECT },
    );
    expect(row).toMatchObject({
      target_risk_id: parent,
      target_model_risk_id: null,
      target_vendor_risk_id: null,
    });
    expect(row.reasons[0].signal).toBe("hierarchy");
  });

  it("returns null rather than raising when the same pair is written twice", async () => {
    const { owner } = await seedTwoTenantContexts();
    const child = await createTestRisk(owner.orgId, {});
    const vendorRisk = await createTestVendorRisk(owner.orgId, {});
    const input = {
      organizationId: owner.orgId,
      childRiskId: child,
      parent: { id: vendorRisk, entityType: "vendor_risk" as const },
      reason: "The vendor's own risk is the umbrella over this one.",
    };

    expect(await createAgentHierarchyLinkQuery(input)).not.toBeNull();
    expect(await createAgentHierarchyLinkQuery(input)).toBeNull();
  });
});
