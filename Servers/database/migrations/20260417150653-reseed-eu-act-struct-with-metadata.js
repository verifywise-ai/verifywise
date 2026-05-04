"use strict";

/**
 * Reseeds the EU AI Act struct tables to pick up:
 *   - The new Prohibited practices category (order_no = 0)
 *   - The rewritten General-purpose AI category (order_no = 13 content replaced)
 *   - Five new categories (order_no 14-18): risk classification, QMS, provider
 *     technical requirements, conformity / market access, deployer data rights
 *   - The expanded transparency category (order_no = 8) with three new Art 50(2-4)
 *     top-level controls
 *   - Per-row `article` metadata
 *
 * Idempotent via SELECT-then-INSERT-or-UPDATE keyed on (parent, order_no). We do
 * NOT use `ON CONFLICT DO NOTHING`: none of the struct tables have unique
 * constraints on (framework_id, order_no) / (control_category_id, order_no) /
 * (control_id, order_no), so ON CONFLICT would never match and every rerun
 * would duplicate rows.
 *
 * After struct work, tenant rows (controls_eu + subcontrols_eu) are backfilled
 * for every existing projects_frameworks tied to this framework — so new
 * categories/controls/subcontrols appear filled-in as empty rows for in-flight
 * projects without a separate post-migration step.
 *
 * `roles` and `risk_tiers` are not columns on these tables — they live in the
 * category-level junction tables created by
 * 20260417152215-add-eu-act-roles-risk-tiers-junctions.js.
 */
module.exports = {
  async up(queryInterface) {
    const {
      ControlCategories,
    } = require("../../dist/structures/EU-AI-Act/compliance-tracker/controlCategories.struct");

    const t = await queryInterface.sequelize.transaction();
    try {
      const [[framework]] = await queryInterface.sequelize.query(
        `SELECT id FROM verifywise.frameworks WHERE name = 'EU AI Act' LIMIT 1;`,
        { transaction: t },
      );
      if (!framework) {
        console.warn("[reseed-eu-act] EU AI Act framework not found — skipping");
        await t.commit();
        return;
      }
      const frameworkId = framework.id;

      for (const category of ControlCategories) {
        // Category: match existing by (framework_id, order_no). UPDATE if found,
        // INSERT if not. Never creates duplicates on rerun.
        const [[existingCat]] = await queryInterface.sequelize.query(
          `SELECT id FROM verifywise.controlcategories_struct_eu
           WHERE framework_id = :frameworkId AND order_no = :order_no
           LIMIT 1;`,
          {
            transaction: t,
            replacements: { frameworkId, order_no: category.order_no },
          },
        );

        let categoryId = existingCat?.id;
        if (categoryId) {
          await queryInterface.sequelize.query(
            `UPDATE verifywise.controlcategories_struct_eu
               SET title = :title, article = :article
             WHERE id = :id;`,
            {
              transaction: t,
              replacements: {
                id: categoryId,
                title: category.title,
                article: category.article ?? null,
              },
            },
          );
        } else {
          const [[inserted]] = await queryInterface.sequelize.query(
            `INSERT INTO verifywise.controlcategories_struct_eu
               (framework_id, title, order_no, is_demo, article)
             VALUES (:frameworkId, :title, :order_no, false, :article)
             RETURNING id;`,
            {
              transaction: t,
              replacements: {
                frameworkId,
                title: category.title,
                order_no: category.order_no,
                article: category.article ?? null,
              },
            },
          );
          categoryId = inserted.id;
        }

        if (!Array.isArray(category.controls)) continue;

        for (const control of category.controls) {
          const controlArticle = control.article ?? category.article ?? null;

          const [[existingCtl]] = await queryInterface.sequelize.query(
            `SELECT id FROM verifywise.controls_struct_eu
             WHERE control_category_id = :categoryId AND order_no = :order_no
             LIMIT 1;`,
            {
              transaction: t,
              replacements: { categoryId, order_no: control.order_no },
            },
          );

          let controlId = existingCtl?.id;
          if (controlId) {
            await queryInterface.sequelize.query(
              `UPDATE verifywise.controls_struct_eu
                 SET title = :title, description = :description, article = :article
               WHERE id = :id;`,
              {
                transaction: t,
                replacements: {
                  id: controlId,
                  title: control.title,
                  description: control.description || "",
                  article: controlArticle,
                },
              },
            );
          } else {
            const [[inserted]] = await queryInterface.sequelize.query(
              `INSERT INTO verifywise.controls_struct_eu
                 (control_category_id, title, description, order_no, is_demo, article)
               VALUES (:categoryId, :title, :description, :order_no, false, :article)
               RETURNING id;`,
              {
                transaction: t,
                replacements: {
                  categoryId,
                  title: control.title,
                  description: control.description || "",
                  order_no: control.order_no,
                  article: controlArticle,
                },
              },
            );
            controlId = inserted.id;
          }

          if (!Array.isArray(control.subControls)) continue;

          for (const sc of control.subControls) {
            const scArticle = sc.article ?? controlArticle;

            const [[existingSc]] = await queryInterface.sequelize.query(
              `SELECT id FROM verifywise.subcontrols_struct_eu
               WHERE control_id = :controlId AND order_no = :order_no
               LIMIT 1;`,
              {
                transaction: t,
                replacements: { controlId, order_no: sc.order_no },
              },
            );

            if (existingSc?.id) {
              await queryInterface.sequelize.query(
                `UPDATE verifywise.subcontrols_struct_eu
                   SET title = :title, description = :description, article = :article
                 WHERE id = :id;`,
                {
                  transaction: t,
                  replacements: {
                    id: existingSc.id,
                    title: sc.title,
                    description: sc.description || "",
                    article: scArticle,
                  },
                },
              );
            } else {
              await queryInterface.sequelize.query(
                `INSERT INTO verifywise.subcontrols_struct_eu
                   (control_id, title, description, order_no, is_demo, article)
                 VALUES (:controlId, :title, :description, :order_no, false, :article);`,
                {
                  transaction: t,
                  replacements: {
                    controlId,
                    title: sc.title,
                    description: sc.description || "",
                    order_no: sc.order_no,
                    article: scArticle,
                  },
                },
              );
            }
          }
        }
      }

      // Backfill tenant rows for every EU AI Act project that's missing
      // controls_eu / subcontrols_eu entries for the struct rows above. Catches
      // up projects provisioned before the new categories were added. No-op on
      // fresh installs where no projects exist yet.
      const [ctlBackfill] = await queryInterface.sequelize.query(
        `INSERT INTO verifywise.controls_eu
           (organization_id, projects_frameworks_id, control_meta_id)
         SELECT pf.organization_id, pf.id, cs.id
         FROM verifywise.projects_frameworks pf
         CROSS JOIN verifywise.controls_struct_eu cs
         JOIN verifywise.controlcategories_struct_eu cc ON cc.id = cs.control_category_id
         WHERE pf.framework_id = :frameworkId
           AND cc.framework_id = :frameworkId
           AND NOT EXISTS (
             SELECT 1 FROM verifywise.controls_eu ce
             WHERE ce.projects_frameworks_id = pf.id
               AND ce.control_meta_id = cs.id
           )
         RETURNING id;`,
        { transaction: t, replacements: { frameworkId } },
      );

      const [scBackfill] = await queryInterface.sequelize.query(
        `INSERT INTO verifywise.subcontrols_eu
           (organization_id, control_id, subcontrol_meta_id)
         SELECT pf.organization_id, ce.id, ss.id
         FROM verifywise.projects_frameworks pf
         JOIN verifywise.controls_struct_eu cs ON cs.control_category_id IN (
           SELECT id FROM verifywise.controlcategories_struct_eu
           WHERE framework_id = :frameworkId
         )
         JOIN verifywise.subcontrols_struct_eu ss ON ss.control_id = cs.id
         JOIN verifywise.controls_eu ce
           ON ce.projects_frameworks_id = pf.id AND ce.control_meta_id = cs.id
         WHERE pf.framework_id = :frameworkId
           AND NOT EXISTS (
             SELECT 1 FROM verifywise.subcontrols_eu se
             WHERE se.control_id = ce.id AND se.subcontrol_meta_id = ss.id
           )
         RETURNING id;`,
        { transaction: t, replacements: { frameworkId } },
      );

      console.log(
        `[reseed-eu-act] reseed complete; tenant backfill: ${ctlBackfill.length} controls_eu, ${scBackfill.length} subcontrols_eu`,
      );
      await t.commit();
    } catch (err) {
      await t.rollback();
      throw err;
    }
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(`
      DELETE FROM verifywise.controlcategories_struct_eu
      WHERE framework_id IN (SELECT id FROM verifywise.frameworks WHERE name = 'EU AI Act')
        AND order_no IN (0, 14, 15, 16, 17, 18);
    `);
  },
};
