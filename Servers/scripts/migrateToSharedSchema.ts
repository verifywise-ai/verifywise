/**
 * Migrate Tenant Data to Shared Schema
 *
 * This script migrates data from old tenant schemas (e.g., "abc123".projects)
 * to the new shared verifywise schema (projects with organization_id).
 *
 * USAGE:
 *   npm run migrate:shared-schema
 *   OR automatically on server startup
 *
 * PREREQUISITES:
 *   1. Run database migrations first: npx sequelize db:migrate
 *   2. Backup your database before running this script
 *
 * WHAT THIS SCRIPT DOES:
 *   1. Finds all organizations with tenant schemas
 *   2. For each tenant, copies data from tenant schema to verifywise schema
 *   3. Remaps all foreign key references using in-memory mapping
 *   4. Validates row counts match
 *   5. Drops tenant schemas after successful migration (configurable)
 */

import { sequelize } from "../database/db";
import { QueryTypes, Transaction } from "sequelize";
import { createHash } from "crypto";
import {
  FK_MAPPINGS,
  STRUCT_REFERENCES,
  SKIP_TABLES,
  TARGET_TABLE_MAP,
  MIGRATION_KEY,
  BATCH_SIZE,
  getAllTablesInOrder,
  IdMapping,
  ValidationReport,
  MigrationResult,
} from "./migrationConfig";

// ============================================================
// COLUMN TYPE MAPPINGS
// ============================================================

/**
 * PostgreSQL ARRAY columns in the VERIFYWISE schema that should NOT be JSON.stringify'd
 * These need to stay as JavaScript arrays for Sequelize to convert properly
 *
 * NOTE: Only include columns where BOTH tenant and verifywise schemas use ARRAY type.
 * If verifywise schema has JSONB but tenant has ARRAY, the array needs to be stringified.
 */
const POSTGRES_ARRAY_COLUMNS: Record<string, string[]> = {
  answers_eu: ['dropdown_options'],
  evidence_hub: ['mapped_model_ids'],
  policy_manager: ['tags'],
  risks: ['risk_category'],
  shadow_ai_tools: ['domains'],
};

/**
 * Check if a column is a PostgreSQL ARRAY type (not JSONB)
 */
const isPostgresArrayColumn = (tableName: string, columnName: string): boolean => {
  return POSTGRES_ARRAY_COLUMNS[tableName]?.includes(columnName) || false;
};

/**
 * Check if a table has an 'id' column in a given schema.
 * Always checks the actual database — no static lists.
 */
async function checkTableHasIdColumn(
  schemaName: string,
  tableName: string,
  transaction?: Transaction
): Promise<boolean> {
  const result = await sequelize.query(
    `SELECT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = :schemaName
        AND table_name = :tableName
        AND column_name = 'id'
    ) as exists`,
    { replacements: { schemaName, tableName }, type: QueryTypes.SELECT, transaction }
  );
  return (result[0] as any).exists;
}

// ============================================================
// UTILITY FUNCTIONS
// ============================================================

/**
 * Generate tenant hash from organization ID (same as getTenantHash)
 */
const getTenantHash = (orgId: number): string => {
  const hash = createHash("sha256").update(orgId.toString()).digest("base64");
  return hash.replace(/[^a-zA-Z0-9]/g, "").slice(0, 10);
};

/**
 * Check if a schema exists
 */
async function schemaExists(
  schemaName: string,
  transaction?: Transaction
): Promise<boolean> {
  const result = await sequelize.query(
    `SELECT EXISTS (
      SELECT 1 FROM information_schema.schemata WHERE schema_name = :schemaName
    ) as exists`,
    { replacements: { schemaName }, type: QueryTypes.SELECT, transaction }
  );
  return (result[0] as any).exists;
}

/**
 * Check if a table exists in a schema
 */
async function tableExists(
  schemaName: string,
  tableName: string,
  transaction?: Transaction
): Promise<boolean> {
  const result = await sequelize.query(
    `SELECT EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = :schemaName AND table_name = :tableName
    ) as exists`,
    { replacements: { schemaName, tableName }, type: QueryTypes.SELECT, transaction }
  );
  return (result[0] as any).exists;
}

/**
 * Get row count from a table
 */
async function getRowCount(
  schemaName: string,
  tableName: string,
  transaction?: Transaction,
  organizationId?: number
): Promise<number> {
  const exists = await tableExists(schemaName, tableName, transaction);
  if (!exists) return 0;

  let query = `SELECT COUNT(*) as count FROM "${schemaName}"."${tableName}"`;
  const replacements: any = {};

  if (organizationId !== undefined && schemaName === "verifywise") {
    query += ` WHERE organization_id = :organizationId`;
    replacements.organizationId = organizationId;
  }

  const result = await sequelize.query(query, {
    type: QueryTypes.SELECT,
    transaction,
    replacements,
  });
  return parseInt((result[0] as any).count, 10);
}

/**
 * Get column names for a table (excluding 'id' and 'organization_id')
 */
/**
 * Tables with non-serial ID columns (VARCHAR/UUID) that must be explicitly inserted.
 * These IDs are application-generated, not auto-incremented by PostgreSQL.
 */
const TABLES_WITH_STRING_ID: string[] = [
  'llm_evals_organizations',
  'llm_evals_projects',
  'llm_evals_models',
  'llm_evals_scorers',
  'llm_evals_experiments',
  'llm_evals_arena_comparisons',
  'llm_evals_bias_audits',
  'llm_evals_logs',
  'llm_evals_metrics',
];

async function getTableColumns(
  schemaName: string,
  tableName: string,
  transaction?: Transaction
): Promise<string[]> {
  const result = await sequelize.query(
    `SELECT column_name
     FROM information_schema.columns
     WHERE table_schema = :schemaName AND table_name = :tableName
     ORDER BY ordinal_position`,
    { replacements: { schemaName, tableName }, type: QueryTypes.SELECT, transaction }
  );

  const keepId = TABLES_WITH_STRING_ID.includes(tableName);
  return (result as any[])
    .map((r) => r.column_name)
    .filter((col) => col !== "organization_id" && (col !== "id" || keepId));
}

/**
 * Check if verifywise table has organization_id column
 */
async function hasOrganizationIdColumn(
  tableName: string,
  transaction?: Transaction
): Promise<boolean> {
  const result = await sequelize.query(
    `SELECT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'verifywise'
        AND table_name = :tableName
        AND column_name = 'organization_id'
    ) as exists`,
    { replacements: { tableName }, type: QueryTypes.SELECT, transaction }
  );
  return (result[0] as any).exists;
}

// ============================================================
// GENERIC TABLE MIGRATION
// ============================================================

/**
 * Migrate a single table from tenant schema to verifywise schema
 */
async function migrateTable(
  orgId: number,
  tenantHash: string,
  tableName: string,
  idMapping: IdMapping,
  transaction: Transaction
): Promise<{ sourceCount: number; migratedCount: number }> {
  // Check if source table exists
  const sourceExists = await tableExists(tenantHash, tableName, transaction);
  if (!sourceExists) {
    return { sourceCount: 0, migratedCount: 0 };
  }

  // Resolve target table name (handles renames like automation_actions -> automation_actions_data)
  const targetTableName = TARGET_TABLE_MAP[tableName] || tableName;

  // Get row count
  const sourceCount = await getRowCount(tenantHash, tableName, transaction);
  if (sourceCount === 0) {
    return { sourceCount: 0, migratedCount: 0 };
  }

  // Get columns that exist in BOTH source (tenant) and target (verifywise) tables
  const sourceColumns = await getTableColumns(tenantHash, tableName, transaction);
  const targetColumns = await getTableColumns("verifywise", targetTableName, transaction);

  const targetColumnSet = new Set(targetColumns);
  const commonColumns = sourceColumns.filter(col => targetColumnSet.has(col));

  // Debug logging for column detection
  if (sourceColumns.length !== commonColumns.length) {
    const skippedCols = sourceColumns.filter(col => !targetColumnSet.has(col));
    console.log(`    ℹ️  ${tableName}: skipping columns not in verifywise schema: ${skippedCols.join(', ')}`);
  }

  if (commonColumns.length === 0) {
    console.log(`    ⊘ ${tableName}: no common columns between tenant and verifywise schema`);
    return { sourceCount: 0, migratedCount: 0 };
  }

  // Check for NOT NULL target columns that are missing from source (would cause insert failure)
  const sourceColumnSet = new Set(sourceColumns);
  const notNullMissing = (await sequelize.query(
    `SELECT column_name FROM information_schema.columns
     WHERE table_schema = 'verifywise' AND table_name = :tableName
       AND is_nullable = 'NO' AND column_default IS NULL
       AND column_name != 'id' AND column_name != 'organization_id'`,
    { replacements: { tableName: targetTableName }, type: QueryTypes.SELECT, transaction }
  ) as any[]).filter(r => !sourceColumnSet.has(r.column_name)).map(r => r.column_name);

  if (notNullMissing.length > 0) {
    console.log(`    ⊘ ${tableName}: skipping — target has NOT NULL columns missing from source: ${notNullMissing.join(', ')}`);
    return { sourceCount, migratedCount: 0 };
  }

  // Check if target has organization_id
  const hasOrgId = await hasOrganizationIdColumn(targetTableName, transaction);

  // Get FK mappings for this table
  const fkMappings = FK_MAPPINGS[tableName] || {};

  // Check if this table references struct tables (meta_id columns shouldn't be remapped)
  const isStructReference = STRUCT_REFERENCES.includes(tableName);

  // Check if source table has an id column (for ID mapping)
  const hasIdColumn = await checkTableHasIdColumn(tenantHash, tableName, transaction);

  // Initialize mapping for this table (only if it has an id column)
  if (hasIdColumn && !idMapping[tableName]) {
    idMapping[tableName] = {};
  }

  // Fetch all rows from source in batches
  let offset = 0;
  let migratedCount = 0;

  while (offset < sourceCount) {
    const orderClause = hasIdColumn ? 'ORDER BY id' : 'ORDER BY 1';
    const rows = (await sequelize.query(
      `SELECT * FROM "${tenantHash}"."${tableName}" ${orderClause} LIMIT :limit OFFSET :offset`,
      {
        replacements: { limit: BATCH_SIZE, offset },
        type: QueryTypes.SELECT,
        transaction,
      }
    )) as any[];

    if (rows.length === 0) break;

    // Process each row
    for (const row of rows) {
      const oldId = hasIdColumn ? row.id : null;
      const insertData: Record<string, any> = {};

      // Copy columns, applying FK mappings where needed
      for (const col of commonColumns) {
        let value = row[col];

        // Apply FK mapping if this column references another migrated table
        if (fkMappings[col] && value !== null && value !== undefined) {
          const sourceTable = fkMappings[col];

          // Skip remapping for struct references (meta_id columns point to verifywise struct tables)
          if (isStructReference && col.endsWith("_meta_id")) {
            // Keep original value - it references verifywise schema struct data
            insertData[col] = value;
          } else if (idMapping[sourceTable] && idMapping[sourceTable][value]) {
            // Remap to new ID
            insertData[col] = idMapping[sourceTable][value];
          } else {
            // FK target not found - debug info
            const hasTable = !!idMapping[sourceTable];
            const mappingKeys = hasTable ? Object.keys(idMapping[sourceTable]).slice(0, 5) : [];
            console.log(`    ⚠️ ${tableName}.${col}: FK ${value} not found in idMapping['${sourceTable}'] (exists=${hasTable}, keys=${JSON.stringify(mappingKeys)}) → NULL`);
            insertData[col] = null;
          }
        } else {
          insertData[col] = value;
        }
      }

      // Build INSERT statement
      const targetCols = hasOrgId
        ? ["organization_id", ...commonColumns]
        : commonColumns;

      // Helper to serialize values based on column type
      // - PostgreSQL ARRAY columns: keep as JavaScript array
      // - JSONB columns: stringify objects AND arrays
      const serializeValue = (columnName: string, val: any): any => {
        if (val === null || val === undefined) return val;
        if (val instanceof Date) return val;

        // Check if this is a PostgreSQL ARRAY column (not JSONB)
        if (isPostgresArrayColumn(tableName, columnName)) {
          // Keep as JavaScript array - Sequelize handles conversion to PG array
          return val;
        }

        // For JSONB columns and other object types, stringify
        if (typeof val === 'object') {
          return JSON.stringify(val);
        }

        return val;
      };

      const targetValues = hasOrgId
        ? [orgId, ...commonColumns.map((c) => serializeValue(c, insertData[c]))]
        : commonColumns.map((c) => serializeValue(c, insertData[c]));

      const placeholders = targetValues.map((_, i) => `$${i + 1}`).join(", ");
      const columnList = targetCols.map((c) => `"${c}"`).join(", ");

      if (hasIdColumn) {
        // Use ON CONFLICT DO NOTHING to keep the transaction alive on duplicates.
        // RETURNING id only returns rows for actual inserts, not conflicts.
        const insertResult = await sequelize.query(
          `INSERT INTO "${targetTableName}" (${columnList})
           VALUES (${placeholders})
           ON CONFLICT DO NOTHING
           RETURNING id`,
          {
            bind: targetValues,
            type: QueryTypes.SELECT,
            transaction,
          }
        );

        if (insertResult.length > 0) {
          // Row was inserted — map old ID to new ID
          const newId = (insertResult[0] as any)?.id;
          if (newId !== undefined && oldId !== null) {
            idMapping[tableName][oldId] = newId;
          }
          migratedCount++;
        } else {
          // Conflict — row already exists. Find it and build the mapping.
          // This handles re-running migration on partially migrated data.
          if (oldId !== null && hasOrgId) {
            const existing = await sequelize.query(
              `SELECT id FROM "${targetTableName}"
               WHERE organization_id = $1
               ORDER BY id
               LIMIT 1 OFFSET $2`,
              {
                bind: [orgId, migratedCount],
                type: QueryTypes.SELECT,
                transaction,
              }
            );
            if (existing.length > 0) {
              idMapping[tableName][oldId] = (existing[0] as any).id;
              migratedCount++;
            }
          }
        }
      } else {
        await sequelize.query(
          `INSERT INTO "${targetTableName}" (${columnList})
           VALUES (${placeholders})
           ON CONFLICT DO NOTHING`,
          {
            bind: targetValues,
            type: QueryTypes.INSERT,
            transaction,
          }
        );
        migratedCount++;
      }
    }

    offset += BATCH_SIZE;
  }

  if (migratedCount > 0) {
    console.log(`    ✓ ${tableName}: ${migratedCount} rows`);
  }

  return { sourceCount, migratedCount };
}

// ============================================================
// CUSTOM FRAMEWORK STRUCT/IMPL MIGRATION
// ============================================================

/**
 * Convert JS array to PostgreSQL array literal
 */
function toPgArray(arr: any[] | null | undefined): string {
  if (!arr || !Array.isArray(arr) || arr.length === 0) return '{}';
  const escaped = arr.map((item) => {
    const escapedItem = String(item).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    return `"${escapedItem}"`;
  });
  return `{${escaped.join(',')}}`;
}

/**
 * Global struct map shared across orgs to avoid duplicating struct data.
 * Tracks which plugin_keys already have struct rows populated.
 */
interface GlobalStructMap {
  definitions: Record<string, number>;       // pluginKey → definition_id
  structPopulated: Record<string, boolean>;  // pluginKey → true
  level1: Record<string, Record<number, number>>;  // pluginKey → { order_no → struct_id }
  level2: Record<string, Record<string, number>>;  // pluginKey → { "l1StructId-orderNo" → struct_id }
  level3: Record<string, Record<string, number>>;  // pluginKey → { "l2StructId-orderNo" → struct_id }
}

/**
 * Migrate custom framework data from tenant schema to verifywise schema
 * using the struct/impl split pattern.
 */
interface CustomFrameworkIdMaps {
  l2IdMap: Record<number, number>;
  l3IdMap: Record<number, number>;
  l2ImplIdMap: Record<number, number>;
  l3ImplIdMap: Record<number, number>;
}

/**
 * Phase 1: Migrate custom framework definitions and struct data.
 * Runs BEFORE general migration so cfIdMaps are available for file_entity_links.
 * Returns struct-level ID maps (l2, l3) and framework ID map for phase 2.
 */
interface CfPhase1Result {
  totalMigrated: number;
  l2IdMap: Record<number, number>;
  l3IdMap: Record<number, number>;
  fwIdMap: Record<number, number>;
  l1IdMap: Record<number, number>;
}

async function migrateCustomFrameworkPhase1(
  orgId: number,
  tenantHash: string,
  globalStructMap: GlobalStructMap,
  transaction: Transaction
): Promise<CfPhase1Result> {
  let totalMigrated = 0;
  const emptyResult: CfPhase1Result = { totalMigrated: 0, l2IdMap: {}, l3IdMap: {}, fwIdMap: {}, l1IdMap: {} };

  const hasCF = await tableExists(tenantHash, 'custom_frameworks', transaction);
  if (!hasCF) return emptyResult;

  const tenantFrameworks = (await sequelize.query(
    `SELECT * FROM "${tenantHash}".custom_frameworks ORDER BY id`,
    { type: QueryTypes.SELECT, transaction }
  )) as any[];
  if (tenantFrameworks.length === 0) return emptyResult;

  const fwIdMap: Record<number, number> = {};
  const l1IdMap: Record<number, number> = {};
  const l2IdMap: Record<number, number> = {};
  const l3IdMap: Record<number, number> = {};

  for (const fw of tenantFrameworks) {
    const pluginKey = fw.plugin_key;
    if (!pluginKey) continue;

    // 1a. Ensure definition exists (shared, no org_id)
    let defId: number;
    if (globalStructMap.definitions[pluginKey]) {
      defId = globalStructMap.definitions[pluginKey];
    } else {
      const existingDef = (await sequelize.query(
        `SELECT id FROM custom_framework_definitions WHERE plugin_key = :pluginKey LIMIT 1`,
        { replacements: { pluginKey }, type: QueryTypes.SELECT, transaction }
      )) as any[];

      if (existingDef.length > 0) {
        defId = existingDef[0].id;
      } else {
        const insertedDef = (await sequelize.query(
          `INSERT INTO custom_framework_definitions
           (plugin_key, name, description, version, is_organizational, hierarchy_type,
            level_1_name, level_2_name, level_3_name, file_source, created_at, updated_at)
           VALUES (:pluginKey, :name, :description, :version, :isOrg, :hierarchyType,
                   :l1Name, :l2Name, :l3Name, :fileSource, :createdAt, :updatedAt)
           RETURNING id`,
          {
            replacements: {
              pluginKey,
              name: fw.name,
              description: fw.description,
              version: fw.version || '1.0.0',
              isOrg: fw.is_organizational || false,
              hierarchyType: fw.hierarchy_type || 'two_level',
              l1Name: fw.level_1_name || 'Category',
              l2Name: fw.level_2_name || 'Control',
              l3Name: fw.level_3_name || null,
              fileSource: fw.file_source || null,
              createdAt: fw.created_at || new Date(),
              updatedAt: fw.updated_at || new Date(),
            },
            type: QueryTypes.SELECT,
            transaction,
          }
        )) as any[];
        defId = insertedDef[0].id;
      }
      globalStructMap.definitions[pluginKey] = defId;
    }

    // 1b. Create per-org custom_frameworks record
    const insertedFw = (await sequelize.query(
      `INSERT INTO custom_frameworks
       (organization_id, definition_id, plugin_key, name, description, version,
        is_organizational, hierarchy_type, level_1_name, level_2_name, level_3_name,
        file_source, created_at, updated_at)
       VALUES (:orgId, :defId, :pluginKey, :name, :description, :version,
               :isOrg, :hierarchyType, :l1Name, :l2Name, :l3Name,
               :fileSource, :createdAt, :updatedAt)
       RETURNING id`,
      {
        replacements: {
          orgId, defId, pluginKey,
          name: fw.name, description: fw.description, version: fw.version || '1.0.0',
          isOrg: fw.is_organizational || false, hierarchyType: fw.hierarchy_type || 'two_level',
          l1Name: fw.level_1_name || 'Category', l2Name: fw.level_2_name || 'Control',
          l3Name: fw.level_3_name || null, fileSource: fw.file_source || null,
          createdAt: fw.created_at || new Date(), updatedAt: fw.updated_at || new Date(),
        },
        type: QueryTypes.SELECT, transaction,
      }
    )) as any[];
    fwIdMap[fw.id] = insertedFw[0].id;
    totalMigrated++;

    // 2. Populate struct tables (only if not already done for this plugin_key)
    const needsStruct = !globalStructMap.structPopulated[pluginKey];

    if (needsStruct) {
      const hasL1 = await tableExists(tenantHash, 'custom_framework_level1', transaction);
      if (hasL1) {
        const l1Rows = (await sequelize.query(
          `SELECT * FROM "${tenantHash}".custom_framework_level1 WHERE framework_id = :fwId ORDER BY order_no, id`,
          { replacements: { fwId: fw.id }, type: QueryTypes.SELECT, transaction }
        )) as any[];

        for (const l1 of l1Rows) {
          const inserted = (await sequelize.query(
            `INSERT INTO custom_framework_level1_struct
             (definition_id, title, description, order_no, metadata, created_at)
             VALUES (:defId, :title, :description, :orderNo, :metadata::jsonb, :createdAt)
             RETURNING id`,
            {
              replacements: {
                defId, title: l1.title, description: l1.description,
                orderNo: l1.order_no || 1, metadata: JSON.stringify(l1.metadata || {}),
                createdAt: l1.created_at || new Date(),
              },
              type: QueryTypes.SELECT, transaction,
            }
          )) as any[];
          l1IdMap[l1.id] = inserted[0].id;
          if (!globalStructMap.level1[pluginKey]) globalStructMap.level1[pluginKey] = {};
          globalStructMap.level1[pluginKey][l1.order_no || 1] = inserted[0].id;
          totalMigrated++;
        }

        const hasL2 = await tableExists(tenantHash, 'custom_framework_level2', transaction);
        if (hasL2) {
          const oldL1Ids = Object.keys(l1IdMap).map(Number);
          if (oldL1Ids.length > 0) {
            const l2Rows = (await sequelize.query(
              `SELECT * FROM "${tenantHash}".custom_framework_level2 WHERE level1_id IN (:l1Ids) ORDER BY level1_id, order_no, id`,
              { replacements: { l1Ids: oldL1Ids }, type: QueryTypes.SELECT, transaction }
            )) as any[];

            for (const l2 of l2Rows) {
              const newL1Id = l1IdMap[l2.level1_id];
              if (!newL1Id) continue;
              const inserted = (await sequelize.query(
                `INSERT INTO custom_framework_level2_struct
                 (level1_id, title, description, order_no, summary, questions, evidence_examples, metadata, created_at)
                 VALUES (:l1Id, :title, :description, :orderNo, :summary, :questions::text[], :evidenceExamples::text[], :metadata::jsonb, :createdAt)
                 RETURNING id`,
                {
                  replacements: {
                    l1Id: newL1Id, title: l2.title, description: l2.description,
                    orderNo: l2.order_no || 1, summary: l2.summary || null,
                    questions: toPgArray(l2.questions), evidenceExamples: toPgArray(l2.evidence_examples),
                    metadata: JSON.stringify(l2.metadata || {}), createdAt: l2.created_at || new Date(),
                  },
                  type: QueryTypes.SELECT, transaction,
                }
              )) as any[];
              l2IdMap[l2.id] = inserted[0].id;
              if (!globalStructMap.level2[pluginKey]) globalStructMap.level2[pluginKey] = {};
              globalStructMap.level2[pluginKey][`${newL1Id}-${l2.order_no || 1}`] = inserted[0].id;
              totalMigrated++;
            }

            const hasL3 = await tableExists(tenantHash, 'custom_framework_level3', transaction);
            if (hasL3) {
              const oldL2Ids = Object.keys(l2IdMap).map(Number);
              if (oldL2Ids.length > 0) {
                const l3Rows = (await sequelize.query(
                  `SELECT * FROM "${tenantHash}".custom_framework_level3 WHERE level2_id IN (:l2Ids) ORDER BY level2_id, order_no, id`,
                  { replacements: { l2Ids: oldL2Ids }, type: QueryTypes.SELECT, transaction }
                )) as any[];

                for (const l3 of l3Rows) {
                  const newL2Id = l2IdMap[l3.level2_id];
                  if (!newL2Id) continue;
                  const inserted = (await sequelize.query(
                    `INSERT INTO custom_framework_level3_struct
                     (level2_id, title, description, order_no, summary, questions, evidence_examples, metadata, created_at)
                     VALUES (:l2Id, :title, :description, :orderNo, :summary, :questions::text[], :evidenceExamples::text[], :metadata::jsonb, :createdAt)
                     RETURNING id`,
                    {
                      replacements: {
                        l2Id: newL2Id, title: l3.title, description: l3.description,
                        orderNo: l3.order_no || 1, summary: l3.summary || null,
                        questions: toPgArray(l3.questions), evidenceExamples: toPgArray(l3.evidence_examples),
                        metadata: JSON.stringify(l3.metadata || {}), createdAt: l3.created_at || new Date(),
                      },
                      type: QueryTypes.SELECT, transaction,
                    }
                  )) as any[];
                  l3IdMap[l3.id] = inserted[0].id;
                  if (!globalStructMap.level3[pluginKey]) globalStructMap.level3[pluginKey] = {};
                  globalStructMap.level3[pluginKey][`${newL2Id}-${l3.order_no || 1}`] = inserted[0].id;
                  totalMigrated++;
                }
              }
            }
          }
        }
      }
      globalStructMap.structPopulated[pluginKey] = true;
    } else {
      // Struct already populated — build ID maps via position matching
      const hasL1 = await tableExists(tenantHash, 'custom_framework_level1', transaction);
      if (hasL1) {
        const l1Rows = (await sequelize.query(
          `SELECT * FROM "${tenantHash}".custom_framework_level1 WHERE framework_id = :fwId ORDER BY order_no, id`,
          { replacements: { fwId: fw.id }, type: QueryTypes.SELECT, transaction }
        )) as any[];
        for (const l1 of l1Rows) {
          const structId = globalStructMap.level1[pluginKey]?.[l1.order_no || 1];
          if (structId) l1IdMap[l1.id] = structId;
        }

        const hasL2 = await tableExists(tenantHash, 'custom_framework_level2', transaction);
        if (hasL2) {
          const oldL1Ids = Object.keys(l1IdMap).map(Number);
          if (oldL1Ids.length > 0) {
            const l2Rows = (await sequelize.query(
              `SELECT * FROM "${tenantHash}".custom_framework_level2 WHERE level1_id IN (:l1Ids) ORDER BY level1_id, order_no, id`,
              { replacements: { l1Ids: oldL1Ids }, type: QueryTypes.SELECT, transaction }
            )) as any[];
            for (const l2 of l2Rows) {
              const newL1Id = l1IdMap[l2.level1_id];
              if (!newL1Id) continue;
              const structId = globalStructMap.level2[pluginKey]?.[`${newL1Id}-${l2.order_no || 1}`];
              if (structId) l2IdMap[l2.id] = structId;
            }

            const hasL3 = await tableExists(tenantHash, 'custom_framework_level3', transaction);
            if (hasL3) {
              const oldL2Ids = Object.keys(l2IdMap).map(Number);
              if (oldL2Ids.length > 0) {
                const l3Rows = (await sequelize.query(
                  `SELECT * FROM "${tenantHash}".custom_framework_level3 WHERE level2_id IN (:l2Ids) ORDER BY level2_id, order_no, id`,
                  { replacements: { l2Ids: oldL2Ids }, type: QueryTypes.SELECT, transaction }
                )) as any[];
                for (const l3 of l3Rows) {
                  const newL2Id = l2IdMap[l3.level2_id];
                  if (!newL2Id) continue;
                  const structId = globalStructMap.level3[pluginKey]?.[`${newL2Id}-${l3.order_no || 1}`];
                  if (structId) l3IdMap[l3.id] = structId;
                }
              }
            }
          }
        }
      }
    }
  }

  if (totalMigrated > 0) console.log(`    ✓ custom_frameworks (phase 1 - defs/struct): ${tenantFrameworks.length} frameworks, ${totalMigrated} rows`);
  return { totalMigrated, l2IdMap, l3IdMap, fwIdMap, l1IdMap };
}

/**
 * Phase 2: Migrate custom framework project associations, impl data, and risks.
 * Runs AFTER general migration so idMapping['projects'] and idMapping['risks'] are available.
 */
async function migrateCustomFrameworkPhase2(
  orgId: number,
  tenantHash: string,
  phase1: CfPhase1Result,
  idMapping: IdMapping,
  transaction: Transaction
): Promise<CustomFrameworkIdMaps> {
  const emptyMaps: CustomFrameworkIdMaps = { l2IdMap: phase1.l2IdMap, l3IdMap: phase1.l3IdMap, l2ImplIdMap: {}, l3ImplIdMap: {} };
  let totalMigrated = 0;

  const hasCF = await tableExists(tenantHash, 'custom_frameworks', transaction);
  if (!hasCF) return emptyMaps;

  const { fwIdMap, l2IdMap, l3IdMap } = phase1;
  if (Object.keys(fwIdMap).length === 0) return emptyMaps;

  const projFwIdMap: Record<number, number> = {};
  const l2ImplIdMap: Record<number, number> = {};
  const l3ImplIdMap: Record<number, number> = {};

  // 3. custom_framework_projects — remap project_id using idMapping['projects']
  const hasCFP = await tableExists(tenantHash, 'custom_framework_projects', transaction);
  if (hasCFP) {
    const projRows = (await sequelize.query(
      `SELECT * FROM "${tenantHash}".custom_framework_projects ORDER BY id`,
      { type: QueryTypes.SELECT, transaction }
    )) as any[];

    for (const proj of projRows) {
      const newFwId = fwIdMap[proj.framework_id];
      if (!newFwId) continue;

      // Remap project_id: old tenant ID → new verifywise ID
      let newProjectId = proj.project_id;
      if (idMapping['projects'] && idMapping['projects'][proj.project_id]) {
        newProjectId = idMapping['projects'][proj.project_id];
      }

      const insertResult = await sequelize.query(
        `INSERT INTO custom_framework_projects
         (organization_id, framework_id, project_id, created_at)
         VALUES (:orgId, :fwId, :projectId, :createdAt)
         ON CONFLICT DO NOTHING
         RETURNING id`,
        {
          replacements: { orgId, fwId: newFwId, projectId: newProjectId, createdAt: proj.created_at || new Date() },
          type: QueryTypes.SELECT, transaction,
        }
      ) as any[];
      if (insertResult.length > 0) {
        projFwIdMap[proj.id] = insertResult[0].id;
      } else {
        // Conflict — find existing
        const existing = (await sequelize.query(
          `SELECT id FROM custom_framework_projects
           WHERE organization_id = :orgId AND framework_id = :fwId AND project_id = :projectId LIMIT 1`,
          { replacements: { orgId, fwId: newFwId, projectId: newProjectId }, type: QueryTypes.SELECT, transaction }
        )) as any[];
        if (existing[0]?.id) projFwIdMap[proj.id] = existing[0].id;
      }
      totalMigrated++;
    }
    if (Object.keys(projFwIdMap).length > 0) console.log(`    ✓ custom_framework_projects: ${Object.keys(projFwIdMap).length} rows`);
  }

  // 4. level2_impl
  const hasL2Impl = await tableExists(tenantHash, 'custom_framework_level2_impl', transaction);
  if (hasL2Impl) {
    const implRows = (await sequelize.query(
      `SELECT * FROM "${tenantHash}".custom_framework_level2_impl ORDER BY id`,
      { type: QueryTypes.SELECT, transaction }
    )) as any[];

    for (const impl of implRows) {
      const newL2Id = l2IdMap[impl.level2_id];
      const newProjFwId = projFwIdMap[impl.project_framework_id];
      if (!newL2Id || !newProjFwId) continue;
      const inserted = (await sequelize.query(
        `INSERT INTO custom_framework_level2_impl
         (organization_id, level2_id, project_framework_id, status, owner, reviewer, approver,
          due_date, implementation_details, evidence_links, feedback_links, auditor_feedback,
          is_demo, created_at, updated_at)
         VALUES (:orgId, :l2Id, :projFwId, :status, :owner, :reviewer, :approver,
                 :dueDate, :implDetails, :evidenceLinks::jsonb, :feedbackLinks::jsonb, :auditorFeedback,
                 :isDemo, :createdAt, :updatedAt)
         RETURNING id`,
        {
          replacements: {
            orgId, l2Id: newL2Id, projFwId: newProjFwId,
            status: impl.status || 'Not started', owner: impl.owner || null,
            reviewer: impl.reviewer || null, approver: impl.approver || null,
            dueDate: impl.due_date || null, implDetails: impl.implementation_details || null,
            evidenceLinks: JSON.stringify(impl.evidence_links || []),
            feedbackLinks: JSON.stringify(impl.feedback_links || []),
            auditorFeedback: impl.auditor_feedback || null, isDemo: impl.is_demo || false,
            createdAt: impl.created_at || new Date(), updatedAt: impl.updated_at || new Date(),
          },
          type: QueryTypes.SELECT, transaction,
        }
      )) as any[];
      l2ImplIdMap[impl.id] = inserted[0].id;
      totalMigrated++;
    }
    if (Object.keys(l2ImplIdMap).length > 0) console.log(`    ✓ custom_framework_level2_impl: ${Object.keys(l2ImplIdMap).length} rows`);
  }

  // 5. level3_impl
  const hasL3Impl = await tableExists(tenantHash, 'custom_framework_level3_impl', transaction);
  if (hasL3Impl) {
    const implRows = (await sequelize.query(
      `SELECT * FROM "${tenantHash}".custom_framework_level3_impl ORDER BY id`,
      { type: QueryTypes.SELECT, transaction }
    )) as any[];

    for (const impl of implRows) {
      const newL3Id = l3IdMap[impl.level3_id];
      const newL2ImplId = l2ImplIdMap[impl.level2_impl_id];
      if (!newL3Id || !newL2ImplId) continue;
      const inserted = (await sequelize.query(
        `INSERT INTO custom_framework_level3_impl
         (organization_id, level3_id, level2_impl_id, status, owner, reviewer, approver,
          due_date, implementation_details, evidence_links, feedback_links, auditor_feedback,
          is_demo, created_at, updated_at)
         VALUES (:orgId, :l3Id, :l2ImplId, :status, :owner, :reviewer, :approver,
                 :dueDate, :implDetails, :evidenceLinks::jsonb, :feedbackLinks::jsonb, :auditorFeedback,
                 :isDemo, :createdAt, :updatedAt)
         RETURNING id`,
        {
          replacements: {
            orgId, l3Id: newL3Id, l2ImplId: newL2ImplId,
            status: impl.status || 'Not started', owner: impl.owner || null,
            reviewer: impl.reviewer || null, approver: impl.approver || null,
            dueDate: impl.due_date || null, implDetails: impl.implementation_details || null,
            evidenceLinks: JSON.stringify(impl.evidence_links || []),
            feedbackLinks: JSON.stringify(impl.feedback_links || []),
            auditorFeedback: impl.auditor_feedback || null, isDemo: impl.is_demo || false,
            createdAt: impl.created_at || new Date(), updatedAt: impl.updated_at || new Date(),
          },
          type: QueryTypes.SELECT, transaction,
        }
      )) as any[];
      l3ImplIdMap[impl.id] = inserted[0].id;
      totalMigrated++;
    }
    if (Object.keys(l3ImplIdMap).length > 0) console.log(`    ✓ custom_framework_level3_impl: ${Object.keys(l3ImplIdMap).length} rows`);
  }

  // 6. Risk tables — remap risk_id using idMapping['risks']
  for (const [riskTable, implIdMap, implCol] of [
    ['custom_framework_level2_risks', l2ImplIdMap, 'level2_impl_id'],
    ['custom_framework_level3_risks', l3ImplIdMap, 'level3_impl_id'],
  ] as const) {
    const hasRisks = await tableExists(tenantHash, riskTable, transaction);
    if (!hasRisks) continue;
    const riskRows = (await sequelize.query(
      `SELECT * FROM "${tenantHash}"."${riskTable}"`,
      { type: QueryTypes.SELECT, transaction }
    )) as any[];

    let riskCount = 0;
    for (const risk of riskRows) {
      const newImplId = (implIdMap as Record<number, number>)[risk[implCol]];
      if (!newImplId) continue;

      // Remap risk_id: old tenant ID → new verifywise ID
      let newRiskId = risk.risk_id;
      if (idMapping['risks'] && idMapping['risks'][risk.risk_id]) {
        newRiskId = idMapping['risks'][risk.risk_id];
      }

      await sequelize.query(
        `INSERT INTO "${riskTable}" (organization_id, "${implCol}", risk_id)
         VALUES (:orgId, :implId, :riskId)
         ON CONFLICT ("${implCol}", risk_id) DO NOTHING`,
        { replacements: { orgId, implId: newImplId, riskId: newRiskId }, transaction }
      );
      riskCount++;
    }
    if (riskCount > 0) { console.log(`    ✓ ${riskTable}: ${riskCount} rows`); totalMigrated += riskCount; }
  }

  if (totalMigrated > 0) console.log(`    ✓ custom_frameworks (phase 2 - projects/impl/risks): ${totalMigrated} rows`);
  return { l2IdMap, l3IdMap, l2ImplIdMap, l3ImplIdMap };
}

// ============================================================
// NIST AI RMF MIGRATION
// ============================================================

/**
 * Migrate NIST AI RMF data from old tenant schema to verifywise schema.
 *
 * The old tenant table has inline metadata (index, title, description, category_id,
 * evidence_links, tags) while the new verifywise schema uses a struct/impl split
 * (subcategory_meta_id FK to nist_ai_rmf_subcategories_struct).
 *
 * This function:
 * 1. Reads old subcategories from tenant schema
 * 2. Matches each to its struct entry by description text or function+subcategory_id
 * 3. Creates new impl rows with proper subcategory_meta_id and remapped projects_frameworks_id
 * 4. Migrates nist_ai_rmf_subcategories__risks junction with remapped IDs
 * 5. Converts old evidence_links JSON → file_entity_links rows
 *
 * Must run AFTER general migration (needs idMapping['projects_frameworks'], idMapping['risks'], idMapping['files']).
 */
async function migrateNistAiRmfData(
  orgId: number,
  tenantHash: string,
  idMapping: IdMapping,
  transaction: Transaction
): Promise<{ subcategoriesMigrated: number; risksMigrated: number }> {
  // Check if tenant has nist_ai_rmf_subcategories table
  const hasSubcats = await tableExists(tenantHash, 'nist_ai_rmf_subcategories', transaction);
  if (!hasSubcats) return { subcategoriesMigrated: 0, risksMigrated: 0 };

  // Read old subcategories from tenant schema
  const oldRows = (await sequelize.query(
    `SELECT * FROM "${tenantHash}".nist_ai_rmf_subcategories ORDER BY id`,
    { type: QueryTypes.SELECT, transaction }
  )) as any[];

  if (!oldRows.length) return { subcategoriesMigrated: 0, risksMigrated: 0 };

  // Get struct subcategories for matching
  const structRows = (await sequelize.query(
    `SELECT id, function, subcategory_id, description, category_struct_id
     FROM nist_ai_rmf_subcategories_struct`,
    { type: QueryTypes.SELECT, transaction }
  )) as any[];

  // Build lookup by description (most reliable matching key for NIST standard text)
  const structByDesc: Record<string, number> = {};
  for (const s of structRows) {
    if (s.description) {
      structByDesc[s.description.trim().toLowerCase()] = s.id;
    }
  }

  // Build lookup by function+subcategory_id (e.g., "GOVERN:1.1")
  const structByFuncSubId: Record<string, number> = {};
  for (const s of structRows) {
    structByFuncSubId[`${s.function}:${s.subcategory_id}`] = s.id;
  }

  // Get categories struct for category_id → function mapping
  // Old tenant category_id may reference these struct IDs directly
  const categoryStructRows = (await sequelize.query(
    `SELECT id, function, category_id FROM nist_ai_rmf_categories_struct`,
    { type: QueryTypes.SELECT, transaction }
  )) as any[];
  const categoryFunctionMap: Record<number, string> = {};
  for (const c of categoryStructRows) {
    categoryFunctionMap[c.id] = c.function;
  }

  // Also check if old tenant has its own nist_ai_rmf_categories table
  const hasOldCategories = await tableExists(tenantHash, 'nist_ai_rmf_categories', transaction);
  let oldCategoryFunctionMap: Record<number, { function: string; index: number }> = {};
  if (hasOldCategories) {
    const oldCats = (await sequelize.query(
      `SELECT * FROM "${tenantHash}".nist_ai_rmf_categories ORDER BY id`,
      { type: QueryTypes.SELECT, transaction }
    )) as any[];

    // Old categories might have: id, title/function, index, function_id, etc.
    // Try to extract function name from available fields
    for (const cat of oldCats) {
      const funcName = cat.function || cat.title || '';
      oldCategoryFunctionMap[cat.id] = {
        function: funcName.toUpperCase(),
        index: cat.index ?? cat.category_id ?? cat.id,
      };
    }
  }

  // Migrate each subcategory
  const nistIdMapping: Record<number, number> = {};
  let migrated = 0;
  let skipped = 0;

  for (const row of oldRows) {
    // Resolve projects_frameworks_id via FK mapping
    let newPfId = row.projects_frameworks_id;
    if (newPfId !== null && newPfId !== undefined) {
      if (idMapping['projects_frameworks']?.[newPfId]) {
        newPfId = idMapping['projects_frameworks'][newPfId];
      } else {
        // projects_frameworks_id not found in mapping — orphaned row, skip
        skipped++;
        continue;
      }
    } else {
      skipped++;
      continue;
    }

    // Find matching struct subcategory using multiple strategies
    let structId: number | null = null;

    // Strategy 1: Match by description text (old title or description matches struct description)
    if (row.title) {
      structId = structByDesc[row.title.trim().toLowerCase()] ?? null;
    }
    if (!structId && row.description) {
      structId = structByDesc[row.description.trim().toLowerCase()] ?? null;
    }

    // Strategy 2: Match by function + subcategory_id using old category context
    if (!structId && row.category_id != null && row.index != null) {
      // Try old tenant categories first
      const oldCat = oldCategoryFunctionMap[row.category_id];
      if (oldCat) {
        structId = structByFuncSubId[`${oldCat.function}:${oldCat.index}.${row.index}`] ?? null;
      }
      // Try struct categories (old category_id might reference struct directly)
      if (!structId && categoryFunctionMap[row.category_id]) {
        const func = categoryFunctionMap[row.category_id];
        // The struct subcategory_id is "category_index.sub_index", we need the category's own index
        const catStruct = categoryStructRows.find((c: any) => c.id === row.category_id);
        if (catStruct) {
          structId = structByFuncSubId[`${func}:${catStruct.category_id}.${row.index}`] ?? null;
        }
      }
    }

    if (!structId) {
      console.log(`    ⚠️ NIST subcategory ${row.id}: no matching struct entry (title=${row.title?.substring(0, 40)}..., cat=${row.category_id}, idx=${row.index})`);
      skipped++;
      continue;
    }

    // Insert new impl row
    const insertResult = (await sequelize.query(
      `INSERT INTO nist_ai_rmf_subcategories (
        organization_id, subcategory_meta_id, projects_frameworks_id,
        implementation_description, status, auditor_feedback,
        owner, reviewer, approver, due_date,
        created_at, updated_at, is_demo
      ) VALUES (
        :orgId, :structId, :pfId,
        :implDesc, :status, :auditorFeedback,
        :owner, :reviewer, :approver, :dueDate,
        :createdAt, :updatedAt, :isDemo
      ) ON CONFLICT DO NOTHING RETURNING id`,
      {
        replacements: {
          orgId,
          structId,
          pfId: newPfId,
          implDesc: row.implementation_description || null,
          status: row.status || 'Not started',
          auditorFeedback: row.auditor_feedback || null,
          owner: row.owner || null,
          reviewer: row.reviewer || null,
          approver: row.approver || null,
          dueDate: row.due_date || null,
          createdAt: row.created_at || new Date(),
          updatedAt: row.updated_at || new Date(),
          isDemo: row.is_demo || false,
        },
        type: QueryTypes.SELECT,
        transaction,
      }
    )) as any[];

    if (insertResult.length > 0) {
      nistIdMapping[row.id] = insertResult[0].id;
      migrated++;
    }

    // Convert old evidence_links JSON → file_entity_links rows
    if (row.evidence_links && insertResult.length > 0) {
      const newSubcatId = insertResult[0].id;
      let evidenceArray: any[] = [];
      try {
        evidenceArray = typeof row.evidence_links === 'string'
          ? JSON.parse(row.evidence_links)
          : Array.isArray(row.evidence_links) ? row.evidence_links : [];
      } catch { /* ignore parse errors */ }

      for (const evidence of evidenceArray) {
        const oldFileId = evidence.id || evidence.file_id;
        if (!oldFileId) continue;
        const newFileId = idMapping['files']?.[oldFileId] || oldFileId;
        await sequelize.query(
          `INSERT INTO file_entity_links
            (organization_id, file_id, framework_type, entity_type, entity_id, link_type, created_at)
           VALUES (:orgId, :fileId, 'nist_ai_rmf', 'subcategory', :entityId, 'evidence', NOW())
           ON CONFLICT (file_id, framework_type, entity_type, entity_id) DO NOTHING`,
          {
            replacements: { orgId, fileId: newFileId, entityId: newSubcatId },
            transaction,
          }
        );
      }
    }
  }

  // Store in idMapping for use by risk junction table and downstream mappings
  idMapping['nist_ai_rmf_subcategories'] = nistIdMapping;

  // Migrate nist_ai_rmf_subcategories__risks junction table
  let risksMigrated = 0;
  const hasRisksTable = await tableExists(tenantHash, 'nist_ai_rmf_subcategories__risks', transaction);
  if (hasRisksTable) {
    const oldRisks = (await sequelize.query(
      `SELECT * FROM "${tenantHash}".nist_ai_rmf_subcategories__risks`,
      { type: QueryTypes.SELECT, transaction }
    )) as any[];

    for (const risk of oldRisks) {
      const newSubcatId = nistIdMapping[risk.nist_ai_rmf_subcategory_id];
      const newRiskId = idMapping['risks']?.[risk.projects_risks_id];
      if (!newSubcatId || !newRiskId) continue;

      await sequelize.query(
        `INSERT INTO nist_ai_rmf_subcategories__risks
          (organization_id, nist_ai_rmf_subcategory_id, projects_risks_id)
         VALUES (:orgId, :subcatId, :riskId)
         ON CONFLICT DO NOTHING`,
        {
          replacements: { orgId, subcatId: newSubcatId, riskId: newRiskId },
          transaction,
        }
      );
      risksMigrated++;
    }
  }

  if (migrated > 0 || risksMigrated > 0) {
    console.log(`    ✓ nist_ai_rmf (dedicated): ${migrated} subcategories, ${risksMigrated} risks${skipped > 0 ? ` (${skipped} skipped)` : ''}`);
  }
  return { subcategoriesMigrated: migrated, risksMigrated };
}

// ============================================================
// ORGANIZATION MIGRATION
// ============================================================

/**
 * Migrate all data for a single organization.
 * Accepts an external transaction — caller is responsible for commit/rollback.
 */
async function migrateOrganization(
  orgId: number,
  tenantHash: string,
  globalStructMap: GlobalStructMap,
  transaction: Transaction,
  dropSchemaAfter: boolean = false
): Promise<{
  success: boolean;
  error?: string;
  tableCounts: Record<string, { source: number; migrated: number }>;
}> {
  const tableCounts: Record<string, { source: number; migrated: number }> = {};

  console.log(`\n  Migrating organization ${orgId} (${tenantHash})...`);

  // Check if tenant schema exists
  const exists = await schemaExists(tenantHash, transaction);
  if (!exists) {
    console.log(`    ⊘ No tenant schema found, skipping`);
    return { success: true, tableCounts };
  }

  // Initialize ID mapping for this organization
  const idMapping: IdMapping = {};

  // Phase 1: Migrate custom framework definitions and struct data
  // This must run before general migration so struct ID maps are available
  const cfPhase1 = await migrateCustomFrameworkPhase1(orgId, tenantHash, globalStructMap, transaction);
  if (cfPhase1.totalMigrated > 0) {
    tableCounts['custom_frameworks (phase 1)'] = { source: cfPhase1.totalMigrated, migrated: cfPhase1.totalMigrated };
  }

  // Get all tables in dependency order
  const allTables = getAllTablesInOrder();

  // General migration: migrate all non-skipped tables
  // This populates idMapping (including idMapping['projects'], idMapping['risks'])
  for (const tableName of allTables) {
    if (SKIP_TABLES.includes(tableName)) {
      continue;
    }

    try {
      const result = await migrateTable(
        orgId,
        tenantHash,
        tableName,
        idMapping,
        transaction
      );
      tableCounts[tableName] = {
        source: result.sourceCount,
        migrated: result.migratedCount,
      };
    } catch (error) {
      console.error(`    ✗ ${tableName}: ${(error as Error).message}`);
      throw error;
    }
  }

  // Phase 2: Migrate custom framework projects, impl data, and risks
  // Runs AFTER general migration so project_id and risk_id can be remapped
  const cfIdMaps = await migrateCustomFrameworkPhase2(orgId, tenantHash, cfPhase1, idMapping, transaction);

  // NIST AI RMF: dedicated migration (old schema has different column structure)
  // Runs AFTER general migration so idMapping['projects_frameworks'], ['risks'], ['files'] are available
  await migrateNistAiRmfData(orgId, tenantHash, idMapping, transaction);

  // Post-fix: remap file_entity_links entity_id for custom framework entity types
  if (cfIdMaps.l2ImplIdMap && Object.keys(cfIdMaps.l2ImplIdMap).length > 0) {
    for (const [oldId, newId] of Object.entries(cfIdMaps.l2ImplIdMap)) {
      await sequelize.query(
        `UPDATE file_entity_links SET entity_id = :newId
         WHERE organization_id = :orgId AND entity_type = 'level2_impl' AND entity_id = :oldId`,
        { replacements: { orgId, oldId: Number(oldId), newId: Number(newId) }, transaction }
      );
    }
  }
  if (cfIdMaps.l3ImplIdMap && Object.keys(cfIdMaps.l3ImplIdMap).length > 0) {
    for (const [oldId, newId] of Object.entries(cfIdMaps.l3ImplIdMap)) {
      await sequelize.query(
        `UPDATE file_entity_links SET entity_id = :newId
         WHERE organization_id = :orgId AND entity_type = 'level3_impl' AND entity_id = :oldId`,
        { replacements: { orgId, oldId: Number(oldId), newId: Number(newId) }, transaction }
      );
    }
  }
  // Remap struct-level entity_ids (level2, level3) using phase 1 maps
  if (cfIdMaps.l2IdMap && Object.keys(cfIdMaps.l2IdMap).length > 0) {
    for (const [oldId, newId] of Object.entries(cfIdMaps.l2IdMap)) {
      await sequelize.query(
        `UPDATE file_entity_links SET entity_id = :newId
         WHERE organization_id = :orgId AND entity_type = 'level2' AND entity_id = :oldId`,
        { replacements: { orgId, oldId: Number(oldId), newId: Number(newId) }, transaction }
      );
    }
  }
  if (cfIdMaps.l3IdMap && Object.keys(cfIdMaps.l3IdMap).length > 0) {
    for (const [oldId, newId] of Object.entries(cfIdMaps.l3IdMap)) {
      await sequelize.query(
        `UPDATE file_entity_links SET entity_id = :newId
         WHERE organization_id = :orgId AND entity_type = 'level3' AND entity_id = :oldId`,
        { replacements: { orgId, oldId: Number(oldId), newId: Number(newId) }, transaction }
      );
    }
  }

  // Optionally drop tenant schema after successful migration
  if (dropSchemaAfter) {
    console.log(`    🗑️  Dropping tenant schema ${tenantHash}...`);
    await sequelize.query(`DROP SCHEMA IF EXISTS "${tenantHash}" CASCADE`, {
      transaction,
    });
  }

  console.log(`  ✓ Organization ${orgId} migrated successfully`);
  return { success: true, tableCounts };
}

// ============================================================
// VALIDATION
// ============================================================

/**
 * Validate migration by comparing row counts
 */
async function validateMigration(
  organizations: { id: number; name: string }[]
): Promise<ValidationReport> {
  const report: ValidationReport = {
    organizations: {},
    summary: {
      total_source_rows: 0,
      total_migrated_rows: 0,
      all_matched: true,
    },
  };

  const allTables = getAllTablesInOrder();

  for (const org of organizations) {
    const tenantHash = getTenantHash(org.id);
    const orgReport: ValidationReport["organizations"][number] = {
      tenant_hash: tenantHash,
      tables: {},
    };

    for (const tableName of allTables) {
      const sourceCount = await getRowCount(tenantHash, tableName);
      const migratedCount = await getRowCount("verifywise", tableName, undefined, org.id);

      const match = sourceCount === migratedCount;
      orgReport.tables[tableName] = {
        source_count: sourceCount,
        migrated_count: migratedCount,
        match,
      };

      report.summary.total_source_rows += sourceCount;
      report.summary.total_migrated_rows += migratedCount;

      if (!match && sourceCount > 0) {
        report.summary.all_matched = false;
      }
    }

    report.organizations[org.id] = orgReport;
  }

  return report;
}

// ============================================================
// MIGRATION STATUS TRACKING
// ============================================================

/**
 * Check if migration_status table exists
 */
async function migrationStatusTableExists(): Promise<boolean> {
  const result = await sequelize.query(
    `SELECT EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'verifywise' AND table_name = 'migration_status'
    ) as exists`,
    { type: QueryTypes.SELECT }
  );
  return (result[0] as any).exists;
}

/**
 * Get migration status
 */
async function getMigrationStatus(): Promise<{
  status: string;
  organizations_migrated: number;
  organizations_total: number;
  current_organization_id: number | null;
  current_table: string | null;
} | null> {
  const result = await sequelize.query(
    `SELECT status, organizations_migrated, organizations_total, current_organization_id, current_table
     FROM migration_status WHERE migration_key = :key`,
    { replacements: { key: MIGRATION_KEY }, type: QueryTypes.SELECT }
  );
  return (result[0] as any) || null;
}

/**
 * Update migration status
 */
async function updateMigrationStatus(params: {
  status: string;
  organizations_migrated?: number;
  organizations_total?: number;
  current_organization_id?: number | null;
  current_table?: string | null;
  error_message?: string | null;
  validation_report?: any;
}): Promise<void> {
  const now = new Date().toISOString();
  const existing = await getMigrationStatus();

  if (existing) {
    const updates: string[] = ["status = :status", "updated_at = :now"];
    const replacements: any = { key: MIGRATION_KEY, status: params.status, now };

    if (params.organizations_migrated !== undefined) {
      updates.push("organizations_migrated = :organizations_migrated");
      replacements.organizations_migrated = params.organizations_migrated;
    }
    if (params.organizations_total !== undefined) {
      updates.push("organizations_total = :organizations_total");
      replacements.organizations_total = params.organizations_total;
    }
    if (params.current_organization_id !== undefined) {
      updates.push("current_organization_id = :current_organization_id");
      replacements.current_organization_id = params.current_organization_id;
    }
    if (params.current_table !== undefined) {
      updates.push("current_table = :current_table");
      replacements.current_table = params.current_table;
    }
    if (params.error_message !== undefined) {
      updates.push("error_message = :error_message");
      replacements.error_message = params.error_message;
    }
    if (params.validation_report !== undefined) {
      updates.push("validation_report = :validation_report::jsonb");
      replacements.validation_report = JSON.stringify(params.validation_report);
    }
    if (params.status === "completed") {
      updates.push("completed_at = :now");
    }

    await sequelize.query(
      `UPDATE migration_status SET ${updates.join(", ")} WHERE migration_key = :key`,
      { replacements }
    );
  } else {
    await sequelize.query(
      `INSERT INTO migration_status
       (migration_key, status, organizations_migrated, organizations_total, started_at, created_at, updated_at)
       VALUES (:key, :status, :organizations_migrated, :organizations_total, :now, :now, :now)`,
      {
        replacements: {
          key: MIGRATION_KEY,
          status: params.status,
          organizations_migrated: params.organizations_migrated || 0,
          organizations_total: params.organizations_total || 0,
          now,
        },
      }
    );
  }
}

// ============================================================
// COPY SHARED TABLES (public → verifywise)
// ============================================================

/**
 * Copy non-tenant-scoped tables from public → verifywise.
 * Must run BEFORE any query that reads from verifywise.organizations,
 * since search_path resolves to verifywise first.
 * Idempotent — uses ON CONFLICT DO NOTHING.
 */
async function copySharedTables(): Promise<{ tablesProcessed: number; rowsCopied: number }> {
  const sharedTables = ['roles', 'organizations', 'users', 'tiers', 'subscriptions', 'subscription_history', 'frameworks'];
  let tablesProcessed = 0;
  let rowsCopied = 0;

  // Default values by PostgreSQL type family (used when source has NULL but target is NOT NULL)
  const NOT_NULL_DEFAULTS: Record<string, string> = {
    'integer': '0', 'bigint': '0', 'smallint': '0', 'numeric': '0', 'real': '0', 'double precision': '0',
    'character varying': "''", 'text': "''", 'character': "''",
    'boolean': 'false',
    'timestamp without time zone': 'NOW()', 'timestamp with time zone': 'NOW()',
    'date': 'CURRENT_DATE',
    'jsonb': "'{}'::jsonb", 'json': "'{}'::json",
  };

  console.log("  Copying shared tables from public → verifywise...");
  const transaction = await sequelize.transaction();
  try {
    // Disable FK checks (users references organizations, etc.)
    await sequelize.query(`SET session_replication_role = replica;`, { transaction });

    for (const table of sharedTables) {
      // Check source exists
      const [srcCheck] = await sequelize.query(
        `SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = :table) as exists`,
        { replacements: { table }, type: QueryTypes.SELECT, transaction }
      ) as any[];
      if (!srcCheck.exists) continue;

      // Check target exists
      const [tgtCheck] = await sequelize.query(
        `SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'verifywise' AND table_name = :table) as exists`,
        { replacements: { table }, type: QueryTypes.SELECT, transaction }
      ) as any[];
      if (!tgtCheck.exists) continue;

      // Get column metadata from both schemas
      const srcColMeta = (await sequelize.query(
        `SELECT column_name, data_type FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = :table ORDER BY ordinal_position`,
        { replacements: { table }, type: QueryTypes.SELECT, transaction }
      ) as any[]);
      const srcColMap = new Map(srcColMeta.map(r => [r.column_name, r.data_type]));

      const tgtColMeta = (await sequelize.query(
        `SELECT column_name, data_type, is_nullable FROM information_schema.columns
         WHERE table_schema = 'verifywise' AND table_name = :table ORDER BY ordinal_position`,
        { replacements: { table }, type: QueryTypes.SELECT, transaction }
      ) as any[]);
      const tgtColMap = new Map(tgtColMeta.map(r => [r.column_name, { data_type: r.data_type, is_nullable: r.is_nullable }]));

      // Only copy columns that exist in BOTH schemas
      const commonCols = srcColMeta.filter(r => tgtColMap.has(r.column_name)).map(r => r.column_name);
      if (commonCols.length === 0) continue;

      // Build SELECT expressions with type casts and COALESCE for NOT NULL mismatches
      const insertCols: string[] = [];
      const selectExprs: string[] = [];
      for (const col of commonCols) {
        const srcType = srcColMap.get(col)!;
        const tgt = tgtColMap.get(col)!;
        const tgtType = tgt.data_type;
        const tgtNullable = tgt.is_nullable === 'YES';

        let expr = `"${col}"`;

        // Cast if types differ
        if (srcType !== tgtType) {
          expr = `"${col}"::${tgtType}`;
        }

        // COALESCE if target is NOT NULL (source may have NULLs)
        if (!tgtNullable) {
          const defaultVal = NOT_NULL_DEFAULTS[tgtType] || "''";
          expr = `COALESCE(${expr}, ${defaultVal})`;
        }

        insertCols.push(`"${col}"`);
        selectExprs.push(expr);
      }

      const [countResult] = await sequelize.query(
        `SELECT COUNT(*) as count FROM public."${table}"`,
        { type: QueryTypes.SELECT, transaction }
      ) as any[];
      const count = parseInt(countResult.count, 10);
      if (count === 0) continue;

      await sequelize.query(
        `INSERT INTO verifywise."${table}" (${insertCols.join(', ')})
         SELECT ${selectExprs.join(', ')} FROM public."${table}"
         ON CONFLICT DO NOTHING`,
        { transaction }
      );

      // Reset sequence so new inserts get correct IDs
      if (commonCols.includes('id')) {
        await sequelize.query(
          `SELECT setval(pg_get_serial_sequence('verifywise."${table}"', 'id'), COALESCE((SELECT MAX(id) FROM verifywise."${table}"), 0))`,
          { transaction }
        );
      }

      const [insertedCount] = await sequelize.query(
        `SELECT COUNT(*) as count FROM verifywise."${table}"`,
        { type: QueryTypes.SELECT, transaction }
      ) as any[];
      const inserted = parseInt(insertedCount.count, 10);
      if (inserted < count) {
        console.log(`    ✓ ${table}: ${inserted}/${count} rows (${count - inserted} skipped — constraint violations)`);
      } else {
        console.log(`    ✓ ${table}: ${count} rows`);
      }
      tablesProcessed++;
      rowsCopied += inserted;
    }

    await sequelize.query(`SET session_replication_role = DEFAULT;`, { transaction });
    await transaction.commit();
    console.log("  Shared tables copied successfully.\n");
  } catch (err) {
    await transaction.rollback();
    throw err;
  }

  return { tablesProcessed, rowsCopied };
}

// ============================================================
// MAIN MIGRATION FUNCTION
// ============================================================

/**
 * Run the full migration
 */
export async function migrateToSharedSchema(options: {
  dropSchemasAfter?: boolean;
  skipValidation?: boolean;
} = {}): Promise<MigrationResult> {
  const { dropSchemasAfter = false, skipValidation = false } = options;

  console.log("╔════════════════════════════════════════════════════════════╗");
  console.log("║     MIGRATE TENANT DATA TO SHARED SCHEMA                    ║");
  console.log("╚════════════════════════════════════════════════════════════╝");
  console.log("");
  console.log("Configuration:");
  console.log(`  - Drop schemas after migration: ${dropSchemasAfter}`);
  console.log(`  - Skip validation: ${skipValidation}`);
  console.log("");

  const errors: string[] = [];
  let organizationsMigrated = 0;
  let tablesProcessed = 0;
  let rowsMigrated = 0;

  try {
    // ── Step 1: Copy shared tables (public → verifywise) ──
    // Must run first so verifywise.organizations has data for the org query below.
    const { tablesProcessed: sharedTablesCount, rowsCopied: sharedRowsCount } = await copySharedTables();
    tablesProcessed += sharedTablesCount;
    rowsMigrated += sharedRowsCount;

    // ── Step 2: Discover organizations (now from verifywise via search_path) ──
    const organizations = (await sequelize.query(
      `SELECT id, name FROM organizations ORDER BY id`,
      { type: QueryTypes.SELECT }
    )) as { id: number; name: string }[];

    if (organizations.length === 0) {
      console.log("No organizations found.");
      return {
        success: true,
        status: "no_tenants",
        organizationsMigrated: 0,
        tablesProcessed,
        rowsMigrated,
        errors: [],
      };
    }

    console.log(`Found ${organizations.length} organizations to migrate.\n`);

    // Update migration status (outside transaction — tracking only)
    await updateMigrationStatus({
      status: "in_progress",
      organizations_migrated: 0,
      organizations_total: organizations.length,
    });

    // Single global transaction — if ANY org fails, everything rolls back
    const transaction = await sequelize.transaction();

    try {
      // Disable FK constraint checks during migration.
      await sequelize.query(`SET session_replication_role = replica;`, { transaction });

      // Global struct map for custom framework deduplication across orgs
      const globalStructMap: GlobalStructMap = {
        definitions: {},
        structPopulated: {},
        level1: {},
        level2: {},
        level3: {},
      };

      // Migrate each organization within the same transaction
      for (const org of organizations) {
        const tenantHash = getTenantHash(org.id);

        await updateMigrationStatus({
          status: "in_progress",
          current_organization_id: org.id,
        });

        const result = await migrateOrganization(org.id, tenantHash, globalStructMap, transaction, dropSchemasAfter);

        if (result.success) {
          organizationsMigrated++;

          // Count tables and rows
          for (const [_table, counts] of Object.entries(result.tableCounts)) {
            if (counts.migrated > 0) {
              tablesProcessed++;
              rowsMigrated += counts.migrated;
            }
          }
        } else {
          // Any failure → abort the entire migration
          throw new Error(`Org ${org.id}: ${result.error}`);
        }

        await updateMigrationStatus({
          status: "in_progress",
          organizations_migrated: organizationsMigrated,
        });
      }

      // Re-enable FK constraint checks before commit
      await sequelize.query(`SET session_replication_role = DEFAULT;`, { transaction });

      // All orgs succeeded — commit the single transaction
      await transaction.commit();
      console.log("\n  ✓ Global transaction committed successfully");
    } catch (txError) {
      // Any failure → roll back ALL orgs
      await transaction.rollback();
      console.error("\n  ✗ Global transaction rolled back due to error:", txError);
      errors.push((txError as Error).message);
    }

    // Validate if requested (outside transaction, read-only)
    let validationReport: ValidationReport | undefined;
    if (!skipValidation && !dropSchemasAfter && errors.length === 0) {
      console.log("\n📊 Running validation...");
      validationReport = await validateMigration(organizations);
    }

    // Update final status
    const finalStatus = errors.length === 0 ? "completed" : "failed";
    await updateMigrationStatus({
      status: finalStatus,
      organizations_migrated: organizationsMigrated,
      error_message: errors.length > 0 ? errors.join("; ") : null,
      validation_report: validationReport,
    });

    // Print summary
    console.log("\n╔════════════════════════════════════════════════════════════╗");
    console.log("║                    MIGRATION COMPLETE                       ║");
    console.log("╚════════════════════════════════════════════════════════════╝");
    console.log(`\n  ✓ Organizations migrated: ${organizationsMigrated}/${organizations.length}`);
    console.log(`  ✓ Tables processed: ${tablesProcessed}`);
    console.log(`  ✓ Rows migrated: ${rowsMigrated}`);

    if (errors.length > 0) {
      console.log(`\n  ✗ Errors (${errors.length}):`);
      for (const err of errors) {
        console.log(`    - ${err}`);
      }
    }

    if (dropSchemasAfter && errors.length === 0) {
      console.log("\n  🗑️  Old tenant schemas have been dropped.");
    } else if (dropSchemasAfter && errors.length > 0) {
      console.log("\n  📁 Old tenant schemas preserved (migration had errors - schemas not dropped).");
    } else {
      console.log("\n  📁 Old tenant schemas have been preserved.");
    }

    return {
      success: errors.length === 0,
      status: errors.length === 0 ? "just_completed" : "failed",
      organizationsMigrated,
      tablesProcessed,
      rowsMigrated,
      validationReport,
      errors,
    };
  } catch (error) {
    const errorMessage = (error as Error).message;
    errors.push(errorMessage);

    await updateMigrationStatus({
      status: "failed",
      error_message: errorMessage,
    });

    return {
      success: false,
      status: "failed",
      organizationsMigrated,
      tablesProcessed,
      rowsMigrated,
      error: errorMessage,
      errors,
    };
  }
}

// ============================================================
// SERVER STARTUP INTEGRATION
// ============================================================

/**
 * Check and run migration on server startup
 * This is the main entry point for automatic migration
 */
export async function checkAndRunMigration(): Promise<MigrationResult> {
  // Check if migration_status table exists
  const tableExists = await migrationStatusTableExists();
  if (!tableExists) {
    console.log("ℹ️  migration_status table does not exist, skipping migration check");
    console.log("   Run database migrations first: npx sequelize db:migrate");
    return {
      success: true,
      status: "no_tenants",
      organizationsMigrated: 0,
      tablesProcessed: 0,
      rowsMigrated: 0,
      errors: [],
    };
  }

  // Check current migration status
  const migrationStatus = await getMigrationStatus();

  // If migration already completed, skip
  if (migrationStatus?.status === "completed") {
    return {
      success: true,
      status: "already_completed",
      organizationsMigrated: migrationStatus.organizations_migrated || 0,
      tablesProcessed: 0,
      rowsMigrated: 0,
      errors: [],
    };
  }

  // Copy shared tables first so verifywise.organizations has data
  await copySharedTables();

  // Now query organizations from verifywise (via search_path)
  const organizations = (await sequelize.query(
    `SELECT id FROM organizations ORDER BY id`,
    { type: QueryTypes.SELECT }
  )) as { id: number }[];

  if (organizations.length === 0) {
    console.log("ℹ️  No organizations found, skipping migration");
    return {
      success: true,
      status: "no_tenants",
      organizationsMigrated: 0,
      tablesProcessed: 0,
      rowsMigrated: 0,
      errors: [],
    };
  }

  // Check if any tenant schemas exist
  let tenantsExist = false;
  for (const org of organizations) {
    const tenantHash = getTenantHash(org.id);
    const exists = await schemaExists(tenantHash);
    if (exists) {
      tenantsExist = true;
      break;
    }
  }

  if (!tenantsExist) {
    // Mark as completed since there's nothing to migrate
    await updateMigrationStatus({
      status: "completed",
      organizations_migrated: 0,
      organizations_total: organizations.length,
    });

    console.log("ℹ️  No tenant schemas found, marking migration as complete");
    return {
      success: true,
      status: "no_tenants",
      organizationsMigrated: 0,
      tablesProcessed: 0,
      rowsMigrated: 0,
      errors: [],
    };
  }

  // Run the migration
  console.log("\n🚀 Starting tenant-to-shared-schema migration...");
  return migrateToSharedSchema({
    dropSchemasAfter: false,  // Drop schemas after successful migration
    skipValidation: true,     // Skip validation since we're dropping schemas
  });
}

/**
 * Print validation report
 */
export function printValidationReport(report: ValidationReport): void {
  if (!report) return;

  console.log("\n📊 Migration Validation Report");
  console.log("================================");

  for (const [orgId, orgData] of Object.entries(report.organizations)) {
    const mismatchedTables = Object.entries(orgData.tables).filter(
      ([_, counts]) => !counts.match && counts.source_count > 0
    );

    if (mismatchedTables.length > 0) {
      console.log(`\nOrganization ${orgId} (${orgData.tenant_hash}):`);
      for (const [table, counts] of mismatchedTables) {
        console.log(
          `  ❌ ${table}: ${counts.source_count} source → ${counts.migrated_count} migrated`
        );
      }
    }
  }

  console.log("\n📈 Summary:");
  console.log(`   Total source rows: ${report.summary.total_source_rows}`);
  console.log(`   Total migrated rows: ${report.summary.total_migrated_rows}`);
  console.log(`   All matched: ${report.summary.all_matched ? "✅ Yes" : "❌ No"}`);
}

// ============================================================
// CLI ENTRY POINT
// ============================================================

async function main() {
  const args = process.argv.slice(2);
  const dropSchemas = !args.includes("--keep-schemas");
  const skipValidation = args.includes("--skip-validation") || dropSchemas;

  try {
    const result = await migrateToSharedSchema({
      dropSchemasAfter: dropSchemas,
      skipValidation,
    });

    if (result.validationReport) {
      printValidationReport(result.validationReport);
    }

    process.exit(result.success ? 0 : 1);
  } catch (error) {
    console.error("\nFatal error:", error);
    process.exit(1);
  } finally {
    await sequelize.close();
  }
}

// Run if called directly
if (require.main === module) {
  main().catch(console.error);
}
