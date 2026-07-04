import { screen } from "@testing-library/react";
import { Table } from "@mui/material";
import { renderWithProviders } from "../../../../../test/renderWithProviders";
import TableHeader from "../index";

describe("TableHeader", () => {
  it("renders all column names", () => {
    renderWithProviders(
      <Table>
        <TableHeader columns={["Name", "Status", "Actions"]} />
      </Table>,
    );

    expect(screen.getByText("Name")).toBeInTheDocument();
    expect(screen.getByText("Status")).toBeInTheDocument();
    expect(screen.getByText("Actions")).toBeInTheDocument();
  });

  it("renders a single column", () => {
    renderWithProviders(
      <Table>
        <TableHeader columns={["Name"]} />
      </Table>,
    );

    expect(screen.getByText("Name")).toBeInTheDocument();
  });

  it("renders empty columns list", () => {
    renderWithProviders(
      <Table>
        <TableHeader columns={[]} />
      </Table>,
    );

    const rows = document.querySelectorAll("thead tr");
    expect(rows.length).toBe(1);
  });

  it("does not center the first column when centered is true", () => {
    renderWithProviders(
      <Table>
        <TableHeader columns={["Name", "Status"]} centered />
      </Table>,
    );

    const cells = document.querySelectorAll("th");
    expect(cells[0].style.textAlign).not.toBe("center");
  });

  it("applies textAlign center to non-first columns when centered is true", () => {
    renderWithProviders(
      <Table>
        <TableHeader columns={["Name", "Status"]} centered />
      </Table>,
    );

    const cells = document.querySelectorAll("th");
    expect(cells[1].style.textAlign).toBe("center");
  });

  it("renders ACTION column with limited width", () => {
    renderWithProviders(
      <Table>
        <TableHeader columns={["ACTION"]} />
      </Table>,
    );

    const cell = screen.getByText("ACTION").closest("th");
    expect(cell?.style.minWidth).toBe("80px");
    expect(cell?.style.maxWidth).toBe("80px");
  });

  it("renders Actions column with limited width", () => {
    renderWithProviders(
      <Table>
        <TableHeader columns={["Actions"]} />
      </Table>,
    );

    const cell = screen.getByText("Actions").closest("th");
    expect(cell?.style.minWidth).toBe("80px");
    expect(cell?.style.maxWidth).toBe("80px");
  });
});
