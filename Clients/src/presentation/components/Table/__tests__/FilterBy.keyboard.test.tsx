import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "../../../../test/renderWithProviders";
import { FilterBy, type FilterColumn, type FilterCondition } from "../FilterBy";

const columns: FilterColumn[] = [
  { id: "status", label: "Status", type: "select", options: [{ value: "a", label: "A" }] },
];

const twoConditions: FilterCondition[] = [
  { id: "a", columnId: "status", operator: "is", value: "a" },
  { id: "b", columnId: "status", operator: "is_empty", value: "" },
];

async function openBuilder(defaultConditions: FilterCondition[]) {
  const onFilterChange = vi.fn();
  const user = userEvent.setup();
  renderWithProviders(
    <FilterBy
      columns={columns}
      onFilterChange={onFilterChange}
      defaultConditions={defaultConditions}
    />,
  );
  await user.click(screen.getByRole("button", { name: /filter/i }));
  return { user, onFilterChange };
}

describe("FilterBy keyboard access", () => {
  it("exposes AND/OR as pressed-state buttons in a labelled group", async () => {
    await openBuilder(twoConditions);

    const group = screen.getByRole("group", { name: "Combine filters with" });
    expect(group).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "AND" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "OR" })).toHaveAttribute("aria-pressed", "false");
  });

  it("switches to OR from the keyboard", async () => {
    const { user, onFilterChange } = await openBuilder(twoConditions);

    const or = screen.getByRole("button", { name: "OR" });
    or.focus();
    expect(or).toHaveFocus();
    await user.keyboard("{Enter}");

    expect(or).toHaveAttribute("aria-pressed", "true");
    expect(onFilterChange).toHaveBeenLastCalledWith(twoConditions, "or");

    const and = screen.getByRole("button", { name: "AND" });
    and.focus();
    await user.keyboard(" ");
    expect(and).toHaveAttribute("aria-pressed", "true");
    expect(onFilterChange).toHaveBeenLastCalledWith(twoConditions, "and");
  });

  it("removes a filter row from the keyboard", async () => {
    const { user, onFilterChange } = await openBuilder(twoConditions);

    const removeButtons = screen.getAllByRole("button", { name: "Remove filter" });
    expect(removeButtons).toHaveLength(2);
    removeButtons[1].focus();
    await user.keyboard("{Enter}");

    expect(screen.getAllByRole("button", { name: "Remove filter" })).toHaveLength(1);
    expect(onFilterChange).toHaveBeenLastCalledWith([twoConditions[0]], "and");
  });

  it("disables remove when only one row is left", async () => {
    await openBuilder([{ id: "a", columnId: "status", operator: "is", value: "" }]);

    expect(screen.getByRole("button", { name: "Remove filter" })).toBeDisabled();
  });
});
