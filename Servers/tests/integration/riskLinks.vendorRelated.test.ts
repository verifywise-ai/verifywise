jest.setTimeout(60000);

/**
 * `related_to` between two vendor risks, end to end: the schema that admits
 * exactly one shape of vendor-sourced row, the scorer against real queries,
 * and every endpoint that reads or writes such a pair.
 */

import { QueryTypes } from "sequelize";
import { cleanupDatabase, seedFrameworks } from "./helpers";
import { sequelize } from "../../database/db";
import { seedTwoTenantContexts } from "./tenant-isolation/tenantIsolation.harness";
import {
  createTestProject,
  createTestRisk,
  createTestVendor,
  createTestVendorRisk,
  linkVendorToProject,
} from "../factories";
import { recomputeVendorRiskLinks } from "../../services/riskLinks/vendorRelated";

beforeAll(async () => {
  await seedFrameworks();
});

afterEach(async () => {
  await cleanupDatabase();
});

interface PairRow {
  id: number;
  source_risk_id: number | null;
  source_vendor_risk_id: number;
  target_vendor_risk_id: number;
  relation_type: string;
  status: string;
  source: string;
  score: number;
  reasons: { signal: string; weight: number; detail?: string }[];
}

const pairs = async (orgId: number): Promise<PairRow[]> =>
  (await sequelize.query(
    `SELECT id, source_risk_id, source_vendor_risk_id, target_vendor_risk_id, relation_type,
            status, source, score::float AS score, reasons
       FROM risk_links
      WHERE organization_id = :orgId AND source_vendor_risk_id IS NOT NULL
      ORDER BY id`,
    { replacements: { orgId }, type: QueryTypes.SELECT },
  )) as PairRow[];

const insertPair = (
  orgId: number,
  source: number,
  target: number,
  overrides: { relation?: string; status?: string; origin?: string; sourceRisk?: number } = {},
) =>
  sequelize
    .query(
      `INSERT INTO risk_links
       (organization_id, source_risk_id, source_vendor_risk_id, target_vendor_risk_id,
        relation_type, status, source, reasons)
     VALUES (:orgId, :sourceRisk, :source, :target, :relation, :status, :origin,
             '[{"signal":"similar_wording","weight":3}]'::jsonb)
     RETURNING id`,
      {
        replacements: {
          orgId,
          source,
          target,
          sourceRisk: overrides.sourceRisk ?? null,
          relation: overrides.relation ?? "related_to",
          status: overrides.status ?? "suggested",
          origin: overrides.origin ?? "derived",
        },
        type: QueryTypes.SELECT,
      },
    )
    .then((rows) => (rows as { id: number }[])[0].id);

const setImpact = (id: number, impact: string) =>
  sequelize.query(`UPDATE vendorrisks SET impact_description = :impact WHERE id = :id`, {
    replacements: { id, impact },
  });

const mapFramework = (orgId: number, vendorRisk: number, frameworkId: number) =>
  sequelize.query(
    `INSERT INTO frameworks_vendorrisks (organization_id, vendorrisk_id, framework_id)
     VALUES (:orgId, :vendorRisk, :frameworkId)`,
    { replacements: { orgId, vendorRisk, frameworkId } },
  );

/** Two vendors serving one use case, one risk each, worded alike. */
async function twoVendorsAlike(orgId: number, userId: number) {
  const project = await createTestProject(orgId, userId, { project_title: "Lending" });
  const acme = await createTestVendor(orgId, { vendor_name: "Acme Cloud" });
  const zeta = await createTestVendor(orgId, { vendor_name: "Zeta Labs" });
  await linkVendorToProject(orgId, acme, project);
  await linkVendorToProject(orgId, zeta, project);
  const a = await createTestVendorRisk(orgId, {
    vendor_id: acme,
    risk_description: "Customer records exposed through the support portal",
  });
  const b = await createTestVendorRisk(orgId, {
    vendor_id: zeta,
    risk_description: "Support portal exposes customer records to other tenants",
  });
  return { project, acme, zeta, a, b };
}

describe("risk_links schema for vendor risk pairs", () => {
  it("accepts a related_to pair stored smaller id first", async () => {
    const { owner } = await seedTwoTenantContexts();
    const a = await createTestVendorRisk(owner.orgId, {});
    const b = await createTestVendorRisk(owner.orgId, {});

    await insertPair(owner.orgId, Math.min(a, b), Math.max(a, b));

    expect(await pairs(owner.orgId)).toHaveLength(1);
  });

  type Shape = (low: number, high: number) => [number, number, { relation?: string }];
  const shapes: [string, Shape][] = [
    ["stored larger id first", (low, high) => [high, low, {}]],
    ["linking a vendor risk to itself", (low) => [low, low, {}]],
    ["as inheritance", (low, high) => [low, high, { relation: "inherits_from" }]],
  ];

  it.each(shapes)("refuses a vendor pair %s", async (_label, shape) => {
    const { owner } = await seedTwoTenantContexts();
    const first = await createTestVendorRisk(owner.orgId, {});
    const second = await createTestVendorRisk(owner.orgId, {});
    const [source, target, overrides] = shape(Math.min(first, second), Math.max(first, second));

    await expect(insertPair(owner.orgId, source, target, overrides)).rejects.toThrow(
      /risk_links_vendor_pair/,
    );
  });

  it("refuses a row with two sources", async () => {
    const { owner } = await seedTwoTenantContexts();
    const a = await createTestVendorRisk(owner.orgId, {});
    const b = await createTestVendorRisk(owner.orgId, {});
    const risk = await createTestRisk(owner.orgId, {});

    await expect(
      insertPair(owner.orgId, Math.min(a, b), Math.max(a, b), { sourceRisk: risk }),
    ).rejects.toThrow(/risk_links_one_source/);
  });

  it("refuses the same pair twice, whatever the status", async () => {
    const { owner } = await seedTwoTenantContexts();
    const a = await createTestVendorRisk(owner.orgId, {});
    const b = await createTestVendorRisk(owner.orgId, {});
    await insertPair(owner.orgId, Math.min(a, b), Math.max(a, b), { status: "dismissed" });

    // A unique violation surfaces as Sequelize's "Validation error"; the
    // constraint name is on the driver error.
    await expect(insertPair(owner.orgId, Math.min(a, b), Math.max(a, b))).rejects.toMatchObject({
      parent: { constraint: "risk_links_unique_vendor_pair" },
    });
  });

  it("still refuses a related_to from a project risk to a vendor risk", async () => {
    const { owner } = await seedTwoTenantContexts();
    const risk = await createTestRisk(owner.orgId, {});
    const vendorRisk = await createTestVendorRisk(owner.orgId, {});

    await expect(
      sequelize.query(
        `INSERT INTO risk_links (organization_id, source_risk_id, target_vendor_risk_id,
                                 relation_type, status, source)
         VALUES (:orgId, :risk, :vendorRisk, 'related_to', 'suggested', 'derived')`,
        { replacements: { orgId: owner.orgId, risk, vendorRisk } },
      ),
    ).rejects.toThrow(/risk_links_cross_entity_inherits/);
  });
});

describe("recomputeVendorRiskLinks against Postgres", () => {
  it("suggests a canonical pair for alike risks at two vendors serving one use case", async () => {
    const { owner } = await seedTwoTenantContexts();
    const { a, b } = await twoVendorsAlike(owner.orgId, owner.userId);

    await recomputeVendorRiskLinks(owner.orgId, b);

    const rows = await pairs(owner.orgId);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      source_risk_id: null,
      source_vendor_risk_id: Math.min(a, b),
      target_vendor_risk_id: Math.max(a, b),
      relation_type: "related_to",
      status: "suggested",
      source: "derived",
    });
    expect(rows[0].reasons.map((r) => r.signal)).toEqual(["similar_wording", "shared_use_case"]);
    expect(rows[0].reasons[1].detail).toBe("Lending");
  });

  it("names the vendor and the frameworks two risks of one vendor share", async () => {
    const { owner } = await seedTwoTenantContexts();
    const vendor = await createTestVendor(owner.orgId, {});
    const a = await createTestVendorRisk(owner.orgId, {
      vendor_id: vendor,
      risk_description: "Model outage stops loan approvals",
    });
    const b = await createTestVendorRisk(owner.orgId, {
      vendor_id: vendor,
      risk_description: "Loan approvals halt during a model outage window",
    });
    await mapFramework(owner.orgId, a, 1);
    await mapFramework(owner.orgId, b, 1);

    await recomputeVendorRiskLinks(owner.orgId, a);

    const [row] = await pairs(owner.orgId);
    expect(row.reasons.map((r) => r.signal)).toEqual([
      "similar_wording",
      "same_vendor",
      "shared_framework",
    ]);
    expect(row.reasons[2].detail).toBe("EU AI Act");
  });

  it("reads the impact description, and relates nothing on vendor and framework alone", async () => {
    const { owner } = await seedTwoTenantContexts();
    const vendor = await createTestVendor(owner.orgId, {});
    const a = await createTestVendorRisk(owner.orgId, {
      vendor_id: vendor,
      risk_description: "Late invoices",
    });
    const b = await createTestVendorRisk(owner.orgId, {
      vendor_id: vendor,
      risk_description: "Single sign-on outage",
    });
    await mapFramework(owner.orgId, a, 1);
    await mapFramework(owner.orgId, b, 1);

    await recomputeVendorRiskLinks(owner.orgId, a);
    expect(await pairs(owner.orgId)).toEqual([]);

    await setImpact(a, "Finance cannot reconcile supplier payments each quarter");
    await setImpact(b, "Finance cannot reconcile supplier payments on time");
    await recomputeVendorRiskLinks(owner.orgId, a);
    expect(await pairs(owner.orgId)).toHaveLength(1);
  });

  it("prunes a suggestion whose wording drifted apart, but keeps a confirmed one", async () => {
    const { owner } = await seedTwoTenantContexts();
    const { a } = await twoVendorsAlike(owner.orgId, owner.userId);
    const c = await createTestVendorRisk(owner.orgId, {
      risk_description: "Support portal exposes customer records after an upgrade",
    });
    await recomputeVendorRiskLinks(owner.orgId, a);
    const before = await pairs(owner.orgId);
    expect(before).toHaveLength(2);
    const confirmed = before.find((row) =>
      [row.source_vendor_risk_id, row.target_vendor_risk_id].includes(c),
    )!;
    await sequelize.query(
      `UPDATE risk_links SET status = 'confirmed', source = 'user', decided_at = NOW() WHERE id = :id`,
      { replacements: { id: confirmed.id } },
    );

    await sequelize.query(
      `UPDATE vendorrisks SET risk_description = 'Quarterly invoice disputes' WHERE id = :a`,
      { replacements: { a } },
    );
    await recomputeVendorRiskLinks(owner.orgId, a);

    const after = await pairs(owner.orgId);
    expect(after).toHaveLength(1);
    expect(after[0]).toMatchObject({ id: confirmed.id, status: "confirmed", score: 0 });
    expect(after[0].reasons).toEqual([]);
  });

  it("ignores a soft-deleted vendor risk, and another organization's", async () => {
    const { owner, attacker } = await seedTwoTenantContexts();
    const a = await createTestVendorRisk(owner.orgId, {
      risk_description: "Customer records exposed through the support portal",
    });
    const deleted = await createTestVendorRisk(owner.orgId, {
      risk_description: "Customer records exposed through the support portal again",
    });
    await sequelize.query(`UPDATE vendorrisks SET is_deleted = true WHERE id = :deleted`, {
      replacements: { deleted },
    });
    await createTestVendorRisk(attacker.orgId, {
      risk_description: "Customer records exposed through the support portal",
    });

    await recomputeVendorRiskLinks(owner.orgId, a);
    await recomputeVendorRiskLinks(owner.orgId, deleted);

    expect(await pairs(owner.orgId)).toEqual([]);
    expect(await pairs(attacker.orgId)).toEqual([]);
  });
});

describe("vendor risk pairs through the API", () => {
  it("lists a related vendor risk on both vendor risks' panels, with its vendor", async () => {
    const { owner } = await seedTwoTenantContexts();
    const { a, b } = await twoVendorsAlike(owner.orgId, owner.userId);
    await recomputeVendorRiskLinks(owner.orgId, a);

    const fromA = await owner.request.get(`/api/riskLinks/vendor-risks/${a}`);
    const fromB = await owner.request.get(`/api/riskLinks/vendor-risks/${b}`);

    expect(fromA.status).toBe(200);
    expect(fromA.body.data).toHaveLength(1);
    expect(fromA.body.data[0]).toMatchObject({
      relationType: "related_to",
      direction: "undirected",
      status: "suggested",
      source: "derived",
      relatedRisk: { id: b, entityType: "vendor_risk", vendorName: "Zeta Labs" },
    });
    expect(fromB.body.data[0].relatedRisk).toMatchObject({ id: a, vendorName: "Acme Cloud" });
  });

  it("keeps vendor pairs off a project risk that happens to share an id", async () => {
    const { owner } = await seedTwoTenantContexts();
    const { a, b } = await twoVendorsAlike(owner.orgId, owner.userId);
    const risk = await createTestRisk(owner.orgId, {});
    await sequelize.query(`UPDATE risks SET id = :a WHERE id = :risk`, {
      replacements: { a: Math.min(a, b), risk },
    });
    await recomputeVendorRiskLinks(owner.orgId, a);

    const res = await owner.request.get(`/api/riskLinks/${Math.min(a, b)}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
  });

  it("relates two vendor risks by hand, smaller id first, confirmed", async () => {
    const { owner } = await seedTwoTenantContexts();
    const a = await createTestVendorRisk(owner.orgId, {});
    const b = await createTestVendorRisk(owner.orgId, {});

    const res = await owner.request.post("/api/riskLinks").send({
      sourceVendorRiskId: Math.max(a, b),
      targetVendorRiskId: Math.min(a, b),
      relationType: "related_to",
    });

    expect(res.status).toBe(201);
    expect(res.body.data.relatedRisk).toEqual({ id: Math.min(a, b), entityType: "vendor_risk" });
    const [row] = await pairs(owner.orgId);
    expect(row).toMatchObject({
      source_vendor_risk_id: Math.min(a, b),
      target_vendor_risk_id: Math.max(a, b),
      status: "confirmed",
      source: "user",
    });

    const again = await owner.request.post("/api/riskLinks").send({
      sourceVendorRiskId: a,
      targetVendorRiskId: b,
      relationType: "related_to",
    });
    expect(again.status).toBe(409);
  });

  it("refuses inheritance, a self link and a vendor risk it cannot see", async () => {
    const { owner, attacker } = await seedTwoTenantContexts();
    const a = await createTestVendorRisk(owner.orgId, {});
    const b = await createTestVendorRisk(owner.orgId, {});
    const foreign = await createTestVendorRisk(attacker.orgId, {});
    const post = (body: object) => owner.request.post("/api/riskLinks").send(body);

    const inherits = await post({
      sourceVendorRiskId: a,
      targetVendorRiskId: b,
      relationType: "inherits_from",
    });
    const self = await post({
      sourceVendorRiskId: a,
      targetVendorRiskId: a,
      relationType: "related_to",
    });
    const crossOrg = await post({
      sourceVendorRiskId: a,
      targetVendorRiskId: foreign,
      relationType: "related_to",
    });
    const mixed = await post({
      sourceVendorRiskId: a,
      targetRiskId: await createTestRisk(owner.orgId, {}),
      relationType: "related_to",
    });

    expect(inherits.status).toBe(400);
    expect(self.status).toBe(400);
    expect(crossOrg.status).toBe(404);
    expect(mixed.status).toBe(400);
    expect(await pairs(owner.orgId)).toEqual([]);
  });

  it("confirms a suggested pair, and dismisses one with a related_to reason only", async () => {
    const { owner } = await seedTwoTenantContexts();
    const { a } = await twoVendorsAlike(owner.orgId, owner.userId);
    await recomputeVendorRiskLinks(owner.orgId, a);
    const [row] = await pairs(owner.orgId);

    const wrongReason = await owner.request
      .patch(`/api/riskLinks/${row.id}`)
      .send({ status: "dismissed", dismissReason: "wrong_parent" });
    const dismissed = await owner.request
      .patch(`/api/riskLinks/${row.id}`)
      .send({ status: "dismissed", dismissReason: "duplicate" });
    const confirmed = await owner.request
      .patch(`/api/riskLinks/${row.id}`)
      .send({ status: "confirmed" });

    expect(wrongReason.status).toBe(400);
    expect(dismissed.status).toBe(200);
    expect(confirmed.status).toBe(200);
    expect((await pairs(owner.orgId))[0].status).toBe("confirmed");
  });

  it("draws the pair on the map between two vendor risk nodes", async () => {
    const { owner } = await seedTwoTenantContexts();
    const { a, b, acme, zeta } = await twoVendorsAlike(owner.orgId, owner.userId);
    await recomputeVendorRiskLinks(owner.orgId, a);
    const [low, high] = [Math.min(a, b), Math.max(a, b)];

    const res = await owner.request.get("/api/riskLinks");

    expect(res.status).toBe(200);
    expect(res.body.data.edges).toEqual([
      expect.objectContaining({
        sourceKey: `vendor_risk:${low}`,
        targetKey: `vendor_risk:${high}`,
        relationType: "related_to",
      }),
    ]);
    const byKey = new Map(res.body.data.nodes.map((n: any) => [n.key, n]));
    expect((byKey.get(`vendor_risk:${a}`) as any).vendor).toEqual({ id: acme, name: "Acme Cloud" });
    expect((byKey.get(`vendor_risk:${b}`) as any).vendor).toEqual({ id: zeta, name: "Zeta Labs" });
  });

  it("hides a pair from the map and the panel once either end is soft-deleted", async () => {
    const { owner } = await seedTwoTenantContexts();
    const { a, b } = await twoVendorsAlike(owner.orgId, owner.userId);
    await recomputeVendorRiskLinks(owner.orgId, a);
    await sequelize.query(`UPDATE vendorrisks SET is_deleted = true WHERE id = :b`, {
      replacements: { b },
    });

    const map = await owner.request.get("/api/riskLinks");
    const panel = await owner.request.get(`/api/riskLinks/vendor-risks/${a}`);

    expect(map.body.data.edges).toEqual([]);
    expect(panel.body.data).toEqual([]);
  });

  it("counts a dismissed pair in the dismissal analytics", async () => {
    const { owner } = await seedTwoTenantContexts();
    const { a } = await twoVendorsAlike(owner.orgId, owner.userId);
    await recomputeVendorRiskLinks(owner.orgId, a);
    const [row] = await pairs(owner.orgId);
    await owner.request
      .patch(`/api/riskLinks/${row.id}`)
      .send({ status: "dismissed", dismissReason: "not_related", dismissNote: "Different data" });

    const res = await owner.request.get("/api/riskLinks/dismissals");

    expect(res.status).toBe(200);
    expect(res.body.data.signals).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ signal: "similar_wording", decided: 1, dismissed: 1 }),
      ]),
    );
    expect(res.body.data.notes[0]).toMatchObject({
      dismissNote: "Different data",
      sourceName: expect.stringContaining("Customer records exposed"),
    });
  });

  it("leaves the blast radius alone: a related vendor risk is not a child", async () => {
    const { owner } = await seedTwoTenantContexts();
    const { a } = await twoVendorsAlike(owner.orgId, owner.userId);
    await recomputeVendorRiskLinks(owner.orgId, a);

    const res = await owner.request.get("/api/riskLinks/vendor-exposure");

    for (const risk of res.body.data.risks) {
      expect(risk).toMatchObject({ children: 0, suggested: 0 });
    }
  });

  it("queues a backfill of every active vendor risk for an administrator only", async () => {
    const { owner } = await seedTwoTenantContexts();
    await createTestVendorRisk(owner.orgId, {});
    await createTestVendorRisk(owner.orgId, {});
    const editor = await seedTwoTenantContexts(3);

    const res = await owner.request.post("/api/riskLinks/vendor-risks/recompute");
    const denied = await editor.owner.request.post("/api/riskLinks/vendor-risks/recompute");

    expect(res.status).toBe(202);
    expect(res.body.data).toEqual({ enqueued: 2 });
    expect(denied.status).toBe(403);
  });

  it("shows another organization nothing", async () => {
    const { owner, attacker } = await seedTwoTenantContexts();
    const { a } = await twoVendorsAlike(owner.orgId, owner.userId);
    await recomputeVendorRiskLinks(owner.orgId, a);
    const [row] = await pairs(owner.orgId);

    const panel = await attacker.request.get(`/api/riskLinks/vendor-risks/${a}`);
    const patch = await attacker.request
      .patch(`/api/riskLinks/${row.id}`)
      .send({ status: "confirmed" });

    expect(panel.body.data).toEqual([]);
    expect(patch.status).toBe(404);
  });
});
