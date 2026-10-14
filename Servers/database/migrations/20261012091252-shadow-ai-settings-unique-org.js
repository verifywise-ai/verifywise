"use strict";

/**
 * One Shadow AI settings row per organization.
 *
 * Nothing created a shadow_ai_settings row for a new organization, so saving
 * settings (a plain UPDATE) silently changed nothing. Settings are now saved
 * with INSERT ... ON CONFLICT (organization_id), which needs a unique index.
 *
 * Which duplicate to keep: the app read settings with
 *   SELECT * FROM shadow_ai_settings WHERE organization_id = :id
 * and took rows[0]. With no ORDER BY and no index on organization_id that is
 * a sequential scan, which returns rows in physical (ctid) order, so the row
 * the app was actually using is the one with the lowest ctid. That row is
 * kept. (Synchronized scans can start mid-table, but only for tables larger
 * than a quarter of shared_buffers, far beyond a settings table.)
 *
 * The removed rows are copied into shadow_ai_settings_dedup_backup first, so
 * down() can put them back.
 */
const BACKUP = "verifywise.shadow_ai_settings_dedup_backup";

module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.sequelize.query(
        `CREATE TABLE IF NOT EXISTS ${BACKUP} (LIKE verifywise.shadow_ai_settings);`,
        { transaction },
      );
      const [rows] = await queryInterface.sequelize.query(
        `
        WITH ranked AS (
          SELECT ctid AS row_ctid,
                 ROW_NUMBER() OVER (PARTITION BY organization_id ORDER BY ctid) AS rn
          FROM verifywise.shadow_ai_settings
          WHERE organization_id IS NOT NULL
        ),
        removed AS (
          DELETE FROM verifywise.shadow_ai_settings s
          USING ranked
          WHERE s.ctid = ranked.row_ctid AND ranked.rn > 1
          RETURNING s.*
        ),
        backed_up AS (
          INSERT INTO ${BACKUP} SELECT * FROM removed RETURNING 1
        )
        SELECT COUNT(*)::int AS removed FROM backed_up;
        `,
        { transaction },
      );
      const removed = Number(rows?.[0]?.removed ?? 0);
      console.log(
        `[shadow-ai-settings] removed ${removed} duplicate settings row(s); copies kept in ${BACKUP}`,
      );
      await queryInterface.sequelize.query(
        `
        CREATE UNIQUE INDEX IF NOT EXISTS uq_shadow_ai_settings_organization_id
          ON verifywise.shadow_ai_settings (organization_id);
        `,
        { transaction },
      );
    });
  },

  async down(queryInterface) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.sequelize.query(
        "DROP INDEX IF EXISTS verifywise.uq_shadow_ai_settings_organization_id;",
        { transaction },
      );
      const [present] = await queryInterface.sequelize.query(
        `SELECT to_regclass('${BACKUP}') IS NOT NULL AS present;`,
        { transaction },
      );
      if (!present?.[0]?.present) return;
      // Put the removed duplicates back, then drop the backup.
      await queryInterface.sequelize.query(
        `INSERT INTO verifywise.shadow_ai_settings SELECT * FROM ${BACKUP};`,
        { transaction },
      );
      await queryInterface.sequelize.query(`DROP TABLE ${BACKUP};`, { transaction });
    });
  },
};
