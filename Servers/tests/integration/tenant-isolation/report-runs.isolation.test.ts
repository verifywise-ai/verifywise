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
});
