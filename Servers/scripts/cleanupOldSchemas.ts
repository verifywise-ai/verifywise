/**
 * Cleanup Old Schemas After Shared Schema Migration
 *
 * This script removes old tenant-hash schemas and app tables from the public
 * schema after verifying that migration to the `verifywise` schema is complete.
 *
 * USAGE:
 *   npx ts-node Servers/scripts/cleanupOldSchemas.ts           # Dry-run (logs only)
 *   npx ts-node Servers/scripts/cleanupOldSchemas.ts --confirm  # Actually drops schemas/tables
 *
 * PREREQUISITES:
 *   1. Migration to shared schema must be verified complete
 *   2. BACKUP YOUR DATABASE before running with --confirm
 *
 * WHAT THIS SCRIPT DOES:
 *   1. Finds all tenant-hash schemas (hex strings like "a1b2c3d4e5...")
 *   2. Drops those schemas with CASCADE
 *   3. Finds all app tables in the public schema
 *   4. Moves public.SequelizeMeta rows to verifywise.SequelizeMeta if needed
 *   5. Drops all app tables from public (preserving extensions like uuid-ossp)
 */

import { sequelize } from "../database/db";
import { QueryTypes } from "sequelize";

// Tables that belong to extensions or PostGIS and should NOT be dropped from public
const PROTECTED_PUBLIC_TABLES = new Set([
  "spatial_ref_sys",       // PostGIS
  "geography_columns",    // PostGIS
  "geometry_columns",     // PostGIS
  "raster_columns",       // PostGIS
  "raster_overviews",     // PostGIS
]);

// Schemas that should never be dropped
const PROTECTED_SCHEMAS = new Set([
  "public",
  "verifywise",
  "information_schema",
  "pg_catalog",
  "pg_toast",
  "pg_temp_1",
  "pg_toast_temp_1",
]);

async function findTenantHashSchemas(): Promise<string[]> {
  const results = await sequelize.query<{ schema_name: string }>(
    `SELECT schema_name FROM information_schema.schemata
     WHERE schema_name ~ '^[a-f0-9]{10,}$'
     ORDER BY schema_name`,
    { type: QueryTypes.SELECT }
  );
  return results.map((r) => r.schema_name);
}

async function findPublicAppTables(): Promise<string[]> {
  const results = await sequelize.query<{ tablename: string }>(
    `SELECT tablename FROM pg_tables
     WHERE schemaname = 'public'
     ORDER BY tablename`,
    { type: QueryTypes.SELECT }
  );
  return results
    .map((r) => r.tablename)
    .filter((t) => !PROTECTED_PUBLIC_TABLES.has(t));
}

async function verifyWiseSchemaExists(): Promise<boolean> {
  const results = await sequelize.query<{ schema_name: string }>(
    `SELECT schema_name FROM information_schema.schemata
     WHERE schema_name = 'verifywise'`,
    { type: QueryTypes.SELECT }
  );
  return results.length > 0;
}

async function tableExistsInSchema(
  schema: string,
  table: string
): Promise<boolean> {
  const results = await sequelize.query<{ exists: boolean }>(
    `SELECT EXISTS (
       SELECT 1 FROM pg_tables
       WHERE schemaname = :schema AND tablename = :table
     ) AS exists`,
    { replacements: { schema, table }, type: QueryTypes.SELECT }
  );
  return results[0]?.exists === true;
}

async function migrateSequelizeMeta(dryRun: boolean): Promise<void> {
  const publicHasMeta = await tableExistsInSchema("public", "SequelizeMeta");
  if (!publicHasMeta) {
    console.log("  No public.SequelizeMeta found — nothing to migrate.");
    return;
  }

  const verywiseHasMeta = await tableExistsInSchema(
    "verifywise",
    "SequelizeMeta"
  );

  // Count rows in public.SequelizeMeta
  const countResult = await sequelize.query<{ count: string }>(
    `SELECT COUNT(*) as count FROM public."SequelizeMeta"`,
    { type: QueryTypes.SELECT }
  );
  const rowCount = parseInt(countResult[0].count, 10);
  console.log(`  public.SequelizeMeta has ${rowCount} rows.`);

  if (rowCount === 0) {
    console.log("  No rows to migrate.");
    return;
  }

  if (!verywiseHasMeta) {
    console.log(
      "  verifywise.SequelizeMeta does not exist — skipping row migration."
    );
    console.log(
      "  (public.SequelizeMeta will be dropped with other public tables.)"
    );
    return;
  }

  if (dryRun) {
    console.log(
      `  [DRY RUN] Would merge ${rowCount} rows from public.SequelizeMeta into verifywise.SequelizeMeta`
    );
  } else {
    // Insert rows that don't already exist in verifywise.SequelizeMeta
    await sequelize.query(
      `INSERT INTO verifywise."SequelizeMeta" (name)
       SELECT name FROM public."SequelizeMeta"
       WHERE name NOT IN (SELECT name FROM verifywise."SequelizeMeta")`,
      { type: QueryTypes.INSERT }
    );
    console.log(
      `  Merged SequelizeMeta rows from public into verifywise schema.`
    );
  }
}

async function run(): Promise<void> {
  const args = process.argv.slice(2);
  const dryRun = !args.includes("--confirm");

  console.log("=".repeat(60));
  console.log("  Cleanup Old Schemas Script");
  console.log(`  Mode: ${dryRun ? "DRY RUN (pass --confirm to execute)" : "LIVE — CHANGES WILL BE MADE"}`);
  console.log("=".repeat(60));
  console.log();

  try {
    // Verify connection
    await sequelize.authenticate();
    console.log("Database connection established.\n");

    // Check verifywise schema exists
    const vwExists = await verifyWiseSchemaExists();
    if (!vwExists) {
      console.error(
        "ERROR: 'verifywise' schema does not exist. Run migrations first."
      );
      process.exit(1);
    }
    console.log("Verified: 'verifywise' schema exists.\n");

    // Step 1: Find tenant hash schemas
    console.log("--- Step 1: Tenant Hash Schemas ---");
    const tenantSchemas = await findTenantHashSchemas();
    if (tenantSchemas.length === 0) {
      console.log("  No tenant-hash schemas found.\n");
    } else {
      console.log(`  Found ${tenantSchemas.length} tenant-hash schema(s):`);
      for (const schema of tenantSchemas) {
        console.log(`    - ${schema}`);
      }
      console.log();

      if (dryRun) {
        console.log(
          `  [DRY RUN] Would drop ${tenantSchemas.length} tenant schema(s).\n`
        );
      } else {
        for (const schema of tenantSchemas) {
          if (PROTECTED_SCHEMAS.has(schema)) {
            console.log(`  SKIPPING protected schema: ${schema}`);
            continue;
          }
          console.log(`  Dropping schema: ${schema} ...`);
          await sequelize.query(`DROP SCHEMA "${schema}" CASCADE`);
          console.log(`  Dropped: ${schema}`);
        }
        console.log(`  All tenant schemas dropped.\n`);
      }
    }

    // Step 2: Migrate SequelizeMeta
    console.log("--- Step 2: Migrate SequelizeMeta ---");
    await migrateSequelizeMeta(dryRun);
    console.log();

    // Step 3: Drop app tables from public schema
    console.log("--- Step 3: Public Schema App Tables ---");
    const publicTables = await findPublicAppTables();
    if (publicTables.length === 0) {
      console.log("  No app tables found in public schema.\n");
    } else {
      console.log(
        `  Found ${publicTables.length} app table(s) in public schema:`
      );
      for (const table of publicTables) {
        console.log(`    - ${table}`);
      }
      console.log();

      if (dryRun) {
        console.log(
          `  [DRY RUN] Would drop ${publicTables.length} table(s) from public schema.\n`
        );
      } else {
        // Drop all tables in one CASCADE statement to handle FK ordering
        const tableList = publicTables
          .map((t) => `public."${t}"`)
          .join(", ");
        console.log(`  Dropping ${publicTables.length} tables from public schema ...`);
        await sequelize.query(`DROP TABLE IF EXISTS ${tableList} CASCADE`);
        console.log(`  All public app tables dropped.\n`);
      }
    }

    // Summary
    console.log("=".repeat(60));
    if (dryRun) {
      console.log("  DRY RUN COMPLETE. No changes were made.");
      console.log("  Run with --confirm to execute the cleanup.");
    } else {
      console.log("  CLEANUP COMPLETE.");
      console.log(`  - Dropped ${tenantSchemas.length} tenant schema(s)`);
      console.log(`  - Dropped ${publicTables.length} public table(s)`);
    }
    console.log("=".repeat(60));
  } catch (error) {
    console.error("ERROR:", error);
    process.exit(1);
  } finally {
    await sequelize.close();
  }
}

run();
