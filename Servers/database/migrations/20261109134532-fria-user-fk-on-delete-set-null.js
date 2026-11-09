"use strict";

/**
 * FRIA user references follow the rest of the schema: ON DELETE SET NULL.
 *
 * fria_assessments.created_by/updated_by and fria_snapshots.created_by were
 * created without an ON DELETE rule (created_by also NOT NULL), so deleting a
 * user who created or edited a FRIA failed with
 * fria_assessments_created_by_fkey. That blocked deleting the user's
 * organization too, since the user is removed before the organization row.
 * Reads already LEFT JOIN users and show "—" for a missing name.
 *
 * down() restores NOT NULL, so it fails if any creator has since been deleted.
 */
module.exports = {
  async up(queryInterface) {
    const transaction = await queryInterface.sequelize.transaction();
    try {
      await queryInterface.sequelize.query(
        `ALTER TABLE verifywise.fria_assessments
           ALTER COLUMN created_by DROP NOT NULL,
           DROP CONSTRAINT IF EXISTS fria_assessments_created_by_fkey,
           ADD CONSTRAINT fria_assessments_created_by_fkey
             FOREIGN KEY (created_by) REFERENCES verifywise.users(id) ON DELETE SET NULL,
           DROP CONSTRAINT IF EXISTS fria_assessments_updated_by_fkey,
           ADD CONSTRAINT fria_assessments_updated_by_fkey
             FOREIGN KEY (updated_by) REFERENCES verifywise.users(id) ON DELETE SET NULL;
         ALTER TABLE verifywise.fria_snapshots
           ALTER COLUMN created_by DROP NOT NULL,
           DROP CONSTRAINT IF EXISTS fria_snapshots_created_by_fkey,
           ADD CONSTRAINT fria_snapshots_created_by_fkey
             FOREIGN KEY (created_by) REFERENCES verifywise.users(id) ON DELETE SET NULL;`,
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
        `ALTER TABLE verifywise.fria_assessments
           ALTER COLUMN created_by SET NOT NULL,
           DROP CONSTRAINT IF EXISTS fria_assessments_created_by_fkey,
           ADD CONSTRAINT fria_assessments_created_by_fkey
             FOREIGN KEY (created_by) REFERENCES verifywise.users(id),
           DROP CONSTRAINT IF EXISTS fria_assessments_updated_by_fkey,
           ADD CONSTRAINT fria_assessments_updated_by_fkey
             FOREIGN KEY (updated_by) REFERENCES verifywise.users(id);
         ALTER TABLE verifywise.fria_snapshots
           ALTER COLUMN created_by SET NOT NULL,
           DROP CONSTRAINT IF EXISTS fria_snapshots_created_by_fkey,
           ADD CONSTRAINT fria_snapshots_created_by_fkey
             FOREIGN KEY (created_by) REFERENCES verifywise.users(id);`,
        { transaction },
      );
      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  },
};
