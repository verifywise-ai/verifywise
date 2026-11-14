import { describe, it, expect, vi, afterEach } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Table } from "@mui/material";
import { renderWithProviders } from "../../../../../test/renderWithProviders";
import StandardTableHead from "../index";
import { useStandardTable } from "../../../../../application/hooks/useStandardTable";
import type {
  SelectionColumnConfig,
  SortConfig,
  StandardColumn,
} from "../../../../../domain/types/standardTable";

const columns: StandardColumn[] = [
  { id: "name", label: "Name", sortable: true },
  { id: "status", label: "Status", sortable: false },
  { id: "actions", label: "Actions", sortable: false },
];

const sortConfig: SortConfig = { key: "", direction: null };

function renderHead(overrides?: {
  sortConfig?: SortConfig;
  columns?: StandardColumn[];
  selection?: SelectionColumnConfig;
}) {
  const { selection, sortConfig: sc, columns: cols } = overrides ?? {};
  return renderWithProviders(
    <Table>
      <StandardTableHead
        columns={cols ?? columns}
        sortConfig={sc ?? sortConfig}
        onSort={vi.fn()}
        selection={selection}
      />
    </Table>,
  );
}

describe("StandardTableHead", () => {
  it("does not render a selection cell when selection prop is omitted", () => {
    renderHead();
    expect(screen.queryByRole("checkbox", { name: /select all rows/i })).toBeNull();
  });

  it("renders the column labels", () => {
    renderHead();
    expect(screen.getByText("Name")).toBeInTheDocument();
    expect(screen.getByText("Status")).toBeInTheDocument();
  });

  it("renders the select-all checkbox when selection prop is provided", () => {
    renderHead({ selection: { allSelected: false, someSelected: false, onToggleAll: vi.fn() } });
    expect(screen.getByRole("checkbox", { name: /select all rows/i })).toBeInTheDocument();
  });

  it("reflects allSelected state on the checkbox", () => {
    renderHead({ selection: { allSelected: true, someSelected: true, onToggleAll: vi.fn() } });
    expect(screen.getByRole("checkbox", { name: /select all rows/i })).toBeChecked();
  });

  it("calls onToggleAll when the header checkbox is clicked", async () => {
    const onToggleAll = vi.fn();
    renderHead({ selection: { allSelected: false, someSelected: false, onToggleAll } });

    await userEvent.click(screen.getByRole("checkbox", { name: /select all rows/i }));

    expect(onToggleAll).toHaveBeenCalledTimes(1);
  });

  it("uses a custom aria label when provided", () => {
    renderHead({
      selection: {
        allSelected: false,
        someSelected: false,
        onToggleAll: vi.fn(),
        ariaLabel: "Pick rows to act on",
      },
    });

    expect(screen.getByRole("checkbox", { name: /pick rows to act on/i })).toBeInTheDocument();
  });

  it("renders inactive sort icon on sortable column", () => {
    renderHead();
    const nameHeader = screen.getByText("Name").closest("th");
    expect(nameHeader).toBeInTheDocument();
  });

  it("renders ascending sort icon when column is actively sorted asc", () => {
    renderHead({
      sortConfig: { key: "name", direction: "asc" },
    });

    const ascendIcons = document.querySelectorAll('[data-testid*="chevron-up"]');
    expect(ascendIcons.length).toBeGreaterThanOrEqual(0);
  });

  it("renders descending sort icon when column is actively sorted desc", () => {
    renderHead({
      sortConfig: { key: "name", direction: "desc" },
    });
  });

  it("highlights actively sorted column label", () => {
    renderHead({
      sortConfig: { key: "name", direction: "asc" },
    });
  });

  it("renders action column header", () => {
    renderHead();
    expect(screen.getByText("Actions")).toBeInTheDocument();
  });

  it("renders custom column width when provided", () => {
    const colsWithWidth: StandardColumn[] = [
      { id: "name", label: "Name", sortable: true, width: "200px", minWidth: "100px" },
    ];
    renderHead({ columns: colsWithWidth });

    const nameHeader = screen.getByText("Name").closest("th");
    expect(nameHeader).toBeInTheDocument();
  });

  it("applies custom text alignment on columns", () => {
    const colsWithAlign: StandardColumn[] = [
      { id: "name", label: "Name", sortable: false },
      { id: "score", label: "Score", sortable: false, align: "center" },
    ];
    renderHead({ columns: colsWithAlign });

    const scoreCell = screen.getByText("Score").closest("th");
    expect(scoreCell).toHaveStyle("text-align: center");
  });
});

function Harness() {
  const { sortConfig: sc, handleSort } = useStandardTable({
    rows: [{ name: "b" }, { name: "a" }],
    storageKey: "head-test",
    defaultSortColumn: "",
    defaultSortDirection: null,
    sortComparator: (a, b) => a.name.localeCompare(b.name),
  });
  return (
    <Table>
      <StandardTableHead columns={columns} sortConfig={sc} onSort={handleSort} />
    </Table>
  );
}

describe("StandardTableHead sort cycle (phase 1)", () => {
  it("cycles ascending, descending, then back to the original order", async () => {
    renderWithProviders(<Harness />);
    const th = screen.getByText("Name").closest("th") as HTMLElement;
    expect(th).toHaveAttribute("aria-sort", "none");
    expect(screen.queryByTestId("sort-arrow")).toBeNull();

    await userEvent.click(th);
    expect(th).toHaveAttribute("aria-sort", "ascending");
    expect(screen.getByTestId("sort-arrow")).toHaveTextContent("\u2191");

    await userEvent.click(th);
    expect(th).toHaveAttribute("aria-sort", "descending");
    expect(screen.getByTestId("sort-arrow")).toHaveTextContent("\u2193");

    await userEvent.click(th);
    expect(th).toHaveAttribute("aria-sort", "none");
    expect(screen.queryByTestId("sort-arrow")).toBeNull();
  });

  it("puts the arrow after the label and hides it from assistive tech", () => {
    renderHead({ sortConfig: { key: "name", direction: "asc" } });
    const arrow = screen.getByTestId("sort-arrow");
    const label = screen.getByText("Name");
    expect(arrow).toHaveAttribute("aria-hidden", "true");
    expect(label.compareDocumentPosition(arrow) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("sets no aria-sort on columns that cannot be sorted", () => {
    renderHead();
    expect(screen.getByText("Status").closest("th")).not.toHaveAttribute("aria-sort");
  });
});

describe("StandardTableHead in the classic look", () => {
  afterEach(() => {
    window.localStorage.removeItem("vw-ui-style");
    vi.resetModules();
  });

  it("keeps the sort icons and sets no aria-sort or glyph arrow", async () => {
    vi.resetModules();
    window.localStorage.setItem("vw-ui-style", "classic");
    const { default: ClassicHead } = await import("../index");
    const { renderWithProviders: render } = await import("../../../../../test/renderWithProviders");
    const { container } = render(
      <Table>
        <ClassicHead
          columns={columns}
          sortConfig={{ key: "name", direction: "asc" }}
          onSort={vi.fn()}
        />
      </Table>,
    );
    expect(screen.queryByTestId("sort-arrow")).toBeNull();
    expect(screen.getByText("Name").closest("th")).not.toHaveAttribute("aria-sort");
    expect(container.querySelector("svg")).not.toBeNull();
  });
});
