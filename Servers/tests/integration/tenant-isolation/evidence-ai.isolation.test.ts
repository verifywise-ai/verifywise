jest.setTimeout(60000);

import { cleanupDatabase, createTestUser } from "../helpers";
import { sequelize } from "../../../database/db";
import { seedTwoTenantContexts } from "./tenantIsolation.harness";
import { createTestApp, testRequest } from "../setup";
import { createTestFile, createTestProject } from "../../factories";
import { getAnalysisAuthorQuery, upsertAnalysisQuery } from "../../../utils/evidenceAi.utils";

/** A suggestion as applySuggestionsQuery reads it, so an allowed apply writes a link. */
const APPLY_BODY = {
  suggestions: [{ control_id: 1, framework_type: "eu_ai_act" }],
};

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

/** Status of every file-id endpoint for the given file. */
async function fileRouteStatuses(request: ReturnType<typeof testRequest>, fileId: number) {
  return [
    (await request.post(`/api/evidence-ai/analyze/${fileId}`)).status,
    (await request.get(`/api/evidence-ai/analysis/${fileId}`)).status,
    (await request.get(`/api/evidence-ai/suggestions/${fileId}`)).status,
    (await request.post(`/api/evidence-ai/suggestions/${fileId}/apply`).send(APPLY_BODY)).status,
  ];
}

/**
 * evidence_ai_analysis.file_id has no foreign key, so cleanupDatabase's
 * TRUNCATE ... CASCADE leaves its rows behind, and with ids restarted they
 * would attach to the next test's file.
 */
const clearAnalyses = () => sequelize.query(`TRUNCATE TABLE evidence_ai_analysis`);

describe("Evidence AI file access", () => {
  beforeAll(clearAnalyses);

  afterEach(async () => {
    await clearAnalyses();
    await cleanupDatabase();
  });

  async function projectFile() {
    const { owner, attacker } = await seedTwoTenantContexts();
    const project = await createTestProject(owner.orgId, owner.userId);
    const fileId = await createTestFile(owner.orgId, owner.userId, { project_id: project });
    return { owner, attacker, project, fileId };
  }

  it("refuses every file-id endpoint to an organization user who cannot open the file", async () => {
    const { owner, fileId } = await projectFile();
    const outsider = await orgUser(owner.orgId, 3, "Editor");
    expect(await fileRouteStatuses(outsider.request, fileId)).toEqual([403, 403, 403, 403]);
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
      (await auditor.request.post(`/api/evidence-ai/suggestions/${fileId}/apply`).send(APPLY_BODY))
        .status,
    ).toBe(403);
  });

  it("still serves the project's people", async () => {
    const { owner, project, fileId } = await projectFile();
    const member = await orgUser(owner.orgId, 3, "Editor", project);
    expect((await member.request.get(`/api/evidence-ai/analysis/${fileId}`)).status).toBe(204);
    expect((await owner.request.get(`/api/evidence-ai/analysis/${fileId}`)).status).toBe(204);
  });

  // files.org_id is NULL on migrated files and on uploadFile's rows; the old
  // check required it to match, which denied members a file the File Manager
  // download serves them.
  it("lets any organization member read an organization-level file", async () => {
    const { owner } = await seedTwoTenantContexts();
    const fileId = await createTestFile(owner.orgId, owner.userId);
    await sequelize.query(`UPDATE files SET org_id = NULL WHERE id = :fileId`, {
      replacements: { fileId },
    });
    const member = await orgUser(owner.orgId, 3, "Editor");
    expect((await member.request.get(`/api/evidence-ai/analysis/${fileId}`)).status).toBe(204);
  });

  it("limits quality scores to analyses of files the caller can open", async () => {
    const { owner, fileId } = await projectFile();
    await upsertAnalysisQuery(fileId, owner.orgId, {
      summary: "Project policy summary",
      key_findings: [],
      compliance_areas: [],
      quality_score: null,
      overall_quality_grade: "B",
      suggested_control_links: [],
      analysis_model: "test",
      analyzed_by: owner.userId,
    });
    const fileIds = (res: any) => ((res.body?.data ?? []) as any[]).map((r) => r.file_id);

    const outsider = await orgUser(owner.orgId, 3, "Editor");
    expect(fileIds(await outsider.request.get("/api/evidence-ai/quality-scores"))).toEqual([]);
    expect(fileIds(await owner.request.get("/api/evidence-ai/quality-scores"))).toEqual([fileId]);
  });

  it("never serves another organization's file or analysis", async () => {
    const { owner, attacker, fileId } = await projectFile();
    await upsertAnalysisQuery(fileId, owner.orgId, {
      summary: "Owner-only summary",
      key_findings: [],
      compliance_areas: [],
      quality_score: null,
      overall_quality_grade: "A",
      suggested_control_links: [],
      analysis_model: "test",
      analyzed_by: owner.userId,
    });

    const analysis = await attacker.request.get(`/api/evidence-ai/analysis/${fileId}`);
    expect(analysis.status).not.toBe(200);
    expect(JSON.stringify(analysis.body ?? {})).not.toContain("Owner-only summary");

    const scores = await attacker.request.get("/api/evidence-ai/quality-scores");
    expect(JSON.stringify(scores.body ?? {})).not.toContain("Owner-only summary");

    // The attacker is an Admin of their own organization: being an Admin
    // must not open another organization's file.
    const apply = await attacker.request
      .post(`/api/evidence-ai/suggestions/${fileId}/apply`)
      .send(APPLY_BODY);
    expect(apply.status).toBe(403);
    const [links] = await sequelize.query(
      `SELECT COUNT(*)::int AS n FROM file_entity_links WHERE file_id = :fileId`,
      { replacements: { fileId } },
    );
    expect((links as any[])[0].n).toBe(0);

    // The same body does write a link for the owner, so the 403 above is the
    // access check and not a malformed request.
    const own = await owner.request
      .post(`/api/evidence-ai/suggestions/${fileId}/apply`)
      .send(APPLY_BODY);
    expect(own.status).toBe(200);
    expect(own.body?.data?.applied_count).toBe(1);
  });

  it("re-checks the replace rule in the write against the database", async () => {
    const { owner, fileId } = await projectFile();
    const colleague = await orgUser(owner.orgId, 3, "Editor");
    const data = {
      summary: "Private notes",
      key_findings: [],
      compliance_areas: [],
      quality_score: null,
      overall_quality_grade: null,
      suggested_control_links: [],
      analysis_model: "test",
      analyzed_by: owner.userId,
      visibility: "private",
    };
    await upsertAnalysisQuery(fileId, owner.orgId, data);
    expect(await getAnalysisAuthorQuery(fileId, owner.orgId)).toMatchObject({
      visibility: "private",
      author_is_member: true,
    });

    const asColleague = { ...data, analyzed_by: colleague.userId, visibility: "public" };
    const guard = { userId: colleague.userId, visibility: "public", canOverride: false };
    expect(await upsertAnalysisQuery(fileId, owner.orgId, asColleague, guard)).toBeNull();
    expect((await getAnalysisAuthorQuery(fileId, owner.orgId))?.analyzed_by).toBe(owner.userId);

    const written = await upsertAnalysisQuery(fileId, owner.orgId, asColleague, {
      ...guard,
      canOverride: true,
    });
    expect(written?.analyzed_by).toBe(colleague.userId);
  });
});
