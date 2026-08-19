import { screen, fireEvent, waitFor, within } from "@testing-library/react";
import { renderWithProviders } from "../../../../test/renderWithProviders";
import HistoryPage from "../HistoryPage";
import type { Scan } from "../../../../domain/ai-detection/types";

const mockNavigate = vi.fn();
vi.mock("react-router", async () => {
  const actual: any = await vi.importActual("react-router");
  return { ...actual, useNavigate: () => mockNavigate };
});

const mockGetScans = vi.fn();
const mockDeleteScan = vi.fn();
const mockGetScanStatus = vi.fn();

vi.mock("../../../../application/repository/aiDetection.repository", () => ({
  getScans: (...args: unknown[]) => mockGetScans(...args),
  deleteScan: (...args: unknown[]) => mockDeleteScan(...args),
  getScanStatus: (...args: unknown[]) => mockGetScanStatus(...args),
}));

const mockRefreshRecentScans = vi.fn();
vi.mock("../../../../application/contexts/AIDetectionSidebar.context", () => ({
  useAIDetectionSidebarContext: () => ({
    refreshRecentScans: mockRefreshRecentScans,
  }),
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

function makeScan(overrides: Partial<Scan> = {}): Scan {
  return {
    id: 1,
    repository_url: "https://github.com/acme/widgets",
    repository_owner: "acme",
    repository_name: "widgets",
    status: "completed",
    findings_count: 12,
    files_scanned: 100,
    triggered_by: { id: 1, name: "Jane", surname: "Doe" },
    created_at: "2026-01-01T00:00:00Z",
    duration_ms: 65000,
    risk_score: 82,
    risk_score_grade: "B",
    ...overrides,
  };
}

describe("HistoryPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it("shows a loading message before the first fetch resolves", () => {
    mockGetScans.mockImplementation(() => new Promise(() => {}));
    renderWithProviders(<HistoryPage />);

    expect(screen.getByText("Loading scan results...")).toBeInTheDocument();
  });

  it("shows the empty state when there are no scans", async () => {
    mockGetScans.mockResolvedValue({
      scans: [],
      pagination: { total: 0, page: 1, limit: 10, total_pages: 0 },
    });
    renderWithProviders(<HistoryPage />);

    await waitFor(() => {
      expect(screen.getByText(/No scans yet/)).toBeInTheDocument();
    });
  });

  it("renders a table row for each scan with repository and status", async () => {
    mockGetScans.mockResolvedValue({
      scans: [
        makeScan({ id: 1 }),
        makeScan({ id: 2, repository_name: "gadgets", status: "failed" }),
      ],
      pagination: { total: 2, page: 1, limit: 10, total_pages: 1 },
    });
    renderWithProviders(<HistoryPage />);

    await waitFor(() => {
      expect(screen.getByText("acme/widgets")).toBeInTheDocument();
    });
    expect(screen.getByText("acme/gadgets")).toBeInTheDocument();
    expect(screen.getAllByText("Completed").length).toBeGreaterThan(0);
    expect(screen.getByText("Failed")).toBeInTheDocument();
  });

  it("shows the risk score grade and value for completed scans", async () => {
    mockGetScans.mockResolvedValue({
      scans: [makeScan({ risk_score: 87.6, risk_score_grade: "A" })],
      pagination: { total: 1, page: 1, limit: 10, total_pages: 1 },
    });
    renderWithProviders(<HistoryPage />);

    await waitFor(() => {
      expect(screen.getByText("A")).toBeInTheDocument();
    });
    expect(screen.getByText("88")).toBeInTheDocument();
  });

  it("shows a dash for risk score when the scan has none", async () => {
    mockGetScans.mockResolvedValue({
      scans: [makeScan({ risk_score: null, risk_score_grade: null })],
      pagination: { total: 1, page: 1, limit: 10, total_pages: 1 },
    });
    renderWithProviders(<HistoryPage />);

    await waitFor(() => {
      expect(screen.getByText("acme/widgets")).toBeInTheDocument();
    });
    expect(screen.getAllByText("-").length).toBeGreaterThan(0);
  });

  it("navigates to scan details when a completed scan row is clicked", async () => {
    mockGetScans.mockResolvedValue({
      scans: [makeScan({ id: 42, status: "completed" })],
      pagination: { total: 1, page: 1, limit: 10, total_pages: 1 },
    });
    renderWithProviders(<HistoryPage />);

    await waitFor(() => {
      expect(screen.getByText("acme/widgets")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("acme/widgets"));
    expect(mockNavigate).toHaveBeenCalledWith("/ai-detection/scans/42");
  });

  it("does not navigate when a scanning-status row is clicked", async () => {
    mockGetScans.mockResolvedValue({
      scans: [makeScan({ id: 42, status: "scanning" })],
      pagination: { total: 1, page: 1, limit: 10, total_pages: 1 },
    });
    renderWithProviders(<HistoryPage />);

    await waitFor(() => {
      expect(screen.getByText("acme/widgets")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("acme/widgets"));
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it("filters scans by search query", async () => {
    mockGetScans.mockResolvedValue({
      scans: [
        makeScan({ id: 1, repository_name: "widgets" }),
        makeScan({ id: 2, repository_name: "gadgets" }),
      ],
      pagination: { total: 2, page: 1, limit: 10, total_pages: 1 },
    });
    renderWithProviders(<HistoryPage />);

    await waitFor(() => {
      expect(screen.getByText("acme/widgets")).toBeInTheDocument();
    });

    const searchInput = screen.getByPlaceholderText("Search scans...");
    fireEvent.change(searchInput, { target: { value: "gadgets" } });

    await waitFor(() => {
      expect(screen.queryByText("acme/widgets")).not.toBeInTheDocument();
    });
    expect(screen.getByText("acme/gadgets")).toBeInTheDocument();
  });

  it("sorts by repository name when the column header is clicked", async () => {
    mockGetScans.mockResolvedValue({
      scans: [
        makeScan({ id: 1, repository_name: "zebra" }),
        makeScan({ id: 2, repository_name: "alpha" }),
      ],
      pagination: { total: 2, page: 1, limit: 10, total_pages: 1 },
    });
    renderWithProviders(<HistoryPage />);

    await waitFor(() => {
      expect(screen.getByText("acme/zebra")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("REPOSITORY"));

    const rows = screen.getAllByRole("row").filter((r) => r.querySelector("td"));
    expect(within(rows[0]).getByText("acme/alpha")).toBeInTheDocument();
  });

  it("shows a delete button only for completed/failed/cancelled scans", async () => {
    mockGetScans.mockResolvedValue({
      scans: [
        makeScan({ id: 1, status: "completed" }),
        makeScan({ id: 2, status: "scanning", repository_name: "in-progress" }),
      ],
      pagination: { total: 2, page: 1, limit: 10, total_pages: 1 },
    });
    renderWithProviders(<HistoryPage />);

    await waitFor(() => {
      expect(screen.getByText("acme/widgets")).toBeInTheDocument();
    });

    const completedRow = screen.getByText("acme/widgets").closest("tr") as HTMLElement;
    expect(within(completedRow).getByRole("button")).toBeInTheDocument();

    const scanningRow = screen.getByText("acme/in-progress").closest("tr") as HTMLElement;
    expect(within(scanningRow).queryByRole("button")).not.toBeInTheDocument();
  });

  it("opens a delete confirmation and deletes the scan on confirm", async () => {
    mockGetScans.mockResolvedValue({
      scans: [makeScan({ id: 9, status: "completed" })],
      pagination: { total: 1, page: 1, limit: 10, total_pages: 1 },
    });
    mockDeleteScan.mockResolvedValue(undefined);
    renderWithProviders(<HistoryPage />);

    await waitFor(() => {
      expect(screen.getByText("acme/widgets")).toBeInTheDocument();
    });

    const row = screen.getByText("acme/widgets").closest("tr") as HTMLElement;
    fireEvent.click(within(row).getByRole("button"));

    expect(await screen.findByText("Delete scan?")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Delete" }));

    await waitFor(() => {
      expect(mockDeleteScan).toHaveBeenCalledWith(9);
    });
    await waitFor(() => {
      expect(mockRefreshRecentScans).toHaveBeenCalled();
    });
  });

  it("shows an error alert message when deleting a scan fails", async () => {
    mockGetScans.mockResolvedValue({
      scans: [makeScan({ id: 9, status: "completed" })],
      pagination: { total: 1, page: 1, limit: 10, total_pages: 1 },
    });
    mockDeleteScan.mockRejectedValue(new Error("boom"));
    renderWithProviders(<HistoryPage />);

    await waitFor(() => {
      expect(screen.getByText("acme/widgets")).toBeInTheDocument();
    });

    const row = screen.getByText("acme/widgets").closest("tr") as HTMLElement;
    fireEvent.click(within(row).getByRole("button"));
    fireEvent.click(await screen.findByRole("button", { name: "Delete" }));

    await waitFor(() => {
      expect(screen.getByText(/Failed to delete scan for acme\/widgets/)).toBeInTheDocument();
    });
  });
});
