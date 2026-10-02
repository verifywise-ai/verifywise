"use strict";

/**
 * Stale-inheritance flag: when a parent risk's displayed level moves, every
 * confirmed child inheriting from it gets parent_level_changed_at = NOW() so
 * the panel can badge it. Any edit to the child clears the badge again.
 *
 * Known limits (accepted, do not fix here):
 * - A single bulk UPDATE that moves a parent's and its child's level in one
 *   statement may clear the badge it just set, depending on row order. Level
 *   edits are per-row in the UI.
 * - A soft-deleted parent whose level is still edited will flag its children.
 *   Soft delete does not touch the level column, so this only happens if
 *   someone edits an already-deleted row.
 */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      ALTER TABLE verifywise.risk_links
        ADD COLUMN IF NOT EXISTS parent_level_changed_at TIMESTAMPTZ;
    `);

    // The org+target index only covers project-risk parents. Model and vendor
    // parents have no index leading with their target column, and the trigger
    // below looks them up on every model/vendor risk-level edit.
    await queryInterface.sequelize.query(`
      CREATE INDEX IF NOT EXISTS risk_links_model_parent_idx
        ON verifywise.risk_links (target_model_risk_id)
        WHERE relation_type = 'inherits_from' AND status = 'confirmed';
    `);
    await queryInterface.sequelize.query(`
      CREATE INDEX IF NOT EXISTS risk_links_vendor_parent_idx
        ON verifywise.risk_links (target_vendor_risk_id)
        WHERE relation_type = 'inherits_from' AND status = 'confirmed';
    `);

    await queryInterface.sequelize.query(`
      CREATE OR REPLACE FUNCTION verifywise.risk_links_flag_stale()
      RETURNS trigger LANGUAGE plpgsql AS $func$
      BEGIN
        IF TG_TABLE_NAME = 'risks' THEN
          -- A child risk that gets edited at all has been looked at, so its inherited
          -- level is no longer stale. These predicates are exactly
          -- risk_links_single_parent_idx, so this stays an index lookup on every
          -- risks UPDATE rather than a scan.
          UPDATE verifywise.risk_links
             SET parent_level_changed_at = NULL
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
          -- AFTER UPDATE OF risk_level already narrows this to statements that name
          -- the column; the guard catches naming it with an unchanged value.
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

    // No column list on risks: the function also clears a child's own badge on any
    // edit, which is how the badge escapes when a review concludes "no change".
    await queryInterface.sequelize.query(`
      DROP TRIGGER IF EXISTS trg_risks_flag_stale ON verifywise.risks;
      CREATE TRIGGER trg_risks_flag_stale
        AFTER UPDATE ON verifywise.risks
        FOR EACH ROW EXECUTE FUNCTION verifywise.risk_links_flag_stale();
    `);
    await queryInterface.sequelize.query(`
      DROP TRIGGER IF EXISTS trg_model_risks_flag_stale ON verifywise.model_risks;
      CREATE TRIGGER trg_model_risks_flag_stale
        AFTER UPDATE OF risk_level ON verifywise.model_risks
        FOR EACH ROW EXECUTE FUNCTION verifywise.risk_links_flag_stale();
    `);
    await queryInterface.sequelize.query(`
      DROP TRIGGER IF EXISTS trg_vendorrisks_flag_stale ON verifywise.vendorrisks;
      CREATE TRIGGER trg_vendorrisks_flag_stale
        AFTER UPDATE OF risk_level ON verifywise.vendorrisks
        FOR EACH ROW EXECUTE FUNCTION verifywise.risk_links_flag_stale();
    `);
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(`
      DROP TRIGGER IF EXISTS trg_risks_flag_stale ON verifywise.risks;
      DROP TRIGGER IF EXISTS trg_model_risks_flag_stale ON verifywise.model_risks;
      DROP TRIGGER IF EXISTS trg_vendorrisks_flag_stale ON verifywise.vendorrisks;
    `);
    await queryInterface.sequelize.query(`
      DROP FUNCTION IF EXISTS verifywise.risk_links_flag_stale();
    `);
    await queryInterface.sequelize.query(`
      DROP INDEX IF EXISTS verifywise.risk_links_model_parent_idx;
      DROP INDEX IF EXISTS verifywise.risk_links_vendor_parent_idx;
    `);
    await queryInterface.sequelize.query(`
      ALTER TABLE verifywise.risk_links
        DROP COLUMN IF EXISTS parent_level_changed_at;
    `);
  },
};
