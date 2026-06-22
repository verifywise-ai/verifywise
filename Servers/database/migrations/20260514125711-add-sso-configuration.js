"use strict";

module.exports = {
  async up(queryInterface) {
    const transaction = await queryInterface.sequelize.transaction();
    try {
      await queryInterface.sequelize.query(
        `DO $$ BEGIN
           CREATE TYPE verifywise.enum_sso_configuration_providers AS ENUM ('AzureAD');
         EXCEPTION WHEN duplicate_object THEN NULL;
         END $$;`,
        { transaction },
      );

      await queryInterface.sequelize.query(
        `CREATE TABLE IF NOT EXISTS verifywise.sso_configurations (
           id SERIAL PRIMARY KEY,
           organization_id INTEGER NOT NULL REFERENCES verifywise.organizations(id) ON DELETE CASCADE,
           provider verifywise.enum_sso_configuration_providers NOT NULL,
           is_enabled BOOLEAN NOT NULL DEFAULT FALSE,
           config_data JSONB NOT NULL,
           created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
           updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
           UNIQUE (organization_id, provider)
         );`,
        { transaction },
      );

      await queryInterface.sequelize.query(
        `CREATE INDEX IF NOT EXISTS sso_configurations_organization_id_idx
           ON verifywise.sso_configurations (organization_id);`,
        { transaction },
      );
      await queryInterface.sequelize.query(
        `CREATE INDEX IF NOT EXISTS sso_configurations_provider_idx
           ON verifywise.sso_configurations (provider);`,
        { transaction },
      );
      await queryInterface.sequelize.query(
        `CREATE INDEX IF NOT EXISTS sso_configurations_is_enabled_idx
           ON verifywise.sso_configurations (is_enabled);`,
        { transaction },
      );

      await queryInterface.sequelize.query(
        `ALTER TABLE verifywise.users
           ADD COLUMN IF NOT EXISTS sso_provider verifywise.enum_sso_configuration_providers,
           ADD COLUMN IF NOT EXISTS sso_user_id VARCHAR(255);`,
        { transaction },
      );
      await queryInterface.sequelize.query(
        `ALTER TABLE verifywise.users ALTER COLUMN password_hash DROP NOT NULL;`,
        { transaction },
      );
      await queryInterface.sequelize.query(
        `ALTER TABLE verifywise.users
           DROP CONSTRAINT IF EXISTS users_auth_exclusive_check;`,
        { transaction },
      );
      await queryInterface.sequelize.query(
        `ALTER TABLE verifywise.users
           ADD CONSTRAINT users_auth_exclusive_check
           CHECK ((sso_user_id IS NULL) <> (password_hash IS NULL)) NOT VALID;`,
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
        `ALTER TABLE verifywise.users
           DROP CONSTRAINT IF EXISTS users_auth_exclusive_check;`,
        { transaction },
      );
      await queryInterface.sequelize.query(
        `ALTER TABLE verifywise.users
           DROP COLUMN IF EXISTS sso_user_id,
           DROP COLUMN IF EXISTS sso_provider;`,
        { transaction },
      );
      await queryInterface.sequelize.query(`DROP TABLE IF EXISTS verifywise.sso_configurations;`, {
        transaction,
      });
      await queryInterface.sequelize.query(
        `DROP TYPE IF EXISTS verifywise.enum_sso_configuration_providers;`,
        { transaction },
      );
      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  },
};
