"use strict";

/**
 * Populates the EU AI Act role/tier junction tables for the 8 categories that
 * the developer brief + fix notes explicitly specify. Also corrects two
 * categories' `article` metadata that the fix notes identified as wrong:
 *
 *   - category order_no 13 (GPAI): article range extended to Art 51-56
 *     (Art 56 covers codes of practice — a core GPAI compliance path).
 *   - category order_no 16 (Provider technical requirements): widened to
 *     Art 9-15, 18-19 (was skipping Art 13 transparency/instructions for use
 *     and Art 14 human oversight design obligations).
 *
 * Mapping source: `eu-ai-act-developer-brief.md` + `eu-ai-act-controls-fix-notes.md`
 *
 * | order_no | Category                                           | Roles               | Tier         |
 * |---------:|----------------------------------------------------|---------------------|--------------|
 * |        0 | Prohibited AI practices                            | Provider, Deployer  | Prohibited   |
 * |        8 | Transparency obligations (Art 50)                  | Provider, Deployer  | Limited risk |
 * |       13 | General-purpose AI models                          | Provider            | GPAI         |
 * |       14 | High-risk AI system classification                 | Provider            | High risk    |
 * |       15 | Quality management system                          | Provider            | High risk    |
 * |       16 | Provider technical requirements                    | Provider            | High risk    |
 * |       17 | Conformity assessment and market access            | Provider            | High risk    |
 * |       18 | Deployer data protection and explanation           | Deployer            | High risk    |
 *
 * The 11 existing categories (order_no 1-7, 9-12) are deliberately NOT
 * populated here — their authoritative source (Table A in
 * `docs/research/eu-ai-act-role-tier-analysis.md`) is not present in the repo.
 * A filter with empty role/tier mapping should treat those categories as
 * "applies to all" until the mapping is provided.
 *
 * Idempotent: ON CONFLICT DO NOTHING on the junction inserts.
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
        console.warn("[populate-eu-act-role-tier] framework not found — skipping");
        await t.commit();
        return;
      }
      const frameworkId = framework.id;

      // 1) Article corrections per fix notes.
      await queryInterface.sequelize.query(
        `UPDATE verifywise.controlcategories_struct_eu
           SET article = 'Art. 51-56'
         WHERE framework_id = :frameworkId AND order_no = 13;`,
        { transaction: t, replacements: { frameworkId } },
      );
      await queryInterface.sequelize.query(
        `UPDATE verifywise.controlcategories_struct_eu
           SET article = 'Art. 9-15, 18-19'
         WHERE framework_id = :frameworkId AND order_no = 16;`,
        { transaction: t, replacements: { frameworkId } },
      );

      // 2) Resolve role + tier lookup ids once.
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
        { order_no: 0, roles: ["Provider", "Deployer"], tier: "Prohibited" },
        { order_no: 8, roles: ["Provider", "Deployer"], tier: "Limited risk" },
        { order_no: 13, roles: ["Provider"], tier: "GPAI" },
        { order_no: 14, roles: ["Provider"], tier: "High risk" },
        { order_no: 15, roles: ["Provider"], tier: "High risk" },
        { order_no: 16, roles: ["Provider"], tier: "High risk" },
        { order_no: 17, roles: ["Provider"], tier: "High risk" },
        { order_no: 18, roles: ["Deployer"], tier: "High risk" },
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
            `[populate-eu-act-role-tier] category order_no=${m.order_no} not found — skipping`,
          );
          continue;
        }

        for (const roleName of m.roles) {
          const rid = roleId[roleName];
          if (!rid) {
            console.warn(
              `[populate-eu-act-role-tier] role '${roleName}' not in eu_act_roles — skipping`,
            );
            continue;
          }
          await queryInterface.sequelize.query(
            `INSERT INTO verifywise.controlcategories_struct_eu__roles
               (control_category_id, role_id)
             VALUES (:catId, :rid)
             ON CONFLICT DO NOTHING;`,
            { transaction: t, replacements: { catId: cat.id, rid } },
          );
        }

        const tid = tierId[m.tier];
        if (!tid) {
          console.warn(
            `[populate-eu-act-role-tier] tier '${m.tier}' not in eu_act_risk_tiers — skipping`,
          );
          continue;
        }
        await queryInterface.sequelize.query(
          `INSERT INTO verifywise.controlcategories_struct_eu__risk_tiers
             (control_category_id, risk_tier_id)
           VALUES (:catId, :tid)
           ON CONFLICT DO NOTHING;`,
          { transaction: t, replacements: { catId: cat.id, tid } },
        );
      }

      await t.commit();
      console.log(
        "[populate-eu-act-role-tier] populated 8 categories; articles corrected for order_no 13 and 16",
      );
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
      const frameworkId = framework.id;

      const orderNos = [0, 8, 13, 14, 15, 16, 17, 18];
      for (const order_no of orderNos) {
        const [[cat]] = await queryInterface.sequelize.query(
          `SELECT id FROM verifywise.controlcategories_struct_eu
           WHERE framework_id = :frameworkId AND order_no = :order_no
           LIMIT 1;`,
          { transaction: t, replacements: { frameworkId, order_no } },
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

      // Revert article strings.
      await queryInterface.sequelize.query(
        `UPDATE verifywise.controlcategories_struct_eu
           SET article = 'Art. 51-55' WHERE framework_id = :frameworkId AND order_no = 13;`,
        { transaction: t, replacements: { frameworkId } },
      );
      await queryInterface.sequelize.query(
        `UPDATE verifywise.controlcategories_struct_eu
           SET article = 'Art. 9-12, 15, 18-19' WHERE framework_id = :frameworkId AND order_no = 16;`,
        { transaction: t, replacements: { frameworkId } },
      );

      await t.commit();
    } catch (err) {
      await t.rollback();
      throw err;
    }
  },
};
