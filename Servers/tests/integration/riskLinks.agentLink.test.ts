jest.setTimeout(60000);

import { cleanupDatabase } from "./helpers";
import { sequelize } from "../../database/db";
import { seedTwoTenantContexts } from "./tenant-isolation/tenantIsolation.harness";
import { createTestRisk } from "../factories";
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
    expect(pairs).toContainEqual({ childRiskId: child, parentRiskId: parent, status: "suggested" });
    expect(pairs).toContainEqual({ childRiskId: outsider, parentRiskId: parent, status: "dismissed" });
    expect(pairs).toContainEqual({ childRiskId: untouched, parentRiskId: child, status: "confirmed" });
  });

  it("returns nothing for an empty id list", async () => {
    const { owner } = await seedTwoTenantContexts();
    expect(await getHierarchyPairsQuery(owner.orgId, [])).toEqual([]);
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
      parentRiskId: parent,
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
