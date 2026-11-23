jest.setTimeout(60000);

import { cleanupDatabase, createTestUser } from "../helpers";
import { createTestApp, testRequest } from "../setup";
import { createTestProject } from "../../factories";
import { sequelize } from "../../../database/db";
import { QueryTypes } from "sequelize";
import { seedTwoTenantContexts, TenantContext } from "./tenantIsolation.harness";

const lastParameters = (templateId: number) =>
  `/api/v1/report-templates/${templateId}/last-parameters`;

/**
 * A system template (organization_id NULL) is shared by every organization,
 * which is exactly why last-parameters must match runs on organization_id
 * and not on the template alone.
 */
async function seedSystemTemplate(slug: string): Promise<number> {
  const [row]: any[] = await sequelize.query(
    `INSERT INTO report_templates
       (organization_id, name, slug, category, default_scope, is_system_template, is_active)
     VALUES (NULL, :name, :slug, 'compliance', 'organization', true, true)
     RETURNING id`,
    { replacements: { name: `Template ${slug}`, slug }, type: QueryTypes.SELECT },
  );
  return row.id;
}

async function seedOrgTemplate(ctx: TenantContext, slug: string): Promise<number> {
  const [row]: any[] = await sequelize.query(
    `INSERT INTO report_templates
       (organization_id, name, slug, category, default_scope, is_system_template, is_active)
     VALUES (:org, :name, :slug, 'compliance', 'organization', false, true)
     RETURNING id`,
    { replacements: { org: ctx.orgId, name: `Template ${slug}`, slug }, type: QueryTypes.SELECT },
  );
  return row.id;
}

/** Runs are made by the pipeline, not an HTTP route, so seed with SQL. */
async function seedRun(
  ctx: TenantContext,
  templateId: number,
  parameters: Record<string, string | boolean>,
  completedAt: string,
  status = "success",
  projectId: number | null = null,
): Promise<void> {
  await sequelize.query(
    `INSERT INTO report_runs
       (organization_id, template_id, triggered_by, triggered_by_user_id, status,
        completed_at, config_snapshot)
     VALUES (:org, :templateId, 'manual', :user, :status, :completedAt, :snapshot)`,
    {
      replacements: {
        org: ctx.orgId,
        templateId,
        user: ctx.userId,
        status,
        completedAt,
        snapshot: JSON.stringify({ project_id: projectId, report_parameters: parameters }),
      },
    },
  );
}

describe("Report last-parameters tenant isolation", () => {
  afterEach(async () => {
    await cleanupDatabase();
  });

  it("never returns another organization's run of the same system template", async () => {
    const { owner, attacker } = await seedTwoTenantContexts();
    const templateId = await seedSystemTemplate("e23-isolation");

    await seedRun(
      owner,
      templateId,
      {
        institutionName: "Owner Bank",
        periodStart: "2026-05-01",
        periodEnd: "2026-07-31",
      },
      "2026-08-02T10:00:00Z",
    );
    // The attacker's run is the more recent one: a query that forgot the
    // organization filter would hand it to the owner.
    await seedRun(
      attacker,
      templateId,
      {
        institutionName: "Attacker Bank",
        periodStart: "2026-08-01",
        periodEnd: "2026-10-31",
      },
      "2026-11-02T10:00:00Z",
    );

    const ownerRes = await owner.request.get(lastParameters(templateId));
    expect(ownerRes.status).toBe(200);
    expect(ownerRes.body.data).toEqual({
      parameters: { institutionName: "Owner Bank" },
      periodEnd: "2026-07-31",
    });

    const attackerRes = await attacker.request.get(lastParameters(templateId));
    expect(attackerRes.status).toBe(200);
    expect(attackerRes.body.data).toEqual({
      parameters: { institutionName: "Attacker Bank" },
      periodEnd: "2026-10-31",
    });
  });

  it("takes the latest successful or partially successful run, ignoring other templates and failed runs", async () => {
    const { owner } = await seedTwoTenantContexts();
    const templateId = await seedSystemTemplate("e23-target");
    const otherTemplateId = await seedSystemTemplate("e23-other");

    await seedRun(
      owner,
      templateId,
      { institutionName: "Kept", periodEnd: "2026-07-31" },
      "2026-08-02T10:00:00Z",
    );
    await seedRun(
      owner,
      templateId,
      { institutionName: "Partly delivered", periodEnd: "2026-08-31" },
      "2026-09-02T10:00:00Z",
      "partial_success",
    );
    await seedRun(
      owner,
      otherTemplateId,
      { institutionName: "Other template" },
      "2026-11-02T10:00:00Z",
    );
    await seedRun(
      owner,
      templateId,
      { institutionName: "Failed run" },
      "2026-11-03T10:00:00Z",
      "failed",
    );

    const res = await owner.request.get(lastParameters(templateId));
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({
      parameters: { institutionName: "Partly delivered" },
      periodEnd: "2026-08-31",
    });
  });

  it("404s a template the caller's organization cannot see", async () => {
    const { owner, attacker } = await seedTwoTenantContexts();
    const ownerTemplateId = await seedOrgTemplate(owner, "owner-private");
    await seedRun(
      owner,
      ownerTemplateId,
      { institutionName: "Owner Bank" },
      "2026-08-02T10:00:00Z",
    );

    expect((await attacker.request.get(lastParameters(ownerTemplateId))).status).toBe(404);
    expect((await owner.request.get(lastParameters(ownerTemplateId))).status).toBe(200);
  });

  describe("within the organization", () => {
    /** An Editor in the owner's organization who is not on any project. */
    async function editorOf(ctx: TenantContext) {
      const userId = await createTestUser(
        ctx.orgId,
        3,
        `last-params-editor-${Date.now()}@test.com`,
        "Password123!",
      );
      const app = await createTestApp({
        bypassAuth: true,
        mockUser: { userId, organizationId: ctx.orgId, role: "Editor" },
      });
      return testRequest(app);
    }

    it("gives a member not on project P the older visible run, not P's run", async () => {
      const { owner } = await seedTwoTenantContexts();
      const templateId = await seedSystemTemplate("e23-visibility");
      const projectP = await createTestProject(owner.orgId, owner.userId);

      await seedRun(
        owner,
        templateId,
        { institutionName: "Organization run", periodEnd: "2026-07-31" },
        "2026-08-02T10:00:00Z",
      );
      await seedRun(
        owner,
        templateId,
        { institutionName: "Project P run", scopeNote: "P only", periodEnd: "2026-10-31" },
        "2026-11-02T10:00:00Z",
        "success",
        projectP,
      );

      const editor = await editorOf(owner);
      const editorRes = await editor.get(lastParameters(templateId));
      expect(editorRes.status).toBe(200);
      expect(editorRes.body.data).toEqual({
        parameters: { institutionName: "Organization run" },
        periodEnd: "2026-07-31",
      });

      // The Admin sees every run, so the newer project run is theirs.
      const adminRes = await owner.request.get(lastParameters(templateId));
      expect(adminRes.body.data.parameters.institutionName).toBe("Project P run");
    });

    it("gives that member nothing when P's run is the only one", async () => {
      const { owner } = await seedTwoTenantContexts();
      const templateId = await seedSystemTemplate("e23-visibility-only");
      const projectP = await createTestProject(owner.orgId, owner.userId);
      await seedRun(
        owner,
        templateId,
        { institutionName: "Project P run" },
        "2026-11-02T10:00:00Z",
        "success",
        projectP,
      );

      const editorRes = await (await editorOf(owner)).get(lastParameters(templateId));
      expect(editorRes.status).toBe(200);
      expect(editorRes.body.data).toBeNull();
    });
  });
});
