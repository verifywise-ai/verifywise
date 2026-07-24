const mockRunAnalyzers = jest.fn();
const mockPriorFacts = jest.fn();

jest.mock("../dataCollector", () => ({
  createDataCollector: jest.fn(),
  // facts.ts imports isoDate from this module. Dropping it from the mock makes
  // collectFacts throw, and generateReport's catch would then swallow the whole
  // analysis path — every assertion below would pass or fail for the wrong reason.
  isoDate: (v: unknown) => (v ? new Date(v as any).toISOString().slice(0, 10) : undefined),
}));
jest.mock("../pdfGenerator", () => ({ generatePDF: jest.fn(), closeBrowser: jest.fn() }));
jest.mock("../docxGenerator", () => ({ generateDOCX: jest.fn() }));
jest.mock("../analyzers/runAnalyzers", () => ({
  runAnalyzers: (...a: any[]) => mockRunAnalyzers(...a),
}));
jest.mock("../../../utils/llmKey.utils", () => ({
  getLLMKeysWithKeyQuery: jest.fn().mockResolvedValue([{ id: 1, model: "deepseek-v4-flash" }]),
}));
// collectAnalyzerInputs stays REAL — collectPriorFacts and collectFactsInput
// are what is under test. Its three DB-touching dependencies are mocked so the
// suite never loads database/db.ts.
jest.mock("../../../utils/reportRunAnalysis.utils", () => ({
  getPriorFactsSnapshotQuery: (...a: any[]) => mockPriorFacts(...a),
}));
jest.mock("../../../utils/readiness.utils", () => ({
  getControlScoresQuery: jest.fn(),
  getWeakestControlsQuery: jest.fn(),
  getFrameworkScoreByTypeQuery: jest.fn(),
}));
jest.mock("../../../utils/evidenceAi.utils", () => ({ getEvidenceGapsQuery: jest.fn() }));
jest.mock("../../../utils/logger/fileLogger", () => ({
  __esModule: true,
  default: { debug: jest.fn(), error: jest.fn(), info: jest.fn(), warn: jest.fn() },
}));

import { generateReport } from "../index";
import { createDataCollector } from "../dataCollector";
import { generatePDF } from "../pdfGenerator";

// Fresh per call: generateReport mutates reportData (branding, aiSummaries).
// The fixed generatedAt keeps 41 and 36 out of the rendered reference date, so
// the delta assertions below cannot pass or fail by coincidence.
const makeReportData = (): any => ({
  metadata: {
    projectId: 1,
    projectTitle: "Test Project",
    projectOwner: "John Doe",
    frameworkId: 1,
    frameworkName: "EU AI Act",
    projectFrameworkId: 1,
    generatedAt: new Date("2026-07-01T00:00:00.000Z"),
    generatedBy: "Test User",
    organizationId: 5,
    isOrganizational: false,
  },
  branding: { organizationName: "Test Org" },
  charts: {},
  renderedCharts: {},
  sections: { projectRisks: { totalRisks: 5, risksByLevel: [], risks: [] } },
});

const request: any = {
  projectId: 1,
  frameworkId: 1,
  projectFrameworkId: 1,
  reportType: "projectRisks",
  format: "pdf",
  aiEnhanced: true,
  aiBlocks: {
    sectionSummaries: false,
    executiveSummary: true,
    keyFindings: false,
    recommendedActions: false,
    riskAnalysis: false,
    complianceGap: false,
    vendorRisk: false,
  },
};

const priorSnapshot = {
  generatedAt: "2026-06-01T00:00:00.000Z",
  framework: "EU AI Act",
  subject: "Test Project",
  sections: { projectRisks: { totalRisks: 41 } },
};

const factsHandedToAnalyzers = (): string => mockRunAnalyzers.mock.calls[0][0].extras.facts;

describe("generateReport prior-run comparison", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (createDataCollector as jest.Mock).mockReturnValue({
      collectAllData: jest.fn().mockImplementation(() => Promise.resolve(makeReportData())),
    });
    (generatePDF as jest.Mock).mockResolvedValue({
      success: true,
      filename: "r.pdf",
      content: Buffer.from("x"),
      mimeType: "application/pdf",
    });
    mockRunAnalyzers.mockResolvedValue({});
    mockPriorFacts.mockResolvedValue(null);
  });

  it("queries the prior snapshot for the schedule, in this organization", async () => {
    mockPriorFacts.mockResolvedValue(priorSnapshot);

    await generateReport({ ...request, scheduledReportId: 12 }, 3, 5);

    expect(mockPriorFacts).toHaveBeenCalledWith(12, 5);
  });

  it("renders delta lines from two snapshots, and none at all without a prior", async () => {
    mockPriorFacts.mockResolvedValue(priorSnapshot);
    await generateReport({ ...request, scheduledReportId: 12 }, 3, 5);
    const withPrior = factsHandedToAnalyzers();

    mockRunAnalyzers.mockClear();
    mockPriorFacts.mockResolvedValue(null);
    await generateReport({ ...request, scheduledReportId: 12 }, 3, 5);
    const withoutPrior = factsHandedToAnalyzers();

    expect(withPrior).not.toEqual(withoutPrior);
    expect(withPrior.split("\n").length).toBeGreaterThan(withoutPrior.split("\n").length);
    // renderFacts emits "Use Case Risks totalRisks: 5 (was 41, -36)". 41 is the
    // prior value, 36 the change against this run's 5; a run with no prior
    // carries neither number anywhere in the block.
    expect(withPrior).toMatch(/41|36/);
    expect(withoutPrior).not.toMatch(/41|36/);
  });

  it("never queries for a prior on a manual run, and still renders the facts block", async () => {
    await generateReport(request, 3, 5);

    expect(mockPriorFacts).not.toHaveBeenCalled();
    expect(factsHandedToAnalyzers().length).toBeGreaterThan(0);
  });

  it("keeps the analyses when the prior lookup fails", async () => {
    // One extra query must not become a way to lose a report's analysis.
    mockPriorFacts.mockRejectedValue(new Error("db down"));

    const result = await generateReport({ ...request, scheduledReportId: 12 }, 3, 5);

    expect(mockRunAnalyzers).toHaveBeenCalledTimes(1);
    expect(result.success).toBe(true);
  });

  it("returns this run's snapshot so the runner can persist it", async () => {
    const result = await generateReport({ ...request, scheduledReportId: 12 }, 3, 5);

    expect(result.factsSnapshot).toEqual(
      expect.objectContaining({
        generatedAt: expect.any(String),
        sections: expect.any(Object),
      }),
    );
  });

  it("carries no snapshot when AI is off", async () => {
    const result = await generateReport({ ...request, aiEnhanced: false }, 3, 5);

    expect(result.factsSnapshot).toBeUndefined();
    expect(mockPriorFacts).not.toHaveBeenCalled();
  });
});
