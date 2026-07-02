"use strict";

/**
 * Instance-level observability configuration.
 *
 * Single-row table (enforced by a fixed primary key) holding the central
 * observability endpoint + deployment name that all services push OpenTelemetry
 * metrics/logs to. Set from SuperAdmin → Settings → Monitoring; read by services
 * at startup ("restart to apply").
 */
module.exports = {
  async up(queryInterface) {
    const transaction = await queryInterface.sequelize.transaction();
    try {
      await queryInterface.sequelize.query(
        `CREATE TABLE IF NOT EXISTS verifywise.monitoring_config (
           id INTEGER PRIMARY KEY DEFAULT 1,
           enabled BOOLEAN NOT NULL DEFAULT FALSE,
           otlp_endpoint TEXT,
           deployment_name TEXT,
           auth_header TEXT,
           updated_by INTEGER REFERENCES verifywise.users(id) ON DELETE SET NULL,
           updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
           CONSTRAINT monitoring_config_singleton CHECK (id = 1)
         );`,
        { transaction },
      );

      // Seed the single row so reads/updates can always target id = 1.
      await queryInterface.sequelize.query(
        `INSERT INTO verifywise.monitoring_config (id, enabled)
         VALUES (1, FALSE)
         ON CONFLICT (id) DO NOTHING;`,
        { transaction },
      );

      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query("DROP TABLE IF EXISTS verifywise.monitoring_config;");
  },
};
