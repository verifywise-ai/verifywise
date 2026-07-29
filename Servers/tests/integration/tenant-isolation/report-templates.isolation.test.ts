jest.setTimeout(60000);

import { cleanupDatabase } from "../helpers";
import { sequelize } from "../../../database/db";
import { QueryTypes } from "sequelize";
import { seedTwoTenantContexts, TenantContext } from "./tenantIsolation.harness";

const ROUTES = {
  list: "/api/reporting/templates",
  get: (id: number) => `/api/reporting/templates/${id}`,
  create: "/api/reporting/templates",
  update: (id: number) => `/api/reporting/templates/${id}`,
  delete: (id: number) => `/api/reporting/templates/${id}`,
};

const VALID_BODY = {
  name: "Quarterly board pack",
  category: "governance",
  default_scope: "organization",
  sections_config: { sections: [] },
};

const SCHEDULED_REPORTS = "/api/reporting/scheduled-reports";

async function seedTemplate(ctx: TenantContext): Promise<number> {
  const res = await ctx.request.post(ROUTES.create).send(VALID_BODY);
  expect(res.status).toBe(201);
  return (res.body?.data ?? res.body).id;
}

async function latestVersionId(templateId: number): Promise<number> {
  const [version]: any[] = await sequelize.query(
    `SELECT id FROM report_template_versions WHERE template_id = :id ORDER BY version DESC LIMIT 1`,
    { replacements: { id: templateId }, type: QueryTypes.SELECT },
  );
  return version.id;
}

/**
 * Creates a schedule owned by ctx's organization. The template is seeded
 * through ctx too, so the row can never be a cross-tenant reference by
 * accident.
 */
async function seedScheduledReport(ctx: TenantContext, over: Record<string, any>): Promise<any> {
  const templateId = await seedTemplate(ctx);
  const res = await ctx.request.post(SCHEDULED_REPORTS).send({
    templateId,
    templateVersionId: await latestVersionId(templateId),
    scope: "organization",
    sectionsConfig: { sections: [{ reportSectionKey: "projectRisks", defaultEnabled: true }] },
    aiBlocksConfig: {},
    format: "pdf",
    scheduleConfig: { frequency: "daily", hour: 9, minute: 0, timezone: "UTC" },
    deliveryConfig: { saveToStorage: true },
    ...over,
  });
  expect(res.status).toBe(201);
  return res.body?.data ?? res.body;
}

describe("Report templates tenant isolation", () => {
  // cleanupDatabase() truncates `organizations ... CASCADE`, which reaches
  // report_templates through its organization_id FK and takes the
  // migration-seeded system templates with it. Everything after the first
  // cleanup therefore runs against a table with no system rows, so re-seed
  // one rather than depending on migration state that no longer exists.
  beforeEach(async () => {
    await sequelize.query(
      `INSERT INTO report_templates (name, slug, category, default_scope, is_system_template)
       VALUES ('System board pack', 'system-board-pack', 'governance', 'organization', true)
       ON CONFLICT DO NOTHING`,
    );
  });

  afterEach(async () => {
    await cleanupDatabase();
  });

  it("denies cross-tenant read, update and delete", async () => {
    const { owner, attacker } = await seedTwoTenantContexts();
    const id = await seedTemplate(owner);

    expect((await attacker.request.get(ROUTES.get(id))).status).toBe(404);
    expect(
      (await attacker.request.patch(ROUTES.update(id)).send({ name: "Hijacked" })).status,
    ).toBe(404);
    expect((await attacker.request.delete(ROUTES.delete(id))).status).toBe(404);

    // The row must be genuinely untouched, not merely reported as missing.
    const [row]: any[] = await sequelize.query(
      `SELECT name, is_active FROM report_templates WHERE id = :id`,
      { replacements: { id }, type: QueryTypes.SELECT },
    );
    expect(row.name).toBe(VALID_BODY.name);
    expect(row.is_active).toBe(true);
  });

  it("lists only the caller's own templates alongside system templates", async () => {
    const { owner, attacker } = await seedTwoTenantContexts();
    await seedTemplate(owner);

    const ownerItems = (await owner.request.get(ROUTES.list)).body?.data ?? [];
    const attackerItems = (await attacker.request.get(ROUTES.list)).body?.data ?? [];

    expect(ownerItems.some((t: any) => t.name === VALID_BODY.name)).toBe(true);
    expect(attackerItems.some((t: any) => t.name === VALID_BODY.name)).toBe(false);
    // Both orgs still see the org-less system templates.
    expect(attackerItems.some((t: any) => t.is_system_template)).toBe(true);
  });

  it("ignores a foreign organization_id and a forged is_system_template on create", async () => {
    const { owner, attacker } = await seedTwoTenantContexts();

    const res = await owner.request.post(ROUTES.create).send({
      ...VALID_BODY,
      organization_id: attacker.orgId,
      is_system_template: true,
    });
    expect(res.status).toBe(201);

    const created = res.body?.data ?? res.body;
    const [row]: any[] = await sequelize.query(
      `SELECT organization_id, is_system_template FROM report_templates WHERE id = :id`,
      { replacements: { id: created.id }, type: QueryTypes.SELECT },
    );
    expect(row.organization_id).toBe(owner.orgId);
    expect(row.is_system_template).toBe(false);
  });

  it("refuses writes to a system template even for an Admin", async () => {
    const { owner } = await seedTwoTenantContexts();

    const [sys]: any[] = await sequelize.query(
      `SELECT id FROM report_templates WHERE is_system_template = true LIMIT 1`,
      { type: QueryTypes.SELECT },
    );
    expect(sys).toBeTruthy();

    expect(
      (await owner.request.patch(ROUTES.update(sys.id)).send({ name: "Hijacked" })).status,
    ).toBe(404);
    expect((await owner.request.delete(ROUTES.delete(sys.id))).status).toBe(404);

    const [row]: any[] = await sequelize.query(
      `SELECT name, is_active FROM report_templates WHERE id = :id`,
      { replacements: { id: sys.id }, type: QueryTypes.SELECT },
    );
    expect(row.name).not.toBe("Hijacked");
    expect(row.is_active).toBe(true);
  });

  it("rejects a scheduled report that references another org's template version", async () => {
    const { owner, attacker } = await seedTwoTenantContexts();
    const ownerTemplateId = await seedTemplate(owner);

    const [version]: any[] = await sequelize.query(
      `SELECT id FROM report_template_versions WHERE template_id = :id ORDER BY version DESC LIMIT 1`,
      { replacements: { id: ownerTemplateId }, type: QueryTypes.SELECT },
    );

    const res = await attacker.request.post("/api/reporting/scheduled-reports").send({
      templateId: ownerTemplateId,
      templateVersionId: version.id,
      name: "Cross-tenant schedule",
      scope: "organization",
      sectionsConfig: { sections: [{ reportSectionKey: "projectRisks", defaultEnabled: true }] },
      aiBlocksConfig: {},
      format: "pdf",
      scheduleConfig: { frequency: "daily", hour: 9, minute: 0, timezone: "UTC" },
      deliveryConfig: { saveToStorage: true },
    });
    expect(res.status).toBe(400);

    const rows: any[] = await sequelize.query(
      `SELECT id FROM scheduled_reports WHERE organization_id = :org`,
      { replacements: { org: attacker.orgId }, type: QueryTypes.SELECT },
    );
    expect(rows).toHaveLength(0);
  });

  // framework_ids is a new tenant-scoped column and carries the report's
  // framework selection. There is no GET /scheduled-reports/:id route, so the
  // cross-tenant read is proven through the list endpoint plus a direct SELECT
  // showing the owner's value is genuinely intact, not merely hidden.
  it("does not expose another organization's framework_ids", async () => {
    const { owner, attacker } = await seedTwoTenantContexts();
    const created = await seedScheduledReport(owner, {
      name: "Org A ISO run",
      frameworkIds: ["native:2"],
    });

    const attackerItems = (await attacker.request.get(SCHEDULED_REPORTS)).body?.data ?? [];
    expect(attackerItems.some((r: any) => r.id === created.id)).toBe(false);
    expect(attackerItems.some((r: any) => r.name === "Org A ISO run")).toBe(false);

    const [row]: any[] = await sequelize.query(
      `SELECT organization_id, framework_ids FROM scheduled_reports WHERE id = :id`,
      { replacements: { id: created.id }, type: QueryTypes.SELECT },
    );
    expect(row.organization_id).toBe(owner.orgId);
    expect(row.framework_ids).toEqual(["native:2"]);
  });

  it("keeps each organization's framework_ids on its own row", async () => {
    const { owner, attacker } = await seedTwoTenantContexts();
    const a = await seedScheduledReport(owner, {
      name: "Org A ISO run",
      frameworkIds: ["native:2"],
    });
    const b = await seedScheduledReport(attacker, {
      name: "Org B NIST run",
      frameworkIds: ["native:4"],
    });

    const ownerItems = (await owner.request.get(SCHEDULED_REPORTS)).body?.data ?? [];
    const attackerItems = (await attacker.request.get(SCHEDULED_REPORTS)).body?.data ?? [];

    expect(ownerItems.find((r: any) => r.id === a.id)?.framework_ids).toEqual(["native:2"]);
    expect(ownerItems.some((r: any) => r.id === b.id)).toBe(false);
    expect(attackerItems.find((r: any) => r.id === b.id)?.framework_ids).toEqual(["native:4"]);
    expect(attackerItems.some((r: any) => r.id === a.id)).toBe(false);
  });

  it("rejects an unparseable framework selection instead of widening the schedule", async () => {
    const { owner } = await seedTwoTenantContexts();
    const templateId = await seedTemplate(owner);

    const res = await owner.request.post(SCHEDULED_REPORTS).send({
      templateId,
      templateVersionId: await latestVersionId(templateId),
      name: "Typo'd selection",
      scope: "organization",
      sectionsConfig: { sections: [{ reportSectionKey: "projectRisks", defaultEnabled: true }] },
      aiBlocksConfig: {},
      format: "pdf",
      scheduleConfig: { frequency: "daily", hour: 9, minute: 0, timezone: "UTC" },
      deliveryConfig: { saveToStorage: true },
      frameworkIds: ["native:2", "iso42001"],
    });

    // An empty selection means EVERY framework in scope, so silently dropping
    // the unrecognised entry would widen the report with nothing to show it.
    expect(res.status).toBe(400);
    const rows: any[] = await sequelize.query(
      `SELECT id FROM scheduled_reports WHERE organization_id = :org`,
      { replacements: { org: owner.orgId }, type: QueryTypes.SELECT },
    );
    expect(rows).toHaveLength(0);
  });
});
