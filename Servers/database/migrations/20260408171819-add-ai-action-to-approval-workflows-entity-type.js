'use strict';

/**
 * Extend the CHECK constraint on `approval_workflows.entity_type` to include
 * `'ai_action'`, enabling the AI Advisor to file approval requests for its
 * own write operations (see `Servers/advisor/agent_create_risk`).
 *
 * The original constraint (from 20260226234302-tenant-tables.js) was:
 *   CHECK (entity_type IN ('use_case', 'project', 'file'))
 *
 * We drop and re-create the constraint rather than using ALTER (Postgres
 * does not support ADD VALUE on CHECK constraints; CHECK is stored as an
 * expression, not an enum).
 *
 * Note: `approval_requests.entity_type` has no CHECK constraint, so no
 * change is needed there.
 */

module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      ALTER TABLE verifywise.approval_workflows
        DROP CONSTRAINT IF EXISTS approval_workflows_entity_type_check;
    `);

    await queryInterface.sequelize.query(`
      ALTER TABLE verifywise.approval_workflows
        ADD CONSTRAINT approval_workflows_entity_type_check
        CHECK (entity_type IN ('use_case', 'project', 'file', 'ai_action'));
    `);
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(`
      ALTER TABLE verifywise.approval_workflows
        DROP CONSTRAINT IF EXISTS approval_workflows_entity_type_check;
    `);

    await queryInterface.sequelize.query(`
      ALTER TABLE verifywise.approval_workflows
        ADD CONSTRAINT approval_workflows_entity_type_check
        CHECK (entity_type IN ('use_case', 'project', 'file'));
    `);
  },
};
