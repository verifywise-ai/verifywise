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
jest.mock("../pdfGenerator", () => ({ generatePDF: jest.fn(), closeBrowser: jest.fn() }));
jest.mock("../docxGenerator", () => ({ generateDOCX: jest.fn() }));
jest.mock("../../../utils/reportRun.utils", () => ({
  getPriorE23GlanceQuery: (...a: unknown[]) => mockPrior(...a),
}));
jest.mock("../../../utils/logger/fileLogger", () => ({
  __esModule: true,
  default: { debug: jest.fn(), error: jest.fn(), info: jest.fn(), warn: jest.fn() },
  logStructuredError: jest.fn(),
}));

import { generateReport } from "../index";
import { generatePDF } from "../pdfGenerator";

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
const prior = { ...figures, rulesFired: 4, generatedAt: "2026-07-01T09:00:00.000Z" };

const reportData = (e23: boolean): any => ({
  metadata: { generatedAt: GENERATED_AT, organizationId: 5 },
  branding: {},
  charts: {},
  renderedCharts: {},
  sectionNotices: [],
  sections: e23 ? { e23Glance: { ...figures, previous: prior } } : {},
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

    expect(result.e23Glance).toEqual({ ...figures, generatedAt: GENERATED_AT.toISOString() });
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
