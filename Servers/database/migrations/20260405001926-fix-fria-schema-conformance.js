'use strict';

/**
 * Fix FRIA tables to conform to VerifyWise database schema conventions.
 *
 * Fixes:
 * 1. TIMESTAMP WITHOUT TIME ZONE -> WITH TIME ZONE (all 6 tables)
 * 2. Add missing created_at/updated_at columns (fria_rights, fria_model_links)
 * 3. Add missing updated_at column (fria_snapshots)
 * 4. Add soft delete columns (is_deleted, deleted_at) to all 6 tables
 * 5. Add FK constraint on fria_change_history.fria_id
 * 6. Add organization_id indexes on all tables
 */

module.exports = {
  async up(queryInterface) {
    const transaction = await queryInterface.sequelize.transaction();
    try {
      // ========================================
      // 1. Fix TIMESTAMP types: WITHOUT -> WITH TIME ZONE
      // ========================================

      // fria_assessments
      await queryInterface.sequelize.query(`
        ALTER TABLE verifywise.fria_assessments
          ALTER COLUMN created_at TYPE TIMESTAMP WITH TIME ZONE,
          ALTER COLUMN updated_at TYPE TIMESTAMP WITH TIME ZONE;
      `, { transaction });

      // fria_risk_items
      await queryInterface.sequelize.query(`
        ALTER TABLE verifywise.fria_risk_items
          ALTER COLUMN created_at TYPE TIMESTAMP WITH TIME ZONE,
          ALTER COLUMN updated_at TYPE TIMESTAMP WITH TIME ZONE;
      `, { transaction });

      // fria_snapshots
      await queryInterface.sequelize.query(`
        ALTER TABLE verifywise.fria_snapshots
          ALTER COLUMN created_at TYPE TIMESTAMP WITH TIME ZONE;
      `, { transaction });

      // fria_change_history
      await queryInterface.sequelize.query(`
        ALTER TABLE verifywise.fria_change_history
          ALTER COLUMN changed_at TYPE TIMESTAMP WITH TIME ZONE;
      `, { transaction });

      // ========================================
      // 2. Add missing created_at/updated_at columns
      // ========================================

      // fria_rights
      await queryInterface.sequelize.query(`
        ALTER TABLE verifywise.fria_rights
          ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
          ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT now();
      `, { transaction });

      // fria_model_links
      await queryInterface.sequelize.query(`
        ALTER TABLE verifywise.fria_model_links
          ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
          ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT now();
      `, { transaction });

      // fria_snapshots (missing updated_at)
      await queryInterface.sequelize.query(`
        ALTER TABLE verifywise.fria_snapshots
          ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT now();
      `, { transaction });

      // ========================================
      // 3. Add soft delete columns to all 6 tables
      // ========================================

      const tables = [
        'fria_assessments',
        'fria_rights',
        'fria_risk_items',
        'fria_model_links',
        'fria_snapshots',
        'fria_change_history',
      ];

      for (const table of tables) {
        await queryInterface.sequelize.query(`
          ALTER TABLE verifywise.${table}
            ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT FALSE,
            ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP WITH TIME ZONE;
        `, { transaction });
      }

      // ========================================
      // 5. Add FK constraint on fria_change_history.fria_id
      // ========================================

      await queryInterface.sequelize.query(`
        ALTER TABLE verifywise.fria_change_history
          ADD CONSTRAINT fria_change_history_fria_id_fkey
          FOREIGN KEY (fria_id) REFERENCES verifywise.fria_assessments(id) ON DELETE CASCADE;
      `, { transaction });

      // ========================================
      // 6. Add organization_id indexes
      // ========================================

      await queryInterface.sequelize.query(`
        CREATE INDEX IF NOT EXISTS idx_fria_rights_org ON verifywise.fria_rights(organization_id);
      `, { transaction });

      await queryInterface.sequelize.query(`
        CREATE INDEX IF NOT EXISTS idx_fria_risk_items_org ON verifywise.fria_risk_items(organization_id);
      `, { transaction });

      await queryInterface.sequelize.query(`
        CREATE INDEX IF NOT EXISTS idx_fria_model_links_org ON verifywise.fria_model_links(organization_id);
      `, { transaction });

      await queryInterface.sequelize.query(`
        CREATE INDEX IF NOT EXISTS idx_fria_snapshots_org ON verifywise.fria_snapshots(organization_id);
      `, { transaction });

      await queryInterface.sequelize.query(`
        CREATE INDEX IF NOT EXISTS idx_fria_change_history_org ON verifywise.fria_change_history(organization_id);
      `, { transaction });

      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  },

  async down(queryInterface) {
    const transaction = await queryInterface.sequelize.transaction();
    try {
      // Drop org indexes
      await queryInterface.sequelize.query(`DROP INDEX IF EXISTS verifywise.idx_fria_rights_org;`, { transaction });
      await queryInterface.sequelize.query(`DROP INDEX IF EXISTS verifywise.idx_fria_risk_items_org;`, { transaction });
      await queryInterface.sequelize.query(`DROP INDEX IF EXISTS verifywise.idx_fria_model_links_org;`, { transaction });
      await queryInterface.sequelize.query(`DROP INDEX IF EXISTS verifywise.idx_fria_snapshots_org;`, { transaction });
      await queryInterface.sequelize.query(`DROP INDEX IF EXISTS verifywise.idx_fria_change_history_org;`, { transaction });

      // Drop FK on fria_change_history.fria_id
      await queryInterface.sequelize.query(`
        ALTER TABLE verifywise.fria_change_history
          DROP CONSTRAINT IF EXISTS fria_change_history_fria_id_fkey;
      `, { transaction });

      // Remove soft delete columns
      const tables = [
        'fria_assessments', 'fria_rights', 'fria_risk_items',
        'fria_model_links', 'fria_snapshots', 'fria_change_history',
      ];
      for (const table of tables) {
        await queryInterface.sequelize.query(`
          ALTER TABLE verifywise.${table}
            DROP COLUMN IF EXISTS is_deleted,
            DROP COLUMN IF EXISTS deleted_at;
        `, { transaction });
      }

      // Drop added columns from fria_snapshots
      await queryInterface.sequelize.query(`
        ALTER TABLE verifywise.fria_snapshots
          DROP COLUMN IF EXISTS updated_at;
      `, { transaction });

      // Drop added columns from fria_model_links
      await queryInterface.sequelize.query(`
        ALTER TABLE verifywise.fria_model_links
          DROP COLUMN IF EXISTS created_at,
          DROP COLUMN IF EXISTS updated_at;
      `, { transaction });

      // Drop added columns from fria_rights
      await queryInterface.sequelize.query(`
        ALTER TABLE verifywise.fria_rights
          DROP COLUMN IF EXISTS created_at,
          DROP COLUMN IF EXISTS updated_at;
      `, { transaction });

      // Revert timestamp types back to WITHOUT TIME ZONE
      await queryInterface.sequelize.query(`
        ALTER TABLE verifywise.fria_assessments
          ALTER COLUMN created_at TYPE TIMESTAMP WITHOUT TIME ZONE,
          ALTER COLUMN updated_at TYPE TIMESTAMP WITHOUT TIME ZONE;
      `, { transaction });
      await queryInterface.sequelize.query(`
        ALTER TABLE verifywise.fria_risk_items
          ALTER COLUMN created_at TYPE TIMESTAMP WITHOUT TIME ZONE,
          ALTER COLUMN updated_at TYPE TIMESTAMP WITHOUT TIME ZONE;
      `, { transaction });
      await queryInterface.sequelize.query(`
        ALTER TABLE verifywise.fria_snapshots
          ALTER COLUMN created_at TYPE TIMESTAMP WITHOUT TIME ZONE;
      `, { transaction });
      await queryInterface.sequelize.query(`
        ALTER TABLE verifywise.fria_change_history
          ALTER COLUMN changed_at TYPE TIMESTAMP WITHOUT TIME ZONE;
      `, { transaction });

      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  },
};
