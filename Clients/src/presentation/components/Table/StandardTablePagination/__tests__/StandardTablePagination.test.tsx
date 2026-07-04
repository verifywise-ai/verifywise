import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Table } from "@mui/material";
import { renderWithProviders } from "../../../../../test/renderWithProviders";
import StandardTablePagination from "../index";

vi.mock("../../../TablePagination", () => ({
  default: () => <div data-testid="table-pagination-actions" />,
}));

function renderPagination(props: Partial<Parameters<typeof StandardTablePagination>[0]> = {}) {
  return renderWithProviders(
    <Table>
      <StandardTablePagination
        totalCount={25}
        page={0}
        rowsPerPage={10}
        onPageChange={vi.fn()}
        onRowsPerPageChange={vi.fn()}
        getRange="1-10"
        entityLabel="risk"
        colSpan={5}
        {...props}
      />
    </Table>,
  );
}

describe("StandardTablePagination", () => {
  it("renders the range text with singular label for one item", () => {
    renderPagination({ totalCount: 1, getRange: "1-1" });

    expect(screen.getByText(/Showing 1-1 of 1 risk$/)).toBeInTheDocument();
  });

  it("renders the range text with plural label", () => {
    renderPagination({ totalCount: 25, getRange: "1-10" });

    expect(screen.getByText(/Showing 1-10 of 25 risks$/)).toBeInTheDocument();
  });

  it("renders the range text with custom plural label", () => {
    renderPagination({
      totalCount: 25,
      getRange: "1-10",
      entityLabelPlural: "risk items",
    });

    expect(screen.getByText(/Showing 1-10 of 25 risk items$/)).toBeInTheDocument();
  });

  it("renders page number display", () => {
    renderPagination({ page: 1, totalCount: 50, rowsPerPage: 10, getRange: "11-20" });

    expect(screen.getByText(/Page 2 of 5/)).toBeInTheDocument();
  });

  it("renders the pagination actions component", () => {
    renderPagination();

    expect(screen.getByTestId("table-pagination-actions")).toBeInTheDocument();
  });

  it("renders rows per page selector label with capitalised entity label", () => {
    renderPagination({ entityLabelPlural: "risks" });

    expect(screen.getByText(/Risks per page/)).toBeInTheDocument();
  });

  it("calls onRowsPerPageChange when rows per page is changed", async () => {
    const onRowsPerPageChange = vi.fn();
    const user = userEvent.setup();
    renderPagination({ onRowsPerPageChange });

    const select = screen.getByRole("combobox");
    await user.click(select);
    await user.click(screen.getByRole("option", { name: "20" }));

    expect(onRowsPerPageChange).toHaveBeenCalled();
  });
});
