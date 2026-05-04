"use strict";

/**
 * Populates role/tier junction rows for the 11 EU AI Act categories that
 * existed before the developer brief's new files (order_no 1-7 and 9-12).
 * Based on the user's article-level behavior map:
 *
 *   • AI literacy (Art 4)                    — horizontal, applies broadly
 *   • Transparency to deployers (Art 13)     — always required for providers
 *   • Human oversight (Art 14)               — always required for providers
 *   • Corrective actions (Art 20)            — always required for providers
 *   • Value chain responsibilities (Art 25)  — always required for providers
 *   • Deployer obligations (Art 26)          — role/context: deployer
 *   • FRIA (Art 27)                          — role/context: deployer
 *   • Registration (Art 49)                  — always required for providers
 *   • EU database (Art 71)                   — always required for providers
 *   • Post-market monitoring (Art 72)        — required after deployment
 *   • Serious incident reporting (Art 73)    — required after deployment
 *
 * Together with the prior migration (populate-eu-act-role-tier-for-new-
 * categories), all 19 EU AI Act categories now carry role + tier metadata.
 *
 * Idempotent via ON CONFLICT DO NOTHING on the junction inserts.
 */
module.exports = {
  async up(queryInterface) {
    const t = await queryInterface.sequelize.transaction();
    try {
      const [[framework]] = await queryInterface.sequelize.query(
        `SELECT id FROM verifywise.frameworks WHERE name = 'EU AI Act' LIMIT 1;`,
        { transaction: t },
      );
      if (!framework) {
        console.warn("[populate-eu-act-role-tier-existing] framework not found — skipping");
        await t.commit();
        return;
      }
      const frameworkId = framework.id;

      const [roles] = await queryInterface.sequelize.query(
        `SELECT id, name FROM verifywise.eu_act_roles;`,
        { transaction: t },
      );
      const [tiers] = await queryInterface.sequelize.query(
        `SELECT id, name FROM verifywise.eu_act_risk_tiers;`,
        { transaction: t },
      );
      const roleId = Object.fromEntries(roles.map((r) => [r.name, r.id]));
      const tierId = Object.fromEntries(tiers.map((r) => [r.name, r.id]));

      const mappings = [
        { order_no: 1, roles: ["Provider", "Deployer"], tier: "General Risk" },
        { order_no: 2, roles: ["Provider"], tier: "High risk" },
        { order_no: 3, roles: ["Provider"], tier: "High risk" },
        { order_no: 4, roles: ["Provider"], tier: "High risk" },
        { order_no: 5, roles: ["Provider"], tier: "High risk" },
        { order_no: 6, roles: ["Deployer"], tier: "High risk" },
        { order_no: 7, roles: ["Deployer"], tier: "High risk" },
        { order_no: 9, roles: ["Provider"], tier: "High risk" },
        { order_no: 10, roles: ["Provider"], tier: "High risk" },
        { order_no: 11, roles: ["Provider"], tier: "High risk" },
        { order_no: 12, roles: ["Provider"], tier: "High risk" },
      ];

      for (const m of mappings) {
        const [[cat]] = await queryInterface.sequelize.query(
          `SELECT id FROM verifywise.controlcategories_struct_eu
           WHERE framework_id = :frameworkId AND order_no = :order_no
           LIMIT 1;`,
          { transaction: t, replacements: { frameworkId, order_no: m.order_no } },
        );
        if (!cat) {
          console.warn(
            `[populate-eu-act-role-tier-existing] category order_no=${m.order_no} not found — skipping`,
          );
          continue;
        }

        for (const roleName of m.roles) {
          const rid = roleId[roleName];
          if (!rid) continue;
          await queryInterface.sequelize.query(
            `INSERT INTO verifywise.controlcategories_struct_eu__roles
               (control_category_id, role_id)
             VALUES (:catId, :rid)
             ON CONFLICT DO NOTHING;`,
            { transaction: t, replacements: { catId: cat.id, rid } },
          );
        }

        const tid = tierId[m.tier];
        if (!tid) continue;
        await queryInterface.sequelize.query(
          `INSERT INTO verifywise.controlcategories_struct_eu__risk_tiers
             (control_category_id, risk_tier_id)
           VALUES (:catId, :tid)
           ON CONFLICT DO NOTHING;`,
          { transaction: t, replacements: { catId: cat.id, tid } },
        );
      }

      await t.commit();
      console.log("[populate-eu-act-role-tier-existing] populated 11 legacy categories");
    } catch (err) {
      await t.rollback();
      throw err;
    }
  },

  async down(queryInterface) {
    const t = await queryInterface.sequelize.transaction();
    try {
      const [[framework]] = await queryInterface.sequelize.query(
        `SELECT id FROM verifywise.frameworks WHERE name = 'EU AI Act' LIMIT 1;`,
        { transaction: t },
      );
      if (!framework) {
        await t.commit();
        return;
      }
      const orderNos = [1, 2, 3, 4, 5, 6, 7, 9, 10, 11, 12];
      for (const order_no of orderNos) {
        const [[cat]] = await queryInterface.sequelize.query(
          `SELECT id FROM verifywise.controlcategories_struct_eu
           WHERE framework_id = :frameworkId AND order_no = :order_no
           LIMIT 1;`,
          { transaction: t, replacements: { frameworkId: framework.id, order_no } },
        );
        if (!cat) continue;
        await queryInterface.sequelize.query(
          `DELETE FROM verifywise.controlcategories_struct_eu__roles WHERE control_category_id = :catId;`,
          { transaction: t, replacements: { catId: cat.id } },
        );
        await queryInterface.sequelize.query(
          `DELETE FROM verifywise.controlcategories_struct_eu__risk_tiers WHERE control_category_id = :catId;`,
          { transaction: t, replacements: { catId: cat.id } },
        );
      }
      await t.commit();
    } catch (err) {
      await t.rollback();
      throw err;
    }
  },
};
