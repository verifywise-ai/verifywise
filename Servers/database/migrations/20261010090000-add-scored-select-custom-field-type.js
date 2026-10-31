"use strict";

/**
 * Adds "scored_select" to the custom field type allowlist and lets it carry
 * options. Drops and re-adds the two CHECK constraints the original
 * 20260520164729 migration baked the type lists into: cfd_field_type_allowed
 * and cfd_options_shape (options required for option types, NULL otherwise).
 */

const BASE_TYPES = ["text", "number", "date", "boolean", "select", "multiselect", "user"];
const BASE_OPTION_TYPES = ["select", "multiselect"];

const typeList = (types) => types.map((t) => `'${t}'`).join(",");

const setConstraints = (queryInterface, types, optionTypes) =>
  queryInterface.sequelize.query(`
    ALTER TABLE verifywise.custom_field_definitions
      DROP CONSTRAINT IF EXISTS cfd_field_type_allowed,
      ADD CONSTRAINT cfd_field_type_allowed
        CHECK (field_type IN (${typeList(types)})),
      DROP CONSTRAINT IF EXISTS cfd_options_shape,
      ADD CONSTRAINT cfd_options_shape CHECK (
        (
          field_type IN (${typeList(optionTypes)})
          AND jsonb_typeof(options) = 'array'
          AND jsonb_array_length(options) > 0
        )
        OR
        (field_type NOT IN (${typeList(optionTypes)}) AND options IS NULL)
      );
  `);

module.exports = {
  async up(queryInterface) {
    await setConstraints(
      queryInterface,
      [...BASE_TYPES, "scored_select"],
      [...BASE_OPTION_TYPES, "scored_select"],
    );
  },

  async down(queryInterface) {
    const [rows] = await queryInterface.sequelize.query(`
      SELECT COUNT(*)::int AS count
        FROM verifywise.custom_field_definitions
       WHERE field_type = 'scored_select';
    `);
    const count = Number(rows?.[0]?.count ?? 0);
    if (count > 0) {
      throw new Error(
        `Cannot roll back: ${count} scored select custom field(s) exist. Delete them first.`,
      );
    }
    await setConstraints(queryInterface, BASE_TYPES, BASE_OPTION_TYPES);
  },
};
