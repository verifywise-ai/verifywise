"use strict";

/**
 * Store on each Shadow AI event whether it matched an AI tool at ingestion.
 *
 * Insights count an event as AI usage only when it matched a tool. Reading
 * that from detected_tool_id is not enough: the foreign key is ON DELETE SET
 * NULL, so deleting a tool would erase its users from every past count. The
 * flag is written once at ingestion and survives the tool's deletion.
 *
 * The database sets the flag: a BEFORE INSERT OR UPDATE trigger turns it on
 * whenever detected_tool_id is set, and never turns it off. So every writer
 * (ingestion, demo data, the legacy shared-schema copy, pods from before
 * this release during a rolling deploy) gets it right without app code, and
 * the FK's ON DELETE SET NULL keeps it true.
 *
 * shadow_ai_events can be large (one row per proxy request), so:
 * - ADD COLUMN with a constant default is a metadata-only change (no table
 *   rewrite) on PostgreSQL 11+.
 * - The trigger is created before the backfill, so rows written meanwhile
 *   are already right.
 * - The backfill sets is_ai_tool = (detected_tool_id IS NOT NULL) by updating
 *   only matched rows (the rest keep the default false). It walks actual ids
 *   in keyset batches, each its own statement, so no single long transaction
 *   holds row locks and sparse ids cost nothing. A re-run skips rows already
 *   flagged.
 *
 * Rows whose tool was deleted before this migration already have a NULL
 * detected_tool_id, so they backfill as false; that history is not
 * recoverable from the table.
 */
const BATCH_SIZE = 10000;

module.exports = {
  async up(queryInterface) {
    const run = (sql, options) => queryInterface.sequelize.query(sql, options);

    await run(`
      ALTER TABLE verifywise.shadow_ai_events
        ADD COLUMN IF NOT EXISTS is_ai_tool BOOLEAN NOT NULL DEFAULT false;
    `);

    await run(`
      CREATE OR REPLACE FUNCTION verifywise.shadow_ai_events_set_is_ai_tool()
      RETURNS trigger LANGUAGE plpgsql AS $func$
      BEGIN
        NEW.is_ai_tool := COALESCE(NEW.is_ai_tool, false) OR NEW.detected_tool_id IS NOT NULL;
        RETURN NEW;
      END;
      $func$;
    `);
    await run(
      `DROP TRIGGER IF EXISTS trg_shadow_ai_events_is_ai_tool ON verifywise.shadow_ai_events;`,
    );
    await run(`
      CREATE TRIGGER trg_shadow_ai_events_is_ai_tool
        BEFORE INSERT OR UPDATE ON verifywise.shadow_ai_events
        FOR EACH ROW EXECUTE FUNCTION verifywise.shadow_ai_events_set_is_ai_tool();
    `);

    let lastId = 0;
    for (;;) {
      const [rows] = await run(
        `WITH batch AS (
           SELECT id FROM verifywise.shadow_ai_events
            WHERE id > :lastId AND detected_tool_id IS NOT NULL AND NOT is_ai_tool
            ORDER BY id
            LIMIT :batchSize
         )
         UPDATE verifywise.shadow_ai_events e
            SET is_ai_tool = true
           FROM batch
          WHERE e.id = batch.id
         RETURNING e.id`,
        { replacements: { lastId, batchSize: BATCH_SIZE } },
      );
      if (rows.length === 0) break;
      lastId = Math.max(...rows.map((r) => Number(r.id)));
      if (rows.length < BATCH_SIZE) break;
    }
  },

  async down(queryInterface) {
    const run = (sql) => queryInterface.sequelize.query(sql);
    await run(
      `DROP TRIGGER IF EXISTS trg_shadow_ai_events_is_ai_tool ON verifywise.shadow_ai_events;`,
    );
    await run(`DROP FUNCTION IF EXISTS verifywise.shadow_ai_events_set_is_ai_tool();`);
    await run(`ALTER TABLE verifywise.shadow_ai_events DROP COLUMN IF EXISTS is_ai_tool;`);
  },
};
