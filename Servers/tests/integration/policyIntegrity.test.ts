jest.setTimeout(60000);

/**
 * Policy integrity (Risks + Policies audit, PR H), against a real database
 * and the real middleware chain.
 *
 * Covers: deleting a policy removes the rows that point at it without a
 * foreign key (folder mapping, CE marking link, task link, share link) and
 * writes a deletion history row as the acting user, leaving another
 * organization's rows alone; bulk archive and bulk set tags write one history
 * row per changed policy as the acting user; the folder counts endpoint
 * returns only the caller's organization.
 */

import { Agent } from "supertest";
import { QueryTypes } from "sequelize";
import { sequelize } from "../../database/db";
import { createTestApp, testRequest } from "./setup";
import { cleanupDatabase, createTestOrganization, createTestUser } from "./helpers";

const ADMIN = 1;

interface OrgSeed {
  orgId: number;
  adminId: number;
  admin: Agent;
}

let seedCounter = 0;

async function seedOrg(): Promise<OrgSeed> {
  const suffix = `${Date.now()}-${++seedCounter}`;
  const orgId = await createTestOrganization(`Policy integrity ${suffix}`);
  const adminId = await createTestUser(orgId, ADMIN, `pi-admin-${suffix}@test.com`, "Password1!");
  const app = await createTestApp({
    bypassAuth: true,
    mockUser: { userId: adminId, organizationId: orgId, role: "Admin" },
  });
  return { orgId, adminId, admin: testRequest(app) };
}

async function createPolicy(agent: Agent, extra: Record<string, unknown> = {}): Promise<number> {
  const res = await agent.post("/api/policies").send({
    title: `Integrity policy ${Date.now()}-${++seedCounter}`,
    content_html: "<p>Body</p>",
    tags: ["Privacy"],
    next_review_date: "2030-01-15",
    ...extra,
  });
  expect(res.status).toBe(201);
  return res.body.data.id;
}

async function createFolder(org: OrgSeed): Promise<number> {
  const [row] = await sequelize.query<{ id: number }>(
    `INSERT INTO virtual_folders (organization_id, name, created_by)
     VALUES (:orgId, :name, :userId) RETURNING id`,
    {
      replacements: { orgId: org.orgId, name: `Folder ${++seedCounter}`, userId: org.adminId },
      type: QueryTypes.SELECT,
    },
  );
  return row.id;
}

async function mapToFolder(org: OrgSeed, policyId: number, folderId: number): Promise<void> {
  await sequelize.query(
    `INSERT INTO policy_folder_mappings (organization_id, policy_id, folder_id, assigned_by)
     VALUES (:orgId, :policyId, :folderId, :userId)`,
    { replacements: { orgId: org.orgId, policyId, folderId, userId: org.adminId } },
  );
}

/** Rows that point at a policy with no foreign key, counted by table. */
async function leftovers(orgId: number, policyId: number): Promise<Record<string, number>> {
  const count = async (sql: string): Promise<number> => {
    const [row] = await sequelize.query<{ count: number }>(sql, {
      replacements: { orgId, policyId },
      type: QueryTypes.SELECT,
    });
    return row.count;
  };
  return {
    folderMappings: await count(
      `SELECT COUNT(*)::int AS count FROM policy_folder_mappings
       WHERE organization_id = :orgId AND policy_id = :policyId`,
    ),
    ceMarkingLinks: await count(
      `SELECT COUNT(*)::int AS count FROM ce_marking_policies
       WHERE organization_id = :orgId AND policy_id = :policyId`,
    ),
    taskLinks: await count(
      `SELECT COUNT(*)::int AS count FROM task_entity_links
       WHERE organization_id = :orgId AND entity_type = 'policy' AND entity_id = :policyId`,
    ),
    shareLinks: await count(
      `SELECT COUNT(*)::int AS count FROM share_links
       WHERE organization_id = :orgId AND resource_type = 'policy' AND resource_id = :policyId`,
    ),
  };
}

/** One of each leftover row for the policy, in the organization. */
async function seedLeftovers(org: OrgSeed, policyId: number): Promise<void> {
  const folderId = await createFolder(org);
  await mapToFolder(org, policyId, folderId);

  const [project] = await sequelize.query<{ id: number }>(
    `INSERT INTO projects
       (project_title, owner, start_date, ai_risk_classification, goal,
        last_updated, last_updated_by, organization_id)
     VALUES ('CE use case', :userId, NOW(), 'High risk', 'goal', NOW(), :userId, :orgId)
     RETURNING id`,
    { replacements: { orgId: org.orgId, userId: org.adminId }, type: QueryTypes.SELECT },
  );
  const [marking] = await sequelize.query<{ id: number }>(
    `INSERT INTO ce_markings (organization_id, project_id) VALUES (:orgId, :projectId) RETURNING id`,
    { replacements: { orgId: org.orgId, projectId: project.id }, type: QueryTypes.SELECT },
  );
  await sequelize.query(
    `INSERT INTO ce_marking_policies (organization_id, ce_marking_id, policy_id, linked_by)
     VALUES (:orgId, :markingId, :policyId, :userId)`,
    { replacements: { orgId: org.orgId, markingId: marking.id, policyId, userId: org.adminId } },
  );

  const [task] = await sequelize.query<{ id: number }>(
    `INSERT INTO tasks (organization_id, title, creator_id)
     VALUES (:orgId, 'Review the policy', :userId) RETURNING id`,
    { replacements: { orgId: org.orgId, userId: org.adminId }, type: QueryTypes.SELECT },
  );
  await sequelize.query(
    `INSERT INTO task_entity_links (organization_id, task_id, entity_type, entity_id, entity_name)
     VALUES (:orgId, :taskId, 'policy', :policyId, 'Policy')`,
    { replacements: { orgId: org.orgId, taskId: task.id, policyId } },
  );

  await sequelize.query(
    `INSERT INTO share_links (organization_id, share_token, resource_type, resource_id, created_by)
     VALUES (:orgId, :token, 'policy', :policyId, :userId)`,
    {
      replacements: {
        orgId: org.orgId,
        token: `tok-${Date.now()}-${++seedCounter}`,
        policyId,
        userId: org.adminId,
      },
    },
  );
}

interface HistoryRow {
  action: string;
  field_name: string | null;
  old_value: string | null;
  new_value: string | null;
  changed_by_user_id: number | null;
  changed_by_system: boolean;
}

async function history(policyId: number, where = "TRUE"): Promise<HistoryRow[]> {
  return sequelize.query<HistoryRow>(
    `SELECT action, field_name, old_value, new_value, changed_by_user_id, changed_by_system
     FROM policy_change_history
     WHERE policy_id = :policyId AND ${where}
     ORDER BY id`,
    { replacements: { policyId }, type: QueryTypes.SELECT },
  );
}

describe("Policy integrity", () => {
  afterEach(async () => {
    await cleanupDatabase();
  });

  describe("deleting a policy", () => {
    it("removes its folder, CE marking, task and share link rows and records the deletion", async () => {
      const org = await seedOrg();
      const other = await seedOrg();
      const policyId = await createPolicy(org.admin);
      await seedLeftovers(org, policyId);
      // Another organization's rows that happen to use the same policy id.
      await seedLeftovers(other, policyId);

      expect(await leftovers(org.orgId, policyId)).toEqual({
        folderMappings: 1,
        ceMarkingLinks: 1,
        taskLinks: 1,
        shareLinks: 1,
      });

      const deleted = await org.admin.delete(`/api/policies/${policyId}`);
      expect(deleted.status).toBe(202);

      expect(await leftovers(org.orgId, policyId)).toEqual({
        folderMappings: 0,
        ceMarkingLinks: 0,
        taskLinks: 0,
        shareLinks: 0,
      });
      expect(await leftovers(other.orgId, policyId)).toEqual({
        folderMappings: 1,
        ceMarkingLinks: 1,
        taskLinks: 1,
        shareLinks: 1,
      });

      const rows = await history(policyId, "action = 'deleted'");
      expect(rows).toHaveLength(1);
      expect(rows[0].changed_by_user_id).toBe(org.adminId);
      expect(rows[0].changed_by_system).toBe(false);
    });
  });

  describe("bulk actions", () => {
    it("archive records one status change per policy that changed, as the acting user", async () => {
      const org = await seedOrg();
      const draftId = await createPolicy(org.admin);
      const archivedId = await createPolicy(org.admin, { status: "Archived" });

      const res = await org.admin.patch("/api/policies/bulk").send({
        ids: [draftId, archivedId],
        action: "archive",
      });
      expect(res.status).toBe(200);

      expect(await history(draftId, "field_name = 'Status' AND action = 'updated'")).toEqual([
        {
          action: "updated",
          field_name: "Status",
          old_value: "Draft",
          new_value: "Archived",
          changed_by_user_id: org.adminId,
          changed_by_system: false,
        },
      ]);
      // Already archived: nothing changed, so nothing is recorded.
      expect(await history(archivedId, "field_name = 'Status' AND action = 'updated'")).toEqual([]);
    });

    it("set tags records one tags change per policy whose tags changed, as the acting user", async () => {
      const org = await seedOrg();
      const changedId = await createPolicy(org.admin, { tags: ["Privacy"] });
      const sameId = await createPolicy(org.admin, { tags: ["Security"] });

      const res = await org.admin.patch("/api/policies/bulk").send({
        ids: [changedId, sameId],
        action: "set_tags",
        tags: ["Security"],
      });
      expect(res.status).toBe(200);

      const changed = await history(changedId, "field_name = 'Tags' AND action = 'updated'");
      expect(changed).toHaveLength(1);
      expect(changed[0].changed_by_user_id).toBe(org.adminId);
      expect(changed[0].changed_by_system).toBe(false);
      expect(changed[0].old_value).toContain("Privacy");
      expect(changed[0].new_value).toContain("Security");

      expect(await history(sameId, "field_name = 'Tags' AND action = 'updated'")).toEqual([]);
    });
  });

  describe("GET /api/v1/policies/folder-counts", () => {
    it("counts the caller's policies per folder and nothing from another organization", async () => {
      const org = await seedOrg();
      const other = await seedOrg();

      const folderA = await createFolder(org);
      const folderB = await createFolder(org);
      const p1 = await createPolicy(org.admin);
      const p2 = await createPolicy(org.admin);
      const p3 = await createPolicy(org.admin);
      await mapToFolder(org, p1, folderA);
      await mapToFolder(org, p2, folderA);
      await mapToFolder(org, p3, folderB);

      const otherFolder = await createFolder(other);
      const otherPolicy = await createPolicy(other.admin);
      await mapToFolder(other, otherPolicy, otherFolder);

      const res = await org.admin.get("/api/v1/policies/folder-counts");
      expect(res.status).toBe(200);
      expect(res.body.data).toEqual({ [folderA]: 2, [folderB]: 1 });

      const otherRes = await other.admin.get("/api/v1/policies/folder-counts");
      expect(otherRes.body.data).toEqual({ [otherFolder]: 1 });

      // A deleted policy no longer counts.
      expect((await org.admin.delete(`/api/policies/${p1}`)).status).toBe(202);
      const after = await org.admin.get("/api/v1/policies/folder-counts");
      expect(after.body.data).toEqual({ [folderA]: 1, [folderB]: 1 });
    });
  });
});
