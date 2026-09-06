jest.setTimeout(60000);

import { cleanupDatabase } from "./helpers";
import { sequelize } from "../../database/db";
import { seedTwoTenantContexts } from "./tenant-isolation/tenantIsolation.harness";
import { createTestRisk } from "../factories";

afterEach(async () => {
  await cleanupDatabase();
});

/*
 * Fixtures bypass the controller on purpose: they prove the AGGREGATE reads
 * what is stored. reasons carry one engine signal each; user rows carry '[]'
 * and drop out of the signal table on their own.
 */
const insertLink = (
  orgId: number,
  source: number,
  target: number,
  overrides: {
    relation?: string;
    status?: string;
    source?: string;
    reasons?: string;
    dismissReason?: string | null;
    dismissNote?: string | null;
  } = {},
) =>
  sequelize.query(
    `INSERT INTO risk_links (organization_id, source_risk_id, target_risk_id,
                             relation_type, status, source, reasons,
                             dismiss_reason, dismiss_note, decided_at)
     VALUES (:orgId, :source, :target, :relation, :status, :linkSource,
             CAST(:reasons AS JSONB), :dismissReason, :dismissNote, NOW())`,
    {
      replacements: {
        orgId,
        source,
        target,
        relation: overrides.relation ?? "related_to",
        status: overrides.status ?? "dismissed",
        linkSource: overrides.source ?? "derived",
        reasons: overrides.reasons ?? '[{"signal":"shared_category","weight":3}]',
        dismissReason: overrides.dismissReason ?? null,
        dismissNote: overrides.dismissNote ?? null,
      },
    },
  );

describe("GET /api/riskLinks/dismissals", () => {
  it("returns the three blocks, not a risk-id parse error", async () => {
    const { owner } = await seedTwoTenantContexts();
    const a = await createTestRisk(owner.orgId, {});
    const b = await createTestRisk(owner.orgId, {});
    const [s, t] = a < b ? [a, b] : [b, a];
    await insertLink(owner.orgId, s, t, { dismissReason: "too_weak" });

    const res = await owner.request.get("/api/riskLinks/dismissals");

    // The route-ordering regression this guards: /:riskId swallowing
    // "dismissals" answers 400 "Invalid risk ID".
    expect(res.status).toBe(200);
    expect(Object.keys(res.body.data).sort()).toEqual(["notes", "reasons", "signals"]);
  });

  it("reports a NULL-reason dismissal as dismissReason: null", async () => {
    const { owner } = await seedTwoTenantContexts();
    const a = await createTestRisk(owner.orgId, {});
    const b = await createTestRisk(owner.orgId, {});
    const [s, t] = a < b ? [a, b] : [b, a];
    await insertLink(owner.orgId, s, t, { dismissReason: null });

    const res = await owner.request.get("/api/riskLinks/dismissals");

    expect(res.status).toBe(200);
    const row = (res.body.data.reasons as any[]).find(
      (r) => r.relationType === "related_to" && r.status === "dismissed",
    );
    expect(row).toBeDefined();
    expect(row.dismissReason).toBeNull();
    expect("dismissReason" in row).toBe(true);
  });

  it("never shows org B's dismissals to org A", async () => {
    const { owner, attacker } = await seedTwoTenantContexts();
    const a = await createTestRisk(attacker.orgId, {});
    const b = await createTestRisk(attacker.orgId, {});
    const [s, t] = a < b ? [a, b] : [b, a];
    await insertLink(attacker.orgId, s, t, {
      dismissReason: "too_weak",
      dismissNote: "Attacker note",
    });

    const res = await owner.request.get("/api/riskLinks/dismissals");

    expect(res.status).toBe(200);
    expect(res.body.data.signals).toEqual([]);
    expect(res.body.data.reasons).toEqual([]);
    expect(res.body.data.notes).toEqual([]);
  });

  it("excludes links whose source risk was soft-deleted", async () => {
    const { owner } = await seedTwoTenantContexts();
    const a = await createTestRisk(owner.orgId, {});
    const b = await createTestRisk(owner.orgId, {});
    const [s, t] = a < b ? [a, b] : [b, a];
    await insertLink(owner.orgId, s, t, { dismissReason: "too_weak" });
    await sequelize.query(`UPDATE risks SET is_deleted = true WHERE id = :s`, {
      replacements: { s },
    });

    const res = await owner.request.get("/api/riskLinks/dismissals");

    expect(res.status).toBe(200);
    expect(res.body.data.signals).toEqual([]);
    expect(res.body.data.reasons).toEqual([]);
  });

  it("reports topReason none when most dismissals gave no reason", async () => {
    const { owner } = await seedTwoTenantContexts();
    // One signal, three reason-less dismissals, one reasoned dismissal. The
    // COALESCE inside mode() must make "none" win; without it mode() ignores
    // the NULLs and the rare "too_weak" would come back as the top reason.
    for (let i = 0; i < 3; i++) {
      const a = await createTestRisk(owner.orgId, {});
      const b = await createTestRisk(owner.orgId, {});
      const [s, t] = a < b ? [a, b] : [b, a];
      await insertLink(owner.orgId, s, t, { dismissReason: null });
    }
    const c = await createTestRisk(owner.orgId, {});
    const d = await createTestRisk(owner.orgId, {});
    const [s, t] = c < d ? [c, d] : [d, c];
    await insertLink(owner.orgId, s, t, { dismissReason: "too_weak" });

    const res = await owner.request.get("/api/riskLinks/dismissals");

    expect(res.status).toBe(200);
    const row = (res.body.data.signals as any[]).find((r) => r.signal === "shared_category");
    expect(row).toBeDefined();
    expect(row.decided).toBe(4);
    expect(row.dismissed).toBe(4);
    expect(row.topReason).toBe("none");
  });
});
