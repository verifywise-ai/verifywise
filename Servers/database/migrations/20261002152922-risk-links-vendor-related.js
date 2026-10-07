"use strict";

/**
 * `related_to` between two vendor risks.
 *
 * Until now `source_risk_id` was always a project risk: the child of an
 * inheritance edge, or the smaller end of a `related_to` pair. A pair of vendor
 * risks has no project risk in it, so the source becomes polymorphic too —
 * `source_vendor_risk_id` beside `source_risk_id`, exactly one of them set.
 *
 * A vendor-sourced row is deliberately narrow: `related_to` only, to a vendor
 * risk only, stored smaller-id-first. Vendor risks never inherit from each
 * other (the child of an inheritance edge is always a project risk, which is
 * what `risk_links_single_parent_idx` relies on), so nothing about inheritance,
 * the single-parent index or the stale-level trigger changes: all of those
 * filter on `relation_type = 'inherits_from'`.
 */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      ALTER TABLE verifywise.risk_links
        ALTER COLUMN source_risk_id DROP NOT NULL,
        ADD COLUMN IF NOT EXISTS source_vendor_risk_id INTEGER
          REFERENCES verifywise.vendorrisks(id) ON DELETE CASCADE;
    `);

    // Exactly one source, of exactly one kind — the mirror of risk_links_one_target.
    await queryInterface.sequelize.query(`
      ALTER TABLE verifywise.risk_links
        ADD CONSTRAINT risk_links_one_source CHECK (
            (source_risk_id        IS NOT NULL)::int
          + (source_vendor_risk_id IS NOT NULL)::int = 1
        );
    `);

    // The only shape a vendor-sourced row may take. The strict < is both the
    // canonical order and the no-self rule: risk_links_canonical and
    // risk_links_no_self compare source_risk_id, which is NULL here, so both
    // would pass silently without this.
    await queryInterface.sequelize.query(`
      ALTER TABLE verifywise.risk_links
        ADD CONSTRAINT risk_links_vendor_pair CHECK (
          source_vendor_risk_id IS NULL
          OR (relation_type = 'related_to'
              AND target_vendor_risk_id IS NOT NULL
              AND source_vendor_risk_id < target_vendor_risk_id)
        );
    `);

    // risk_links_cross_entity_inherits forbade every related_to row without a
    // project-risk target. Keep that for project-risk sources and let the
    // vendor pair through; risk_links_vendor_pair above constrains its shape.
    await queryInterface.sequelize.query(`
      ALTER TABLE verifywise.risk_links
        DROP CONSTRAINT IF EXISTS risk_links_cross_entity_inherits,
        ADD CONSTRAINT risk_links_cross_entity_inherits CHECK (
          target_risk_id IS NOT NULL
          OR relation_type = 'inherits_from'
          OR source_vendor_risk_id IS NOT NULL
        );
    `);

    // NULL source_risk_id makes every existing unique key blind to these rows.
    await queryInterface.sequelize.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS risk_links_unique_vendor_pair
        ON verifywise.risk_links (source_vendor_risk_id, target_vendor_risk_id, relation_type)
        WHERE source_vendor_risk_id IS NOT NULL;
    `);

    // The vendor panel reads a vendor risk's links from either end.
    await queryInterface.sequelize.query(`
      CREATE INDEX IF NOT EXISTS risk_links_org_source_vendor_idx
        ON verifywise.risk_links (organization_id, source_vendor_risk_id)
        WHERE source_vendor_risk_id IS NOT NULL;
    `);
    await queryInterface.sequelize.query(`
      CREATE INDEX IF NOT EXISTS risk_links_org_target_vendor_idx
        ON verifywise.risk_links (organization_id, target_vendor_risk_id)
        WHERE target_vendor_risk_id IS NOT NULL;
    `);
  },

  async down(queryInterface) {
    // Drops vendor pairs: source_risk_id cannot go back to NOT NULL while they
    // exist, and there is no project risk to point them at.
    await queryInterface.sequelize.query(`
      DELETE FROM verifywise.risk_links WHERE source_vendor_risk_id IS NOT NULL;
    `);
    await queryInterface.sequelize.query(`
      DROP INDEX IF EXISTS verifywise.risk_links_org_target_vendor_idx;
      DROP INDEX IF EXISTS verifywise.risk_links_org_source_vendor_idx;
      DROP INDEX IF EXISTS verifywise.risk_links_unique_vendor_pair;
      ALTER TABLE verifywise.risk_links
        DROP CONSTRAINT IF EXISTS risk_links_cross_entity_inherits,
        DROP CONSTRAINT IF EXISTS risk_links_vendor_pair,
        DROP CONSTRAINT IF EXISTS risk_links_one_source,
        DROP COLUMN IF EXISTS source_vendor_risk_id,
        ALTER COLUMN source_risk_id SET NOT NULL,
        ADD CONSTRAINT risk_links_cross_entity_inherits CHECK (
          target_risk_id IS NOT NULL OR relation_type = 'inherits_from'
        );
    `);
  },
};
