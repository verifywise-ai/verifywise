import { screen, fireEvent, waitFor } from "@testing-library/react";
import { renderWithProviders } from "../../../../test/renderWithProviders";
import ScanDetailsPage from "../ScanDetailsPage";
import type { Scan, ScanResponse, Finding } from "../../../../domain/ai-detection/types";

const mockNavigate = vi.fn();
let mockParams: { scanId?: string; tab?: string } = { scanId: "123", tab: undefined };

vi.mock("react-router", async () => {
  const actual: any = await vi.importActual("react-router");
  return {
    ...actual,
    useNavigate: () => mockNavigate,
    useParams: () => mockParams,
  };
});

const mockGetScan = vi.fn();
const mockGetScanFindings = vi.fn();
const mockGetScanSecurityFindings = vi.fn();
const mockGetScanSecuritySummary = vi.fn();
const mockExportAIBOM = vi.fn();
const mockGetComplianceMapping = vi.fn();
const mockRecalculateRiskScore = vi.fn();
const mockUpdateFindingGovernanceStatus = vi.fn();
const mockCreateSuppression = vi.fn();

vi.mock("../../../../application/repository/aiDetection.repository", () => ({
  getScan: (...args: unknown[]) => mockGetScan(...args),
  getScanFindings: (...args: unknown[]) => mockGetScanFindings(...args),
  getScanSecurityFindings: (...args: unknown[]) => mockGetScanSecurityFindings(...args),
  getScanSecuritySummary: (...args: unknown[]) => mockGetScanSecuritySummary(...args),
  exportAIBOM: (...args: unknown[]) => mockExportAIBOM(...args),
  getComplianceMapping: (...args: unknown[]) => mockGetComplianceMapping(...args),
  recalculateRiskScore: (...args: unknown[]) => mockRecalculateRiskScore(...args),
  updateFindingGovernanceStatus: (...args: unknown[]) => mockUpdateFindingGovernanceStatus(...args),
  createSuppression: (...args: unknown[]) => mockCreateSuppression(...args),
}));

vi.mock("../../../components/Layout/PageHeaderExtended", () => ({
  PageHeaderExtended: ({ children, title, description, alert }: any) => (
    <div data-testid="page-header">
      <h1>{title}</h1>
      <span>{description}</span>
      {alert}
      {children}
    </div>
  ),
}));

function makeScan(overrides: Partial<Scan> = {}): Scan {
  return {
    id: 123,
    repository_url: "https://github.com/acme/widgets",
    repository_owner: "acme",
    repository_name: "widgets",
    status: "completed",
    findings_count: 10,
    files_scanned: 50,
    triggered_by: { id: 1, name: "Jane" },
    created_at: "2026-01-01T00:00:00Z",
    duration_ms: 30000,
    risk_score: 85,
    risk_score_grade: "A",
    ...overrides,
  };
}

function makeScanResponse(overrides: Partial<Scan> = {}): ScanResponse {
  return {
    scan: makeScan(overrides),
    summary: {
      total: 10,
      by_confidence: { high: 6, medium: 3, low: 1 },
      by_provider: {},
      by_finding_type: {
        library: 5,
        dependency: 0,
        api_call: 2,
        secret: 0,
        model_ref: 1,
        rag_component: 0,
        agent: 0,
      },
    },
  };
}

function makeFinding(overrides: Partial<Finding> = {}): Finding {
  return {
    id: 1,
    finding_type: "library",
    category: "AI/ML",
    name: "openai",
    provider: "OpenAI",
    confidence: "high",
    risk_level: "high",
    file_count: 1,
    file_paths: [],
    ...overrides,
  };
}

const emptyPagination = { total: 0, page: 1, limit: 50, total_pages: 1 };

function setupFindingsMock(overrides: Record<string, Finding[]> = {}) {
  mockGetScanFindings.mockImplementation((_id: number, params: any) => {
    const type = params?.finding_type;
    const findings = overrides[type] || [];
    return Promise.resolve({
      findings,
      pagination: { ...emptyPagination, total: findings.length },
    });
  });
}

describe("ScanDetailsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockParams = { scanId: "123", tab: undefined };
    setupFindingsMock();
    mockGetScanSecurityFindings.mockResolvedValue({ findings: [], pagination: emptyPagination });
    mockGetScanSecuritySummary.mockResolvedValue({
      total: 0,
      by_severity: { critical: 0, high: 0, medium: 0, low: 0 },
      by_threat_type: {},
      model_files_scanned: 0,
    });
  });

  it("shows a loading message before the scan loads", () => {
    mockGetScan.mockImplementation(() => new Promise(() => {}));
    renderWithProviders(<ScanDetailsPage />);

    expect(screen.getByText("Loading scan details...")).toBeInTheDocument();
  });

  it("shows an error message when the scan fails to load", async () => {
    mockGetScan.mockRejectedValue(new Error("not found"));
    renderWithProviders(<ScanDetailsPage />);

    await waitFor(() => {
      expect(screen.getByText("Failed to load scan details")).toBeInTheDocument();
    });
  });

  it("renders the repository name and tab bar once loaded", async () => {
    mockGetScan.mockResolvedValue(makeScanResponse());
    renderWithProviders(<ScanDetailsPage />);

    await waitFor(() => {
      expect(screen.getAllByText("acme/widgets")[0]).toBeInTheDocument();
    });

    expect(screen.getByRole("tab", { name: /Libraries/ })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /Security/ })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /Compliance/ })).toBeInTheDocument();
  });

  it("renders detected library findings on the libraries tab", async () => {
    mockGetScan.mockResolvedValue(makeScanResponse());
    setupFindingsMock({ library: [makeFinding({ id: 1, name: "openai" })] });
    renderWithProviders(<ScanDetailsPage />);

    await waitFor(() => {
      expect(screen.getByText("openai")).toBeInTheDocument();
    });
  });

  it("switches to the API calls tab and navigates", async () => {
    mockGetScan.mockResolvedValue(makeScanResponse());
    renderWithProviders(<ScanDetailsPage />);

    await waitFor(() => {
      expect(screen.getAllByText("acme/widgets")[0]).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("tab", { name: /API calls/ }));

    expect(mockNavigate).toHaveBeenCalledWith("/ai-detection/scans/123/api-calls", {
      replace: true,
    });
    await waitFor(() => {
      expect(screen.getByText(/API calls to AI\/ML services/)).toBeInTheDocument();
    });
  });

  it("switches to the security tab and shows the clean state", async () => {
    mockGetScan.mockResolvedValue(makeScanResponse());
    renderWithProviders(<ScanDetailsPage />);

    await waitFor(() => {
      expect(screen.getAllByText("acme/widgets")[0]).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("tab", { name: /Security/ }));

    await waitFor(() => {
      expect(screen.getByText("No security issues detected")).toBeInTheDocument();
    });
  });

  it("switches to the compliance tab and lazily loads compliance data", async () => {
    mockGetScan.mockResolvedValue(makeScanResponse());
    mockGetComplianceMapping.mockResolvedValue({
      scanId: 123,
      repository: { owner: "acme", name: "widgets", url: "https://github.com/acme/widgets" },
      mappings: [],
      checklist: [],
      summary: {
        totalRequirements: 0,
        byCategory: {} as never,
        byPriority: { high: 0, medium: 0, low: 0 },
        coveragePercentage: 0,
      },
      generatedAt: "2026-01-01T00:00:00Z",
    });
    renderWithProviders(<ScanDetailsPage />);

    await waitFor(() => {
      expect(screen.getAllByText("acme/widgets")[0]).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("tab", { name: /Compliance/ }));

    await waitFor(() => {
      expect(mockGetComplianceMapping).toHaveBeenCalledWith(123);
    });
  });

  it("switches to the vulnerabilities tab showing combined vulnerability findings", async () => {
    mockGetScan.mockResolvedValue(makeScanResponse());
    setupFindingsMock({
      prompt_injection: [
        makeFinding({ id: 50, finding_type: "prompt_injection", name: "Prompt injection risk" }),
      ],
    });
    renderWithProviders(<ScanDetailsPage />);

    await waitFor(() => {
      expect(screen.getAllByText("acme/widgets")[0]).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("tab", { name: /Vulnerabilities/ }));

    await waitFor(() => {
      expect(screen.getByText("Prompt injection risk")).toBeInTheDocument();
    });
  });

  it("recalculates the risk score and shows a success alert", async () => {
    mockGetScan.mockResolvedValue(makeScanResponse());
    mockRecalculateRiskScore.mockResolvedValue({ score: 90, grade: "A" });
    renderWithProviders(<ScanDetailsPage />);

    await waitFor(() => {
      expect(screen.getAllByText("acme/widgets")[0]).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("Recalculate score"));

    await waitFor(() => {
      expect(mockRecalculateRiskScore).toHaveBeenCalledWith(123);
    });
    await waitFor(() => {
      expect(screen.getByText("Risk score updated: 90 (A)")).toBeInTheDocument();
    });
  });

  it("shows an error alert when risk score recalculation fails", async () => {
    mockGetScan.mockResolvedValue(makeScanResponse());
    mockRecalculateRiskScore.mockRejectedValue(new Error("failed"));
    renderWithProviders(<ScanDetailsPage />);

    await waitFor(() => {
      expect(screen.getAllByText("acme/widgets")[0]).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("Recalculate score"));

    await waitFor(() => {
      expect(screen.getByText("Failed to recalculate risk score")).toBeInTheDocument();
    });
  });

  it("exports the AI-BOM and shows a success alert", async () => {
    mockGetScan.mockResolvedValue(makeScanResponse());
    mockExportAIBOM.mockResolvedValue({ some: "data" });
    // jsdom doesn't implement createObjectURL by default
    URL.createObjectURL = vi.fn(() => "blob:mock");
    URL.revokeObjectURL = vi.fn();

    renderWithProviders(<ScanDetailsPage />);

    await waitFor(() => {
      expect(screen.getAllByText("acme/widgets")[0]).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("Export AI-BOM"));

    await waitFor(() => {
      expect(mockExportAIBOM).toHaveBeenCalledWith(123);
    });
    await waitFor(() => {
      expect(screen.getByText("AI-BOM exported successfully")).toBeInTheDocument();
    });
  });

  it("renders the suggested risks section when LLM suggestions exist", async () => {
    mockGetScan.mockResolvedValue(
      makeScanResponse({
        risk_score_details: {
          dimensions: {
            data_sovereignty: { score: 80, penalty_count: 0, top_contributors: [] },
            transparency: { score: 80, penalty_count: 0, top_contributors: [] },
            security: { score: 80, penalty_count: 0, top_contributors: [] },
            autonomy: { score: 80, penalty_count: 0, top_contributors: [] },
            supply_chain: { score: 80, penalty_count: 0, top_contributors: [] },
          },
          llm_enhanced: true,
          llm_narrative: "narrative",
          llm_recommendations: [],
          llm_adjustments: null,
          llm_suggested_risks: [
            {
              risk_name: "Sensitive data leak",
              risk_description: "desc",
              risk_category: [],
              ai_lifecycle_phase: "Deployment & integration",
              likelihood: 3,
              severity: 3,
              impact: "Medium",
              mitigation_plan: "plan",
              dimension: "security",
              finding_refs: [],
            },
          ],
        },
      }),
    );
    renderWithProviders(<ScanDetailsPage />);

    await waitFor(() => {
      expect(screen.getByText("Suggested risks")).toBeInTheDocument();
    });
  });

  it("does not render the suggested risks section when there are no suggestions", async () => {
    mockGetScan.mockResolvedValue(makeScanResponse());
    renderWithProviders(<ScanDetailsPage />);

    await waitFor(() => {
      expect(screen.getAllByText("acme/widgets")[0]).toBeInTheDocument();
    });

    expect(screen.queryByText("Suggested risks")).not.toBeInTheDocument();
  });

  it("toggles the 'show suppressed findings' switch", async () => {
    mockGetScan.mockResolvedValue(makeScanResponse());
    renderWithProviders(<ScanDetailsPage />);

    await waitFor(() => {
      expect(screen.getAllByText("acme/widgets")[0]).toBeInTheDocument();
    });

    const toggle = screen.getByRole("switch");
    expect(toggle).not.toBeChecked();
    fireEvent.click(toggle);
    expect(toggle).toBeChecked();
  });

  it("reads the initial tab from the URL param", async () => {
    mockParams = { scanId: "123", tab: "security" };
    mockGetScan.mockResolvedValue(makeScanResponse());
    renderWithProviders(<ScanDetailsPage />);

    await waitFor(() => {
      expect(screen.getByText("No security issues detected")).toBeInTheDocument();
    });
  });
});
