import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { TableHead, TableRow, TableCell } from "@mui/material";
import TableEmptyStateLayout from "..";

const header = (
  <TableHead>
    <TableRow>
      <TableCell>Provider</TableCell>
    </TableRow>
  </TableHead>
);

describe("TableEmptyStateLayout", () => {
  it("makes the header row a keyboard-focusable region, since it can scroll sideways", () => {
    render(<TableEmptyStateLayout header={header}>No rows</TableEmptyStateLayout>);
    const region = screen.getByRole("region", { name: "Columns" });
    expect(region).toHaveAttribute("tabindex", "0");
    expect(region).toHaveTextContent("Provider");
  });

  it("accepts a more specific label", () => {
    render(
      <TableEmptyStateLayout header={header} ariaLabel="Model columns">
        No rows
      </TableEmptyStateLayout>,
    );
    expect(screen.getByRole("region", { name: "Model columns" })).toBeInTheDocument();
  });

  it("renders the empty state below the header", () => {
    render(<TableEmptyStateLayout header={header}>No rows</TableEmptyStateLayout>);
    expect(screen.getByText("No rows")).toBeInTheDocument();
  });
});
