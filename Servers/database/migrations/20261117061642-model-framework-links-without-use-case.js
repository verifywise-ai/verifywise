"use strict";

/**
 * A model's framework link is no longer tied to a use case.
 *
 * Before: linking a model to a framework stored the row against the first
 * use case of the organization that used the framework (`SELECT project_id
 * FROM projects_frameworks ... LIMIT 1`), an arbitrary one. Readers that
 * counted every row with that project id as a use case link listed the model
 * under a use case nobody linked it to.
 *
 * up():
 * 1. Keeps one framework link per (organization, model, framework): the
 *    lowest id. The duplicates came from the same framework stored against
 *    several use cases.
 * 2. Sets project_id = NULL on every framework link (framework_id set).
 * 3. Adds a partial unique index on (model_inventory_id, framework_id) for
 *    framework links. The table's UNIQUE(model_inventory_id, project_id,
 *    framework_id) never fires once project_id is NULL, as NULLs do not
 *    conflict.
 *
 * Direct use case links (framework_id NULL) are not touched.
 *
 * down(): drops the index and stores each framework link against the first
 * use case of its organization that uses the framework, as the old write
 * did. Rows removed as duplicates are not restored (they carried nothing but
 * that arbitrary use case).
 */

const TABLE = "verifywise.model_inventories_projects_frameworks";
const INDEX = "mipf_model_framework_link_unique";

module.exports = {
  async up(queryInterface) {
    const transaction = await queryInterface.sequelize.transaction();
    try {
      await queryInterface.sequelize.query(
        `DELETE FROM ${TABLE} t
          USING ${TABLE} keep
          WHERE t.framework_id IS NOT NULL
            AND keep.framework_id = t.framework_id
            AND keep.model_inventory_id = t.model_inventory_id
            AND keep.organization_id IS NOT DISTINCT FROM t.organization_id
            AND keep.id < t.id;`,
        { transaction },
      );
      await queryInterface.sequelize.query(
        `UPDATE ${TABLE} SET project_id = NULL
          WHERE framework_id IS NOT NULL AND project_id IS NOT NULL;`,
        { transaction },
      );
      await queryInterface.sequelize.query(
        `CREATE UNIQUE INDEX IF NOT EXISTS ${INDEX}
           ON ${TABLE} (model_inventory_id, framework_id)
          WHERE framework_id IS NOT NULL;`,
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
      await queryInterface.sequelize.query(`DROP INDEX IF EXISTS verifywise.${INDEX};`, {
        transaction,
      });
      await queryInterface.sequelize.query(
        `UPDATE ${TABLE} t
            SET project_id = (
              SELECT pf.project_id FROM verifywise.projects_frameworks pf
               WHERE pf.organization_id = t.organization_id
                 AND pf.framework_id = t.framework_id
               ORDER BY pf.project_id
               LIMIT 1)
          WHERE t.framework_id IS NOT NULL AND t.project_id IS NULL;`,
        { transaction },
      );
      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  },
};
