"use strict";

/**
 * Keep existing vendor, model, use case, task, training and incident
 * automations doing what they did (audit I-L5), as
 * 20261114200100-legacy-automation-first-action did for risk and policy.
 *
 * Every added/updated/deleted event of these entities used to run only the
 * first matching action row (`ORDER BY aa."order"` and the first row of the
 * result): a second automation on the same trigger, or a second action inside
 * one, never ran. The dispatch now runs every action of every active
 * automation. Without this flag, automations that never fired would start
 * firing on deploy: emails and Slack messages nobody has seen in action.
 *
 * Every existing automation on one of these triggers is marked
 * legacy_first_action_only. For those, the dispatch keeps only the single
 * first row of the event, as before. Saving the automation in the editor (or
 * through the Advisor with its actions) clears the flag. New automations
 * default to false.
 *
 * Not flagged, because they already ran every action: the AI Detection
 * triggers, scheduled_report (one job per action row) and
 * vendor_review_date_approaching (every action of every automation). Risk and
 * policy triggers were flagged by 20261114200100.
 *
 * up only sets the flag, so running it again is harmless. down clears it on
 * these triggers only: every automation on them had false before up (the
 * column's default, and nothing else set it for these triggers).
 */
const TRIGGER_KEYS = [
  "vendor_added",
  "vendor_updated",
  "vendor_deleted",
  "model_added",
  "model_updated",
  "model_deleted",
  "project_added",
  "project_updated",
  "project_deleted",
  "task_added",
  "task_updated",
  "task_deleted",
  "training_added",
  "training_updated",
  "training_deleted",
  "incident_added",
  "incident_updated",
  "incident_deleted",
];

const setFlag = (queryInterface, value) =>
  queryInterface.sequelize.query(
    `UPDATE verifywise.automations a
        SET legacy_first_action_only = :value
       FROM verifywise.automation_triggers t
      WHERE t.id = a.trigger_id
        AND t.key IN (:keys)
        AND a.legacy_first_action_only <> :value;`,
    { replacements: { keys: TRIGGER_KEYS, value } },
  );

module.exports = {
  async up(queryInterface) {
    await setFlag(queryInterface, true);
  },

  async down(queryInterface) {
    await setFlag(queryInterface, false);
  },
};
