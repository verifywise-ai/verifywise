"use strict";

/**
 * Stale-inheritance lifecycle: notification + explicit acknowledgement.
 *
 * `parent_level_changed_at` already flags a child when its parent's level moves,
 * but there was no way to (a) tell the owner or (b) clear the flag on a review
 * that changes nothing. This adds:
 *   - `parent_level_notified_at` on risk_links, a per-link sent-record so the
 *     notifier is idempotent and retried only until it succeeds;
 *   - the notification enum value the sweep delivers;
 *   - the flag-clearing paths reset the notified marker too, so a later level
 *     change re-notifies. The trigger only ever SETS the flag now (the broad
 *     "any risks UPDATE clears it" clause was narrowed in
 *     20260911204319-narrow-stale-inheritance-trigger.js), so the clear here is
 *     the human review/acknowledge and the model/vendor clear below.
 *
 * Down drops the column; removing a Postgres enum value is a no-op, same as
 * 20260711090100-add-mrm-revalidation-due-notification-type.js.
 */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      ALTER TABLE verifywise.risk_links
        ADD COLUMN IF NOT EXISTS parent_level_notified_at TIMESTAMPTZ;
    `);
    await queryInterface.sequelize.query(
      `ALTER TYPE verifywise.enum_notification_type ADD VALUE IF NOT EXISTS 'risk_inheritance_stale';`,
    );

    // Recreate the flag function so the clear paths also reset the sent-record.
    await queryInterface.sequelize.query(`
      CREATE OR REPLACE FUNCTION verifywise.risk_links_flag_stale()
      RETURNS trigger LANGUAGE plpgsql AS $func$
      BEGIN
        IF TG_TABLE_NAME = 'risks' THEN
          -- A child risk whose own displayed level is edited has been reviewed,
          -- so its inherited level is no longer stale. The trigger only fires
          -- for statements naming that column (see the narrow migration).
          UPDATE verifywise.risk_links
             SET parent_level_changed_at = NULL,
                 parent_level_notified_at = NULL
           WHERE source_risk_id = NEW.id
             AND relation_type = 'inherits_from'
             AND status = 'confirmed'
             AND parent_level_changed_at IS NOT NULL;

          -- Nothing moved on the level the panel shows: no child goes stale.
          IF NEW.risk_level_autocalculated IS NOT DISTINCT FROM OLD.risk_level_autocalculated THEN
            RETURN NULL;
          END IF;

          UPDATE verifywise.risk_links
             SET parent_level_changed_at = NOW()
           WHERE organization_id = NEW.organization_id
             AND target_risk_id = NEW.id
             AND status = 'confirmed'
             AND relation_type = 'inherits_from';

        ELSIF TG_TABLE_NAME = 'model_risks' THEN
          IF NEW.risk_level IS NOT DISTINCT FROM OLD.risk_level THEN
            RETURN NULL;
          END IF;

          UPDATE verifywise.risk_links
             SET parent_level_changed_at = NOW()
           WHERE target_model_risk_id = NEW.id
             AND relation_type = 'inherits_from'
             AND status = 'confirmed';

        ELSIF TG_TABLE_NAME = 'vendorrisks' THEN
          IF NEW.risk_level IS NOT DISTINCT FROM OLD.risk_level THEN
            RETURN NULL;
          END IF;

          UPDATE verifywise.risk_links
             SET parent_level_changed_at = NOW()
           WHERE target_vendor_risk_id = NEW.id
             AND relation_type = 'inherits_from'
             AND status = 'confirmed';
        END IF;

        RETURN NULL;
      END;
      $func$;
    `);
  },

  async down(queryInterface) {
    // Restore the pre-notification function body (without the notified reset).
    await queryInterface.sequelize.query(`
      CREATE OR REPLACE FUNCTION verifywise.risk_links_flag_stale()
      RETURNS trigger LANGUAGE plpgsql AS $func$
      BEGIN
        IF TG_TABLE_NAME = 'risks' THEN
          UPDATE verifywise.risk_links
             SET parent_level_changed_at = NULL
           WHERE source_risk_id = NEW.id
             AND relation_type = 'inherits_from'
             AND status = 'confirmed'
             AND parent_level_changed_at IS NOT NULL;

          IF NEW.risk_level_autocalculated IS NOT DISTINCT FROM OLD.risk_level_autocalculated THEN
            RETURN NULL;
          END IF;

          UPDATE verifywise.risk_links
             SET parent_level_changed_at = NOW()
           WHERE organization_id = NEW.organization_id
             AND target_risk_id = NEW.id
             AND status = 'confirmed'
             AND relation_type = 'inherits_from';

        ELSIF TG_TABLE_NAME = 'model_risks' THEN
          IF NEW.risk_level IS NOT DISTINCT FROM OLD.risk_level THEN
            RETURN NULL;
          END IF;

          UPDATE verifywise.risk_links
             SET parent_level_changed_at = NOW()
           WHERE target_model_risk_id = NEW.id
             AND relation_type = 'inherits_from'
             AND status = 'confirmed';

        ELSIF TG_TABLE_NAME = 'vendorrisks' THEN
          IF NEW.risk_level IS NOT DISTINCT FROM OLD.risk_level THEN
            RETURN NULL;
          END IF;

          UPDATE verifywise.risk_links
             SET parent_level_changed_at = NOW()
           WHERE target_vendor_risk_id = NEW.id
             AND relation_type = 'inherits_from'
             AND status = 'confirmed';
        END IF;

        RETURN NULL;
      END;
      $func$;
    `);
    await queryInterface.sequelize.query(`
      ALTER TABLE verifywise.risk_links
        DROP COLUMN IF EXISTS parent_level_notified_at;
    `);
    // Enum value removal: no-op. See header comment.
  },
};
