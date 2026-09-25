"use strict";

/**
 * Move expiry + retention from evidence_hub to files. files becomes the
 * single source of truth for evidence lifecycle — every file (evidence for
 * models/trainings via evidence_hub, evidence for controls/subclauses/etc.
 * via direct file_entity_links, or a bare upload) gets the same lifecycle
 * columns and the same sweep coverage.
 *
 * files.retention_policy: new column, typed as verifywise.enum_retention_policy
 * (a real Postgres ENUM, not VARCHAR+CHECK — matches the codebase convention
 * used by every other enum-shaped field in the schema; the outgoing
 * evidence_hub_org_settings.default_retention_period was a VARCHAR+CHECK
 * deviation that this migration corrects).
 *
 * BACKFILL. Before dropping evidence_hub.expiry_date / retention_policy,
 * their values are copied onto linked files via file_entity_links (only
 * where the file does not already have a value).
 *   - expiry_date: earliest expiry wins on many-to-many. TIMESTAMP → DATE
 *     cast truncates the time component (retention is day-granularity).
 *   - retention_policy: shortest canonical period wins on many-to-many,
 *     ordered by real duration (not alphabetical). Only values in the
 *     canonical set are backfilled; historical garbage (evidence_hub had
 *     no CHECK) is silently dropped rather than blowing up the cast to
 *     the new enum type.
 *   - Tenant-safe: files.organization_id is authoritative; a link whose
 *     organization_id disagrees with its file's is skipped.
 *
 * evidence_hub retention machinery removed after backfill:
 *   - columns: expiry_date, retention_policy, expired_at,
 *     expiry_notified_at, archived_at
 *   - index: idx_evidence_hub_org_expiry
 *   - table: evidence_hub_org_settings
 *
 * verifywise.enum_notification_type gets a new 'file_expiring' value for
 * the new file-level sweep to use. Added inline (not a separate migration)
 * because nothing in this migration USES the value — the constraint on
 * ALTER TYPE ADD VALUE only applies when the same transaction references
 * the new value in a subsequent statement.
 *
 * The 'evidence_expired' value on the same enum (added by 20260904013000)
 * becomes dead-but-harmless after this migration + the follow-on code
 * cleanup. Removing a Postgres enum value requires recreating the type and
 * migrating every column that uses it — not worth the risk. Left in place.
 */
module.exports = {
  async up(queryInterface) {
    const transaction = await queryInterface.sequelize.transaction();
    try {
      // 1a. Add the 'file_expiring' notification type for the new sweep.
      //     Safe inside this transaction because no other statement here
      //     uses the value.
      await queryInterface.sequelize.query(
        `ALTER TYPE verifywise.enum_notification_type
           ADD VALUE IF NOT EXISTS 'file_expiring';`,
        { transaction },
      );

      // 1b. Create the retention_policy enum type (real Postgres ENUM,
      //     matches the codebase convention). Idempotent via DO block since
      //     CREATE TYPE has no IF NOT EXISTS.
      await queryInterface.sequelize.query(
        `
        DO $$
        BEGIN
          IF NOT EXISTS (
            SELECT 1 FROM pg_type t
              JOIN pg_namespace n ON n.oid = t.typnamespace
             WHERE t.typname = 'enum_retention_policy'
               AND n.nspname = 'verifywise'
          ) THEN
            CREATE TYPE verifywise.enum_retention_policy AS ENUM (
              '30_days', '90_days', '6_months', '1_year',
              '3_years', '5_years', '7_years', 'indefinite'
            );
          END IF;
        END$$;
      `,
        { transaction },
      );

      // 2. Add files.retention_policy typed to the new enum.
      await queryInterface.sequelize.query(
        `
        ALTER TABLE verifywise.files
          ADD COLUMN IF NOT EXISTS retention_policy verifywise.enum_retention_policy NULL;
      `,
        { transaction },
      );

      // 3. Backfill files.expiry_date from linked evidence_hub records.
      //    Earliest expiry wins when a file backs multiple evidence records.
      //    Only writes where files.expiry_date is currently NULL.
      //    Tenant-safe via files.organization_id match.
      await queryInterface.sequelize.query(
        `
        UPDATE verifywise.files f
           SET expiry_date = sub.min_expiry
          FROM (
            SELECT fel.file_id,
                   fel.organization_id AS link_org_id,
                   MIN(eh.expiry_date::date) AS min_expiry
              FROM verifywise.file_entity_links fel
              JOIN verifywise.evidence_hub eh ON eh.id = fel.entity_id
             WHERE fel.framework_type = 'evidence_hub'
               AND fel.entity_type = 'evidence'
               AND eh.expiry_date IS NOT NULL
             GROUP BY fel.file_id, fel.organization_id
          ) sub
         WHERE f.id = sub.file_id
           AND f.organization_id = sub.link_org_id
           AND f.expiry_date IS NULL;
      `,
        { transaction },
      );

      // 4. Backfill files.retention_policy from linked evidence_hub records.
      //    Shortest canonical duration wins (not alphabetical). Cast VARCHAR
      //    → enum requires the value be in the canonical set; the WHERE
      //    filter ensures we never try to cast garbage (evidence_hub had no
      //    CHECK, so historical data may contain non-canonical strings —
      //    those are silently dropped rather than aborting the migration).
      //    Same tenant-safety guard as step 3.
      await queryInterface.sequelize.query(
        `
        UPDATE verifywise.files f
           SET retention_policy = sub.shortest_retention::verifywise.enum_retention_policy
          FROM (
            SELECT DISTINCT ON (fel.file_id)
                   fel.file_id,
                   fel.organization_id AS link_org_id,
                   eh.retention_policy AS shortest_retention
              FROM verifywise.file_entity_links fel
              JOIN verifywise.evidence_hub eh ON eh.id = fel.entity_id
             WHERE fel.framework_type = 'evidence_hub'
               AND fel.entity_type = 'evidence'
               AND eh.retention_policy IN (
                 '30_days', '90_days', '6_months', '1_year',
                 '3_years', '5_years', '7_years', 'indefinite'
               )
             ORDER BY fel.file_id,
                      CASE eh.retention_policy
                        WHEN '30_days'    THEN 1
                        WHEN '90_days'    THEN 2
                        WHEN '6_months'   THEN 3
                        WHEN '1_year'     THEN 4
                        WHEN '3_years'    THEN 5
                        WHEN '5_years'    THEN 6
                        WHEN '7_years'    THEN 7
                        WHEN 'indefinite' THEN 8
                      END ASC
          ) sub
         WHERE f.id = sub.file_id
           AND f.organization_id = sub.link_org_id
           AND f.retention_policy IS NULL;
      `,
        { transaction },
      );

      // 5. Drop the sweep-support index on the outgoing evidence_hub.expiry_date.
      await queryInterface.sequelize.query(
        "DROP INDEX IF EXISTS verifywise.idx_evidence_hub_org_expiry;",
        { transaction },
      );

      // 6. Drop lifecycle columns from evidence_hub.
      await queryInterface.sequelize.query(
        `
        ALTER TABLE verifywise.evidence_hub
          DROP COLUMN IF EXISTS expiry_date,
          DROP COLUMN IF EXISTS retention_policy,
          DROP COLUMN IF EXISTS expired_at,
          DROP COLUMN IF EXISTS expiry_notified_at,
          DROP COLUMN IF EXISTS archived_at;
      `,
        { transaction },
      );

      // 7. Drop the org-level defaults table.
      await queryInterface.sequelize.query(
        "DROP TABLE IF EXISTS verifywise.evidence_hub_org_settings CASCADE;",
        { transaction },
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
      // Recreate evidence_hub_org_settings.
      await queryInterface.sequelize.query(
        `
        CREATE TABLE IF NOT EXISTS verifywise.evidence_hub_org_settings (
          organization_id INTEGER PRIMARY KEY
            REFERENCES verifywise.organizations(id) ON DELETE CASCADE,
          default_retention_period VARCHAR(100) NULL
            CHECK (
              default_retention_period IS NULL OR default_retention_period IN (
                '30_days', '90_days', '6_months', '1_year',
                '3_years', '5_years', '7_years', 'indefinite'
              )
            ),
          archive_on_expiry BOOLEAN NOT NULL DEFAULT false,
          created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
          updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
        );
      `,
        { transaction },
      );

      // Restore evidence_hub lifecycle columns (as NULL — down does not
      // reverse the backfill; the copied values remain on files).
      await queryInterface.sequelize.query(
        `
        ALTER TABLE verifywise.evidence_hub
          ADD COLUMN IF NOT EXISTS expiry_date TIMESTAMP NULL,
          ADD COLUMN IF NOT EXISTS retention_policy VARCHAR(100) NULL,
          ADD COLUMN IF NOT EXISTS expired_at TIMESTAMP NULL,
          ADD COLUMN IF NOT EXISTS expiry_notified_at TIMESTAMP NULL,
          ADD COLUMN IF NOT EXISTS archived_at TIMESTAMP NULL;
      `,
        { transaction },
      );

      // Restore sweep-support index.
      await queryInterface.sequelize.query(
        `
        CREATE INDEX IF NOT EXISTS idx_evidence_hub_org_expiry
          ON verifywise.evidence_hub(organization_id, expiry_date);
      `,
        { transaction },
      );

      // Drop the files column BEFORE the enum type (the type cannot be
      // dropped while a column still references it).
      await queryInterface.sequelize.query(
        "ALTER TABLE verifywise.files DROP COLUMN IF EXISTS retention_policy;",
        { transaction },
      );

      await queryInterface.sequelize.query(
        "DROP TYPE IF EXISTS verifywise.enum_retention_policy;",
        { transaction },
      );

      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  },
};
