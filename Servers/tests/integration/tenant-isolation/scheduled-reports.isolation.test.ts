jest.setTimeout(60000);

import { cleanupDatabase } from "../helpers";
import { sequelize } from "../../../database/db";
import { QueryTypes } from "sequelize";
import { seedTwoTenantContexts, TenantContext } from "./tenantIsolation.harness";

/**
 * report-templates.isolation.test.ts already covers the create and list paths
 * of this table (a schedule may not reference another org's template version,
 * and a list returns only the caller's rows). What it does not cover is the
 * per-id surface, which is where the mutating endpoints live: patch, pause,
 * resume, run-now and delete.
 *
 * Worth knowing while reading the assertions: pause, resume and delete return
 * 200 unconditionally. The queries behind them are org-scoped
 * (`WHERE id = :id AND organization_id = :org`), so a cross-tenant call changes
 * nothing — but the caller is told "ok". That is why every test here asserts on
 * the row rather than on the status code: a status-only test would pass even if
 * the WHERE clause lost its organization_id.
 */

const TEMPLATES = "/api/reporting/templates";
const SCHEDULES = "/api/reporting/scheduled-reports";
const ROUTES = {
  update: (id: number) => `${SCHEDULES}/${id}`,
  pause: (id: number) => `${SCHEDULES}/${id}/pause`,
  resume: (id: number) => `${SCHEDULES}/${id}/resume`,
  runNow: (id: number) => `${SCHEDULES}/${id}/run-now`,
  remove: (id: number) => `${SCHEDULES}/${id}`,
};

const VALID_TEMPLATE = {
  name: "Quarterly board pack",
  category: "governance",
  default_scope: "organization",
  sections_config: { sections: [] },
};

async function latestVersionId(templateId: number): Promise<number> {
  const [version]: any[] = await sequelize.query(
    `SELECT id FROM report_template_versions WHERE template_id = :id ORDER BY version DESC LIMIT 1`,
    { replacements: { id: templateId }, type: QueryTypes.SELECT },
  );
  return version.id;
}

/**
 * Seeds a schedule owned by ctx's organization, template included, so the row
 * can never be a cross-tenant reference by accident.
 */
async function seedSchedule(ctx: TenantContext, name = "Owner schedule"): Promise<number> {
  const templateRes = await ctx.request.post(TEMPLATES).send(VALID_TEMPLATE);
  expect(templateRes.status).toBe(201);
  const templateId = (templateRes.body?.data ?? templateRes.body).id;

  const res = await ctx.request.post(SCHEDULES).send({
    templateId,
    templateVersionId: await latestVersionId(templateId),
    name,
    scope: "organization",
    sectionsConfig: { sections: [{ reportSectionKey: "projectRisks", defaultEnabled: true }] },
    aiBlocksConfig: {},
    format: "pdf",
    scheduleConfig: { frequency: "daily", hour: 9, minute: 0, timezone: "UTC" },
    deliveryConfig: { saveToStorage: true },
  });
  expect(res.status).toBe(201);
  return (res.body?.data ?? res.body).id;
}

async function readRow(id: number): Promise<any> {
  const [row]: any[] = await sequelize.query(
    `SELECT organization_id, name, is_active, deleted_at, format FROM scheduled_reports WHERE id = :id`,
    { replacements: { id }, type: QueryTypes.SELECT },
  );
  return row;
}

describe("Scheduled reports tenant isolation", () => {
  afterEach(async () => {
    await cleanupDatabase();
  });

  it("denies a cross-tenant patch and leaves the row untouched", async () => {
    const { owner, attacker } = await seedTwoTenantContexts();
    const id = await seedSchedule(owner);

    const res = await attacker.request.patch(ROUTES.update(id)).send({ name: "hijacked" });
    expect(res.status).toBe(404);

    const row = await readRow(id);
    expect(row.name).toBe("Owner schedule");
    expect(row.organization_id).toBe(owner.orgId);
  });

  it("makes a cross-tenant pause a no-op, despite answering 200", async () => {
    const { owner, attacker } = await seedTwoTenantContexts();
    const id = await seedSchedule(owner);
    expect((await readRow(id)).is_active).toBe(true);

    // 200 with nothing changed: the handler does not distinguish "paused" from
    // "matched no row". The row is the assertion that matters.
    expect((await attacker.request.post(ROUTES.pause(id))).status).toBe(200);
    expect((await readRow(id)).is_active).toBe(true);

    // Positive control: the owner's pause does flip it, so the assertion above
    // is about the tenant guard and not about a route that never works.
    expect((await owner.request.post(ROUTES.pause(id))).status).toBe(200);
    expect((await readRow(id)).is_active).toBe(false);
  });

  it("makes a cross-tenant resume a no-op on a paused schedule", async () => {
    const { owner, attacker } = await seedTwoTenantContexts();
    const id = await seedSchedule(owner);
    await owner.request.post(ROUTES.pause(id));
    expect((await readRow(id)).is_active).toBe(false);

    expect((await attacker.request.post(ROUTES.resume(id))).status).toBe(200);
    expect((await readRow(id)).is_active).toBe(false);

    expect((await owner.request.post(ROUTES.resume(id))).status).toBe(200);
    expect((await readRow(id)).is_active).toBe(true);
  });

  it("denies a cross-tenant run-now and produces no run row for either org", async () => {
    const { owner, attacker } = await seedTwoTenantContexts();
    const id = await seedSchedule(owner);

    const res = await attacker.request.post(ROUTES.runNow(id));
    expect(res.status).toBe(404);

    // The org-scoped schedule lookup short-circuits before the orchestrator, so
    // no run is recorded anywhere — not under the attacker's org (which would
    // be a leak) and not under the owner's (which would be an unauthorized
    // side effect on their data).
    const runs: any[] = await sequelize.query(
      `SELECT organization_id FROM report_runs WHERE scheduled_report_id = :id`,
      { replacements: { id }, type: QueryTypes.SELECT },
    );
    expect(runs).toHaveLength(0);
  });

  it("makes a cross-tenant delete a no-op, leaving the schedule live", async () => {
    const { owner, attacker } = await seedTwoTenantContexts();
    const id = await seedSchedule(owner);

    expect((await attacker.request.delete(ROUTES.remove(id))).status).toBe(200);

    const afterAttack = await readRow(id);
    expect(afterAttack.deleted_at).toBeNull();
    expect(afterAttack.is_active).toBe(true);

    // Positive control: the owner's delete is a soft delete that does land.
    expect((await owner.request.delete(ROUTES.remove(id))).status).toBe(200);
    const afterOwner = await readRow(id);
    expect(afterOwner.deleted_at).not.toBeNull();
    expect(afterOwner.is_active).toBe(false);
  });

  it("keeps each organization's schedules out of the other's list", async () => {
    const { owner, attacker } = await seedTwoTenantContexts();
    const ownerId = await seedSchedule(owner, "Owner weekly");
    const attackerId = await seedSchedule(attacker, "Attacker weekly");

    const ownerList = (await owner.request.get(SCHEDULES)).body?.data ?? [];
    const attackerList = (await attacker.request.get(SCHEDULES)).body?.data ?? [];

    expect(ownerList.map((r: any) => r.id)).toEqual([ownerId]);
    expect(attackerList.map((r: any) => r.id)).toEqual([attackerId]);
  });
});
