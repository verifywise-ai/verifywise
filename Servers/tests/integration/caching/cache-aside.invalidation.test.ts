/**
 * Cache-aside invalidation contract — issue #4679-b.
 *
 * The app has no cache layer yet, so the invariant a correct pre-caching
 * implementation guarantees is trivially observable at the API: every read
 * returns fresh, post-write state. These tests pin that contract down per
 * entity lifecycle so that introducing a cache (or a cache-aside read path)
 * cannot silently regress it — the moment a cache sits between controller
 * and database, this suite is the canary that demands invalidation on write.
 *
 * Runs against the existing integration DB harness (Postgres-backed).
 */

jest.setTimeout(60_000);

import http from "node:http";
import { createTestApp, testRequest } from "../setup";
import {
  cleanupDatabase,
  createTestOrganization,
  createTestUser,
  seedFrameworks,
} from "../helpers";
import { createTestProject } from "../../factories";

describe("Cache-aside write→read freshness (#4679-b)", () => {
  let app: http.Server;
  let orgId: number;
  let userId: number;

  beforeEach(async () => {
    orgId = await createTestOrganization();
    userId = await createTestUser(orgId, 1, `fresh-${Date.now()}@test.com`, "Password123!");
    await seedFrameworks();
    app = await createTestApp({
      bypassAuth: true,
      mockUser: { userId, organizationId: orgId, role: "Admin" },
    });
  });

  afterEach(async () => {
    await cleanupDatabase();
  });

  it("read-after-write: a created project is immediately visible", async () => {
    const create = await testRequest(app).post("/api/projects").send({
      project_title: "Freshness Project",
      owner: userId,
      start_date: "2024-06-01",
      geography: 1,
      framework: [],
      members: [],
    });
    expect(create.status).toBe(201);
    const projectId: number = create.body.data.project.id;

    // Repeat the read: a cache-aside read path would serve the first miss on
    // the second hit — the row must be there every time.
    for (let attempt = 0; attempt < 2; attempt++) {
      const list = await testRequest(app).get("/api/projects");
      expect(list.status).toBe(200);
      const ids = (list.body.data ?? []).map((p: any) => p.id);
      expect(ids).toContain(projectId);
    }
  });

  it("invalidation-on-update: a PATCH is reflected by the very next GET", async () => {
    const projectId = await createTestProject(orgId, userId, {
      project_title: "Before Update",
    });

    const patch = await testRequest(app)
      .patch(`/api/projects/${projectId}`)
      .send({ project_title: "After Update" });
    expect([200, 202, 204]).toContain(patch.status);

    const read = await testRequest(app).get(`/api/projects/${projectId}`);
    expect(read.status).toBe(200);
    const title =
      read.body.data?.project?.project_title ??
      read.body.data?.project_title ??
      read.body.project_title;
    expect(title).toBe("After Update");
  });

  it("invalidation-on-delete: a deleted project is gone from the next list", async () => {
    const projectId = await createTestProject(orgId, userId);

    const destroy = await testRequest(app).delete(`/api/projects/${projectId}`);
    expect([200, 202, 204]).toContain(destroy.status);

    const read = await testRequest(app).get(`/api/projects/${projectId}`);
    expect([404, 403]).toContain(read.status);

    const list = await testRequest(app).get("/api/projects");
    expect(list.status).toBe(200);
    const ids = (list.body.data ?? []).map((p: any) => p.id);
    expect(ids).not.toContain(projectId);
  });

  it("repeated reads are idempotent: no derived/stale state accumulates between GETs", async () => {
    await createTestProject(orgId, userId, { project_title: "Stable Row" });

    const first = await testRequest(app).get("/api/projects");
    const second = await testRequest(app).get("/api/projects");
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    // Same rows, same order — a read path with stale derived state (e.g. a
    // materialized list cache) would diverge here.
    expect(second.body).toEqual(first.body);
  });
});
