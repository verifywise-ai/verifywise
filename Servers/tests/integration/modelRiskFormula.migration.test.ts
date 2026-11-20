/**
 * 20261120094040-model-risk-likelihood-severity-lists: adds severity,
 * normalizes likelihood to the list labels, and moves any other likelihood
 * text into the description before clearing it.
 */
import { QueryTypes } from "sequelize";
import { sequelize } from "../../database/db";
import { cleanupDatabase, createTestOrganization } from "./helpers";

const migration = require("../../database/migrations/20261120094040-model-risk-likelihood-severity-lists.js");
const queryInterface = { sequelize };

const insertRisk = async (org: number, likelihood: string | null, description: string | null) => {
  const [rows] = await sequelize.query(
    `INSERT INTO model_risks (organization_id, risk_name, risk_level, likelihood, description, created_at, updated_at)
     VALUES (:org, 'Risk', 'High', :likelihood, :description, NOW(), NOW()) RETURNING id`,
    { replacements: { org, likelihood, description } },
  );
  return (rows as { id: number }[])[0].id;
};

const readRisk = async (id: number) =>
  (
    await sequelize.query<{
      likelihood: string | null;
      description: string | null;
      risk_level: string;
    }>(`SELECT likelihood, description, risk_level FROM model_risks WHERE id = :id`, {
      replacements: { id },
      type: QueryTypes.SELECT,
    })
  )[0];

const hasSeverity = async () =>
  (
    await sequelize.query(
      `SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'verifywise' AND table_name = 'model_risks' AND column_name = 'severity'`,
      { type: QueryTypes.SELECT },
    )
  ).length === 1;

describe("model risk likelihood and severity lists migration", () => {
  const ids: Record<string, number> = {};

  beforeAll(async () => {
    await cleanupDatabase();
    const org = await createTestOrganization("Lists migration org");
    // Old shape: the migration already ran in global setup, so step back first.
    await migration.down(queryInterface);
    ids.label = await insertRisk(org, "  almost certain ", "Seen twice");
    ids.oddWithText = await insertRisk(org, "High chance", "Drifts in winter");
    ids.oddNoText = await insertRisk(org, "Confirmed", "");
    ids.blank = await insertRisk(org, "", "Kept");
    ids.none = await insertRisk(org, null, null);
  });

  afterAll(async () => {
    await cleanupDatabase();
  });

  it("up adds severity, spells labels canonically and keeps odd text in the description", async () => {
    await migration.up(queryInterface);
    expect(await hasSeverity()).toBe(true);
    expect(await readRisk(ids.label)).toEqual({
      likelihood: "Almost Certain",
      description: "Seen twice",
      risk_level: "High",
    });
    expect(await readRisk(ids.oddWithText)).toEqual({
      likelihood: null,
      description: "Drifts in winter\n\nPrevious likelihood: High chance",
      risk_level: "High",
    });
    expect(await readRisk(ids.oddNoText)).toEqual({
      likelihood: null,
      description: "Previous likelihood: Confirmed",
      risk_level: "High",
    });
    expect(await readRisk(ids.blank)).toEqual({
      likelihood: null,
      description: "Kept",
      risk_level: "High",
    });
    expect(await readRisk(ids.none)).toEqual({
      likelihood: null,
      description: null,
      risk_level: "High",
    });
  });

  it("down drops severity and moves the old likelihood text back", async () => {
    await migration.down(queryInterface);
    expect(await hasSeverity()).toBe(false);
    expect(await readRisk(ids.oddWithText)).toMatchObject({
      likelihood: "High chance",
      description: "Drifts in winter",
    });
    expect(await readRisk(ids.oddNoText)).toMatchObject({
      likelihood: "Confirmed",
      description: "",
    });
    expect((await readRisk(ids.label)).likelihood).toBe("Almost Certain");

    await migration.up(queryInterface);
    expect(await hasSeverity()).toBe(true);
  });
});
