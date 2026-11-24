"use strict";

/**
 * Adds NIST AI RMF subcategories MEASURE 2.10–2.13, missing on every install.
 *
 * nist_ai_rmf_subcategories_struct.subcategory_id was DECIMAL(4,1), so the
 * seed's "2.10" was stored as 2.1, collided with the real MEASURE 2.1 on
 * UNIQUE(function, subcategory_id), and ON CONFLICT DO NOTHING skipped it;
 * 2.11–2.13 likewise. A wider DECIMAL would not help (2.10 = 2.1 as a
 * number), so the column becomes text: existing values cast to the same
 * strings ("1.1", "2.9"), which is how the API already returned them.
 *
 * Then, from the compiled registry (structures/NIST-AI-RMF), it inserts the
 * subcategories the struct table lacks — on every install today that is
 * MEASURE 2.10–2.13 — and gives every project that already uses NIST AI RMF
 * a "Not started" row for each, as createNewSubcategoriesQuery does for a new
 * project. Idempotent; down() reverses the column type only when no value
 * would collide.
 */

const NIST_FRAMEWORK_ID = 4;

module.exports = {
  async up(queryInterface) {
    const sequelize = queryInterface.sequelize;
    const {
      NIST_AI_RMF_Structure,
    } = require("../../dist/structures/NIST-AI-RMF/nist-ai-rmf.structure");
    const transaction = await sequelize.transaction();
    try {
      await sequelize.query(
        `ALTER TABLE verifywise.nist_ai_rmf_subcategories_struct
           ALTER COLUMN subcategory_id TYPE VARCHAR(10) USING subcategory_id::text;`,
        { transaction },
      );

      const [frameworkRows] = await sequelize.query(
        `SELECT 1 FROM verifywise.nist_ai_rmf_categories_struct WHERE framework_id = :id LIMIT 1;`,
        { replacements: { id: NIST_FRAMEWORK_ID }, transaction },
      );
      if (!frameworkRows.length) {
        console.log("[nist-2.10] NIST AI RMF is not seeded here, nothing to add");
        await transaction.commit();
        return;
      }

      let added = 0;
      for (const func of NIST_AI_RMF_Structure.functions) {
        for (const category of func.categories || []) {
          const [catRows] = await sequelize.query(
            `SELECT id FROM verifywise.nist_ai_rmf_categories_struct
              WHERE framework_id = :frameworkId AND function = :function AND category_id = :categoryId;`,
            {
              replacements: {
                frameworkId: NIST_FRAMEWORK_ID,
                function: func.type,
                categoryId: category.index,
              },
              transaction,
            },
          );
          if (!catRows.length) continue;
          for (const sub of category.subcategories || []) {
            const [inserted] = await sequelize.query(
              `INSERT INTO verifywise.nist_ai_rmf_subcategories_struct
                 (category_struct_id, function, subcategory_id, description, order_no, is_demo)
               VALUES (:categoryStructId, :function, :subcategoryId, :description, :orderNo, false)
               ON CONFLICT (function, subcategory_id) DO NOTHING
               RETURNING id;`,
              {
                replacements: {
                  categoryStructId: catRows[0].id,
                  function: func.type,
                  subcategoryId: `${category.index}.${sub.index}`,
                  description: sub.description || "",
                  orderNo: sub.index,
                },
                transaction,
              },
            );
            if (!inserted.length) continue;
            added++;
            // Every project already using NIST AI RMF gets the new subcategory.
            await sequelize.query(
              `INSERT INTO verifywise.nist_ai_rmf_subcategories
                 (organization_id, subcategory_meta_id, projects_frameworks_id, status, is_demo, created_at)
               SELECT pf.organization_id, :metaId, pf.id, 'Not started', false, NOW()
                 FROM verifywise.projects_frameworks pf
                WHERE pf.framework_id = :frameworkId
                  AND NOT EXISTS (
                    SELECT 1 FROM verifywise.nist_ai_rmf_subcategories s
                     WHERE s.projects_frameworks_id = pf.id AND s.subcategory_meta_id = :metaId
                  );`,
              {
                replacements: { metaId: inserted[0].id, frameworkId: NIST_FRAMEWORK_ID },
                transaction,
              },
            );
          }
        }
      }
      console.log(`[nist-2.10] added ${added} NIST AI RMF subcategories`);
      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  },

  async down(queryInterface) {
    // The added rows stay (they may hold answers); only the column type is
    // restored, and only when no two values would collide as decimals.
    const sequelize = queryInterface.sequelize;
    const [collisions] = await sequelize.query(
      `SELECT function, subcategory_id::numeric(4,1) AS n, COUNT(*)
         FROM verifywise.nist_ai_rmf_subcategories_struct
        GROUP BY 1, 2 HAVING COUNT(*) > 1;`,
    );
    if (collisions.length) {
      console.log(
        "[nist-2.10] down: subcategory ids would collide as decimals, column left as text",
      );
      return;
    }
    await sequelize.query(
      `ALTER TABLE verifywise.nist_ai_rmf_subcategories_struct
         ALTER COLUMN subcategory_id TYPE DECIMAL(4,1) USING subcategory_id::numeric(4,1);`,
    );
  },
};
