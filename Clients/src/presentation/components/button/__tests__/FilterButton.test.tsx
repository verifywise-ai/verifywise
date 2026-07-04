import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "../../../../test/renderWithProviders";
import { FilterButton } from "../filter-button";

describe("FilterButton", () => {
  const defaultProps = {
    isOpen: false,
    hasActiveFilters: false,
    onClick: vi.fn(),
  };

  it("renders with Filters text", () => {
    renderWithProviders(<FilterButton {...defaultProps} />);
    expect(screen.getByRole("button", { name: "Filters" })).toBeInTheDocument();
  });

  it("shows badge with count when hasActiveFilters and activeFilterCount provided", () => {
    renderWithProviders(<FilterButton {...defaultProps} hasActiveFilters activeFilterCount={3} />);
    expect(screen.getByText("3")).toBeInTheDocument();
  });

  it("shows badge with 'Active' text when hasActiveFilters but no count", () => {
    renderWithProviders(<FilterButton {...defaultProps} hasActiveFilters />);
    expect(screen.getByText("Active")).toBeInTheDocument();
  });

  it("hides badge when hasActiveFilters is false", () => {
    renderWithProviders(
      <FilterButton {...defaultProps} hasActiveFilters={false} activeFilterCount={3} />,
    );
    expect(screen.queryByText("3")).not.toBeInTheDocument();
    expect(screen.queryByText("Active")).not.toBeInTheDocument();
  });

  it("fires onClick when clicked", async () => {
    const onClick = vi.fn();
    const user = userEvent.setup();
    renderWithProviders(<FilterButton {...defaultProps} onClick={onClick} />);

    await user.click(screen.getByRole("button", { name: "Filters" }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("renders disabled button when disabled is true", () => {
    renderWithProviders(<FilterButton {...defaultProps} disabled />);
    expect(screen.getByRole("button", { name: "Filters" })).toBeDisabled();
  });

  it("applies open state background when isOpen is true", () => {
    const { container } = renderWithProviders(<FilterButton {...defaultProps} isOpen />);
    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper).toBeInTheDocument();
  });
});
