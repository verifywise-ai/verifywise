import { screen, fireEvent } from "@testing-library/react";
import { renderWithProviders } from "../../../../test/renderWithProviders";
import { VisibilityChips } from "../index";

describe("VisibilityChips", () => {
  it("renders all three options", () => {
    renderWithProviders(<VisibilityChips value="all" onChange={vi.fn()} />);
    expect(screen.getByText("All")).toBeInTheDocument();
    expect(screen.getByText("Public")).toBeInTheDocument();
    expect(screen.getByText("Private")).toBeInTheDocument();
  });

  it("calls onChange when a different option is selected", () => {
    const onChange = vi.fn();
    renderWithProviders(<VisibilityChips value="all" onChange={onChange} />);
    fireEvent.click(screen.getByText("Public"));
    expect(onChange).toHaveBeenCalledWith("public");
  });

  it("calls onChange with private when selected", () => {
    const onChange = vi.fn();
    renderWithProviders(<VisibilityChips value="all" onChange={onChange} />);
    fireEvent.click(screen.getByText("Private"));
    expect(onChange).toHaveBeenCalledWith("private");
  });

  it("ignores null value from ToggleButtonGroup", () => {
    const onChange = vi.fn();
    renderWithProviders(<VisibilityChips value="all" onChange={onChange} />);
    expect(onChange).not.toHaveBeenCalled();
  });
});
