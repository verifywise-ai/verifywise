import { screen } from "@testing-library/react";
import { renderWithProviders } from "../../../../test/renderWithProviders";
import WatchTower from "../index";

// Mock child tab components to isolate the page
vi.mock("../Events", () => ({
  __esModule: true,
  default: () => <div data-testid="watchtower-events" />,
}));

vi.mock("../Loggings", () => ({
  __esModule: true,
  default: () => <div data-testid="watchtower-logs" />,
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

describe("WatchTower Page", () => {
  it("renders without crashing", () => {
    const { container } = renderWithProviders(<WatchTower />, {
      route: "/event-tracker",
    });

    expect(container).toBeInTheDocument();
  });

  it("renders the page title", () => {
    renderWithProviders(<WatchTower />, {
      route: "/event-tracker",
    });

    expect(screen.getByText("Event Tracker")).toBeInTheDocument();
  });
});
