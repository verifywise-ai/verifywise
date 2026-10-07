"use strict";

/**
 * Sent-record race guard for vendor risk candidate notices, keyed exactly like
 * notifications_model_risk_candidates_uniq (v2): per (org, user, risk, vendor)
 * plus the sorted array of announced vendor risk ids, empty for vendor-level
 * notices. Two concurrent triggers announcing the same thing collide; the
 * notifier treats that 23505 as a suppressed duplicate.
 */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS notifications_vendor_risk_candidates_uniq
        ON verifywise.notifications (
          organization_id,
          user_id,
          entity_id,
          (metadata->>'vendor_id'),
          (metadata->'vendor_risk_ids')
        )
        WHERE type = 'vendor_risk_candidates'
          AND entity_type = 'risk';
    `);
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(`
      DROP INDEX IF EXISTS verifywise.notifications_vendor_risk_candidates_uniq;
    `);
  },
};
