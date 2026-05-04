import { screen } from "@testing-library/react";
import { renderWithProviders } from "../../../../test/renderWithProviders";

// Mock HelperIcon to avoid UserGuideSidebarProvider dependency
vi.mock("../../../components/HelperIcon", () => ({
  default: () => null,
}));

// Mock repository functions
vi.mock("../../../../application/repository/policy.repository", () => ({
  getAllPolicies: vi.fn().mockResolvedValue([]),
  getAllTags: vi.fn().mockResolvedValue([]),
}));

// Mock child components
vi.mock("../PolicyManager", () => ({
  default: () => <div data-testid="policy-manager" />,
}));

vi.mock("../PolicyTemplates", () => ({
  default: () => <div data-testid="policy-templates" />,
}));

vi.mock("../../../components/PageTour", () => ({
  default: () => null,
}));

vi.mock("../PolicySteps", () => ({
  default: [],
}));

vi.mock("../../../components/TabBar", () => ({
  default: ({ tabs }: any) => (
    <div data-testid="tab-bar">
      {tabs.map((t: any) => (
        <span key={t.value}>{t.label}</span>
      ))}
    </div>
  ),
}));

// Mock fetch for PolicyTemplates.json
const originalFetch = globalThis.fetch;
beforeAll(() => {
  globalThis.fetch = vi.fn().mockResolvedValue({
    json: () => Promise.resolve([]),
  }) as any;
});
afterAll(() => {
  globalThis.fetch = originalFetch;
});

import PolicyDashboard from "../PoliciesDashboard";

describe("PolicyDashboard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders without crashing", () => {
    renderWithProviders(<PolicyDashboard />, { route: "/policies" });
    expect(screen.getByText("Policy manager")).toBeInTheDocument();
  });

  it("renders page description", () => {
    renderWithProviders(<PolicyDashboard />, { route: "/policies" });
    expect(screen.getByText(/Create and manage AI governance policies/)).toBeInTheDocument();
  });

  it("renders tab bar with policies and templates tabs", () => {
    renderWithProviders(<PolicyDashboard />, { route: "/policies" });
    expect(screen.getByText("Organizational policies")).toBeInTheDocument();
    expect(screen.getByText("Policy templates")).toBeInTheDocument();
  });

  it("renders PolicyManager component on policies tab", () => {
    renderWithProviders(<PolicyDashboard />, { route: "/policies" });
    expect(screen.getByTestId("policy-manager")).toBeInTheDocument();
  });
});
