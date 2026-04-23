'use strict';

/**
 * Miscellaneous ISO 42001 struct-row title fixes applied to the DB so existing
 * installs match the updated struct files:
 *   - Clause 8.4 "AI System Lifecycle" → "AI system lifecycle" (sentence case)
 */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      UPDATE verifywise.subclauses_struct_iso
         SET title = 'AI system lifecycle'
       WHERE subclause_id = '8.4'
         AND title = 'AI System Lifecycle'
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

  async down(queryInterface) {
    await queryInterface.sequelize.query(`
      UPDATE verifywise.subclauses_struct_iso
         SET title = 'AI System Lifecycle'
       WHERE subclause_id = '8.4'
         AND title = 'AI system lifecycle'
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
};
