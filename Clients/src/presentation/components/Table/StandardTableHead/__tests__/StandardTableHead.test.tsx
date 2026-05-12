import { describe, it, expect, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Table } from "@mui/material";
import { renderWithProviders } from "../../../../../test/renderWithProviders";
import StandardTableHead from "../index";
import type {
  SelectionColumnConfig,
  SortConfig,
  StandardColumn,
} from "../../../../../domain/types/standardTable";

const columns: StandardColumn[] = [
  { id: "name", label: "Name", sortable: true },
  { id: "status", label: "Status", sortable: false },
];

const sortConfig: SortConfig = { key: "", direction: null };

function renderHead(selection?: SelectionColumnConfig) {
  return renderWithProviders(
    <Table>
      <StandardTableHead
        columns={columns}
        sortConfig={sortConfig}
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
    renderHead({ allSelected: false, someSelected: false, onToggleAll: vi.fn() });
    expect(screen.getByRole("checkbox", { name: /select all rows/i })).toBeInTheDocument();
  });

  it("reflects allSelected state on the checkbox", () => {
    renderHead({ allSelected: true, someSelected: true, onToggleAll: vi.fn() });
    expect(screen.getByRole("checkbox", { name: /select all rows/i })).toBeChecked();
  });

  it("calls onToggleAll when the header checkbox is clicked", async () => {
    const onToggleAll = vi.fn();
    renderHead({ allSelected: false, someSelected: false, onToggleAll });

    await userEvent.click(screen.getByRole("checkbox", { name: /select all rows/i }));

    expect(onToggleAll).toHaveBeenCalledTimes(1);
  });

  it("uses a custom aria label when provided", () => {
    renderHead({
      allSelected: false,
      someSelected: false,
      onToggleAll: vi.fn(),
      ariaLabel: "Pick rows to act on",
    });

    expect(screen.getByRole("checkbox", { name: /pick rows to act on/i })).toBeInTheDocument();
  });
});
