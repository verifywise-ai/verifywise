"use strict";

/**
 * Store on each Shadow AI event whether it matched an AI tool at ingestion.
 *
 * Insights count an event as AI usage only when it matched a tool. Reading
 * that from detected_tool_id is not enough: the foreign key is ON DELETE SET
 * NULL, so deleting a tool would erase its users from every past count. The
 * flag is written once at ingestion and survives the tool's deletion.
 *
 * shadow_ai_events can be large (one row per proxy request), so:
 * - ADD COLUMN with a constant default is a metadata-only change (no table
 *   rewrite) on PostgreSQL 11+.
 * - The backfill sets is_ai_tool = (detected_tool_id IS NOT NULL) by updating
 *   only matched rows (the rest keep the default false). It walks id ranges,
 *   each its own statement, so no single long transaction holds row locks.
 *   It is idempotent: a re-run skips rows already flagged.
 *
 * Rows whose tool was deleted before this migration already have a NULL
 * detected_tool_id, so they backfill as false; that history is not
 * recoverable from the table.
 */
const BATCH_SIZE = 10000;

module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      ALTER TABLE verifywise.shadow_ai_events
        ADD COLUMN IF NOT EXISTS is_ai_tool BOOLEAN NOT NULL DEFAULT false;
    `);

    // Walk the primary key in fixed ranges (keyset), so each batch reads only
    // its own slice instead of rescanning rows earlier batches already handled.
    const [[bounds]] = await queryInterface.sequelize.query(
      `SELECT COALESCE(MIN(id), 0) AS min_id, COALESCE(MAX(id), -1) AS max_id
         FROM verifywise.shadow_ai_events`,
    );
    const maxId = Number(bounds.max_id);
    for (let from = Number(bounds.min_id); from <= maxId; from += BATCH_SIZE) {
      await queryInterface.sequelize.query(
        `UPDATE verifywise.shadow_ai_events
            SET is_ai_tool = true
          WHERE id >= :from AND id < :to
            AND detected_tool_id IS NOT NULL
            AND is_ai_tool = false`,
        { replacements: { from, to: from + BATCH_SIZE } },
      );
    }
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(`
      ALTER TABLE verifywise.shadow_ai_events DROP COLUMN IF EXISTS is_ai_tool;
    `);
  },
};
