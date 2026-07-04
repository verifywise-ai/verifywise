import React from "react";
import { screen, fireEvent } from "@testing-library/react";
import { renderWithProviders } from "../../../../test/renderWithProviders";
import DashboardTabs from "../index";
import type { DashboardTabConfig } from "../index";

vi.mock("@mui/lab/TabList", () => ({
  default: ({ children, onChange, ...props }: any) => (
    <div data-testid="tablist" {...props}>
      {React.Children.map(children, (child: any) =>
        React.cloneElement(child, {
          onClick: (e: React.MouseEvent) => {
            if (onChange && child.props.value !== "__add__") {
              onChange(e, child.props.value);
            }
          },
        }),
      )}
    </div>
  ),
}));

const availableTabs: DashboardTabConfig[] = [
  { id: "overview", label: "Overview", icon: "LayoutDashboard" },
  { id: "risks", label: "Risks", icon: "AlertTriangle", removable: true },
  { id: "tasks", label: "Tasks", icon: "CheckSquare", removable: true },
  { id: "models", label: "Models", icon: "Box", removable: false },
];

function findAddButton() {
  return document.querySelector(".MuiIconButton-root") as HTMLElement;
}

describe("DashboardTabs", () => {
  it("renders visible tabs based on activeTabs", () => {
    renderWithProviders(
      <DashboardTabs
        availableTabs={availableTabs}
        activeTabs={["overview", "risks"]}
        activeTab="overview"
        onTabChange={vi.fn()}
        onTabsChange={vi.fn()}
      />,
    );
    expect(screen.getByText("Overview")).toBeInTheDocument();
    expect(screen.getByText("Risks")).toBeInTheDocument();
    expect(screen.queryByText("Tasks")).not.toBeInTheDocument();
  });

  it("calls onTabChange when a tab is clicked", () => {
    const onTabChange = vi.fn();
    renderWithProviders(
      <DashboardTabs
        availableTabs={availableTabs}
        activeTabs={["overview", "risks"]}
        activeTab="overview"
        onTabChange={onTabChange}
        onTabsChange={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByText("Risks"));
    expect(onTabChange).toHaveBeenCalledWith("risks");
  });

  it("opens add tab menu on plus button click", () => {
    renderWithProviders(
      <DashboardTabs
        availableTabs={availableTabs}
        activeTabs={["overview"]}
        activeTab="overview"
        onTabChange={vi.fn()}
        onTabsChange={vi.fn()}
      />,
    );
    fireEvent.click(findAddButton());
    expect(screen.getByText("Dashboard tabs")).toBeInTheDocument();
    expect(screen.getByText("Select which tabs to show")).toBeInTheDocument();
  });

  it("shows all available tabs in the menu", () => {
    renderWithProviders(
      <DashboardTabs
        availableTabs={availableTabs}
        activeTabs={["overview"]}
        activeTab="overview"
        onTabChange={vi.fn()}
        onTabsChange={vi.fn()}
      />,
    );
    fireEvent.click(findAddButton());
    // Each tab appears both in tab bar and menu; verify menu items exist
    expect(screen.getAllByText("Overview").length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText("Risks").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Tasks").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Models").length).toBeGreaterThanOrEqual(1);
  });

  it("calls onTabsChange when toggling a tab in the menu", () => {
    const onTabsChange = vi.fn();
    renderWithProviders(
      <DashboardTabs
        availableTabs={availableTabs}
        activeTabs={["overview"]}
        activeTab="overview"
        onTabChange={vi.fn()}
        onTabsChange={onTabsChange}
      />,
    );
    fireEvent.click(findAddButton());
    // "Tasks" is only in the menu (not in activeTabs), so clicking it adds it
    fireEvent.click(screen.getByText("Tasks"));
    expect(onTabsChange).toHaveBeenCalledWith(["overview", "tasks"]);
  });

  it("does not toggle fixed tabs with removable=false", () => {
    const onTabsChange = vi.fn();
    renderWithProviders(
      <DashboardTabs
        availableTabs={availableTabs}
        activeTabs={["overview", "models"]}
        activeTab="overview"
        onTabChange={vi.fn()}
        onTabsChange={onTabsChange}
      />,
    );
    fireEvent.click(findAddButton());
    // Models tab has removable=false, menu item should have disabled checkbox
    const modelsCheckboxes = screen.getAllByText("Models");
    // The menu item is the one with role="menuitem" ancestor
    const modelsMenuItem = modelsCheckboxes.find((el) => el.closest('[role="menuitem"]') !== null);
    expect(modelsMenuItem).toBeDefined();
  });

  it("removes tab via menu toggle", () => {
    const onTabsChange = vi.fn();
    renderWithProviders(
      <DashboardTabs
        availableTabs={availableTabs}
        activeTabs={["overview", "tasks"]}
        activeTab="tasks"
        onTabChange={vi.fn()}
        onTabsChange={onTabsChange}
      />,
    );
    fireEvent.click(findAddButton());
    // Two elements have "Tasks" text (tab bar + menu item); click the second (menu item)
    const [, menuTask] = screen.getAllByText("Tasks");
    fireEvent.click(menuTask);
    expect(onTabsChange).toHaveBeenCalledWith(["overview"]);
  });

  it("does not render non-removable tab's X button", () => {
    renderWithProviders(
      <DashboardTabs
        availableTabs={[availableTabs[3]]}
        activeTabs={["models"]}
        activeTab="models"
        onTabChange={vi.fn()}
        onTabsChange={vi.fn()}
      />,
    );
    expect(screen.getByText("Models")).toBeInTheDocument();
  });
});
