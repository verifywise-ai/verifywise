"use strict";

/**
 * Vendor research: the scheduled scan, and the memory of the sources it has read.
 *
 * - `vendor_research_runs.trigger_type` also takes `scheduled`: a run that the scan started. The
 *   CHECK constraint came with the table and has a name Postgres chose, so it is found by what it
 *   checks.
 * - `vendor_research_settings.scan_interval_days`: the days the scan lets pass before it researches
 *   a vendor of the organization again. NULL is off, and is what every organization has until an
 *   administrator chooses. The application accepts 7, 14 and 30; the column takes any whole number
 *   of days up to a year, so that a new choice is not a migration.
 * - `vendor_research_sources`: one row for each document (the key is `sourceKey` of
 *   services/webResearch/urlCanon.ts) that a completed run showed to the model, so that a scheduled
 *   run can analyse the sources that are new. Tenant-scoped: deleting the organization or the vendor
 *   deletes its rows, and deleting the run that first saw a source only forgets which run it was.
 *
 * The indexes behind the foreign keys follow 20261011025519-vendor-research-fk-indexes.js. The
 * unique index leads with organization_id, so it serves the cascade from a deleted organization and
 * the lookups of one vendor in one organization; a deleted vendor and a deleted run need an index
 * of their own.
 */

const TRIGGERS_BEFORE = ["auto", "manual"];
const TRIGGERS_AFTER = [...TRIGGERS_BEFORE, "scheduled"];

const list = (values) => values.map((value) => `'${value}'`).join(", ");

const replaceTriggerConstraint = async (queryInterface, triggers, transaction) => {
  await queryInterface.sequelize.query(
    `
    DO $$
    DECLARE found RECORD;
    BEGIN
      FOR found IN
        SELECT conname FROM pg_constraint
        WHERE conrelid = 'verifywise.vendor_research_runs'::regclass
          AND contype = 'c'
          AND pg_get_constraintdef(oid) LIKE '%trigger_type%'
      LOOP
        EXECUTE format('ALTER TABLE verifywise.vendor_research_runs DROP CONSTRAINT %I', found.conname);
      END LOOP;
    END $$;
  `,
    { transaction },
  );
  await queryInterface.sequelize.query(
    `ALTER TABLE verifywise.vendor_research_runs
       ADD CONSTRAINT vendor_research_runs_trigger_type_check
       CHECK (trigger_type IN (${list(triggers)}));`,
    { transaction },
  );
};

module.exports = {
  async up(queryInterface) {
    const transaction = await queryInterface.sequelize.transaction();
    try {
      await replaceTriggerConstraint(queryInterface, TRIGGERS_AFTER, transaction);

      await queryInterface.sequelize.query(
        `ALTER TABLE verifywise.vendor_research_settings
           ADD COLUMN IF NOT EXISTS scan_interval_days SMALLINT
           CONSTRAINT vendor_research_settings_scan_interval_check
           CHECK (scan_interval_days IS NULL OR scan_interval_days BETWEEN 1 AND 365);`,
        { transaction },
      );

      const statements = [
        `CREATE TABLE IF NOT EXISTS verifywise.vendor_research_sources (
          id SERIAL PRIMARY KEY,
          organization_id INTEGER NOT NULL REFERENCES verifywise.organizations(id) ON DELETE CASCADE,
          vendor_id INTEGER NOT NULL REFERENCES verifywise.vendors(id) ON DELETE CASCADE,
          source_key TEXT NOT NULL,
          first_seen_run_id INTEGER REFERENCES verifywise.vendor_research_runs(id) ON DELETE SET NULL,
          first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          CONSTRAINT vendor_research_sources_key_uniq
            UNIQUE (organization_id, vendor_id, source_key)
        );`,
        `CREATE INDEX IF NOT EXISTS idx_vendor_research_sources_vendor
           ON verifywise.vendor_research_sources (vendor_id);`,
        `CREATE INDEX IF NOT EXISTS idx_vendor_research_sources_first_run
           ON verifywise.vendor_research_sources (first_seen_run_id);`,
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
    const transaction = await queryInterface.sequelize.transaction();
    try {
      await queryInterface.sequelize.query(
        "DROP TABLE IF EXISTS verifywise.vendor_research_sources;",
        { transaction },
      );
      await queryInterface.sequelize.query(
        "ALTER TABLE verifywise.vendor_research_settings DROP COLUMN IF EXISTS scan_interval_days;",
        { transaction },
      );
      // The old constraint knows two triggers. A scheduled run was started by the system, as an
      // automatic one is, so it becomes one: the run and its findings stay.
      await queryInterface.sequelize.query(
        "UPDATE verifywise.vendor_research_runs SET trigger_type = 'auto' WHERE trigger_type = 'scheduled';",
        { transaction },
      );
      await replaceTriggerConstraint(queryInterface, TRIGGERS_BEFORE, transaction);
      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  },
};
