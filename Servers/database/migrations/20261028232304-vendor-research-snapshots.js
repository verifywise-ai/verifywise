"use strict";

/**
 * Vendor research: the pages where a vendor states its terms, kept from one run to the next.
 *
 * `vendor_research_snapshots` holds one row for each such page of a vendor (its terms, privacy
 * policy, data processing addendum, list of subprocessors or security page; see
 * services/vendorResearch/policySnapshots.ts): the text of the page as the last completed run read
 * it. The next run compares what it reads with the text kept, and a page that changed becomes a
 * source of its own for the analysis. The text is normalized line by line and bounded to 100,000
 * characters by the code, not by the DDL.
 *
 * - `page_key` is the identity of the document (`sourceKey` of services/webResearch/urlCanon.ts).
 * - `captured_at` is when the text kept last changed, `last_seen_at` is the last run that read the
 *   page with that text, and `first_seen_at` is the first run that read the page at all.
 * - Tenant-scoped: deleting the organization or the vendor deletes its rows, and deleting the run
 *   that captured a text only forgets which run it was.
 *
 * The unique index leads with organization_id, so it serves the cascade from a deleted
 * organization and the lookups of one vendor in one organization; a deleted vendor and a deleted
 * run need an index of their own (see 20261011025519-vendor-research-fk-indexes.js).
 */

const KINDS = ["terms", "privacy", "dpa", "subprocessors", "security"];

module.exports = {
  async up(queryInterface) {
    const transaction = await queryInterface.sequelize.transaction();
    try {
      const statements = [
        `CREATE TABLE IF NOT EXISTS verifywise.vendor_research_snapshots (
          id SERIAL PRIMARY KEY,
          organization_id INTEGER NOT NULL REFERENCES verifywise.organizations(id) ON DELETE CASCADE,
          vendor_id INTEGER NOT NULL REFERENCES verifywise.vendors(id) ON DELETE CASCADE,
          page_key TEXT NOT NULL,
          url TEXT NOT NULL,
          kind VARCHAR(20) NOT NULL,
          title TEXT NOT NULL DEFAULT '',
          text_hash VARCHAR(64) NOT NULL,
          body TEXT NOT NULL,
          captured_run_id INTEGER REFERENCES verifywise.vendor_research_runs(id) ON DELETE SET NULL,
          first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          CONSTRAINT vendor_research_snapshots_page_uniq
            UNIQUE (organization_id, vendor_id, page_key),
          CONSTRAINT vendor_research_snapshots_kind_check
            CHECK (kind IN (${KINDS.map((kind) => `'${kind}'`).join(", ")}))
        );`,
        `CREATE INDEX IF NOT EXISTS idx_vendor_research_snapshots_vendor
           ON verifywise.vendor_research_snapshots (vendor_id);`,
        `CREATE INDEX IF NOT EXISTS idx_vendor_research_snapshots_run
           ON verifywise.vendor_research_snapshots (captured_run_id);`,
      ];
      for (const statement of statements) {
        await queryInterface.sequelize.query(statement, { transaction });
      }
      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(
      "DROP TABLE IF EXISTS verifywise.vendor_research_snapshots;",
    );
  },
};
