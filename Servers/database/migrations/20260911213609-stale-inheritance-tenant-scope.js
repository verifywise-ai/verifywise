"use strict";

/**
 * Tenant-scope every branch of the stale-inheritance trigger.
 *
 * The project-risk parent branch always filtered
 * `organization_id = NEW.organization_id`, but the model-risk and vendor-risk
 * parent branches matched on the target id alone, and the child-clear branch
 * matched on `source_risk_id` alone. Ids are global serials and no DB FK
 * prevents a cross-org `risk_links` row, so a level move in one org could flag
 * (or clear) another org's link. All three entity tables carry
 * `organization_id`, so scope every predicate on it.
 */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      CREATE OR REPLACE FUNCTION verifywise.risk_links_flag_stale()
      RETURNS trigger LANGUAGE plpgsql AS $func$
      BEGIN
        IF TG_TABLE_NAME = 'risks' THEN
          UPDATE verifywise.risk_links
             SET parent_level_changed_at = NULL,
                 parent_level_notified_at = NULL
           WHERE source_risk_id = NEW.id
             AND organization_id = NEW.organization_id
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
           WHERE organization_id = NEW.organization_id
             AND target_model_risk_id = NEW.id
             AND relation_type = 'inherits_from'
             AND status = 'confirmed';

        ELSIF TG_TABLE_NAME = 'vendorrisks' THEN
          IF NEW.risk_level IS NOT DISTINCT FROM OLD.risk_level THEN
            RETURN NULL;
          END IF;

          UPDATE verifywise.risk_links
             SET parent_level_changed_at = NOW()
           WHERE organization_id = NEW.organization_id
             AND target_vendor_risk_id = NEW.id
             AND relation_type = 'inherits_from'
             AND status = 'confirmed';
        END IF;

        RETURN NULL;
      END;
      $func$;
    `);
  },

  async down(queryInterface) {
    // Restore the unscoped predicates. Enum/columns are untouched by this
    // migration; only the function body changes.
    await queryInterface.sequelize.query(`
      CREATE OR REPLACE FUNCTION verifywise.risk_links_flag_stale()
      RETURNS trigger LANGUAGE plpgsql AS $func$
      BEGIN
        IF TG_TABLE_NAME = 'risks' THEN
          UPDATE verifywise.risk_links
             SET parent_level_changed_at = NULL,
                 parent_level_notified_at = NULL
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
  },
};
