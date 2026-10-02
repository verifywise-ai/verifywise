"use strict";

/**
 * Narrow the stale-inheritance clear to the child's own level column.
 *
 * The original trigger was `AFTER UPDATE ON risks` with no column list, so the
 * function cleared `parent_level_changed_at` for the child on ANY write to
 * `risks`. That assumed every writer was a human review. It is not: the nightly
 * evidence-freshness sweep (`UPDATE risks SET evidence_stale_at, mitigation_status`),
 * risk benchmarks, quantitative recomputes and AI advisor actions all update
 * `risks` without a reviewer, so a scheduled job silently erased the warning a
 * parent's level change had just raised.
 *
 * Firing only when the child's displayed level column is part of the statement
 * keeps the human path (the risk form posts the full row, including the level)
 * and excludes every machine writer above, none of which touch that column.
 */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      DROP TRIGGER IF EXISTS trg_risks_flag_stale ON verifywise.risks;
      CREATE TRIGGER trg_risks_flag_stale
        AFTER UPDATE OF risk_level_autocalculated ON verifywise.risks
        FOR EACH ROW EXECUTE FUNCTION verifywise.risk_links_flag_stale();
    `);
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(`
      DROP TRIGGER IF EXISTS trg_risks_flag_stale ON verifywise.risks;
      CREATE TRIGGER trg_risks_flag_stale
        AFTER UPDATE ON verifywise.risks
        FOR EACH ROW EXECUTE FUNCTION verifywise.risk_links_flag_stale();
    `);
  },
};
