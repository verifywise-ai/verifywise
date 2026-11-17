"use strict";

/**
 * Keep existing risk and policy automations doing what they did (audit P-L12,
 * R-L6).
 *
 * Risk and policy events used to run only the first matching action row
 * (`ORDER BY aa."order"` and the first row of the result): a second
 * automation on the same trigger, or a second action inside one, never ran.
 * The dispatch now runs every action of every active automation. Without this
 * flag, automations that never fired would start firing on deploy: emails and
 * Slack messages nobody has seen configured in action.
 *
 * Every existing automation on a risk or policy trigger is marked
 * legacy_first_action_only. For those, the dispatch keeps only the single
 * first row of the event, as before. Saving the automation in the editor
 * clears the flag, so a user who has reviewed it gets all its actions. New
 * automations default to false. Other triggers (AI Detection and the rest)
 * already ran every action and are left alone.
 */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.sequelize.query(
        `ALTER TABLE verifywise.automations
           ADD COLUMN IF NOT EXISTS legacy_first_action_only BOOLEAN NOT NULL DEFAULT false;`,
        { transaction },
      );
      await queryInterface.sequelize.query(
        `UPDATE verifywise.automations a
            SET legacy_first_action_only = true
           FROM verifywise.automation_triggers t
          WHERE t.id = a.trigger_id
            AND t.key IN (
              'risk_added', 'risk_updated', 'risk_deleted',
              'policy_added', 'policy_updated', 'policy_deleted'
            );`,
        { transaction },
      );
    });
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(`
      ALTER TABLE verifywise.automations
        DROP COLUMN IF EXISTS legacy_first_action_only;
    `);
  },
};
