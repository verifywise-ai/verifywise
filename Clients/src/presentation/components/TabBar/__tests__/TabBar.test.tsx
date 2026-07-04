import { screen, fireEvent } from "@testing-library/react";
import { renderWithProviders } from "../../../../test/renderWithProviders";
import TabBar from "../index";
import { TabContext } from "@mui/lab";

const tabs = [
  { label: "Overview", value: "overview" },
  { label: "Details", value: "details" },
  { label: "Settings", value: "settings" },
];

function renderTabBar(activeTab = "overview", onChange = vi.fn(), props: Record<string, any> = {}) {
  return renderWithProviders(
    <TabContext value={activeTab}>
      <TabBar tabs={tabs} activeTab={activeTab} onChange={onChange} {...props} />
    </TabContext>,
  );
}

describe("TabBar", () => {
  it("renders all tabs", () => {
    renderTabBar();
    expect(screen.getByText("Overview")).toBeInTheDocument();
    expect(screen.getByText("Details")).toBeInTheDocument();
    expect(screen.getByText("Settings")).toBeInTheDocument();
  });

  it("marks the active tab as selected", () => {
    renderTabBar("details");
    const detailsTab = screen.getByRole("tab", { name: /details/i });
    expect(detailsTab).toHaveAttribute("aria-selected", "true");
  });

  it("calls onChange when a tab is clicked", () => {
    const onChange = vi.fn();
    renderTabBar("overview", onChange);
    const detailsTab = screen.getByRole("tab", { name: /details/i });
    fireEvent.click(detailsTab);
    expect(onChange).toHaveBeenCalled();
    expect(onChange).toHaveBeenCalledWith(expect.anything(), "details");
  });

  it("does not call onChange when a disabled tab is clicked", () => {
    const onChange = vi.fn();
    const tabsWithDisabled = [
      { label: "Overview", value: "overview" },
      { label: "Locked", value: "locked", disabled: true },
    ];
    renderWithProviders(
      <TabContext value="overview">
        <TabBar tabs={tabsWithDisabled} activeTab="overview" onChange={onChange} />
      </TabContext>,
    );
    const lockedTab = screen.getByRole("tab", { name: /locked/i });
    fireEvent.click(lockedTab);
    expect(onChange).not.toHaveBeenCalled();
  });

  it("renders with scrollable variant", () => {
    renderTabBar("overview", vi.fn(), { scrollable: true });
    const tabList = document.querySelector(".MuiTabs-root");
    expect(tabList).toBeInTheDocument();
  });

  it("renders with custom indicator color", () => {
    renderTabBar("overview", vi.fn(), { indicatorColor: "#ff0000" });
    const indicator = document.querySelector(".MuiTabs-indicator") as HTMLElement;
    expect(indicator).toBeInTheDocument();
  });

  it("renders tab with a count badge", () => {
    const tabsWithCount = [
      { label: "Overview", value: "overview" },
      { label: "Details", value: "details", count: 5 },
    ];
    renderWithProviders(
      <TabContext value="overview">
        <TabBar tabs={tabsWithCount} activeTab="overview" onChange={vi.fn()} />
      </TabContext>,
    );
    expect(screen.getByText("5")).toBeInTheDocument();
  });

  it("renders tab with a tooltip", async () => {
    const tabsWithTooltip = [
      { label: "Overview", value: "overview", tooltip: "View the overview" },
    ];
    renderWithProviders(
      <TabContext value="overview">
        <TabBar tabs={tabsWithTooltip} activeTab="overview" onChange={vi.fn()} />
      </TabContext>,
    );
    expect(screen.getByText("Overview")).toBeInTheDocument();
  });

  it("renders tab with an icon", () => {
    const tabsWithIcon = [{ label: "Home", value: "home", icon: "Home" as const }];
    renderWithProviders(
      <TabContext value="home">
        <TabBar tabs={tabsWithIcon} activeTab="home" onChange={vi.fn()} />
      </TabContext>,
    );
    expect(screen.getByText("Home")).toBeInTheDocument();
  });

  it("renders disabled tab tooltip text", () => {
    const tabsWithDisabled = [
      { label: "Overview", value: "overview" },
      { label: "Locked", value: "locked", disabled: true, tooltip: "Coming soon" },
    ];
    renderWithProviders(
      <TabContext value="overview">
        <TabBar
          tabs={tabsWithDisabled}
          activeTab="overview"
          onChange={vi.fn()}
          disabledTabTooltip="This tab is currently unavailable"
        />
      </TabContext>,
    );
    expect(screen.getByText("Overview")).toBeInTheDocument();
  });
});
