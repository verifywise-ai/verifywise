/**
 * 20261124120000-legacy-automation-first-action-entities: flags existing
 * automations of the entity triggers that used to run only the event's first
 * action, and leaves the triggers that always ran every action alone.
 */
import { QueryTypes } from "sequelize";
import { sequelize } from "../../database/db";
import { cleanupDatabase, createTestOrganization } from "./helpers";

const migration = require("../../database/migrations/20261124120000-legacy-automation-first-action-entities.js");
const queryInterface = { sequelize };

const FLAGGED = [
  "vendor_added",
  "model_updated",
  "project_deleted",
  "task_added",
  "training_updated",
  "incident_deleted",
];
const UNTOUCHED = [
  "scheduled_report",
  "vendor_review_date_approaching",
  "ai_detection_scan_failed",
];

const insertAutomation = async (orgId: number, triggerKey: string, legacy = false) => {
  const [row] = await sequelize.query<{ id: number }>(
    `INSERT INTO automations (organization_id, name, trigger_id, is_active, legacy_first_action_only)
     SELECT :orgId, :triggerKey, id, true, :legacy FROM automation_triggers WHERE key = :triggerKey
     RETURNING id`,
    { replacements: { orgId, triggerKey, legacy }, type: QueryTypes.SELECT },
  );
  return row.id;
};

const flags = async (ids: Record<string, number>) => {
  const rows = await sequelize.query<{ id: number; legacy_first_action_only: boolean }>(
    `SELECT id, legacy_first_action_only FROM automations WHERE id IN (:ids)`,
    { replacements: { ids: Object.values(ids) }, type: QueryTypes.SELECT },
  );
  const byId = new Map(rows.map((r) => [r.id, r.legacy_first_action_only]));
  return Object.fromEntries(Object.entries(ids).map(([key, id]) => [key, byId.get(id)]));
};

describe("legacy first-action flag for entity automations migration", () => {
  const ids: Record<string, number> = {};

  beforeAll(async () => {
    await cleanupDatabase();
    const orgId = await createTestOrganization("Legacy automations migration org");
    for (const key of [...FLAGGED, ...UNTOUCHED]) ids[key] = await insertAutomation(orgId, key);
    // Flagged by the risk and policy migration; this one must not clear it.
    ids.risk_added = await insertAutomation(orgId, "risk_added", true);
    ids.policy_updated = await insertAutomation(orgId, "policy_updated", false);
  });

  afterAll(async () => {
    await cleanupDatabase();
  });

  it("up flags every automation of the entity triggers, and only those", async () => {
    await migration.up(queryInterface);
    const after = await flags(ids);
    for (const key of FLAGGED) expect([key, after[key]]).toEqual([key, true]);
    for (const key of UNTOUCHED) expect([key, after[key]]).toEqual([key, false]);
    expect(after.risk_added).toBe(true);
    expect(after.policy_updated).toBe(false);
  });

  it("up again changes nothing", async () => {
    const before = await flags(ids);
    await migration.up(queryInterface);
    expect(await flags(ids)).toEqual(before);
  });

  it("down clears the flag on the entity triggers only", async () => {
    await migration.down(queryInterface);
    const after = await flags(ids);
    for (const key of [...FLAGGED, ...UNTOUCHED]) expect([key, after[key]]).toEqual([key, false]);
    expect(after.risk_added).toBe(true);
  });
});
