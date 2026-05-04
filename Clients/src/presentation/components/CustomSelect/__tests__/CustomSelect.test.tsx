import { screen } from "@testing-library/react";
import { renderWithProviders } from "../../../../test/renderWithProviders";
import { CustomSelect } from "../index";

describe("CustomSelect", () => {
  const defaultProps = {
    currentValue: "In Progress",
    onValueChange: vi.fn().mockResolvedValue(true),
    options: ["Open", "In Progress", "Completed"],
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the component with current value displayed", () => {
    renderWithProviders(<CustomSelect {...defaultProps} />);

    expect(screen.getByText("In Progress")).toBeInTheDocument();
  });

  it("renders with object options", () => {
    const options = [
      { value: "open", label: "Open" },
      { value: "in-progress", label: "In Progress" },
      { value: "done", label: "Done" },
    ];

    renderWithProviders(<CustomSelect {...defaultProps} currentValue="open" options={options} />);

    expect(screen.getByText("Open")).toBeInTheDocument();
  });

  it("renders as disabled when disabled prop is true", () => {
    renderWithProviders(<CustomSelect {...defaultProps} disabled={true} />);

    // MUI Select renders a hidden input with the value
    const selectInput = screen.getByRole("combobox");
    expect(selectInput).toHaveAttribute("aria-disabled", "true");
  });
});
