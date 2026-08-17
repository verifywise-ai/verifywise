import { screen, fireEvent, waitFor } from "@testing-library/react";
import { renderWithProviders } from "../../../../test/renderWithProviders";
import ScanPage from "../ScanPage";
import type { AIDetectionStats, Scan, ScanResponse, ScanStatusResponse } from "../../../../domain/ai-detection/types";

const mockNavigate = vi.fn();
vi.mock("react-router", async () => {
  const actual: any = await vi.importActual("react-router");
  return { ...actual, useNavigate: () => mockNavigate };
});

const mockStartScan = vi.fn();
const mockPollScanStatus = vi.fn();
const mockGetScan = vi.fn();
const mockCancelScan = vi.fn();
const mockGetActiveScan = vi.fn();
const mockGetAIDetectionStats = vi.fn();

vi.mock("../../../../application/repository/aiDetection.repository", () => ({
  startScan: (...args: unknown[]) => mockStartScan(...args),
  pollScanStatus: (...args: unknown[]) => mockPollScanStatus(...args),
  getScan: (...args: unknown[]) => mockGetScan(...args),
  cancelScan: (...args: unknown[]) => mockCancelScan(...args),
  getActiveScan: (...args: unknown[]) => mockGetActiveScan(...args),
  getAIDetectionStats: (...args: unknown[]) => mockGetAIDetectionStats(...args),
}));

const mockRefreshRecentScans = vi.fn();
vi.mock("../../../../application/contexts/AIDetectionSidebar.context", () => ({
  useAIDetectionSidebarContext: () => ({
    refreshRecentScans: mockRefreshRecentScans,
  }),
}));

vi.mock("../../../components/Modals/AIDetectionOnboarding", () => ({
  default: () => <div data-testid="ai-detection-onboarding" />,
}));

vi.mock("../../../components/Layout/PageHeaderExtended", () => ({
  PageHeaderExtended: ({ children, title, alert }: any) => (
    <div data-testid="page-header">
      <h1>{title}</h1>
      {alert}
      {children}
    </div>
  ),
}));

vi.mock("../../../components/Cards/StatCard", () => ({
  StatCard: ({ title, value }: any) => (
    <div data-testid={`stat-${title}`}>
      {title}: {value}
    </div>
  ),
}));

const defaultStats: AIDetectionStats = {
  total_scans: 4,
  completed_scans: 3,
  total_findings: 20,
  unique_repositories: 2,
  top_providers: [],
  findings_by_confidence: { high: 10, medium: 5, low: 5 },
  findings_by_type: {
    library: 8,
    dependency: 0,
    api_call: 5,
    secret: 0,
    model_ref: 2,
    rag_component: 0,
    agent: 0,
  },
  security_findings: 1,
  recent_activity: [],
};

function makeScan(overrides: Partial<Scan> = {}): Scan {
  return {
    id: 55,
    repository_url: "https://github.com/acme/widgets",
    repository_owner: "acme",
    repository_name: "widgets",
    status: "completed",
    findings_count: 5,
    files_scanned: 40,
    triggered_by: { id: 1, name: "Jane" },
    created_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function makeScanResponse(overrides: Partial<Scan> = {}): ScanResponse {
  return {
    scan: makeScan(overrides),
    summary: { total: 5, by_confidence: { high: 3, medium: 1, low: 1 }, by_provider: {} },
  };
}

describe("ScanPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetActiveScan.mockResolvedValue(null);
    mockGetAIDetectionStats.mockResolvedValue(defaultStats);
  });

  it("shows a loading spinner while checking for an active scan", () => {
    mockGetActiveScan.mockImplementation(() => new Promise(() => {}));
    renderWithProviders(<ScanPage />);
    expect(screen.getByRole("progressbar")).toBeInTheDocument();
  });

  it("shows statistics cards once loaded", async () => {
    renderWithProviders(<ScanPage />);

    await waitFor(() => {
      expect(screen.getByTestId("stat-Total scans")).toHaveTextContent("Total scans: 4");
    });
    expect(screen.getByTestId("stat-Repositories")).toHaveTextContent("Repositories: 2");
    expect(screen.getByTestId("stat-Security issues")).toHaveTextContent("Security issues: 1");
  });

  it("shows example repository suggestions and fills the input on click", async () => {
    renderWithProviders(<ScanPage />);

    await waitFor(() => {
      expect(screen.getByText("Shubhamsaboo/awesome-llm-apps")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("Shubhamsaboo/awesome-llm-apps"));

    expect(screen.getByPlaceholderText("e.g., https://github.com/owner/repo or owner/repo")).toHaveValue(
      "Shubhamsaboo/awesome-llm-apps",
    );
  });

  it("disables the scan button when the URL is empty", async () => {
    renderWithProviders(<ScanPage />);

    await waitFor(() => {
      expect(screen.getByText("Scan repository")).toBeInTheDocument();
    });
    expect(screen.getByText("Scan").closest("button")).toBeDisabled();
  });

  it("reveals incremental scan fields when the toggle is enabled", async () => {
    renderWithProviders(<ScanPage />);

    await waitFor(() => {
      expect(screen.getByText("Incremental scan")).toBeInTheDocument();
    });

    expect(screen.queryByText("Base commit SHA (older)")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("switch"));

    expect(screen.getByText("Base commit SHA (older)")).toBeInTheDocument();
    expect(screen.getByText("Head commit SHA (newer)")).toBeInTheDocument();
  });

  it("shows a validation error when incremental SHAs are missing", async () => {
    renderWithProviders(<ScanPage />);

    await waitFor(() => {
      expect(screen.getByText("Incremental scan")).toBeInTheDocument();
    });

    fireEvent.change(
      screen.getByPlaceholderText("e.g., https://github.com/owner/repo or owner/repo"),
      { target: { value: "acme/widgets" } },
    );
    fireEvent.click(screen.getByRole("switch"));
    fireEvent.click(screen.getByText("Scan"));

    await waitFor(() => {
      expect(
        screen.getByText("Both commit SHAs are required for incremental scan"),
      ).toBeInTheDocument();
    });
    expect(mockStartScan).not.toHaveBeenCalled();
  });

  it("shows a validation error when SHAs are not valid hex strings", async () => {
    renderWithProviders(<ScanPage />);

    await waitFor(() => {
      expect(screen.getByText("Incremental scan")).toBeInTheDocument();
    });

    fireEvent.change(
      screen.getByPlaceholderText("e.g., https://github.com/owner/repo or owner/repo"),
      { target: { value: "acme/widgets" } },
    );
    fireEvent.click(screen.getByRole("switch"));
    fireEvent.change(screen.getByPlaceholderText("e.g., abc1234..."), {
      target: { value: "not-hex!" },
    });
    fireEvent.change(screen.getByPlaceholderText("e.g., def5678..."), {
      target: { value: "also-not-hex" },
    });
    fireEvent.click(screen.getByText("Scan"));

    await waitFor(() => {
      expect(
        screen.getByText("Commit SHAs must be valid hex strings (7-40 characters)"),
      ).toBeInTheDocument();
    });
  });

  it("starts a scan, shows progress, and displays completion summary", async () => {
    mockStartScan.mockResolvedValue({ id: 55 });
    mockPollScanStatus.mockImplementation(async (_id, onProgress) => {
      onProgress({
        id: 55,
        status: "scanning",
        progress: 42,
        files_scanned: 10,
        findings_count: 3,
        current_file: "src/app.py",
      } as ScanStatusResponse);
      return { id: 55, status: "completed", progress: 100, files_scanned: 40, findings_count: 5 };
    });
    mockGetScan.mockResolvedValue(makeScanResponse());

    renderWithProviders(<ScanPage />);

    await waitFor(() => {
      expect(screen.getByText("Scan repository")).toBeInTheDocument();
    });

    fireEvent.change(
      screen.getByPlaceholderText("e.g., https://github.com/owner/repo or owner/repo"),
      { target: { value: "acme/widgets" } },
    );
    fireEvent.click(screen.getByText("Scan"));

    await waitFor(() => {
      expect(mockStartScan).toHaveBeenCalledWith(
        "https://github.com/acme/widgets",
        expect.anything(),
        undefined,
      );
    });

    await waitFor(() => {
      expect(screen.getByText("Scan completed")).toBeInTheDocument();
    });
    expect(screen.getByText("acme/widgets")).toBeInTheDocument();
    expect(mockRefreshRecentScans).toHaveBeenCalled();
  });

  it("normalizes a full https URL without modification", async () => {
    mockStartScan.mockResolvedValue({ id: 55 });
    mockPollScanStatus.mockResolvedValue({
      id: 55,
      status: "cancelled",
      progress: 0,
      files_scanned: 0,
      findings_count: 0,
    });

    renderWithProviders(<ScanPage />);

    await waitFor(() => {
      expect(screen.getByText("Scan repository")).toBeInTheDocument();
    });

    fireEvent.change(
      screen.getByPlaceholderText("e.g., https://github.com/owner/repo or owner/repo"),
      { target: { value: "https://github.com/acme/widgets" } },
    );
    fireEvent.click(screen.getByText("Scan"));

    await waitFor(() => {
      expect(mockStartScan).toHaveBeenCalledWith(
        "https://github.com/acme/widgets",
        expect.anything(),
        undefined,
      );
    });
  });

  it("shows a failed state with the error message", async () => {
    mockStartScan.mockResolvedValue({ id: 55 });
    mockPollScanStatus.mockResolvedValue({
      id: 55,
      status: "failed",
      progress: 0,
      files_scanned: 0,
      findings_count: 0,
      error_message: "Repository not found",
    });

    renderWithProviders(<ScanPage />);

    await waitFor(() => {
      expect(screen.getByText("Scan repository")).toBeInTheDocument();
    });

    fireEvent.change(
      screen.getByPlaceholderText("e.g., https://github.com/owner/repo or owner/repo"),
      { target: { value: "acme/widgets" } },
    );
    fireEvent.click(screen.getByText("Scan"));

    await waitFor(() => {
      expect(screen.getByText("Scan failed")).toBeInTheDocument();
    });
    expect(screen.getAllByText("Repository not found").length).toBeGreaterThan(0);

    fireEvent.click(screen.getByText("Try again"));
    await waitFor(() => {
      expect(screen.getByText("Scan repository")).toBeInTheDocument();
    });
  });

  it("resumes and cancels an in-progress scan", async () => {
    mockGetActiveScan.mockResolvedValue(makeScan({ status: "scanning" }));
    mockPollScanStatus.mockImplementation((_id: number, onProgress: (s: ScanStatusResponse) => void) => {
      onProgress({
        id: 55,
        status: "scanning",
        progress: 20,
        files_scanned: 5,
        findings_count: 0,
      });
      return new Promise(() => {});
    });

    renderWithProviders(<ScanPage />);

    await waitFor(() => {
      expect(screen.getByText("Cancel")).toBeInTheDocument();
    });

    mockCancelScan.mockResolvedValue(undefined);
    fireEvent.click(screen.getByText("Cancel"));

    await waitFor(() => {
      expect(mockCancelScan).toHaveBeenCalledWith(55);
    });
    await waitFor(() => {
      expect(screen.getByText("Scan repository")).toBeInTheDocument();
    });
  });

  it("navigates to scan details when 'View details' is clicked", async () => {
    mockStartScan.mockResolvedValue({ id: 55 });
    mockPollScanStatus.mockResolvedValue({
      id: 55,
      status: "completed",
      progress: 100,
      files_scanned: 40,
      findings_count: 5,
    });
    mockGetScan.mockResolvedValue(makeScanResponse({ id: 55 }));

    renderWithProviders(<ScanPage />);

    await waitFor(() => {
      expect(screen.getByText("Scan repository")).toBeInTheDocument();
    });

    fireEvent.change(
      screen.getByPlaceholderText("e.g., https://github.com/owner/repo or owner/repo"),
      { target: { value: "acme/widgets" } },
    );
    fireEvent.click(screen.getByText("Scan"));

    await waitFor(() => {
      expect(screen.getByText("View details")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("View details"));
    expect(mockNavigate).toHaveBeenCalledWith("/ai-detection/scans/55");
  });

  it("resets the form when 'Scan another' is clicked", async () => {
    mockStartScan.mockResolvedValue({ id: 55 });
    mockPollScanStatus.mockResolvedValue({
      id: 55,
      status: "completed",
      progress: 100,
      files_scanned: 40,
      findings_count: 5,
    });
    mockGetScan.mockResolvedValue(makeScanResponse());

    renderWithProviders(<ScanPage />);

    await waitFor(() => {
      expect(screen.getByText("Scan repository")).toBeInTheDocument();
    });

    fireEvent.change(
      screen.getByPlaceholderText("e.g., https://github.com/owner/repo or owner/repo"),
      { target: { value: "acme/widgets" } },
    );
    fireEvent.click(screen.getByText("Scan"));

    await waitFor(() => {
      expect(screen.getByText("Scan another")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("Scan another"));

    await waitFor(() => {
      expect(
        screen.getByPlaceholderText("e.g., https://github.com/owner/repo or owner/repo"),
      ).toHaveValue("");
    });
  });
});
