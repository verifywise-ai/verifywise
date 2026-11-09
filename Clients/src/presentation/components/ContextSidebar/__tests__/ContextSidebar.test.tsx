import { vi } from "vitest";

const useAuthMock = vi.fn();
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
  default: () => <div data-testid="evals-sidebar" />,
}));
vi.mock("../../../pages/AIDetection/AIDetectionSidebar", () => ({
  default: () => <div data-testid="ai-detection-sidebar" />,
}));
vi.mock("../../../pages/ShadowAI/ShadowAISidebar", () => ({
  default: () => <div data-testid="shadow-ai-sidebar" />,
}));
vi.mock("../../../pages/AIGateway/AIGatewaySidebar", () => ({
  default: () => <div data-testid="ai-gateway-sidebar" />,
}));
const biasAuditContext = vi.hoisted(() => ({
  value: null as null | { projectId: number | null; runsCount: number; scopeCount: number },
}));
vi.mock("../../../../application/contexts/BiasAuditSidebar.context", () => ({
  useBiasAuditSidebarContextSafe: () => biasAuditContext.value,
}));
const biasAuditSidebarProps = vi.hoisted(() => ({ last: null as any }));
vi.mock("../../../pages/BiasAudit/BiasAuditSidebar", () => ({
  default: (props: any) => {
    biasAuditSidebarProps.last = props;
    return <div data-testid="bias-audit-sidebar" />;
  },
}));

import { act, screen } from "@testing-library/react";
import { useLocation } from "react-router";
import { renderWithProviders } from "../../../../test/renderWithProviders";
import { ContextSidebar } from "../index";

describe("ContextSidebar", () => {
  beforeEach(() => {
    useAuthMock.mockReturnValue({ isSuperAdmin: false });
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

  describe("bias-audit module", () => {
    let pathname = "";
    const PathProbe = () => {
      pathname = useLocation().pathname;
      return null;
    };

    it("renders the bias audit sidebar with the section from the URL and the page's counts", () => {
      biasAuditContext.value = { projectId: 7, runsCount: 3, scopeCount: 1 };
      renderWithProviders(<ContextSidebar activeModule="bias-audit" />, {
        route: "/bias-audit/7/scope",
      });
      expect(screen.getByTestId("bias-audit-sidebar")).toBeInTheDocument();
      expect(screen.queryByTestId("main-sidebar")).not.toBeInTheDocument();
      expect(biasAuditSidebarProps.last).toMatchObject({
        activeSection: "scope",
        runsCount: 3,
        scopeCount: 1,
        disabled: false,
      });
    });

    it("links a section to the use case the page shows", () => {
      biasAuditContext.value = { projectId: 7, runsCount: 0, scopeCount: 0 };
      renderWithProviders(
        <>
          <ContextSidebar activeModule="bias-audit" />
          <PathProbe />
        </>,
        { route: "/bias-audit" },
      );
      expect(biasAuditSidebarProps.last.activeSection).toBe("profile");
      act(() => biasAuditSidebarProps.last.onSectionChange("runs"));
      expect(pathname).toBe("/bias-audit/7/runs");
    });

    it("disables the sections while no use case has the framework", () => {
      biasAuditContext.value = { projectId: null, runsCount: 0, scopeCount: 0 };
      renderWithProviders(<ContextSidebar activeModule="bias-audit" />, { route: "/bias-audit" });
      expect(biasAuditSidebarProps.last.disabled).toBe(true);
    });
  });
});
