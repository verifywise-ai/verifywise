import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "../../../../test/renderWithProviders";
import { ExportMenu } from "../ExportMenu";

const columns = [
  { id: "name", label: "Name" },
  { id: "age", label: "Age" },
];

const data = [
  { name: "Alice", age: 30 },
  { name: "Bob", age: 25 },
];

const { mockPrintTable, mockExportToCSV, mockExportToExcel, mockExportToPDF } = vi.hoisted(() => ({
  mockPrintTable: vi.fn(),
  mockExportToCSV: vi.fn(),
  mockExportToExcel: vi.fn(),
  mockExportToPDF: vi.fn(),
}));

vi.mock("../../../../application/utils/tableExport", () => ({
  printTable: mockPrintTable,
  exportToCSV: mockExportToCSV,
  exportToExcel: mockExportToExcel,
  exportToPDF: mockExportToPDF,
}));

vi.mock("../../../assets/icons/pdf_icon.svg", () => ({ default: "pdf-icon.svg" }));
vi.mock("../../../assets/icons/csv_icon.svg", () => ({ default: "csv-icon.svg" }));
vi.mock("../../../assets/icons/xls_icon.svg", () => ({ default: "xls-icon.svg" }));

describe("ExportMenu", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the export button", () => {
    renderWithProviders(<ExportMenu data={data} columns={columns} />);
    expect(screen.getByLabelText("Export options")).toBeInTheDocument();
  });

  it("disables the button when data is empty", () => {
    renderWithProviders(<ExportMenu data={[]} columns={columns} />);
    expect(screen.getByLabelText("Export options")).toBeDisabled();
  });

  it("disables the button when disabled prop is true", () => {
    renderWithProviders(<ExportMenu data={data} columns={columns} disabled />);
    expect(screen.getByLabelText("Export options")).toBeDisabled();
  });

  it("opens the main menu on button click", async () => {
    const user = userEvent.setup();
    renderWithProviders(<ExportMenu data={data} columns={columns} />);

    await user.click(screen.getByLabelText("Export options"));

    expect(screen.getByText("Print")).toBeInTheDocument();
    expect(screen.getByText("Export")).toBeInTheDocument();
  });

  it("calls printTable when Print is clicked", async () => {
    const user = userEvent.setup();
    renderWithProviders(<ExportMenu data={data} columns={columns} title="Report" />);

    await user.click(screen.getByLabelText("Export options"));
    await user.click(screen.getByText("Print"));

    expect(mockPrintTable).toHaveBeenCalledWith(data, columns, "Report");
  });

  async function openExportSubmenu(user: ReturnType<typeof userEvent.setup>) {
    await user.click(screen.getByLabelText("Export options"));
    const exportItem = screen.getByText("Export");
    await user.hover(exportItem);
  }

  it("calls exportToPDF when Export to PDF is clicked", async () => {
    const user = userEvent.setup();
    renderWithProviders(<ExportMenu data={data} columns={columns} filename="test" />);

    await openExportSubmenu(user);
    await user.click(screen.getByText("Export to PDF"));

    expect(mockExportToPDF).toHaveBeenCalledWith(data, columns, "test", undefined);
  });

  it("calls exportToCSV when Export to CSV is clicked", async () => {
    const user = userEvent.setup();
    renderWithProviders(<ExportMenu data={data} columns={columns} />);

    await openExportSubmenu(user);
    await user.click(screen.getByText("Export to CSV"));

    expect(mockExportToCSV).toHaveBeenCalledWith(data, columns, "export");
  });

  it("calls exportToExcel when Export to XLSX is clicked", async () => {
    const user = userEvent.setup();
    renderWithProviders(<ExportMenu data={data} columns={columns} />);

    await openExportSubmenu(user);
    await user.click(screen.getByText("Export to XLSX"));

    expect(mockExportToExcel).toHaveBeenCalledWith(data, columns, "export");
  });

  it("uses the default filename when not provided", async () => {
    const user = userEvent.setup();
    renderWithProviders(<ExportMenu data={data} columns={columns} />);

    await openExportSubmenu(user);
    await user.click(screen.getByText("Export to CSV"));

    expect(mockExportToCSV).toHaveBeenCalledWith(data, columns, "export");
  });

  it("renders SVG icons in the export submenu", async () => {
    const user = userEvent.setup();
    renderWithProviders(<ExportMenu data={data} columns={columns} />);

    await openExportSubmenu(user);

    const pdfImg = screen.getByAltText("PDF");
    expect(pdfImg).toHaveAttribute("src", "pdf-icon.svg");

    const csvImg = screen.getByAltText("CSV");
    expect(csvImg).toHaveAttribute("src", "csv-icon.svg");

    const xlsImg = screen.getByAltText("XLSX");
    expect(xlsImg).toHaveAttribute("src", "xls-icon.svg");
  });
});
