import { screen } from "@testing-library/react";
import { renderWithProviders } from "../../../../test/renderWithProviders";
import type { FilterColumn } from "../FilterBy";

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
});
