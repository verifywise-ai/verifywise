import { screen } from "@testing-library/react";
import { renderWithProviders } from "../../../../test/renderWithProviders";

// Mock hooks for resource/subprocessor queries
vi.mock("../../../../application/hooks/useAITrustCentreResourcesQuery", () => ({
  useAITrustCentreResourcesQuery: () => ({
    data: [],
    isLoading: false,
  }),
}));

vi.mock("../../../../application/hooks/useAITrustCentreSubprocessorsQuery", () => ({
  useAITrustCentreSubprocessorsQuery: () => ({
    data: [],
    isLoading: false,
  }),
}));

// Mock extractUserToken
vi.mock("../../../../application/tools/extractToken", () => ({
  extractUserToken: () => ({
    tenantId: "test-tenant-hash",
    name: "Test User",
  }),
}));

// Mock child tab components
vi.mock("../Resources", () => ({
  default: () => <div data-testid="resources-tab" />,
}));

vi.mock("../Subprocessors", () => ({
  default: () => <div data-testid="subprocessors-tab" />,
}));

vi.mock("../Settings", () => ({
  default: () => <div data-testid="settings-tab" />,
}));

vi.mock("../Overview", () => ({
  default: () => <div data-testid="overview-tab" />,
}));

// Mock PageTour
vi.mock("../../../components/PageTour", () => ({
  default: () => null,
}));

// Mock AITrustCenterSteps
vi.mock("../AITrustCenterSteps", () => ({
  default: [],
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

// Mock TabBar
vi.mock("../../../components/TabBar", () => ({
  default: ({ tabs }: any) => (
    <div data-testid="tab-bar">
      {tabs.map((t: any) => (
        <span key={t.value}>{t.label}</span>
      ))}
    </div>
  ),
}));

// Mock customizable button
vi.mock("../../../components/button/customizable-button", () => ({
  CustomizableButton: ({ text }: any) => <button>{text}</button>,
}));

// Mock styles
vi.mock("../styles", () => ({
  aiTrustCenterTabPanelStyle: {},
  aiTrustCenterPreviewButtonStyle: {},
}));

import AITrustCenter from "../index";

describe("AITrustCenter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders without crashing", () => {
    renderWithProviders(<AITrustCenter />, { route: "/ai-trust-center/overview" });

    expect(screen.getByText("AI trust center")).toBeInTheDocument();
  });
});
