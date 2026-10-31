/**
 * Per-tenant cache isolation — issue #4679-b.
 *
 * Placed next to the tenant-isolation pack (this directory's sibling), with
 * the caching lens: repeat reads — the pattern a cache-aside read path turns
 * into cache hits — must never serve one tenant's rows to another. Today the
 * app has no cache layer, so the safe default is asserted: repeated reads
 * return only the caller's own rows, and no shared cache state exists (no
 * Cache-Control directive permitting shared caching, see
 * cache-headers.contract.test.ts).
 *
 * If a cache is introduced, these tests become the contract it must satisfy:
 * cache keys must be tenant-scoped, and invalidation must be per-tenant.
 *
 * Runs against the existing integration DB harness (Postgres-backed).
 */

jest.setTimeout(60_000);

import { cleanupDatabase } from "../helpers";
import {
  seedTwoTenantContexts,
  assertListOnlyOwnOrg,
  assertReadDenied,
  type TenantContext,
} from "../tenant-isolation/tenantIsolation.harness";
import { createTestProject, createTestRisk, createTestTask } from "../../factories";

async function seedProject(ctx: TenantContext): Promise<number> {
  return createTestProject(ctx.orgId, ctx.userId, {
    project_title: `Owner-only project ${ctx.orgId}`,
  });
}

async function seedTask(ctx: TenantContext): Promise<number> {
  return createTestTask(ctx.orgId, {
    creator_id: ctx.userId,
    title: `Owner-only task ${ctx.orgId}`,
  });
}

async function seedRisk(ctx: TenantContext): Promise<number> {
  return createTestRisk(ctx.orgId, {
    risk_owner: ctx.userId,
    risk_name: `Owner-only risk ${ctx.orgId}`,
  });
}

describe("Per-tenant cache isolation (#4679-b)", () => {
  afterEach(async () => {
    await cleanupDatabase();
  });

  it.each([
    ["projects", "/api/projects", seedProject],
    ["tasks", "/api/tasks", seedTask],
    ["risks", "/api/projectRisks", seedRisk],
  ] as const)(
    "%s: repeated attacker reads never see the owner's rows",
    async (_label, route, seed) => {
      const { owner, attacker } = await seedTwoTenantContexts();

      // First read (cache miss in a cache-aside world) ...
      await assertListOnlyOwnOrg(owner, attacker, route, seed, (res) => {
        const body = res.body;
        if (Array.isArray(body?.data)) return body.data;
        const nested =
          body?.data && typeof body.data === "object"
            ? Object.values(body.data).find(Array.isArray)
            : undefined;
        return nested ?? [];
      });

      // Second and third reads (cache hits) must return byte-identical emptiness
      // for the attacker — no tenant row may ever enter shared cache state.
      for (let attempt = 0; attempt < 2; attempt++) {
        const attackerList = await attacker.request.get(route);
        expect(attackerList.status).toBe(200);
        const items = (() => {
          const body = attackerList.body;
          if (Array.isArray(body?.data)) return body.data;
          const nested =
            body?.data && typeof body.data === "object"
              ? Object.values(body.data).find(Array.isArray)
              : undefined;
          return nested ?? [];
        })();
        expect(items).toHaveLength(0);
        // And no shared-cache directive appeared on the response either.
        const cacheControl: string | undefined = attackerList.headers["cache-control"];
        if (cacheControl) {
          expect(cacheControl).not.toMatch(/public|s-maxage|max-age\s*=\s*[1-9]/i);
        }
      }
    },
  );

  it("repeated attacker item reads are denied (no cached item leaks)", async () => {
    const { owner, attacker } = await seedTwoTenantContexts();
    const projectId = await seedProject(owner);

    for (let attempt = 0; attempt < 2; attempt++) {
      await assertReadDenied(owner, attacker, `/api/projects/${projectId}`, [404]);
    }
  });
});
