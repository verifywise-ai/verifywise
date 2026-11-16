jest.mock("../../../database/db", () => ({
  sequelize: { query: jest.fn(), transaction: jest.fn() },
}));
jest.mock("../../../utils/user.utils", () => ({ findUsersNotInOrganization: jest.fn() }));
jest.mock("../../../utils/logger/fileLogger", () => ({
  __esModule: true,
  default: { error: jest.fn(), warn: jest.fn(), info: jest.fn() },
  logStructuredError: jest.fn(),
}));
jest.mock("../../../utils/changeHistory.base.utils", () => ({
  recordEntityCreationBulk: jest.fn(),
}));

import ExcelJS from "exceljs";
import { sequelize } from "../../../database/db";
import { findUsersNotInOrganization } from "../../../utils/user.utils";
import {
  LEGACY_TRANSLATED_MESSAGES,
  LISTS_SHEET_NAME,
  RISK_IMPORT_FILE_MESSAGES,
  RISK_IMPORT_MESSAGES,
  RISK_IMPORT_VALIDATION_MESSAGES,
  RiskImportRow,
  buildExcelTemplate,
  importRisks,
  rowInsertError,
} from "../riskImport.service";
import { MAX_IMPORT_ROWS } from "../../importLimits";

const mockQuery = sequelize.query as jest.Mock;
const mockTransaction = sequelize.transaction as jest.Mock;
const mockOutsideUsers = findUsersNotInOrganization as jest.Mock;

const tx = { commit: jest.fn(), rollback: jest.fn() };

const row = (name: string): RiskImportRow => ({
  risk_name: name,
  risk_owner: 1,
  risk_description: "Description",
});

/** A pg error as Sequelize wraps it: the driver error sits on `original`. */
const dbError = (code: string, extra: Record<string, unknown> = {}) =>
  Object.assign(new Error("raw database text: relation verifywise.risks, value 'secret'"), {
    original: { code, message: "raw database text", ...extra },
  });

const statements = () => mockQuery.mock.calls.map((c) => String(c[0]).trim().split(/\s+/)[0]);

beforeEach(() => {
  jest.resetAllMocks();
  mockTransaction.mockResolvedValue(tx);
  mockOutsideUsers.mockResolvedValue([]);
  // An INSERT returns the new id (the creation history entry needs it).
  mockQuery.mockImplementation(async (sql: string) =>
    sql.trim().startsWith("INSERT") ? [{ id: 1 }] : [],
  );
});

describe("message groups", () => {
  it("the legacy route translates exactly the messages worded by the import", () => {
    expect([...LEGACY_TRANSLATED_MESSAGES].sort()).toEqual(
      Object.values(RISK_IMPORT_FILE_MESSAGES).sort(),
    );
    for (const message of Object.values(RISK_IMPORT_VALIDATION_MESSAGES)) {
      expect(LEGACY_TRANSLATED_MESSAGES.has(message)).toBe(false);
    }
  });

  it("RISK_IMPORT_MESSAGES is both groups, with no key in both", () => {
    const fileKeys = Object.keys(RISK_IMPORT_FILE_MESSAGES);
    const validationKeys = Object.keys(RISK_IMPORT_VALIDATION_MESSAGES);
    expect(fileKeys.filter((k) => validationKeys.includes(k))).toEqual([]);
    expect(Object.keys(RISK_IMPORT_MESSAGES).sort()).toEqual(
      [...fileKeys, ...validationKeys].sort(),
    );
  });
});

describe("importRisks row cap", () => {
  it(`refuses more than ${MAX_IMPORT_ROWS} rows before validating or inserting`, async () => {
    const rows = Array.from({ length: MAX_IMPORT_ROWS + 1 }, (_, i) => row(`Risk ${i}`));
    const result = await importRisks(rows, 7, 1);
    expect(result).toMatchObject({
      success: false,
      imported: 0,
      failed: MAX_IMPORT_ROWS + 1,
      errors: [
        {
          row: 0,
          field: "file",
          message: `This file has more than ${MAX_IMPORT_ROWS} rows. Split it into smaller files and import each one.`,
          messageKey: RISK_IMPORT_MESSAGES.tooManyRows,
          params: { max: MAX_IMPORT_ROWS },
        },
      ],
    });
    expect(mockOutsideUsers).not.toHaveBeenCalled();
    expect(mockTransaction).not.toHaveBeenCalled();
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it(`accepts exactly ${MAX_IMPORT_ROWS} rows`, async () => {
    const rows = Array.from({ length: MAX_IMPORT_ROWS }, (_, i) => row(`Risk ${i}`));
    const result = await importRisks(rows, 7, 1);
    expect(result.success).toBe(true);
    expect(result.imported).toBe(MAX_IMPORT_ROWS);
  });
});

describe("importRisks savepoints", () => {
  it("wraps each insert in its own savepoint and commits when every row saves", async () => {
    const result = await importRisks([row("A"), row("B")], 7, 1);
    expect(result).toMatchObject({ success: true, imported: 2, failed: 0, errors: [] });
    expect(statements()).toEqual([
      "SAVEPOINT",
      "INSERT",
      "RELEASE",
      "SAVEPOINT",
      "INSERT",
      "RELEASE",
    ]);
    for (const call of mockQuery.mock.calls) expect(call[1]).toMatchObject({ transaction: tx });
    expect(tx.commit).toHaveBeenCalled();
    expect(tx.rollback).not.toHaveBeenCalled();
  });

  it("keeps going after a refused row, reports every row's error, then rolls the import back", async () => {
    let insert = 0;
    mockQuery.mockImplementation(async (sql: string) => {
      if (!sql.trim().startsWith("INSERT")) return [];
      insert += 1;
      if (insert === 1) throw dbError("22P02");
      if (insert === 3) throw dbError("XX000");
      return [{ id: insert }];
    });
    const result = await importRisks([row("A"), row("B"), row("C")], 7, 1);

    expect(statements()).toEqual([
      "SAVEPOINT",
      "INSERT",
      "ROLLBACK",
      "RELEASE",
      "SAVEPOINT",
      "INSERT",
      "RELEASE",
      "SAVEPOINT",
      "INSERT",
      "ROLLBACK",
      "RELEASE",
    ]);
    expect(mockQuery.mock.calls[2][0]).toContain("ROLLBACK TO SAVEPOINT");
    expect(result).toMatchObject({
      success: false,
      imported: 0,
      failed: 3,
      errors: [
        { row: 2, field: "general", message: RISK_IMPORT_MESSAGES.enumValue },
        { row: 4, field: "general", message: RISK_IMPORT_MESSAGES.rowNotSaved },
      ],
    });
    expect(JSON.stringify(result)).not.toContain("raw database text");
    expect(tx.rollback).toHaveBeenCalled();
    expect(tx.commit).not.toHaveBeenCalled();
  });

  it("rolls back and rethrows when a savepoint itself fails", async () => {
    mockQuery.mockRejectedValueOnce(new Error("connection lost"));
    await expect(importRisks([row("A")], 7, 1)).rejects.toThrow("connection lost");
    expect(tx.rollback).toHaveBeenCalled();
  });
});

describe("rowInsertError", () => {
  it.each([
    ["22P02", "enumValue"],
    ["22001", "valueTooLong"],
    ["22007", "invalidDate"],
    ["22008", "invalidDate"],
    ["23505", "rowNotSaved"],
  ] as const)("maps %s to a short sentence carrying its key", (code, messageKey) => {
    expect(rowInsertError(5, dbError(code))).toEqual({
      row: 5,
      field: "general",
      message: RISK_IMPORT_MESSAGES[messageKey],
      messageKey: RISK_IMPORT_MESSAGES[messageKey],
    });
  });

  it("names the empty column for a not-null violation", () => {
    expect(rowInsertError(3, dbError("23502", { column: "risk_owner" }))).toEqual({
      row: 3,
      field: "risk_owner",
      message: RISK_IMPORT_MESSAGES.requiredValue,
      messageKey: RISK_IMPORT_MESSAGES.requiredValue,
    });
  });

  it("falls back to the generic sentence for an error without a driver code", () => {
    expect(rowInsertError(2, new Error("boom"))).toEqual({
      row: 2,
      field: "general",
      message: RISK_IMPORT_MESSAGES.rowNotSaved,
      messageKey: RISK_IMPORT_MESSAGES.rowNotSaved,
    });
    expect(rowInsertError(2, null).message).toBe(RISK_IMPORT_MESSAGES.rowNotSaved);
  });
});

describe("buildExcelTemplate user lists", () => {
  it("puts the users on a hidden sheet and points the owner and approver lists at it", async () => {
    // 40 users with long names: far past the 255-character inline list limit.
    const users = Array.from({ length: 40 }, (_, i) => ({
      id: i + 1,
      name: `Firstname${i}`,
      surname: `Surname${i}`,
      email: `person.number.${i}@example-organization.com`,
    }));
    mockQuery.mockResolvedValue(users);

    const { buffer } = await buildExcelTemplate(7);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as never);

    const lists = workbook.getWorksheet(LISTS_SHEET_NAME)!;
    expect(lists).toBeDefined();
    expect(lists.state).toBe("veryHidden");
    expect(lists.getCell(1, 1).value).toBe(
      "Firstname0 Surname0 - person.number.0@example-organization.com (ID: 1)",
    );
    expect(lists.getCell(40, 1).value).toContain("(ID: 40)");

    const sheet = workbook.getWorksheet("Risk Import")!;
    expect(workbook.worksheets[0].name).toBe("Risk Import");
    const range = `${LISTS_SHEET_NAME}!$A$1:$A$40`;
    expect(sheet.getCell("B2").dataValidation?.formulae).toEqual([range]); // risk_owner
    expect(sheet.getCell("R500").dataValidation?.formulae).toEqual([range]); // risk_approval
    // The other lists stay inline.
    expect(String(sheet.getCell("G2").dataValidation?.formulae?.[0])).toMatch(/^"/);
  });

  it("adds no user list validation when the organization has no users", async () => {
    mockQuery.mockResolvedValue([]);
    const { buffer } = await buildExcelTemplate(7);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as never);
    const sheet = workbook.getWorksheet("Risk Import")!;
    expect(sheet.getCell("B2").dataValidation).toBeFalsy();
  });

  it("offers the four approval statuses, and the sample row uses one", async () => {
    mockQuery.mockResolvedValue([]);
    const { buffer } = await buildExcelTemplate(7);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as never);
    const sheet = workbook.getWorksheet("Risk Import")!;
    expect(sheet.getCell("S1").value).toBe("Approval Status");
    expect(sheet.getCell("S2").dataValidation?.formulae).toEqual([
      '"Pending,Approved,Rejected,Not required"',
    ]);
    expect(["Pending", "Approved", "Rejected", "Not required"]).toContain(
      sheet.getCell("S2").value,
    );
  });
});

describe("importRisks approval status", () => {
  const insertedStatus = () =>
    mockQuery.mock.calls.find(([sql]) => String(sql).trim().startsWith("INSERT"))![1].replacements
      .approval_status;

  it("imports a legacy or blank value as Not required", async () => {
    const result = await importRisks([{ ...row("A"), approval_status: "In progress" }], 7, 1);
    expect(result.success).toBe(true);
    expect(insertedStatus()).toBe("Not required");
  });

  it("keeps an Approved row only when the importing user is an Admin", async () => {
    const approved = { ...row("A"), risk_approval: 1, approval_status: "Approved" };
    await importRisks([approved], 7, 1);
    expect(insertedStatus()).toBe("Pending");

    mockQuery.mockClear();
    await importRisks([approved], 7, 1, { strict: false, callerIsAdmin: true });
    expect(insertedStatus()).toBe("Approved");
  });
});
