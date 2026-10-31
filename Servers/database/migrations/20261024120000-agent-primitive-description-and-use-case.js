"use strict";

/**
 * An agent can have a description and can be linked to a use case.
 *
 * - description: free text, optional.
 * - linked_project_id: the use case (a non-organizational project) the agent
 *   belongs to, optional. Deleting the use case clears the link.
 *
 * The model link already exists as linked_model_inventory_id.
 */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      ALTER TABLE verifywise.agent_primitives
        ADD COLUMN IF NOT EXISTS description TEXT,
        ADD COLUMN IF NOT EXISTS linked_project_id INTEGER
          REFERENCES verifywise.projects(id) ON DELETE SET NULL;
    `);
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(`
      ALTER TABLE verifywise.agent_primitives
        DROP COLUMN IF EXISTS linked_project_id,
        DROP COLUMN IF EXISTS description;
    `);
  },
};
