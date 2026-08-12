jest.setTimeout(60000);

import { cleanupDatabase } from "../helpers";
import { sequelize } from "../../../database/db";
import { QueryTypes } from "sequelize";
import { seedTwoTenantContexts, TenantContext } from "./tenantIsolation.harness";
import { createTestFile } from "../../factories";
import * as fileUploadUtils from "../../../utils/fileUpload.utils";
import { getRunAnalysesQuery } from "../../../utils/reportRunAnalysis.utils";

const ROUTES = {
  list: "/api/reporting/runs",
  get: (id: number) => `/api/reporting/runs/${id}`,
  download: (id: number) => `/api/reporting/runs/${id}/download`,
  analyses: (id: number) => `/api/reporting/runs/${id}/analyses`,
  archive: (id: number) => `/api/reporting/runs/${id}/archive`,
  restore: (id: number) => `/api/reporting/runs/${id}/restore`,
  remove: (id: number) => `/api/reporting/runs/${id}`,
};

/**
 * No HTTP route creates a report_runs row (runs are created by the generation
 * pipeline / BullMQ worker), so seed with SQL. Only organization_id and
 * triggered_by are NOT NULL without a default.
 */
async function seedRun(
  ctx: TenantContext,
  overrides: { file_id?: number; output_filename?: string } = {},
): Promise<number> {
  const [row]: any[] = await sequelize.query(
    `INSERT INTO report_runs
       (organization_id, triggered_by, triggered_by_user_id, status,
        file_id, output_filename, output_mime_type)
     VALUES (:org, 'manual', :user, 'success', :fileId, :filename, 'application/pdf')
     RETURNING id`,
    {
      replacements: {
        org: ctx.orgId,
        user: ctx.userId,
        fileId: overrides.file_id ?? null,
        filename: overrides.output_filename ?? "owner-report.pdf",
      },
      type: QueryTypes.SELECT,
    },
  );
  return row.id;
}

async function seedAnalysis(ctx: TenantContext, runId: number, sectionKey: string): Promise<void> {
  await sequelize.query(
    `INSERT INTO report_run_analyses
       (report_run_id, section_key, organization_id, payload)
     VALUES (:runId, :sectionKey, :org, :payload)`,
    {
      replacements: {
        runId,
        sectionKey,
        org: ctx.orgId,
        payload: JSON.stringify({ secret: "owner-only analysis" }),
      },
    },
  );
}

describe("Report runs tenant isolation", () => {
  afterEach(async () => {
    await cleanupDatabase();
    jest.restoreAllMocks();
  });

  it("lists only the caller's own runs", async () => {
    const { owner, attacker } = await seedTwoTenantContexts();
    const ownerRunId = await seedRun(owner);
    const attackerRunId = await seedRun(attacker);

    const ownerRes = await owner.request.get(ROUTES.list);
    expect(ownerRes.status).toBe(200);
    const ownerBody = ownerRes.body?.data;
    expect(ownerBody.rows.map((r: any) => r.id)).toEqual([ownerRunId]);
    expect(ownerBody.total).toBe(1);

    const attackerRes = await attacker.request.get(ROUTES.list);
    expect(attackerRes.status).toBe(200);
    const attackerBody = attackerRes.body?.data;
    expect(attackerBody.rows.map((r: any) => r.id)).toEqual([attackerRunId]);
    expect(attackerBody.total).toBe(1);
  });

  it("denies cross-tenant read of a single run", async () => {
    const { owner, attacker } = await seedTwoTenantContexts();
    const runId = await seedRun(owner);

    expect((await attacker.request.get(ROUTES.get(runId))).status).toBe(404);
    expect((await owner.request.get(ROUTES.get(runId))).status).toBe(200);
  });

  it("denies cross-tenant download and never fetches the file", async () => {
    const { owner, attacker } = await seedTwoTenantContexts();
    const fileId = await createTestFile(owner.orgId, owner.userId);
    const runId = await seedRun(owner, { file_id: fileId });

    const spy = jest.spyOn(fileUploadUtils, "getFileById");

    const res = await attacker.request.get(ROUTES.download(runId));
    expect(res.status).toBe(404);
    // The run lookup is org-scoped, so the controller short-circuits before the
    // file layer is reached at all — no cross-org file read is even attempted.
    expect(spy).not.toHaveBeenCalled();

    // The owner's own download does reach the file layer, proving the assertion
    // above is about the tenant guard and not a dead code path.
    expect((await owner.request.get(ROUTES.download(runId))).status).toBe(200);
    expect(spy).toHaveBeenCalledWith(fileId, owner.orgId);
  });

  it("denies cross-tenant analyses read at both guard layers", async () => {
    const { owner, attacker } = await seedTwoTenantContexts();
    const runId = await seedRun(owner);
    await seedAnalysis(owner, runId, "projectRisks");

    // Layer 1: the org-scoped run lookup 404s before analyses are queried.
    const res = await attacker.request.get(ROUTES.analyses(runId));
    expect(res.status).toBe(404);

    // Layer 2: even called directly with the owner's run id, the org-scoped
    // analyses query returns nothing for the attacker's org.
    expect(await getRunAnalysesQuery(runId, attacker.orgId)).toHaveLength(0);
    expect(await getRunAnalysesQuery(runId, owner.orgId)).toHaveLength(1);

    // And nothing leaked into the attacker's org in the database.
    const leaked: any[] = await sequelize.query(
      `SELECT id FROM report_run_analyses WHERE organization_id = :org`,
      { replacements: { org: attacker.orgId }, type: QueryTypes.SELECT },
    );
    expect(leaked).toHaveLength(0);

    const ownerRes = await owner.request.get(ROUTES.analyses(runId));
    expect(ownerRes.status).toBe(200);
    expect(ownerRes.body?.data).toHaveLength(1);
  });

  it("denies cross-tenant archive, restore and delete, leaving the row untouched", async () => {
    const { owner, attacker } = await seedTwoTenantContexts();
    const runId = await seedRun(owner);

    const archiveRes = await attacker.request.patch(ROUTES.archive(runId));
    expect(archiveRes.status).toBe(404);

    const rowsAfterArchive: any[] = await sequelize.query(
      `SELECT archived_at FROM report_runs WHERE id = :id`,
      { replacements: { id: runId }, type: QueryTypes.SELECT },
    );
    expect(rowsAfterArchive[0].archived_at).toBeNull();

    const restoreRes = await attacker.request.patch(ROUTES.restore(runId));
    expect(restoreRes.status).toBe(404);

    const removeRes = await attacker.request.delete(ROUTES.remove(runId));
    expect(removeRes.status).toBe(404);

    // The one assertion that matters: a cross-tenant delete that returns 404
    // but still removed the row would pass a status-code-only test.
    const countRows: any[] = await sequelize.query(
      `SELECT count(*)::int AS count FROM report_runs WHERE id = :id`,
      { replacements: { id: runId }, type: QueryTypes.SELECT },
    );
    expect(countRows[0].count).toBe(1);
  });

  // Positive control for the test above: the cross-tenant delete 404s before
  // deleteRunQuery's DELETE statements ever run, so that test alone can't prove
  // the owner's delete path works against the real schema (report_runs.file_id
  // → files, ON DELETE SET NULL). This proves the happy path — run with a
  // file, deleted by its own org — actually removes both rows.
  it("owner can archive, restore and delete their own run, including its file", async () => {
    const { owner } = await seedTwoTenantContexts();
    const fileId = await createTestFile(owner.orgId, owner.userId);
    const runId = await seedRun(owner, { file_id: fileId });

    const archiveRes = await owner.request.patch(ROUTES.archive(runId));
    expect(archiveRes.status).toBe(200);
    const afterArchive: any[] = await sequelize.query(
      `SELECT archived_at FROM report_runs WHERE id = :id`,
      { replacements: { id: runId }, type: QueryTypes.SELECT },
    );
    expect(afterArchive[0].archived_at).not.toBeNull();

    const restoreRes = await owner.request.patch(ROUTES.restore(runId));
    expect(restoreRes.status).toBe(200);
    const afterRestore: any[] = await sequelize.query(
      `SELECT archived_at FROM report_runs WHERE id = :id`,
      { replacements: { id: runId }, type: QueryTypes.SELECT },
    );
    expect(afterRestore[0].archived_at).toBeNull();

    const removeRes = await owner.request.delete(ROUTES.remove(runId));
    expect(removeRes.status).toBe(200);

    const runRows: any[] = await sequelize.query(
      `SELECT count(*)::int AS count FROM report_runs WHERE id = :id`,
      { replacements: { id: runId }, type: QueryTypes.SELECT },
    );
    expect(runRows[0].count).toBe(0);

    const fileRows: any[] = await sequelize.query(
      `SELECT count(*)::int AS count FROM files WHERE id = :id`,
      { replacements: { id: fileId }, type: QueryTypes.SELECT },
    );
    expect(fileRows[0].count).toBe(0);
  });
});
