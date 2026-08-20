#!/usr/bin/env node
/* eslint-disable */
/**
 * Snapshot script for the 7 extensions migrated from plugin-marketplace.
 *
 * Usage:
 *   node scripts/snapshotExtensionsData.js               → /tmp/extensions-snapshot.json
 *   node scripts/snapshotExtensionsData.js /path/out.json
 *
 * Dumps the state of the extensions catalog + per-org enablements + every
 * extension-owned data table into a single JSON file. Designed to be run
 * before and after the extensions migration so both snapshots can be diffed
 * to verify the migration ran cleanly.
 *
 * Environment variables (from Servers/.env):
 *   DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD
 */

"use strict";

require("dotenv").config();
const { Client } = require("pg");
const fs = require("fs");
const path = require("path");

const OUT_PATH = process.argv[2] || "/tmp/extensions-snapshot.json";

// Extension-owned data tables added or claimed by the migration. Existence is
// probed per-table so a pre-migration run captures whatever subset is present.
const DATA_TABLES = [
  "azure_ai_model_records",
  "model_lifecycle_phases",
  "model_lifecycle_items",
  "model_lifecycle_values",
  "model_lifecycle_item_files",
  "model_lifecycle_item_people",
  "model_lifecycle_item_approvals",
  "model_lifecycle_change_history",
  "jira_assets_config",
  "jira_assets_use_cases",
  "jira_assets_sync_history",
  "slack_webhooks",
  "mlflow_integrations",
  "mlflow_model_records",
];

async function tableExists(client, name) {
  const { rows } = await client.query(
    `SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'verifywise' AND table_name = $1 LIMIT 1;`,
    [name],
  );
  return rows.length > 0;
}

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
    source: "extensions snapshot",
    summary: {},
    plugin_installations_present: false,
    plugin_installations: [],
    extensions: [],
    extension_config_fields: [],
    extension_enablements: [],
    data_tables: {},
  };

  // Legacy table — should be gone after the migration; captured pre-migration
  // so we can diff what was skipped/dropped.
  if (await tableExists(client, "plugin_installations")) {
    snapshot.plugin_installations_present = true;
    const { rows } = await client.query(
      `SELECT id, organization_id, plugin_key, status, configuration, metadata,
              installed_at, error_message, created_at, updated_at
         FROM plugin_installations
        ORDER BY organization_id, plugin_key;`,
    );
    snapshot.plugin_installations = rows;
  }

  // Catalog + enablements — expected to exist after the migration.
  if (await tableExists(client, "extensions")) {
    const { rows } = await client.query(
      `SELECT id, key, name, display_name, description, long_description, version,
              author, category, icon_path, documentation_url, support_url,
              requires_configuration, features, tags, created_at, updated_at
         FROM extensions
        ORDER BY id;`,
    );
    snapshot.extensions = rows;
  }

  if (await tableExists(client, "extension_config_fields")) {
    const { rows } = await client.query(
      `SELECT cf.id, cf.extension_id, e.key AS extension_key,
              cf.field_key, cf.field_type, cf.label, cf.help_text, cf.placeholder,
              cf.is_required, cf.is_secret, cf.default_value, cf.display_order,
              cf.options, cf.validation
         FROM extension_config_fields cf
         JOIN extensions e ON e.id = cf.extension_id
        ORDER BY cf.extension_id, cf.display_order, cf.id;`,
    );
    snapshot.extension_config_fields = rows;
  }

  if (await tableExists(client, "extension_enablements")) {
    const { rows } = await client.query(
      `SELECT ee.id, ee.organization_id, ee.extension_id, e.key AS extension_key,
              ee.enabled, ee.configuration,
              ee.enabled_at, ee.enabled_by, ee.created_at, ee.updated_at
         FROM extension_enablements ee
         JOIN extensions e ON e.id = ee.extension_id
        ORDER BY ee.organization_id, ee.extension_id;`,
    );
    snapshot.extension_enablements = rows;
  }

  // Row counts + first 10 rows per extension-owned data table (existence
  // probed so pre-migration snapshots still work).
  for (const table of DATA_TABLES) {
    if (!(await tableExists(client, table))) {
      snapshot.data_tables[table] = { present: false };
      continue;
    }
    const { rows: countRows } = await client.query(`SELECT COUNT(*)::int AS n FROM ${table};`);
    const { rows: sampleRows } = await client.query(`SELECT * FROM ${table} LIMIT 10;`);
    snapshot.data_tables[table] = {
      present: true,
      row_count: countRows[0].n,
      sample: sampleRows,
    };
  }

  snapshot.summary = {
    plugin_installations_present: snapshot.plugin_installations_present,
    plugin_installations_rows: snapshot.plugin_installations.length,
    extensions: snapshot.extensions.length,
    extension_config_fields: snapshot.extension_config_fields.length,
    extension_enablements: snapshot.extension_enablements.length,
    data_tables: Object.fromEntries(
      Object.entries(snapshot.data_tables).map(([t, v]) => [t, v.present ? v.row_count : "absent"]),
    ),
  };

  const outAbs = path.resolve(OUT_PATH);
  fs.writeFileSync(outAbs, JSON.stringify(snapshot, null, 2));
  await client.end();

  console.log(`Wrote ${outAbs}`);
  console.log(`Summary:`, JSON.stringify(snapshot.summary, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
