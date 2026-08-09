"use strict";

/**
 * Follow-up to 20260805131033-migrate-framework-data: rewrite legacy
 * file_entity_links rows that were written by the plugin marketplace
 * against `framework_type=<plugin_key>` + `entity_type='level{2,3}_impl'`.
 *
 * Two failure modes are recovered here:
 *
 *   1. Rows the original migration correctly translated (framework_type
 *      matches the impl's owning plugin) — a second run of this migration
 *      is a no-op because the INSERT is `ON CONFLICT ... DO NOTHING`.
 *
 *   2. Rows with a bogus framework_type (e.g. a legacy plugin bug wrote
 *      `pci-dss-lite` on file links that actually belong to ai-ethics or
 *      data-governance controls). The 08-05 migration deliberately skipped
 *      these because `entity_id` isn't in the pci-dss-lite impl-id map.
 *      This migration finds the ACTUAL owning plugin by joining entity_id
 *      → custom_framework_level2_impl → custom_framework_projects →
 *      custom_frameworks, then rewrites via that plugin's structure.
 *
 * Successfully-rewritten legacy rows are DELETED at the end of the run.
 * Rows that couldn't be rewritten (dangling entity_id, unknown plugin,
 * or missing new impl) are LEFT IN PLACE so an operator can inspect
 * them. Down is a no-op — legacy source data lives in
 * custom_framework_* tables regardless.
 */

const { FRAMEWORK_STRUCTURES } = require("../../dist/structures");

// Same alias table as 20260805131033-migrate-framework-data.js. Kept in
// sync manually — the fix migration needs the reverse direction (legacy →
// structure key) to look up which structure serves a given plugin_key.
const LEGACY_KEY_ALIAS = {
  "pci-dss": "pci-dss-lite",
};

function findStructureForPluginKey(pluginKey) {
  return (
    FRAMEWORK_STRUCTURES.find((fw) => fw.key === pluginKey) ||
    FRAMEWORK_STRUCTURES.find((fw) => LEGACY_KEY_ALIAS[fw.key] === pluginKey) ||
    null
  );
}

async function tableExists(sequelize, name, transaction) {
  const [rows] = await sequelize.query(
    `SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'verifywise' AND table_name = :name LIMIT 1`,
    { replacements: { name }, transaction },
  );
  return rows.length > 0;
}

module.exports = {
  async up(queryInterface) {
    const sequelize = queryInterface.sequelize;
    const transaction = await sequelize.transaction();

    try {
      console.log(`[fw:fix-fel] starting`);

      // Fresh install — no legacy tables, nothing to fix.
      if (!(await tableExists(sequelize, "custom_framework_definitions", transaction))) {
        console.log(`[fw:fix-fel] no legacy tables — nothing to fix.`);
        await transaction.commit();
        return;
      }

      // Get every legacy file_entity_links row (identified by
      // entity_type = 'level2_impl' / 'level3_impl'). We DON'T filter by
      // framework_type because the corruption we're recovering from is
      // precisely that the framework_type is wrong.
      const [orphanFels] = await sequelize.query(
        `SELECT id, organization_id, file_id, framework_type, entity_type,
                entity_id, link_type, created_by, created_at
           FROM verifywise.file_entity_links
          WHERE entity_type IN ('level2_impl', 'level3_impl');`,
        { transaction },
      );
      console.log(`[fw:fix-fel] found ${orphanFels.length} legacy-style file link(s)`);

      let rewrote = 0;
      let skippedNoImpl = 0;
      let skippedNoStructure = 0;
      let skippedNoNewImpl = 0;
      const rewrittenIds = [];

      for (const fel of orphanFels) {
        // Look up the ACTUAL owning plugin + struct location from the legacy
        // impl id. The plugin here may differ from fel.framework_type (bug
        // case #2).
        const legacyImplTable =
          fel.entity_type === "level2_impl"
            ? "custom_framework_level2_impl"
            : "custom_framework_level3_impl";

        let ownerInfo;
        if (fel.entity_type === "level2_impl") {
          const [rows] = await sequelize.query(
            `SELECT cf.plugin_key,
                    l1.title AS l1_title, l1.order_no AS l1_order,
                    l2.title AS l2_title, l2.order_no AS l2_order,
                    li.project_framework_id AS legacy_pf_id
               FROM verifywise.${legacyImplTable} li
               JOIN verifywise.custom_framework_projects cfp
                 ON cfp.id = li.project_framework_id
               JOIN verifywise.custom_frameworks cf
                 ON cf.id = cfp.framework_id
               JOIN verifywise.custom_framework_level2_struct l2
                 ON l2.id = li.level2_id
               JOIN verifywise.custom_framework_level1_struct l1
                 ON l1.id = l2.level1_id
              WHERE li.id = :eid
              LIMIT 1;`,
            { replacements: { eid: fel.entity_id }, transaction },
          );
          ownerInfo = rows[0];
        } else {
          const [rows] = await sequelize.query(
            `SELECT cf.plugin_key,
                    l1.title AS l1_title, l1.order_no AS l1_order,
                    l2.title AS l2_title, l2.order_no AS l2_order,
                    l3.title AS l3_title, l3.order_no AS l3_order,
                    l2i.project_framework_id AS legacy_pf_id
               FROM verifywise.custom_framework_level3_impl li
               JOIN verifywise.custom_framework_level3_struct l3
                 ON l3.id = li.level3_id
               JOIN verifywise.custom_framework_level2_impl l2i
                 ON l2i.id = li.level2_impl_id
               JOIN verifywise.custom_framework_level2_struct l2
                 ON l2.id = l2i.level2_id
               JOIN verifywise.custom_framework_level1_struct l1
                 ON l1.id = l2.level1_id
               JOIN verifywise.custom_framework_projects cfp
                 ON cfp.id = l2i.project_framework_id
               JOIN verifywise.custom_frameworks cf
                 ON cf.id = cfp.framework_id
              WHERE li.id = :eid
              LIMIT 1;`,
            { replacements: { eid: fel.entity_id }, transaction },
          );
          ownerInfo = rows[0];
        }

        if (!ownerInfo) {
          console.warn(
            `[fw:fix-fel] file_link id=${fel.id} entity_id=${fel.entity_id} (${fel.entity_type}) not found in legacy impl tables — skipping`,
          );
          skippedNoImpl++;
          continue;
        }

        const fixedFramework = findStructureForPluginKey(ownerInfo.plugin_key);
        if (!fixedFramework) {
          console.warn(
            `[fw:fix-fel] file_link id=${fel.id} owner plugin '${ownerInfo.plugin_key}' has no matching structure — skipping`,
          );
          skippedNoStructure++;
          continue;
        }

        const { tables, cols, entity_types, framework_type: newFrameworkType } = fixedFramework;
        const originallyWrong = fel.framework_type !== ownerInfo.plugin_key;

        // Look up the new impl_id via (plugin's projects_frameworks_id) +
        // (struct title/order_no match). One legacy impl row corresponds to
        // exactly one new impl row per (org, project, framework).
        let newImplRes;
        if (fel.entity_type === "level2_impl") {
          [newImplRes] = await sequelize.query(
            `SELECT i.id
               FROM verifywise.${tables.l2_impl} i
               JOIN verifywise.${tables.l2_struct} l2
                 ON l2.id = i.${cols.l2_impl_meta}
               JOIN verifywise.${tables.l1_struct} l1
                 ON l1.id = l2.${cols.l2_struct_parent}
               JOIN verifywise.projects_frameworks pf
                 ON pf.id = i.projects_frameworks_id
                AND pf.organization_id = i.organization_id
               JOIN verifywise.custom_framework_projects cfp
                 ON cfp.project_id = pf.project_id
              WHERE i.organization_id = :org
                AND cfp.id = :legacy_pf_id
                AND l1.title = :l1_t AND l1.order_no = :l1_o
                AND l2.title = :l2_t AND l2.order_no = :l2_o
              LIMIT 1;`,
            {
              replacements: {
                org: fel.organization_id,
                legacy_pf_id: ownerInfo.legacy_pf_id,
                l1_t: ownerInfo.l1_title,
                l1_o: ownerInfo.l1_order,
                l2_t: ownerInfo.l2_title,
                l2_o: ownerInfo.l2_order,
              },
              transaction,
            },
          );
        } else {
          [newImplRes] = await sequelize.query(
            `SELECT i.id
               FROM verifywise.${tables.l3_impl} i
               JOIN verifywise.${tables.l3_struct} l3
                 ON l3.id = i.${cols.l3_impl_meta}
               JOIN verifywise.${tables.l2_struct} l2
                 ON l2.id = l3.${cols.l3_struct_parent}
               JOIN verifywise.${tables.l1_struct} l1
                 ON l1.id = l2.${cols.l2_struct_parent}
               JOIN verifywise.projects_frameworks pf
                 ON pf.id = i.projects_frameworks_id
                AND pf.organization_id = i.organization_id
               JOIN verifywise.custom_framework_projects cfp
                 ON cfp.project_id = pf.project_id
              WHERE i.organization_id = :org
                AND cfp.id = :legacy_pf_id
                AND l1.title = :l1_t AND l1.order_no = :l1_o
                AND l2.title = :l2_t AND l2.order_no = :l2_o
                AND l3.title = :l3_t AND l3.order_no = :l3_o
              LIMIT 1;`,
            {
              replacements: {
                org: fel.organization_id,
                legacy_pf_id: ownerInfo.legacy_pf_id,
                l1_t: ownerInfo.l1_title,
                l1_o: ownerInfo.l1_order,
                l2_t: ownerInfo.l2_title,
                l2_o: ownerInfo.l2_order,
                l3_t: ownerInfo.l3_title,
                l3_o: ownerInfo.l3_order,
              },
              transaction,
            },
          );
        }

        if (newImplRes.length === 0) {
          console.warn(
            `[fw:fix-fel] file_link id=${fel.id} — new impl not found for ${ownerInfo.plugin_key} L2="${ownerInfo.l2_title}" (order=${ownerInfo.l2_order}). Was 20260805131033 run? Skipping.`,
          );
          skippedNoNewImpl++;
          continue;
        }

        const newImplId = newImplRes[0].id;
        const newEntityType =
          fel.entity_type === "level2_impl" ? entity_types.l2_impl : entity_types.l3_impl;

        await sequelize.query(
          `INSERT INTO verifywise.file_entity_links
             (organization_id, file_id, framework_type, entity_type, entity_id,
              link_type, created_by, created_at)
           VALUES (:org, :file, :ft, :et, :eid, :lt, :cb, :ca)
           ON CONFLICT (file_id, framework_type, entity_type, entity_id) DO NOTHING;`,
          {
            replacements: {
              org: fel.organization_id,
              file: fel.file_id,
              ft: newFrameworkType,
              et: newEntityType,
              eid: newImplId,
              lt: fel.link_type || "evidence",
              cb: fel.created_by,
              ca: fel.created_at,
            },
            transaction,
          },
        );

        console.log(
          `[fw:fix-fel] rewrote file=${fel.file_id}: ${fel.framework_type}/${fel.entity_type}/${fel.entity_id}` +
            ` → ${newFrameworkType}/${newEntityType}/${newImplId}` +
            (originallyWrong
              ? ` (framework_type corrected from '${fel.framework_type}' to owner plugin '${ownerInfo.plugin_key}')`
              : ""),
        );
        rewrote++;
        rewrittenIds.push(fel.id);
      }

      // Delete only the successfully-rewritten legacy rows. Skipped rows
      // stay so an operator can inspect why they didn't map.
      if (rewrittenIds.length > 0) {
        await sequelize.query(`DELETE FROM verifywise.file_entity_links WHERE id IN (:ids);`, {
          replacements: { ids: rewrittenIds },
          transaction,
        });
        console.log(`[fw:fix-fel] deleted ${rewrittenIds.length} legacy row(s) after rewriting`);
      }

      console.log(
        `[fw:fix-fel] done. rewrote=${rewrote} skipped: no-impl=${skippedNoImpl}, no-structure=${skippedNoStructure}, no-new-impl=${skippedNoNewImpl}`,
      );
      await transaction.commit();
    } catch (err) {
      console.error(`[fw:fix-fel] failed`, err);
      await transaction.rollback();
      throw err;
    }
  },

  async down() {
    // No-op. Legacy rows are still in place; the rewritten rows we added
    // are safe to leave (users can now see their files under the correct
    // framework). Rolling forward is preferred to rolling back.
  },
};
