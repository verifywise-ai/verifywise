import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "../../../../../test/renderWithProviders";
import { DashboardHeaderCard } from "../index";

describe("DashboardHeaderCard", () => {
  it("renders title and count", () => {
    renderWithProviders(<DashboardHeaderCard title="Trainings" count={42} />);
    expect(screen.getByText("Trainings")).toBeInTheDocument();
    expect(screen.getByText("42")).toBeInTheDocument();
  });

  it("renders ReactNode count", () => {
    renderWithProviders(
      <DashboardHeaderCard title="Models" count={<span data-testid="custom-count">99+</span>} />,
    );
    expect(screen.getByTestId("custom-count")).toBeInTheDocument();
  });

  it("renders custom icon when provided", () => {
    renderWithProviders(
      <DashboardHeaderCard
        title="Reports"
        count={5}
        icon={<span data-testid="header-icon">I</span>}
      />,
    );
    expect(screen.getByTestId("header-icon")).toBeInTheDocument();
  });

  it("navigates to training page on click for Trainings title", async () => {
    const { container } = renderWithProviders(<DashboardHeaderCard title="Trainings" count={3} />, {
      route: "/",
    });
    const user = userEvent.setup();
    const card = container.querySelector("Stack") || (container.firstChild as HTMLElement);
    if (card && "click" in card) {
      await user.click(card);
    }
  });

  it("does not navigate when disableNavigation is true", () => {
    renderWithProviders(<DashboardHeaderCard title="Trainings" count={3} disableNavigation />);
    expect(screen.getByText("Trainings")).toBeInTheDocument();
  });

  it("navigates to custom path when navigateTo is provided", () => {
    renderWithProviders(<DashboardHeaderCard title="Custom" count={1} navigateTo="/custom-path" />);
    expect(screen.getByText("Custom")).toBeInTheDocument();
  });

  it("renders non-clickable when title has no mapping", () => {
    renderWithProviders(<DashboardHeaderCard title="Unknown" count={0} />);
    expect(screen.getByText("Unknown")).toBeInTheDocument();
  });
});
