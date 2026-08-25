"use strict";
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      DO $$ BEGIN
        CREATE TYPE verifywise.enum_vendors_ict_service_type AS ENUM (
          'Cloud services', 'Data analysis', 'Security services',
          'Network infrastructure', 'Software or applications',
          'IT project management', 'Other ICT services'
        );
      EXCEPTION WHEN duplicate_object THEN null; END $$;

      DO $$ BEGIN
        CREATE TYPE verifywise.enum_vendors_function_criticality AS ENUM (
          'Critical', 'Important', 'Not critical'
        );
      EXCEPTION WHEN duplicate_object THEN null; END $$;

      DO $$ BEGIN
        CREATE TYPE verifywise.enum_vendors_substitutability AS ENUM (
          'Easily substitutable', 'Difficult to substitute', 'Not substitutable'
        );
      EXCEPTION WHEN duplicate_object THEN null; END $$;

      ALTER TABLE verifywise.vendors
        ADD COLUMN IF NOT EXISTS is_ict_provider BOOLEAN NOT NULL DEFAULT false,
        ADD COLUMN IF NOT EXISTS ict_service_type verifywise.enum_vendors_ict_service_type,
        ADD COLUMN IF NOT EXISTS function_criticality verifywise.enum_vendors_function_criticality,
        ADD COLUMN IF NOT EXISTS substitutability verifywise.enum_vendors_substitutability,
        ADD COLUMN IF NOT EXISTS has_exit_plan BOOLEAN NOT NULL DEFAULT false,
        ADD COLUMN IF NOT EXISTS country_of_provision VARCHAR(255),
        ADD COLUMN IF NOT EXISTS provider_lei VARCHAR(50);
    `);
  },
  async down(queryInterface) {
    await queryInterface.sequelize.query(`
      ALTER TABLE verifywise.vendors
        DROP COLUMN IF EXISTS is_ict_provider,
        DROP COLUMN IF EXISTS ict_service_type,
        DROP COLUMN IF EXISTS function_criticality,
        DROP COLUMN IF EXISTS substitutability,
        DROP COLUMN IF EXISTS has_exit_plan,
        DROP COLUMN IF EXISTS country_of_provision,
        DROP COLUMN IF EXISTS provider_lei;
      DROP TYPE IF EXISTS verifywise.enum_vendors_ict_service_type;
      DROP TYPE IF EXISTS verifywise.enum_vendors_function_criticality;
      DROP TYPE IF EXISTS verifywise.enum_vendors_substitutability;
    `);
  },
};
