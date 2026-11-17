jest.setTimeout(120000);

import { QueryTypes } from "sequelize";
import { sequelize } from "../../database/db";
import { cleanupDatabase, createTestOrganization, createTestUser, seedFrameworks } from "./helpers";
import { createTestApp, testRequest } from "./setup";
import {
  createTestAssessment,
  createTestControlEU,
  createTestFile,
  createTestProject,
  createTestProjectFramework,
} from "../factories";

/**
 * Past the use case guard, a handler must only touch rows of the use case the
 * guard checked: never a row named in the body that belongs to another use
 * case, and never a use case id taken from the body.
 */

type Api = ReturnType<typeof testRequest>;

let counter = 0;
const editor = (orgId: number) => {
  counter += 1;
  return createTestUser(orgId, 3, `uc-rows-${Date.now()}-${counter}@test.com`, "Pw1!x");
};

const one = async <T extends object>(
  sql: string,
  replacements: Record<string, unknown>,
): Promise<T | undefined> =>
  (await sequelize.query<T>(sql, { replacements, type: QueryTypes.SELECT }))[0];

const insertId = async (sql: string, replacements: Record<string, unknown>) =>
  (await one<{ id: number }>(sql, replacements))!.id;

describe("guarded handlers stay inside the checked use case", () => {
  let orgId: number;
  let ownerId: number;
  let api: Api;
  /** A use case the owner cannot see. */
  let otherProject: number;

  beforeAll(async () => {
    await cleanupDatabase();
    await seedFrameworks();
    orgId = await createTestOrganization();
    ownerId = await editor(orgId);
    otherProject = await createTestProject(orgId, await editor(orgId));
    api = testRequest(
      await createTestApp({
        bypassAuth: true,
        mockUser: { userId: ownerId, organizationId: orgId, role: "Editor" },
      }),
    );
  });

  afterAll(async () => {
    await cleanupDatabase();
  });

  const pendingApproval = (projectId: number) =>
    sequelize.query(
      `INSERT INTO approval_requests (organization_id, request_name, entity_id, entity_type, status)
       VALUES (:orgId, 'Review', :projectId, 'use_case', 'Pending')`,
      { replacements: { orgId, projectId } },
    );

  describe("EU AI Act", () => {
    const euControl = async (projectId: number) => {
      const pf = await createTestProjectFramework(orgId, projectId, 1);
      const control = await createTestControlEU(orgId, { projects_frameworks_id: pf });
      const subcontrol = await insertId(
        `INSERT INTO subcontrols_eu (organization_id, control_id, implementation_details)
         VALUES (:orgId, :control, 'original') RETURNING id`,
        { orgId, control },
      );
      return { pf, control, subcontrol };
    };

    it("refuses a subcontrol of another control with 404 and writes nothing", async () => {
      const mine = await euControl(await createTestProject(orgId, ownerId));
      const theirs = await euControl(otherProject);

      const res = await api.patch(`/api/eu-ai-act/saveControls/${mine.control}`).send({
        subControls: JSON.stringify([
          { id: mine.subcontrol, implementation_details: "mine changed" },
          { id: theirs.subcontrol, implementation_details: "hijacked" },
        ]),
      });

      expect(res.status).toBe(404);
      for (const id of [mine.subcontrol, theirs.subcontrol]) {
        const row = await one<{ implementation_details: string }>(
          `SELECT implementation_details FROM subcontrols_eu WHERE id = :id`,
          { id },
        );
        expect(row?.implementation_details).toBe("original");
      }
    });

    it("still saves the control's own subcontrols", async () => {
      const mine = await euControl(await createTestProject(orgId, ownerId));

      const res = await api.patch(`/api/eu-ai-act/saveControls/${mine.control}`).send({
        subControls: JSON.stringify([{ id: mine.subcontrol, implementation_details: "changed" }]),
      });

      expect(res.status).toBe(200);
      const row = await one<{ implementation_details: string }>(
        `SELECT implementation_details FROM subcontrols_eu WHERE id = :id`,
        { id: mine.subcontrol },
      );
      expect(row?.implementation_details).toBe("changed");
    });

    it("checks the pending approval of the control's use case, not the body's project_id", async () => {
      const projectId = await createTestProject(orgId, ownerId);
      const mine = await euControl(projectId);
      await pendingApproval(projectId);

      const res = await api
        .patch(`/api/eu-ai-act/saveControls/${mine.control}`)
        .send({ project_id: otherProject, subControls: "[]" });

      expect(res.status).toBe(403);
    });

    it("checks the pending approval of the answer's use case, not the body's project_id", async () => {
      const projectId = await createTestProject(orgId, ownerId);
      const pf = await createTestProjectFramework(orgId, projectId, 1);
      const assessment = await createTestAssessment(orgId, {
        project_id: projectId,
        projects_frameworks_id: pf,
      });
      const answer = await insertId(
        `INSERT INTO answers_eu (organization_id, assessment_id) VALUES (:orgId, :assessment) RETURNING id`,
        { orgId, assessment },
      );
      await pendingApproval(projectId);

      const res = await api
        .patch(`/api/eu-ai-act/saveAnswer/${answer}`)
        .send({ project_id: String(otherProject), answer: "changed" });

      expect(res.status).toBe(403);
    });
  });

  describe("evidence uploads are filed under the checked use case", () => {
    const fileProjects = async () =>
      (
        await sequelize.query<{ project_id: number | null }>(
          `SELECT project_id FROM files WHERE organization_id = :orgId AND filename = 'evidence.csv'`,
          { replacements: { orgId }, type: QueryTypes.SELECT },
        )
      ).map((r) => r.project_id);

    beforeEach(async () => {
      await sequelize.query(`DELETE FROM files WHERE filename = 'evidence.csv'`);
    });

    const row = async (table: string, frameworkId: number, projectId: number) => {
      const pf = await createTestProjectFramework(orgId, projectId, frameworkId);
      return insertId(
        `INSERT INTO ${table} (organization_id, projects_frameworks_id) VALUES (:orgId, :pf) RETURNING id`,
        { orgId, pf },
      );
    };

    it.each([
      ["iso-27001/saveClauses", "subclauses_iso27001", 3],
      ["iso-27001/saveAnnexes", "annexcontrols_iso27001", 3],
      ["nist-ai-rmf/subcategories", "nist_ai_rmf_subcategories", 4],
    ])("PATCH /api/%s ignores the body's project_id", async (path, table, frameworkId) => {
      const projectId = await createTestProject(orgId, ownerId);
      const id = await row(table, frameworkId, projectId);

      const res = await api
        .patch(`/api/${path}/${id}`)
        .field("project_id", String(otherProject))
        .field("user_id", String(ownerId))
        .attach("evidence_files", Buffer.from("a,b\n1,2\n"), {
          filename: "evidence.csv",
          contentType: "text/csv",
        });

      expect(res.status).toBeLessThan(300);
      expect(await fileProjects()).toEqual([projectId]);
    });
  });

  describe("FRIA", () => {
    const friaOf = (projectId: number) =>
      insertId(
        `INSERT INTO fria_assessments (organization_id, project_id, version, status, created_by)
         VALUES (:orgId, :projectId, 1, 'draft', NULL) RETURNING id`,
        { orgId, projectId },
      );

    const evidenceLink = async (friaId: number) => {
      const fileId = await createTestFile(orgId, ownerId);
      return insertId(
        `INSERT INTO file_entity_links (organization_id, file_id, framework_type, entity_type, entity_id)
         VALUES (:orgId, :fileId, 'fria', 'section_1', :friaId) RETURNING id`,
        { orgId, fileId, friaId },
      );
    };

    const linkExists = async (id: number) =>
      (
        await sequelize.query(`SELECT 1 FROM file_entity_links WHERE id = :id`, {
          replacements: { id },
          type: QueryTypes.SELECT,
        })
      ).length === 1;

    it("refuses to unlink another FRIA's evidence with 404 and keeps the link", async () => {
      const mine = await friaOf(await createTestProject(orgId, ownerId));
      const theirs = await friaOf(await createTestProject(orgId, await editor(orgId)));
      const theirLink = await evidenceLink(theirs);

      const res = await api.delete(`/api/fria/${mine}/evidence/${theirLink}`);

      expect(res.status).toBe(404);
      expect(await linkExists(theirLink)).toBe(true);
    });

    it("still unlinks the FRIA's own evidence", async () => {
      const mine = await friaOf(await createTestProject(orgId, ownerId));
      const link = await evidenceLink(mine);

      const res = await api.delete(`/api/fria/${mine}/evidence/${link}`);

      expect(res.status).toBe(200);
      expect(await linkExists(link)).toBe(false);
    });

    it.each(["patch", "delete"] as const)(
      "refuses to %s another FRIA's risk item with 404 and leaves it",
      async (method) => {
        const mine = await friaOf(await createTestProject(orgId, ownerId));
        const theirs = await friaOf(await createTestProject(orgId, await editor(orgId)));
        const item = await insertId(
          `INSERT INTO fria_risk_items (organization_id, fria_id, risk_description)
           VALUES (:orgId, :theirs, 'theirs') RETURNING id`,
          { orgId, theirs },
        );

        const res = await api[method](`/api/fria/${mine}/risk-items/${item}`).send({
          risk_description: "hijacked",
        });

        expect(res.status).toBe(404);
        const row = await one<{ risk_description: string }>(
          `SELECT risk_description FROM fria_risk_items WHERE id = :item`,
          { item },
        );
        expect(row?.risk_description).toBe("theirs");
      },
    );
  });
});
