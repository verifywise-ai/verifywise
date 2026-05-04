"use strict";

/**
 * Pushes the 2022-aligned requirement_summary / key_questions /
 * evidence_examples / implementation_description content from the updated
 * struct file into existing DB rows.
 *
 * Runs AFTER 20260420113913-iso27001-align-to-2022-standard.js which handles
 * title renames, phantom removal, and new-control inserts. Once titles are
 * aligned to 2022 in the DB, this migration iterates the struct file and
 * UPDATEs each matching row's content fields by title.
 *
 * Content source of truth is the TS struct file itself; the dist build is
 * loaded at migration time. Idempotent — re-running is a no-op at the data
 * level if content already matches.
 */
const toPgArray = (arr) => {
  if (!arr || !Array.isArray(arr) || arr.length === 0) return "{}";
  const escaped = arr.map((v) => `"${String(v).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`);
  return `{${escaped.join(",")}}`;
};

module.exports = {
  async up(queryInterface) {
    const {
      ISO27001Annex,
    } = require("../../dist/structures/ISO-27001/annexes/iso27001.annex.struct");

    const t = await queryInterface.sequelize.transaction();
    try {
      const [[framework]] = await queryInterface.sequelize.query(
        `SELECT id FROM verifywise.frameworks WHERE name = 'ISO 27001' LIMIT 1;`,
        { transaction: t },
      );
      if (!framework) {
        console.warn("[iso27001-refresh-content] ISO 27001 framework not found — skipping");
        await t.commit();
        return;
      }
      const frameworkId = framework.id;

      let updated = 0;
      for (const annex of ISO27001Annex) {
        for (const ctrl of annex.controls) {
          const [result] = await queryInterface.sequelize.query(
            `UPDATE verifywise.annexcontrols_struct_iso27001
               SET requirement_summary = :req,
                   key_questions       = :kq,
                   evidence_examples   = :ev,
                   description         = COALESCE(description, '')
             WHERE title = :title
               AND category_id IN (
                 SELECT id FROM verifywise.annexcategories_struct_iso27001
                 WHERE framework_id = :frameworkId AND annex_id = :annexId
               );`,
            {
              transaction: t,
              replacements: {
                title: ctrl.title,
                req: ctrl.requirement_summary || "",
                kq: toPgArray(ctrl.key_questions || []),
                ev: toPgArray(ctrl.evidence_examples || []),
                frameworkId,
                annexId: `A.${annex.index}`,
              },
            },
          );
          if (result && typeof result === "object" && "rowCount" in result) {
            updated += Number(result.rowCount) || 0;
          }
        }
      }

      console.log(
        `[iso27001-refresh-content] refreshed content fields; approx rows updated: ${updated}`,
      );
      await t.commit();
    } catch (err) {
      await t.rollback();
      throw err;
    }
  },

  async down() {
    // Intentionally no-op. The original generic boilerplate was not audit-
    // accurate; reverting to it would be a regression. Individual rollback can
    // be scripted if genuinely needed.
  },
};
