import { render, screen, fireEvent } from "@testing-library/react";
import ShadowAISidebar from "../ShadowAISidebar";

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

describe("ShadowAISidebar", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the main menu items", () => {
    render(<ShadowAISidebar activeTab="insights" onTabChange={vi.fn()} />);

    expect(screen.getByTestId("menu-item-insights")).toBeInTheDocument();
    expect(screen.getByTestId("menu-item-users")).toBeInTheDocument();
    expect(screen.getByTestId("menu-item-tools")).toBeInTheDocument();
    expect(screen.getByTestId("menu-item-rules")).toBeInTheDocument();
    expect(screen.getByTestId("menu-item-settings")).toBeInTheDocument();
  });

  it("marks the active tab as active", () => {
    render(<ShadowAISidebar activeTab="rules" onTabChange={vi.fn()} />);

    expect(screen.getByTestId("menu-item-rules")).toHaveAttribute("data-active", "true");
    expect(screen.getByTestId("menu-item-insights")).toHaveAttribute("data-active", "false");
  });

  it("calls onTabChange with the item's value when a menu item is clicked", () => {
    const onTabChange = vi.fn();
    render(<ShadowAISidebar activeTab="insights" onTabChange={onTabChange} />);

    fireEvent.click(screen.getByTestId("menu-item-tools"));
    expect(onTabChange).toHaveBeenCalledWith("tools");
  });

  it("shows tools and alerts counts", () => {
    render(
      <ShadowAISidebar activeTab="insights" onTabChange={vi.fn()} toolsCount={4} alertsCount={9} />,
    );

    expect(screen.getByTestId("menu-item-tools").textContent).toContain("(4)");
    expect(screen.getByTestId("menu-item-rules").textContent).toContain("(9)");
  });

  it("does not render a recent tools section when there are no recent tools", () => {
    render(<ShadowAISidebar activeTab="insights" onTabChange={vi.fn()} />);
    expect(screen.queryByTestId("recent-section")).not.toBeInTheDocument();
  });

  it("renders recent tools and calls onToolClick when clicked", () => {
    const onToolClick = vi.fn();
    render(
      <ShadowAISidebar
        activeTab="insights"
        onTabChange={vi.fn()}
        recentTools={[{ id: 42, name: "ChatGPT" } as any]}
        onToolClick={onToolClick}
      />,
    );

    expect(screen.getByTestId("recent-section")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("recent-42"));
    expect(onToolClick).toHaveBeenCalledWith(42);
  });
});
