import { screen } from "@testing-library/react";
import { renderWithProviders } from "../../../../../test/renderWithProviders";
import FileTable from "../FileTable";
import type { FileModel } from "../../../../../domain/models/Common/file/file.model";

vi.mock("../../FilesBasicTable/FileBasicTable", () => ({
  default: ({ data, paginated, table }: any) => (
    <div data-testid="file-basic-table">
      <span data-testid="table-name">{table}</span>
      <span data-testid="paginated">{String(paginated)}</span>
      <span data-testid="col-count">{data.cols.length}</span>
      <span data-testid="row-count">{data.rows.length}</span>
      <ul data-testid="col-names">
        {data.cols.map((col: any, i: number) => (
          <li key={i} data-testid={`col-name-${i}`}>
            {typeof col.name === "string" ? col.name : "react-element"}
          </li>
        ))}
      </ul>
    </div>
  ),
}));

vi.mock("../../../EmptyState", () => ({
  EmptyState: ({ message }: { message: string }) => <div data-testid="empty-state">{message}</div>,
}));

const mockFile = (overrides: Partial<FileModel> = {}): FileModel =>
  ({
    id: "1",
    fileName: "doc.pdf",
    projectTitle: "Project X",
    uploader: "Alice",
    uploaderName: "Alice Smith",
    source: "upload",
    version: "1",
    reviewStatus: "pending",
    getFormattedUploadDate: () => "01 Jan 2025",
    ...overrides,
  }) as unknown as FileModel;

const baseCols = [{ name: "File Name" }, { name: "Upload Date" }, { name: "Uploader" }];

describe("FileTable", () => {
  it("renders empty state when files array is empty", () => {
    renderWithProviders(<FileTable cols={baseCols} files={[]} />);

    expect(screen.getByTestId("empty-state")).toBeInTheDocument();
    expect(
      screen.getByText("There are currently no pieces of evidence or other documents uploaded."),
    ).toBeInTheDocument();
  });

  it("renders FileBasicTable when files are present", () => {
    renderWithProviders(<FileTable cols={baseCols} files={[mockFile()]} />);

    expect(screen.getByTestId("file-basic-table")).toBeInTheDocument();
    expect(screen.queryByTestId("empty-state")).not.toBeInTheDocument();
  });

  it("passes table name to FileBasicTable", () => {
    renderWithProviders(<FileTable cols={baseCols} files={[mockFile()]} />);

    expect(screen.getByTestId("table-name").textContent).toBe("fileManager");
  });

  it("passes paginated as true by default when files exist", () => {
    renderWithProviders(<FileTable cols={baseCols} files={[mockFile()]} />);

    expect(screen.getByTestId("paginated").textContent).toBe("true");
  });

  it("passes paginated as false when hidePagination is true", () => {
    renderWithProviders(<FileTable cols={baseCols} files={[mockFile()]} hidePagination />);

    expect(screen.getByTestId("paginated").textContent).toBe("false");
  });

  it("passes correct column count to FileBasicTable", () => {
    renderWithProviders(<FileTable cols={baseCols} files={[mockFile()]} />);

    expect(screen.getByTestId("col-count").textContent).toBe("3");
  });

  it("passes correct row count to FileBasicTable", () => {
    renderWithProviders(<FileTable cols={baseCols} files={[mockFile(), mockFile({ id: "2" })]} />);

    expect(screen.getByTestId("row-count").textContent).toBe("2");
  });

  it("passes Upload Date column name as string (casing mismatch prevents sorting)", () => {
    renderWithProviders(<FileTable cols={[{ name: "Upload Date" }]} files={[mockFile()]} />);

    expect(screen.getByTestId("col-name-0").textContent).toBe("Upload Date");
  });

  it("passes Uploader column name as string (casing mismatch prevents sorting)", () => {
    renderWithProviders(<FileTable cols={[{ name: "Uploader" }]} files={[mockFile()]} />);

    expect(screen.getByTestId("col-name-0").textContent).toBe("Uploader");
  });

  it("passes non-sortable column as original string", () => {
    renderWithProviders(<FileTable cols={[{ name: "Source" }]} files={[mockFile()]} />);

    expect(screen.getByTestId("col-name-0").textContent).toBe("Source");
  });
});
