import { screen, fireEvent } from "@testing-library/react";
import { renderWithProviders } from "../../../../../test/renderWithProviders";

const mockNavigate = vi.fn();

vi.mock("react-router", async () => {
  const actual: any = await vi.importActual("react-router");
  return { ...actual, useNavigate: () => mockNavigate };
});

import GovernanceLayout from "../GovernanceLayout";

describe("GovernanceLayout", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the title and subtitle", () => {
    renderWithProviders(
      <GovernanceLayout title="My Title" subtitle="My Subtitle">
        <div>content</div>
      </GovernanceLayout>,
      { route: "/governance" },
    );

    expect(screen.getByText("My Title")).toBeInTheDocument();
    expect(screen.getByText("My Subtitle")).toBeInTheDocument();
  });

  it("renders children", () => {
    renderWithProviders(
      <GovernanceLayout title="Title">
        <div data-testid="child-content">Hello</div>
      </GovernanceLayout>,
      { route: "/governance" },
    );

    expect(screen.getByTestId("child-content")).toBeInTheDocument();
  });

  it("renders all tab labels", () => {
    renderWithProviders(
      <GovernanceLayout title="Title">
        <div />
      </GovernanceLayout>,
      { route: "/governance" },
    );

    expect(screen.getByText("Hub")).toBeInTheDocument();
    expect(screen.getByText("Framework Mapper")).toBeInTheDocument();
    expect(screen.getByText("Scenario Builder")).toBeInTheDocument();
    expect(screen.getByText("Unified Insights")).toBeInTheDocument();
    expect(screen.getByText("Evidence Hub")).toBeInTheDocument();
    expect(screen.getByText("Knowledge Graph")).toBeInTheDocument();
    expect(screen.getByText("Regulatory Radar")).toBeInTheDocument();
    expect(screen.getByText("Settings")).toBeInTheDocument();
  });

  it("highlights the tab that matches the current route", () => {
    renderWithProviders(
      <GovernanceLayout title="Title">
        <div />
      </GovernanceLayout>,
      { route: "/governance/framework-mapper" },
    );

    const tab = screen.getByRole("tab", { name: /Framework Mapper/i });
    expect(tab).toHaveAttribute("aria-selected", "true");
  });

  it("defaults to the hub tab for an unknown route", () => {
    renderWithProviders(
      <GovernanceLayout title="Title">
        <div />
      </GovernanceLayout>,
      { route: "/governance/unknown-path" },
    );

    const tab = screen.getByRole("tab", { name: /^Hub/i });
    expect(tab).toHaveAttribute("aria-selected", "true");
  });

  it("navigates when a different tab is clicked", () => {
    renderWithProviders(
      <GovernanceLayout title="Title">
        <div />
      </GovernanceLayout>,
      { route: "/governance" },
    );

    fireEvent.click(screen.getByRole("tab", { name: /Settings/i }));
    expect(mockNavigate).toHaveBeenCalledWith("/governance/settings");
  });

  it("renders the action button when provided", () => {
    renderWithProviders(
      <GovernanceLayout title="Title" actionButton={<button>Do Something</button>}>
        <div />
      </GovernanceLayout>,
      { route: "/governance" },
    );

    expect(screen.getByRole("button", { name: "Do Something" })).toBeInTheDocument();
  });
});
