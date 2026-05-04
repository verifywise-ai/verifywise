import { screen, fireEvent } from "@testing-library/react";
import { renderWithProviders } from "../../../../test/renderWithProviders";
import RiskVisualizationTabs from "../RiskVisualizationTabs";

// Mock child components to isolate the tabs component
vi.mock("../RiskHeatMap", () => ({
  default: () => <div data-testid="risk-heat-map">HeatMap Mock</div>,
}));

vi.mock("../RiskCategories", () => ({
  default: () => <div data-testid="risk-categories">Categories Mock</div>,
}));

vi.mock("../../TabBar", () => ({
  default: ({
    tabs,
    activeTab,
    onChange,
  }: {
    tabs: { label: string; value: string }[];
    activeTab: string;
    onChange: (e: React.SyntheticEvent, v: string) => void;
  }) => (
    <div data-testid="tab-bar">
      {tabs.map((tab) => (
        <button
          key={tab.value}
          data-active={tab.value === activeTab}
          onClick={(e) => onChange(e, tab.value)}
        >
          {tab.label}
        </button>
      ))}
    </div>
  ),
}));

describe("RiskVisualizationTabs", () => {
  it("renders the tab bar with Heat map and Categories tabs", () => {
    renderWithProviders(<RiskVisualizationTabs risks={[]} />);

    expect(screen.getByText("Heat map")).toBeInTheDocument();
    expect(screen.getByText("Categories")).toBeInTheDocument();
  });

  it("renders the heat map panel by default", () => {
    renderWithProviders(<RiskVisualizationTabs risks={[]} />);

    expect(screen.getByTestId("risk-heat-map")).toBeInTheDocument();
  });

  it("switches to categories panel when Categories tab is clicked", () => {
    renderWithProviders(<RiskVisualizationTabs risks={[]} />);

    // Click the Categories tab
    fireEvent.click(screen.getByText("Categories"));

    expect(screen.getByTestId("risk-categories")).toBeInTheDocument();
  });
});
