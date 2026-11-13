"use strict";

/**
 * AI Detection notifications and Automations triggers.
 *
 * 1. Extend `enum_notification_type` with the three AI Detection values so the
 *    scan notifier can store its in-app rows. Without them the INSERT fails
 *    with "invalid input value for enum enum_notification_type".
 * 2. Extend `enum_notification_entity_type` with `ai_detection_scan`, the
 *    entity every AI Detection notice points at (its id is the scan id; the
 *    notifier also uses that pair to make sure a scan is announced once).
 * 3. Seed three Automations triggers and link each to the `send_email` action,
 *    the same way the consolidated public-schema migration links the others.
 *
 * Postgres 12+ allows `ALTER TYPE ... ADD VALUE`. Enum values are not removed
 * on down: that needs the type recreated and every column using it migrated.
 * Down removes the triggers only when no automation uses them, because
 * automations.trigger_id is ON DELETE RESTRICT and an automation is user data.
 */

const NOTIFICATION_TYPES = [
  "ai_detection_scan_completed",
  "ai_detection_scan_failed",
  "ai_detection_scan_attention",
];

const TRIGGER_KEYS = [
  "ai_detection_scan_completed",
  "ai_detection_high_risk_finding",
  "ai_detection_scan_failed",
];

module.exports = {
  async up(queryInterface) {
    for (const value of NOTIFICATION_TYPES) {
      await queryInterface.sequelize.query(
        `ALTER TYPE verifywise.enum_notification_type ADD VALUE IF NOT EXISTS '${value}';`,
      );
    }
    await queryInterface.sequelize.query(
      `ALTER TYPE verifywise.enum_notification_entity_type ADD VALUE IF NOT EXISTS 'ai_detection_scan';`,
    );

    const transaction = await queryInterface.sequelize.transaction();
    try {
      await queryInterface.sequelize.query(
        `INSERT INTO verifywise.automation_triggers (key, label, event_name, description) VALUES
          ('ai_detection_scan_completed', 'AI Detection scan completed', 'ai_detection.scan_completed', 'Triggered when an AI Detection scan finishes.'),
          ('ai_detection_high_risk_finding', 'AI Detection high-risk finding', 'ai_detection.high_risk_finding', 'Triggered when a scan finds high-risk findings that the previous scan of the repository did not have.'),
          ('ai_detection_scan_failed', 'AI Detection scan failed', 'ai_detection.scan_failed', 'Triggered when an AI Detection scan fails.')
        ON CONFLICT (key) DO NOTHING;`,
        { transaction },
      );
      await queryInterface.sequelize.query(
        `INSERT INTO verifywise.automation_triggers_actions (trigger_id, action_id)
          SELECT t.id, a.id
          FROM verifywise.automation_triggers t, verifywise.automation_actions a
          WHERE a.key = 'send_email' AND t.key IN (:keys)
        ON CONFLICT DO NOTHING;`,
        { transaction, replacements: { keys: TRIGGER_KEYS } },
      );
      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  },

  async down(queryInterface) {
    const transaction = await queryInterface.sequelize.transaction();
    try {
      const unused = `t.key IN (:keys)
        AND NOT EXISTS (SELECT 1 FROM verifywise.automations a WHERE a.trigger_id = t.id)`;
      await queryInterface.sequelize.query(
        `DELETE FROM verifywise.automation_triggers_actions ta
          USING verifywise.automation_triggers t
          WHERE ta.trigger_id = t.id AND ${unused};`,
        { transaction, replacements: { keys: TRIGGER_KEYS } },
      );
      await queryInterface.sequelize.query(
        `DELETE FROM verifywise.automation_triggers t WHERE ${unused};`,
        { transaction, replacements: { keys: TRIGGER_KEYS } },
      );
      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  },
};
