/**
 * Verify Schema Data Migration
 *
 * Compares row counts between public and verifywise schemas,
 * and checks for orphaned foreign keys.
 *
 * USAGE:
 *   npx ts-node Servers/scripts/verifySchemaData.ts
 */

import { sequelize } from "../database/db";
import { QueryTypes } from "sequelize";
import {
  FK_MAPPINGS,
} from "./migrationConfig";

// Key tables to always check (even if not in migration config)
const KEY_TABLES = [
  "organizations",
  "users",
  "roles",
  "frameworks",
  "custom_framework_definitions",
  "custom_frameworks",
  "nist_ai_rmf_categories_struct",
  "nist_ai_rmf_subcategories_struct",
];

interface TableComparison {
  table: string;
  verifywise_count: number;
  public_count: number | null; // null if table doesn't exist in public
  match: boolean;
}

interface FkCheck {
  table: string;
  column: string;
  referenced_table: string;
  orphaned_count: number;
}

async function getSchemaTableNames(schema: string): Promise<string[]> {
  const rows = await sequelize.query<{ tablename: string }>(
    `SELECT tablename FROM pg_tables WHERE schemaname = :schema ORDER BY tablename`,
    { replacements: { schema }, type: QueryTypes.SELECT }
  );
  return rows.map((r) => r.tablename);
}

async function getRowCount(schema: string, table: string): Promise<number> {
  const [result] = await sequelize.query<{ count: string }>(
    `SELECT COUNT(*) as count FROM "${schema}"."${table}"`,
    { type: QueryTypes.SELECT }
  );
  return parseInt(result.count, 10);
}

async function tableExistsInSchema(schema: string, table: string): Promise<boolean> {
  const rows = await sequelize.query<{ exists: boolean }>(
    `SELECT EXISTS (
      SELECT 1 FROM pg_tables WHERE schemaname = :schema AND tablename = :table
    ) as exists`,
    { replacements: { schema, table }, type: QueryTypes.SELECT }
  );
  return rows[0].exists;
}

async function checkOrphanedFks(
  schema: string,
  table: string,
  column: string,
  referencedTable: string
): Promise<number> {
  // Check if both tables exist in the schema
  const [tableExists, refExists] = await Promise.all([
    tableExistsInSchema(schema, table),
    tableExistsInSchema(schema, referencedTable),
  ]);
  if (!tableExists || !refExists) return -1;

  const rows = await sequelize.query<{ orphaned: string }>(
    `SELECT COUNT(*) as orphaned
     FROM "${schema}"."${table}" t
     WHERE t."${column}" IS NOT NULL
       AND NOT EXISTS (
         SELECT 1 FROM "${schema}"."${referencedTable}" r WHERE r.id = t."${column}"
       )`,
    { type: QueryTypes.SELECT }
  );
  return parseInt(rows[0].orphaned, 10);
}

async function run() {
  console.log("=".repeat(70));
  console.log("  SCHEMA DATA VERIFICATION");
  console.log("  Comparing verifywise schema vs public schema");
  console.log("=".repeat(70));
  console.log();

  // 1. Discover tables in verifywise schema
  const verifywiseTables = await getSchemaTableNames("verifywise");
  const publicTables = new Set(await getSchemaTableNames("public"));

  if (verifywiseTables.length === 0) {
    console.log("ERROR: No tables found in verifywise schema. Nothing to verify.");
    process.exit(1);
  }

  console.log(`Found ${verifywiseTables.length} tables in verifywise schema`);
  console.log(`Found ${publicTables.size} tables in public schema`);
  console.log();

  // 2. Build the list of tables to compare: verifywise tables + key tables
  const allTablesToCheck = new Set([
    ...verifywiseTables,
    ...KEY_TABLES.filter((t) => verifywiseTables.includes(t) || publicTables.has(t)),
  ]);

  // 3. Compare row counts
  console.log("-".repeat(70));
  console.log("  ROW COUNT COMPARISON");
  console.log("-".repeat(70));
  console.log(
    `${"TABLE".padEnd(45)} ${"VERIFYWISE".padStart(10)} ${"PUBLIC".padStart(10)} ${"STATUS".padStart(8)}`
  );
  console.log("-".repeat(70));

  const comparisons: TableComparison[] = [];
  let mismatches = 0;
  let verifyOnlyCount = 0;

  for (const table of [...allTablesToCheck].sort()) {
    const inVerifywise = verifywiseTables.includes(table);
    const inPublic = publicTables.has(table);

    let vwCount = 0;
    let pubCount: number | null = null;

    if (inVerifywise) {
      vwCount = await getRowCount("verifywise", table);
    }
    if (inPublic) {
      pubCount = await getRowCount("public", table);
    }

    let status: string;
    let match: boolean;

    if (!inVerifywise) {
      status = "SKIP";
      match = true;
    } else if (!inPublic) {
      status = "VW ONLY";
      match = true;
      verifyOnlyCount++;
    } else if (vwCount === pubCount) {
      status = "OK";
      match = true;
    } else {
      status = "DIFF";
      match = false;
      mismatches++;
    }

    const pubStr = pubCount !== null ? String(pubCount) : "-";
    console.log(
      `${table.padEnd(45)} ${String(vwCount).padStart(10)} ${pubStr.padStart(10)} ${status.padStart(8)}`
    );

    comparisons.push({
      table,
      verifywise_count: vwCount,
      public_count: pubCount,
      match,
    });
  }

  console.log("-".repeat(70));
  console.log(
    `Total tables checked: ${comparisons.length} | Mismatches: ${mismatches} | VW-only: ${verifyOnlyCount}`
  );
  console.log();

  // 4. FK integrity checks on verifywise schema
  console.log("-".repeat(70));
  console.log("  FOREIGN KEY INTEGRITY (verifywise schema)");
  console.log("-".repeat(70));
  console.log(
    `${"TABLE".padEnd(35)} ${"COLUMN".padEnd(25)} ${"REFERENCES".padEnd(30)} ${"ORPHANED".padStart(8)}`
  );
  console.log("-".repeat(70));

  const fkIssues: FkCheck[] = [];
  let totalOrphaned = 0;

  for (const [table, columns] of Object.entries(FK_MAPPINGS)) {
    for (const [column, referencedTable] of Object.entries(columns)) {
      const orphaned = await checkOrphanedFks("verifywise", table, column, referencedTable);

      if (orphaned === -1) {
        // Table(s) don't exist in verifywise schema, skip
        continue;
      }

      const status = orphaned === 0 ? "OK" : `${orphaned}`;
      console.log(
        `${table.padEnd(35)} ${column.padEnd(25)} ${referencedTable.padEnd(30)} ${status.padStart(8)}`
      );

      if (orphaned > 0) {
        totalOrphaned += orphaned;
        fkIssues.push({ table, column, referenced_table: referencedTable, orphaned_count: orphaned });
      }
    }
  }

  console.log("-".repeat(70));
  console.log(`FK checks completed | Orphaned rows found: ${totalOrphaned}`);
  console.log();

  // 5. Summary
  console.log("=".repeat(70));
  console.log("  SUMMARY");
  console.log("=".repeat(70));

  const rowCountPass = mismatches === 0;
  const fkPass = totalOrphaned === 0;
  const overallPass = rowCountPass && fkPass;

  console.log(`Row count comparison:  ${rowCountPass ? "PASS" : "FAIL"} (${mismatches} mismatches)`);
  console.log(`FK integrity:          ${fkPass ? "PASS" : "FAIL"} (${totalOrphaned} orphaned rows)`);
  console.log();
  console.log(`Overall result:        ${overallPass ? "PASS" : "FAIL"}`);

  if (!overallPass) {
    if (mismatches > 0) {
      console.log();
      console.log("Tables with row count differences:");
      for (const c of comparisons.filter((c) => !c.match)) {
        console.log(
          `  - ${c.table}: verifywise=${c.verifywise_count}, public=${c.public_count}`
        );
      }
    }
    if (fkIssues.length > 0) {
      console.log();
      console.log("Tables with orphaned foreign keys:");
      for (const fk of fkIssues) {
        console.log(
          `  - ${fk.table}.${fk.column} -> ${fk.referenced_table}: ${fk.orphaned_count} orphaned`
        );
      }
    }
  }

  console.log();
  console.log("=".repeat(70));

  await sequelize.close();
  process.exit(overallPass ? 0 : 1);
}

run().catch(async (err) => {
  console.error("Verification failed with error:", err);
  await sequelize.close();
  process.exit(1);
});
