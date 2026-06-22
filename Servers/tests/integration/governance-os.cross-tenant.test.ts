import { createTestApp, testRequest } from "./setup";
import {
  createTestOrganization,
  createTestUser,
  seedFrameworks,
  cleanupDatabase,
  runMigrations,
} from "./helpers";

const ADMIN_PASSWORD = "GovAdmin1!";

describe("Governance OS cross-tenant isolation", () => {
  let orgA: number;
  let orgB: number;
  let userA: number;
  let userB: number;

  beforeAll(() => {
    runMigrations();
  });

  beforeEach(async () => {
    orgA = await createTestOrganization("Org A");
    orgB = await createTestOrganization("Org B");
    userA = await createTestUser(orgA, 1, `org-a-admin-${Date.now()}@test.com`, ADMIN_PASSWORD);
    userB = await createTestUser(orgB, 1, `org-b-admin-${Date.now()}@test.com`, ADMIN_PASSWORD);
    await seedFrameworks();

    // Seed a mapping for org A
    await seedMapping(orgA, 1, 2, "Art.9", "Clause 6.1", "risk_management");
  });

  afterEach(async () => {
    await cleanupDatabase();
  });

  const seedMapping = async (
    orgId: number,
    sourceFw: number,
    targetFw: number,
    sourceId: string,
    targetId: string,
    domain: string,
  ) => {
    const app = createTestApp({
      bypassAuth: true,
      mockUser: { userId: 1, organizationId: orgId, role: "Admin" },
    });
    await testRequest(app).post("/api/governance-os/mappings").send({
      source_framework_id: sourceFw,
      target_framework_id: targetFw,
      source_control_type: "control_category",
      source_control_identifier: sourceId,
      target_control_type: "clause",
      target_control_identifier: targetId,
      mapping_strength: "direct",
      mapping_direction: "bidirectional",
      domain_tag: domain,
    });
  };

  describe("GET /api/governance-os/mappings", () => {
    it("returns only mappings belonging to the caller's organization", async () => {
      const app = createTestApp({
        bypassAuth: true,
        mockUser: { userId: userA, organizationId: orgA, role: "Admin" },
      });

      const res = await testRequest(app).get("/api/governance-os/mappings");

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].source_control_identifier).toBe("Art.9");
    });

    it("does not return mappings from another organization", async () => {
      const app = createTestApp({
        bypassAuth: true,
        mockUser: { userId: userB, organizationId: orgB, role: "Admin" },
      });

      const res = await testRequest(app).get("/api/governance-os/mappings");

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(0);
    });
  });

  describe("PUT /api/governance-os/mappings/:id", () => {
    it("prevents org B from updating org A's mapping", async () => {
      const appA = createTestApp({
        bypassAuth: true,
        mockUser: { userId: userA, organizationId: orgA, role: "Admin" },
      });
      const listRes = await testRequest(appA).get("/api/governance-os/mappings");
      const mappingId = listRes.body.data[0].id;

      const appB = createTestApp({
        bypassAuth: true,
        mockUser: { userId: userB, organizationId: orgB, role: "Admin" },
      });
      const res = await testRequest(appB)
        .put(`/api/governance-os/mappings/${mappingId}`)
        .send({ mapping_strength: "partial" });

      expect(res.status).toBe(404);
    });
  });

  describe("DELETE /api/governance-os/mappings/:id", () => {
    it("prevents org B from deleting org A's mapping", async () => {
      const appA = createTestApp({
        bypassAuth: true,
        mockUser: { userId: userA, organizationId: orgA, role: "Admin" },
      });
      const listRes = await testRequest(appA).get("/api/governance-os/mappings");
      const mappingId = listRes.body.data[0].id;

      const appB = createTestApp({
        bypassAuth: true,
        mockUser: { userId: userB, organizationId: orgB, role: "Admin" },
      });
      const res = await testRequest(appB).delete(`/api/governance-os/mappings/${mappingId}`);

      expect(res.status).toBe(404);

      // Verify org A can still see the mapping
      const listAgain = await testRequest(appA).get("/api/governance-os/mappings");
      expect(listAgain.body.data).toHaveLength(1);
    });
  });

  describe("POST /api/governance-os/mappings/bulk", () => {
    it("stamps bulk mappings with the caller's organization_id", async () => {
      const app = createTestApp({
        bypassAuth: true,
        mockUser: { userId: userB, organizationId: orgB, role: "Admin" },
      });

      const res = await testRequest(app)
        .post("/api/governance-os/mappings/bulk")
        .send({
          mappings: [
            {
              source_framework_id: 1,
              target_framework_id: 2,
              source_control_type: "control_category",
              source_control_identifier: "Art.10",
              target_control_type: "clause",
              target_control_identifier: "Clause 7.1",
              mapping_strength: "related",
              organization_id: orgA, // attempted cross-tenant pollution
            },
          ],
        });

      expect(res.status).toBe(201);

      const orgBRes = await testRequest(app).get("/api/governance-os/mappings");
      expect(orgBRes.body.data).toHaveLength(1);
      expect(orgBRes.body.data[0].organization_id).toBe(orgB);
      expect(orgBRes.body.data[0].source_control_identifier).toBe("Art.10");

      const appA = createTestApp({
        bypassAuth: true,
        mockUser: { userId: userA, organizationId: orgA, role: "Admin" },
      });
      const orgARes = await testRequest(appA).get("/api/governance-os/mappings");
      expect(orgARes.body.data).toHaveLength(1);
      expect(orgARes.body.data[0].source_control_identifier).toBe("Art.9");
    });
  });

  describe("POST /api/governance-os/scenarios/:id/activate", () => {
    it("prevents activating another organization's custom scenario", async () => {
      const appA = createTestApp({
        bypassAuth: true,
        mockUser: { userId: userA, organizationId: orgA, role: "Admin" },
      });
      const createRes = await testRequest(appA)
        .post("/api/governance-os/scenarios")
        .send({
          name: "Org A Scenario",
          industry: "technology",
          region: "eu",
          use_case_type: "high_risk_ai",
          recommended_framework_ids: [1, 2],
          priority_order: { primary: 1, secondary: [2], supplementary: [] },
        });
      expect(createRes.status).toBe(201);
      const scenarioId = createRes.body.data.id;

      const appB = createTestApp({
        bypassAuth: true,
        mockUser: { userId: userB, organizationId: orgB, role: "Admin" },
      });
      const res = await testRequest(appB)
        .post(`/api/governance-os/scenarios/${scenarioId}/activate`)
        .send({});

      expect(res.status).toBe(403);
    });
  });
});
