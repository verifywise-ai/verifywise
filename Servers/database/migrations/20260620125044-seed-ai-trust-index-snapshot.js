"use strict";
// Day-one seed: populate ai_trust_index_apps from a committed feed snapshot so a
// fresh install shows Trust Index data immediately (offline/airgap-safe). Only
// seeds when the table is empty; the weekly cron refreshes it thereafter.
const path = require("path");
const fs = require("fs");
const { computeHashes } = require("../../dist/utils/aiTrustIndexHash");

module.exports = {
  async up(queryInterface) {
    const existing = await queryInterface.sequelize.query(
      "SELECT 1 FROM verifywise.ai_trust_index_apps LIMIT 1;",
      { type: queryInterface.sequelize.QueryTypes.SELECT },
    );
    if (existing.length) {
      console.log("[seed] ai_trust_index_apps not empty — skipping snapshot seed");
      return;
    }
    const snapshotPath = path.join(__dirname, "..", "seeds", "ai-trust-index-snapshot.json");
    const feed = JSON.parse(fs.readFileSync(snapshotPath, "utf8"));
    const apps = feed.apps || [];

    await queryInterface.sequelize.transaction(async (t) => {
      for (const app of apps) {
        const { materialHash, fullHash } = computeHashes(app);
        await queryInterface.sequelize.query(
          `INSERT INTO verifywise.ai_trust_index_apps
             (slug, name, vendor, category, letter_grade, score_out_of_100, data,
              material_hash, full_hash, is_active, last_changed_at, last_fetched_at)
           VALUES (:slug, :name, :vendor, :category, :grade, :score, :data::jsonb,
              :mh, :fh, TRUE, NOW(), NOW())
           ON CONFLICT (slug) DO NOTHING;`,
          {
            replacements: {
              slug: app.slug,
              name: app.name,
              vendor: app.vendor ?? null,
              category: app.category ?? null,
              grade: app.letterGrade ?? null,
              score: app.scoreOutOf100 ?? null,
              data: JSON.stringify(app),
              mh: materialHash,
              fh: fullHash,
            },
            transaction: t,
          },
        );
      }
      await queryInterface.sequelize.query(
        "UPDATE verifywise.ai_trust_index_meta SET seeded_at = NOW(), last_good_count = :n WHERE id = 1;",
        { replacements: { n: apps.length }, transaction: t },
      );
    });
    console.log(`[seed] inserted ${apps.length} AI Trust Index apps`);
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query("DELETE FROM verifywise.ai_trust_index_apps;");
    await queryInterface.sequelize.query(
      "UPDATE verifywise.ai_trust_index_meta SET seeded_at = NULL, last_good_count = NULL WHERE id = 1;",
    );
  },
};
