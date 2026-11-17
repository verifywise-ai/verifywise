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
vi.mock("../../../../application/contexts/AITrustIndexSidebar.context", () => ({
  useAITrustIndexSidebarContextSafe: vi.fn().mockReturnValue(null),
}));
vi.mock("../../UnifiedSidebar", () => ({
  default: (props: { showDemoDataButton?: boolean; hasDemoData?: boolean; isAdmin?: boolean }) => (
    <div
      data-testid="unified-sidebar"
      data-show-demo={String(props.showDemoDataButton)}
      data-has-demo={String(props.hasDemoData)}
      data-admin={String(props.isAdmin)}
    />
  ),
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
vi.mock("../../../pages/AITrustIndex/AITrustIndexSidebar", () => ({
  default: () => <div data-testid="ai-trust-index-sidebar" />,
}));

import { fireEvent, screen } from "@testing-library/react";
import type { AppModule } from "../../../../application/redux/ui/uiSlice";

/**
 * The look is read once when uiStyle loads, so each test loads ContextSidebar
 * (and the render helper, which shares its store and theme modules) afresh.
 */
async function load(style: "phase1" | "classic") {
  vi.resetModules();
  if (style === "classic") window.localStorage.setItem("vw-ui-style", "classic");
  else window.localStorage.removeItem("vw-ui-style");
  const { renderWithProviders } = await import("../../../../test/renderWithProviders");
  const { ContextSidebar } = await import("../index");
  return { renderWithProviders, ContextSidebar };
}

const MODULE_SIDEBARS = [
  "main-sidebar",
  "evals-sidebar",
  "ai-detection-sidebar",
  "shadow-ai-sidebar",
  "ai-gateway-sidebar",
  "ai-trust-index-sidebar",
  "super-admin-sidebar",
];

/** Each tenant module, a route in it, and its classic sidebar. */
const TENANT_MODULES: [AppModule, string, string][] = [
  ["main", "/", "main-sidebar"],
  ["evals", "/evals", "evals-sidebar"],
  ["ai-detection", "/ai-detection/scan", "ai-detection-sidebar"],
  ["shadow-ai", "/shadow-ai/insights", "shadow-ai-sidebar"],
  ["ai-gateway", "/ai-gateway/dashboard", "ai-gateway-sidebar"],
  ["ai-trust-index", "/ai-trust-index/browse", "ai-trust-index-sidebar"],
];

beforeEach(() => {
  useAuthMock.mockReturnValue({ isSuperAdmin: false });
  navigateMock.mockClear();
});

afterAll(() => {
  window.localStorage.removeItem("vw-ui-style");
});

describe("ContextSidebar in the phase 1 look", () => {
  it.each(TENANT_MODULES)("renders the unified sidebar for %s", async (module, route) => {
    const { renderWithProviders, ContextSidebar } = await load("phase1");
    renderWithProviders(<ContextSidebar activeModule={module} />, { route });
    expect(screen.getByTestId("unified-sidebar")).toBeInTheDocument();
    for (const id of MODULE_SIDEBARS) expect(screen.queryByTestId(id)).not.toBeInTheDocument();
  });

  it("passes the demo data props on", async () => {
    const { renderWithProviders, ContextSidebar } = await load("phase1");
    renderWithProviders(
      <ContextSidebar activeModule="main" showDemoDataButton={false} hasDemoData isAdmin />,
    );
    const sidebar = screen.getByTestId("unified-sidebar");
    expect(sidebar).toHaveAttribute("data-show-demo", "false");
    expect(sidebar).toHaveAttribute("data-has-demo", "true");
    expect(sidebar).toHaveAttribute("data-admin", "true");
  });

  it("renders the unified sidebar on a global page whatever the module", async () => {
    const { renderWithProviders, ContextSidebar } = await load("phase1");
    renderWithProviders(<ContextSidebar activeModule="shadow-ai" />, { route: "/settings" });
    expect(screen.getByTestId("unified-sidebar")).toBeInTheDocument();
  });

  it("keeps the super admin sidebar for a super admin in the super-admin module", async () => {
    useAuthMock.mockReturnValue({ isSuperAdmin: true });
    const { renderWithProviders, ContextSidebar } = await load("phase1");
    renderWithProviders(<ContextSidebar activeModule="super-admin" />);
    expect(screen.getByTestId("super-admin-sidebar")).toBeInTheDocument();
    expect(screen.queryByTestId("unified-sidebar")).not.toBeInTheDocument();
  });

  it("renders the unified sidebar for a tenant user in the super-admin module", async () => {
    const { renderWithProviders, ContextSidebar } = await load("phase1");
    renderWithProviders(<ContextSidebar activeModule="super-admin" />);
    expect(screen.getByTestId("unified-sidebar")).toBeInTheDocument();
    expect(screen.queryByTestId("super-admin-sidebar")).not.toBeInTheDocument();
  });
});

describe("ContextSidebar in the classic look", () => {
  it.each(TENANT_MODULES)(
    "renders %s's own sidebar and no unified sidebar",
    async (module, route, sidebarId) => {
      const { renderWithProviders, ContextSidebar } = await load("classic");
      renderWithProviders(<ContextSidebar activeModule={module} />, { route });
      expect(screen.getByTestId(sidebarId)).toBeInTheDocument();
      for (const id of MODULE_SIDEBARS.filter((m) => m !== sidebarId)) {
        expect(screen.queryByTestId(id)).not.toBeInTheDocument();
      }
      expect(screen.queryByTestId("unified-sidebar")).not.toBeInTheDocument();
    },
  );

  it("renders super admin sidebar for super-admin module when user is a SuperAdmin", async () => {
    useAuthMock.mockReturnValue({ isSuperAdmin: true });
    const { renderWithProviders, ContextSidebar } = await load("classic");
    renderWithProviders(<ContextSidebar activeModule="super-admin" />);
    expect(screen.getByTestId("super-admin-sidebar")).toBeInTheDocument();
  });

  it("falls back to the main sidebar for super-admin module when user is not a SuperAdmin", async () => {
    const { renderWithProviders, ContextSidebar } = await load("classic");
    renderWithProviders(<ContextSidebar activeModule="super-admin" />);
    expect(screen.getByTestId("main-sidebar")).toBeInTheDocument();
    expect(screen.queryByTestId("super-admin-sidebar")).not.toBeInTheDocument();
  });

  describe("on a global page (Settings, Event tracker)", () => {
    it("keeps the module sidebar with nothing selected", async () => {
      const { renderWithProviders, ContextSidebar } = await load("classic");
      renderWithProviders(<ContextSidebar activeModule="shadow-ai" />, { route: "/settings" });
      expect(screen.getByTestId("shadow-ai-sidebar")).toHaveAttribute("data-active", "");
    });

    it("selects the module item on the module's own pages", async () => {
      const { renderWithProviders, ContextSidebar } = await load("classic");
      renderWithProviders(<ContextSidebar activeModule="shadow-ai" />, {
        route: "/shadow-ai/rules",
      });
      expect(screen.getByTestId("shadow-ai-sidebar")).toHaveAttribute("data-active", "rules");
    });

    it("sends Evals items to the Evals module, not to a hash on the global page", async () => {
      const { renderWithProviders, ContextSidebar } = await load("classic");
      renderWithProviders(<ContextSidebar activeModule="evals" />, { route: "/settings" });
      expect(screen.getByTestId("evals-sidebar")).toHaveAttribute("data-active", "");
      fireEvent.click(screen.getByRole("button", { name: "Datasets" }));
      expect(navigateMock).toHaveBeenCalledWith("/evals#datasets");
    });
  });
});
