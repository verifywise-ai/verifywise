import { screen } from "@testing-library/react";
import { renderWithProviders } from "../../../../test/renderWithProviders";

// Mock the AI detection repository (all async calls)
vi.mock("../../../../application/repository/aiDetection.repository", () => ({
  startScan: vi.fn(),
  pollScanStatus: vi.fn(),
  getScan: vi.fn(),
  cancelScan: vi.fn(),
  getActiveScan: vi.fn().mockResolvedValue(null),
  getAIDetectionStats: vi.fn().mockResolvedValue({
    total_scans: 0,
    completed_scans: 0,
    unique_repositories: 0,
    total_findings: 0,
    security_findings: 0,
    findings_by_type: { library: 0, api_call: 0 },
  }),
}));

// Mock the AIDetectionSidebar context
vi.mock("../../../../application/contexts/AIDetectionSidebar.context", () => ({
  useAIDetectionSidebarContext: () => ({
    refreshRecentScans: vi.fn(),
  }),
}));

// Mock the onboarding modal
vi.mock("../../../components/Modals/AIDetectionOnboarding", () => ({
  default: () => <div data-testid="ai-detection-onboarding" />,
}));

// Mock PageHeaderExtended
vi.mock("../../../components/Layout/PageHeaderExtended", () => ({
  PageHeaderExtended: ({ children, title }: any) => (
    <div data-testid="page-header">
      <h1>{title}</h1>
      {children}
    </div>
  ),
}));

// Mock StatCard
vi.mock("../../../components/Cards/StatCard", () => ({
  StatCard: ({ title }: any) => <div data-testid={`stat-${title}`} />,
}));

import ScanPage from "../ScanPage";

describe("AIDetection - ScanPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders without crashing", () => {
    renderWithProviders(<ScanPage />, { route: "/ai-detection/scan" });

    expect(screen.getByText("Scan repository")).toBeInTheDocument();
  });
});
