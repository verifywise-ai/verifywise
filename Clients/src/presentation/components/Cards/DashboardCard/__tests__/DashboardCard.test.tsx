import { screen } from "@testing-library/react";
import { renderWithProviders } from "../../../../../test/renderWithProviders";
import { DashboardCard } from "../index";

describe("DashboardCard Component", () => {
  it("renders title and children", () => {
    renderWithProviders(
      <DashboardCard title="Risk Overview">
        <p>Card content here</p>
      </DashboardCard>,
    );

    expect(screen.getByText("Risk Overview")).toBeInTheDocument();
    expect(screen.getByText("Card content here")).toBeInTheDocument();
  });

  it("truncates a long title with the full text on hover", () => {
    const longTitle = "Konformitätsbewertung nach der europäischen KI-Verordnung";
    renderWithProviders(
      <DashboardCard title={longTitle}>
        <p>Content</p>
      </DashboardCard>,
    );

    const heading = screen.getByText(longTitle);
    expect(heading).toHaveAttribute("title", longTitle);
    expect(heading).toHaveStyle({
      whiteSpace: "nowrap",
      overflow: "hidden",
      textOverflow: "ellipsis",
      minWidth: "0",
    });
  });

  it("renders action element when provided", () => {
    renderWithProviders(
      <DashboardCard title="Stats" action={<button>View All</button>}>
        <p>Content</p>
      </DashboardCard>,
    );

    expect(screen.getByText("View All")).toBeInTheDocument();
  });

  it("renders without action element", () => {
    renderWithProviders(
      <DashboardCard title="Simple Card">
        <p>Just content</p>
      </DashboardCard>,
    );

    expect(screen.getByText("Simple Card")).toBeInTheDocument();
    expect(screen.getByText("Just content")).toBeInTheDocument();
  });

  it("renders navigateTo chevron when navigateTo is provided", () => {
    renderWithProviders(
      <DashboardCard title="Clickable Card" navigateTo="/dashboard/details">
        <p>Navigate content</p>
      </DashboardCard>,
    );

    expect(screen.getByText("Clickable Card")).toBeInTheDocument();
  });

  it("renders complex children", () => {
    renderWithProviders(
      <DashboardCard title="Complex">
        <div>
          <span>First</span>
          <span>Second</span>
        </div>
      </DashboardCard>,
    );

    expect(screen.getByText("First")).toBeInTheDocument();
    expect(screen.getByText("Second")).toBeInTheDocument();
  });
});
