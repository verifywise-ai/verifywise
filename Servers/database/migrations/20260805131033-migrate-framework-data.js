"use strict";

/**
 * Step 3 — Migrate all user data (impl rows, risk links, file links) from
 * the legacy plugin tables into the new per-framework tables. One JS loop
 * per project, sharing an in-memory legacy→new impl id map so risks and
 * file links translate via a simple map lookup (no rebuild-via-SQL-join).
 *
 * Per legacy (org, project, framework):
 *   1. Get or create the projects_frameworks row.
 *   2. For each legacy L2 impl row:
 *        - insert new L2 impl row → remember new id in l2ImplIdMap
 *        - migrate its evidence_links / feedback_links JSONB into
 *          file_entity_links, pointing at the new impl id.
 *   3. (three-level only) Same for legacy L3 impl rows, using l2ImplIdMap
 *      to resolve the parent → l3ImplIdMap.
 *   4. Migrate legacy L2 / L3 risk-junction rows via the impl id maps.
 *
 * Legacy `file_entity_links` rows (written directly by the plugin against
 * `framework_type=<plugin_key>` + `entity_type='level{2,3}_impl'`) are
 * handled by the follow-up migration
 * `20260807142621-fix-legacy-file-entity-links.js`, which derives the
 * correct owning plugin from `entity_id` rather than trusting the possibly-
 * corrupt `framework_type` written by the legacy plugin.
 *
 * Legacy tables are NOT dropped. Down is a no-op — legacy source data still
 * holds everything, and truncating the new tables would destroy any user
 * activity that landed after up() ran.
 */

const { FRAMEWORK_STRUCTURES } = require("../../dist/structures");

// Legacy plugin_keys that don't match the new structure keys. Add an entry
// only when the two differ. Key = structure key (Servers/structures/), value =
// legacy plugin_key as stored in custom_framework_definitions.plugin_key.
//
// Historical note: pci-dss-lite was a stripped-down variant of the pci-dss
// framework shipped as its own plugin.
const LEGACY_KEY_ALIAS = {
  "pci-dss": "pci-dss-lite",
};

const VALID_STATUSES = new Set([
  "Not started",
  "Draft",
  "In progress",
  "Awaiting review",
  "Awaiting approval",
  "Implemented",
  "Audited",
  "Needs rework",
]);

function normalizeStatus(s) {
  return VALID_STATUSES.has(s) ? s : "Not started";
}

function parseFileId(link) {
  if (typeof link === "number") return link;
  if (typeof link === "string") {
    const n = parseInt(link, 10);
    return Number.isFinite(n) ? n : null;
  }
  if (link && typeof link === "object") {
    const n = Number(link.file_id ?? link.id);
    return Number.isFinite(n) ? n : null;
  }
  return null;
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
      console.log(`[fw:migrate-data] starting`);
      // Fresh install — nothing legacy to migrate.
      if (!(await tableExists(sequelize, "custom_framework_definitions", transaction))) {
        console.log(
          `[fw:migrate-data] no legacy custom_framework_definitions table — fresh install, nothing to migrate.`,
        );
        await transaction.commit();
        return;
      }

      // Pre-fetch lookup sets so we can skip dangling refs without an
      // extra SQL round-trip per row.
      const [userRows] = await sequelize.query(`SELECT id FROM verifywise.users;`, { transaction });
      const validUsers = new Set(userRows.map((u) => u.id));
      const coalesceUser = (id) => (id && validUsers.has(id) ? id : null);

      const [fileRows] = await sequelize.query(`SELECT id FROM verifywise.files;`, { transaction });
      const validFiles = new Set(fileRows.map((f) => f.id));

      const [riskRows] = await sequelize.query(`SELECT id FROM verifywise.risks;`, { transaction });
      const validRisks = new Set(riskRows.map((r) => r.id));

      // Pre-scan: any legacy plugin without a matching structure in
      // Servers/structures/ will have its data silently dropped. Surface those
      // keys up front so an operator can add the missing structure and rerun.
      const [allLegacyDefs] = await sequelize.query(
        `SELECT plugin_key FROM verifywise.custom_framework_definitions;`,
        { transaction },
      );
      const structureKeys = new Set(FRAMEWORK_STRUCTURES.map((fw) => fw.key));
      const knownLegacyKeys = new Set([...structureKeys, ...Object.values(LEGACY_KEY_ALIAS)]);
      const unmappable = allLegacyDefs
        .map((r) => r.plugin_key)
        .filter((k) => !knownLegacyKeys.has(k));
      if (unmappable.length > 0) {
        console.warn(
          `[migrate-framework-data] ${unmappable.length} legacy plugin(s) have no matching structure — data will NOT migrate: ${unmappable.join(", ")}`,
        );
      }

      for (const fw of FRAMEWORK_STRUCTURES) {
        // pluginKey = value we look up in legacy tables. Falls back to fw.key
        // unless overridden via LEGACY_KEY_ALIAS (e.g. pci-dss ← pci-dss-lite).
        const pluginKey = LEGACY_KEY_ALIAS[fw.key] || fw.key;
        if (pluginKey !== fw.key) {
          console.log(
            `[fw:migrate-data:${fw.key}] resolving legacy plugin_key '${pluginKey}' via alias`,
          );
        }
        const { id: frameworkId, framework_type, tables, cols, entity_types } = fw;
        const isThreeLevel = !!tables.l3_impl;

        // ---- Find the legacy definition for this plugin ----
        const [defRows] = await sequelize.query(
          `SELECT id FROM verifywise.custom_framework_definitions
            WHERE plugin_key = :key LIMIT 1;`,
          { replacements: { key: pluginKey }, transaction },
        );
        if (defRows.length === 0) continue;
        const legacyDefinitionId = defRows[0].id;
        console.log(
          `[fw:migrate-data:${pluginKey}] legacy definition found (id=${legacyDefinitionId})`,
        );

        // ---- Struct id maps: legacy_id -> new_id ----
        // Struct rows are matched by (title, order_no). Any legacy row that
        // doesn't match a new-seed row is a silent data-loss point — impls
        // hanging off that struct row won't migrate. logMissed() surfaces
        // those so an operator can reconcile before rerunning.
        const l1IdMap = new Map();
        {
          const [legacyL1] = await sequelize.query(
            `SELECT id, title, order_no
               FROM verifywise.custom_framework_level1_struct
              WHERE definition_id = :d;`,
            { replacements: { d: legacyDefinitionId }, transaction },
          );
          const [newL1] = await sequelize.query(
            `SELECT id, title, order_no
               FROM verifywise.${tables.l1_struct}
              WHERE framework_id = :fid;`,
            { replacements: { fid: frameworkId }, transaction },
          );
          const lookup = new Map(newL1.map((r) => [`${r.title}|${r.order_no}`, r.id]));
          const missed = [];
          for (const r of legacyL1) {
            const newId = lookup.get(`${r.title}|${r.order_no}`);
            if (newId) l1IdMap.set(r.id, newId);
            else missed.push(`"${r.title}" (order=${r.order_no})`);
          }
          logMissed(pluginKey, "L1", "no title/order_no match", missed);
        }

        const l2IdMap = new Map();
        {
          const [legacyL2] = await sequelize.query(
            `SELECT l2.id, l2.level1_id, l2.title, l2.order_no
               FROM verifywise.custom_framework_level2_struct l2
               JOIN verifywise.custom_framework_level1_struct l1
                 ON l2.level1_id = l1.id
              WHERE l1.definition_id = :d;`,
            { replacements: { d: legacyDefinitionId }, transaction },
          );
          const [newL2] = await sequelize.query(
            `SELECT l2.id, l2.${cols.l2_struct_parent} AS parent, l2.title, l2.order_no
               FROM verifywise.${tables.l2_struct} l2
               JOIN verifywise.${tables.l1_struct} l1
                 ON l2.${cols.l2_struct_parent} = l1.id
              WHERE l1.framework_id = :fid;`,
            { replacements: { fid: frameworkId }, transaction },
          );
          const lookup = new Map(newL2.map((r) => [`${r.parent}|${r.title}|${r.order_no}`, r.id]));
          const missedNoParent = [];
          const missedTitle = [];
          for (const r of legacyL2) {
            const newParent = l1IdMap.get(r.level1_id);
            if (!newParent) {
              missedNoParent.push(`"${r.title}" (order=${r.order_no})`);
              continue;
            }
            const newId = lookup.get(`${newParent}|${r.title}|${r.order_no}`);
            if (newId) l2IdMap.set(r.id, newId);
            else missedTitle.push(`"${r.title}" (order=${r.order_no})`);
          }
          logMissed(pluginKey, "L2", "L1 parent didn't map", missedNoParent);
          logMissed(pluginKey, "L2", "no title/order_no match", missedTitle);
        }

        const l3IdMap = new Map();
        if (isThreeLevel) {
          const [legacyL3] = await sequelize.query(
            `SELECT l3.id, l3.level2_id, l3.title, l3.order_no
               FROM verifywise.custom_framework_level3_struct l3
               JOIN verifywise.custom_framework_level2_struct l2
                 ON l3.level2_id = l2.id
               JOIN verifywise.custom_framework_level1_struct l1
                 ON l2.level1_id = l1.id
              WHERE l1.definition_id = :d;`,
            { replacements: { d: legacyDefinitionId }, transaction },
          );
          const [newL3] = await sequelize.query(
            `SELECT l3.id, l3.${cols.l3_struct_parent} AS parent, l3.title, l3.order_no
               FROM verifywise.${tables.l3_struct} l3
               JOIN verifywise.${tables.l2_struct} l2
                 ON l3.${cols.l3_struct_parent} = l2.id
               JOIN verifywise.${tables.l1_struct} l1
                 ON l2.${cols.l2_struct_parent} = l1.id
              WHERE l1.framework_id = :fid;`,
            { replacements: { fid: frameworkId }, transaction },
          );
          const lookup = new Map(newL3.map((r) => [`${r.parent}|${r.title}|${r.order_no}`, r.id]));
          const missedNoParent = [];
          const missedTitle = [];
          for (const r of legacyL3) {
            const newParent = l2IdMap.get(r.level2_id);
            if (!newParent) {
              missedNoParent.push(`"${r.title}" (order=${r.order_no})`);
              continue;
            }
            const newId = lookup.get(`${newParent}|${r.title}|${r.order_no}`);
            if (newId) l3IdMap.set(r.id, newId);
            else missedTitle.push(`"${r.title}" (order=${r.order_no})`);
          }
          logMissed(pluginKey, "L3", "L2 parent didn't map", missedNoParent);
          logMissed(pluginKey, "L3", "no title/order_no match", missedTitle);
        }

        // ---- Walk every legacy install of this plugin ----
        const [legacyCFs] = await sequelize.query(
          `SELECT id, organization_id
             FROM verifywise.custom_frameworks
            WHERE plugin_key = :key;`,
          { replacements: { key: pluginKey }, transaction },
        );

        for (const cf of legacyCFs) {
          const [legacyProjects] = await sequelize.query(
            `SELECT id, project_id
               FROM verifywise.custom_framework_projects
              WHERE framework_id = :fid;`,
            { replacements: { fid: cf.id }, transaction },
          );

          console.log(
            `[fw:migrate-data:${pluginKey}] org=${cf.organization_id} legacy projects=${legacyProjects.length}`,
          );
          for (const lp of legacyProjects) {
            // Skip if the project was deleted after the plugin install.
            const [projExists] = await sequelize.query(
              `SELECT 1 FROM verifywise.projects WHERE id = :pid LIMIT 1;`,
              { replacements: { pid: lp.project_id }, transaction },
            );
            if (projExists.length === 0) continue;

            // Get or create the projects_frameworks row.
            const [existingPf] = await sequelize.query(
              `SELECT id FROM verifywise.projects_frameworks
                WHERE project_id = :pid AND framework_id = :fid LIMIT 1;`,
              { replacements: { pid: lp.project_id, fid: frameworkId }, transaction },
            );
            let pfId;
            if (existingPf.length > 0) {
              pfId = existingPf[0].id;
            } else {
              const [inserted] = await sequelize.query(
                `INSERT INTO verifywise.projects_frameworks
                   (organization_id, project_id, framework_id, is_demo)
                 VALUES (:org, :pid, :fid, FALSE) RETURNING id;`,
                {
                  replacements: {
                    org: cf.organization_id,
                    pid: lp.project_id,
                    fid: frameworkId,
                  },
                  transaction,
                },
              );
              pfId = inserted[0].id;
            }

            // ==== L2 impls (+ inline file link migration from JSONB) ====
            const l2ImplIdMap = new Map();
            const [legacyL2Impls] = await sequelize.query(
              `SELECT * FROM verifywise.custom_framework_level2_impl
                WHERE project_framework_id = :pf;`,
              { replacements: { pf: lp.id }, transaction },
            );
            console.log(
              `[fw:migrate-data:${pluginKey}] project=${lp.project_id} pfId=${pfId} legacy L2 impls=${legacyL2Impls.length}`,
            );

            for (const row of legacyL2Impls) {
              const newL2StructId = l2IdMap.get(row.level2_id);
              if (!newL2StructId) continue;

              const [ins] = await sequelize.query(
                `INSERT INTO verifywise.${tables.l2_impl}
                   (organization_id, implementation_description, status,
                    owner, reviewer, approver, due_date, auditor_feedback,
                    ${cols.l2_impl_meta}, projects_frameworks_id,
                    created_at, is_demo)
                 VALUES (:org, :impl_desc, :status,
                         :owner, :reviewer, :approver, :due_date, :feedback,
                         :meta, :pf, :created_at, :is_demo)
                 RETURNING id;`,
                {
                  replacements: {
                    org: row.organization_id,
                    impl_desc: row.implementation_details || null,
                    status: normalizeStatus(row.status),
                    owner: coalesceUser(row.owner),
                    reviewer: coalesceUser(row.reviewer),
                    approver: coalesceUser(row.approver),
                    due_date: row.due_date || null,
                    feedback: row.auditor_feedback || null,
                    meta: newL2StructId,
                    pf: pfId,
                    created_at: row.created_at || new Date(),
                    is_demo: !!row.is_demo,
                  },
                  transaction,
                },
              );
              const newImplId = ins[0].id;
              l2ImplIdMap.set(row.id, newImplId);

              // Inline JSONB file link migration for this impl row.
              await migrateJsonbLinks(
                sequelize,
                transaction,
                row.evidence_links,
                "evidence",
                row.organization_id,
                newImplId,
                framework_type,
                entity_types.l2_impl,
                row.created_at,
                validFiles,
              );
              await migrateJsonbLinks(
                sequelize,
                transaction,
                row.feedback_links,
                "feedback",
                row.organization_id,
                newImplId,
                framework_type,
                entity_types.l2_impl,
                row.created_at,
                validFiles,
              );
            }

            // ==== L3 impls (+ inline file link migration from JSONB) ====
            const l3ImplIdMap = new Map();
            if (isThreeLevel) {
              const [legacyL3Impls] = await sequelize.query(
                `SELECT l3i.*
                   FROM verifywise.custom_framework_level3_impl l3i
                   JOIN verifywise.custom_framework_level2_impl l2i
                     ON l3i.level2_impl_id = l2i.id
                  WHERE l2i.project_framework_id = :pf;`,
                { replacements: { pf: lp.id }, transaction },
              );
              console.log(
                `[fw:migrate-data:${pluginKey}] project=${lp.project_id} legacy L3 impls=${legacyL3Impls.length}`,
              );

              for (const row of legacyL3Impls) {
                const newL3StructId = l3IdMap.get(row.level3_id);
                const newL2ImplId = l2ImplIdMap.get(row.level2_impl_id);
                if (!newL3StructId || !newL2ImplId) continue;

                const [ins] = await sequelize.query(
                  `INSERT INTO verifywise.${tables.l3_impl}
                     (organization_id, implementation_description, status,
                      owner, reviewer, approver, due_date, auditor_feedback,
                      ${cols.l3_impl_meta}, ${cols.l3_impl_parent},
                      projects_frameworks_id, created_at, is_demo)
                   VALUES (:org, :impl_desc, :status,
                           :owner, :reviewer, :approver, :due_date, :feedback,
                           :meta, :parent, :pf, :created_at, :is_demo)
                   RETURNING id;`,
                  {
                    replacements: {
                      org: row.organization_id,
                      impl_desc: row.implementation_details || null,
                      status: normalizeStatus(row.status),
                      owner: coalesceUser(row.owner),
                      reviewer: coalesceUser(row.reviewer),
                      approver: coalesceUser(row.approver),
                      due_date: row.due_date || null,
                      feedback: row.auditor_feedback || null,
                      meta: newL3StructId,
                      parent: newL2ImplId,
                      pf: pfId,
                      created_at: row.created_at || new Date(),
                      is_demo: !!row.is_demo,
                    },
                    transaction,
                  },
                );
                const newImplId = ins[0].id;
                l3ImplIdMap.set(row.id, newImplId);

                await migrateJsonbLinks(
                  sequelize,
                  transaction,
                  row.evidence_links,
                  "evidence",
                  row.organization_id,
                  newImplId,
                  framework_type,
                  entity_types.l3_impl,
                  row.created_at,
                  validFiles,
                );
                await migrateJsonbLinks(
                  sequelize,
                  transaction,
                  row.feedback_links,
                  "feedback",
                  row.organization_id,
                  newImplId,
                  framework_type,
                  entity_types.l3_impl,
                  row.created_at,
                  validFiles,
                );
              }
            }

            // ==== L2 risk links (impl id map lookup) ====
            if (l2ImplIdMap.size > 0) {
              const [legacyL2Risks] = await sequelize.query(
                `SELECT organization_id, level2_impl_id, risk_id
                   FROM verifywise.custom_framework_level2_risks
                  WHERE level2_impl_id IN (:ids);`,
                { replacements: { ids: [...l2ImplIdMap.keys()] }, transaction },
              );
              for (const r of legacyL2Risks) {
                const newImplId = l2ImplIdMap.get(r.level2_impl_id);
                if (!newImplId || !validRisks.has(r.risk_id)) continue;
                await sequelize.query(
                  `INSERT INTO verifywise.${tables.l2_risks}
                     (organization_id, ${cols.l2_risks_impl}, projects_risks_id)
                   VALUES (:org, :impl, :risk)
                   ON CONFLICT (${cols.l2_risks_impl}, projects_risks_id) DO NOTHING;`,
                  {
                    replacements: { org: r.organization_id, impl: newImplId, risk: r.risk_id },
                    transaction,
                  },
                );
              }
            }

            // ==== L3 risk links ====
            if (isThreeLevel && l3ImplIdMap.size > 0) {
              const [legacyL3Risks] = await sequelize.query(
                `SELECT organization_id, level3_impl_id, risk_id
                   FROM verifywise.custom_framework_level3_risks
                  WHERE level3_impl_id IN (:ids);`,
                { replacements: { ids: [...l3ImplIdMap.keys()] }, transaction },
              );
              for (const r of legacyL3Risks) {
                const newImplId = l3ImplIdMap.get(r.level3_impl_id);
                if (!newImplId || !validRisks.has(r.risk_id)) continue;
                await sequelize.query(
                  `INSERT INTO verifywise.${tables.l3_risks}
                     (organization_id, ${cols.l3_risks_impl}, projects_risks_id)
                   VALUES (:org, :impl, :risk)
                   ON CONFLICT (${cols.l3_risks_impl}, projects_risks_id) DO NOTHING;`,
                  {
                    replacements: { org: r.organization_id, impl: newImplId, risk: r.risk_id },
                    transaction,
                  },
                );
              }
            }

            // Legacy `file_entity_links` rows are translated by the
            // follow-up migration 20260807142621-fix-legacy-file-entity-
            // links.js — see this file's header for the rationale.
            console.log(
              `[fw:migrate-data:${pluginKey}] project=${lp.project_id} migrated: L2 impls=${l2ImplIdMap.size}${isThreeLevel ? ", L3 impls=" + l3ImplIdMap.size : ""}`,
            );
          }
        }
      }

      console.log(`[fw:migrate-data] done.`);
      await transaction.commit();
    } catch (err) {
      console.error(`[fw:migrate-data] failed`, err);
      await transaction.rollback();
      throw err;
    }
  },

  async down() {},
};

// -------------------------------------------------------------------------
// Helpers
// -------------------------------------------------------------------------

function logMissed(pluginKey, level, cause, missed) {
  if (missed.length === 0) return;
  const sample = missed.slice(0, 3).join(", ");
  const more = missed.length > 3 ? ` (+${missed.length - 3} more)` : "";
  console.warn(
    `[migrate-framework-data:${pluginKey}] ${level} mismatch (${cause}): ${missed.length} legacy row(s) — impls on these will NOT migrate: ${sample}${more}`,
  );
}

async function migrateJsonbLinks(
  sequelize,
  transaction,
  links,
  linkType,
  orgId,
  newImplId,
  frameworkType,
  entityType,
  createdAt,
  validFiles,
) {
  if (!Array.isArray(links) || links.length === 0) return;

  for (const link of links) {
    const fileId = parseFileId(link);
    if (!fileId || !validFiles.has(fileId)) continue;

    await sequelize.query(
      `INSERT INTO verifywise.file_entity_links
         (organization_id, file_id, framework_type, entity_type, entity_id,
          link_type, created_at)
       VALUES (:org, :file, :ft, :et, :eid, :lt, :ca)
       ON CONFLICT (file_id, framework_type, entity_type, entity_id) DO NOTHING;`,
      {
        replacements: {
          org: orgId,
          file: fileId,
          ft: frameworkType,
          et: entityType,
          eid: newImplId,
          lt: linkType,
          ca: createdAt || new Date(),
        },
        transaction,
      },
    );
  }
}
