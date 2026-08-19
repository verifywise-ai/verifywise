import ExcelJS from "exceljs";
import { QueryTypes } from "sequelize";
import { sequelize } from "../../database/db";
import {
  AI_LIFECYCLE_PHASES,
  calculateRiskLevel,
  CURRENT_RISK_LEVEL_VALUES,
  LIKELIHOOD_VALUES,
  MITIGATION_STATUS_VALUES,
  RISK_CATEGORY_VALUES,
  RISK_SEVERITY_VALUES,
  SEVERITY_VALUES,
} from "./risks.enums";

/**
 * Server-side risk-import extension logic. Two entry points:
 *   - buildExcelTemplate() → an .xlsx buffer with dropdown-validated
 *     enum columns and a user picker sourced from the caller's org.
 *   - importRisks() → validates every row against the same enums and
 *     bulk-inserts into verifywise.risks. Errors are collected and
 *     returned as an atomic batch — the migration file's contract is
 *     that a batch with any validation error inserts nothing.
 */

// ---------------------------------------------------------------------------
// EXCEL TEMPLATE
// ---------------------------------------------------------------------------

interface OrgUser {
  id: number;
  name: string;
  surname: string;
  email: string;
}

async function fetchOrgUsers(organizationId: number): Promise<OrgUser[]> {
  try {
    return (await sequelize.query(
      `SELECT id, name, surname, email
         FROM users
        WHERE organization_id = :organizationId
        ORDER BY surname, name;`,
      { replacements: { organizationId }, type: QueryTypes.SELECT },
    )) as OrgUser[];
  } catch (err) {
    console.error("[risk-import] Failed to fetch org users:", err);
    return [];
  }
}

export async function buildExcelTemplate(
  organizationId: number,
): Promise<{ buffer: Buffer; filename: string }> {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet("Risk Import");

  const users = await fetchOrgUsers(organizationId);
  const userOptions = users.map((u) => `${u.name} ${u.surname} - ${u.email} (ID: ${u.id})`);

  const headers = [
    { key: "risk_name", header: "Risk Name *", width: 30 },
    { key: "risk_owner", header: "Risk Owner *", width: 30 },
    { key: "ai_lifecycle_phase", header: "AI Lifecycle Phase *", width: 30 },
    { key: "risk_description", header: "Risk Description", width: 40 },
    { key: "risk_category", header: "Risk Category (comma-separated)", width: 40 },
    { key: "impact", header: "Impact", width: 30 },
    { key: "likelihood", header: "Likelihood *", width: 20 },
    { key: "severity", header: "Severity *", width: 20 },
    { key: "review_notes", header: "Review Notes", width: 30 },
    { key: "mitigation_status", header: "Mitigation Status", width: 20 },
    { key: "current_risk_level", header: "Current Risk Level", width: 20 },
    { key: "deadline", header: "Deadline", width: 20 },
    { key: "mitigation_plan", header: "Mitigation Plan", width: 40 },
    { key: "implementation_strategy", header: "Implementation Strategy", width: 40 },
    { key: "likelihood_mitigation", header: "Likelihood Mitigation", width: 25 },
    { key: "risk_severity", header: "Risk Severity", width: 20 },
    { key: "final_risk_level", header: "Final Risk Level", width: 20 },
    { key: "risk_approval", header: "Risk Approval", width: 25 },
    { key: "approval_status", header: "Approval Status", width: 20 },
    { key: "date_of_assessment", header: "Date Of Assessment", width: 25 },
  ];
  worksheet.columns = headers;

  const headerRow = worksheet.getRow(1);
  headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
  headerRow.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF13715B" },
  };
  headerRow.alignment = { vertical: "middle", horizontal: "center" };
  headerRow.height = 25;

  const sampleUser = userOptions[0] ?? "Select user from dropdown";
  worksheet.addRow({
    risk_name: "Example Risk 1",
    risk_owner: sampleUser,
    ai_lifecycle_phase: "Model development & training",
    risk_description: "Example risk description",
    risk_category: "Operational risk",
    impact: "High impact on model accuracy",
    likelihood: "Possible",
    severity: "Major",
    review_notes: "Needs immediate attention",
    mitigation_status: "In Progress",
    current_risk_level: "High risk",
    deadline: "2025-12-31",
    mitigation_plan: "Implement data validation",
    implementation_strategy: "Use automated tools",
    likelihood_mitigation: "Unlikely",
    risk_severity: "Moderate",
    final_risk_level: "Medium risk",
    risk_approval: sampleUser,
    approval_status: "Pending",
    date_of_assessment: "2025-01-15",
  });

  const DATA_ROWS_END = 1000;

  const addDropdown = (colIndex: number, values: readonly string[]) => {
    for (let rowNum = 2; rowNum <= DATA_ROWS_END; rowNum++) {
      worksheet.getCell(rowNum, colIndex).dataValidation = {
        type: "list",
        allowBlank: true,
        formulae: [`"${values.join(",")}"`],
        showErrorMessage: true,
        errorStyle: "error",
        errorTitle: "Invalid Value",
        error: "Please select from the dropdown list",
      };
    }
  };
  const addMultiSelectDropdown = (colIndex: number, values: readonly string[]) => {
    for (let rowNum = 2; rowNum <= DATA_ROWS_END; rowNum++) {
      worksheet.getCell(rowNum, colIndex).dataValidation = {
        type: "list",
        allowBlank: true,
        formulae: [`"${values.join(",")}"`],
        showErrorMessage: false,
        showInputMessage: true,
        promptTitle: "Risk Categories",
        prompt:
          "Select one or enter multiple comma-separated values (e.g., 'Operational risk, Technological risk')",
      };
    }
  };
  const addDateValidation = (colIndex: number) => {
    for (let rowNum = 2; rowNum <= DATA_ROWS_END; rowNum++) {
      const cell = worksheet.getCell(rowNum, colIndex);
      cell.dataValidation = {
        type: "date",
        allowBlank: true,
        operator: "greaterThan",
        formulae: [new Date(1900, 0, 1)],
        showErrorMessage: true,
        errorStyle: "error",
        errorTitle: "Invalid Date",
        error: "Please enter a valid date",
        showInputMessage: true,
        promptTitle: "Date",
        prompt: "Click to select a date from the calendar",
      };
      cell.numFmt = "yyyy-mm-dd";
    }
  };

  if (userOptions.length > 0) {
    addDropdown(2, userOptions); // risk_owner
    addDropdown(18, userOptions); // risk_approval
  }
  addDropdown(3, AI_LIFECYCLE_PHASES);
  addMultiSelectDropdown(5, RISK_CATEGORY_VALUES);
  addDropdown(7, LIKELIHOOD_VALUES);
  addDropdown(8, SEVERITY_VALUES);
  addDropdown(10, MITIGATION_STATUS_VALUES);
  addDropdown(11, CURRENT_RISK_LEVEL_VALUES);
  addDropdown(15, LIKELIHOOD_VALUES);
  addDropdown(16, RISK_SEVERITY_VALUES);
  addDateValidation(12); // deadline
  addDateValidation(20); // date_of_assessment

  worksheet.views = [{ state: "frozen", xSplit: 0, ySplit: 1 }];

  const arrayBuffer = await workbook.xlsx.writeBuffer();
  return {
    buffer: Buffer.from(arrayBuffer as ArrayBuffer),
    filename: "risk_import_template.xlsx",
  };
}

// ---------------------------------------------------------------------------
// IMPORT
// ---------------------------------------------------------------------------

export interface RiskImportRow {
  risk_name?: string;
  risk_owner?: string | number;
  ai_lifecycle_phase?: string;
  risk_description?: string;
  risk_category?: string;
  impact?: string;
  likelihood?: string;
  severity?: string;
  review_notes?: string;
  mitigation_status?: string;
  current_risk_level?: string;
  deadline?: string;
  mitigation_plan?: string;
  implementation_strategy?: string;
  likelihood_mitigation?: string;
  risk_severity?: string;
  final_risk_level?: string;
  risk_approval?: string | number;
  approval_status?: string;
  date_of_assessment?: string;
}

export interface RiskImportError {
  row: number;
  field: string;
  message: string;
}

export interface RiskImportResult {
  success: boolean;
  imported: number;
  failed: number;
  errors: RiskImportError[];
  importedAt: string;
}

/**
 * The Excel template renders users as `First Last - email (ID: 42)` — extract
 * the numeric id if present, else treat as a bare numeric string.
 */
function parseUserId(value: string | number | undefined | null): number | null {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value === "number") return value;
  const asNumber = Number(value);
  if (!Number.isNaN(asNumber) && Number.isFinite(asNumber)) return asNumber;
  const match = String(value).match(/\(ID:\s*(\d+)\)/);
  return match ? Number(match[1]) : null;
}

function inEnum(value: string | undefined, allowed: readonly string[]): boolean {
  return !!value && allowed.indexOf(value) !== -1;
}

function validateRow(row: RiskImportRow, rowIndex: number): RiskImportError[] {
  const errors: RiskImportError[] = [];

  if (!row.risk_name || row.risk_name.trim().length === 0) {
    errors.push({ row: rowIndex, field: "risk_name", message: "Risk name is required" });
  }
  if (!parseUserId(row.risk_owner)) {
    errors.push({
      row: rowIndex,
      field: "risk_owner",
      message: "Risk owner must be a valid user ID or selected from dropdown",
    });
  }
  if (!row.risk_description || row.risk_description.trim().length === 0) {
    errors.push({
      row: rowIndex,
      field: "risk_description",
      message: "Risk description is required",
    });
  }
  if (row.ai_lifecycle_phase && !inEnum(row.ai_lifecycle_phase, AI_LIFECYCLE_PHASES)) {
    errors.push({
      row: rowIndex,
      field: "ai_lifecycle_phase",
      message: `Invalid AI lifecycle phase. Must be one of: ${AI_LIFECYCLE_PHASES.join(", ")}`,
    });
  }
  if (row.likelihood && !inEnum(row.likelihood, LIKELIHOOD_VALUES)) {
    errors.push({
      row: rowIndex,
      field: "likelihood",
      message: `Invalid likelihood. Must be one of: ${LIKELIHOOD_VALUES.join(", ")}`,
    });
  }
  if (row.severity && !inEnum(row.severity, SEVERITY_VALUES)) {
    errors.push({
      row: rowIndex,
      field: "severity",
      message: `Invalid severity. Must be one of: ${SEVERITY_VALUES.join(", ")}`,
    });
  }
  if (row.mitigation_status && !inEnum(row.mitigation_status, MITIGATION_STATUS_VALUES)) {
    errors.push({
      row: rowIndex,
      field: "mitigation_status",
      message: `Invalid mitigation status. Must be one of: ${MITIGATION_STATUS_VALUES.join(", ")}`,
    });
  }
  if (row.current_risk_level && !inEnum(row.current_risk_level, CURRENT_RISK_LEVEL_VALUES)) {
    errors.push({
      row: rowIndex,
      field: "current_risk_level",
      message: `Invalid current risk level. Must be one of: ${CURRENT_RISK_LEVEL_VALUES.join(", ")}`,
    });
  }
  if (row.likelihood_mitigation && !inEnum(row.likelihood_mitigation, LIKELIHOOD_VALUES)) {
    errors.push({
      row: rowIndex,
      field: "likelihood_mitigation",
      message: `Invalid likelihood mitigation. Must be one of: ${LIKELIHOOD_VALUES.join(", ")}`,
    });
  }
  if (row.risk_severity && !inEnum(row.risk_severity, RISK_SEVERITY_VALUES)) {
    errors.push({
      row: rowIndex,
      field: "risk_severity",
      message: `Invalid risk severity. Must be one of: ${RISK_SEVERITY_VALUES.join(", ")}`,
    });
  }
  if (row.deadline && Number.isNaN(new Date(row.deadline).getTime())) {
    errors.push({
      row: rowIndex,
      field: "deadline",
      message: "Invalid deadline date format. Use YYYY-MM-DD",
    });
  }
  if (row.date_of_assessment && Number.isNaN(new Date(row.date_of_assessment).getTime())) {
    errors.push({
      row: rowIndex,
      field: "date_of_assessment",
      message: "Invalid assessment date format. Use YYYY-MM-DD",
    });
  }
  return errors;
}

function parseRow(row: RiskImportRow): Record<string, unknown> {
  const riskCategory = row.risk_category
    ? row.risk_category
        .split(",")
        .map((c) => c.trim())
        .filter((c) => c.length > 0 && inEnum(c, RISK_CATEGORY_VALUES))
    : null;

  return {
    risk_name: row.risk_name?.trim() ?? null,
    risk_owner: parseUserId(row.risk_owner),
    ai_lifecycle_phase: row.ai_lifecycle_phase ?? null,
    risk_description: row.risk_description?.trim() ?? null,
    risk_category: riskCategory,
    impact: row.impact ?? null,
    likelihood: row.likelihood ?? null,
    severity: row.severity ?? null,
    risk_level_autocalculated: calculateRiskLevel(row.likelihood ?? null, row.severity ?? null),
    review_notes: row.review_notes ?? null,
    mitigation_status: row.mitigation_status ?? null,
    current_risk_level: row.current_risk_level ?? null,
    deadline: row.deadline ? new Date(row.deadline) : null,
    mitigation_plan: row.mitigation_plan ?? null,
    implementation_strategy: row.implementation_strategy ?? null,
    likelihood_mitigation: row.likelihood_mitigation ?? "Rare",
    risk_severity: row.risk_severity ?? null,
    final_risk_level: row.final_risk_level ?? null,
    risk_approval: parseUserId(row.risk_approval),
    approval_status: row.approval_status ?? null,
    date_of_assessment: row.date_of_assessment ? new Date(row.date_of_assessment) : new Date(),
  };
}

export async function importRisks(
  rows: RiskImportRow[],
  organizationId: number,
): Promise<RiskImportResult> {
  const errors: RiskImportError[] = [];

  rows.forEach((row, i) => {
    // +2 accounts for the header row (row 1) plus 1-based indexing.
    errors.push(...validateRow(row, i + 2));
  });

  if (errors.length > 0) {
    return {
      success: false,
      imported: 0,
      failed: rows.length,
      errors,
      importedAt: new Date().toISOString(),
    };
  }

  let imported = 0;
  const insertErrors: RiskImportError[] = [];
  const transaction = await sequelize.transaction();

  try {
    for (let i = 0; i < rows.length; i++) {
      const data = parseRow(rows[i]);
      const rowIndex = i + 2;
      try {
        await sequelize.query(
          `INSERT INTO risks (
             organization_id, risk_name, risk_owner, ai_lifecycle_phase, risk_description,
             risk_category, impact, assessment_mapping, controls_mapping,
             likelihood, severity, risk_level_autocalculated, review_notes,
             mitigation_status, current_risk_level, deadline, mitigation_plan,
             implementation_strategy, mitigation_evidence_document,
             likelihood_mitigation, risk_severity, final_risk_level,
             risk_approval, approval_status, date_of_assessment,
             is_demo, created_at, updated_at
           ) VALUES (
             :organization_id, :risk_name, :risk_owner, :ai_lifecycle_phase, :risk_description,
             :risk_category::verifywise.enum_projectrisks_risk_category[],
             :impact, '', '',
             :likelihood, :severity, :risk_level_autocalculated, :review_notes,
             :mitigation_status, :current_risk_level, :deadline, :mitigation_plan,
             :implementation_strategy, '',
             :likelihood_mitigation, :risk_severity, :final_risk_level,
             :risk_approval, :approval_status, :date_of_assessment,
             false, NOW(), NOW()
           );`,
          {
            replacements: {
              organization_id: organizationId,
              ...data,
              risk_category: data.risk_category
                ? `{${(data.risk_category as string[]).map((c) => `"${c.replace(/"/g, '\\"')}"`).join(",")}}`
                : null,
            },
            transaction,
          },
        );
        imported++;
      } catch (err: any) {
        insertErrors.push({
          row: rowIndex,
          field: "general",
          message: `Failed to import: ${err.message}`,
        });
      }
    }

    if (insertErrors.length > 0) {
      await transaction.rollback();
      return {
        success: false,
        imported: 0,
        failed: rows.length,
        errors: insertErrors,
        importedAt: new Date().toISOString(),
      };
    }

    await transaction.commit();
    return {
      success: true,
      imported,
      failed: 0,
      errors: [],
      importedAt: new Date().toISOString(),
    };
  } catch (err) {
    try {
      await transaction.rollback();
    } catch {
      // rollback failure — swallow so the outer error propagates
    }
    throw err;
  }
}
