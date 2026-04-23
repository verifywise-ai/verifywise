'use strict';

/**
 * ISO 42001 phantom subclause 8.5 "Third-party relationships" removal.
 *
 * The ISO 42001 standard's clause 8 only goes to 8.4 (AI system lifecycle).
 * VW seeded an extra 8.5 "Third-party relationships" that does not exist in the
 * standard — the same content is already covered by Annex A.11 (VW A.11 /
 * ISO A.8).
 *
 * This migration deletes the struct row; ON DELETE CASCADE on
 * subclauses_iso.subclause_meta_id_fkey cleans up tenant rows. Any tenant
 * answers attached to the phantom 8.5 are lost — acceptable because the
 * category duplicates Annex A.11 where they can re-apply the content.
 */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      DELETE FROM verifywise.subclauses_struct_iso
      WHERE subclause_id = '8.5'
        AND clause_id IN (
          SELECT id FROM verifywise.clauses_struct_iso
          WHERE clause_no = 8
            AND framework_id IN (
              SELECT id FROM verifywise.frameworks
              WHERE name ILIKE 'ISO 42001%' OR name ILIKE 'ISO/IEC 42001%'
            )
        );
    `);
  },

  async down() {
    // Intentionally no-op: we don't recreate content that doesn't exist in the standard.
  },
};
