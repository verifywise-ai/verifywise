/**
 * Per-entity fixtures for the declarative isolation matrix: how to seed a row
 * owned by a tenant, and what to send on update and create. The registry wires
 * each one into `crudEntity(...)`.
 *
 * Imports only the factories, which import only the database module, so the
 * schema-drift audit script can load the registry without the test app.
 *
 * @see docs/technical/security/tenant-isolation.md
 */

import type { Agent } from "supertest";
import type { EntityFixture } from "./tenantIsolation.matrix";
import { sequelize } from "../../../database/db";
import { createTestProject, createTestRisk, createTestTask } from "../../factories";

/** A tiny upload whose extension and MIME type agree, as the upload filter requires. */
const CSV_BODY = "col_a,col_b\n1,2\n";

/** Multipart upload to the file manager, with optional extra form fields. */
function uploadCsv(agent: Agent, route: string, fields: Record<string, string> = {}) {
  let req = agent.post(route);
  for (const [name, value] of Object.entries(fields)) req = req.field(name, value);
  return req.attach("file", Buffer.from(CSV_BODY), {
    filename: "isolation.csv",
    contentType: "text/csv",
  });
}

export const projectFixture: EntityFixture = {
  seed: (ctx) => createTestProject(ctx.orgId, ctx.userId),
  updatePayload: () => ({ project_title: "Updated by isolation matrix" }),
  createPayload: (owner, foreignOrgId) => ({
    project_title: "Cross-tenant project",
    owner: owner.userId,
    start_date: "2024-06-01",
    geography: 1,
    framework: [],
    members: [],
    organization_id: foreignOrgId,
  }),
};

export const taskFixture: EntityFixture = {
  seed: (ctx) => createTestTask(ctx.orgId, { creator_id: ctx.userId }),
  updatePayload: () => ({ title: "Updated by isolation matrix" }),
  createPayload: (_owner, foreignOrgId) => ({
    title: "Cross-tenant task",
    description: "Should be stamped with the caller's organization",
    organization_id: foreignOrgId,
  }),
};

/**
 * Groups / teams (#5253): seeded straight into the org-scoped tables — the
 * groups API only writes through verifywise.groups, so the fixture mirrors a
 * direct INSERT. Membership and project links are covered by
 * groups-sub-resources.isolation.test.ts.
 */
export const groupFixture: EntityFixture = {
  seed: async (ctx) => {
    const [rows] = await sequelize.query(
      `INSERT INTO verifywise.groups (organization_id, name, description, created_by)
       VALUES (:orgId, 'Isolation group', NULL, :userId) RETURNING id`,
      { replacements: { orgId: ctx.orgId, userId: ctx.userId } },
    );
    return (rows as any[])[0].id;
  },
  updatePayload: () => ({ name: "Updated by isolation matrix" }),
  createPayload: (_owner, foreignOrgId) => ({
    name: "Cross-tenant group",
    description: "Should be stamped with the caller's organization",
    organization_id: foreignOrgId,
  }),
};

/** Organisation-owned policy templates (#5261), mirroring the report-templates pattern. */
export const policyTemplateFixture: EntityFixture = {
  seed: async (ctx) => {
    const [rows] = await sequelize.query(
      `INSERT INTO verifywise.policy_templates
         (organization_id, name, category, description, content, tags, is_system_template)
       VALUES (:orgId, 'Isolation template', 'Legal and compliance', NULL, '<p>x</p>', '{}', false)
       RETURNING id`,
      { replacements: { orgId: ctx.orgId } },
    );
    return (rows as any[])[0].id;
  },
  updatePayload: () => ({ name: "Updated by isolation matrix" }),
  createPayload: (_owner, foreignOrgId) => ({
    name: "Cross-tenant policy template",
    category: "Legal and compliance",
    organization_id: foreignOrgId,
  }),
};

export const riskFixture: EntityFixture = {
  seed: (ctx) => createTestRisk(ctx.orgId, { risk_owner: ctx.userId }),
  updatePayload: () => ({ risk_name: "Updated by isolation matrix" }),
  createPayload: async (owner, foreignOrgId) => ({
    risk_name: "Cross-tenant risk",
    risk_owner: owner.userId,
    project_id: await createTestProject(owner.orgId, owner.userId),
    organization_id: foreignOrgId,
  }),
};

/**
 * Files are seeded through the real upload rather than a direct INSERT: the
 * download route sends the stored content and MIME type, which a bare row
 * lacks, and uploads get the "File Manager" source that the /api/files list
 * expects (it drops NULL and report sources).
 *
 * The upload is then attached to one of the owner's projects, because the
 * /api/files list inner-joins `projects` on `project_id`
 * (utils/files/getUserFilesMetaData.utils.ts), so a file without a project
 * never appears in it, not even for its owner.
 */
export const fileFixture: EntityFixture = {
  seed: async (ctx) => {
    const res = await uploadCsv(ctx.request, "/api/file-manager");
    if (res.status !== 201) {
      throw new Error(`File seed upload returned ${res.status}: ${JSON.stringify(res.body)}`);
    }
    const fileId: number = res.body.data.id;
    const projectId = await createTestProject(ctx.orgId, ctx.userId);
    await sequelize.query(`UPDATE files SET project_id = :projectId WHERE id = :fileId`, {
      replacements: { projectId, fileId },
    });
    return fileId;
  },
  updatePayload: () => ({ description: "Updated by isolation matrix" }),
  createRequest: async (owner, foreignOrgId, route) =>
    await uploadCsv(owner.request, route, { organization_id: String(foreignOrgId) }),
};
