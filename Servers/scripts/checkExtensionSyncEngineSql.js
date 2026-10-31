#!/usr/bin/env node
/* eslint-disable */
"use strict";

/**
 * Checks the sync engine's SQL on a throwaway Postgres: the due query
 * (enabled extension and schedule, no live run, skipped rows ignored, backoff,
 * an interval change while backed off, no overflow on a long failure streak),
 * the backoff formula against its JS mirror, and the ownership fragment.
 *
 * Run: cd Servers && node scripts/checkExtensionSyncEngineSql.js
 */
require("ts-node").register({ transpileOnly: true, compilerOptions: { module: "commonjs" } });
const assert = require("assert/strict");
const { QueryTypes } = require("sequelize");
const { withThrowawayPostgres } = require("./lib/throwawayPostgres");
const migration = require("../database/migrations/20261013105301-extension-sync-engine");
const {
  DUE_RUNS_SQL,
  backoffHours,
  sqlBackoffHours,
  sqlLastFinishedRun,
  sqlOwnsRunFragment,
} = require("../extensions/sync-engine/sql");

const KEY = "demo-ext";
const STATUS_KINDS = ["scheduled", "manual"];
const TOKEN = "00000000-0000-4000-8000-000000000001";

const BASE_SCHEMA = `
  CREATE TABLE verifywise.organizations (id SERIAL PRIMARY KEY, name TEXT);
  CREATE TABLE verifywise.users (id SERIAL PRIMARY KEY, email TEXT);
  CREATE TABLE verifywise.extensions (id SERIAL PRIMARY KEY, key VARCHAR(64) UNIQUE NOT NULL);
  CREATE TABLE verifywise.extension_enablements (
    id SERIAL PRIMARY KEY,
    organization_id INTEGER NOT NULL,
    extension_id INTEGER NOT NULL,
    enabled BOOLEAN NOT NULL DEFAULT FALSE,
    UNIQUE (organization_id, extension_id)
  );
  CREATE TABLE verifywise.jira_assets_config (
    id SERIAL PRIMARY KEY, organization_id INTEGER NOT NULL,
    sync_enabled BOOLEAN NOT NULL DEFAULT FALSE, sync_interval_hours INTEGER NOT NULL DEFAULT 24
  );
  CREATE TABLE verifywise.jira_assets_sync_history (
    id SERIAL PRIMARY KEY, organization_id INTEGER NOT NULL, sync_type VARCHAR(20) NOT NULL,
    status VARCHAR(20) NOT NULL, objects_fetched INTEGER NOT NULL DEFAULT 0,
    objects_created INTEGER NOT NULL DEFAULT 0, objects_updated INTEGER NOT NULL DEFAULT 0,
    objects_deleted INTEGER NOT NULL DEFAULT 0, error_message TEXT,
    started_at TIMESTAMP NOT NULL, completed_at TIMESTAMP, triggered_by INTEGER,
    heartbeat_at TIMESTAMP, run_token VARCHAR(64)
  );
`;

async function addRun(client, org, kind, status, minutesAgo, token, heartbeatMinutesAgo) {
  await client.query(
    `INSERT INTO verifywise.extension_sync_runs
       (organization_id, extension_key, kind, status, run_token, started_at, heartbeat_at, completed_at)
     VALUES ($1, $2, $3, $4, $5,
             now() - make_interval(mins => $6),
             ${heartbeatMinutesAgo === undefined ? "NULL" : `now() - make_interval(mins => ${heartbeatMinutesAgo})`},
             ${status === "started" ? "NULL" : "now() - make_interval(mins => $6) + interval '1 minute'"})`,
    [org, KEY, kind, status, token, minutesAgo],
  );
}

async function dueOrgs(sequelize) {
  const rows = await sequelize.query(DUE_RUNS_SQL, {
    replacements: { key: KEY, statusKinds: STATUS_KINDS },
    type: QueryTypes.SELECT,
  });
  return rows.map((row) => row.organization_id);
}

async function main() {
  await withThrowawayPostgres(async ({ client, sequelize }) => {
    await client.query(BASE_SCHEMA);
    await migration.up({ sequelize });
    await client.query(`
      INSERT INTO verifywise.organizations (id, name) SELECT g, 'org ' || g FROM generate_series(1, 10) g;
      INSERT INTO verifywise.extensions (id, key) VALUES (1, '${KEY}');
      INSERT INTO verifywise.extension_enablements (organization_id, extension_id, enabled)
      SELECT g, 1, g <> 6 FROM generate_series(1, 10) g;
      INSERT INTO verifywise.extension_sync_settings
        (organization_id, extension_key, enabled, interval_hours, consecutive_failures)
      VALUES (1, '${KEY}', TRUE, 1, 0),     -- never ran: due
             (2, '${KEY}', TRUE, 1, 0),     -- ran 2 h ago, 1 h interval: due
             (3, '${KEY}', TRUE, 1, 3),     -- 3 failures: 4 h backoff, ran 2 h ago: not due
             (4, '${KEY}', TRUE, 24, 2000), -- huge streak: capped at 24 h, no overflow: not due
             (5, '${KEY}', TRUE, 1, 0),     -- a live run: not due
             (6, '${KEY}', TRUE, 1, 0),     -- extension disabled: not due
             (7, '${KEY}', FALSE, 1, 0),    -- schedule off: not due
             (8, '${KEY}', TRUE, 1, 0),     -- claimed run 3 h ago, newer skip: due
             (9, '${KEY}', TRUE, 24, 2),    -- 24 h interval, ran 3 h ago: not due until changed
             (10, '${KEY}', TRUE, 24, 0);   -- migrated token-less run 30 min ago: not due
    `);
    await addRun(client, 2, "scheduled", "completed", 120, "t2");
    await addRun(client, 3, "scheduled", "failed", 120, "t3");
    await addRun(client, 4, "scheduled", "failed", 120, "t4");
    await addRun(client, 5, "manual", "completed", 120, "t5a");
    await addRun(client, 5, "scheduled", "started", 1, "t5b", 0);
    await addRun(client, 6, "scheduled", "completed", 120, "t6");
    await addRun(client, 8, "manual", "completed", 180, "t8");
    await addRun(client, 8, "manual", "skipped", 10, null);
    await addRun(client, 9, "scheduled", "failed", 180, "t9");
    // History copied from jira_assets_sync_history has no run_token; it still counts.
    await addRun(client, 10, "scheduled", "completed", 30, null);

    assert.deepEqual(await dueOrgs(sequelize), [1, 2, 8]);

    // An interval change while backed off applies on the next tick: GREATEST(1, 2 h) <= 3 h.
    await client.query(
      `UPDATE verifywise.extension_sync_settings SET interval_hours = 1 WHERE organization_id = 9`,
    );
    assert.deepEqual(await dueOrgs(sequelize), [1, 2, 8, 9]);

    for (const failures of [0, 1, 2, 3, 4, 5, 6, 7, 50, 2000]) {
      const [row] = await sequelize.query(
        `SELECT ${sqlBackoffHours("s")} AS hours
           FROM (SELECT CAST(:failures AS INTEGER) AS consecutive_failures) s`,
        { replacements: { failures }, type: QueryTypes.SELECT },
      );
      assert.equal(row.hours, backoffHours(failures), `backoff for ${failures} failures`);
    }

    // last_sync_* / last_finished_run: a newer abandoned or skipped run never
    // replaces an older completed or failed one; a newer failed one does.
    const lastFinished = async () => {
      const [row] = await sequelize.query(
        `SELECT * FROM (${sqlLastFinishedRun(":orgId", ":key", ":kinds", "r.id, r.status")}) x`,
        { replacements: { orgId: 7, key: KEY, kinds: STATUS_KINDS }, type: QueryTypes.SELECT },
      );
      return row;
    };
    const {
      rows: [done],
    } = await client.query(
      `INSERT INTO verifywise.extension_sync_runs
         (organization_id, extension_key, kind, status, run_token, started_at, completed_at)
       VALUES (7, '${KEY}', 'manual', 'completed', 't7a', now() - interval '60 minutes',
               now() - interval '59 minutes') RETURNING id`,
    );
    await client.query(
      `INSERT INTO verifywise.extension_sync_runs
         (organization_id, extension_key, kind, status, code, run_token, started_at, completed_at)
       VALUES (7, '${KEY}', 'scheduled', 'abandoned', 'abandoned', 't7b',
               now() - interval '30 minutes', now() - interval '10 minutes'),
              (7, '${KEY}', 'manual', 'skipped', 'skipped', NULL,
               now() - interval '5 minutes', now() - interval '5 minutes')`,
    );
    assert.deepEqual(await lastFinished(), { id: done.id, status: "completed" });
    const {
      rows: [failed],
    } = await client.query(
      `INSERT INTO verifywise.extension_sync_runs
         (organization_id, extension_key, kind, status, run_token, started_at, completed_at)
       VALUES (7, '${KEY}', 'scheduled', 'failed', 't7c', now() - interval '3 minutes',
               now() - interval '2 minutes') RETURNING id`,
    );
    assert.deepEqual(await lastFinished(), { id: failed.id, status: "failed" });
    const {
      rows: [started],
    } = await client.query(
      `INSERT INTO verifywise.extension_sync_runs
         (organization_id, extension_key, kind, status, run_token, heartbeat_at)
       VALUES (1, '${KEY}', 'manual', 'started', '${TOKEN}', now()) RETURNING id`,
    );
    const owns = async (run) => {
      const {
        rows: [row],
      } = await client.query(`SELECT ${sqlOwnsRunFragment(run)} AS owned`);
      return row.owned;
    };
    assert.equal(await owns({ runId: started.id, orgId: 1, token: TOKEN }), true);
    assert.equal(
      await owns({ runId: started.id, orgId: 1, token: "00000000-0000-4000-8000-000000000002" }),
      false,
    );
    assert.equal(await owns({ runId: started.id, orgId: 2, token: TOKEN }), false);
  });
  process.stdout.write("extension sync engine SQL: all checks passed\n");
}

main().catch((err) => {
  process.stderr.write(`${err.stack || err}\n`);
  process.exit(1);
});
