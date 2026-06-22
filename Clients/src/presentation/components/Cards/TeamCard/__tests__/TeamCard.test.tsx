import { screen } from "@testing-library/react";
import { renderWithProviders } from "../../../../../test/renderWithProviders";
import { TeamCard } from "../index";

describe("TeamCard", () => {
  it("renders title", () => {
    renderWithProviders(<TeamCard title="My Team" />);
    expect(screen.getByText("My Team")).toBeInTheDocument();
  });

  it("renders default members", () => {
    renderWithProviders(<TeamCard title="Team" />);
    expect(screen.getByText(/Mohammad Khalilzadeh/)).toBeInTheDocument();
    expect(screen.getByText(/Gorkem Cetin/)).toBeInTheDocument();
    expect(screen.getByText(/Eiei mon/)).toBeInTheDocument();
  });

  it("renders custom members", () => {
    renderWithProviders(<TeamCard title="Team" members={["Alice", "Bob"]} />);
    expect(screen.getByText("Alice, Bob")).toBeInTheDocument();
  });

  it("shows fallback message when members is empty", () => {
    renderWithProviders(<TeamCard title="Team" members={[]} />);
    expect(screen.getByText("No members have been assigned to the use case")).toBeInTheDocument();
  });

  it("renders icon when provided", () => {
    renderWithProviders(<TeamCard title="Team" icon={<span data-testid="team-icon">T</span>} />);
    expect(screen.getByTestId("team-icon")).toBeInTheDocument();
  });
});
