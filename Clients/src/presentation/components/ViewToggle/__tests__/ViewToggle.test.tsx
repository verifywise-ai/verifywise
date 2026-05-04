import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "../../../../test/renderWithProviders";
import ViewToggle from "../index";

describe("ViewToggle Component", () => {
  it("renders both toggle buttons", () => {
    renderWithProviders(<ViewToggle viewMode="card" onViewChange={vi.fn()} />);

    expect(screen.getByRole("button", { name: /card view/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /table view/i })).toBeInTheDocument();
  });

  it("calls onViewChange when a different view is clicked", async () => {
    const handleChange = vi.fn();
    const user = userEvent.setup();

    renderWithProviders(<ViewToggle viewMode="card" onViewChange={handleChange} />);

    await user.click(screen.getByRole("button", { name: /table view/i }));
    expect(handleChange).toHaveBeenCalledWith("table");
  });

  it("does not call onViewChange when the already-selected view is clicked", async () => {
    const handleChange = vi.fn();
    const user = userEvent.setup();

    renderWithProviders(<ViewToggle viewMode="card" onViewChange={handleChange} />);

    await user.click(screen.getByRole("button", { name: /card view/i }));
    expect(handleChange).not.toHaveBeenCalled();
  });

  it("respects disabled prop", () => {
    renderWithProviders(<ViewToggle viewMode="card" onViewChange={vi.fn()} disabled />);

    expect(screen.getByRole("button", { name: /card view/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /table view/i })).toBeDisabled();
  });

  it("marks the active view button as pressed", () => {
    renderWithProviders(<ViewToggle viewMode="table" onViewChange={vi.fn()} />);

    expect(screen.getByRole("button", { name: /table view/i })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: /card view/i })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });
});
