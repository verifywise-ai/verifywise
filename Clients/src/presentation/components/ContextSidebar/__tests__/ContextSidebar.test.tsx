import { vi } from "vitest";

const useAuthMock = vi.fn();
const navigateMock = vi.fn();
vi.mock("react-router", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react-router")>()),
  useNavigate: () => navigateMock,
}));
vi.mock("../../../../application/hooks/useAuth", () => ({
  useAuth: () => useAuthMock(),
}));
vi.mock("../../../../application/contexts/EvalsSidebar.context", () => ({
  useEvalsSidebarContextSafe: vi.fn().mockReturnValue(null),
}));
vi.mock("../../../../application/contexts/AIDetectionSidebar.context", () => ({
  useAIDetectionSidebarContextSafe: vi.fn().mockReturnValue(null),
}));
vi.mock("../../../../application/contexts/ShadowAISidebar.context", () => ({
  useShadowAISidebarContextSafe: vi.fn().mockReturnValue(null),
}));
vi.mock("../../../../application/contexts/AIGatewaySidebar.context", () => ({
  useAIGatewaySidebarContextSafe: vi.fn().mockReturnValue(null),
}));
vi.mock("../../Sidebar", () => ({
  default: () => <div data-testid="main-sidebar" />,
}));
vi.mock("../../SuperAdminSidebar", () => ({
  default: () => <div data-testid="super-admin-sidebar" />,
}));
vi.mock("../../../pages/EvalsDashboard/EvalsSidebar", () => ({
  default: (props: { activeTab: string; onTabChange: (tab: string) => void }) => (
    <div data-testid="evals-sidebar" data-active={props.activeTab}>
      <button onClick={() => props.onTabChange("datasets")}>Datasets</button>
    </div>
  ),
}));
vi.mock("../../../pages/AIDetection/AIDetectionSidebar", () => ({
  default: () => <div data-testid="ai-detection-sidebar" />,
}));
vi.mock("../../../pages/ShadowAI/ShadowAISidebar", () => ({
  default: (props: { activeTab: string }) => (
    <div data-testid="shadow-ai-sidebar" data-active={props.activeTab} />
  ),
}));
vi.mock("../../../pages/AIGateway/AIGatewaySidebar", () => ({
  default: () => <div data-testid="ai-gateway-sidebar" />,
}));

import { fireEvent, screen } from "@testing-library/react";
import { renderWithProviders } from "../../../../test/renderWithProviders";
import { ContextSidebar } from "../index";

describe("ContextSidebar", () => {
  beforeEach(() => {
    useAuthMock.mockReturnValue({ isSuperAdmin: false });
    navigateMock.mockClear();
  });

  it("renders main sidebar for main module", () => {
    renderWithProviders(<ContextSidebar activeModule="main" />);
    expect(screen.getByTestId("main-sidebar")).toBeInTheDocument();
  });

  it("renders super admin sidebar for super-admin module when user is a SuperAdmin", () => {
    useAuthMock.mockReturnValue({ isSuperAdmin: true });
    renderWithProviders(<ContextSidebar activeModule="super-admin" />);
    expect(screen.getByTestId("super-admin-sidebar")).toBeInTheDocument();
  });

  it("falls back to the main sidebar for super-admin module when user is not a SuperAdmin", () => {
    renderWithProviders(<ContextSidebar activeModule="super-admin" />);
    expect(screen.getByTestId("main-sidebar")).toBeInTheDocument();
    expect(screen.queryByTestId("super-admin-sidebar")).not.toBeInTheDocument();
  });

  describe("on a global page (Settings, Event tracker)", () => {
    it("keeps the module sidebar with nothing selected", () => {
      renderWithProviders(<ContextSidebar activeModule="shadow-ai" />, { route: "/settings" });
      expect(screen.getByTestId("shadow-ai-sidebar")).toHaveAttribute("data-active", "");
    });

    it("selects the module item on the module's own pages", () => {
      renderWithProviders(<ContextSidebar activeModule="shadow-ai" />, {
        route: "/shadow-ai/rules",
      });
      expect(screen.getByTestId("shadow-ai-sidebar")).toHaveAttribute("data-active", "rules");
    });

    it("sends Evals items to the Evals module, not to a hash on the global page", () => {
      renderWithProviders(<ContextSidebar activeModule="evals" />, { route: "/settings" });
      expect(screen.getByTestId("evals-sidebar")).toHaveAttribute("data-active", "");
      fireEvent.click(screen.getByRole("button", { name: "Datasets" }));
      expect(navigateMock).toHaveBeenCalledWith("/evals#datasets");
    });
  });
});
