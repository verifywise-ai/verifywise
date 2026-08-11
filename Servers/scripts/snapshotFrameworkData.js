#!/usr/bin/env node
/* eslint-disable */
/**
 * Snapshot script for the 21 generic frameworks.
 *
 * Usage:
 *   node scripts/snapshotFrameworkData.js               → /tmp/new-framework-snapshot.json
 *   node scripts/snapshotFrameworkData.js /path/out.json
 *
 * Iterates FRAMEWORK_STRUCTURES (from Servers/structures/, requires
 * `npm run build` first so dist/structures exists) and dumps the current
 * state of every per-framework struct + impl + risks table, plus the
 * corresponding file_entity_links rows, into a single JSON file. Same
 * shape (as much as possible) as the legacy snapshot captured by hand
 * from the custom_framework_* tables — designed so you can diff pre-
 * and post-migration snapshots to verify data preservation.
 *
 * Environment variables (from Servers/.env):
 *   DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD
 */

"use strict";

require("dotenv").config();
const { Client } = require("pg");
const fs = require("fs");
const path = require("path");

const { FRAMEWORK_STRUCTURES } = require("../dist/structures");

const OUT_PATH = process.argv[2] || "/tmp/new-framework-snapshot.json";

async function main() {
  const client = new Client({
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT, 10),
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
  });
  await client.connect();
  await client.query(`SET search_path TO verifywise, public;`);

  const snapshot = {
    captured_at: new Date().toISOString(),
    db: process.env.DB_NAME,
    source: "generic framework impl tables (post-migration snapshot)",
    summary: {},
    frameworks_row: [],
    l1_struct: [],
    l2_struct: [],
    l3_struct: [],
    projects_frameworks: [],
    l2_impls: [],
    l3_impls: [],
    l2_risks: [],
    l3_risks: [],
    file_entity_links: [],
  };

  // ---- frameworks row (only the 21 generic ids, from structures) ----
  const genericIds = FRAMEWORK_STRUCTURES.map((fw) => fw.id);
  const { rows: fwRows } = await client.query(
    `SELECT id, name, description, version, is_organizational, is_active, is_demo
       FROM frameworks
      WHERE id = ANY($1::int[])
      ORDER BY id;`,
    [genericIds],
  );
  snapshot.frameworks_row = fwRows;

  // ---- projects_frameworks for these frameworks ----
  const { rows: pfRows } = await client.query(
    `SELECT pf.id AS pf_id, pf.organization_id, pf.project_id, pf.framework_id,
            p.project_title, p.is_organizational
       FROM projects_frameworks pf
       JOIN projects p ON p.id = pf.project_id
      WHERE pf.framework_id = ANY($1::int[])
      ORDER BY pf.organization_id, pf.framework_id, pf.project_id;`,
    [genericIds],
  );
  snapshot.projects_frameworks = pfRows;

  // ---- Per-framework struct + impl + risks ----
  for (const fw of FRAMEWORK_STRUCTURES) {
    const { id: frameworkId, key: structureKey, framework_type, tables, cols, entity_types } = fw;
    const isThreeLevel = !!tables.l3_struct;

    // struct (L1 / L2 / L3)
    const l1Res = await client.query(
      `SELECT $1::text AS structure_key, id, framework_id, title, description, order_no
         FROM ${tables.l1_struct}
        WHERE framework_id = $2
        ORDER BY order_no, id;`,
      [structureKey, frameworkId],
    );
    snapshot.l1_struct.push(...l1Res.rows);

    const l2Res = await client.query(
      `SELECT $1::text AS structure_key,
              l2.id, l2.${cols.l2_struct_parent} AS parent_id,
              l2.title, l2.description, l2.summary, l2.order_no
         FROM ${tables.l2_struct} l2
         JOIN ${tables.l1_struct} l1 ON l1.id = l2.${cols.l2_struct_parent}
        WHERE l1.framework_id = $2
        ORDER BY l2.order_no, l2.id;`,
      [structureKey, frameworkId],
    );
    snapshot.l2_struct.push(...l2Res.rows);

    if (isThreeLevel) {
      const l3Res = await client.query(
        `SELECT $1::text AS structure_key,
                l3.id, l3.${cols.l3_struct_parent} AS parent_id,
                l3.title, l3.description, l3.summary, l3.order_no
           FROM ${tables.l3_struct} l3
           JOIN ${tables.l2_struct} l2 ON l2.id = l3.${cols.l3_struct_parent}
           JOIN ${tables.l1_struct} l1 ON l1.id = l2.${cols.l2_struct_parent}
          WHERE l1.framework_id = $2
          ORDER BY l3.order_no, l3.id;`,
        [structureKey, frameworkId],
      );
      snapshot.l3_struct.push(...l3Res.rows);
    }

    // impl L2
    const l2ImplRes = await client.query(
      `SELECT $1::text AS structure_key,
              i.id AS impl_id, i.organization_id, i.projects_frameworks_id,
              l1.title AS category, l1.order_no AS category_order,
              l2.title AS control, l2.order_no AS control_order,
              i.status, i.owner, i.reviewer, i.approver, i.due_date,
              i.implementation_description, i.auditor_feedback,
              i.is_demo
         FROM ${tables.l2_impl} i
         JOIN ${tables.l2_struct} l2 ON l2.id = i.${cols.l2_impl_meta}
         JOIN ${tables.l1_struct} l1 ON l1.id = l2.${cols.l2_struct_parent}
        WHERE l1.framework_id = $2
        ORDER BY l1.order_no, l2.order_no, i.id;`,
      [structureKey, frameworkId],
    );
    snapshot.l2_impls.push(...l2ImplRes.rows);

    // impl L3 (three-level only)
    if (isThreeLevel) {
      const l3ImplRes = await client.query(
        `SELECT $1::text AS structure_key,
                i.id AS impl_id, i.organization_id, i.${cols.l3_impl_parent} AS parent_impl_id,
                l3.title AS control, l3.order_no AS control_order,
                i.status, i.owner, i.reviewer, i.approver, i.due_date,
                i.implementation_description, i.auditor_feedback, i.is_demo
           FROM ${tables.l3_impl} i
           JOIN ${tables.l3_struct} l3 ON l3.id = i.${cols.l3_impl_meta}
           JOIN ${tables.l2_struct} l2 ON l2.id = l3.${cols.l3_struct_parent}
           JOIN ${tables.l1_struct} l1 ON l1.id = l2.${cols.l2_struct_parent}
          WHERE l1.framework_id = $2
          ORDER BY l3.order_no, i.id;`,
        [structureKey, frameworkId],
      );
      snapshot.l3_impls.push(...l3ImplRes.rows);
    }

    // risk junction L2
    const l2RisksRes = await client.query(
      `SELECT $1::text AS structure_key,
              r.organization_id, r.${cols.l2_risks_impl} AS impl_id, r.projects_risks_id AS risk_id,
              l2.title AS control_title
         FROM ${tables.l2_risks} r
         JOIN ${tables.l2_impl} i ON i.id = r.${cols.l2_risks_impl}
         JOIN ${tables.l2_struct} l2 ON l2.id = i.${cols.l2_impl_meta}
         JOIN ${tables.l1_struct} l1 ON l1.id = l2.${cols.l2_struct_parent}
        WHERE l1.framework_id = $2
        ORDER BY r.${cols.l2_risks_impl}, r.projects_risks_id;`,
      [structureKey, frameworkId],
    );
    snapshot.l2_risks.push(...l2RisksRes.rows);

    // risk junction L3
    if (isThreeLevel) {
      const l3RisksRes = await client.query(
        `SELECT $1::text AS structure_key,
                r.organization_id, r.${cols.l3_risks_impl} AS impl_id, r.projects_risks_id AS risk_id
           FROM ${tables.l3_risks} r
           JOIN ${tables.l3_impl} i ON i.id = r.${cols.l3_risks_impl}
           JOIN ${tables.l3_struct} l3 ON l3.id = i.${cols.l3_impl_meta}
           JOIN ${tables.l2_struct} l2 ON l2.id = l3.${cols.l3_struct_parent}
           JOIN ${tables.l1_struct} l1 ON l1.id = l2.${cols.l2_struct_parent}
          WHERE l1.framework_id = $2
          ORDER BY r.${cols.l3_risks_impl}, r.projects_risks_id;`,
        [structureKey, frameworkId],
      );
      snapshot.l3_risks.push(...l3RisksRes.rows);
    }

    // file_entity_links written by the new code path (framework_type comes
    // from the structure, not the legacy plugin_key).
    const felRes = await client.query(
      `SELECT organization_id, file_id, framework_type, entity_type, entity_id,
              link_type, created_by, created_at
         FROM file_entity_links
        WHERE framework_type = $1
        ORDER BY entity_type, entity_id, file_id;`,
      [framework_type],
    );
    for (const row of felRes.rows) {
      snapshot.file_entity_links.push({ structure_key: structureKey, ...row });
    }
  }

  snapshot.summary = {
    frameworks_row: snapshot.frameworks_row.length,
    projects_frameworks: snapshot.projects_frameworks.length,
    l1_struct: snapshot.l1_struct.length,
    l2_struct: snapshot.l2_struct.length,
    l3_struct: snapshot.l3_struct.length,
    l2_impls: snapshot.l2_impls.length,
    l3_impls: snapshot.l3_impls.length,
    l2_risks: snapshot.l2_risks.length,
    l3_risks: snapshot.l3_risks.length,
    file_entity_links: snapshot.file_entity_links.length,
  };

  const outAbs = path.resolve(OUT_PATH);
  fs.writeFileSync(outAbs, JSON.stringify(snapshot, null, 2));
  await client.end();

  console.log(`Wrote ${outAbs}`);
  console.log(`Summary:`, snapshot.summary);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
