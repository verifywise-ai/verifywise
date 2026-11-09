import ExcelJS from "exceljs";
import { Transaction } from "sequelize";
import { sequelize } from "../database/db";
import { AiAppDiscoveredSource } from "../domain.layer/enums/ai-app-status.enum";
import { aiAppDepartmentsFrom, createAiAppQuery } from "./aiApp.utils";
import { createNewVendorQuery } from "./vendor.utils";
import {
  AI_APP_STATUS_LABELS,
  comparisonKey,
  ImportPlan,
  ImportReferenceData,
  ParsedImportRow,
  BulkRowError,
  parseImportRows,
  planImport,
} from "./validations/aiAppBulkValidation.utils";

/** Class key for pg_advisory_xact_lock(class, org): one import commit per org at a time. */
const IMPORT_LOCK_CLASS = 5258;
const TEMPLATE_ROWS_END = 1001;

export interface AiAppImportResult {
  dry_run: boolean;
  total: number;
  created: number;
  to_create: number;
  skipped: { row: number; name: string; reason: string }[];
  new_vendors: string[];
  errors: BulkRowError[];
}

async function loadReferenceData(
  organizationId: number,
  transaction?: Transaction,
): Promise<ImportReferenceData> {
  // Compared in JS rather than with LOWER() so a single key function decides
  // what counts as the same name, in the dry run and in the commit.
  const [apps] = await sequelize.query(`SELECT name FROM ai_apps WHERE organization_id = :orgId`, {
    replacements: { orgId: organizationId },
    transaction,
  });
  const [vendors] = await sequelize.query(
    `SELECT id, vendor_name FROM vendors WHERE organization_id = :orgId ORDER BY id`,
    { replacements: { orgId: organizationId }, transaction },
  );
  const [users] = await sequelize.query(
    `SELECT u.id, u.email FROM users u
     JOIN organization_members om ON om.user_id = u.id AND om.organization_id = :orgId`,
    { replacements: { orgId: organizationId }, transaction },
  );

  const vendorIdsByKey = new Map<string, number>();
  for (const vendor of vendors as { id: number; vendor_name: string }[]) {
    const key = comparisonKey(vendor.vendor_name);
    if (!vendorIdsByKey.has(key)) vendorIdsByKey.set(key, vendor.id);
  }

  return {
    existingAppNameKeys: new Set((apps as { name: string }[]).map((a) => comparisonKey(a.name))),
    vendorIdsByKey,
    userIdsByEmail: new Map(
      (users as { id: number; email: string }[]).map((u) => [comparisonKey(u.email), u.id]),
    ),
  };
}

function toResult(
  plan: ImportPlan,
  total: number,
  dryRun: boolean,
  created: number,
): AiAppImportResult {
  return {
    dry_run: dryRun,
    total,
    created,
    to_create: plan.toCreate.length,
    skipped: plan.skipped,
    new_vendors: [...plan.newVendors.values()],
    errors: plan.errors,
  };
}

async function buildPlan(
  parsed: ParsedImportRow[],
  errors: BulkRowError[],
  organizationId: number,
  transaction?: Transaction,
): Promise<ImportPlan> {
  const reference = await loadReferenceData(organizationId, transaction);
  return planImport(parsed, errors, reference);
}

/** POST /import with dry_run: what a commit would do. Writes nothing. */
export async function previewAiAppImport(
  rows: unknown[],
  organizationId: number,
): Promise<AiAppImportResult> {
  const { parsed, errors } = parseImportRows(rows);
  const plan = await buildPlan(parsed, errors, organizationId);
  return toResult(plan, rows.length, true, 0);
}

/**
 * Commits an import inside the caller's transaction. Returns with `errors` set
 * and nothing written when any row is invalid. Holding the advisory lock means
 * two imports can't both decide to add the same new vendor.
 */
export async function commitAiAppImport(
  rows: unknown[],
  organizationId: number,
  userId: number,
  transaction: Transaction,
): Promise<AiAppImportResult> {
  const { parsed, errors } = parseImportRows(rows);

  await sequelize.query(`SELECT pg_advisory_xact_lock(:lockClass, :orgId)`, {
    replacements: { lockClass: IMPORT_LOCK_CLASS, orgId: organizationId },
    transaction,
  });

  const plan = await buildPlan(parsed, errors, organizationId, transaction);
  if (plan.errors.length > 0) return toResult(plan, rows.length, false, 0);

  const newVendorIds = new Map<string, number>();
  for (const [key, vendorName] of plan.newVendors) {
    // Required text columns stay empty rather than invented, and a bulk load
    // must not fire one vendor_added automation per row.
    const vendor = await createNewVendorQuery(
      {
        vendor_name: vendorName,
        vendor_provides: "",
        assignee: null,
        website: "",
        vendor_contact_person: "",
      },
      organizationId,
      transaction,
      false,
      { runAutomations: false },
    );
    newVendorIds.set(key, vendor.id!);
  }

  for (const { row, ownerId, vendorId, newVendorKey } of plan.toCreate) {
    await createAiAppQuery(
      {
        name: row.name,
        description: row.description ?? undefined,
        vendor_id: newVendorKey ? (newVendorIds.get(newVendorKey) ?? null) : vendorId,
        owner_id: ownerId,
        status: row.status,
        discovered_source: AiAppDiscoveredSource.MANUAL,
        departments: aiAppDepartmentsFrom(row.departments),
        required_training: row.requiredTraining ?? undefined,
      },
      organizationId,
      transaction,
      userId,
    );
  }

  return toResult(plan, rows.length, false, plan.toCreate.length);
}

// ─── Workbooks ─────────────────────────────────────────────────────────────

/** A workbook with one sheet, a frozen brand-styled header row and these columns. */
export function createStyledWorkbook(
  sheetName: string,
  columns: { header: string; key: string; width: number }[],
): { workbook: ExcelJS.Workbook; worksheet: ExcelJS.Worksheet } {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet(sheetName);
  worksheet.columns = columns;

  const headerRow = worksheet.getRow(1);
  headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
  headerRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF13715B" } };
  headerRow.alignment = { vertical: "middle", horizontal: "center" };
  headerRow.height = 25;
  worksheet.views = [{ state: "frozen", xSplit: 0, ySplit: 1 }];

  return { workbook, worksheet };
}

export async function workbookToBuffer(workbook: ExcelJS.Workbook): Promise<Buffer> {
  return Buffer.from((await workbook.xlsx.writeBuffer()) as ArrayBuffer);
}

/** The import template: headers and a status dropdown, with no sample row to import by mistake. */
export async function buildAiAppImportTemplate(): Promise<{ buffer: Buffer; filename: string }> {
  const { workbook, worksheet } = createStyledWorkbook("AI apps", [
    { header: "Name", key: "name", width: 32 },
    { header: "Description", key: "description", width: 48 },
    { header: "Vendor", key: "vendor", width: 28 },
    { header: "Owner email", key: "owner_email", width: 32 },
    { header: "Status", key: "status", width: 18 },
    { header: "Departments", key: "departments", width: 32 },
    { header: "Required training", key: "required_training", width: 32 },
  ]);

  const statusColumn = 5;
  const statusList = Object.values(AI_APP_STATUS_LABELS).join(",");
  for (let rowNumber = 2; rowNumber <= TEMPLATE_ROWS_END; rowNumber++) {
    worksheet.getCell(rowNumber, statusColumn).dataValidation = {
      type: "list",
      allowBlank: true,
      formulae: [`"${statusList}"`],
      showErrorMessage: true,
      errorStyle: "error",
      errorTitle: "Invalid status",
      error: "Please select from the dropdown list",
    };
  }

  return { buffer: await workbookToBuffer(workbook), filename: "ai_apps_import_template.xlsx" };
}
