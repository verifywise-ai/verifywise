'use strict';

/**
 * Creates the reference tables and category-level junction tables that link
 * EU AI Act control categories to their applicable roles (Provider / Deployer)
 * and risk tiers (Prohibited / High risk / Limited risk / Minimal risk / GPAI
 * / General Risk).
 *
 * Tables introduced:
 *   - verifywise.eu_act_roles
 *   - verifywise.eu_act_risk_tiers
 *   - verifywise.controlcategories_struct_eu__roles
 *   - verifywise.controlcategories_struct_eu__risk_tiers
 *
 * Populates junctions from ControlCategories struct so that when the user
 * fills in `roles` and `riskTiers` on a category, a fresh run of this
 * migration (or the follow-up backfill migration) lands those links in the
 * junction tables. Unpopulated categories simply produce no junction rows.
 *
 * Controls and subcontrols do NOT have their own junctions — they inherit
 * their category's role/tier at query time. Add per-control junctions later
 * if a specific row ever needs to override its category.
 */
module.exports = {
  async up(queryInterface) {
    const t = await queryInterface.sequelize.transaction();
    try {
      // 1. Reference tables ------------------------------------------------
      await queryInterface.sequelize.query(`
        CREATE TABLE IF NOT EXISTS verifywise.eu_act_roles (
          id   SERIAL PRIMARY KEY,
          name TEXT UNIQUE NOT NULL
        );
      `, { transaction: t });

      await queryInterface.sequelize.query(`
        CREATE TABLE IF NOT EXISTS verifywise.eu_act_risk_tiers (
          id   SERIAL PRIMARY KEY,
          name TEXT UNIQUE NOT NULL
        );
      `, { transaction: t });

      // 2. Seed reference values ------------------------------------------
      await queryInterface.sequelize.query(`
        INSERT INTO verifywise.eu_act_roles (name) VALUES
          ('Provider'), ('Deployer')
        ON CONFLICT (name) DO NOTHING;
      `, { transaction: t });

      await queryInterface.sequelize.query(`
        INSERT INTO verifywise.eu_act_risk_tiers (name) VALUES
          ('Prohibited'),
          ('High risk'),
          ('Limited risk'),
          ('Minimal risk'),
          ('GPAI'),
          ('General Risk')
        ON CONFLICT (name) DO NOTHING;
      `, { transaction: t });

      // 3. Category-level junction tables ---------------------------------
      await queryInterface.sequelize.query(`
        CREATE TABLE IF NOT EXISTS verifywise.controlcategories_struct_eu__roles (
          control_category_id INTEGER NOT NULL
            REFERENCES verifywise.controlcategories_struct_eu(id) ON DELETE CASCADE,
          role_id INTEGER NOT NULL
            REFERENCES verifywise.eu_act_roles(id) ON DELETE CASCADE,
          PRIMARY KEY (control_category_id, role_id)
        );
      `, { transaction: t });

      await queryInterface.sequelize.query(`
        CREATE TABLE IF NOT EXISTS verifywise.controlcategories_struct_eu__risk_tiers (
          control_category_id INTEGER NOT NULL
            REFERENCES verifywise.controlcategories_struct_eu(id) ON DELETE CASCADE,
          risk_tier_id INTEGER NOT NULL
            REFERENCES verifywise.eu_act_risk_tiers(id) ON DELETE CASCADE,
          PRIMARY KEY (control_category_id, risk_tier_id)
        );
      `, { transaction: t });

      // 4. Populate junctions from the ControlCategories struct ------------
      const { ControlCategories } = require('../../dist/structures/EU-AI-Act/compliance-tracker/controlCategories.struct');

      const [[framework]] = await queryInterface.sequelize.query(
        `SELECT id FROM verifywise.frameworks WHERE name = 'EU AI Act' LIMIT 1;`,
        { transaction: t }
      );
      if (!framework) {
        console.warn('[eu-act-junctions] EU AI Act framework not found — skipping junction population');
        await t.commit();
        return;
      }

      for (const category of ControlCategories) {
        if (!Array.isArray(category.roles) && !Array.isArray(category.riskTiers)) continue;

        const [[catRow]] = await queryInterface.sequelize.query(
          `SELECT id FROM verifywise.controlcategories_struct_eu
           WHERE framework_id = :frameworkId AND order_no = :order_no
           LIMIT 1;`,
          {
            transaction: t,
            replacements: { frameworkId: framework.id, order_no: category.order_no },
          }
        );
        if (!catRow?.id) continue;

        for (const roleName of category.roles ?? []) {
          await queryInterface.sequelize.query(
            `INSERT INTO verifywise.controlcategories_struct_eu__roles
               (control_category_id, role_id)
             SELECT :catId, r.id FROM verifywise.eu_act_roles r WHERE r.name = :roleName
             ON CONFLICT DO NOTHING;`,
            {
              transaction: t,
              replacements: { catId: catRow.id, roleName },
            }
          );
        }

        for (const tierName of category.riskTiers ?? []) {
          await queryInterface.sequelize.query(
            `INSERT INTO verifywise.controlcategories_struct_eu__risk_tiers
               (control_category_id, risk_tier_id)
             SELECT :catId, t.id FROM verifywise.eu_act_risk_tiers t WHERE t.name = :tierName
             ON CONFLICT DO NOTHING;`,
            {
              transaction: t,
              replacements: { catId: catRow.id, tierName },
            }
          );
        }
      }

      await t.commit();
      console.log('[eu-act-junctions] junction tables created and populated');
    } catch (err) {
      await t.rollback();
      throw err;
    }
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(`DROP TABLE IF EXISTS verifywise.controlcategories_struct_eu__risk_tiers;`);
    await queryInterface.sequelize.query(`DROP TABLE IF EXISTS verifywise.controlcategories_struct_eu__roles;`);
    await queryInterface.sequelize.query(`DROP TABLE IF EXISTS verifywise.eu_act_risk_tiers;`);
    await queryInterface.sequelize.query(`DROP TABLE IF EXISTS verifywise.eu_act_roles;`);
  },
};
