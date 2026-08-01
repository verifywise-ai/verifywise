/**
 * Deleting a user must not be blocked by the reporting / workflow tables.
 *
 * deleteUserByIdQuery hard-deletes the users row after nulling a hardcoded list
 * of FK columns. Every user reference this branch introduced was declared as a
 * bare `REFERENCES users(id)` — i.e. NO ACTION — and none of them is on that
 * list, so the DELETE raises 23503 and the enclosing transaction rolls back.
 *
 * The archive backfill (20260728180000) copies files.uploaded_by into
 * report_runs.triggered_by_user_id for every legacy report file, so on a real
 * install essentially every user who ever generated a report becomes
 * undeletable. The repo convention for user references is ON DELETE SET NULL
 * (files.uploaded_by, post_market_monitoring_reports.generated_by); this suite
 * pins that behaviour for the new tables.
 */

import { sequelize } from "../../database/db";
import { QueryTypes } from "sequelize";
import { deleteUserByIdQuery } from "../../utils/user.utils";
import { startWorkflow } from "../../services/workflows/engine";
import { WorkflowDefinition } from "../../services/workflows/types";
import { createTestOrganization, createTestUser, cleanupDatabase } from "./helpers";

const probeWorkflow: WorkflowDefinition = {
  id: "user_deletion_probe",
  name: "User deletion probe",
  triggerName: "user.deletion.probe",
  agents: ["probe"],
  steps: [
    {
      id: "only",
      description: "no-op",
      agent: "probe",
      isWrite: false,
      handler: async () => ({ type: "ok", output: {} }),
    },
  ],
};

async function seedTemplate(orgId: number, userId: number): Promise<number> {
  const rows = (await sequelize.query(
    `INSERT INTO report_templates
       (organization_id, name, slug, category, default_scope, created_by, created_at, updated_at)
     VALUES (:orgId, 'Probe template', :slug, 'governance', 'organization', :userId, NOW(), NOW())
     RETURNING id`,
    {
      replacements: { orgId, userId, slug: `probe-${Date.now()}` },
      type: QueryTypes.SELECT,
    },
  )) as Array<{ id: number }>;
  return rows[0].id;
}

describe("user deletion against branch-introduced user foreign keys", () => {
  let orgId: number;
  let userId: number;

  beforeEach(async () => {
    await cleanupDatabase();
    orgId = await createTestOrganization("FK probe org");
    userId = await createTestUser(orgId, 1, `fk-probe-${Date.now()}@test.com`, "Password123!");
  });

  afterAll(async () => {
    await cleanupDatabase();
    await sequelize.close();
  });

  it("deletes a user who owns a workflow run and a report template", async () => {
    const run = await startWorkflow(probeWorkflow, { organizationId: orgId, userId });
    const templateId = await seedTemplate(orgId, userId);

    const transaction = await sequelize.transaction();
    let deleted: Boolean;
    try {
      deleted = await deleteUserByIdQuery(userId, orgId, transaction);
      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }

    expect(deleted).toBe(true);

    // The referencing rows must survive with the reference cleared — losing the
    // workflow run or the template would be a worse outcome than the 23503.
    const runRows = (await sequelize.query(
      `SELECT started_by FROM ai_workflow_runs WHERE id = :id`,
      { replacements: { id: run.id }, type: QueryTypes.SELECT },
    )) as Array<{ started_by: number | null }>;
    expect(runRows).toHaveLength(1);
    expect(runRows[0].started_by).toBeNull();

    const templateRows = (await sequelize.query(
      `SELECT created_by FROM report_templates WHERE id = :id`,
      { replacements: { id: templateId }, type: QueryTypes.SELECT },
    )) as Array<{ created_by: number | null }>;
    expect(templateRows).toHaveLength(1);
    expect(templateRows[0].created_by).toBeNull();
  });

  it("declares ON DELETE SET NULL on every user reference the reporting and workflow tables add", async () => {
    // Guards the next table: a new bare `REFERENCES users(id)` in this area
    // reintroduces the same undeletable-user bug, and the functional test above
    // only covers the two tables it happens to touch.
    const rows = (await sequelize.query(
      `SELECT c.conrelid::regclass::text AS tbl,
              a.attname            AS col,
              c.confdeltype::text  AS ondelete
         FROM pg_constraint c
         JOIN unnest(c.conkey) WITH ORDINALITY k(attnum, ord) ON true
         JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k.attnum
        WHERE c.contype = 'f'
          AND c.confrelid = 'verifywise.users'::regclass
          AND c.conrelid::regclass::text ~ '(report_templates|report_template_versions|report_runs|scheduled_reports|ai_workflow_runs)'
        ORDER BY 1, 2`,
      { type: QueryTypes.SELECT },
    )) as Array<{ tbl: string; col: string; ondelete: string }>;

    expect(rows.length).toBe(7);
    const offenders = rows.filter((r) => r.ondelete !== "n").map((r) => `${r.tbl}.${r.col}`);
    expect(offenders).toEqual([]);
  });
});
