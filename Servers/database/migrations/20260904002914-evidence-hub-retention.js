"use strict";

/**
 * Evidence Hub — retention policy.
 *
 * evidence_hub_org_settings: org-wide Evidence Hub configuration. One row
 * per org, lazily created — a missing row means defaults (no org-level
 * default retention period, archival off). Follows the mrm_org_settings
 * pattern.
 *
 * default_retention_period: applied at create/update time when a record has
 * neither an explicit expiry_date nor its own retention_policy. NULL means
 * "no default" — records without any retention configuration keep
 * expiry_date NULL, which is treated as "no expiry" everywhere (never
 * flagged expired, never notified, never archived).
 *
 * archive_on_expiry: opt-in soft-archival of expired records (sets
 * archived_at; never deletes). Requires the env flag
 * EVIDENCE_RETENTION_ARCHIVE_ENABLED=true as well — both gates default off.
 *
 * evidence_hub.expired_at / expiry_notified_at / archived_at: state written
 * by the daily evidence_expiry_sweep BullMQ job. expired_at flags the record
 * as expired (NULL = not expired); expiry_notified_at dedups the one-time
 * expiry notification; archived_at is the soft-archive marker.
 *
 * idx_evidence_hub_org_expiry: the sweep scans
 * (organization_id, expiry_date < now(), expired_at IS NULL); no existing
 * index serves that org + expiry-range scan.
 *
 * Tenant-scoped by organization_id.
 */
module.exports = {
  async up(queryInterface) {
    const transaction = await queryInterface.sequelize.transaction();
    try {
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

      await queryInterface.sequelize.query(
        `
        ALTER TABLE verifywise.evidence_hub
          ADD COLUMN IF NOT EXISTS expired_at TIMESTAMP NULL,
          ADD COLUMN IF NOT EXISTS expiry_notified_at TIMESTAMP NULL,
          ADD COLUMN IF NOT EXISTS archived_at TIMESTAMP NULL;
      `,
        { transaction },
      );

      await queryInterface.sequelize.query(
        `
        CREATE INDEX IF NOT EXISTS idx_evidence_hub_org_expiry
          ON verifywise.evidence_hub(organization_id, expiry_date);
      `,
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
      await queryInterface.sequelize.query(
        "DROP INDEX IF EXISTS verifywise.idx_evidence_hub_org_expiry;",
        { transaction },
      );
      await queryInterface.sequelize.query(
        `
        ALTER TABLE verifywise.evidence_hub
          DROP COLUMN IF EXISTS expired_at,
          DROP COLUMN IF EXISTS expiry_notified_at,
          DROP COLUMN IF EXISTS archived_at;
      `,
        { transaction },
      );
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
};
