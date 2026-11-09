import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import { Request, Response } from "express";

/**
 * DELETE /reporting/:id used to delete any file in the organization by id.
 * These tests run the real controller and reporting utils against a small
 * in-memory stand-in for the `files` and `file_folder_mappings` tables and
 * check which rows survive. The stand-in is not a SQL engine: it applies
 * the organization, id and source predicates, ANDed, when their text is in
 * the statement, so it catches a dropped predicate but not a rewritten one
 * (an OR, a subquery, a renamed replacement).
 */

type FileRow = { id: number; organization_id: number; source: string };
type MappingRow = { file_id: number; organization_id: number };

const db: { files: FileRow[]; mappings: MappingRow[] } = { files: [], mappings: [] };

function fakeQuery(sql: string, options: any = {}): any {
  const r = options.replacements ?? {};
  if (/^\s*DELETE FROM files/.test(sql)) {
    // Each predicate applies only if the SQL has it, so a query that loses
    // one deletes too much here.
    const hit = db.files.filter(
      (f) =>
        (!/organization_id = :organizationId/.test(sql) ||
          f.organization_id === r.organizationId) &&
        (!/\bid = :id\b/.test(sql) || f.id === r.id) &&
        (!/source IN \(:sources\)/.test(sql) || r.sources.includes(f.source)),
    );
    db.files = db.files.filter((f) => !hit.includes(f));
    // file_folder_mappings.file_id REFERENCES files(id) ON DELETE CASCADE
    db.mappings = db.mappings.filter((m) => !hit.some((f) => f.id === m.file_id));
    return hit.map((f) => ({ id: f.id }));
  }
  throw new Error(`unexpected query: ${sql}`);
}

jest.mock("../../database/db", () => ({
  sequelize: {
    query: jest.fn(async (sql: string, options: any) => fakeQuery(sql, options)),
    transaction: jest.fn(async () => {
      throw new Error("the report delete is a single statement and opens no transaction");
    }),
  },
}));
// Prevent loading the real reporting engine (Playwright/docx) at import time.
jest.mock("../../services/reporting", () => ({ generateReport: jest.fn() }));
jest.mock("../../utils/reportRun.utils", () => ({
  createRunQuery: jest.fn(),
  updateRunStatusQuery: jest.fn(),
}));
jest.mock("../../services/automations/automationProducer", () => ({
  enqueueAutomationAction: jest.fn(),
}));
jest.mock("../../utils/user.utils", () => ({ getUserByIdQuery: jest.fn() }));
jest.mock("../../utils/organization.utils", () => ({ getOrganizationByIdQuery: jest.fn() }));
jest.mock("../../utils/logger/logHelper", () => ({
  logProcessing: jest.fn(),
  logSuccess: jest.fn(),
  logFailure: jest.fn(),
}));
jest.mock("../../utils/logger/fileLogger", () => ({
  __esModule: true,
  default: { debug: jest.fn(), error: jest.fn(), info: jest.fn() },
}));
jest.mock("../../utils/i18n.utils", () => ({
  translateError: jest.fn((_r, e) => (e as Error).message),
}));

import { deleteGeneratedReportById, mapReportTypeToFileSource } from "../reporting.ctrl";
import { REPORT_FILE_SOURCES } from "../../utils/reporting.utils";

const ORG = 5;

/**
 * Sources written by upload paths that are not report generation. Each must
 * stay out of reach of the report delete.
 */
const NON_REPORT_SOURCES = [
  "Reference controls group", // ISO 42001 annex evidence (iso42001.ctrl.ts)
  "Management system clauses group", // ISO 42001 clause evidence
  "Main clauses group", // ISO 27001 clause / NIST AI RMF subcategory evidence
  "Annex controls group", // ISO 27001 annex evidence
  "Assessment tracker group", // EU AI Act assessment evidence
  "Compliance tracker group", // EU AI Act control evidence
  "AI trust center group",
  "SOC 2 controls", // per-framework evidence label
  "Evidence",
  "File Manager",
  "policy_editor",
  "dataset_bulk_upload",
  "Post-Market Monitoring report", // owned by pmm_reports.file_id
  "ISO 27001 report", // legacy enum value, never generated
];

function createMockReq(id: number): Partial<Request> {
  return {
    params: { id: String(id) },
    organizationId: ORG,
    userId: 3,
    role: "Admin",
    t: (k: string) => k,
  } as unknown as Partial<Request>;
}
function createMockRes(): Response & { status: jest.Mock } {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

describe("deleteGeneratedReportById", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    db.files = [
      { id: 1, organization_id: ORG, source: "Project risks report" },
      { id: 4, organization_id: 99, source: "All reports" },
      ...NON_REPORT_SOURCES.map((source, i) => ({ id: 100 + i, organization_id: ORG, source })),
    ];
    db.mappings = db.files
      .filter((f) => f.organization_id === ORG)
      .map((f) => ({ file_id: f.id, organization_id: ORG }));
  });

  it.each(NON_REPORT_SOURCES.map((source, i) => [source, 100 + i] as const))(
    "answers 404 for a %s file and leaves it and its folder mapping in place",
    async (_source, id) => {
      const filesBefore = db.files.length;
      const mappingsBefore = db.mappings.length;
      const res = createMockRes();

      await deleteGeneratedReportById(createMockReq(id) as Request, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(db.files).toHaveLength(filesBefore);
      expect(db.mappings).toHaveLength(mappingsBefore);
    },
  );

  it("answers 404 for a report in another organization", async () => {
    const res = createMockRes();

    await deleteGeneratedReportById(createMockReq(4) as Request, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(db.files.map((f) => f.id)).toContain(4);
  });

  it("answers 404 for a missing id", async () => {
    const filesBefore = db.files.length;
    const res = createMockRes();

    await deleteGeneratedReportById(createMockReq(404) as Request, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(db.files).toHaveLength(filesBefore);
  });

  it("deletes a generated report, and its folder mapping goes with it", async () => {
    const res = createMockRes();

    await deleteGeneratedReportById(createMockReq(1) as Request, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(db.files.map((f) => f.id)).not.toContain(1);
    expect(db.mappings.map((m) => m.file_id)).not.toContain(1);
    expect(db.files).toHaveLength(1 + NON_REPORT_SOURCES.length);
  });
});

describe("report file sources", () => {
  it("contains no source a non-report upload path writes", () => {
    for (const source of NON_REPORT_SOURCES) {
      expect(REPORT_FILE_SOURCES).not.toContain(source);
    }
  });

  it.each([
    ["projectRisks"],
    ["vendorRisks"],
    ["modelRisks"],
    ["compliance"],
    ["assessment"],
    ["clausesAndAnnexes"],
    ["nistSubcategories"],
    ["trainingRegistry"],
    ["policyManager"],
    ["incidentManagement"],
    ["all"],
    ["Clauses and annexes report"],
    ["ISO 27001 report"],
    ["Reference controls group"],
    ["toString"],
    ["unknown"],
  ])("saves a %s report under a report source", (reportType) => {
    expect(REPORT_FILE_SOURCES).toContain(mapReportTypeToFileSource(reportType));
  });

  it("saves a multi-section report as All reports", () => {
    expect(mapReportTypeToFileSource(["projectRisks", "vendorRisks"])).toBe("All reports");
  });
});
