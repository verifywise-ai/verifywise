#!/usr/bin/env node
/**
 * DBML Generator for VerifyWise
 *
 * Parses Sequelize-typescript model files and generates DBML for dbdocs.io
 *
 * Usage: node scripts/generateDbml.js
 * Output: docs/schema.dbml
 */

const fs = require("fs");
const path = require("path");
const glob = require("glob");

// Map Sequelize DataTypes to DBML types
function mapDataType(sequelizeType) {
  const typeMap = {
    "DataType.INTEGER": "integer",
    "DataType.BIGINT": "bigint",
    "DataType.STRING": "varchar",
    "DataType.TEXT": "text",
    "DataType.BOOLEAN": "boolean",
    "DataType.DATE": "timestamp",
    "DataType.DATEONLY": "date",
    "DataType.FLOAT": "float",
    "DataType.DOUBLE": "double",
    "DataType.DECIMAL": "decimal",
    "DataType.JSON": "json",
    "DataType.JSONB": "jsonb",
    "DataType.UUID": "uuid",
    "DataType.ARRAY": "text[]",
  };

  // Handle ENUM types
  if (sequelizeType.includes("DataType.ENUM")) {
    return "varchar";
  }

  // Handle ARRAY types
  if (sequelizeType.includes("DataType.ARRAY")) {
    return "text[]";
  }

  for (const [key, value] of Object.entries(typeMap)) {
    if (sequelizeType.includes(key)) {
      return value;
    }
  }

  return "varchar";
}

// Extract table name from @Table decorator
function extractTableName(content) {
  const tableMatch = content.match(/@Table\(\s*\{[^}]*tableName:\s*["']([^"']+)["']/);
  return tableMatch ? tableMatch[1] : null;
}

// Extract class documentation as table note
function extractTableNote(content) {
  const docMatch = content.match(/\/\*\*\s*\n\s*\*\s*@fileoverview\s+([^\n]+)/);
  if (docMatch) {
    return docMatch[1].trim();
  }

  // Try to find any leading comment
  const commentMatch = content.match(/\/\*\*\s*\n\s*\*\s*([^\n@]+)/);
  return commentMatch ? commentMatch[1].trim() : null;
}

// Convert model class name to table name (e.g., UserModel -> users)
function modelToTableName(modelName) {
  // Known mappings
  const knownMappings = {
    UserModel: "users",
    RoleModel: "roles",
    ProjectModel: "projects",
    OrganizationModel: "organizations",
    RiskModel: "project_risks",
    VendorModel: "vendors",
    VendorRiskModel: "vendor_risks",
    FileModel: "files",
    ControlModel: "controls",
    ControlCategoryModel: "control_categories",
    SubcontrolModel: "subcontrols",
    AssessmentModel: "assessments",
    QuestionModel: "questions",
    TopicModel: "topics",
    SubtopicModel: "subtopics",
    FrameworkModel: "frameworks",
    ProjectFrameworksModel: "project_frameworks",
    ProjectScopeModel: "project_scopes",
    ProjectsMembersModel: "projects_members",
    ModelInventoryModel: "model_inventories",
    ModelRiskModel: "model_risks",
    TrainingRegistarModel: "training_registar",
    PolicyManagerModel: "policies",
    TiersModel: "tiers",
    SubscriptionModel: "subscriptions",
    TasksModel: "tasks",
    TaskAssigneesModel: "task_assignees",
    AutomationModel: "automations",
    AutomationActionModel: "automation_actions",
    AutomationTriggerModel: "automation_triggers",
    AutomationTriggerActionModel: "automation_trigger_actions",
    AutomationExecutionLogModel: "automation_execution_logs",
    AIIncidentManagementModel: "ai_incident_management",
    SlackWebhookModel: "slack_webhooks",
    MLFlowModelRecordModel: "mlflow_model_records",
    ModelInventoryHistoryModel: "model_inventory_history",
    RiskHistoryModel: "risk_history",
    UserPreferencesModel: "user_preferences",
    VendorsProjectsModel: "vendors_projects",
    EvidenceHubModel: "evidence_hub",
    PolicyLinkedObjectsModel: "policy_linked_objects",
    // AI Trust Center models
    AITrustCenterInfoModel: "ai_trust_center_info",
    AITrustCenterIntroModel: "ai_trust_center_intro",
    AITrustCenterCompanyDescriptionModel: "ai_trust_center_company_description",
    AITrustCenterComplianceBadgesModel: "ai_trust_center_compliance_badges",
    AITrustCenterResourcesModel: "ai_trust_center_resources",
    AITrustCenterSubprocessorsModel: "ai_trust_center_subprocessors",
    AITrustCenterTermsAndContactModel: "ai_trust_center_terms_and_contact",
    // Framework-specific models
    NISTAIMRFFunctionModel: "nist_ai_rmf_functions",
    NISTAIMRFCategoryModel: "nist_ai_rmf_categories",
    NISTAIMRFSubcategoryModel: "nist_ai_rmf_subcategories",
    // ISO 27001
    ISO27001SubClauseModel: "iso27001_sub_clauses",
    ISO27001AnnexStructModel: "iso27001_annex_struct",
    ISO27001AnnexControlModel: "iso27001_annex_controls",
    ISO27001ClauseStructModel: "iso27001_clause_struct",
    ISO27001SubClauseRisksModel: "iso27001_sub_clause_risks",
    ISO27001SubClauseStructModel: "iso27001_sub_clause_struct",
    ISO27001AnnexControlRisksModel: "iso27001_annex_control_risks",
    ISO27001AnnexControlStructModel: "iso27001_annex_control_struct",
    // ISO 42001
    AnnexCategoryISOModel: "annex_category_iso",
    AnnexCategoryISORisksModel: "annex_category_iso_risks",
    AnnexCategoryStructISOModel: "annex_category_struct_iso",
    AnnexStructISOModel: "annex_struct_iso",
    ClauseStructISOModel: "clause_struct_iso",
    SubClauseISOModel: "sub_clause_iso",
    SubClauseStructISOModel: "sub_clause_struct_iso",
    // EU AI Act
    TopicStructEUModel: "topic_struct_eu",
    SubtopicStructEUModel: "subtopic_struct_eu",
    QuestionStructEUModel: "question_struct_eu",
    AnswerEUModel: "answer_eu",
    ControlCategoryStructEUModel: "control_category_struct_eu",
    ControlStructEUModel: "control_struct_eu",
    SubcontrolStructEUModel: "subcontrol_struct_eu",
    ControlEUModel: "control_eu",
    SubcontrolEUModel: "subcontrol_eu",
    AssessmentEUModel: "assessment_eu",
  };

  if (knownMappings[modelName]) {
    return knownMappings[modelName];
  }

  // Fallback: convert CamelCase to snake_case and pluralize
  return (
    modelName
      .replace("Model", "")
      .replace(/([A-Z])/g, "_$1")
      .toLowerCase()
      .replace(/^_/, "") + "s"
  );
}

// Parse a single model file
function parseModelFile(filePath) {
  const content = fs.readFileSync(filePath, "utf-8");

  const tableName = extractTableName(content);
  if (!tableName) {
    return null;
  }

  const columns = [];
  const foreignKeys = [];
  const tableNote = extractTableNote(content);

  // Find all @Column decorators with their properties
  // This regex captures @ForeignKey if present, then @Column and the property definition
  const columnRegex =
    /(?:@ForeignKey\(\s*\(\)\s*=>\s*(\w+)\s*\)\s*\n\s*)?@Column\(\s*\{([^}]+)\}\s*\)\s*\n\s*(\w+)[\?!]?:\s*[^;]+;/g;

  let match;
  while ((match = columnRegex.exec(content)) !== null) {
    const foreignKeyRef = match[1];
    const columnOptions = match[2];
    const columnName = match[3];

    // Parse column options
    const isPrimaryKey = columnOptions.includes("primaryKey: true");
    const isAutoIncrement = columnOptions.includes("autoIncrement: true");
    const allowNull = !columnOptions.includes("allowNull: false") && !isPrimaryKey;
    const unique = columnOptions.includes("unique: true");

    // Extract type
    const typeMatch = columnOptions.match(/type:\s*(DataType\.\w+(?:\([^)]*\))?)/);
    let type = "varchar";
    if (typeMatch) {
      type = mapDataType(typeMatch[1]);
    } else if (columnOptions.includes("DataType.ENUM")) {
      type = "varchar";
    }

    // Extract default value
    let defaultValue;
    const defaultMatch = columnOptions.match(/defaultValue:\s*([^,\n}]+)/);
    if (defaultMatch) {
      defaultValue = defaultMatch[1].trim();
    }

    columns.push({
      name: columnName,
      type,
      isPrimaryKey,
      isAutoIncrement,
      allowNull,
      unique,
      defaultValue,
    });

    // Add foreign key if present
    if (foreignKeyRef) {
      // Get the table name from the referenced model
      const refTableName = modelToTableName(foreignKeyRef);
      foreignKeys.push({
        column: columnName,
        referencesTable: refTableName,
        referencesColumn: "id",
      });
    }
  }

  // Also capture simpler @Column definitions without curly braces
  const simpleColumnRegex =
    /(?:@ForeignKey\(\s*\(\)\s*=>\s*(\w+)\s*\)\s*\n\s*)?@Column\s*\n\s*(\w+)[\?!]?:\s*[^;]+;/g;
  while ((match = simpleColumnRegex.exec(content)) !== null) {
    const foreignKeyRef = match[1];
    const columnName = match[2];

    // Check if we already have this column
    if (columns.some((c) => c.name === columnName)) {
      continue;
    }

    columns.push({
      name: columnName,
      type: "varchar",
      isPrimaryKey: false,
      isAutoIncrement: false,
      allowNull: true,
      unique: false,
    });

    if (foreignKeyRef) {
      const refTableName = modelToTableName(foreignKeyRef);
      foreignKeys.push({
        column: columnName,
        referencesTable: refTableName,
        referencesColumn: "id",
      });
    }
  }

  return {
    name: tableName,
    columns,
    foreignKeys,
    note: tableNote || undefined,
  };
}

// Generate DBML from tables
function generateDbml(tables) {
  let dbml = `// VerifyWise Database Schema
// Generated on ${new Date().toISOString().split("T")[0]}
// Source: Sequelize-typescript models

Project VerifyWise {
  database_type: 'PostgreSQL'
  Note: 'AI Governance and Compliance Platform'
}

`;

  // Group tables by category
  const coreModels = [
    "users",
    "roles",
    "organizations",
    "projects",
    "project_scopes",
    "projects_members",
  ];
  const riskModels = ["project_risks", "vendor_risks", "model_risks", "risk_history"];
  const frameworkModels = tables
    .filter(
      (t) =>
        t.name.includes("iso") ||
        t.name.includes("nist") ||
        t.name.includes("eu") ||
        t.name === "frameworks" ||
        t.name === "project_frameworks",
    )
    .map((t) => t.name);
  const automationModels = tables.filter((t) => t.name.includes("automation")).map((t) => t.name);
  const trustCenterModels = tables
    .filter((t) => t.name.includes("trust_center"))
    .map((t) => t.name);

  // Helper to generate a single table
  const generateTable = (table) => {
    let tableDbml = `Table ${table.name} {\n`;

    for (const col of table.columns) {
      let colDef = `  ${col.name} ${col.type}`;

      const settings = [];
      if (col.isPrimaryKey) settings.push("pk");
      if (col.isAutoIncrement) settings.push("increment");
      if (!col.allowNull && !col.isPrimaryKey) settings.push("not null");
      if (col.unique) settings.push("unique");
      if (col.defaultValue) {
        const cleanDefault = String(col.defaultValue).replace(/['"]/g, "");
        settings.push(`default: '${cleanDefault}'`);
      }
      if (col.note) settings.push(`note: '${col.note}'`);

      if (settings.length > 0) {
        colDef += ` [${settings.join(", ")}]`;
      }

      tableDbml += colDef + "\n";
    }

    if (table.note) {
      // Escape backslashes first, then single quotes
      const escapedNote = table.note.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
      tableDbml += `\n  Note: '${escapedNote}'\n`;
    }

    tableDbml += "}\n\n";
    return tableDbml;
  };

  // Generate tables grouped by category
  dbml += "// ==================== Core Models ====================\n\n";
  for (const table of tables.filter((t) => coreModels.includes(t.name))) {
    dbml += generateTable(table);
  }

  dbml += "// ==================== Risk Management ====================\n\n";
  for (const table of tables.filter((t) => riskModels.includes(t.name))) {
    dbml += generateTable(table);
  }

  dbml += "// ==================== Compliance Frameworks ====================\n\n";
  for (const table of tables.filter((t) => frameworkModels.includes(t.name))) {
    dbml += generateTable(table);
  }

  dbml += "// ==================== Automation ====================\n\n";
  for (const table of tables.filter((t) => automationModels.includes(t.name))) {
    dbml += generateTable(table);
  }

  dbml += "// ==================== AI Trust Center ====================\n\n";
  for (const table of tables.filter((t) => trustCenterModels.includes(t.name))) {
    dbml += generateTable(table);
  }

  // Other tables
  const categorizedTables = new Set([
    ...coreModels,
    ...riskModels,
    ...frameworkModels,
    ...automationModels,
    ...trustCenterModels,
  ]);
  const otherTables = tables.filter((t) => !categorizedTables.has(t.name));

  if (otherTables.length > 0) {
    dbml += "// ==================== Other Models ====================\n\n";
    for (const table of otherTables) {
      dbml += generateTable(table);
    }
  }

  // Generate relationships
  dbml += "// ==================== Relationships ====================\n\n";
  for (const table of tables) {
    for (const fk of table.foreignKeys) {
      // Check if referenced table exists
      const refTable = tables.find((t) => t.name === fk.referencesTable);
      if (refTable) {
        // Check if the source column exists in the source table
        const sourceColumnExists = table.columns.some((c) => c.name === fk.column);
        // Check if the referenced column exists in the referenced table
        const refColumnExists = refTable.columns.some((c) => c.name === fk.referencesColumn);

        if (sourceColumnExists && refColumnExists) {
          dbml += `Ref: ${table.name}.${fk.column} > ${fk.referencesTable}.${fk.referencesColumn}\n`;
        }
      }
    }
  }

  return dbml;
}

// Main execution
function main() {
  const basePath = path.join(__dirname, "../domain.layer");

  // Find all model files
  const modelFiles = glob.sync("**/*.model.ts", { cwd: basePath, absolute: true });

  console.log(`Found ${modelFiles.length} model files`);

  const tableMap = new Map(); // Use map to deduplicate by table name

  for (const filePath of modelFiles) {
    // Skip test files and node_modules
    if (filePath.includes("node_modules") || filePath.includes(".spec.")) {
      continue;
    }

    const table = parseModelFile(filePath);
    if (table && table.columns.length > 0) {
      // If table already exists, merge columns (keep the one with more columns)
      if (tableMap.has(table.name)) {
        const existing = tableMap.get(table.name);
        if (table.columns.length > existing.columns.length) {
          tableMap.set(table.name, table);
          console.log(
            `Updated: ${table.name} (${table.columns.length} columns, ${table.foreignKeys.length} foreign keys)`,
          );
        } else {
          console.log(
            `Skipped duplicate: ${table.name} (keeping version with ${existing.columns.length} columns)`,
          );
        }
      } else {
        tableMap.set(table.name, table);
        console.log(
          `Parsed: ${table.name} (${table.columns.length} columns, ${table.foreignKeys.length} foreign keys)`,
        );
      }
    }
  }

  const tables = Array.from(tableMap.values());
  console.log(`\nGenerated schema for ${tables.length} tables (after deduplication)`);

  // Generate DBML
  const dbml = generateDbml(tables);

  // Create docs directory if it doesn't exist
  const docsDir = path.join(__dirname, "../docs");
  if (!fs.existsSync(docsDir)) {
    fs.mkdirSync(docsDir, { recursive: true });
  }

  // Write DBML file
  const outputPath = path.join(docsDir, "schema.dbml");
  fs.writeFileSync(outputPath, dbml);

  console.log(`\nDBML schema written to: ${outputPath}`);
  console.log("\nNext steps:");
  console.log("1. Install dbdocs CLI: npm install -g dbdocs");
  console.log("2. Login to dbdocs: dbdocs login");
  console.log("3. Build docs: dbdocs build docs/schema.dbml --project verifywise");
}

main();
