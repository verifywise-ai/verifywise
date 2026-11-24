jest.setTimeout(120000);

/**
 * NIST AI RMF MEASURE 2.10–2.13 were missing on every install: the
 * subcategory id column was DECIMAL(4,1), so "2.10" collided with "2.1" and
 * the seed skipped it. Migration 20261123170316 makes the column text, adds
 * the four subcategories and gives projects already using NIST AI RMF a row
 * for each.
 */

import { QueryTypes } from "sequelize";
import { sequelize } from "../../database/db";
import { createNewSubcategoriesQuery } from "../../utils/nistAiRmfCorrect.utils";
import { createTestOrganization, createTestUser, cleanupDatabase } from "./helpers";
import { NIST_AI_RMF_Structure } from "../../structures/NIST-AI-RMF/nist-ai-rmf.structure";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const migration = require("../../database/migrations/20261123170316-add-nist-measure-2-10-to-2-13");

const NEW_IDS = ["2.10", "2.11", "2.12", "2.13"];
const totalInCode = NIST_AI_RMF_Structure.functions.reduce(
  (n, f) => n + f.categories.reduce((m, c) => m + c.subcategories.length, 0),
  0,
);

async function measureIds(): Promise<string[]> {
  const rows = (await sequelize.query(
    `SELECT subcategory_id FROM nist_ai_rmf_subcategories_struct
      WHERE function = 'MEASURE' AND subcategory_id LIKE '2.%' ORDER BY order_no`,
    { type: QueryTypes.SELECT },
  )) as Array<{ subcategory_id: string }>;
  return rows.map((r) => r.subcategory_id);
}

describe("NIST AI RMF MEASURE 2.10–2.13", () => {
  afterAll(async () => {
    await cleanupDatabase();
    await sequelize.close();
  });

  it("holds every subcategory in the code after the migrations, 2.10–2.13 included", async () => {
    const [{ count }] = (await sequelize.query(
      `SELECT COUNT(*)::int AS count FROM nist_ai_rmf_subcategories_struct`,
      { type: QueryTypes.SELECT },
    )) as Array<{ count: number }>;
    expect(count).toBe(totalInCode);
    expect(await measureIds()).toEqual(expect.arrayContaining(["2.1", ...NEW_IDS]));

    const [column] = (await sequelize.query(
      `SELECT data_type FROM information_schema.columns
        WHERE table_name = 'nist_ai_rmf_subcategories_struct' AND column_name = 'subcategory_id'`,
      { type: QueryTypes.SELECT },
    )) as Array<{ data_type: string }>;
    expect(column.data_type).toBe("character varying");
  });

  // An install upgraded from before the fix: a project already uses NIST AI
  // RMF but has no rows for the subcategories the seed skipped.
  it("adds the subcategories to projects already using NIST AI RMF, once", async () => {
    await cleanupDatabase();
    const orgId = await createTestOrganization("NIST org");
    const userId = await createTestUser(orgId, 1, `nist-${Date.now()}@test.com`, "Password123!");
    const [project] = (await sequelize.query(
      `INSERT INTO projects
         (project_title, owner, start_date, ai_risk_classification, high_risk_roles,
          goal, last_updated, last_updated_by, organization_id)
       VALUES ('NIST project', :userId, NOW(), 'High risk', '{Deployer}', 'goal', NOW(), :userId, :orgId)
       RETURNING id`,
      { replacements: { userId, orgId }, type: QueryTypes.SELECT },
    )) as Array<{ id: number }>;
    const [pf] = (await sequelize.query(
      `INSERT INTO projects_frameworks (organization_id, project_id, framework_id)
       VALUES (:orgId, :projectId, 4) RETURNING id`,
      { replacements: { orgId, projectId: project.id }, type: QueryTypes.SELECT },
    )) as Array<{ id: number }>;

    // Recreate the old state: the four struct rows (and so the project's rows
    // for them) do not exist.
    await sequelize.query(
      `DELETE FROM nist_ai_rmf_subcategories_struct
        WHERE function = 'MEASURE' AND subcategory_id IN (:ids)`,
      { replacements: { ids: NEW_IDS } },
    );
    await sequelize.transaction((t) => createNewSubcategoriesQuery(pf.id, orgId, t, false));

    const projectRows = async () =>
      (await sequelize.query(
        `SELECT ss.subcategory_id, s.status FROM nist_ai_rmf_subcategories s
           JOIN nist_ai_rmf_subcategories_struct ss ON ss.id = s.subcategory_meta_id
          WHERE s.projects_frameworks_id = :pfId AND ss.function = 'MEASURE'
            AND ss.subcategory_id IN (:ids)`,
        { replacements: { pfId: pf.id, ids: NEW_IDS }, type: QueryTypes.SELECT },
      )) as Array<{ subcategory_id: string; status: string }>;
    expect(await projectRows()).toEqual([]);

    await migration.up(sequelize.getQueryInterface());
    const added = await projectRows();
    expect(added.map((r) => r.subcategory_id).sort()).toEqual(NEW_IDS);
    expect(added.every((r) => r.status === "Not started")).toBe(true);

    // Running it again changes nothing.
    await migration.up(sequelize.getQueryInterface());
    expect(await projectRows()).toHaveLength(4);
    expect((await measureIds()).filter((id) => NEW_IDS.includes(id))).toHaveLength(4);
  });
});
