import { screen, fireEvent, waitFor } from "@testing-library/react";
import { renderWithProviders } from "../../../../test/renderWithProviders";

const mockGetReports = vi.fn();

// Mock the PMM service
vi.mock("../../../../infrastructure/api/postMarketMonitoringService", () => ({
  pmmService: {
    getReports: (...args: any[]) => mockGetReports(...args),
    downloadReport: vi.fn(),
  },
}));

// Mock child components
vi.mock("../../../components/breadcrumbs/PageBreadcrumbs", () => ({
  PageBreadcrumbs: () => <div data-testid="breadcrumbs" />,
}));

import ReportsArchive from "../ReportsArchive/index";

const report = {
  id: 11,
  cycle_id: 3,
  project_id: 7,
  project_title: "Credit scoring",
  cycle_number: 2,
  completed_at: "2026-10-01T09:00:00.000Z",
  completed_by_name: "Jane Doe",
  has_flagged_concerns: false,
};

describe("PostMarketMonitoring - ReportsArchive", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetReports.mockResolvedValue({ reports: [], total: 0 });
  });

  it("renders without crashing", () => {
    const { container } = renderWithProviders(<ReportsArchive />, {
      route: "/monitoring/reports",
    });
    expect(container).toBeTruthy();
  });

  it("lists reports for every use case when no projectId is given", async () => {
    renderWithProviders(<ReportsArchive />, { route: "/monitoring/reports" });

    await waitFor(() => expect(mockGetReports).toHaveBeenCalled());
    expect(mockGetReports.mock.calls[0][0].project_id).toBeUndefined();
    expect(screen.queryByText("Show all use cases")).not.toBeInTheDocument();
  });

  it("scopes the list to the use case in ?projectId=", async () => {
    mockGetReports.mockResolvedValue({ reports: [report], total: 1 });
    renderWithProviders(<ReportsArchive />, { route: "/monitoring/reports?projectId=7" });

    await waitFor(() =>
      expect(mockGetReports).toHaveBeenCalledWith(expect.objectContaining({ project_id: 7 })),
    );
    expect(await screen.findByText("Showing reports for Credit scoring")).toBeInTheDocument();
  });

  it("ignores a projectId that is not a positive integer", async () => {
    renderWithProviders(<ReportsArchive />, { route: "/monitoring/reports?projectId=7abc" });

    await waitFor(() => expect(mockGetReports).toHaveBeenCalled());
    expect(mockGetReports.mock.calls[0][0].project_id).toBeUndefined();
    expect(screen.queryByText("Show all use cases")).not.toBeInTheDocument();
  });

  it("drops the use case scope when 'Show all use cases' is clicked", async () => {
    renderWithProviders(<ReportsArchive />, { route: "/monitoring/reports?projectId=7" });

    fireEvent.click(await screen.findByText("Show all use cases"));

    await waitFor(() => {
      const lastCall = mockGetReports.mock.calls[mockGetReports.mock.calls.length - 1][0];
      expect(lastCall.project_id).toBeUndefined();
    });
    expect(screen.queryByText("Show all use cases")).not.toBeInTheDocument();
  });
});
