import { describe, it, expect, afterEach } from "vitest";
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

// jsdom has no layout; make every element report a header wider than its card.
const overflow = () => {
  Object.defineProperty(HTMLElement.prototype, "scrollWidth", {
    configurable: true,
    get: () => 964,
  });
  Object.defineProperty(HTMLElement.prototype, "clientWidth", {
    configurable: true,
    get: () => 908,
  });
};

afterEach(() => {
  delete (HTMLElement.prototype as { scrollWidth?: number }).scrollWidth;
  delete (HTMLElement.prototype as { clientWidth?: number }).clientWidth;
});

describe("TableEmptyStateLayout", () => {
  it("makes an overflowing header row a keyboard-focusable region", () => {
    overflow();
    render(<TableEmptyStateLayout header={header}>No rows</TableEmptyStateLayout>);
    const region = screen.getByRole("region", { name: "Columns" });
    expect(region).toHaveAttribute("tabindex", "0");
    expect(region).toHaveTextContent("Provider");
  });

  it("accepts a more specific label", () => {
    overflow();
    render(
      <TableEmptyStateLayout header={header} ariaLabel="Model columns">
        No rows
      </TableEmptyStateLayout>,
    );
    expect(screen.getByRole("region", { name: "Model columns" })).toBeInTheDocument();
  });

  it("adds no region when the header fits", () => {
    render(<TableEmptyStateLayout header={header}>No rows</TableEmptyStateLayout>);
    expect(screen.queryByRole("region")).not.toBeInTheDocument();
  });

  it("renders the empty state below the header", () => {
    render(<TableEmptyStateLayout header={header}>No rows</TableEmptyStateLayout>);
    expect(screen.getByText("No rows")).toBeInTheDocument();
  });
});
