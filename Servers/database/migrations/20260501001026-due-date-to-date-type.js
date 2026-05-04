"use strict";

/**
 * Convert due_date columns from TIMESTAMP WITH TIME ZONE to DATE.
 *
 * Background: storing date-only fields as `TIMESTAMP WITH TIME ZONE` causes
 * day drift on every round-trip because JS `new Date('YYYY-MM-DD')` parses as
 * UTC midnight while Postgres stores in the session timezone. Most other
 * tables already use plain `DATE` for these fields — this brings the three
 * outliers in line with the rest of the schema.
 *
 * Affected columns: controls_eu.due_date, subcontrols_eu.due_date,
 * tasks.due_date.
 *
 * Existing rows have their value truncated to the date in the session
 * timezone — same calendar date the user has been seeing in the UI.
 *
 * Snapshot tables preserve the pre-migration timestamp for rollback. They
 * are intentionally left in place after `up`; storage cost is negligible.
 */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      const run = (sql) => queryInterface.sequelize.query(sql, { transaction });

      const tables = [
        { table: "controls_eu", snapshot: "controls_eu__due_date_snapshot" },
        { table: "subcontrols_eu", snapshot: "subcontrols_eu__due_date_snapshot" },
        { table: "tasks", snapshot: "tasks__due_date_snapshot" },
      ];

      for (const { table, snapshot } of tables) {
        await run(`
          CREATE TABLE IF NOT EXISTS verifywise.${snapshot} (
            id INTEGER PRIMARY KEY,
            due_date TIMESTAMP WITH TIME ZONE,
            snapshot_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
          );
        `);
        await run(`TRUNCATE verifywise.${snapshot};`);
        await run(`
          INSERT INTO verifywise.${snapshot} (id, due_date)
          SELECT id, due_date FROM verifywise.${table};
        `);
        await run(`
          ALTER TABLE verifywise.${table}
          ALTER COLUMN due_date TYPE DATE USING due_date::date;
        `);
      }
    });
  },

  async down(queryInterface) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      const run = (sql) => queryInterface.sequelize.query(sql, { transaction });

      const tables = [
        { table: "controls_eu", snapshot: "controls_eu__due_date_snapshot" },
        { table: "subcontrols_eu", snapshot: "subcontrols_eu__due_date_snapshot" },
        { table: "tasks", snapshot: "tasks__due_date_snapshot" },
      ];

      for (const { table, snapshot } of tables) {
        await run(`
          ALTER TABLE verifywise.${table}
          ALTER COLUMN due_date TYPE TIMESTAMP WITH TIME ZONE
          USING due_date::timestamp with time zone;
        `);
        await run(`
          UPDATE verifywise.${table} t
          SET due_date = snap.due_date
          FROM verifywise.${snapshot} snap
          WHERE t.id = snap.id;
        `);
        await run(`DROP TABLE IF EXISTS verifywise.${snapshot};`);
      }
    });
  },
};
