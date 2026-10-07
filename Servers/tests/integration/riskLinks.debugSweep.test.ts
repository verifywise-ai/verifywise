jest.setTimeout(120000);

/**
 * End-to-end use-case sweep over the risk-links HTTP surface.
 *
 * The riskLinks CONTROLLER layer is covered only by mocked unit tests; the
 * eleven sibling integration files exercise the query/service layer instead.
 * This file drives the real Express routes against the real test database so
 * that validation, status codes, role gates, tenant scoping and — critically —
 * the CONTENT the writes land are all asserted end to end.
 *
 * BullMQ and the notification services are mocked by ./setup, so the two
 * fan-out endpoints prove the controller's arithmetic only, never that a job
 * runs. The recompute worker itself has no real-database coverage.
 */

import http from "http";
import { QueryTypes } from "sequelize";
import { cleanupDatabase, createTestUser, createTestOrganization } from "./helpers";
import { createTestApp, testRequest } from "./setup";
import { sequelize } from "../../database/db";
import { seedTwoTenantContexts } from "./tenant-isolation/tenantIsolation.harness";
import { createTestRisk, createTestModelRisk, createTestVendorRisk } from "../factories";
import { automationQueue } from "../../services/automations/automationProducer";
import { MAX_COMPONENT_SIZE } from "../../services/riskLinks/direction/components";

const BASE = "/api/riskLinks";

afterEach(async () => {
  await cleanupDatabase();
});

/** A context for an arbitrary role name — the shared harness only maps 1/3/5. */
async function appAs(role: string, orgId: number, userId: number) {
  const app: http.Server = await createTestApp({
    bypassAuth: true,
    mockUser: { userId, organizationId: orgId, role },
  });
  return testRequest(app);
}

type TargetCol = "target_risk_id" | "target_model_risk_id" | "target_vendor_risk_id";

/** Insert a link straight into the table: POST can only ever create `confirmed`. */
async function insertLink(opts: {
  orgId: number;
  source: number;
  targetId: number;
  targetCol?: TargetCol;
  relation?: "related_to" | "inherits_from";
  status?: "suggested" | "confirmed" | "dismissed";
  origin?: "derived" | "user";
  score?: number;
}): Promise<number> {
  const col = opts.targetCol ?? "target_risk_id";
  const [rows] = await sequelize.query(
    `INSERT INTO risk_links
       (organization_id, source_risk_id, ${col}, relation_type, status, source, score)
     VALUES (:orgId, :source, :targetId, :relation, :status, :origin, :score)
     RETURNING id`,
    {
      replacements: {
        orgId: opts.orgId,
        source: opts.source,
        targetId: opts.targetId,
        relation: opts.relation ?? "inherits_from",
        status: opts.status ?? "suggested",
        origin: opts.origin ?? "derived",
        score: opts.score ?? 0,
      },
    },
  );
  return (rows as { id: number }[])[0].id;
}

async function readLink(id: number): Promise<any> {
  const rows = (await sequelize.query(`SELECT * FROM risk_links WHERE id = :id`, {
    replacements: { id },
    type: QueryTypes.SELECT,
  })) as any[];
  return rows[0];
}

const seedLLMKey = (orgId: number) =>
  sequelize.query(
    `INSERT INTO llm_keys (organization_id, key, name, model) VALUES (:orgId, 'k', 'OpenAI', 'gpt-4o')`,
    { replacements: { orgId } },
  );

// ---------------------------------------------------------------------------
// 1. Route ordering. If /:riskId swallowed these, the reply is 400 "Invalid
//    risk ID" from the NaN parse — a 403 proves the literal route matched.
// ---------------------------------------------------------------------------
describe("route ordering: literal reports are not swallowed by GET /:riskId", () => {
  it.each(["duplicates", "coverage", "dismissals"])(
    "GET /%s reaches its own handler",
    async (path) => {
      const { owner } = await seedTwoTenantContexts();
      const editor = await appAs("Editor", owner.orgId, owner.userId);

      const asEditor = await editor.get(`${BASE}/${path}`);
      expect(asEditor.status).toBe(403); // gate hit => literal route matched

      const asAdmin = await owner.request.get(`${BASE}/${path}`);
      expect(asAdmin.status).toBe(200);
    },
  );
});

// ---------------------------------------------------------------------------
// 2. Role matrix.
// ---------------------------------------------------------------------------
describe("role matrix", () => {
  const ROLES = ["Admin", "SuperAdmin", "Editor", "Reviewer", "Auditor"];

  it("org-wide reports are Admin/SuperAdmin only", async () => {
    const { owner } = await seedTwoTenantContexts();
    const observed: Record<string, number[]> = {};
    for (const role of ROLES) {
      const agent = await appAs(role, owner.orgId, owner.userId);
      observed[role] = [
        (await agent.get(`${BASE}/`)).status,
        (await agent.get(`${BASE}/dismissals`)).status,
        (await agent.get(`${BASE}/duplicates`)).status,
        (await agent.get(`${BASE}/coverage`)).status,
      ];
    }
    expect(observed.Admin).toEqual([200, 200, 200, 200]);
    expect(observed.SuperAdmin).toEqual([200, 200, 200, 200]);
    expect(observed.Editor).toEqual([403, 403, 403, 403]);
    expect(observed.Reviewer).toEqual([403, 403, 403, 403]);
    expect(observed.Auditor).toEqual([403, 403, 403, 403]);
  });

  it("per-risk reads are open to every authenticated role", async () => {
    const { owner } = await seedTwoTenantContexts();
    const risk = await createTestRisk(owner.orgId, {});
    for (const role of ROLES) {
      const agent = await appAs(role, owner.orgId, owner.userId);
      expect((await agent.get(`${BASE}/${risk}`)).status).toBe(200);
      expect((await agent.get(`${BASE}/${risk}/shared-projects`)).status).toBe(200);
    }
  });

  it("writes follow the documented matrix", async () => {
    const { owner } = await seedTwoTenantContexts();
    const child = await createTestRisk(owner.orgId, {});
    const parent = await createTestRisk(owner.orgId, {});

    const post: Record<string, number> = {};
    const patch: Record<string, number> = {};
    const ack: Record<string, number> = {};
    for (const role of ROLES) {
      const agent = await appAs(role, owner.orgId, owner.userId);
      // Unparseable ids on purpose: a 400 proves the gate was PASSED, a 403
      // proves it was not. This keeps the matrix free of write side effects.
      post[role] = (await agent.post(`${BASE}/`).send({})).status;
      patch[role] = (await agent.patch(`${BASE}/abc`).send({ status: "confirmed" })).status;
      ack[role] = (await agent.post(`${BASE}/abc/acknowledge-parent-change`)).status;
    }
    expect(post).toEqual({ Admin: 400, Editor: 400, SuperAdmin: 403, Reviewer: 403, Auditor: 403 });
    expect(patch).toEqual({
      Admin: 400,
      Editor: 400,
      Reviewer: 400,
      SuperAdmin: 403,
      Auditor: 403,
    });
    expect(ack).toEqual({ Admin: 400, Editor: 400, SuperAdmin: 403, Reviewer: 403, Auditor: 403 });
    expect(child).toBeGreaterThan(0);
    expect(parent).toBeGreaterThan(0);
  });

  it("fan-out endpoints are Admin/SuperAdmin only", async () => {
    const { owner } = await seedTwoTenantContexts();
    const observed: Record<string, number[]> = {};
    for (const role of ROLES) {
      const agent = await appAs(role, owner.orgId, owner.userId);
      observed[role] = [
        (await agent.post(`${BASE}/recompute`)).status,
        (await agent.post(`${BASE}/suggest-hierarchy`)).status,
      ];
    }
    expect(observed.Admin).toEqual([202, 400]); // 400 = no LLM key configured
    expect(observed.SuperAdmin).toEqual([202, 400]);
    expect(observed.Editor).toEqual([403, 403]);
    expect(observed.Reviewer).toEqual([403, 403]);
    expect(observed.Auditor).toEqual([403, 403]);
  });
});

// ---------------------------------------------------------------------------
// 3. Status transition matrix (ALLOWED_TRANSITIONS, all nine cells).
// ---------------------------------------------------------------------------
describe("status transition matrix", () => {
  const STATUSES = ["suggested", "confirmed", "dismissed"] as const;
  const LEGAL: Record<string, string[]> = {
    suggested: ["confirmed", "dismissed"],
    confirmed: ["dismissed"],
    dismissed: ["confirmed", "suggested"],
  };

  it.each(STATUSES)("from %s", async (from) => {
    const { owner } = await seedTwoTenantContexts();
    for (const to of STATUSES) {
      const child = await createTestRisk(owner.orgId, {});
      const parent = await createTestRisk(owner.orgId, {});
      const id = await insertLink({
        orgId: owner.orgId,
        source: child,
        targetId: parent,
        relation: "related_to",
        status: from,
      });
      const res = await owner.request.patch(`${BASE}/${id}`).send({ status: to });
      if (LEGAL[from].includes(to)) {
        expect([res.status, from, to]).toEqual([200, from, to]);
      } else {
        expect([res.status, from, to]).toEqual([400, from, to]);
        expect(res.body.data).toContain(`from ${from} to ${to}`);
      }
    }
  });

  it("404s a link that does not exist, and one in another tenant", async () => {
    const { owner, attacker } = await seedTwoTenantContexts();
    const child = await createTestRisk(attacker.orgId, {});
    const parent = await createTestRisk(attacker.orgId, {});
    const foreign = await insertLink({
      orgId: attacker.orgId,
      source: child,
      targetId: parent,
      relation: "related_to",
    });

    expect((await owner.request.patch(`${BASE}/999999`).send({ status: "confirmed" })).status).toBe(
      404,
    );
    expect(
      (await owner.request.patch(`${BASE}/${foreign}`).send({ status: "confirmed" })).status,
    ).toBe(404);
    // ...and the foreign row is untouched.
    expect((await readLink(foreign)).status).toBe("suggested");
  });

  it("rejects a missing or unknown status", async () => {
    const { owner } = await seedTwoTenantContexts();
    const child = await createTestRisk(owner.orgId, {});
    const parent = await createTestRisk(owner.orgId, {});
    const id = await insertLink({
      orgId: owner.orgId,
      source: child,
      targetId: parent,
      relation: "related_to",
    });

    expect((await owner.request.patch(`${BASE}/${id}`).send({})).status).toBe(400);
    expect((await owner.request.patch(`${BASE}/${id}`).send({ status: "deleted" })).status).toBe(
      400,
    );
    expect((await owner.request.patch(`${BASE}/${id}`).send({ status: 7 })).status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// 4. Dismiss reason / note matrix.
// ---------------------------------------------------------------------------
describe("dismiss reason matrix", () => {
  async function suggested(orgId: number, relation: "related_to" | "inherits_from") {
    const child = await createTestRisk(orgId, {});
    const parent = await createTestRisk(orgId, {});
    const [a, b] =
      relation === "related_to"
        ? [Math.min(child, parent), Math.max(child, parent)]
        : [child, parent];
    return insertLink({ orgId, source: a, targetId: b, relation, status: "suggested" });
  }

  it("accepts each reason only for its own relation type", async () => {
    const { owner } = await seedTwoTenantContexts();
    const RELATED = ["not_related", "too_weak", "duplicate"];
    const INHERITS = ["wrong_direction", "wrong_parent", "not_hierarchical"];

    for (const reason of [...RELATED, ...INHERITS]) {
      for (const relation of ["related_to", "inherits_from"] as const) {
        const id = await suggested(owner.orgId, relation);
        const res = await owner.request
          .patch(`${BASE}/${id}`)
          .send({ status: "dismissed", dismissReason: reason });
        const expected = (relation === "related_to" ? RELATED : INHERITS).includes(reason)
          ? 200
          : 400;
        expect([res.status, relation, reason]).toEqual([expected, relation, reason]);
        if (expected === 200) expect((await readLink(id)).dismiss_reason).toBe(reason);
      }
    }
  });

  it("requires a note for `other`, and trims whitespace-only notes", async () => {
    const { owner } = await seedTwoTenantContexts();
    const bare = await suggested(owner.orgId, "related_to");
    expect(
      (
        await owner.request
          .patch(`${BASE}/${bare}`)
          .send({ status: "dismissed", dismissReason: "other" })
      ).status,
    ).toBe(400);

    const blank = await suggested(owner.orgId, "related_to");
    expect(
      (
        await owner.request
          .patch(`${BASE}/${blank}`)
          .send({ status: "dismissed", dismissReason: "other", dismissNote: "   " })
      ).status,
    ).toBe(400);

    const ok = await suggested(owner.orgId, "related_to");
    expect(
      (
        await owner.request
          .patch(`${BASE}/${ok}`)
          .send({ status: "dismissed", dismissReason: "other", dismissNote: "  real reason  " })
      ).status,
    ).toBe(200);
    expect((await readLink(ok)).dismiss_note).toBe("real reason");
  });

  it("caps the note at 500 characters", async () => {
    const { owner } = await seedTwoTenantContexts();
    const at = await suggested(owner.orgId, "related_to");
    expect(
      (
        await owner.request
          .patch(`${BASE}/${at}`)
          .send({ status: "dismissed", dismissReason: "other", dismissNote: "x".repeat(500) })
      ).status,
    ).toBe(200);

    const over = await suggested(owner.orgId, "related_to");
    const res = await owner.request
      .patch(`${BASE}/${over}`)
      .send({ status: "dismissed", dismissReason: "other", dismissNote: "x".repeat(501) });
    expect(res.status).toBe(400);
    // A 500 here would mean the VARCHAR(500) column, not the validator, stopped it.
    expect(res.body.data).toMatch(/500 characters/);
  });

  it("rejects a note with no reason, and a non-string note", async () => {
    const { owner } = await seedTwoTenantContexts();
    const noReason = await suggested(owner.orgId, "related_to");
    expect(
      (
        await owner.request
          .patch(`${BASE}/${noReason}`)
          .send({ status: "dismissed", dismissNote: "hi" })
      ).status,
    ).toBe(400);

    const badNote = await suggested(owner.orgId, "related_to");
    expect(
      (
        await owner.request
          .patch(`${BASE}/${badNote}`)
          .send({ status: "dismissed", dismissReason: "too_weak", dismissNote: 42 })
      ).status,
    ).toBe(400);
  });

  it("rejects a reason on any transition that is not a dismissal of a suggestion", async () => {
    const { owner } = await seedTwoTenantContexts();
    const toConfirm = await suggested(owner.orgId, "related_to");
    expect(
      (
        await owner.request
          .patch(`${BASE}/${toConfirm}`)
          .send({ status: "confirmed", dismissReason: "too_weak" })
      ).status,
    ).toBe(400);

    const child = await createTestRisk(owner.orgId, {});
    const parent = await createTestRisk(owner.orgId, {});
    const alreadyConfirmed = await insertLink({
      orgId: owner.orgId,
      source: Math.min(child, parent),
      targetId: Math.max(child, parent),
      relation: "related_to",
      status: "confirmed",
    });
    const res = await owner.request
      .patch(`${BASE}/${alreadyConfirmed}`)
      .send({ status: "dismissed", dismissReason: "too_weak" });
    expect(res.status).toBe(400);
    // confirmed -> dismissed with NO reason must still work.
    expect(
      (await owner.request.patch(`${BASE}/${alreadyConfirmed}`).send({ status: "dismissed" }))
        .status,
    ).toBe(200);
  });
});

// ---------------------------------------------------------------------------
// 5. What the writes actually land.
// ---------------------------------------------------------------------------
describe("written row content", () => {
  it("confirm stamps the deciding user; undo to suggested erases the whole decision", async () => {
    const { owner } = await seedTwoTenantContexts();
    const child = await createTestRisk(owner.orgId, {});
    const parent = await createTestRisk(owner.orgId, {});
    const id = await insertLink({
      orgId: owner.orgId,
      source: Math.min(child, parent),
      targetId: Math.max(child, parent),
      relation: "related_to",
      status: "suggested",
    });

    await owner.request
      .patch(`${BASE}/${id}`)
      .send({ status: "dismissed", dismissReason: "other", dismissNote: "not the same thing" })
      .expect(200);
    let row = await readLink(id);
    expect(row.dismiss_reason).toBe("other");
    expect(row.dismiss_note).toBe("not the same thing");
    expect(row.decided_by_user_id).toBe(owner.userId);
    expect(row.decided_at).not.toBeNull();

    await owner.request.patch(`${BASE}/${id}`).send({ status: "suggested" }).expect(200);
    row = await readLink(id);
    expect(row.status).toBe("suggested");
    expect(row.dismiss_reason).toBeNull();
    expect(row.dismiss_note).toBeNull();
    expect(row.decided_by_user_id).toBeNull();
    expect(row.decided_at).toBeNull();
  });

  it("confirming after a dismissal clears the stale reason", async () => {
    const { owner } = await seedTwoTenantContexts();
    const child = await createTestRisk(owner.orgId, {});
    const parent = await createTestRisk(owner.orgId, {});
    const id = await insertLink({
      orgId: owner.orgId,
      source: Math.min(child, parent),
      targetId: Math.max(child, parent),
      relation: "related_to",
      status: "suggested",
    });
    await owner.request
      .patch(`${BASE}/${id}`)
      .send({ status: "dismissed", dismissReason: "too_weak" })
      .expect(200);
    await owner.request.patch(`${BASE}/${id}`).send({ status: "confirmed" }).expect(200);

    const row = await readLink(id);
    expect(row.status).toBe("confirmed");
    expect(row.dismiss_reason).toBeNull();
    expect(row.decided_by_user_id).toBe(owner.userId);
  });

  it("POST stores a human link as confirmed/user with both decision stamps", async () => {
    const { owner } = await seedTwoTenantContexts();
    const child = await createTestRisk(owner.orgId, {});
    const parent = await createTestRisk(owner.orgId, {});
    const res = await owner.request
      .post(`${BASE}/`)
      .send({ sourceRiskId: child, targetRiskId: parent, relationType: "inherits_from" });
    expect(res.status).toBe(201);

    const row = await readLink(res.body.data.id);
    expect(row.status).toBe("confirmed");
    expect(row.source).toBe("user");
    expect(row.source_risk_id).toBe(child);
    expect(row.target_risk_id).toBe(parent);
    expect(row.created_by_user_id).toBe(owner.userId);
    expect(row.decided_by_user_id).toBe(owner.userId);
    expect(Number(row.score)).toBe(0);
    expect(row.reasons).toEqual([]);
  });

  it("acknowledge nulls the stale flag and is idempotent", async () => {
    const { owner } = await seedTwoTenantContexts();
    const child = await createTestRisk(owner.orgId, {});
    const parent = await createTestRisk(owner.orgId, {});
    const id = await insertLink({
      orgId: owner.orgId,
      source: child,
      targetId: parent,
      relation: "inherits_from",
      status: "confirmed",
    });
    await sequelize.query(`UPDATE risk_links SET parent_level_changed_at = NOW() WHERE id = :id`, {
      replacements: { id },
    });

    expect((await owner.request.post(`${BASE}/${id}/acknowledge-parent-change`)).status).toBe(200);
    expect((await readLink(id)).parent_level_changed_at).toBeNull();
    expect((await owner.request.post(`${BASE}/${id}/acknowledge-parent-change`)).status).toBe(200);
    expect((await owner.request.post(`${BASE}/999999/acknowledge-parent-change`)).status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// 6. The race the app-level check cannot close (H-A).
// ---------------------------------------------------------------------------
describe("concurrent confirm of two competing parents", () => {
  it("answers the loser with 409, never 500", async () => {
    const { owner } = await seedTwoTenantContexts();
    const child = await createTestRisk(owner.orgId, {});
    const parentA = await createTestRisk(owner.orgId, {});
    const parentB = await createTestRisk(owner.orgId, {});
    const linkA = await insertLink({ orgId: owner.orgId, source: child, targetId: parentA });
    const linkB = await insertLink({ orgId: owner.orgId, source: child, targetId: parentB });

    const [resA, resB] = await Promise.all([
      testRequest(owner.app).patch(`${BASE}/${linkA}`).send({ status: "confirmed" }),
      testRequest(owner.app).patch(`${BASE}/${linkB}`).send({ status: "confirmed" }),
    ]);

    const codes = [resA.status, resB.status].sort();
    expect(codes).toEqual([200, 409]);

    const confirmed = (await sequelize.query(
      `SELECT count(*)::int AS n FROM risk_links
        WHERE source_risk_id = :child AND relation_type = 'inherits_from' AND status = 'confirmed'`,
      { replacements: { child }, type: QueryTypes.SELECT },
    )) as { n: number }[];
    expect(confirmed[0].n).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// 7. Cross-entity parents (H-B).
// ---------------------------------------------------------------------------
describe("cross-entity parents", () => {
  it("links a risk to a model risk and to a vendor risk", async () => {
    const { owner } = await seedTwoTenantContexts();
    const childM = await createTestRisk(owner.orgId, {});
    const modelRisk = await createTestModelRisk(owner.orgId, {});
    const m = await owner.request
      .post(`${BASE}/`)
      .send({ sourceRiskId: childM, targetModelRiskId: modelRisk, relationType: "inherits_from" });
    expect(m.status).toBe(201);
    expect((await readLink(m.body.data.id)).target_model_risk_id).toBe(modelRisk);

    const childV = await createTestRisk(owner.orgId, {});
    const vendorRisk = await createTestVendorRisk(owner.orgId, {});
    const v = await owner.request.post(`${BASE}/`).send({
      sourceRiskId: childV,
      targetVendorRiskId: vendorRisk,
      relationType: "inherits_from",
    });
    expect(v.status).toBe(201);
    expect((await readLink(v.body.data.id)).target_vendor_risk_id).toBe(vendorRisk);
  });

  it("refuses a second parent when the first is in a different table", async () => {
    const { owner } = await seedTwoTenantContexts();
    const child = await createTestRisk(owner.orgId, {});
    const riskParent = await createTestRisk(owner.orgId, {});
    const modelRisk = await createTestModelRisk(owner.orgId, {});

    await owner.request
      .post(`${BASE}/`)
      .send({ sourceRiskId: child, targetRiskId: riskParent, relationType: "inherits_from" })
      .expect(201);

    const res = await owner.request
      .post(`${BASE}/`)
      .send({ sourceRiskId: child, targetModelRiskId: modelRisk, relationType: "inherits_from" });
    expect(res.status).toBe(409);
  });

  it("refuses the same collision through PATCH confirm", async () => {
    const { owner } = await seedTwoTenantContexts();
    const child = await createTestRisk(owner.orgId, {});
    const riskParent = await createTestRisk(owner.orgId, {});
    const vendorRisk = await createTestVendorRisk(owner.orgId, {});

    await insertLink({
      orgId: owner.orgId,
      source: child,
      targetId: riskParent,
      relation: "inherits_from",
      status: "confirmed",
    });
    const pending = await insertLink({
      orgId: owner.orgId,
      source: child,
      targetId: vendorRisk,
      targetCol: "target_vendor_risk_id",
      relation: "inherits_from",
      status: "suggested",
    });

    const res = await owner.request.patch(`${BASE}/${pending}`).send({ status: "confirmed" });
    expect(res.status).toBe(409);
  });

  it("rejects a cross-entity related_to", async () => {
    const { owner } = await seedTwoTenantContexts();
    const child = await createTestRisk(owner.orgId, {});
    const modelRisk = await createTestModelRisk(owner.orgId, {});
    const res = await owner.request
      .post(`${BASE}/`)
      .send({ sourceRiskId: child, targetModelRiskId: modelRisk, relationType: "related_to" });
    expect(res.status).toBe(400);
  });

  it("rejects a cross-entity parent from another tenant", async () => {
    const { owner, attacker } = await seedTwoTenantContexts();
    const child = await createTestRisk(owner.orgId, {});
    const foreignModelRisk = await createTestModelRisk(attacker.orgId, {});
    const res = await owner.request.post(`${BASE}/`).send({
      sourceRiskId: child,
      targetModelRiskId: foreignModelRisk,
      relationType: "inherits_from",
    });
    expect(res.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// 8. Two-level rule + canonicalisation on POST.
// ---------------------------------------------------------------------------
describe("POST two-level rule and canonicalisation", () => {
  it("refuses a grandparent chain from both ends", async () => {
    const { owner } = await seedTwoTenantContexts();
    const a = await createTestRisk(owner.orgId, {});
    const b = await createTestRisk(owner.orgId, {});
    const c = await createTestRisk(owner.orgId, {});

    // b inherits from a. Now a must not become a child, and b must not become a parent.
    await owner.request
      .post(`${BASE}/`)
      .send({ sourceRiskId: b, targetRiskId: a, relationType: "inherits_from" })
      .expect(201);

    expect(
      (
        await owner.request
          .post(`${BASE}/`)
          .send({ sourceRiskId: a, targetRiskId: c, relationType: "inherits_from" })
      ).status,
    ).toBe(409); // a already has children
    expect(
      (
        await owner.request
          .post(`${BASE}/`)
          .send({ sourceRiskId: c, targetRiskId: b, relationType: "inherits_from" })
      ).status,
    ).toBe(409); // b is already a child
  });

  it("stores related_to canonically and treats the reverse as a duplicate", async () => {
    const { owner } = await seedTwoTenantContexts();
    const x = await createTestRisk(owner.orgId, {});
    const y = await createTestRisk(owner.orgId, {});
    const [lo, hi] = [Math.min(x, y), Math.max(x, y)];

    // Deliberately the non-canonical order.
    const first = await owner.request
      .post(`${BASE}/`)
      .send({ sourceRiskId: hi, targetRiskId: lo, relationType: "related_to" });
    expect(first.status).toBe(201);
    const row = await readLink(first.body.data.id);
    expect(row.source_risk_id).toBe(lo);
    expect(row.target_risk_id).toBe(hi);

    const reverse = await owner.request
      .post(`${BASE}/`)
      .send({ sourceRiskId: lo, targetRiskId: hi, relationType: "related_to" });
    expect(reverse.status).toBe(409);

    const count = (await sequelize.query(
      `SELECT count(*)::int AS n FROM risk_links WHERE relation_type = 'related_to'`,
      { type: QueryTypes.SELECT },
    )) as { n: number }[];
    expect(count[0].n).toBe(1);
  });

  it("allows related_to and inherits_from to coexist for the same pair", async () => {
    const { owner } = await seedTwoTenantContexts();
    const child = await createTestRisk(owner.orgId, {});
    const parent = await createTestRisk(owner.orgId, {});
    await owner.request
      .post(`${BASE}/`)
      .send({ sourceRiskId: child, targetRiskId: parent, relationType: "related_to" })
      .expect(201);
    await owner.request
      .post(`${BASE}/`)
      .send({ sourceRiskId: child, targetRiskId: parent, relationType: "inherits_from" })
      .expect(201);
  });
});

// ---------------------------------------------------------------------------
// 9. Malformed input (H-F).
// ---------------------------------------------------------------------------
describe("malformed input", () => {
  it("rejects an unparseable risk id on every param route", async () => {
    const { owner } = await seedTwoTenantContexts();
    expect((await owner.request.get(`${BASE}/abc`)).status).toBe(400);
    expect((await owner.request.get(`${BASE}/abc/shared-projects`)).status).toBe(400);
    expect((await owner.request.patch(`${BASE}/abc`).send({ status: "confirmed" })).status).toBe(
      400,
    );
    expect((await owner.request.post(`${BASE}/abc/acknowledge-parent-change`)).status).toBe(400);
  });

  it("rejects a bad status filter, including a repeated query param", async () => {
    const { owner } = await seedTwoTenantContexts();
    const risk = await createTestRisk(owner.orgId, {});
    expect((await owner.request.get(`${BASE}/${risk}?status=garbage`)).status).toBe(400);
    expect(
      (await owner.request.get(`${BASE}/${risk}?status=suggested&status=confirmed`)).status,
    ).toBe(400);
    expect((await owner.request.get(`${BASE}/?status=garbage`)).status).toBe(400);
    expect((await owner.request.get(`${BASE}/${risk}?status=dismissed`)).status).toBe(200);
  });

  it("rejects a payload with no target, several targets, or a self link", async () => {
    const { owner } = await seedTwoTenantContexts();
    const a = await createTestRisk(owner.orgId, {});
    const b = await createTestRisk(owner.orgId, {});
    const mr = await createTestModelRisk(owner.orgId, {});

    expect(
      (await owner.request.post(`${BASE}/`).send({ sourceRiskId: a, relationType: "related_to" }))
        .status,
    ).toBe(400);
    expect(
      (
        await owner.request.post(`${BASE}/`).send({
          sourceRiskId: a,
          targetRiskId: b,
          targetModelRiskId: mr,
          relationType: "inherits_from",
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await owner.request
          .post(`${BASE}/`)
          .send({ sourceRiskId: a, targetRiskId: a, relationType: "related_to" })
      ).status,
    ).toBe(400);
    expect(
      (
        await owner.request
          .post(`${BASE}/`)
          .send({ sourceRiskId: a, targetRiskId: b, relationType: "causes" })
      ).status,
    ).toBe(400);
    expect(
      (await owner.request.post(`${BASE}/`).send({ targetRiskId: b, relationType: "related_to" }))
        .status,
    ).toBe(400);
  });

  it("does not salvage a junk target id into a link to a different risk", async () => {
    const { owner } = await seedTwoTenantContexts();
    const a = await createTestRisk(owner.orgId, {});
    const b = await createTestRisk(owner.orgId, {});

    // Every shape below is salvaged by parseInt(String(x), 10) into exactly `b`.
    const shapes: [string, unknown][] = [
      ["trailing text", `${b}abc`],
      ["array", [b]],
      ["float", b + 0.9],
      ["leading plus", `+${b}`],
      ["hex-ish", `${b}e0`],
    ];
    const observed: Record<string, number> = {};
    for (const [label, targetRiskId] of shapes) {
      const res = await owner.request
        .post(`${BASE}/`)
        .send({ sourceRiskId: a, targetRiskId, relationType: "related_to" });
      observed[label] = res.status;
    }
    expect(observed).toEqual({
      "trailing text": 400,
      array: 400,
      float: 400,
      "leading plus": 400,
      "hex-ish": 400,
    });

    // Nothing was written by any of them.
    const count = (await sequelize.query(`SELECT count(*)::int AS n FROM risk_links`, {
      type: QueryTypes.SELECT,
    })) as { n: number }[];
    expect(count[0].n).toBe(0);
  });

  it("does not salvage a junk source id either", async () => {
    const { owner } = await seedTwoTenantContexts();
    const a = await createTestRisk(owner.orgId, {});
    const b = await createTestRisk(owner.orgId, {});
    const res = await owner.request
      .post(`${BASE}/`)
      .send({ sourceRiskId: `${a}abc`, targetRiskId: b, relationType: "related_to" });
    expect(res.status).toBe(400);
  });

  it("does not salvage a junk id in the URL", async () => {
    const { owner } = await seedTwoTenantContexts();
    const child = await createTestRisk(owner.orgId, {});
    const parent = await createTestRisk(owner.orgId, {});
    const id = await insertLink({
      orgId: owner.orgId,
      source: child,
      targetId: parent,
      status: "confirmed",
    });

    // `${child}abc` used to parse to `child` and answer with that risk's links.
    expect((await owner.request.get(`${BASE}/${child}abc`)).status).toBe(400);
    expect((await owner.request.get(`${BASE}/${child}abc/shared-projects`)).status).toBe(400);
    expect(
      (await owner.request.patch(`${BASE}/${id}abc`).send({ status: "dismissed" })).status,
    ).toBe(400);
    expect((await owner.request.post(`${BASE}/${id}abc/acknowledge-parent-change`)).status).toBe(
      400,
    );
    // The real link is untouched.
    expect((await readLink(id)).status).toBe("confirmed");
  });

  it("still accepts a clean numeric string, as JSON bodies and URLs produce", async () => {
    const { owner } = await seedTwoTenantContexts();
    const a = await createTestRisk(owner.orgId, {});
    const b = await createTestRisk(owner.orgId, {});
    const res = await owner.request
      .post(`${BASE}/`)
      .send({ sourceRiskId: String(a), targetRiskId: String(b), relationType: "related_to" });
    expect(res.status).toBe(201);
    expect((await owner.request.get(`${BASE}/${a}`)).body.data).toHaveLength(1);
  });

  it("404s a target risk id of 0 and a non-existent one", async () => {
    const { owner } = await seedTwoTenantContexts();
    const a = await createTestRisk(owner.orgId, {});
    expect(
      (
        await owner.request
          .post(`${BASE}/`)
          .send({ sourceRiskId: a, targetRiskId: 0, relationType: "related_to" })
      ).status,
    ).toBe(404);
    expect(
      (
        await owner.request
          .post(`${BASE}/`)
          .send({ sourceRiskId: a, targetRiskId: 999999, relationType: "related_to" })
      ).status,
    ).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// 10. Tenant scoping of the read paths.
// ---------------------------------------------------------------------------
describe("tenant scoping", () => {
  it("hides another tenant's links from every read", async () => {
    const { owner, attacker } = await seedTwoTenantContexts();
    const child = await createTestRisk(attacker.orgId, {});
    const parent = await createTestRisk(attacker.orgId, {});
    await insertLink({
      orgId: attacker.orgId,
      source: child,
      targetId: parent,
      status: "confirmed",
    });

    expect((await owner.request.get(`${BASE}/${child}`)).body.data).toEqual([]);
    expect((await owner.request.get(`${BASE}/`)).body.data.edges).toEqual([]);
    expect((await owner.request.get(`${BASE}/${child}/shared-projects`)).body.data).toEqual([]);
    // The attacker still sees its own.
    expect((await attacker.request.get(`${BASE}/${child}`)).body.data).toHaveLength(1);
  });

  it("refuses to link across tenants", async () => {
    const { owner, attacker } = await seedTwoTenantContexts();
    const mine = await createTestRisk(owner.orgId, {});
    const theirs = await createTestRisk(attacker.orgId, {});
    expect(
      (
        await owner.request
          .post(`${BASE}/`)
          .send({ sourceRiskId: mine, targetRiskId: theirs, relationType: "related_to" })
      ).status,
    ).toBe(404);
    expect(
      (
        await owner.request
          .post(`${BASE}/`)
          .send({ sourceRiskId: theirs, targetRiskId: mine, relationType: "related_to" })
      ).status,
    ).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// 11. Soft delete (R7): the read hides what the write leaves behind.
// ---------------------------------------------------------------------------
describe("soft-deleted endpoints", () => {
  it("drops the edge from the panel and the graph when either end dies", async () => {
    const { owner } = await seedTwoTenantContexts();
    const child = await createTestRisk(owner.orgId, {});
    const parent = await createTestRisk(owner.orgId, {});
    await insertLink({ orgId: owner.orgId, source: child, targetId: parent, status: "confirmed" });

    expect((await owner.request.get(`${BASE}/${child}`)).body.data).toHaveLength(1);
    expect((await owner.request.get(`${BASE}/`)).body.data.edges).toHaveLength(1);

    await sequelize.query(`UPDATE risks SET is_deleted = true WHERE id = :parent`, {
      replacements: { parent },
    });

    expect((await owner.request.get(`${BASE}/${child}`)).body.data).toEqual([]);
    expect((await owner.request.get(`${BASE}/`)).body.data.edges).toEqual([]);
  });

  it("returns an empty list for a soft-deleted subject", async () => {
    const { owner } = await seedTwoTenantContexts();
    const child = await createTestRisk(owner.orgId, {});
    const parent = await createTestRisk(owner.orgId, {});
    await insertLink({ orgId: owner.orgId, source: child, targetId: parent, status: "confirmed" });
    await sequelize.query(`UPDATE risks SET is_deleted = true WHERE id = :child`, {
      replacements: { child },
    });
    expect((await owner.request.get(`${BASE}/${child}`)).body.data).toEqual([]);
  });

  it("drops the edge when a cross-entity parent is soft-deleted", async () => {
    const { owner } = await seedTwoTenantContexts();
    const child = await createTestRisk(owner.orgId, {});
    const modelRisk = await createTestModelRisk(owner.orgId, {});
    await insertLink({
      orgId: owner.orgId,
      source: child,
      targetId: modelRisk,
      targetCol: "target_model_risk_id",
      status: "confirmed",
    });
    expect((await owner.request.get(`${BASE}/${child}`)).body.data).toHaveLength(1);

    await sequelize.query(`UPDATE model_risks SET is_deleted = true WHERE id = :modelRisk`, {
      replacements: { modelRisk },
    });
    expect((await owner.request.get(`${BASE}/${child}`)).body.data).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// 12. Graph shape and the edge cap.
// ---------------------------------------------------------------------------
describe("graph payload", () => {
  it("dedupes nodes and names both endpoints", async () => {
    const { owner } = await seedTwoTenantContexts();
    const hub = await createTestRisk(owner.orgId, { risk_name: "Hub risk" });
    const a = await createTestRisk(owner.orgId, { risk_name: "Leaf A" });
    const b = await createTestRisk(owner.orgId, { risk_name: "Leaf B" });
    await insertLink({ orgId: owner.orgId, source: a, targetId: hub, status: "confirmed" });
    await insertLink({ orgId: owner.orgId, source: b, targetId: hub, status: "confirmed" });

    const res = await owner.request.get(`${BASE}/`);
    expect(res.status).toBe(200);
    expect(res.body.data.edges).toHaveLength(2);
    expect(res.body.data.nodes).toHaveLength(3);
    expect(res.body.data.truncated).toBe(false);
    expect(res.body.data.nodes.map((n: any) => n.key).sort()).toEqual(
      [`risk:${hub}`, `risk:${a}`, `risk:${b}`].sort(),
    );
  });

  it("truncates at the cap and reports it", async () => {
    const { owner } = await seedTwoTenantContexts();
    const parent = await createTestRisk(owner.orgId, {});
    const [children] = await sequelize.query(
      `INSERT INTO risks (organization_id, risk_name, created_at, updated_at)
       SELECT :orgId, 'bulk ' || g, NOW(), NOW() FROM generate_series(1, 501) g
       RETURNING id`,
      { replacements: { orgId: owner.orgId } },
    );
    const ids = (children as { id: number }[]).map((r) => r.id);
    await sequelize.query(
      `INSERT INTO risk_links (organization_id, source_risk_id, target_risk_id, relation_type, status, source)
       SELECT :orgId, id, :parent, 'inherits_from', 'suggested', 'derived'
         FROM risks WHERE id IN (:ids)`,
      { replacements: { orgId: owner.orgId, parent, ids } },
    );

    const res = await owner.request.get(`${BASE}/`);
    expect(res.status).toBe(200);
    expect(res.body.data.edges).toHaveLength(500);
    expect(res.body.data.truncated).toBe(true);
  });

  it("filters by status", async () => {
    const { owner } = await seedTwoTenantContexts();
    const c1 = await createTestRisk(owner.orgId, {});
    const c2 = await createTestRisk(owner.orgId, {});
    const p = await createTestRisk(owner.orgId, {});
    await insertLink({ orgId: owner.orgId, source: c1, targetId: p, status: "confirmed" });
    await insertLink({ orgId: owner.orgId, source: c2, targetId: p, status: "dismissed" });

    expect((await owner.request.get(`${BASE}/`)).body.data.edges).toHaveLength(1);
    expect((await owner.request.get(`${BASE}/?status=dismissed`)).body.data.edges).toHaveLength(1);
    expect((await owner.request.get(`${BASE}/?status=suggested`)).body.data.edges).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// 13. Per-risk read shape.
// ---------------------------------------------------------------------------
describe("per-risk read shape", () => {
  it("reports direction from the subject's point of view", async () => {
    const { owner } = await seedTwoTenantContexts();
    const child = await createTestRisk(owner.orgId, {});
    const parent = await createTestRisk(owner.orgId, {});
    await insertLink({ orgId: owner.orgId, source: child, targetId: parent, status: "confirmed" });

    const fromChild = (await owner.request.get(`${BASE}/${child}`)).body.data;
    expect(fromChild).toHaveLength(1);
    expect(fromChild[0].direction).toBe("outgoing");
    expect(fromChild[0].relatedRisk.id).toBe(parent);

    const fromParent = (await owner.request.get(`${BASE}/${parent}`)).body.data;
    expect(fromParent).toHaveLength(1);
    expect(fromParent[0].direction).toBe("incoming");
    expect(fromParent[0].relatedRisk.id).toBe(child);
  });

  it("reports related_to as undirected from both ends", async () => {
    const { owner } = await seedTwoTenantContexts();
    const x = await createTestRisk(owner.orgId, {});
    const y = await createTestRisk(owner.orgId, {});
    await insertLink({
      orgId: owner.orgId,
      source: Math.min(x, y),
      targetId: Math.max(x, y),
      relation: "related_to",
      status: "confirmed",
    });
    expect((await owner.request.get(`${BASE}/${x}`)).body.data[0].direction).toBe("undirected");
    expect((await owner.request.get(`${BASE}/${y}`)).body.data[0].direction).toBe("undirected");
  });

  it("defaults to suggested + confirmed and hides dismissed", async () => {
    const { owner } = await seedTwoTenantContexts();
    const subject = await createTestRisk(owner.orgId, {});
    for (const status of ["suggested", "confirmed", "dismissed"] as const) {
      const other = await createTestRisk(owner.orgId, {});
      await insertLink({ orgId: owner.orgId, source: subject, targetId: other, status });
    }
    expect((await owner.request.get(`${BASE}/${subject}`)).body.data).toHaveLength(2);
    expect((await owner.request.get(`${BASE}/${subject}?status=dismissed`)).body.data).toHaveLength(
      1,
    );
  });

  it("names a cross-entity parent and falls back when the name is empty", async () => {
    const { owner } = await seedTwoTenantContexts();
    const child = await createTestRisk(owner.orgId, {});
    const named = await createTestModelRisk(owner.orgId, { risk_name: "Drift in scoring model" });
    const blank = await createTestVendorRisk(owner.orgId, { risk_description: "" });
    await insertLink({
      orgId: owner.orgId,
      source: child,
      targetId: named,
      targetCol: "target_model_risk_id",
      status: "confirmed",
    });
    const child2 = await createTestRisk(owner.orgId, {});
    await insertLink({
      orgId: owner.orgId,
      source: child2,
      targetId: blank,
      targetCol: "target_vendor_risk_id",
      status: "confirmed",
    });

    const m = (await owner.request.get(`${BASE}/${child}`)).body.data[0];
    expect(m.relatedRisk.entityType).toBe("model_risk");
    expect(m.relatedRisk.name).toBe("Drift in scoring model");

    const v = (await owner.request.get(`${BASE}/${child2}`)).body.data[0];
    expect(v.relatedRisk.entityType).toBe("vendor_risk");
    expect(v.relatedRisk.name).toBe("Untitled vendor risk");
  });
});

// ---------------------------------------------------------------------------
// 14. Fan-out endpoints.
// ---------------------------------------------------------------------------
describe("fan-out endpoints", () => {
  it("recompute reports the number of live risks it enqueued", async () => {
    const { owner } = await seedTwoTenantContexts();
    await createTestRisk(owner.orgId, {});
    await createTestRisk(owner.orgId, {});
    const dead = await createTestRisk(owner.orgId, {});
    await sequelize.query(`UPDATE risks SET is_deleted = true WHERE id = :dead`, {
      replacements: { dead },
    });

    const res = await owner.request.post(`${BASE}/recompute`);
    expect(res.status).toBe(202);
    expect(res.body.data.enqueued).toBe(2);
  });

  it("recompute on an empty org enqueues nothing", async () => {
    const { owner } = await seedTwoTenantContexts();
    const res = await owner.request.post(`${BASE}/recompute`);
    expect(res.status).toBe(202);
    expect(res.body.data.enqueued).toBe(0);
  });

  it("suggest-hierarchy refuses without an LLM key and groups components with one", async () => {
    const { owner } = await seedTwoTenantContexts();
    const a = await createTestRisk(owner.orgId, {});
    const b = await createTestRisk(owner.orgId, {});
    const c = await createTestRisk(owner.orgId, {});
    const d = await createTestRisk(owner.orgId, {});
    // Two disjoint related_to components: {a,b} and {c,d}.
    await insertLink({
      orgId: owner.orgId,
      source: Math.min(a, b),
      targetId: Math.max(a, b),
      relation: "related_to",
      status: "confirmed",
    });
    await insertLink({
      orgId: owner.orgId,
      source: Math.min(c, d),
      targetId: Math.max(c, d),
      relation: "related_to",
      status: "confirmed",
    });

    const noKey = await owner.request.post(`${BASE}/suggest-hierarchy`);
    expect(noKey.status).toBe(400);

    await seedLLMKey(owner.orgId);
    const withKey = await owner.request.post(`${BASE}/suggest-hierarchy`);
    expect(withKey.status).toBe(202);
    expect(withKey.body.data).toEqual({ enqueued: 2, skipped: 0 });
  });

  it("suggest-hierarchy ignores a dismissed relation", async () => {
    const { owner } = await seedTwoTenantContexts();
    await seedLLMKey(owner.orgId);
    const a = await createTestRisk(owner.orgId, {});
    const b = await createTestRisk(owner.orgId, {});
    await insertLink({
      orgId: owner.orgId,
      source: Math.min(a, b),
      targetId: Math.max(a, b),
      relation: "related_to",
      status: "dismissed",
    });
    const res = await owner.request.post(`${BASE}/suggest-hierarchy`);
    expect(res.status).toBe(202);
    expect(res.body.data).toEqual({ enqueued: 0, skipped: 0 });
  });

  it("skips a component larger than MAX_COMPONENT_SIZE instead of truncating it", async () => {
    const { owner } = await seedTwoTenantContexts();
    await seedLLMKey(owner.orgId);

    // One chain of MAX_COMPONENT_SIZE + 1 risks — one node past what a single
    // LLM call accepts — plus a two-node component that comfortably fits.
    const chain: number[] = [];
    for (let i = 0; i <= MAX_COMPONENT_SIZE; i += 1) {
      chain.push(await createTestRisk(owner.orgId, {}));
    }
    for (let i = 0; i < chain.length - 1; i += 1) {
      await insertLink({
        orgId: owner.orgId,
        source: Math.min(chain[i], chain[i + 1]),
        targetId: Math.max(chain[i], chain[i + 1]),
        relation: "related_to",
        status: "suggested",
      });
    }
    const small = [await createTestRisk(owner.orgId, {}), await createTestRisk(owner.orgId, {})];
    await insertLink({
      orgId: owner.orgId,
      source: Math.min(small[0], small[1]),
      targetId: Math.max(small[0], small[1]),
      relation: "related_to",
      status: "suggested",
    });

    const add = automationQueue.add as jest.Mock;
    add.mockClear();

    const res = await owner.request.post(`${BASE}/suggest-hierarchy`);
    expect(res.status).toBe(202);
    expect(res.body.data).toEqual({ enqueued: 1, skipped: 1 });

    // The count alone would also pass if the oversized component had been cut
    // down to 25 and enqueued in place of the small one, so assert the payload:
    // exactly one job, carrying exactly the two ids that fit.
    const directionJobs = add.mock.calls.filter(([name]) => name === "risk_link_direction");
    expect(directionJobs).toHaveLength(1);
    expect(directionJobs[0][1].riskIds).toEqual([...small].sort((x, y) => x - y));
  });
});

// ---------------------------------------------------------------------------
// 15. Org-wide reports answer on an empty org rather than erroring.
// ---------------------------------------------------------------------------
describe("org-wide reports on an empty org", () => {
  it("returns well-formed empty payloads", async () => {
    const { owner } = await seedTwoTenantContexts();
    const graph = await owner.request.get(`${BASE}/`);
    expect(graph.status).toBe(200);
    expect(graph.body.data).toEqual({ nodes: [], edges: [], truncated: false });

    const dismissals = await owner.request.get(`${BASE}/dismissals`);
    expect(dismissals.status).toBe(200);
    expect(Array.isArray(dismissals.body.data.signals)).toBe(true);

    const duplicates = await owner.request.get(`${BASE}/duplicates`);
    expect(duplicates.status).toBe(200);
    expect(Array.isArray(duplicates.body.data.candidates)).toBe(true);

    const coverage = await owner.request.get(`${BASE}/coverage`);
    expect(coverage.status).toBe(200);
    expect(Array.isArray(coverage.body.data.gaps)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 16. Does the per-risk read leak the raw dismiss notes that /dismissals gates?
// ---------------------------------------------------------------------------
describe("dismiss note exposure", () => {
  it("records which roles can read a raw dismiss note", async () => {
    const { owner } = await seedTwoTenantContexts();
    const child = await createTestRisk(owner.orgId, {});
    const parent = await createTestRisk(owner.orgId, {});
    const id = await insertLink({
      orgId: owner.orgId,
      source: Math.min(child, parent),
      targetId: Math.max(child, parent),
      relation: "related_to",
      status: "suggested",
    });
    await owner.request
      .patch(`${BASE}/${id}`)
      .send({ status: "dismissed", dismissReason: "other", dismissNote: "SENSITIVE NOTE" })
      .expect(200);

    const auditor = await appAs("Auditor", owner.orgId, owner.userId);
    const perRisk = await auditor.get(`${BASE}/${child}?status=dismissed`);
    const orgWide = await auditor.get(`${BASE}/dismissals`);

    expect(orgWide.status).toBe(403);
    expect({
      perRiskStatus: perRisk.status,
      noteVisible: JSON.stringify(perRisk.body).includes("SENSITIVE NOTE"),
    }).toEqual({ perRiskStatus: 200, noteVisible: true });
  });
});

// ---------------------------------------------------------------------------
// 17. A user with no role at all.
// ---------------------------------------------------------------------------
describe("missing role", () => {
  it("401s the gated routes when req.role is absent", async () => {
    const orgId = await createTestOrganization();
    const userId = await createTestUser(orgId, 1, `norole-${Date.now()}@test.com`, "Password123!");
    const app = await createTestApp({
      bypassAuth: true,
      mockUser: { userId, organizationId: orgId, role: "" },
    });
    const agent = testRequest(app);
    expect((await agent.get(`${BASE}/`)).status).toBe(401);
    expect((await agent.post(`${BASE}/`).send({})).status).toBe(401);
  });
});
