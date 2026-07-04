"use strict";

/**
 * AI Apps Inventory — Phase 1 (MVP)
 *
 * Creates the ai_apps first-class entity and its junction tables:
 *   - ai_apps
 *   - ai_apps_model_inventories
 *   - ai_apps_policy_manager
 *   - ai_apps_data_exposure
 *   - ai_apps_departments
 */
module.exports = {
  async up(queryInterface) {
    const transaction = await queryInterface.sequelize.transaction();
    try {
      await queryInterface.sequelize.query(
        `
        CREATE TABLE verifywise.ai_apps (
          id SERIAL PRIMARY KEY,
          organization_id INTEGER NOT NULL REFERENCES verifywise.organizations(id) ON DELETE CASCADE,
          name VARCHAR(255) NOT NULL,
          description TEXT,
          vendor_id INTEGER REFERENCES verifywise.vendors(id) ON DELETE SET NULL,
          owner_id INTEGER REFERENCES verifywise.users(id) ON DELETE SET NULL,
          status VARCHAR(50) DEFAULT 'draft' NOT NULL,
          risk_score INTEGER,
          discovered_source VARCHAR(50) DEFAULT 'manual',
          shadow_ai_tool_id INTEGER REFERENCES verifywise.shadow_ai_tools(id) ON DELETE SET NULL,
          required_training VARCHAR(255),
          is_demo BOOLEAN DEFAULT FALSE,
          created_at TIMESTAMPTZ DEFAULT NOW(),
          updated_at TIMESTAMPTZ DEFAULT NOW(),
          UNIQUE(organization_id, name)
        );
      `,
        { transaction },
      );

      await queryInterface.sequelize.query(
        `
        CREATE TABLE verifywise.ai_apps_model_inventories (
          id SERIAL PRIMARY KEY,
          ai_app_id INTEGER NOT NULL REFERENCES verifywise.ai_apps(id) ON DELETE CASCADE,
          model_inventory_id INTEGER NOT NULL REFERENCES verifywise.model_inventories(id) ON DELETE CASCADE,
          created_at TIMESTAMPTZ DEFAULT NOW(),
          UNIQUE(ai_app_id, model_inventory_id)
        );
      `,
        { transaction },
      );

      await queryInterface.sequelize.query(
        `
        CREATE TABLE verifywise.ai_apps_policy_manager (
          id SERIAL PRIMARY KEY,
          ai_app_id INTEGER NOT NULL REFERENCES verifywise.ai_apps(id) ON DELETE CASCADE,
          policy_id INTEGER NOT NULL REFERENCES verifywise.policy_manager(id) ON DELETE CASCADE,
          status VARCHAR(50) DEFAULT 'applicable' NOT NULL,
          created_at TIMESTAMPTZ DEFAULT NOW(),
          updated_at TIMESTAMPTZ DEFAULT NOW(),
          UNIQUE(ai_app_id, policy_id)
        );
      `,
        { transaction },
      );

      await queryInterface.sequelize.query(
        `
        CREATE TABLE verifywise.ai_apps_data_exposure (
          id SERIAL PRIMARY KEY,
          ai_app_id INTEGER NOT NULL REFERENCES verifywise.ai_apps(id) ON DELETE CASCADE,
          data_type VARCHAR(100) NOT NULL,
          allowed BOOLEAN DEFAULT FALSE NOT NULL,
          created_at TIMESTAMPTZ DEFAULT NOW(),
          updated_at TIMESTAMPTZ DEFAULT NOW(),
          UNIQUE(ai_app_id, data_type)
        );
      `,
        { transaction },
      );

      await queryInterface.sequelize.query(
        `
        CREATE TABLE verifywise.ai_apps_departments (
          id SERIAL PRIMARY KEY,
          ai_app_id INTEGER NOT NULL REFERENCES verifywise.ai_apps(id) ON DELETE CASCADE,
          department VARCHAR(255) NOT NULL,
          user_count INTEGER DEFAULT 0,
          created_at TIMESTAMPTZ DEFAULT NOW(),
          updated_at TIMESTAMPTZ DEFAULT NOW(),
          UNIQUE(ai_app_id, department)
        );
      `,
        { transaction },
      );

      await queryInterface.sequelize.query(
        `
        CREATE INDEX idx_ai_apps_org ON verifywise.ai_apps(organization_id);
        CREATE INDEX idx_ai_apps_status ON verifywise.ai_apps(organization_id, status);
        CREATE INDEX idx_ai_apps_vendor ON verifywise.ai_apps(vendor_id);
        CREATE INDEX idx_ai_apps_shadow_ai_tool ON verifywise.ai_apps(shadow_ai_tool_id);
        CREATE INDEX idx_ai_app_models_app ON verifywise.ai_apps_model_inventories(ai_app_id);
        CREATE INDEX idx_ai_app_models_model ON verifywise.ai_apps_model_inventories(model_inventory_id);
        CREATE INDEX idx_ai_app_policies_app ON verifywise.ai_apps_policy_manager(ai_app_id);
        CREATE INDEX idx_ai_app_data_exposure_app ON verifywise.ai_apps_data_exposure(ai_app_id);
        CREATE INDEX idx_ai_app_departments_app ON verifywise.ai_apps_departments(ai_app_id);
      `,
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
        "DROP TABLE IF EXISTS verifywise.ai_apps_departments CASCADE",
        { transaction },
      );
      await queryInterface.sequelize.query(
        "DROP TABLE IF EXISTS verifywise.ai_apps_data_exposure CASCADE",
        { transaction },
      );
      await queryInterface.sequelize.query(
        "DROP TABLE IF EXISTS verifywise.ai_apps_policy_manager CASCADE",
        { transaction },
      );
      await queryInterface.sequelize.query(
        "DROP TABLE IF EXISTS verifywise.ai_apps_model_inventories CASCADE",
        { transaction },
      );
      await queryInterface.sequelize.query("DROP TABLE IF EXISTS verifywise.ai_apps CASCADE", {
        transaction,
      });
      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  },
};
