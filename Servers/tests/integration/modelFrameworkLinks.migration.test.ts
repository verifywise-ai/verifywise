/**
 * 20261117061642-model-framework-links-without-use-case: framework links lose
 * their arbitrary use case and are deduped; direct use case links stay.
 */
import { QueryTypes } from "sequelize";
import { sequelize } from "../../database/db";
import { cleanupDatabase, createTestOrganization, createTestUser } from "./helpers";
import {
  createTestModelInventory,
  createTestProject,
  createTestProjectFramework,
} from "../factories/test-entities.factory";

const migration = require("../../database/migrations/20261117061642-model-framework-links-without-use-case.js");
const queryInterface = { sequelize };

const linksOf = (modelId: number) =>
  sequelize.query<{ project_id: number | null; framework_id: number | null }>(
    `SELECT project_id, framework_id FROM model_inventories_projects_frameworks
      WHERE model_inventory_id = :modelId ORDER BY framework_id NULLS FIRST, project_id`,
    { replacements: { modelId }, type: QueryTypes.SELECT },
  );

const insertLink = (org: number, model: number, project: number | null, framework: number | null) =>
  sequelize.query(
    `INSERT INTO model_inventories_projects_frameworks
       (organization_id, model_inventory_id, project_id, framework_id)
     VALUES (:org, :model, :project, :framework)`,
    { replacements: { org, model, project, framework } },
  );

describe("model framework links migration", () => {
  let org: number;
  let p1: number;
  let p2: number;
  let model: number;

  beforeAll(async () => {
    await cleanupDatabase();
    org = await createTestOrganization("Migration org");
    const user = await createTestUser(org, 1, "mig-admin@test.local", "Passw0rd!");
    p1 = await createTestProject(org, user, {});
    p2 = await createTestProject(org, user, {});
    await createTestProjectFramework(org, p1, 1);
    await createTestProjectFramework(org, p2, 1);
    model = await createTestModelInventory(org, {});
    // Old shape: the migration already ran in global setup, so step back first.
    await migration.down(queryInterface);
    await insertLink(org, model, p1, null); // direct use case link
    await insertLink(org, model, p1, 1); // framework 1 under use case 1
    await insertLink(org, model, p2, 1); // the same framework under use case 2
    await insertLink(org, model, p2, 2);
  });

  afterAll(async () => {
    await cleanupDatabase();
  });

  it("up keeps one link per framework, without a use case, and keeps direct links", async () => {
    await migration.up(queryInterface);
    expect(await linksOf(model)).toEqual([
      { project_id: p1, framework_id: null },
      { project_id: null, framework_id: 1 },
      { project_id: null, framework_id: 2 },
    ]);
  });

  it("up makes a second link to the same framework fail", async () => {
    await expect(insertLink(org, model, null, 1)).rejects.toThrow();
  });

  it("down stores framework links against the first use case using the framework", async () => {
    await migration.down(queryInterface);
    expect(await linksOf(model)).toEqual([
      { project_id: p1, framework_id: null },
      { project_id: p1, framework_id: 1 },
      { project_id: null, framework_id: 2 }, // no use case of the org uses framework 2
    ]);
    await migration.up(queryInterface);
    expect(await linksOf(model)).toHaveLength(3);
  });
});
