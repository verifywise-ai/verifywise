import { renderWithProviders } from "../../../../test/renderWithProviders";

// Mock the PMM service
vi.mock("../../../../infrastructure/api/postMarketMonitoringService", () => ({
  pmmService: {
    getReports: vi.fn().mockResolvedValue({ reports: [], total: 0 }),
    downloadReport: vi.fn(),
  },
}));

// Mock child components
vi.mock("../../../components/breadcrumbs/PageBreadcrumbs", () => ({
  PageBreadcrumbs: () => <div data-testid="breadcrumbs" />,
}));

import ReportsArchive from "../ReportsArchive/index";

describe("PostMarketMonitoring - ReportsArchive", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders without crashing", () => {
    const { container } = renderWithProviders(<ReportsArchive />, {
      route: "/post-market-monitoring/reports",
    });
    expect(container).toBeTruthy();
  });
});
