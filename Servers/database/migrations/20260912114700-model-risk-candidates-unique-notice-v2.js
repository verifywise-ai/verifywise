"use strict";

/**
 * F6 sent-record v2: key concurrent duplicates on the announced id set.
 *
 * The v1 index keyed on the scalar metadata.model_risk_id, but the notifier
 * now stores metadata.model_risk_ids (sorted array, possibly empty for
 * model-level notices). Two notices announcing different model risks must
 * coexist; two announcing the same set must conflict. JSONB array equality is
 * order-sensitive, and the writer sorts before storing, so identical sets
 * collide deterministically.
 */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      DROP INDEX IF EXISTS verifywise.notifications_model_risk_candidates_uniq;
    `);
    await queryInterface.sequelize.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS notifications_model_risk_candidates_uniq
        ON verifywise.notifications (
          organization_id,
          user_id,
          entity_id,
          (metadata->>'model_inventory_id'),
          (metadata->'model_risk_ids')
        )
        WHERE type = 'model_risk_candidates'
          AND entity_type = 'risk';
    `);
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(`
      DROP INDEX IF EXISTS verifywise.notifications_model_risk_candidates_uniq;
    `);
  },
};
