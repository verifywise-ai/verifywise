import { screen, fireEvent } from "@testing-library/react";
import { renderWithProviders } from "../../../../test/renderWithProviders";
import SelectableCard from "../index";

describe("SelectableCard", () => {
  const defaultProps = {
    isSelected: false,
    onClick: vi.fn(),
    icon: <span data-testid="card-icon">icon</span>,
    title: "Card Title",
    description: "Card description text",
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders title and description", () => {
    renderWithProviders(<SelectableCard {...defaultProps} />);
    expect(screen.getByText("Card Title")).toBeInTheDocument();
    expect(screen.getByText("Card description text")).toBeInTheDocument();
  });

  it("renders the icon", () => {
    renderWithProviders(<SelectableCard {...defaultProps} />);
    expect(screen.getByTestId("card-icon")).toBeInTheDocument();
  });

  it("calls onClick when clicked", () => {
    const onClick = vi.fn();
    renderWithProviders(<SelectableCard {...defaultProps} onClick={onClick} />);
    fireEvent.click(screen.getByText("Card Title"));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("does not call onClick when disabled", () => {
    const onClick = vi.fn();
    renderWithProviders(<SelectableCard {...defaultProps} onClick={onClick} disabled />);
    fireEvent.click(screen.getByText("Card Title"));
    expect(onClick).not.toHaveBeenCalled();
  });

  it("renders chip when provided", () => {
    renderWithProviders(
      <SelectableCard {...defaultProps} chip={<span data-testid="chip">Beta</span>} />,
    );
    expect(screen.getByTestId("chip")).toBeInTheDocument();
  });

  it("shows selected state visually (checkmark present when selected)", () => {
    const { container } = renderWithProviders(<SelectableCard {...defaultProps} isSelected />);
    // The Check icon from lucide-react renders an SVG
    const svg = container.querySelector("svg");
    expect(svg).toBeInTheDocument();
  });

  it("does not show checkmark when not selected", () => {
    const { container } = renderWithProviders(
      <SelectableCard {...defaultProps} isSelected={false} />,
    );
    // Only SVG should be absent (the icon prop is a span, not an SVG)
    const svgs = container.querySelectorAll("svg");
    expect(svgs.length).toBe(0);
  });
});
