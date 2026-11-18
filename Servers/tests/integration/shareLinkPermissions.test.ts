jest.setTimeout(60000);

import { sequelize } from "../../database/db";
import { cleanupDatabase, createTestOrganization, createTestUser } from "./helpers";
import { createTestApp, testRequest } from "./setup";
import {
  createTestModelInventory,
  createTestProject,
  createTestRisk,
  linkRiskToProject,
} from "../factories/test-entities.factory";

/**
 * Share links (audit M-L6): creating or changing a link takes the edit
 * permission of what it shares, the public view never shows internal
 * columns, and an Admin can revoke any link of the organization.
 */

const ROLE = { Admin: 1, Reviewer: 2, Editor: 3, Auditor: 4 } as const;
type RoleName = keyof typeof ROLE;

let counter = 0;
const userIn = (orgId: number, role: RoleName) => {
  counter += 1;
  return createTestUser(
    orgId,
    ROLE[role],
    `share-${role}-${Date.now()}-${counter}@test.com`,
    "Pw123456!",
  );
};
const as = async (orgId: number, userId: number, role: RoleName) =>
  testRequest(
    await createTestApp({ bypassAuth: true, mockUser: { userId, organizationId: orgId, role } }),
  );

const link = (resource_type: string, resource_id: number, shareAllFields = false) => ({
  resource_type,
  resource_id,
  settings: { shareAllFields, allowDataExport: false, allowViewersToOpenRecords: false },
});

describe("share link permissions and fields", () => {
  let orgA: number;
  let orgB: number;
  let adminA: number;
  let editorA: number;
  let auditorA: number;
  let adminB: number;
  let projectA: number;
  let model: number;
  let modelWithoutApprover: number;

  beforeAll(async () => {
    await cleanupDatabase();
    orgA = await createTestOrganization("Share A");
    orgB = await createTestOrganization("Share B");
    adminA = await userIn(orgA, "Admin");
    editorA = await userIn(orgA, "Editor");
    auditorA = await userIn(orgA, "Auditor");
    adminB = await userIn(orgB, "Admin");
    // Owned by the Admin; the Editor is not a member.
    projectA = await createTestProject(orgA, adminA, {});
    model = await createTestModelInventory(orgA, {});
    modelWithoutApprover = await createTestModelInventory(orgA, {});
    await sequelize.query(
      `UPDATE model_inventories
          SET external_key = 'ext-1', security_assessment_data = '[{"id":1}]',
              mrm_revalidation_reason = 'internal', approver = :approver
        WHERE id = :model`,
      { replacements: { model, approver: adminA } },
    );
  });

  afterAll(async () => {
    await cleanupDatabase();
  });

  it("an Auditor cannot create a link to the model list", async () => {
    const res = await (
      await as(orgA, auditorA, "Auditor")
    )
      .post("/api/shares")
      .send(link("model", 0));
    expect(res.status).toBe(403);
  });

  it("an Editor can, and the public view shows no internal columns even with all fields on", async () => {
    const res = await (
      await as(orgA, editorA, "Editor")
    )
      .post("/api/shares")
      .send(link("model", 0, true));
    expect(res.status).toBe(201);
    const view = await (
      await as(orgB, adminB, "Admin")
    ).get(`/api/shares/view/${res.body.data.share_token}`);
    expect(view.status).toBe(200);
    const row = view.body.data.data.find((r: any) => r.id === model);
    for (const key of [
      "organization_id",
      "external_key",
      "security_assessment_data",
      "mrm_revalidation_reason",
      "mrm_tier",
      "is_demo",
    ]) {
      expect(row).not.toHaveProperty(key);
    }
    expect(row).toHaveProperty("version");
    expect(typeof row.approver).toBe("string"); // the approver's name, not an id
  });

  it("an Editor cannot share a use case they cannot open, nor the whole use case list", async () => {
    const api = await as(orgA, editorA, "Editor");
    expect((await api.post("/api/shares").send(link("project", projectA))).status).toBe(403);
    expect((await api.post("/api/shares").send(link("project", 0))).status).toBe(403);
    const admin = await as(orgA, adminA, "Admin");
    expect((await admin.post("/api/shares").send(link("project", projectA))).status).toBe(201);
  });

  it("an Editor cannot share a risk they cannot see, nor the whole risk list", async () => {
    // Linked only to a use case the Editor is not a member of.
    const risk = await createTestRisk(orgA, {});
    await linkRiskToProject(orgA, risk, projectA);
    const api = await as(orgA, editorA, "Editor");
    expect((await api.post("/api/shares").send(link("risk", risk))).status).toBe(403);
    expect((await api.post("/api/shares").send(link("risk", 0))).status).toBe(403);
    const admin = await as(orgA, adminA, "Admin");
    expect((await admin.post("/api/shares").send(link("risk", risk))).status).toBe(201);
  });

  it("an Admin can revoke an Editor's link; an Auditor cannot; another org's Admin gets 404", async () => {
    const created = await (
      await as(orgA, editorA, "Editor")
    )
      .post("/api/shares")
      .send(link("model", 0));
    const id = created.body.data.id;
    expect((await (await as(orgA, auditorA, "Auditor")).delete(`/api/shares/${id}`)).status).toBe(
      403,
    );
    expect((await (await as(orgB, adminB, "Admin")).delete(`/api/shares/${id}`)).status).toBe(404);
    expect((await (await as(orgA, adminA, "Admin")).delete(`/api/shares/${id}`)).status).toBe(200);
  });

  it("the creator cannot change their link once they lose the edit permission", async () => {
    const created = await (
      await as(orgA, editorA, "Editor")
    )
      .post("/api/shares")
      .send(link("model", 0));
    const id = created.body.data.id;
    // Same user, now acting with the Auditor role.
    const res = await (
      await as(orgA, editorA, "Auditor")
    )
      .patch(`/api/shares/${id}`)
      .send({ settings: { shareAllFields: true } });
    expect(res.status).toBe(403);
  });

  it("a single-model link shows the approver's name, never the user id", async () => {
    const api = await as(orgA, editorA, "Editor");
    const named = await api.post("/api/shares").send(link("model", model, true));
    expect(named.status).toBe(201);
    const view = await (
      await as(orgB, adminB, "Admin")
    ).get(`/api/shares/view/${named.body.data.share_token}`);
    expect(view.status).toBe(200);
    const row = view.body.data.data;
    expect(typeof row.approver).toBe("string");
    expect(row.approver).not.toMatch(/User ID|^\d+$/);
    expect(row).not.toHaveProperty("approver_name");

    const none = await api.post("/api/shares").send(link("model", modelWithoutApprover, true));
    const noneView = await (
      await as(orgB, adminB, "Admin")
    ).get(`/api/shares/view/${none.body.data.share_token}`);
    expect(noneView.status).toBe(200);
    expect(noneView.body.data.data).not.toHaveProperty("approver");
  });

  it("the creator can still turn their link off after losing the edit permission, not back on", async () => {
    const created = await (
      await as(orgA, editorA, "Editor")
    )
      .post("/api/shares")
      .send(link("model", 0));
    const id = created.body.data.id;
    const asAuditor = await as(orgA, editorA, "Auditor");
    const off = await asAuditor.patch(`/api/shares/${id}`).send({ is_enabled: false });
    expect(off.status).toBe(200);
    expect(off.body.data.is_enabled).toBe(false);
    expect((await asAuditor.patch(`/api/shares/${id}`).send({ is_enabled: true })).status).toBe(
      403,
    );
  });

  it("an Admin can turn off another user's link but not change it; an Auditor cannot", async () => {
    const created = await (
      await as(orgA, editorA, "Editor")
    )
      .post("/api/shares")
      .send(link("model", 0));
    const id = created.body.data.id;
    expect(
      (
        await (await as(orgA, auditorA, "Auditor")).patch(`/api/shares/${id}`).send({
          is_enabled: false,
        })
      ).status,
    ).toBe(403);
    const admin = await as(orgA, adminA, "Admin");
    expect(
      (await admin.patch(`/api/shares/${id}`).send({ settings: { shareAllFields: true } })).status,
    ).toBe(403);
    expect((await admin.patch(`/api/shares/${id}`).send({ is_enabled: false })).status).toBe(200);
    expect(
      (
        await (await as(orgB, adminB, "Admin")).patch(`/api/shares/${id}`).send({
          is_enabled: false,
        })
      ).status,
    ).toBe(404);
  });
});
