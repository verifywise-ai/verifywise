import { screen, fireEvent } from "@testing-library/react";
import { renderWithProviders } from "../../../../test/renderWithProviders";
import TabBar from "../index";
import { TabContext } from "@mui/lab";

const tabs = [
  { label: "Overview", value: "overview" },
  { label: "Details", value: "details" },
  { label: "Settings", value: "settings" },
];

function renderTabBar(activeTab = "overview", onChange = vi.fn()) {
  return renderWithProviders(
    <TabContext value={activeTab}>
      <TabBar tabs={tabs} activeTab={activeTab} onChange={onChange} />
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
});
