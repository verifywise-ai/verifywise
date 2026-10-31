"use strict";

/**
 * Framework control change history (issue #4977, remainder of #4915).
 *
 * Compliance framework control edits — EU AI Act controls and subcontrols
 * (controls_eu / subcontrols_eu) and ISO 42001 annex categories
 * (annexcategories_iso) — had no field-level change history, unlike risks,
 * vendors, policies, models, etc. This migration creates one generic
 * change-history table per entity, with the same shape as
 * evidence_hub_change_history (issue #4915), including the changed_by_system
 * column and the (organization_id, changed_at) index the retention prune uses.
 *
 * The matching ENTITY_CONFIGS entries (control_eu, subcontrol_eu,
 * annex_category) are added in changeHistory.config.ts, and writers are hooked
 * into updateControlEUByIdQuery / updateSubcontrolEUByIdQuery (eu.utils.ts) and
 * updateAnnexCategoryQuery (iso42001.utils.ts) so controller- and advisor-path
 * edits are both recorded.
 */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.sequelize.query(
        `
        CREATE TABLE IF NOT EXISTS verifywise.control_eu_change_history (
          id SERIAL PRIMARY KEY,
          organization_id INTEGER NOT NULL REFERENCES verifywise.organizations(id) ON DELETE CASCADE,
          control_eu_id INTEGER NOT NULL REFERENCES verifywise.controls_eu(id) ON DELETE CASCADE,
          field_name VARCHAR(255),
          old_value TEXT,
          new_value TEXT,
          action VARCHAR(50),
          changed_by_user_id INTEGER REFERENCES verifywise.users(id) ON DELETE SET NULL,
          changed_at TIMESTAMP NOT NULL DEFAULT NOW(),
          created_at TIMESTAMP NOT NULL DEFAULT NOW(),
          changed_by_system BOOLEAN NOT NULL DEFAULT FALSE
        );
        `,
        { transaction },
      );
      await queryInterface.sequelize.query(
        `
        CREATE INDEX IF NOT EXISTS idx_control_eu_change_history_org_changed
          ON verifywise.control_eu_change_history (organization_id, changed_at);
        `,
        { transaction },
      );
      await queryInterface.sequelize.query(
        `
        CREATE TABLE IF NOT EXISTS verifywise.subcontrol_eu_change_history (
          id SERIAL PRIMARY KEY,
          organization_id INTEGER NOT NULL REFERENCES verifywise.organizations(id) ON DELETE CASCADE,
          subcontrol_eu_id INTEGER NOT NULL REFERENCES verifywise.subcontrols_eu(id) ON DELETE CASCADE,
          field_name VARCHAR(255),
          old_value TEXT,
          new_value TEXT,
          action VARCHAR(50),
          changed_by_user_id INTEGER REFERENCES verifywise.users(id) ON DELETE SET NULL,
          changed_at TIMESTAMP NOT NULL DEFAULT NOW(),
          created_at TIMESTAMP NOT NULL DEFAULT NOW(),
          changed_by_system BOOLEAN NOT NULL DEFAULT FALSE
        );
        `,
        { transaction },
      );
      await queryInterface.sequelize.query(
        `
        CREATE INDEX IF NOT EXISTS idx_subcontrol_eu_change_history_org_changed
          ON verifywise.subcontrol_eu_change_history (organization_id, changed_at);
        `,
        { transaction },
      );
      await queryInterface.sequelize.query(
        `
        CREATE TABLE IF NOT EXISTS verifywise.annex_category_change_history (
          id SERIAL PRIMARY KEY,
          organization_id INTEGER NOT NULL REFERENCES verifywise.organizations(id) ON DELETE CASCADE,
          annex_category_id INTEGER NOT NULL REFERENCES verifywise.annexcategories_iso(id) ON DELETE CASCADE,
          field_name VARCHAR(255),
          old_value TEXT,
          new_value TEXT,
          action VARCHAR(50),
          changed_by_user_id INTEGER REFERENCES verifywise.users(id) ON DELETE SET NULL,
          changed_at TIMESTAMP NOT NULL DEFAULT NOW(),
          created_at TIMESTAMP NOT NULL DEFAULT NOW(),
          changed_by_system BOOLEAN NOT NULL DEFAULT FALSE
        );
        `,
        { transaction },
      );
      await queryInterface.sequelize.query(
        `
        CREATE INDEX IF NOT EXISTS idx_annex_category_change_history_org_changed
          ON verifywise.annex_category_change_history (organization_id, changed_at);
        `,
        { transaction },
      );
    });
  },

  async down(queryInterface) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.sequelize.query(
        `DROP TABLE IF EXISTS verifywise.annex_category_change_history;`,
        { transaction },
      );
      await queryInterface.sequelize.query(
        `DROP TABLE IF EXISTS verifywise.subcontrol_eu_change_history;`,
        { transaction },
      );
      await queryInterface.sequelize.query(
        `DROP TABLE IF EXISTS verifywise.control_eu_change_history;`,
        { transaction },
      );
    });
  },
};
