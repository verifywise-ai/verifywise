/**
 * @fileoverview generateReport for E-23 kind runs: the previous run's glance
 * is looked up (schedule first, then template) and handed to the collector,
 * and the run's own glance comes back on the result for storage. Non-kind
 * runs do neither.
 *
 * @module tests/index.e23
 */

const mockPrior = jest.fn();
const mockCollectAllData = jest.fn();

jest.mock("../dataCollector", () => ({
  createDataCollector: jest.fn(() => ({ collectAllData: mockCollectAllData })),
  createScopedDataCollector: jest.fn(() => ({ collectAllData: mockCollectAllData })),
}));
jest.mock("../reportScope", () => ({ resolveFrameworkTargets: jest.fn().mockResolvedValue([]) }));
jest.mock("../pdfGenerator", () => ({
  generatePDF: jest.fn(),
  generateFixItPDF: jest.fn(),
  closeBrowser: jest.fn(),
}));
jest.mock("../docxGenerator", () => ({ generateDOCX: jest.fn() }));
jest.mock("../docxFixIt", () => ({ generateFixItDOCX: jest.fn() }));
// An AI run whose key lookup fails still renders (analysis never loses the report).
jest.mock("../../../utils/llmKey.utils", () => ({
  getLLMKeysWithKeyQuery: jest.fn().mockRejectedValue(new Error("no keys")),
}));
jest.mock("../../../utils/reportRun.utils", () => ({
  getPriorE23GlanceQuery: (...a: unknown[]) => mockPrior(...a),
}));
jest.mock("../../../utils/logger/fileLogger", () => ({
  __esModule: true,
  default: { debug: jest.fn(), error: jest.fn(), info: jest.fn(), warn: jest.fn() },
  logStructuredError: jest.fn(),
}));

import { generateReport } from "../index";
import { generateFixItPDF, generatePDF } from "../pdfGenerator";
import { generateDOCX } from "../docxGenerator";
import { generateFixItDOCX } from "../docxFixIt";

const GENERATED_AT = new Date("2026-10-01T09:00:00.000Z");

const figures = {
  requirementsDone: 30,
  requirementsTotal: 83,
  groupsChecked: 2,
  groupsTotal: 3,
  rulesFired: 1,
  rulesTotal: 13,
  modelsInScope: 12,
  untiered: 3,
  overdueValidations: 4,
  openCriticalHigh: 3,
  fixIt: { high: 6, medium: 5, low: 4 },
};
const prior = {
  ...figures,
  rulesFired: 4,
  generatedAt: "2026-07-01T09:00:00.000Z",
  requirementsAvailable: true,
};

const reportData = (e23: boolean): any => ({
  metadata: { generatedAt: GENERATED_AT, organizationId: 5 },
  branding: {},
  charts: {},
  renderedCharts: {},
  sectionNotices: [],
  sections: e23 ? { e23Glance: { ...figures, requirementsAvailable: true, previous: null } } : {},
});

const request: any = {
  projectId: 0,
  frameworkId: 0,
  projectFrameworkId: 0,
  scope: "organization",
  reportType: ["mrmFleet"],
  format: "pdf",
  reportKind: "osfi_e23",
  reportParameters: { periodStart: "2026-07-01", periodEnd: "2026-09-30" },
};

beforeEach(() => {
  mockPrior.mockReset().mockResolvedValue(prior);
  mockCollectAllData.mockReset().mockResolvedValue(reportData(true));
  (generatePDF as jest.Mock).mockResolvedValue({
    success: true,
    filename: "r.pdf",
    content: Buffer.from("x"),
    mimeType: "application/pdf",
  });
});

describe("generateReport, E-23 kind", () => {
  it("looks the prior glance up by schedule and template and passes it to the collector", async () => {
    await generateReport({ ...request, scheduledReportId: 3, templateId: 4 }, 1, 5);

    expect(mockPrior).toHaveBeenCalledWith(5, { scheduledReportId: 3, templateId: 4 });
    expect(mockCollectAllData).toHaveBeenCalledWith(
      ["mrmFleet"],
      { reportKind: "osfi_e23", reportParameters: request.reportParameters },
      { priorE23Glance: prior },
    );
  });

  it("returns the run's glance for storage, without previous", async () => {
    const result = await generateReport({ ...request, templateId: 4 }, 1, 5);

    expect(result.e23Glance).toEqual({
      ...figures,
      requirementsAvailable: true,
      generatedAt: GENERATED_AT.toISOString(),
    });
  });

  it("validates the stored value: a malformed prior means no comparison", async () => {
    mockPrior.mockResolvedValue({ rulesFired: "x" });

    await generateReport({ ...request, templateId: 4 }, 1, 5);

    expect(mockCollectAllData.mock.calls[0][2]).toEqual({ priorE23Glance: null });
  });

  it("an older stored glance without the flag counts as available", async () => {
    const { requirementsAvailable: _flag, ...older } = prior;
    mockPrior.mockResolvedValue(older);

    await generateReport({ ...request, templateId: 4 }, 1, 5);

    expect(mockCollectAllData.mock.calls[0][2]).toEqual({ priorE23Glance: prior });
  });

  it("a failed prior lookup means no comparison, not a failed report", async () => {
    mockPrior.mockRejectedValue(new Error("db"));

    const result = await generateReport({ ...request, templateId: 4 }, 1, 5);

    expect(result.success).toBe(true);
    expect(mockCollectAllData.mock.calls[0][2]).toEqual({ priorE23Glance: null });
  });
});

describe("generateReport, general run", () => {
  it("never looks up a prior glance and returns none", async () => {
    mockCollectAllData.mockResolvedValue(reportData(false));

    const result = await generateReport(
      { ...request, reportKind: undefined, reportParameters: undefined, scheduledReportId: 3 },
      1,
      5,
    );

    expect(mockPrior).not.toHaveBeenCalled();
    expect(mockCollectAllData.mock.calls[0]).toHaveLength(2);
    expect(result.e23Glance).toBeUndefined();
  });
});

describe("generateReport, E-23 fix-it companion", () => {
  const fixItRequest = { ...request, reportType: ["mrmFleet", "e23FixItList"], runId: 77 };
  const PDF_FIX_IT = {
    success: true,
    filename: "x.pdf",
    content: Buffer.from("fix"),
    mimeType: "application/pdf",
  };

  beforeEach(() => {
    (generateFixItPDF as jest.Mock).mockReset().mockResolvedValue(PDF_FIX_IT);
    (generateFixItDOCX as jest.Mock).mockReset().mockResolvedValue({
      ...PDF_FIX_IT,
      filename: "x.docx",
      mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    });
    (generateDOCX as jest.Mock).mockResolvedValue({
      success: true,
      filename: "r.docx",
      content: Buffer.from("x"),
      mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    });
  });

  it("produces the fix-it list in the run's format, named after the formal report", async () => {
    const result = await generateReport({ ...fixItRequest, reportName: "Q3 E-23" }, 1, 5);

    expect(generateFixItPDF).toHaveBeenCalledWith(expect.anything(), 77);
    expect(result.success).toBe(true);
    expect(result.filename).toBe("Q3 E-23.pdf");
    expect(result.companion).toEqual({
      filename: "Q3 E-23_fix-it-list.pdf",
      content: PDF_FIX_IT.content,
      mimeType: "application/pdf",
    });
  });

  it("produces a DOCX fix-it list for a DOCX run", async () => {
    const result = await generateReport(
      { ...fixItRequest, format: "docx", reportName: "Q3 E-23" },
      1,
      5,
    );

    expect(generateFixItDOCX).toHaveBeenCalledWith(expect.anything(), 77);
    expect(generateFixItPDF).not.toHaveBeenCalled();
    expect(result.companion?.filename).toBe("Q3 E-23_fix-it-list.docx");
  });

  it("names the companion after the formal base name, without the AI marker", async () => {
    mockCollectAllData.mockResolvedValue({
      ...reportData(true),
      aiSummaries: { executiveSummary: "x" },
    });

    const result = await generateReport(
      { ...fixItRequest, reportName: "Q3 E-23", aiEnhanced: true },
      1,
      5,
    );

    expect(result.filename).toBe("Q3 E-23_AI_.pdf");
    expect(result.companion?.filename).toBe("Q3 E-23_fix-it-list.pdf");
  });

  it("produces no companion when the fix-it list is not selected", async () => {
    const result = await generateReport({ ...request, runId: 77 }, 1, 5);

    expect(generateFixItPDF).not.toHaveBeenCalled();
    expect(result.companion).toBeUndefined();
  });

  it("produces no companion for a general report, even with the key selected", async () => {
    mockCollectAllData.mockResolvedValue(reportData(false));

    const result = await generateReport(
      { ...fixItRequest, reportKind: undefined, reportParameters: undefined },
      1,
      5,
    );

    expect(generateFixItPDF).not.toHaveBeenCalled();
    expect(result.companion).toBeUndefined();
  });

  it("fails the whole result when the fix-it list fails to render", async () => {
    (generateFixItPDF as jest.Mock).mockResolvedValue({
      success: false,
      filename: "",
      content: Buffer.alloc(0),
      mimeType: "",
      error: "browser crashed",
    });

    const result = await generateReport(fixItRequest, 1, 5);

    expect(result.success).toBe(false);
    expect(result.error).toBe("The fix-it list could not be generated: browser crashed");
    expect(result.companion).toBeUndefined();
  });

  it("fails the whole result when the fix-it renderer throws", async () => {
    (generateFixItPDF as jest.Mock).mockRejectedValue(new Error("template missing"));

    const result = await generateReport(fixItRequest, 1, 5);

    expect(result.success).toBe(false);
    expect(result.error).toBe("The fix-it list could not be generated: template missing");
  });

  it("does not try the fix-it list when the formal report already failed", async () => {
    (generatePDF as jest.Mock).mockResolvedValue({
      success: false,
      filename: "",
      content: Buffer.alloc(0),
      mimeType: "",
      error: "formal failed",
    });

    const result = await generateReport(fixItRequest, 1, 5);

    expect(generateFixItPDF).not.toHaveBeenCalled();
    expect(result.success).toBe(false);
    expect(result.error).toBe("formal failed");
  });
});
