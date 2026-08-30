"use strict";

module.exports = {
  async up(queryInterface) {
    // The child column (source_risk_id) is deliberately untouched. It carries
    // risk_links_single_parent_idx, and in value-chain inheritance the child is
    // always a project risk — so C1's one-parent rule extends across entity
    // types for free. See the C4 design, §2.4.
    await queryInterface.sequelize.query(`
      ALTER TABLE verifywise.risk_links
        ALTER COLUMN target_risk_id DROP NOT NULL,
        ADD COLUMN IF NOT EXISTS target_model_risk_id  INTEGER REFERENCES verifywise.model_risks(id)  ON DELETE CASCADE,
        ADD COLUMN IF NOT EXISTS target_vendor_risk_id INTEGER REFERENCES verifywise.vendorrisks(id) ON DELETE CASCADE;
    `);

    // Exactly one parent, of exactly one kind.
    await queryInterface.sequelize.query(`
      ALTER TABLE verifywise.risk_links
        ADD CONSTRAINT risk_links_one_target CHECK (
            (target_risk_id        IS NOT NULL)::int
          + (target_model_risk_id  IS NOT NULL)::int
          + (target_vendor_risk_id IS NOT NULL)::int = 1
        );
    `);

    // risk_links_canonical orders related_to edges smaller-id-first by comparing
    // bare integers. Across tables those integers come from different sequences,
    // and with a NULL target_risk_id the comparison yields NULL and the CHECK
    // PASSES silently. Forbidding the combination closes that hole.
    await queryInterface.sequelize.query(`
      ALTER TABLE verifywise.risk_links
        ADD CONSTRAINT risk_links_cross_entity_inherits CHECK (
          target_risk_id IS NOT NULL OR relation_type = 'inherits_from'
        );
    `);

    // risk_links_unique stops protecting cross-entity rows once target_risk_id
    // is NULL: Postgres treats each NULL as distinct. These restore it.
    await queryInterface.sequelize.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS risk_links_unique_model_target
        ON verifywise.risk_links (source_risk_id, target_model_risk_id, relation_type)
        WHERE target_model_risk_id IS NOT NULL;
    `);
    await queryInterface.sequelize.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS risk_links_unique_vendor_target
        ON verifywise.risk_links (source_risk_id, target_vendor_risk_id, relation_type)
        WHERE target_vendor_risk_id IS NOT NULL;
    `);
  },

  async down(queryInterface) {
    // Drops cross-entity rows: target_risk_id cannot go back to NOT NULL while
    // they exist, and there is no project risk to point them at.
    await queryInterface.sequelize.query(`
      DELETE FROM verifywise.risk_links WHERE target_risk_id IS NULL;
    `);
    await queryInterface.sequelize.query(`
      DROP INDEX IF EXISTS verifywise.risk_links_unique_vendor_target;
      DROP INDEX IF EXISTS verifywise.risk_links_unique_model_target;
      ALTER TABLE verifywise.risk_links
        DROP CONSTRAINT IF EXISTS risk_links_cross_entity_inherits,
        DROP CONSTRAINT IF EXISTS risk_links_one_target,
        DROP COLUMN IF EXISTS target_vendor_risk_id,
        DROP COLUMN IF EXISTS target_model_risk_id,
        ALTER COLUMN target_risk_id SET NOT NULL;
    `);
  },
};
