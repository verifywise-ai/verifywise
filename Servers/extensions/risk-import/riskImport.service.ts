import ExcelJS from "exceljs";
import { QueryTypes, Transaction } from "sequelize";
import { sequelize } from "../../database/db";
import { recordEntityCreation } from "../../utils/changeHistory.base.utils";
import { findUsersNotInOrganization } from "../../utils/user.utils";
import { translate } from "../../utils/i18n.utils";
import logger from "../../utils/logger/fileLogger";
import {
  AI_LIFECYCLE_PHASES,
  CURRENT_RISK_LEVEL_VALUES,
  LIKELIHOOD_VALUES,
  MITIGATION_STATUS_VALUES,
  RISK_CATEGORY_VALUES,
  RISK_SEVERITY_VALUES,
  SEVERITY_VALUES,
} from "./risks.enums";
import { calculateRiskLevel, normalizeCurrentRiskLevel } from "../../utils/riskLevel.utils";
import { isInvalidDateCell, riskCalendarDateFromCell } from "../../utils/riskCalendarDate.utils";

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
      `SELECT u.id, u.name, u.surname, u.email
         FROM users u
         JOIN organization_members om ON om.user_id = u.id AND om.organization_id = :organizationId
        ORDER BY u.surname, u.name;`,
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
    { key: "risk_description", header: "Risk Description *", width: 40 },
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
  /** The row's real number in the sheet (header = 1). Optional: falls back to index + 2. */
  row_number?: number;
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
  /** English text. The controller re-translates it from i18nKey for the caller's language. */
  message: string;
  /** Key in locales/en.json (named placeholders), with its values in i18nVars. */
  i18nKey?: string;
  i18nVars?: Record<string, string | number>;
}

/**
 * A row error. Call sites write the key as a literal `i18nKey` so that
 * `npm run i18n:check-en` finds it; `message` is the English text for callers
 * without a request translator, and the controller translates from the key.
 */
function rowError(
  row: number,
  field: string,
  { i18nKey, i18nVars }: { i18nKey: string; i18nVars?: Record<string, string | number> },
): RiskImportError {
  return { row, field, message: translate("en", i18nKey, i18nVars), i18nKey, i18nVars };
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

/** Split the comma-separated category cell into known and unknown values. */
function splitCategories(cell: string | undefined): { valid: string[]; invalid: string[] } {
  const items = cell
    ? cell
        .split(",")
        .map((c) => c.trim())
        .filter((c) => c.length > 0)
    : [];
  return {
    valid: items.filter((c) => inEnum(c, RISK_CATEGORY_VALUES)),
    invalid: items.filter((c) => !inEnum(c, RISK_CATEGORY_VALUES)),
  };
}

/** Case-insensitive key two risk names are compared by. */
function nameKey(name: string | undefined): string {
  return (name ?? "").trim().toLowerCase();
}

/** Text of a spreadsheet cell value; rich text, hyperlinks and formulas give their displayed text. */
function cellText(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? undefined : value.toISOString();
  if (typeof value === "object") {
    const cell = value as Record<string, unknown>;
    if (Array.isArray(cell.richText)) {
      return cell.richText.map((part) => String((part as { text?: unknown })?.text ?? "")).join("");
    }
    if (cell.text !== undefined) return cellText(cell.text);
    if (cell.result !== undefined) return cellText(cell.result);
    if (cell.error !== undefined) return cellText(cell.error);
  }
  return undefined;
}

const DATE_FIELDS = ["deadline", "date_of_assessment"] as const;
const USER_FIELDS = ["risk_owner", "risk_approval"] as const;

/**
 * The client sends raw cell values, so any field can arrive as a number, date
 * or object. Every text field becomes a string (or stays undefined) so the
 * validators never call a string method on a non-string. Dates keep a number
 * as a number, which validation refuses, and users keep a number as an id.
 */
function normalizeRow(raw: unknown): RiskImportRow {
  const source = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const row: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(source)) {
    if (key === "row_number") {
      row[key] = value;
    } else if (
      (DATE_FIELDS as readonly string[]).includes(key) ||
      (USER_FIELDS as readonly string[]).includes(key)
    ) {
      row[key] = typeof value === "number" ? value : cellText(value);
    } else {
      row[key] = cellText(value);
    }
  }
  return row as RiskImportRow;
}

/**
 * Strict rules (the /api/v1 contract): lifecycle phase, likelihood and severity
 * are required and unknown categories are errors. Lenient rules (the frozen
 * legacy path) accept what the endpoint accepted before: those three are
 * optional but enum-checked when present, and unknown categories are dropped.
 */
function validateRow(row: RiskImportRow, rowIndex: number, strict: boolean): RiskImportError[] {
  const errors: RiskImportError[] = [];

  if (!row.risk_name || row.risk_name.trim().length === 0) {
    errors.push(rowError(rowIndex, "risk_name", { i18nKey: "Risk name is required" }));
  }
  if (!parseUserId(row.risk_owner)) {
    errors.push(
      rowError(rowIndex, "risk_owner", {
        i18nKey: "Risk owner must be a valid user ID or selected from dropdown",
      }),
    );
  }
  if (!row.risk_description || row.risk_description.trim().length === 0) {
    errors.push(
      rowError(rowIndex, "risk_description", { i18nKey: "Risk description is required" }),
    );
  }
  // Strict mode requires these like the normal risk form (createRiskSchema):
  // the template marks them with * and likelihood + severity drive the
  // calculated risk level.
  if (!row.ai_lifecycle_phase) {
    if (strict) {
      errors.push(
        rowError(rowIndex, "ai_lifecycle_phase", { i18nKey: "AI lifecycle phase is required" }),
      );
    }
  } else if (!inEnum(row.ai_lifecycle_phase, AI_LIFECYCLE_PHASES)) {
    errors.push(
      rowError(rowIndex, "ai_lifecycle_phase", {
        i18nKey: "Invalid AI lifecycle phase. Must be one of: {values}",
        i18nVars: { values: AI_LIFECYCLE_PHASES.join(", ") },
      }),
    );
  }
  if (!row.likelihood) {
    if (strict) {
      errors.push(rowError(rowIndex, "likelihood", { i18nKey: "Likelihood is required" }));
    }
  } else if (!inEnum(row.likelihood, LIKELIHOOD_VALUES)) {
    errors.push(
      rowError(rowIndex, "likelihood", {
        i18nKey: "Invalid likelihood. Must be one of: {values}",
        i18nVars: { values: LIKELIHOOD_VALUES.join(", ") },
      }),
    );
  }
  if (!row.severity) {
    if (strict) {
      errors.push(rowError(rowIndex, "severity", { i18nKey: "Severity is required" }));
    }
  } else if (!inEnum(row.severity, SEVERITY_VALUES)) {
    errors.push(
      rowError(rowIndex, "severity", {
        i18nKey: "Invalid severity. Must be one of: {values}",
        i18nVars: { values: SEVERITY_VALUES.join(", ") },
      }),
    );
  }
  const categories = splitCategories(row.risk_category);
  if (strict && categories.invalid.length > 0) {
    errors.push(
      rowError(rowIndex, "risk_category", {
        i18nKey: "Invalid risk category: {invalid}. Must be one of: {values}",
        i18nVars: {
          invalid: categories.invalid.join(", "),
          values: RISK_CATEGORY_VALUES.join(", "),
        },
      }),
    );
  }
  if (row.mitigation_status && !inEnum(row.mitigation_status, MITIGATION_STATUS_VALUES)) {
    errors.push(
      rowError(rowIndex, "mitigation_status", {
        i18nKey: "Invalid mitigation status. Must be one of: {values}",
        i18nVars: { values: MITIGATION_STATUS_VALUES.join(", ") },
      }),
    );
  }
  if (
    row.current_risk_level &&
    !inEnum(normalizeCurrentRiskLevel(row.current_risk_level), CURRENT_RISK_LEVEL_VALUES)
  ) {
    errors.push(
      rowError(rowIndex, "current_risk_level", {
        i18nKey: "Invalid current risk level. Must be one of: {values}",
        i18nVars: { values: CURRENT_RISK_LEVEL_VALUES.join(", ") },
      }),
    );
  }
  if (row.likelihood_mitigation && !inEnum(row.likelihood_mitigation, LIKELIHOOD_VALUES)) {
    errors.push(
      rowError(rowIndex, "likelihood_mitigation", {
        i18nKey: "Invalid likelihood mitigation. Must be one of: {values}",
        i18nVars: { values: LIKELIHOOD_VALUES.join(", ") },
      }),
    );
  }
  if (row.risk_severity && !inEnum(row.risk_severity, RISK_SEVERITY_VALUES)) {
    errors.push(
      rowError(rowIndex, "risk_severity", {
        i18nKey: "Invalid risk severity. Must be one of: {values}",
        i18nVars: { values: RISK_SEVERITY_VALUES.join(", ") },
      }),
    );
  }
  if (row.deadline && isInvalidDateCell(row.deadline)) {
    errors.push(
      rowError(rowIndex, "deadline", { i18nKey: "Invalid deadline date format. Use YYYY-MM-DD" }),
    );
  }
  if (row.date_of_assessment && isInvalidDateCell(row.date_of_assessment)) {
    errors.push(
      rowError(rowIndex, "date_of_assessment", {
        i18nKey: "Invalid assessment date format. Use YYYY-MM-DD",
      }),
    );
  }
  return errors;
}

export function parseRow(row: RiskImportRow): Record<string, unknown> {
  // Unknown values are rejected by validateRow before a row is parsed.
  const riskCategory = row.risk_category ? splitCategories(row.risk_category).valid : null;

  // The stored residual likelihood defaults to Rare; derive the level from it.
  const likelihoodMitigation = row.likelihood_mitigation ?? "Rare";

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
    current_risk_level: normalizeCurrentRiskLevel(row.current_risk_level) ?? null,
    deadline: row.deadline ? riskCalendarDateFromCell(row.deadline) : null,
    mitigation_plan: row.mitigation_plan ?? null,
    implementation_strategy: row.implementation_strategy ?? null,
    likelihood_mitigation: likelihoodMitigation,
    risk_severity: row.risk_severity ?? null,
    // Derived like the inherent level; the sheet value is ignored.
    final_risk_level: calculateRiskLevel(likelihoodMitigation, row.risk_severity ?? null),
    risk_approval: parseUserId(row.risk_approval),
    approval_status: row.approval_status ?? null,
    // An empty cell stays empty: the import time is not an assessment date.
    date_of_assessment: row.date_of_assessment
      ? riskCalendarDateFromCell(row.date_of_assessment)
      : null,
  };
}

/** Advisory-lock class for pg_advisory_xact_lock(class, org): one risk import commit per org at a time. */
const RISK_IMPORT_LOCK_CLASS = 5301;

/**
 * Leading/trailing whitespace as JS String.prototype.trim strips it, for the
 * existing-name pre-filter: ASCII whitespace plus NBSP, BOM, Ogham space mark, U+2000-200A,
 * line/paragraph separators, narrow NBSP, medium math space, ideographic space.
 */
const SQL_TRIM_PATTERN = `^[[:space:]\u00a0\ufeff\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000]+|[[:space:]\u00a0\ufeff\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000]+$`;

/** Any character outside ASCII, as a PostgreSQL regular expression. */
const NON_ASCII_PATTERN = "[^\\x01-\\x7F]";

/** One error per row whose name matches an existing, non-deleted risk of the organization. */
async function existingNameErrors(
  rows: RiskImportRow[],
  rowNumbers: number[],
  organizationId: number,
  transaction?: Transaction,
): Promise<RiskImportError[]> {
  const keys = [...new Set(rows.map((row) => nameKey(row.risk_name)).filter((k) => k))];
  if (keys.length === 0) return [];
  // Only candidates come back, so a large register is not loaded in full. The
  // SQL trims the characters JS trim() strips and lower-cases, and the JS key
  // below confirms each returned name. PostgreSQL lower() and JS toLowerCase()
  // disagree on non-ASCII letters under some collations, so every name with a
  // non-ASCII character is returned too and left to the JS comparison.
  const existing = (await sequelize.query(
    `SELECT risk_name
       FROM risks
      WHERE organization_id = :organizationId
        AND (is_deleted = false OR is_deleted IS NULL)
        AND (
          lower(regexp_replace(risk_name, :trimPattern, '', 'g')) = ANY(ARRAY[:keys]::text[])
          OR risk_name ~ :nonAscii
        )`,
    {
      replacements: {
        organizationId,
        keys,
        trimPattern: SQL_TRIM_PATTERN,
        nonAscii: NON_ASCII_PATTERN,
      },
      type: QueryTypes.SELECT,
      transaction,
    },
  )) as { risk_name: string | null }[];
  const existingNames = new Set(existing.map((r) => nameKey(r.risk_name ?? undefined)));
  const errors: RiskImportError[] = [];
  rows.forEach((row, i) => {
    const key = nameKey(row.risk_name);
    if (key && existingNames.has(key)) {
      errors.push(
        rowError(rowNumbers[i], "risk_name", {
          i18nKey: 'A risk named "{name}" already exists',
          i18nVars: { name: row.risk_name!.trim() },
        }),
      );
    }
  });
  return errors;
}

export interface ImportRisksOptions {
  /**
   * true (the /api/v1 contract): required phase/likelihood/severity, unknown
   * categories rejected, duplicate names rejected, the sheet's row numbers
   * honoured. false (the frozen legacy path): the accept rules the endpoint
   * had before, with row numbers as index + 2.
   */
  strict: boolean;
}

export async function importRisks(
  rawRows: RiskImportRow[],
  organizationId: number,
  userId: number,
  { strict }: ImportRisksOptions = { strict: false },
): Promise<RiskImportResult> {
  const errors: RiskImportError[] = [];
  const rows = rawRows.map(normalizeRow);
  // The client sends each row's real sheet row (blank rows are dropped before
  // sending); without it, +2 accounts for the header row plus 1-based indexing.
  const rowNumbers = rows.map((row, i) =>
    strict && Number.isInteger(row.row_number) && (row.row_number as number) > 0
      ? (row.row_number as number)
      : i + 2,
  );

  rows.forEach((row, i) => {
    errors.push(...validateRow(row, rowNumbers[i], strict));
  });

  // Owner and approver must be members of the importing organization. A value
  // that is not a positive integer (e.g. 5.5, which PostgreSQL would round to
  // another user id) fails closed instead of skipping the check.
  const userFields = USER_FIELDS;
  const isValidUserId = (id: number | null): id is number =>
    id !== null && Number.isInteger(id) && id > 0;
  const referencedUserIds = rows.flatMap((row) =>
    userFields.map((field) => parseUserId(row[field])).filter(isValidUserId),
  );
  const outsideUserIds = new Set(
    await findUsersNotInOrganization(referencedUserIds, organizationId),
  );
  rows.forEach((row, i) => {
    for (const field of userFields) {
      const id = parseUserId(row[field]);
      if (id !== null && (!isValidUserId(id) || outsideUserIds.has(id))) {
        errors.push(
          rowError(rowNumbers[i], field, { i18nKey: "User must be a member of this organization" }),
        );
      }
    }
  });

  // A re-uploaded sheet must not create the same risks twice: reject names
  // that repeat earlier in the file here, and names that already exist in this
  // organization below (under a lock, so two imports cannot both pass).
  const firstRowByName = new Map<string, number>();
  rows.forEach((row, i) => {
    const key = nameKey(row.risk_name);
    if (!strict || !key) return;
    const firstRow = firstRowByName.get(key);
    if (firstRow === undefined) {
      firstRowByName.set(key, rowNumbers[i]);
    } else {
      errors.push(
        rowError(rowNumbers[i], "risk_name", {
          i18nKey: 'A risk named "{name}" already appears on row {row} of this file',
          i18nVars: { name: row.risk_name!.trim(), row: firstRow },
        }),
      );
    }
  });

  const rejected = (list: RiskImportError[]): RiskImportResult => ({
    success: false,
    imported: 0,
    failed: rows.length,
    errors: [...list].sort((a, b) => a.row - b.row),
    importedAt: new Date().toISOString(),
  });

  if (errors.length > 0) {
    // Already failing: report existing names too, so one pass shows every problem.
    if (strict) errors.push(...(await existingNameErrors(rows, rowNumbers, organizationId)));
    return rejected(errors);
  }

  let imported = 0;
  const insertErrors: RiskImportError[] = [];
  const transaction = await sequelize.transaction();

  try {
    // Only the strict path checks existing names, so only it needs the lock.
    if (strict) {
      await sequelize.query(`SELECT pg_advisory_xact_lock(:lockClass, :organizationId)`, {
        replacements: { lockClass: RISK_IMPORT_LOCK_CLASS, organizationId },
        type: QueryTypes.SELECT,
        transaction,
      });
    }
    const nameErrors = strict
      ? await existingNameErrors(rows, rowNumbers, organizationId, transaction)
      : [];
    if (nameErrors.length > 0) {
      await transaction.rollback();
      return rejected(nameErrors);
    }

    for (let i = 0; i < rows.length; i++) {
      const data = parseRow(rows[i]);
      const rowIndex = rowNumbers[i];
      // One savepoint per row: a failed INSERT aborts only that row's work, so
      // every later row still runs and reports its own error.
      const savepoint = `risk_import_row_${i}`;
      await sequelize.query(`SAVEPOINT ${savepoint}`, { transaction });
      try {
        const inserted = (await sequelize.query(
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
           ) RETURNING id;`,
          {
            replacements: {
              organization_id: organizationId,
              ...data,
              risk_category: data.risk_category
                ? `{${(data.risk_category as string[]).map((c) => `"${c.replace(/"/g, '\\"')}"`).join(",")}}`
                : null,
            },
            type: QueryTypes.SELECT,
            transaction,
          },
        )) as { id: number }[];
        // Same creation entries the risk form writes, on the same transaction.
        // Once a row has failed the whole import rolls back, so later rows skip
        // the history write; their INSERTs still run to report their own errors.
        if (insertErrors.length === 0) {
          await recordEntityCreation(
            "risk",
            inserted[0].id,
            userId,
            organizationId,
            data,
            transaction,
          );
        }
        await sequelize.query(`RELEASE SAVEPOINT ${savepoint}`, { transaction });
        imported++;
      } catch (err: any) {
        await sequelize.query(`ROLLBACK TO SAVEPOINT ${savepoint}`, { transaction });
        // The database's own text can name tables and columns: keep it in the
        // log and give the caller a fixed message.
        const detail = String(err?.message ?? err).replace(/[\r\n\t\u2028\u2029]+/g, " ");
        logger.error(`Risk import row ${rowIndex} could not be saved: ${detail}`);
        insertErrors.push(
          rowError(rowIndex, "general", {
            i18nKey: "This row could not be saved. Check its values and try again.",
          }),
        );
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
