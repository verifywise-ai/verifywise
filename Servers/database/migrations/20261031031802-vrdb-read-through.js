"use strict";

/**
 * Vendor research: the read-through sources of the vendor risk database (M2; the NVD, see
 * services/vendorResearch/vrdb/readThrough.ts).
 *
 * - A partial index on the ids of rejected records: the lookup leaves out a vulnerability whose CVE
 *   any list rejected, and asks for it by id on every query (utils/vrdb.utils.ts).
 * - `vrdb_lookups.fetched_at` may be NULL: a key whose first answer failed keeps the time of its
 *   next attempt, so that no run asks the source again before it, and has no answer to date.
 *
 * Down drops the index, removes the rows of keys that never had an answer, and makes the column
 * NOT NULL again.
 */
module.exports = {
  async up(queryInterface) {
    const transaction = await queryInterface.sequelize.transaction();
    try {
      for (const statement of [
        `CREATE INDEX IF NOT EXISTS vrdb_records_rejected_idx
           ON verifywise.vrdb_records (source_record_id) WHERE status = 'rejected';`,
        `ALTER TABLE verifywise.vrdb_lookups ALTER COLUMN fetched_at DROP NOT NULL;`,
      ]) {
        await queryInterface.sequelize.query(statement, { transaction });
      }
      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  },

  async down(queryInterface) {
    const transaction = await queryInterface.sequelize.transaction();
    try {
      for (const statement of [
        `DROP INDEX IF EXISTS verifywise.vrdb_records_rejected_idx;`,
        `DELETE FROM verifywise.vrdb_lookups WHERE fetched_at IS NULL;`,
        `ALTER TABLE verifywise.vrdb_lookups ALTER COLUMN fetched_at SET NOT NULL;`,
      ]) {
        await queryInterface.sequelize.query(statement, { transaction });
      }
      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  },
};
