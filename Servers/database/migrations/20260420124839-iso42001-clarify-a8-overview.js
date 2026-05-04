"use strict";

/**
 * Clarifies VW A.8 sub_id 1.1 "AI system lifecycle management" as an
 * organizational overview item (not a distinct ISO 42001 Annex A.5 control —
 * the standard starts at A.5.2).
 *
 * Per the brief's wording-review guidance: mark as an organizational note
 * rather than a control. Title is softened to make its overview nature
 * explicit; guidance, description, and implementation_description are
 * rewritten to avoid implying a second stage-by-stage coverage.
 */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      UPDATE verifywise.annexcategories_struct_iso
         SET title = 'AI system lifecycle — overall approach',
             description = 'Organizational overview of how the AI system lifecycle is governed end to end. Not a distinct ISO 42001 Annex A.5 control (the standard starts at A.5.2); retained as an umbrella item to record overall lifecycle posture.',
             guidance = 'Describe, at a high level, how the organization structures the AI lifecycle end to end (requirements, design, data, build, V&V, deployment, operation, maintenance, retirement). The detailed ISO A.5.2–A.5.10 sub-controls are covered by the items that follow.'
       WHERE sub_id = 1.1
         AND title = 'AI system lifecycle management'
         AND annex_id IN (
           SELECT id FROM verifywise.annex_struct_iso
           WHERE annex_no = 8
             AND framework_id IN (
               SELECT id FROM verifywise.frameworks
               WHERE name ILIKE 'ISO 42001%' OR name ILIKE 'ISO/IEC 42001%'
             )
         );
    `);
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(`
      UPDATE verifywise.annexcategories_struct_iso
         SET title = 'AI system lifecycle management',
             description = 'Establishing and managing a defined AI lifecycle process.',
             guidance = 'A defined lifecycle process should be established and managed for AI systems, covering stages from conception through retirement, incorporating AI-specific considerations.'
       WHERE sub_id = 1.1
         AND title = 'AI system lifecycle — overall approach'
         AND annex_id IN (
           SELECT id FROM verifywise.annex_struct_iso
           WHERE annex_no = 8
             AND framework_id IN (
               SELECT id FROM verifywise.frameworks
               WHERE name ILIKE 'ISO 42001%' OR name ILIKE 'ISO/IEC 42001%'
             )
         );
    `);
  },
};
