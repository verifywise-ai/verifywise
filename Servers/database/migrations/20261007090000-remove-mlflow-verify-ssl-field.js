"use strict";

/**
 * Remove the "Verify SSL certificate" field from the MLflow extension form.
 *
 * The field was saved with the configuration but never applied: the MLflow
 * extension calls the tracking server through Node's fetch, which always
 * verifies the server certificate. Showing a toggle that does nothing led
 * admins with self-signed servers to switch it off and still hit TLS errors.
 * Certificate verification stays on; a self-signed server needs a
 * certificate the VerifyWise server trusts (NODE_EXTRA_CA_CERTS).
 *
 * Saved configurations may still carry a verify_ssl key. It is ignored and
 * left in place, so down() restores the field without data loss.
 */

module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      DELETE FROM verifywise.extension_config_fields
       WHERE field_key = 'verify_ssl'
         AND extension_id = (SELECT id FROM verifywise.extensions WHERE key = 'mlflow');
    `);
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(`
      INSERT INTO verifywise.extension_config_fields
        (extension_id, field_key, field_type, label, is_required, is_secret,
         default_value, display_order, created_at)
      SELECT id, 'verify_ssl', 'boolean', 'Verify SSL certificate', FALSE, FALSE,
             'true', 6, NOW()
        FROM verifywise.extensions
       WHERE key = 'mlflow'
      ON CONFLICT (extension_id, field_key) DO NOTHING;
    `);
  },
};
