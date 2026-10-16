jest.setTimeout(60000);

import { cleanupDatabase, createTestUser } from "../helpers";
import { sequelize } from "../../../database/db";
import { seedTwoTenantContexts } from "./tenantIsolation.harness";
import { createTestApp, testRequest } from "../setup";
import { createTestProject } from "../../factories";
import { uploadFile } from "../../../utils/fileUpload.utils";

/** A user in the organization with the given role, optionally a project member. */
async function orgUser(orgId: number, roleId: number, role: string, memberOf?: number) {
  const userId = await createTestUser(
    orgId,
    roleId,
    `eai-${role.toLowerCase()}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@test.com`,
    "Password123!",
  );
  if (memberOf !== undefined) {
    await sequelize.query(
      `INSERT INTO projects_members (organization_id, user_id, project_id)
       VALUES (:org, :user, :project)`,
      { replacements: { org: orgId, user: userId, project: memberOf } },
    );
  }
  const request = testRequest(
    await createTestApp({ bypassAuth: true, mockUser: { userId, organizationId: orgId, role } }),
  );
  return { userId, request };
}

describe("Evidence AI file access", () => {
  afterEach(async () => {
    await cleanupDatabase();
  });

  async function projectFile() {
    const { owner } = await seedTwoTenantContexts();
    const project = await createTestProject(owner.orgId, owner.userId);
    const body = Buffer.from("Access control policy. Reviewed quarterly by the security team.");
    const file = await uploadFile(
      {
        fieldname: "file",
        originalname: "policy.txt",
        mimetype: "text/plain",
        buffer: body,
        size: body.length,
      } as any,
      owner.userId,
      project,
      "File Manager",
      owner.orgId,
    );
    return { owner, project, fileId: file.id! };
  }

  it("refuses every file-id endpoint to an organization user who cannot open the file", async () => {
    const { owner, fileId } = await projectFile();
    const outsider = await orgUser(owner.orgId, 3, "Editor");

    const statuses = [
      (await outsider.request.post(`/api/evidence-ai/analyze/${fileId}`)).status,
      (await outsider.request.get(`/api/evidence-ai/analysis/${fileId}`)).status,
      (await outsider.request.get(`/api/evidence-ai/suggestions/${fileId}`)).status,
      (
        await outsider.request
          .post(`/api/evidence-ai/suggestions/${fileId}/apply`)
          .send({ suggestions: [{ framework_type: "eu_ai_act", entity_type: "x", entity_id: 1 }] })
      ).status,
    ];
    expect(statuses).toEqual([403, 403, 403, 403]);
  });

  it("answers a file that does not exist the same as one the caller cannot open", async () => {
    const { owner, fileId } = await projectFile();
    const outsider = await orgUser(owner.orgId, 3, "Editor");
    const seen = await outsider.request.get(`/api/evidence-ai/analysis/${fileId}`);
    const missing = await outsider.request.get(`/api/evidence-ai/analysis/${fileId + 100000}`);
    expect([seen.status, seen.body]).toEqual([missing.status, missing.body]);
  });

  it("lets a read-only Auditor on the project read but not analyze or apply", async () => {
    const { owner, project, fileId } = await projectFile();
    const auditor = await orgUser(owner.orgId, 4, "Auditor", project);

    expect((await auditor.request.get(`/api/evidence-ai/analysis/${fileId}`)).status).toBe(204);
    expect((await auditor.request.post(`/api/evidence-ai/analyze/${fileId}`)).status).toBe(403);
    expect(
      (
        await auditor.request
          .post(`/api/evidence-ai/suggestions/${fileId}/apply`)
          .send({ suggestions: [{ framework_type: "eu_ai_act", entity_type: "x", entity_id: 1 }] })
      ).status,
    ).toBe(403);
  });

  it("still serves the project's people", async () => {
    const { owner, project, fileId } = await projectFile();
    const member = await orgUser(owner.orgId, 3, "Editor", project);
    expect((await member.request.get(`/api/evidence-ai/analysis/${fileId}`)).status).toBe(204);
    expect((await owner.request.get(`/api/evidence-ai/analysis/${fileId}`)).status).toBe(204);
  });
});
