import { renderWithProviders } from "../../../../test/renderWithProviders";
import AgentDiscovery from "../index";

// Mock entity repository
vi.mock("../../../../application/repository/entity.repository", () => ({
  getAllEntities: vi.fn().mockResolvedValue({ data: [] }),
}));

// Mock API services
vi.mock("../../../../infrastructure/api/networkServices", () => ({
  apiServices: {
    post: vi.fn().mockResolvedValue({ data: {} }),
    delete: vi.fn().mockResolvedValue({ data: {} }),
  },
}));

// Mock child components to isolate the page
vi.mock("../AgentTable", () => ({
  __esModule: true,
  default: () => <div data-testid="agent-table" />,
}));

vi.mock("../../../components/Modals/AgentDiscovery/ReviewAgentModal", () => ({
  __esModule: true,
  default: () => <div data-testid="review-agent-modal" />,
}));

vi.mock("../../../components/Modals/AgentDiscovery/ManualAgentModal", () => ({
  __esModule: true,
  default: () => <div data-testid="manual-agent-modal" />,
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
});
