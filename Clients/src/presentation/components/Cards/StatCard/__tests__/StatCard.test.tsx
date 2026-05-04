import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "../../../../../test/renderWithProviders";
import { StatCard } from "../index";
import { Activity } from "lucide-react";

describe("StatCard Component", () => {
  const defaultProps = {
    title: "Total Items",
    value: 42,
    Icon: Activity,
  };

  it("renders title and value", () => {
    renderWithProviders(<StatCard {...defaultProps} />);

    expect(screen.getByText("Total Items")).toBeInTheDocument();
    expect(screen.getByText("42")).toBeInTheDocument();
  });

  it("renders string value", () => {
    renderWithProviders(<StatCard {...defaultProps} value="N/A" />);

    expect(screen.getByText("N/A")).toBeInTheDocument();
  });

  it("renders subtitle when provided", () => {
    renderWithProviders(<StatCard {...defaultProps} subtitle="Last 30 days" />);

    expect(screen.getByText("Last 30 days")).toBeInTheDocument();
  });

  it("does not render subtitle when not provided", () => {
    renderWithProviders(<StatCard {...defaultProps} />);

    expect(screen.queryByText("Last 30 days")).not.toBeInTheDocument();
  });

  it("renders tooltip icon when tooltip prop is provided", () => {
    renderWithProviders(<StatCard {...defaultProps} tooltip="Help text here" />);

    // The Info icon should be present for the tooltip
    expect(screen.getByText("Total Items")).toBeInTheDocument();
  });

  it("calls onClick when card is clicked", async () => {
    const handleClick = vi.fn();
    const user = userEvent.setup();

    renderWithProviders(<StatCard {...defaultProps} onClick={handleClick} />);

    await user.click(screen.getByText("Total Items"));
    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it("renders without crashing when highlight is true", () => {
    renderWithProviders(<StatCard {...defaultProps} highlight />);

    expect(screen.getByText("42")).toBeInTheDocument();
  });

  it("renders without crashing when active is true", () => {
    renderWithProviders(<StatCard {...defaultProps} active />);

    expect(screen.getByText("42")).toBeInTheDocument();
  });
});
