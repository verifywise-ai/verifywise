import { screen, fireEvent } from "@testing-library/react";
import { renderWithProviders } from "../../../test/renderWithProviders";
import MCPTable, { MCPTableColumn } from "./MCPTable";

interface Row {
  id: number;
  name: string;
  status: string;
}

const rows: Row[] = [
  { id: 1, name: "Alpha", status: "Active" },
  { id: 2, name: "Beta", status: "Inactive" },
];

const columns: MCPTableColumn[] = [
  { label: "Name", width: 200 },
  { label: "Status", align: "right", sortKey: "status" },
];

function renderTable(overrides: Partial<React.ComponentProps<typeof MCPTable<Row>>> = {}) {
  return renderWithProviders(
    <MCPTable<Row>
      id="test-table"
      columns={columns}
      rows={rows}
      rowKey={(r) => r.id}
      renderRow={(r) => [r.name, r.status]}
      {...overrides}
    />,
  );
}

describe("MCPTable", () => {
  it("renders column headers and row cells", () => {
    renderTable();

    expect(screen.getByText("Name")).toBeInTheDocument();
    expect(screen.getByText("Status")).toBeInTheDocument();
    expect(screen.getByText("Alpha")).toBeInTheDocument();
    expect(screen.getByText("Beta")).toBeInTheDocument();
    expect(screen.getByText("Active")).toBeInTheDocument();
    expect(screen.getByText("Inactive")).toBeInTheDocument();
  });

  it("renders no rows when the rows array is empty", () => {
    renderTable({ rows: [] });

    expect(screen.getByText("Name")).toBeInTheDocument();
    expect(screen.queryByText("Alpha")).not.toBeInTheDocument();
  });

  it("calls onRowClick with the clicked row when a row is clicked", () => {
    const onRowClick = vi.fn();
    renderTable({ onRowClick });

    fireEvent.click(screen.getByText("Alpha"));

    expect(onRowClick).toHaveBeenCalledWith(rows[0]);
  });

  it("does not attach a click handler to rows when onRowClick is omitted", () => {
    renderTable();

    // Clicking should not throw when no handler is provided.
    expect(() => fireEvent.click(screen.getByText("Alpha"))).not.toThrow();
  });

  it("renders a sortable header as a button when column has sortKey and onSort is provided", () => {
    const onSort = vi.fn();
    renderTable({ onSort });

    const sortButton = screen.getByRole("button", { name: "Sort ascending" });
    expect(sortButton).toBeInTheDocument();

    fireEvent.click(sortButton);
    expect(onSort).toHaveBeenCalledWith("status");
  });

  it("does not render a sort control when a column has sortKey but no onSort handler", () => {
    renderTable();

    expect(screen.queryByRole("button", { name: "Sort ascending" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Sort descending" })).not.toBeInTheDocument();
  });

  it("shows 'Sort descending' aria-label and marks the active column when sortBy/sortDir are set", () => {
    const onSort = vi.fn();
    renderTable({ onSort, sortBy: "status", sortDir: "desc" });

    expect(screen.getByRole("button", { name: "Sort descending" })).toBeInTheDocument();
  });

  it("triggers onSort on Enter key press for accessibility", () => {
    const onSort = vi.fn();
    renderTable({ onSort });

    const sortButton = screen.getByRole("button", { name: "Sort ascending" });
    fireEvent.keyDown(sortButton, { key: "Enter" });

    expect(onSort).toHaveBeenCalledWith("status");
  });

  it("triggers onSort on Space key press for accessibility", () => {
    const onSort = vi.fn();
    renderTable({ onSort });

    const sortButton = screen.getByRole("button", { name: "Sort ascending" });
    fireEvent.keyDown(sortButton, { key: " " });

    expect(onSort).toHaveBeenCalledWith("status");
  });

  it("ignores other key presses on the sort control", () => {
    const onSort = vi.fn();
    renderTable({ onSort });

    const sortButton = screen.getByRole("button", { name: "Sort ascending" });
    fireEvent.keyDown(sortButton, { key: "Tab" });

    expect(onSort).not.toHaveBeenCalled();
  });

  it("applies rowSx per-row style override when provided", () => {
    const rowSx = vi.fn().mockReturnValue({ opacity: 0.5 });
    renderTable({ rowSx });

    expect(rowSx).toHaveBeenCalledWith(rows[0]);
    expect(rowSx).toHaveBeenCalledWith(rows[1]);
  });

  it("renders a plain (non-sortable) header when column has no sortKey even with onSort provided", () => {
    const onSort = vi.fn();
    renderTable({ onSort, columns: [{ label: "Name", width: 200 }, columns[1]] });

    // "Name" column has no sortKey, so it should render as plain text, no button role.
    const nameHeader = screen.getByText("Name");
    expect(nameHeader.closest('[role="button"]')).toBeNull();
  });
});
