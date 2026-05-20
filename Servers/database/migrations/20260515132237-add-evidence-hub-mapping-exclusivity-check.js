"use strict";

/**
 * Enforces that an evidence_hub row can map to a training OR a model, never both.
 *
 * Adds a CHECK constraint requiring at least one of mapped_model_ids /
 * mapped_training_ids to be empty (NULL or array length 0). Both being empty
 * is allowed (the row is unmapped) — the application layer is responsible for
 * requiring at least one mapping at creation time.
 */
module.exports = {
  async up(queryInterface) {
    // Sanity check: refuse to add the constraint if any existing row already
    // violates it. Surfacing the offending IDs makes cleanup actionable.
    const [violations] = await queryInterface.sequelize.query(`
      SELECT id
      FROM verifywise.evidence_hub
      WHERE COALESCE(array_length(mapped_model_ids, 1), 0) > 0
        AND COALESCE(array_length(mapped_training_ids, 1), 0) > 0;
    `);

    if (Array.isArray(violations) && violations.length > 0) {
      const ids = violations.map((r) => r.id).join(", ");
      throw new Error(
        `Cannot add evidence_hub mapping exclusivity constraint: ${violations.length} row(s) ` +
          `already map to both a model and a training (ids: ${ids}). ` +
          `Clear one side before re-running this migration.`,
      );
    }

    await queryInterface.sequelize.query(`
      ALTER TABLE verifywise.evidence_hub
        ADD CONSTRAINT evidence_hub_single_mapping_check
        CHECK (
          COALESCE(array_length(mapped_model_ids, 1), 0) = 0
          OR COALESCE(array_length(mapped_training_ids, 1), 0) = 0
        );
    `);
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(`
      ALTER TABLE verifywise.evidence_hub
        DROP CONSTRAINT IF EXISTS evidence_hub_single_mapping_check;
    `);
  },
};
