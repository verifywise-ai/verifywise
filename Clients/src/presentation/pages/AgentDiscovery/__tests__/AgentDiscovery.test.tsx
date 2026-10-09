import { fireEvent, screen, waitFor } from "@testing-library/react";
import { renderWithProviders } from "../../../../test/renderWithProviders";
import AgentDiscovery from "../index";

const manualAgent = {
  id: 42,
  display_name: "Manual helper",
  is_manual: true,
  source_system: "manual",
  review_status: "unreviewed",
};

// Mock entity repository
vi.mock("../../../../application/repository/entity.repository", () => ({
  getAllEntities: vi.fn(({ routeUrl }: { routeUrl: string }) =>
    Promise.resolve({ data: routeUrl === "/agent-primitives" ? [manualAgent] : undefined }),
  ),
}));

// Mock API services
vi.mock("../../../../infrastructure/api/networkServices", () => ({
  apiServices: {
    post: vi.fn().mockResolvedValue({ data: {} }),
    delete: vi.fn().mockResolvedValue({ data: {} }),
  },
}));

// Mock child components to isolate the page
// The table stub exposes the row action menu's "Edit" for each agent.
vi.mock("../AgentTable", () => ({
  __esModule: true,
  default: ({ agents, onEdit }: { agents: any[]; onEdit: (agent: any) => void }) => (
    <div data-testid="agent-table">
      {agents.map((agent) => (
        <button key={agent.id} onClick={() => onEdit(agent)}>
          edit-{agent.id}
        </button>
      ))}
    </div>
  ),
}));

vi.mock("../../../components/Modals/AgentDiscovery/ReviewAgentModal", () => ({
  __esModule: true,
  default: ({ isOpen, agent }: { isOpen: boolean; agent: any }) => (
    <div data-testid="review-agent-modal" data-open={String(isOpen)}>
      {agent?.display_name}
    </div>
  ),
}));

vi.mock("../../../components/Modals/AgentDiscovery/ManualAgentModal", () => ({
  __esModule: true,
  default: ({ isOpen }: { isOpen: boolean }) => (
    <div data-testid="manual-agent-modal" data-open={String(isOpen)} />
  ),
}));

// Mock the UserGuideSidebarContext used by PageHeaderExtended > HelperIcon
vi.mock("../../../components/UserGuide/UserGuideSidebarContext", () => ({
  useUserGuideSidebarContext: () => ({
    isOpen: false,
    open: vi.fn(),
    close: vi.fn(),
    toggle: vi.fn(),
    currentPath: undefined,
    contentWidth: 400,
    setContentWidth: vi.fn(),
    totalSidebarWidth: 40,
    requiredPaddingRight: 0,
    openTab: vi.fn(),
    requestedTab: undefined,
    clearRequestedTab: vi.fn(),
  }),
  TAB_BAR_WIDTH: 40,
  DEFAULT_CONTENT_WIDTH: 400,
  MIN_GAP: 0,
}));

describe("AgentDiscovery Page", () => {
  it("renders without crashing", () => {
    const { container } = renderWithProviders(<AgentDiscovery />, {
      route: "/agent-discovery",
    });

    expect(container).toBeInTheDocument();
  });

  it("opens the review drawer, not the edit modal, when editing a manual agent", async () => {
    renderWithProviders(<AgentDiscovery />, { route: "/agent-discovery" });

    fireEvent.click(await screen.findByText("edit-42"));

    await waitFor(() =>
      expect(screen.getByTestId("review-agent-modal")).toHaveAttribute("data-open", "true"),
    );
    expect(screen.getByTestId("review-agent-modal")).toHaveTextContent("Manual helper");
    expect(screen.getByTestId("manual-agent-modal")).toHaveAttribute("data-open", "false");
  });
});
