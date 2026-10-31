#!/usr/bin/env node
/* eslint-disable */
"use strict";

/**
 * Checks 20261013105301-extension-sync-engine.js on a throwaway Postgres: the
 * Jira Assets history status mapping (several `started` rows per org and
 * null-token rows included), kept ids and the sequence, the settings copy,
 * the partial unique index, down(), and up() again.
 *
 * Run: cd Servers && node scripts/checkExtensionSyncMigration.js
 */
const assert = require("assert/strict");
const { withThrowawayPostgres } = require("./lib/throwawayPostgres");
const migration = require("../database/migrations/20261013105301-extension-sync-engine");

const ABANDONED = "Sync stopped responding and was marked as abandoned";
const SKIPPED = "Another sync or import was running, so this sync did not start.";

// The pre-engine tables, reduced to the columns the migration reads.
const BASE_SCHEMA = `
  CREATE TABLE verifywise.organizations (id SERIAL PRIMARY KEY, name TEXT);
  CREATE TABLE verifywise.users (id SERIAL PRIMARY KEY, email TEXT);
  CREATE TABLE verifywise.jira_assets_config (
    id SERIAL PRIMARY KEY,
    organization_id INTEGER NOT NULL REFERENCES verifywise.organizations(id) ON DELETE CASCADE,
    sync_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    sync_interval_hours INTEGER NOT NULL DEFAULT 24
  );
  CREATE TABLE verifywise.jira_assets_sync_history (
    id SERIAL PRIMARY KEY,
    organization_id INTEGER NOT NULL REFERENCES verifywise.organizations(id) ON DELETE CASCADE,
    sync_type VARCHAR(20) NOT NULL,
    status VARCHAR(20) NOT NULL,
    objects_fetched INTEGER NOT NULL DEFAULT 0,
    objects_created INTEGER NOT NULL DEFAULT 0,
    objects_updated INTEGER NOT NULL DEFAULT 0,
    objects_deleted INTEGER NOT NULL DEFAULT 0,
    error_message TEXT,
    started_at TIMESTAMP NOT NULL,
    completed_at TIMESTAMP,
    triggered_by INTEGER REFERENCES verifywise.users(id) ON DELETE SET NULL,
    heartbeat_at TIMESTAMP,
    run_token VARCHAR(64)
  );
`;

// Naive UTC wall-clock, as the old code wrote it.
const ago = (minutes) => `(NOW() AT TIME ZONE 'UTC') - interval '${minutes} minutes'`;

// id, org, sync_type, status, [fetched, created, updated, deleted], error_message,
// started (minutes ago), completed (minutes ago or null), heartbeat (minutes ago or null), token
const HISTORY = [
  [10, 1, "manual", "completed", [5, 2, 1, 0], "note", 120, 118, 119, "t10"],
  [11, 1, "scheduled", "failed", [0, 0, 0, 0], ABANDONED, 100, 80, 99, "t11"],
  [12, 1, "manual", "failed", [0, 0, 0, 0], SKIPPED, 90, 90, null, null],
  [13, 1, "scheduled", "failed", [0, 0, 0, 0], "Jira returned 500", 70, 69, 69, "t13"],
  // Two `started` rows in org 1: only the newest live one with a token stays started.
  [14, 1, "import", "started", [0, 0, 0, 0], null, 6, null, 1, "t14"],
  [15, 1, "manual", "started", [0, 0, 0, 0], null, 5, null, 0, "t15"],
  // Org 2: the newest row with a token is stale; the newest row overall has no token.
  [20, 2, "scheduled", "started", [0, 0, 0, 0], null, 40, null, 30, "t20"],
  [21, 2, "manual", "started", [0, 0, 0, 0], null, 2, null, 1, null],
];

async function seed(client) {
  await client.query(`
    INSERT INTO verifywise.organizations (id, name) VALUES (1, 'a'), (2, 'b'), (3, 'c');
    INSERT INTO verifywise.users (id, email) VALUES (8, 'u@example.com');
    INSERT INTO verifywise.jira_assets_config (organization_id, sync_enabled, sync_interval_hours)
    VALUES (1, TRUE, 24), (2, FALSE, 1), (3, TRUE, 6);
  `);
  for (const [
    id,
    org,
    type,
    status,
    counts,
    message,
    started,
    completed,
    heartbeat,
    token,
  ] of HISTORY) {
    await client.query(
      `INSERT INTO verifywise.jira_assets_sync_history
         (id, organization_id, sync_type, status, objects_fetched, objects_created,
          objects_updated, objects_deleted, error_message, started_at, completed_at,
          heartbeat_at, triggered_by, run_token)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, ${ago(started)},
               ${completed === null ? "NULL" : ago(completed)},
               ${heartbeat === null ? "NULL" : ago(heartbeat)}, 8, $10)`,
      [id, org, type, status, ...counts, message, token],
    );
  }
  await client.query(
    `SELECT setval(pg_get_serial_sequence('verifywise.jira_assets_sync_history', 'id'), 21)`,
  );
}

async function assertCopied(client) {
  const { rows } = await client.query(
    `SELECT id, kind, status, code, counts, message, run_token, triggered_by,
            completed_at IS NOT NULL AS closed
       FROM verifywise.extension_sync_runs ORDER BY id`,
  );
  assert.deepEqual(
    rows.map((r) => r.id),
    [10, 11, 12, 13, 14, 15, 20, 21],
  );
  const byId = Object.fromEntries(rows.map((r) => [r.id, r]));
  assert.deepEqual(byId[10], {
    id: 10,
    kind: "manual",
    status: "completed",
    code: null,
    counts: { fetched: 5, created: 2, updated: 1, deleted: 0 },
    message: "note",
    run_token: "t10",
    triggered_by: 8,
    closed: true,
  });
  assert.equal(byId[11].status, "abandoned");
  assert.equal(byId[11].code, "abandoned");
  assert.equal(byId[11].message, ABANDONED);
  assert.equal(byId[12].status, "skipped");
  assert.equal(byId[12].code, "skipped");
  assert.equal(byId[12].run_token, null);
  assert.equal(byId[13].status, "failed");
  assert.equal(byId[13].code, null);
  assert.equal(byId[13].message, "Jira returned 500");
  for (const id of [14, 20, 21]) {
    assert.equal(byId[id].status, "abandoned", `row ${id}`);
    assert.equal(byId[id].code, "abandoned", `row ${id}`);
    assert.equal(byId[id].message, ABANDONED, `row ${id}`);
    assert.equal(byId[id].closed, true, `row ${id}`);
  }
  assert.equal(byId[15].status, "started");
  assert.equal(byId[15].closed, false);
  assert.equal(byId[15].run_token, "t15");

  const {
    rows: [time],
  } = await client.query(
    `SELECT r.started_at = (h.started_at AT TIME ZONE 'UTC') AS same
       FROM verifywise.extension_sync_runs r
       JOIN verifywise.jira_assets_sync_history h ON h.id = r.id
      WHERE r.id = 10`,
  );
  assert.equal(time.same, true);

  const { rows: settings } = await client.query(
    `SELECT organization_id, extension_key, enabled, interval_hours, consecutive_failures,
            failing_since
       FROM verifywise.extension_sync_settings ORDER BY organization_id`,
  );
  assert.deepEqual(settings, [
    {
      organization_id: 1,
      extension_key: "jira-assets",
      enabled: true,
      interval_hours: 24,
      consecutive_failures: 0,
      failing_since: null,
    },
    {
      organization_id: 2,
      extension_key: "jira-assets",
      enabled: false,
      interval_hours: 1,
      consecutive_failures: 0,
      failing_since: null,
    },
    {
      organization_id: 3,
      extension_key: "jira-assets",
      enabled: true,
      interval_hours: 6,
      consecutive_failures: 0,
      failing_since: null,
    },
  ]);

  const {
    rows: [index],
  } = await client.query(
    `SELECT indexdef FROM pg_indexes
      WHERE schemaname = 'verifywise' AND indexname = 'uq_extension_sync_runs_one_started'`,
  );
  assert.match(index.indexdef, /UNIQUE INDEX .* WHERE \(\(status\)::text = 'started'::text\)/);

  const {
    rows: [next],
  } = await client.query(
    `INSERT INTO verifywise.extension_sync_runs
       (organization_id, extension_key, kind, status, completed_at)
     VALUES (3, 'jira-assets', 'manual', 'skipped', now()) RETURNING id`,
  );
  assert.equal(next.id, 22);

  await assert.rejects(
    client.query(
      `INSERT INTO verifywise.extension_sync_runs
         (organization_id, extension_key, kind, status, run_token)
       VALUES (1, 'jira-assets', 'manual', 'started', 'second')`,
    ),
    (err) => err.code === "23505",
  );
}

async function main() {
  await withThrowawayPostgres(async ({ client, sequelize }) => {
    await client.query(BASE_SCHEMA);
    await seed(client);
    const queryInterface = { sequelize };

    await migration.up(queryInterface);
    await assertCopied(client);

    await migration.down(queryInterface);
    const {
      rows: [gone],
    } = await client.query(
      `SELECT to_regclass('verifywise.extension_sync_runs') AS runs,
              to_regclass('verifywise.extension_sync_settings') AS settings,
              (SELECT COUNT(*)::int FROM verifywise.jira_assets_sync_history) AS old_rows`,
    );
    assert.deepEqual(gone, { runs: null, settings: null, old_rows: 8 });

    await migration.up(queryInterface);
    await assertCopied(client);
  });
  process.stdout.write("extension sync migration: all checks passed\n");
}

main().catch((err) => {
  process.stderr.write(`${err.stack || err}\n`);
  process.exit(1);
});
