"use strict";

/**
 * Atomic dedup for F6 model-risk-candidate notices.
 *
 * The notifier is trigger-driven (model create/update, model-risk create) and
 * the sent-record check (`hasModelRiskCandidateNoticeQuery`) is a separate
 * SELECT from the INSERT. Two overlapping triggers both read "not notified"
 * and both insert. This partial unique index turns the race into a caught
 * 23505: the loser treats it as already-notified.
 *
 * Key: one notice per (org, recipient, risk, model), refined per model risk.
 * Model-level notices carry no `model_risk_id` (COALESCE to ''), so two of
 * them conflict; a model-risk notice carries its id and coexists with the
 * model-level row but conflicts with itself. Scoped to
 * type='model_risk_candidates' AND entity_type='risk' so no other
 * notification traffic is affected.
 */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS notifications_model_risk_candidates_uniq
        ON verifywise.notifications (
          organization_id,
          user_id,
          entity_id,
          (metadata->>'model_inventory_id'),
          (COALESCE(metadata->>'model_risk_id', ''))
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
