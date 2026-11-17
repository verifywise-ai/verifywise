import { screen, fireEvent, waitFor } from "@testing-library/react";
import { renderWithProviders } from "../../../../../test/renderWithProviders";

const mockMutateAsync = vi.fn();
vi.mock("../../../../../application/hooks/useFrameworkImport", () => ({
  useImportFramework: () => ({ mutateAsync: mockMutateAsync, isPending: false }),
  useImportedFrameworks: () => ({ data: [] }),
  useUpdateImportedFramework: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDeleteImportedFramework: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

vi.mock("../../../../../application/repository/frameworkImport.repository", () => ({
  downloadFrameworkImportTemplate: vi.fn(),
  importFramework: vi.fn(),
  getImportedFrameworks: vi.fn(),
  updateImportedFramework: vi.fn(),
  deleteImportedFramework: vi.fn(),
}));

// A parsed sheet: header row, then two data rows around a blank row 3.
const SHEET: unknown[][] = [
  ["Framework Name *", "Topic Number *", "Topic Name *", "Subtopic Number", "Subtopic Name"],
  ["Internal policy", "1", "Governance", "1.1", "Accountability"],
  ["", "", "", "", ""],
  ["Internal policy", "1", "Governance", "1.1", "Accountability again"],
];
vi.mock("exceljs", () => {
  class Workbook {
    xlsx = { load: async () => undefined };
    getWorksheet() {
      return {
        eachRow: (cb: (row: unknown, rowNumber: number) => void) =>
          SHEET.forEach((values, i) =>
            cb(
              {
                eachCell: (
                  _opts: unknown,
                  cellCb: (cell: { value: unknown }, colNumber: number) => void,
                ) => values.forEach((value, c) => cellCb({ value }, c + 1)),
              },
              i + 1,
            ),
          ),
      };
    }
  }
  return { default: { Workbook }, Workbook };
});

import FrameworkImportModal from "../FrameworkImportModal";

const renderModal = () =>
  renderWithProviders(<FrameworkImportModal open onClose={vi.fn()} onImportComplete={vi.fn()} />);

const uploadXlsx = () => {
  const input = screen.getByTestId("framework-import-file-input") as HTMLInputElement;
  const file = new File(["data"], "framework.xlsx", {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  Object.defineProperty(file, "arrayBuffer", { value: async () => new ArrayBuffer(0) });
  fireEvent.change(input, { target: { files: [file] } });
};

describe("FrameworkImportModal (#5254)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders both steps and says where to add the framework to a use case", () => {
    renderModal();
    expect(screen.getByText(/Step 1: Download the Excel template/i)).toBeInTheDocument();
    expect(screen.getByText(/Step 2: Upload the filled Excel file/i)).toBeInTheDocument();
    expect(screen.getByText(/Frameworks tab of that use case/i)).toBeInTheDocument();
    expect(screen.queryByText(/cannot be added to use cases yet/i)).not.toBeInTheDocument();
  });

  it("keeps the import button disabled until rows are parsed", () => {
    renderModal();
    expect(screen.getByRole("button", { name: /import framework/i })).toBeDisabled();
  });

  it("rejects non-xlsx files with an error", () => {
    renderModal();
    const input = screen.getByTestId("framework-import-file-input") as HTMLInputElement;
    const file = new File(["data"], "frameworks.csv", { type: "text/csv" });
    fireEvent.change(input, { target: { files: [file] } });
    expect(screen.getByText(/Please upload an Excel file/i)).toBeInTheDocument();
    expect(mockMutateAsync).not.toHaveBeenCalled();
  });

  it("lists every failing row when the server rejects the import", async () => {
    mockMutateAsync.mockResolvedValue({
      success: false,
      imported_topics: 0,
      imported_subtopics: 0,
      failed: 2,
      errors: [
        {
          row: 3,
          field: "subtopic_number",
          message: "Subtopic 1.1 already appears under topic 1 on row 2",
        },
        { row: 0, field: "file", message: "A file can have at most 5000 rows" },
      ],
      importedAt: "2026-11-11T00:00:00Z",
    });
    renderModal();
    uploadXlsx();

    await screen.findByText(/Preview \(2 row\(s\) found\)/i);
    const importButton = screen.getByRole("button", { name: /import framework/i });
    await waitFor(() => expect(importButton).not.toBeDisabled());
    fireEvent.click(importButton);

    await screen.findByText(/Nothing was imported/i);
    expect(mockMutateAsync).toHaveBeenCalledWith([
      expect.objectContaining({ framework_name: "Internal policy", subtopic_number: "1.1" }),
      expect.objectContaining({ subtopic_name: "Accountability again" }),
    ]);
    const table = screen.getByRole("table", { name: /import errors/i });
    expect(table).toHaveTextContent("Subtopic 1.1 already appears under topic 1 on row 2");
    expect(table).toHaveTextContent("subtopic_number");
    expect(table).toHaveTextContent("A file can have at most 5000 rows");
  });

  const importSuccessfully = async (counts: Record<string, number>) => {
    mockMutateAsync.mockResolvedValue({
      success: true,
      imported_topics: 1,
      imported_subtopics: 2,
      failed: 0,
      errors: [],
      importedAt: "2026-11-11T00:00:00Z",
      ...counts,
    });
    renderModal();
    uploadXlsx();
    await screen.findByText(/Preview \(2 row\(s\) found\)/i);
    const importButton = screen.getByRole("button", { name: /import framework/i });
    await waitFor(() => expect(importButton).not.toBeDisabled());
    fireEvent.click(importButton);
  };

  it("sends each row's sheet row number, skipping blank rows", async () => {
    await importSuccessfully({ added: 3, updated: 0, retired: 0, removed: 0 });
    await waitFor(() => expect(mockMutateAsync).toHaveBeenCalled());
    const rows = mockMutateAsync.mock.calls[0][0];
    expect(rows).toHaveLength(2);
    expect(rows.map((row: { row_number?: number }) => row.row_number)).toEqual([2, 4]);
  });

  it("reports topic and subtopic counts after a first import", async () => {
    await importSuccessfully({ added: 3, updated: 0, retired: 0, removed: 0 });
    expect(
      await screen.findByText("Framework imported: 1 topic(s) and 2 subtopic(s)."),
    ).toBeInTheDocument();
  });

  it("reports added, updated, retired and removed after a re-import", async () => {
    await importSuccessfully({ added: 1, updated: 4, retired: 2, removed: 3 });
    expect(
      await screen.findByText("Framework updated: 1 added, 4 updated, 2 retired, 3 removed."),
    ).toBeInTheDocument();
  });
});
