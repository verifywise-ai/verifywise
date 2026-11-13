import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "../../../../test/renderWithProviders";
import type { FilterColumn, FilterCondition } from "../FilterBy";

const { classic } = vi.hoisted(() => ({ classic: { value: false } }));

vi.mock("../../../themes/uiStyle", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../themes/uiStyle")>()),
  isClassicUi: () => classic.value,
}));

import { TableFilter } from "../TableFilter";

const columns: FilterColumn[] = [
  { id: "status", label: "Status", type: "select", options: [{ value: "a", label: "A" }] },
];

describe("TableFilter", () => {
  it("renders the filter chips in phase 1", () => {
    classic.value = false;
    renderWithProviders(<TableFilter columns={columns} onFilterChange={vi.fn()} data={[]} />);
    expect(screen.getByTestId("filter-chip-status")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^filter$/i })).not.toBeInTheDocument();
  });

  it("renders the rule-builder Filter button in the classic look", () => {
    classic.value = true;
    renderWithProviders(<TableFilter columns={columns} onFilterChange={vi.fn()} data={[]} />);
    expect(screen.getByRole("button", { name: /^filter$/i })).toBeInTheDocument();
    expect(screen.queryByTestId("filter-chip-status")).not.toBeInTheDocument();
  });

  it("restores the page's and/or logic in the classic look, not just its conditions", async () => {
    classic.value = true;
    const defaultConditions: FilterCondition[] = [
      { id: "a", columnId: "status", operator: "is", value: "a" },
      { id: "b", columnId: "status", operator: "is_empty", value: "" },
    ];
    renderWithProviders(
      <TableFilter
        columns={columns}
        onFilterChange={vi.fn()}
        defaultConditions={defaultConditions}
        defaultLogic="or"
        data={[]}
      />,
    );
    await userEvent.setup().click(screen.getByRole("button", { name: /filter/i }));

    const or = screen.getByText("OR");
    const and = screen.getByText("AND");
    expect(or).toHaveStyle({ border: "1px solid rgba(0, 0, 0, 0.08)" });
    expect(and).not.toHaveStyle({ border: "1px solid rgba(0, 0, 0, 0.08)" });
  });
});
