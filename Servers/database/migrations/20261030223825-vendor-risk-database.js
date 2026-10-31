"use strict";

/**
 * Vendor research: the vendor risk database (VRDB), public records mirrored from official sources
 * (see services/vendorResearch/vrdb/).
 *
 * Four shared tables, without organization_id: they hold no tenant data and are written only by
 * the sync job and the run-time lookup.
 * - `vrdb_sources`: one row per source, upserted from vrdb/sources.ts at every sync, so that code
 *   review owns the metadata and the row holds the sync state. Staleness is computed from
 *   `last_success_at`, not stored; `last_error` is a fixed code, never a message.
 * - `vrdb_records`: the records of the sources, one row per record of a source, with the typed
 *   match keys of the record (`name:…`, `kev:…`, `domain:…`) under a GIN index. A record that left
 *   its list keeps its row with another status. Only entities of the sanctions lists are stored;
 *   the raw files are hashed, not kept.
 * - `vrdb_sync_runs`: one row per sync attempt, kept 90 days by the code; `outcome` is NULL while
 *   the sync runs.
 * - `vrdb_lookups`: the stored answers of the read-through sources (vendor risk database M2).
 *
 * One tenant-scoped table: `vendor_vrdb_matches`, the records a vendor of an organization matched,
 * with the method and strength of the match. The unique index leads with organization_id, so it
 * serves the cascade from a deleted organization and the lookups of one vendor in one
 * organization; a deleted vendor and a deleted record need an index of their own.
 */

const list = (values) => values.map((value) => `'${value}'`).join(", ");

const ACCESS_MODES = ["mirror", "read_through"];
const SOURCE_OUTCOMES = ["ok", "unchanged", "failed", "never"];
const SYNC_OUTCOMES = ["ok", "unchanged", "failed"];
const RECORD_STATUSES = ["active", "withdrawn", "rejected", "delisted"];
const MATCH_METHODS = [
  "kev_vendor",
  "cve_affected_vendor",
  "nvd_cpe_vendor",
  "sec_cik",
  "domain",
  "identifier",
  "name_exact",
];
const MATCH_STRENGTHS = ["strong", "weak"];

module.exports = {
  async up(queryInterface) {
    const transaction = await queryInterface.sequelize.transaction();
    try {
      const statements = [
        `CREATE TABLE IF NOT EXISTS verifywise.vrdb_sources (
          id VARCHAR(40) PRIMARY KEY,
          name TEXT NOT NULL,
          operator TEXT NOT NULL,
          access_mode VARCHAR(20) NOT NULL,
          documentation_url TEXT NOT NULL,
          licence TEXT NOT NULL,
          attribution TEXT NOT NULL,
          stale_after_hours INTEGER NOT NULL,
          last_attempt_at TIMESTAMPTZ,
          last_success_at TIMESTAMPTZ,
          last_outcome VARCHAR(20) NOT NULL DEFAULT 'never',
          last_error VARCHAR(60),
          source_version TEXT,
          etag TEXT,
          last_modified TEXT,
          cursor JSONB,
          active_records INTEGER NOT NULL DEFAULT 0,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          CONSTRAINT vrdb_sources_access_mode_check
            CHECK (access_mode IN (${list(ACCESS_MODES)})),
          CONSTRAINT vrdb_sources_last_outcome_check
            CHECK (last_outcome IN (${list(SOURCE_OUTCOMES)}))
        );`,
        `CREATE TABLE IF NOT EXISTS verifywise.vrdb_records (
          id BIGSERIAL PRIMARY KEY,
          source_id VARCHAR(40) NOT NULL
            REFERENCES verifywise.vrdb_sources(id) ON DELETE CASCADE,
          source_record_id VARCHAR(200) NOT NULL,
          record_type VARCHAR(30) NOT NULL,
          status VARCHAR(20) NOT NULL,
          status_changed_at TIMESTAMPTZ,
          title TEXT NOT NULL,
          summary TEXT NOT NULL,
          url TEXT NOT NULL,
          identifiers JSONB NOT NULL,
          match_keys TEXT[] NOT NULL,
          published_at TIMESTAMPTZ,
          source_updated_at TIMESTAMPTZ,
          retrieved_at TIMESTAMPTZ NOT NULL,
          content_hash CHAR(64) NOT NULL,
          raw_snapshot_hash CHAR(64) NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          CONSTRAINT vrdb_records_source_record_uniq UNIQUE (source_id, source_record_id),
          CONSTRAINT vrdb_records_status_check CHECK (status IN (${list(RECORD_STATUSES)}))
        );`,
        `CREATE INDEX IF NOT EXISTS idx_vrdb_records_source_status
           ON verifywise.vrdb_records (source_id, status);`,
        `CREATE INDEX IF NOT EXISTS idx_vrdb_records_match_keys
           ON verifywise.vrdb_records USING GIN (match_keys);`,
        `CREATE TABLE IF NOT EXISTS verifywise.vrdb_sync_runs (
          id SERIAL PRIMARY KEY,
          source_id VARCHAR(40) NOT NULL
            REFERENCES verifywise.vrdb_sources(id) ON DELETE CASCADE,
          started_at TIMESTAMPTZ NOT NULL,
          finished_at TIMESTAMPTZ,
          outcome VARCHAR(20),
          error_code VARCHAR(60),
          bytes INTEGER,
          records_seen INTEGER,
          inserted INTEGER,
          updated INTEGER,
          status_changed INTEGER,
          raw_snapshot_hash CHAR(64),
          duration_ms INTEGER,
          CONSTRAINT vrdb_sync_runs_outcome_check CHECK (outcome IN (${list(SYNC_OUTCOMES)}))
        );`,
        `CREATE INDEX IF NOT EXISTS idx_vrdb_sync_runs_source_started
           ON verifywise.vrdb_sync_runs (source_id, started_at DESC);`,
        `CREATE TABLE IF NOT EXISTS verifywise.vrdb_lookups (
          source_id VARCHAR(40) NOT NULL
            REFERENCES verifywise.vrdb_sources(id) ON DELETE CASCADE,
          lookup_key TEXT NOT NULL,
          fetched_at TIMESTAMPTZ NOT NULL,
          expires_at TIMESTAMPTZ NOT NULL,
          outcome VARCHAR(20) NOT NULL,
          record_count INTEGER NOT NULL DEFAULT 0,
          PRIMARY KEY (source_id, lookup_key)
        );`,
        `CREATE TABLE IF NOT EXISTS verifywise.vendor_vrdb_matches (
          id SERIAL PRIMARY KEY,
          organization_id INTEGER NOT NULL REFERENCES verifywise.organizations(id) ON DELETE CASCADE,
          vendor_id INTEGER NOT NULL REFERENCES verifywise.vendors(id) ON DELETE CASCADE,
          record_id BIGINT NOT NULL REFERENCES verifywise.vrdb_records(id) ON DELETE CASCADE,
          match_method VARCHAR(30) NOT NULL,
          match_strength VARCHAR(10) NOT NULL,
          matched_key TEXT NOT NULL,
          first_matched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          last_matched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          CONSTRAINT vendor_vrdb_matches_record_uniq UNIQUE (organization_id, vendor_id, record_id),
          CONSTRAINT vendor_vrdb_matches_method_check
            CHECK (match_method IN (${list(MATCH_METHODS)})),
          CONSTRAINT vendor_vrdb_matches_strength_check
            CHECK (match_strength IN (${list(MATCH_STRENGTHS)}))
        );`,
        `CREATE INDEX IF NOT EXISTS idx_vendor_vrdb_matches_vendor
           ON verifywise.vendor_vrdb_matches (vendor_id);`,
        `CREATE INDEX IF NOT EXISTS idx_vendor_vrdb_matches_record
           ON verifywise.vendor_vrdb_matches (record_id);`,
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
      for (const table of [
        "vendor_vrdb_matches",
        "vrdb_lookups",
        "vrdb_sync_runs",
        "vrdb_records",
        "vrdb_sources",
      ]) {
        await queryInterface.sequelize.query(`DROP TABLE IF EXISTS verifywise.${table};`, {
          transaction,
        });
      }
      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  },
};
