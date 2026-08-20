import { screen, waitFor, within } from "@testing-library/react";
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
  it("closes the export submenu when the pointer leaves the submenu paper", async () => {
    const user = userEvent.setup();
    renderWithProviders(<ExportMenu data={data} columns={columns} />);

    await openExportSubmenu(user);
    expect(screen.getByText("Export to PDF")).toBeInTheDocument();

    const submenuPaper = screen.getByText("Export to PDF").closest(".MuiPaper-root") as Element;
    await user.hover(submenuPaper);
    await user.unhover(submenuPaper);

    await waitFor(() => {
      expect(screen.queryByText("Export to PDF")).not.toBeInTheDocument();
    });
  });

  it("keeps the main menu open when the Export parent item is clicked", async () => {
    const user = userEvent.setup();
    renderWithProviders(<ExportMenu data={data} columns={columns} />);

    await user.click(screen.getByLabelText("Export options"));
    await user.click(screen.getByText("Export"));

    expect(screen.getByText("Print")).toBeInTheDocument();
    expect(screen.getByText("Export")).toBeInTheDocument();
    expect(mockPrintTable).not.toHaveBeenCalled();
    expect(mockExportToPDF).not.toHaveBeenCalled();
  });

  describe("accessibility properties", () => {
    it("marks the trigger as a menu button", () => {
      renderWithProviders(<ExportMenu data={data} columns={columns} />);

      expect(screen.getByLabelText("Export options")).toHaveAttribute("aria-haspopup", "menu");
    });

    it("flips aria-expanded as the menu opens and closes", async () => {
      const user = userEvent.setup();
      renderWithProviders(<ExportMenu data={data} columns={columns} />);

      const trigger = screen.getByLabelText("Export options");
      expect(trigger).toHaveAttribute("aria-expanded", "false");

      await user.click(trigger);
      expect(trigger).toHaveAttribute("aria-expanded", "true");

      await user.keyboard("{Escape}");
      await waitFor(() => {
        expect(trigger).toHaveAttribute("aria-expanded", "false");
      });
    });

    it("exposes the open menu with its items as a menu role", async () => {
      const user = userEvent.setup();
      renderWithProviders(<ExportMenu data={data} columns={columns} />);

      await user.click(screen.getByLabelText("Export options"));

      const menu = screen.getByRole("menu");
      expect(within(menu).getAllByRole("menuitem")).toHaveLength(2);
    });
  });

  describe("keyboard interaction", () => {
    it("opens the menu with Enter on the focused trigger", async () => {
      const user = userEvent.setup();
      renderWithProviders(<ExportMenu data={data} columns={columns} />);

      await user.tab();
      expect(screen.getByLabelText("Export options")).toHaveFocus();

      await user.keyboard("{Enter}");

      expect(await screen.findByRole("menu")).toBeInTheDocument();
      expect(screen.getByText("Print")).toBeInTheDocument();
    });

    it("opens the menu with Space on the focused trigger", async () => {
      const user = userEvent.setup();
      renderWithProviders(<ExportMenu data={data} columns={columns} />);

      await user.tab();
      await user.keyboard("{ }");

      expect(await screen.findByRole("menu")).toBeInTheDocument();
    });

    it("moves focus through the menu items with the arrow keys", async () => {
      const user = userEvent.setup();
      renderWithProviders(<ExportMenu data={data} columns={columns} />);

      await user.click(screen.getByLabelText("Export options"));

      const [printItem, exportItem] = within(screen.getByRole("menu")).getAllByRole("menuitem");

      // MUI moves focus onto the first item as soon as the menu opens.
      expect(printItem).toHaveFocus();

      await user.keyboard("{ArrowDown}");
      expect(exportItem).toHaveFocus();

      await user.keyboard("{ArrowUp}");
      expect(printItem).toHaveFocus();
    });

    it("wraps focus around the ends of the menu", async () => {
      const user = userEvent.setup();
      renderWithProviders(<ExportMenu data={data} columns={columns} />);

      await user.click(screen.getByLabelText("Export options"));

      const [printItem, exportItem] = within(screen.getByRole("menu")).getAllByRole("menuitem");

      await user.keyboard("{ArrowUp}");
      expect(exportItem).toHaveFocus();

      await user.keyboard("{ArrowDown}");
      expect(printItem).toHaveFocus();
    });

    it("triggers Print with Enter on the focused menu item", async () => {
      const user = userEvent.setup();
      renderWithProviders(<ExportMenu data={data} columns={columns} title="Report" />);

      await user.click(screen.getByLabelText("Export options"));
      expect(screen.getByText("Print").closest("li")).toHaveFocus();

      await user.keyboard("{Enter}");

      expect(mockPrintTable).toHaveBeenCalledWith(data, columns, "Report");
    });

    it("closes the menu with Escape and returns focus to the trigger", async () => {
      const user = userEvent.setup();
      renderWithProviders(<ExportMenu data={data} columns={columns} />);

      const trigger = screen.getByLabelText("Export options");
      await user.click(trigger);
      expect(screen.getByRole("menu")).toBeInTheDocument();

      await user.keyboard("{Escape}");

      await waitFor(() => {
        expect(screen.queryByRole("menu")).not.toBeInTheDocument();
      });
      expect(trigger).toHaveFocus();
    });

    it("does not open the menu from the keyboard when disabled", async () => {
      const user = userEvent.setup();
      renderWithProviders(<ExportMenu data={data} columns={columns} disabled />);

      await user.tab();
      expect(screen.getByLabelText("Export options")).not.toHaveFocus();

      await user.keyboard("{Enter}");
      expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    });
  });
});
