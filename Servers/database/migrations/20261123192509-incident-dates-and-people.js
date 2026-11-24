"use strict";

/**
 * Incident dates become plain dates, and reporter / approver become users.
 *
 * 1. occurred_date, date_detected and approval_date were TIMESTAMP (without
 *    time zone) in 20260226234302-tenant-tables.js. The API sent them out as
 *    toISOString() of the value pg parsed in the server's local time, and the
 *    page formatted that UTC midnight in the browser's time zone, so west of
 *    UTC every incident showed the day before. They are days, not moments:
 *    they become DATE and the API sends "YYYY-MM-DD".
 *
 *    USING col::date keeps the calendar date of the stored wall-clock value.
 *    That is the date the user picked on every historical write path:
 *    - the incident drawer has always sent "YYYY-MM-DD" (stored as that day
 *      at 00:00);
 *    - the server-side writers (Advisor create, Jira import, approval stamp,
 *      demo driver) passed a JS Date, which Sequelize sends as UTC (the
 *      connection runs with SET TIME ZONE '+00:00', no override in
 *      database/config), and a TIMESTAMP column ignores the offset, so the
 *      stored value is the UTC wall-clock time and ::date its UTC date, the
 *      date those rows always had on a UTC server;
 *    - the seeds insert "YYYY-MM-DD" strings.
 *    AT TIME ZONE conversions would move UTC-midnight rows to the previous
 *    day west of UTC, which is the bug being fixed, so the plain cast is used.
 *    An install whose column is TIMESTAMPTZ (none is created that way by the
 *    current migrations; checked so the cast cannot depend on the session
 *    time zone) uses (col AT TIME ZONE 'UTC')::date, the same UTC date.
 *    A column that is already DATE is left alone (re-run safe).
 *
 * 2. reporter_id and approved_by_id are nullable foreign keys to users,
 *    ON DELETE SET NULL like assignee_id (20260910060000): incidents are
 *    compliance records and deleting a user must not delete them. The text
 *    columns reporter and approved_by stay: Jira imports, the Advisor and
 *    rows written before this migration have only the name, and the server
 *    keeps writing the user's full name there when an id is given, so old
 *    readers and exports stay correct. No backfill: older rows store a first
 *    name only, which cannot be matched to one user reliably.
 *
 * down() converts the dates back to TIMESTAMP (midnight of the day) and drops
 * the two columns and their indexes.
 */

const DATE_COLUMNS = ["occurred_date", "date_detected", "approval_date"];

const columnType = async (queryInterface, column, transaction) => {
  const [rows] = await queryInterface.sequelize.query(
    `SELECT data_type FROM information_schema.columns
      WHERE table_schema = 'verifywise'
        AND table_name = 'ai_incident_managements'
        AND column_name = :column`,
    { replacements: { column }, transaction },
  );
  return rows[0]?.data_type ?? null;
};

module.exports = {
  async up(queryInterface) {
    const transaction = await queryInterface.sequelize.transaction();
    try {
      for (const column of DATE_COLUMNS) {
        const type = await columnType(queryInterface, column, transaction);
        if (!type || type === "date") continue;
        const using =
          type === "timestamp with time zone"
            ? `(${column} AT TIME ZONE 'UTC')::date`
            : `${column}::date`;
        await queryInterface.sequelize.query(
          `ALTER TABLE verifywise.ai_incident_managements
             ALTER COLUMN ${column} TYPE DATE USING ${using};`,
          { transaction },
        );
      }

      await queryInterface.sequelize.query(
        `ALTER TABLE verifywise.ai_incident_managements
           ADD COLUMN IF NOT EXISTS reporter_id INTEGER
             REFERENCES verifywise.users(id) ON DELETE SET NULL,
           ADD COLUMN IF NOT EXISTS approved_by_id INTEGER
             REFERENCES verifywise.users(id) ON DELETE SET NULL;`,
        { transaction },
      );
      await queryInterface.sequelize.query(
        `CREATE INDEX IF NOT EXISTS idx_ai_incidents_reporter
           ON verifywise.ai_incident_managements (organization_id, reporter_id);`,
        { transaction },
      );
      await queryInterface.sequelize.query(
        `CREATE INDEX IF NOT EXISTS idx_ai_incidents_approved_by
           ON verifywise.ai_incident_managements (organization_id, approved_by_id);`,
        { transaction },
      );
      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  },

  async down(queryInterface) {
    const transaction = await queryInterface.sequelize.transaction();
    try {
      await queryInterface.sequelize.query(
        `DROP INDEX IF EXISTS verifywise.idx_ai_incidents_approved_by;`,
        { transaction },
      );
      await queryInterface.sequelize.query(
        `DROP INDEX IF EXISTS verifywise.idx_ai_incidents_reporter;`,
        { transaction },
      );
      await queryInterface.sequelize.query(
        `ALTER TABLE verifywise.ai_incident_managements
           DROP COLUMN IF EXISTS approved_by_id,
           DROP COLUMN IF EXISTS reporter_id;`,
        { transaction },
      );
      for (const column of DATE_COLUMNS) {
        const type = await columnType(queryInterface, column, transaction);
        if (type !== "date") continue;
        await queryInterface.sequelize.query(
          `ALTER TABLE verifywise.ai_incident_managements
             ALTER COLUMN ${column} TYPE TIMESTAMP USING ${column}::timestamp;`,
          { transaction },
        );
      }
      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  },
};
