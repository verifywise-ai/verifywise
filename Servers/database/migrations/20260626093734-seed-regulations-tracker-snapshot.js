"use strict";

/**
 * Seed the regulation_countries catalog from a committed snapshot on first
 * install. Idempotent: skips if the table is already populated. Establishes the
 * baseline so the first weekly sync detects no changes (no false notifications).
 */
const fs = require("fs");
const path = require("path");

module.exports = {
  async up(queryInterface) {
    const existing = await queryInterface.sequelize.query(
      "SELECT COUNT(*)::int AS n FROM verifywise.regulation_countries",
      { type: queryInterface.sequelize.QueryTypes.SELECT },
    );
    if (existing[0].n > 0) return; // already seeded

    const snapshotPath = path.join(__dirname, "../seeds/regulations-tracker-snapshot.json");
    const snapshot = JSON.parse(fs.readFileSync(snapshotPath, "utf8"));

    for (const c of snapshot.countries) {
      await queryInterface.sequelize.query(
        `INSERT INTO verifywise.regulation_countries
           (slug, name, region, regulation_count, data, hash, is_active, last_fetched_at)
         VALUES (:slug, :name, :region, :regulation_count, :data::jsonb, :hash, TRUE, NOW())
         ON CONFLICT (slug) DO NOTHING`,
        {
          replacements: {
            slug: c.slug,
            name: c.name,
            region: c.region ?? null,
            regulation_count: c.regulationCount ?? null,
            data: JSON.stringify(c),
            hash: c.hash,
          },
        },
      );
    }

    await queryInterface.sequelize.query(
      `UPDATE verifywise.regulation_tracker_meta
         SET seeded_at = NOW(), last_good_count = :count
       WHERE id = 1`,
      { replacements: { count: snapshot.countries.length } },
    );
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query("DELETE FROM verifywise.regulation_countries");
    await queryInterface.sequelize.query(
      "UPDATE verifywise.regulation_tracker_meta SET seeded_at = NULL, last_good_count = NULL WHERE id = 1",
    );
  },
};
