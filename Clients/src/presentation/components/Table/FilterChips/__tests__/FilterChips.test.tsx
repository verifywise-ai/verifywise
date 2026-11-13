import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "../../../../../test/renderWithProviders";
import { FilterChips } from "..";
import type { FilterColumn, FilterCondition } from "../../FilterBy";
import { primitives } from "../../../../themes/palette";
import { useState } from "react";
import { useFilterBy } from "../../../../../application/hooks/useFilterBy";

interface Row {
  status: string;
  owner: string | null;
  name: string;
  due: string | null;
}

const columns: FilterColumn[] = [
  {
    id: "status",
    label: "Status",
    type: "select",
    options: [
      { value: "draft", label: "Draft" },
      { value: "published", label: "Published" },
      { value: "archived", label: "Archived" },
    ],
  },
  { id: "name", label: "Name", type: "text" },
  {
    id: "owner",
    label: "Owner",
    type: "select",
    options: [
      { value: "1", label: "Ada" },
      { value: "2", label: "Grace" },
    ],
  },
  { id: "due", label: "Due date", type: "date" },
];

const isoDaysFromNow = (days: number) => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString();
};

const data: Row[] = [
  { status: "draft", owner: "1", name: "A", due: isoDaysFromNow(0) },
  { status: "Draft", owner: "1", name: "B", due: isoDaysFromNow(3) },
  { status: "draft", owner: "2", name: "C", due: isoDaysFromNow(-5) },
  { status: "published", owner: null, name: "D", due: null },
];

const getFieldValue = (row: Row, columnId: string) =>
  (row as unknown as Record<string, string | null>)[columnId];

function renderChips(props: Partial<React.ComponentProps<typeof FilterChips<Row>>> = {}) {
  const onFilterChange = vi.fn();
  renderWithProviders(
    <FilterChips<Row>
      columns={columns}
      onFilterChange={onFilterChange}
      data={data}
      getFieldValue={getFieldValue}
      {...props}
    />,
  );
  return { onFilterChange, user: userEvent.setup() };
}

const menuItems = () => within(screen.getByRole("menu")).getAllByRole("menuitem");

describe("FilterChips", () => {
  it("renders one chip per select or date column and none for text columns", () => {
    renderChips();
    expect(screen.getByTestId("filter-chip-status")).toHaveTextContent("Status: All");
    expect(screen.getByTestId("filter-chip-owner")).toHaveTextContent("Owner: All");
    expect(screen.getByTestId("filter-chip-due")).toHaveTextContent("Due date: All");
    expect(screen.queryByTestId("filter-chip-name")).not.toBeInTheDocument();
    expect(screen.queryByTestId("filter-chips-clear")).not.toBeInTheDocument();
  });

  it("lists only the values present in the data, with counts, after All", async () => {
    const { user } = renderChips();
    await user.click(screen.getByTestId("filter-chip-status"));

    const items = menuItems();
    expect(items).toHaveLength(3);
    expect(items[0]).toHaveTextContent("All");
    // Matching ignores case, like useFilterBy: "draft" and "Draft" both count.
    expect(items[1]).toHaveTextContent(/^Draft\s*3$/);
    expect(items[2]).toHaveTextContent(/^Published\s*1$/);
    expect(screen.queryByText("Archived")).not.toBeInTheDocument();
  });

  it("picking a value emits one 'is' condition and marks the chip as set", async () => {
    const { user, onFilterChange } = renderChips();
    await user.click(screen.getByTestId("filter-chip-status"));
    await user.click(screen.getByTestId("filter-chip-option-status-draft"));

    expect(onFilterChange).toHaveBeenLastCalledWith(
      [expect.objectContaining({ columnId: "status", operator: "is", value: "draft" })],
      "and",
    );
    const chip = screen.getByTestId("filter-chip-status");
    expect(chip).toHaveTextContent("Status: Draft");
    expect(chip).toHaveAttribute("data-state", "set");
    expect(chip).toHaveStyle({
      borderColor: primitives.green[700],
      backgroundColor: primitives.green[50],
    });
    expect(screen.getByTestId("filter-chip-owner")).toHaveAttribute("data-state", "unset");
  });

  it("All resets the chip", async () => {
    const { user, onFilterChange } = renderChips();
    await user.click(screen.getByTestId("filter-chip-status"));
    await user.click(screen.getByTestId("filter-chip-option-status-draft"));
    await user.click(screen.getByTestId("filter-chip-status"));
    await user.click(screen.getByTestId("filter-chip-option-status-all"));

    expect(onFilterChange).toHaveBeenLastCalledWith([], "and");
    expect(screen.getByTestId("filter-chip-status")).toHaveTextContent("Status: All");
    expect(screen.getByTestId("filter-chip-status")).toHaveAttribute("data-state", "unset");
  });

  it("two set chips emit two conditions", async () => {
    const { user, onFilterChange } = renderChips();
    await user.click(screen.getByTestId("filter-chip-status"));
    await user.click(screen.getByTestId("filter-chip-option-status-draft"));
    await user.click(screen.getByTestId("filter-chip-owner"));
    await user.click(screen.getByTestId("filter-chip-option-owner-1"));

    expect(onFilterChange).toHaveBeenLastCalledWith(
      [
        expect.objectContaining({ columnId: "status", operator: "is", value: "draft" }),
        expect.objectContaining({ columnId: "owner", operator: "is", value: "1" }),
      ],
      "and",
    );
    expect(screen.getByTestId("filter-chip-owner")).toHaveTextContent("Owner: Ada");
  });

  it("date chips offer today, in 7 days, in 30 days and past", async () => {
    const { user, onFilterChange } = renderChips();
    await user.click(screen.getByTestId("filter-chip-due"));

    const items = menuItems();
    expect(items.map((i) => i.textContent)).toEqual([
      "All",
      "Today1",
      "In 7 days2",
      "In 30 days2",
      "Past1",
    ]);

    await user.click(screen.getByTestId("filter-chip-option-due-is_past"));
    expect(onFilterChange).toHaveBeenLastCalledWith(
      [expect.objectContaining({ columnId: "due", operator: "is_past", value: "" })],
      "and",
    );
    expect(screen.getByTestId("filter-chip-due")).toHaveTextContent("Due date: Past");
  });

  it("Clear filters resets every chip", async () => {
    const { user, onFilterChange } = renderChips();
    await user.click(screen.getByTestId("filter-chip-status"));
    await user.click(screen.getByTestId("filter-chip-option-status-draft"));
    await user.click(screen.getByTestId("filter-chip-owner"));
    await user.click(screen.getByTestId("filter-chip-option-owner-2"));

    await user.click(screen.getByTestId("filter-chips-clear"));

    expect(onFilterChange).toHaveBeenLastCalledWith([], "and");
    expect(screen.getByTestId("filter-chip-status")).toHaveTextContent("Status: All");
    expect(screen.getByTestId("filter-chip-owner")).toHaveTextContent("Owner: All");
    expect(screen.queryByTestId("filter-chips-clear")).not.toBeInTheDocument();
  });

  it("a column with no values in the data shows only All (review focus 3)", async () => {
    const { user, onFilterChange } = renderChips({
      data: data.map((row) => ({ ...row, owner: null })),
    });
    await user.click(screen.getByTestId("filter-chip-owner"));

    const items = menuItems();
    expect(items).toHaveLength(1);
    expect(items[0]).toHaveTextContent("All");

    await user.click(items[0]);
    expect(onFilterChange).toHaveBeenLastCalledWith([], "and");
  });

  it("shows restored defaultConditions as set chips (review focus 1)", () => {
    const defaultConditions: FilterCondition[] = [
      { id: "a", columnId: "status", operator: "is", value: "published" },
      { id: "b", columnId: "due", operator: "in_7_days", value: "" },
    ];
    renderChips({ defaultConditions });

    expect(screen.getByTestId("filter-chip-status")).toHaveTextContent("Status: Published");
    expect(screen.getByTestId("filter-chip-status")).toHaveAttribute("data-state", "set");
    expect(screen.getByTestId("filter-chip-due")).toHaveTextContent("Due date: In 7 days");
    expect(screen.getByTestId("filter-chips-clear")).toBeInTheDocument();
  });

  it("without data it lists every option and no counts", async () => {
    const { user } = renderChips({ data: undefined, getFieldValue: undefined });
    await user.click(screen.getByTestId("filter-chip-status"));

    expect(menuItems().map((i) => i.textContent)).toEqual([
      "All",
      "Draft",
      "Published",
      "Archived",
    ]);
  });
});

/**
 * A page that keeps its filter in `useFilterBy` and renders the chips only on
 * its first tab, so switching tabs unmounts and remounts them.
 */
function TabbedPage() {
  const [tab, setTab] = useState<"rows" | "other">("rows");
  const { filterData, handleFilterChange, conditions } = useFilterBy<Row>(getFieldValue);
  return (
    <>
      <button onClick={() => setTab(tab === "rows" ? "other" : "rows")}>switch tab</button>
      {tab === "rows" && (
        <>
          <FilterChips<Row>
            columns={columns}
            onFilterChange={handleFilterChange}
            defaultConditions={conditions}
            data={data}
            getFieldValue={getFieldValue}
          />
          <span data-testid="row-count">{filterData(data).length}</span>
        </>
      )}
    </>
  );
}

describe("FilterChips across a tab switch", () => {
  it("shows the page's filter again after unmount and remount", async () => {
    const user = userEvent.setup();
    renderWithProviders(<TabbedPage />);
    await user.click(screen.getByTestId("filter-chip-status"));
    await user.click(screen.getByTestId("filter-chip-option-status-published"));
    expect(screen.getByTestId("row-count")).toHaveTextContent("1");

    await user.click(screen.getByRole("button", { name: "switch tab" }));
    expect(screen.queryByTestId("filter-chip-status")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "switch tab" }));

    expect(screen.getByTestId("filter-chip-status")).toHaveTextContent("Status: Published");
    expect(screen.getByTestId("filter-chip-status")).toHaveAttribute("data-state", "set");
    expect(screen.getByTestId("row-count")).toHaveTextContent("1");
  });

  it("follows the page's conditions when they change from outside", () => {
    const onFilterChange = vi.fn();
    const props = { columns, onFilterChange, data, getFieldValue };
    const { rerender } = renderWithProviders(
      <FilterChips<Row> {...props} defaultConditions={[]} />,
    );
    expect(screen.getByTestId("filter-chip-status")).toHaveTextContent("Status: All");

    rerender(
      <FilterChips<Row>
        {...props}
        defaultConditions={[{ id: "x", columnId: "status", operator: "is", value: "draft" }]}
      />,
    );
    expect(screen.getByTestId("filter-chip-status")).toHaveTextContent("Status: Draft");

    rerender(<FilterChips<Row> {...props} defaultConditions={[]} />);
    expect(screen.getByTestId("filter-chip-status")).toHaveTextContent("Status: All");
    expect(onFilterChange).not.toHaveBeenCalled();
  });
});
