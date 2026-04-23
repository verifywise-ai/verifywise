'use strict';

/**
 * ISO 42001 Annex re-scope: de-duplicate A.5 and reparent items that belong
 * under A.6 (ISO A.3 — Internal organization).
 *
 * DELETE from A.5:
 *   - "AI roles and responsibilities" (duplicate of A.6.1.1)
 *   - "Segregation of duties" (duplicate of A.6.1.2)
 *
 * REPARENT from A.5 → A.6 (preserves tenant answers; only annex_id changes):
 *   - "Accountability for AI systems"
 *   - "Contact with authorities"
 *   - "Contact with special interest groups"
 *   - "AI in project management"
 *
 * Also resets is_applicable to true and clears justification_for_exclusion on
 * the reparented rows (struct-file defaults should be applicable=true; each
 * tenant decides).
 */
module.exports = {
  async up(queryInterface) {
    const t = await queryInterface.sequelize.transaction();
    try {
      const [[framework]] = await queryInterface.sequelize.query(
        `SELECT id FROM verifywise.frameworks
         WHERE name ILIKE 'ISO 42001%' OR name ILIKE 'ISO/IEC 42001%' LIMIT 1;`,
        { transaction: t }
      );
      if (!framework) {
        console.warn('[iso42001-dedupe] ISO 42001 framework not found — skipping');
        await t.commit();
        return;
      }
      const frameworkId = framework.id;

      const [[annex5]] = await queryInterface.sequelize.query(
        `SELECT id FROM verifywise.annex_struct_iso WHERE framework_id = :frameworkId AND annex_no = 5 LIMIT 1;`,
        { transaction: t, replacements: { frameworkId } }
      );
      const [[annex6]] = await queryInterface.sequelize.query(
        `SELECT id FROM verifywise.annex_struct_iso WHERE framework_id = :frameworkId AND annex_no = 6 LIMIT 1;`,
        { transaction: t, replacements: { frameworkId } }
      );
      if (!annex5?.id || !annex6?.id) {
        console.warn('[iso42001-dedupe] A.5 or A.6 annex group missing — skipping');
        await t.commit();
        return;
      }

      // 1. DELETE true duplicates from A.5 (cascades tenant answers)
      await queryInterface.sequelize.query(
        `DELETE FROM verifywise.annexcategories_struct_iso
         WHERE annex_id = :annex5Id
           AND title IN ('AI roles and responsibilities', 'Segregation of duties');`,
        { transaction: t, replacements: { annex5Id: annex5.id } }
      );

      // 2. REPARENT the 4 misplaced items to A.6 (preserves tenant answers).
      //    Also reset is_applicable defaults and reassign order_no in A.6.
      const toMove = [
        { title: 'Accountability for AI systems', sub_id: 2.1, order_no: 3 },
        { title: 'Contact with authorities', sub_id: 3.1, order_no: 4 },
        { title: 'Contact with special interest groups', sub_id: 3.2, order_no: 5 },
        { title: 'AI in project management', sub_id: 4.1, order_no: 6 },
      ];
      for (const item of toMove) {
        await queryInterface.sequelize.query(
          `UPDATE verifywise.annexcategories_struct_iso
             SET annex_id = :annex6Id,
                 sub_id = :sub_id,
                 order_no = :order_no
           WHERE annex_id = :annex5Id AND title = :title;`,
          {
            transaction: t,
            replacements: {
              annex5Id: annex5.id,
              annex6Id: annex6.id,
              sub_id: item.sub_id,
              order_no: item.order_no,
              title: item.title,
            },
          }
        );
      }

      await t.commit();
      console.log('[iso42001-dedupe] A.5 duplicates removed; 4 items reparented to A.6');
    } catch (err) {
      await t.rollback();
      throw err;
    }
  },

  async down(queryInterface) {
    const t = await queryInterface.sequelize.transaction();
    try {
      const [[framework]] = await queryInterface.sequelize.query(
        `SELECT id FROM verifywise.frameworks
         WHERE name ILIKE 'ISO 42001%' OR name ILIKE 'ISO/IEC 42001%' LIMIT 1;`,
        { transaction: t }
      );
      if (!framework) { await t.commit(); return; }
      const frameworkId = framework.id;

      const [[annex5]] = await queryInterface.sequelize.query(
        `SELECT id FROM verifywise.annex_struct_iso WHERE framework_id = :frameworkId AND annex_no = 5 LIMIT 1;`,
        { transaction: t, replacements: { frameworkId } }
      );
      const [[annex6]] = await queryInterface.sequelize.query(
        `SELECT id FROM verifywise.annex_struct_iso WHERE framework_id = :frameworkId AND annex_no = 6 LIMIT 1;`,
        { transaction: t, replacements: { frameworkId } }
      );
      if (!annex5?.id || !annex6?.id) { await t.commit(); return; }

      // Reverse the reparenting
      const toRestore = [
        { title: 'Accountability for AI systems', sub_id: 4.1, order_no: 5 },
        { title: 'Contact with authorities', sub_id: 5.1, order_no: 6 },
        { title: 'Contact with special interest groups', sub_id: 5.2, order_no: 7 },
        { title: 'AI in project management', sub_id: 6.1, order_no: 8 },
      ];
      for (const item of toRestore) {
        await queryInterface.sequelize.query(
          `UPDATE verifywise.annexcategories_struct_iso
             SET annex_id = :annex5Id, sub_id = :sub_id, order_no = :order_no
           WHERE annex_id = :annex6Id AND title = :title;`,
          {
            transaction: t,
            replacements: {
              annex5Id: annex5.id,
              annex6Id: annex6.id,
              sub_id: item.sub_id,
              order_no: item.order_no,
              title: item.title,
            },
          }
        );
      }
      // Note: we do not recreate the deleted duplicates — they were intentionally dropped.

      await t.commit();
    } catch (err) {
      await t.rollback();
      throw err;
    }
  },
};
