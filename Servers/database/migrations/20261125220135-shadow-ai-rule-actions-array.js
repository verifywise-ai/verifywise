"use strict";

/**
 * Shadow AI rules created by "Create demo data" before November 2026 stored
 * their actions as an object of flags ({ notify: true, create_alert: true,
 * auto_block: false }). Every other path stores an array of { type } objects,
 * which the alert service reads when a rule fires. The object form made that
 * service throw, so those rules never recorded an alert, and the rule card
 * listed "auto block", a flag that does nothing.
 *
 * up rewrites every object-form value to [{ "type": "send_alert" }], the
 * action the create-rule form saves; all three demo rules had create_alert
 * set. Rows that are already arrays are untouched, so running it again is
 * harmless. down is a no-op: the old object carried no behaviour, and
 * restoring it would bring back the error.
 */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      UPDATE verifywise.shadow_ai_rules
      SET actions = '[{"type": "send_alert"}]'::jsonb,
          updated_at = NOW()
      WHERE jsonb_typeof(actions) = 'object';
    `);
  },

  async down() {},
};
