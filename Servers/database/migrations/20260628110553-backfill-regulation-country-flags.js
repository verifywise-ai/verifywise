"use strict";

/**
 * Backfill the `flag` field into existing regulation_countries.data rows.
 *
 * Installs seeded before the snapshot carried per-country flags have
 * data->>'flag' = NULL, so every page that derives a flag from the catalog
 * (Browse, Tracked, Deadlines enrichment, etc.) renders the globe fallback.
 * The current seed snapshot DOES include a top-level `flag` for all countries,
 * so we re-read it and patch the flag into any row that is missing it.
 *
 * Idempotent: only updates rows whose data->>'flag' is NULL/empty, and only
 * for slugs present in the snapshot with a flag. Re-running is a no-op once
 * flags are present. Does NOT touch the hash (flag is presentation-only and
 * not part of the change-detection contract), so it cannot trigger spurious
 * change notifications on the next sync.
 */
const fs = require("fs");
const path = require("path");

module.exports = {
  async up(queryInterface) {
    const snapshotPath = path.join(__dirname, "../seeds/regulations-tracker-snapshot.json");
    if (!fs.existsSync(snapshotPath)) {
      // Flags are presentation-only; a missing snapshot should not fail the whole
      // migration run. Skip gracefully — the next daily sync re-derives flags.
      console.warn(
        `[backfill-flags] snapshot not found at ${snapshotPath}; skipping flag backfill (sync will re-derive).`,
      );
      return;
    }
    const snapshot = JSON.parse(fs.readFileSync(snapshotPath, "utf8"));

    for (const c of snapshot.countries) {
      if (!c.flag) continue; // nothing to backfill for this country
      await queryInterface.sequelize.query(
        `UPDATE verifywise.regulation_countries
            SET data = jsonb_set(COALESCE(data, '{}'::jsonb), '{flag}', to_jsonb(:flag::text), true)
          WHERE slug = :slug
            AND ((data->>'flag') IS NULL OR (data->>'flag') = '')`,
        { replacements: { slug: c.slug, flag: c.flag } },
      );
    }
  },

  async down() {
    // No-op: removing a presentation-only flag would regress the UI and the
    // flag is harmless. Down is intentionally a no-op.
  },
};
