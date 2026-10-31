"use strict";

/**
 * Extension sync engine: shared run history and schedule tables, with the
 * Jira Assets data copied in.
 *
 * - `extension_sync_settings`: one row per organization and extension with a
 *   schedule (enabled, interval, failure streak).
 * - `extension_sync_runs`: one row per claimed run or recorded skip, for every
 *   extension on the engine. Replaces `jira_assets_sync_history`.
 *
 * Jira Assets' schedule and history are copied in, keeping history ids so
 * `previousRunId` stays comparable. Old naive-UTC timestamps become
 * TIMESTAMPTZ with `AT TIME ZONE 'UTC'`. Of the old `started` rows, only the
 * newest live one with a token per org stays `started`; the rest are closed as
 * `abandoned`, so the partial unique index (created after the copy) cannot
 * fail. The old table and the old `jira_assets_config.sync_*` and
 * `last_sync_*` columns stay in place, no longer written; a follow-up
 * migration drops them after one release. down() drops only the new tables.
 */

const ABANDONED_RUN_MESSAGE = "Sync stopped responding and was marked as abandoned";
const SKIPPED_RUN_MESSAGE = "Another sync or import was running, so this sync did not start.";
const STALE_AFTER_MINUTES = 15;

module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      const run = (sql, replacements) =>
        queryInterface.sequelize.query(sql, { transaction, replacements });

      await run(`
        CREATE TABLE IF NOT EXISTS verifywise.extension_sync_settings (
          id                   SERIAL PRIMARY KEY,
          organization_id      INTEGER NOT NULL REFERENCES verifywise.organizations(id) ON DELETE CASCADE,
          extension_key        VARCHAR(64) NOT NULL,
          enabled              BOOLEAN NOT NULL DEFAULT FALSE,
          interval_hours       INTEGER NOT NULL DEFAULT 24,
          consecutive_failures INTEGER NOT NULL DEFAULT 0,
          failing_since        TIMESTAMPTZ NULL,
          updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_by           INTEGER NULL REFERENCES verifywise.users(id) ON DELETE SET NULL,
          CONSTRAINT extension_sync_settings_org_key_unique UNIQUE (organization_id, extension_key),
          CONSTRAINT extension_sync_settings_interval_range_chk
            CHECK (interval_hours >= 1 AND interval_hours <= 168),
          CONSTRAINT extension_sync_settings_failures_nonneg_chk CHECK (consecutive_failures >= 0),
          CONSTRAINT extension_sync_settings_key_format_chk CHECK (extension_key ~ '^[a-z0-9-]+$')
        );
      `);

      await run(`
        CREATE TABLE IF NOT EXISTS verifywise.extension_sync_runs (
          id              SERIAL PRIMARY KEY,
          organization_id INTEGER NOT NULL REFERENCES verifywise.organizations(id) ON DELETE CASCADE,
          extension_key   VARCHAR(64) NOT NULL,
          kind            VARCHAR(32) NOT NULL,
          status          VARCHAR(16) NOT NULL,
          code            VARCHAR(64),
          counts          JSONB NOT NULL DEFAULT '{}'::jsonb,
          message         TEXT,
          run_token       VARCHAR(64),
          triggered_by    INTEGER REFERENCES verifywise.users(id) ON DELETE SET NULL,
          started_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
          heartbeat_at    TIMESTAMPTZ,
          completed_at    TIMESTAMPTZ,
          CONSTRAINT extension_sync_runs_status_chk
            CHECK (status IN ('started', 'completed', 'failed', 'abandoned', 'skipped')),
          CONSTRAINT extension_sync_runs_completed_at_consistency_chk
            CHECK ((status = 'started') = (completed_at IS NULL)),
          CONSTRAINT extension_sync_runs_started_has_token_chk
            CHECK (status <> 'started' OR run_token IS NOT NULL),
          CONSTRAINT extension_sync_runs_counts_is_object_chk CHECK (jsonb_typeof(counts) = 'object'),
          CONSTRAINT extension_sync_runs_key_format_chk CHECK (extension_key ~ '^[a-z0-9-]+$')
        );
        CREATE INDEX IF NOT EXISTS idx_extension_sync_runs_recent
          ON verifywise.extension_sync_runs (organization_id, extension_key, started_at DESC);
      `);

      await run(`
        INSERT INTO verifywise.extension_sync_settings
          (organization_id, extension_key, enabled, interval_hours, updated_at)
        SELECT organization_id, 'jira-assets', sync_enabled, sync_interval_hours, now()
          FROM verifywise.jira_assets_config
        ON CONFLICT (organization_id, extension_key) DO NOTHING;
      `);

      await run(
        `
        INSERT INTO verifywise.extension_sync_runs
          (id, organization_id, extension_key, kind, status, code, counts, message,
           run_token, triggered_by, started_at, heartbeat_at, completed_at)
        SELECT m.id, m.organization_id, 'jira-assets', m.sync_type, m.new_status,
               CASE WHEN m.new_status IN ('abandoned', 'skipped') THEN m.new_status END,
               jsonb_build_object('fetched', m.objects_fetched, 'created', m.objects_created,
                                  'updated', m.objects_updated, 'deleted', m.objects_deleted),
               CASE WHEN m.status = 'started' AND m.new_status = 'abandoned'
                    THEN :abandoned ELSE m.error_message END,
               m.run_token, m.triggered_by,
               m.started_at AT TIME ZONE 'UTC',
               m.heartbeat_at AT TIME ZONE 'UTC',
               CASE WHEN m.status = 'started' AND m.new_status = 'abandoned' THEN now()
                    ELSE m.completed_at AT TIME ZONE 'UTC' END
          FROM (
            SELECT h.*,
                   CASE
                     WHEN h.status = 'completed' THEN 'completed'
                     WHEN h.status = 'failed' AND h.error_message = :abandoned THEN 'abandoned'
                     WHEN h.status = 'failed' AND h.error_message = :skipped THEN 'skipped'
                     WHEN h.status = 'failed' THEN 'failed'
                     WHEN h.id = keep.id
                      AND (COALESCE(h.heartbeat_at, h.started_at) AT TIME ZONE 'UTC')
                            >= now() - make_interval(mins => ${STALE_AFTER_MINUTES})
                       THEN 'started'
                     ELSE 'abandoned'
                   END AS new_status
              FROM verifywise.jira_assets_sync_history h
              LEFT JOIN (
                SELECT DISTINCT ON (organization_id) organization_id, id
                  FROM verifywise.jira_assets_sync_history
                 WHERE status = 'started' AND run_token IS NOT NULL
                 ORDER BY organization_id, started_at DESC, id DESC
              ) keep ON keep.organization_id = h.organization_id
          ) m
         ORDER BY m.id;
        `,
        { abandoned: ABANDONED_RUN_MESSAGE, skipped: SKIPPED_RUN_MESSAGE },
      );

      await run(`
        SELECT setval(
          pg_get_serial_sequence('verifywise.extension_sync_runs', 'id'),
          COALESCE((SELECT MAX(id) FROM verifywise.extension_sync_runs), 1),
          (SELECT COUNT(*) > 0 FROM verifywise.extension_sync_runs)
        );
      `);

      await run(`
        CREATE UNIQUE INDEX IF NOT EXISTS uq_extension_sync_runs_one_started
          ON verifywise.extension_sync_runs (organization_id, extension_key)
          WHERE status = 'started';
      `);
    });
  },

  async down(queryInterface) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.sequelize.query(`DROP TABLE IF EXISTS verifywise.extension_sync_runs;`, {
        transaction,
      });
      await queryInterface.sequelize.query(
        `DROP TABLE IF EXISTS verifywise.extension_sync_settings;`,
        { transaction },
      );
    });
  },
};
