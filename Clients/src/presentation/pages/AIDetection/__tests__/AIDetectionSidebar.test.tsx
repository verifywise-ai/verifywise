import { render, screen, fireEvent } from "@testing-library/react";
import AIDetectionSidebar, { scanToRecentScan } from "../AIDetectionSidebar";
import type { Scan } from "../../../../domain/ai-detection/types";

const mockOpenUserGuide = vi.fn();
const mockOpenTab = vi.fn();

vi.mock("../../../components/UserGuide", () => ({
  useUserGuideSidebarContext: () => ({
    open: mockOpenUserGuide,
    openTab: mockOpenTab,
  }),
}));

interface MockMenuItem {
  id: string;
  label: string;
  value?: string;
  count?: number;
}

vi.mock("../../../components/Sidebar/SidebarShell", () => ({
  __esModule: true,
  default: ({
    flatItems,
    recentSections,
    isItemActive,
    onItemClick,
  }: {
    flatItems: MockMenuItem[];
    recentSections: { title: string; items: { id: string; name: string; onClick: () => void }[] }[];
    isItemActive: (item: MockMenuItem) => boolean;
    onItemClick: (item: MockMenuItem) => void;
  }) => (
    <div data-testid="sidebar-shell">
      {flatItems.map((item) => (
        <button
          key={item.id}
          data-testid={`menu-item-${item.id}`}
          data-active={isItemActive(item)}
          onClick={() => onItemClick(item)}
        >
          {item.label} {item.count !== undefined ? `(${item.count})` : ""}
        </button>
      ))}
      {recentSections.map((section) => (
        <div key={section.title} data-testid="recent-section">
          <span>{section.title}</span>
          {section.items.map((recentItem) => (
            <button
              key={recentItem.id}
              data-testid={`recent-${recentItem.id}`}
              onClick={recentItem.onClick}
            >
              {recentItem.name}
            </button>
          ))}
        </div>
      ))}
    </div>
  ),
}));

describe("AIDetectionSidebar", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the main menu items", () => {
    render(<AIDetectionSidebar activeTab="scan" onTabChange={vi.fn()} />);

    expect(screen.getByTestId("menu-item-scan")).toBeInTheDocument();
    expect(screen.getByTestId("menu-item-repositories")).toBeInTheDocument();
    expect(screen.getByTestId("menu-item-history")).toBeInTheDocument();
    expect(screen.getByTestId("menu-item-settings")).toBeInTheDocument();
  });

  it("marks the active tab as active", () => {
    render(<AIDetectionSidebar activeTab="history" onTabChange={vi.fn()} />);

    expect(screen.getByTestId("menu-item-history")).toHaveAttribute("data-active", "true");
    expect(screen.getByTestId("menu-item-scan")).toHaveAttribute("data-active", "false");
  });

  it("calls onTabChange when a menu item is clicked", () => {
    const onTabChange = vi.fn();
    render(<AIDetectionSidebar activeTab="scan" onTabChange={onTabChange} />);

    fireEvent.click(screen.getByTestId("menu-item-repositories"));
    expect(onTabChange).toHaveBeenCalledWith("repositories");
  });

  it("shows repository and history counts", () => {
    render(
      <AIDetectionSidebar
        activeTab="scan"
        onTabChange={vi.fn()}
        historyCount={7}
        repositoryCount={3}
      />,
    );

    expect(screen.getByTestId("menu-item-repositories").textContent).toContain("(3)");
    expect(screen.getByTestId("menu-item-history").textContent).toContain("(7)");
  });

  it("does not render a recent scans section when there are no recent scans", () => {
    render(<AIDetectionSidebar activeTab="scan" onTabChange={vi.fn()} />);

    expect(screen.queryByTestId("recent-section")).not.toBeInTheDocument();
  });

  it("renders recent scans and calls onScanClick when clicked", () => {
    const onScanClick = vi.fn();
    render(
      <AIDetectionSidebar
        activeTab="scan"
        onTabChange={vi.fn()}
        recentScans={[{ id: 42, name: "org/repo" }]}
        onScanClick={onScanClick}
      />,
    );

    expect(screen.getByTestId("recent-section")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("recent-42"));
    expect(onScanClick).toHaveBeenCalledWith(42);
  });
});

describe("scanToRecentScan", () => {
  it("converts a Scan into a RecentScan shape", () => {
    const scan = {
      id: 5,
      repository_owner: "acme",
      repository_name: "widgets",
    } as Scan;

    expect(scanToRecentScan(scan)).toEqual({ id: 5, name: "acme/widgets" });
  });
});
