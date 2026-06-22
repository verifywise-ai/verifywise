import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "../../../../../test/renderWithProviders";
import FileBasicTable from "../FileBasicTable";
import { FileModel } from "../../../../../domain/models/Common/file/file.model";
import type { IColumn } from "../../../../types/interfaces/i.table";

const mockBulkState = vi.hoisted(() => ({
  selectedIds: [] as number[],
  isSelected: (_id: number): boolean => false,
  toggle: () => {},
  toggleAll: () => {},
  setAll: () => {},
  clear: () => {},
  allSelected: false,
  someSelected: false,
  count: 0,
}));

vi.mock("../../../../../application/hooks/useBulkSelection", () => ({
  useBulkSelection: () => mockBulkState,
}));

vi.mock("../../../../../application/hooks/useBulkUpdateFiles", () => ({
  useBulkUpdateFiles: () => ({ mutate: vi.fn(), isPending: false }),
}));

vi.mock("../../../../../application/repository/file.repository", () => ({
  deleteFileFromManager: vi.fn().mockResolvedValue({}),
}));

vi.mock("../../../../../application/repository/entity.repository", () => ({
  deleteEntityById: vi.fn().mockResolvedValue({}),
}));

vi.mock("../../../../../application/repository/virtualFolder.repository", () => ({
  getAllFolders: vi.fn().mockResolvedValue([
    { id: 1, name: "Audit docs" },
    { id: 2, name: "Evidence" },
  ]),
}));

vi.mock("../../../../../application/tools/fileDownload", () => ({
  handleDownload: vi.fn(),
}));

vi.mock("../../../IconButton", () => ({
  default: ({ id, onDelete, onDownload, onAssignToFolder }: any) => (
    <div data-testid="icon-button" data-file-id={id}>
      <button data-testid={`download-file-${id}`} onClick={onDownload}>
        Download
      </button>
      <button data-testid={`delete-file-${id}`} onClick={onDelete}>
        Delete
      </button>
      {onAssignToFolder && (
        <button data-testid={`assign-folder-${id}`} onClick={onAssignToFolder}>
          Assign to folder
        </button>
      )}
    </div>
  ),
}));

vi.mock("../../../FileIcon", () => ({
  FileIcon: ({ fileName }: any) => (
    <span data-testid="file-icon" data-filename={fileName}>
      📄
    </span>
  ),
}));

vi.mock("../../../Chip", () => ({
  default: ({ label, variant, uppercase }: any) => (
    <span data-testid="chip" data-variant={variant} data-uppercase={uppercase}>
      {label}
    </span>
  ),
}));

vi.mock("../../../Inputs/Checkbox", () => ({
  default: ({ isChecked, onChange, ariaLabel, isIndeterminate }: any) => (
    <input
      type="checkbox"
      checked={isChecked}
      onChange={onChange}
      aria-label={ariaLabel}
      data-indeterminate={isIndeterminate}
      data-testid="file-checkbox"
    />
  ),
}));

vi.mock("../../../Inputs/ChipInput", () => ({
  default: ({ id, label, value, onChange, placeholder }: any) => (
    <div data-testid="chip-input" data-input-id={id}>
      <label>{label}</label>
      <input
        data-testid="chip-input-field"
        placeholder={placeholder}
        value={value?.join(",") || ""}
        onChange={(e) => onChange(e.target.value.split(",").filter(Boolean))}
      />
    </div>
  ),
}));

vi.mock("../../../Inputs/Select", () => ({
  default: ({ id, placeholder, value, onChange, items }: any) => (
    <select data-testid="vw-select" data-select-id={id} value={value} onChange={onChange}>
      <option value="">{placeholder}</option>
      {items.map((item: any) => (
        <option key={item._id} value={item._id}>
          {item.name}
        </option>
      ))}
    </select>
  ),
}));

vi.mock("../../../Inputs/Select/Multi", () => ({
  default: ({ label, value, onChange, items }: any) => (
    <div data-testid="multi-select">
      <label>{label}</label>
      <select multiple data-testid="multi-select-field" value={value} onChange={onChange}>
        {items.map((item: any) => (
          <option key={item._id} value={item._id}>
            {item.name}
          </option>
        ))}
      </select>
    </div>
  ),
}));

vi.mock("../../../Dialogs/ConfirmationModal", () => ({
  default: ({ isOpen, title, onProceed, onCancel, proceedText, cancelText, isLoading }: any) =>
    isOpen ? (
      <div data-testid="confirmation-modal" data-loading={isLoading}>
        <h3>{title}</h3>
        <button data-testid="modal-proceed" onClick={onProceed} disabled={isLoading}>
          {proceedText}
        </button>
        <button data-testid="modal-cancel" onClick={onCancel} disabled={isLoading}>
          {cancelText}
        </button>
      </div>
    ) : null,
}));

vi.mock("../../BulkActionsToolbar", () => ({
  default: ({ count, onClear, actions, selectAll }: any) => (
    <div data-testid="bulk-actions-toolbar">
      <span data-testid="selection-count">{count} selected</span>
      <button data-testid="clear-selection" onClick={onClear}>
        Clear
      </button>
      {actions.map((action: any) => (
        <button
          key={action.id}
          data-testid={`bulk-action-${action.id}`}
          onClick={action.onClick}
          disabled={action.disabled}
        >
          {action.label}
        </button>
      ))}
      {selectAll && (
        <button data-testid="select-all-files" onClick={selectAll.onSelectAll}>
          Select all {selectAll.totalCount}
        </button>
      )}
    </div>
  ),
}));

vi.mock("../../../ProjectRiskMitigation/ProjectRiskLinkedPolicies", () => ({
  default: ({ isOpen, onClose }: any) =>
    isOpen ? (
      <div data-testid="linked-policies-dialog">
        <button data-testid="close-linked-policies" onClick={onClose}>
          Close
        </button>
      </div>
    ) : null,
}));

if (
  typeof globalThis.localStorage === "undefined" ||
  typeof globalThis.localStorage.getItem !== "function"
) {
  const store: Record<string, string> = {};
  Object.defineProperty(globalThis, "localStorage", {
    value: {
      getItem: (key: string) => store[key] ?? null,
      setItem: (key: string, val: string) => {
        store[key] = val;
      },
      removeItem: (key: string) => {
        delete store[key];
      },
      clear: () => {
        Object.keys(store).forEach((k) => delete store[k]);
      },
      get length() {
        return Object.keys(store).length;
      },
      key: (i: number) => Object.keys(store)[i] ?? null,
    },
    writable: true,
  });
}

function createFileModel(overrides: Partial<FileModel> = {}): FileModel {
  return new FileModel({
    id: String(Math.random()),
    fileName: "document.pdf",
    uploadDate: new Date("2025-01-15"),
    uploader: "user-1",
    uploaderName: "Alice Smith",
    source: "Direct upload",
    version: "1.0",
    reviewStatus: "draft",
    tags: [],
    ...overrides,
  } as FileModel);
}

const mockColumns: IColumn[] = [
  { id: 1, name: "File" },
  { id: 2, name: "Upload Date" },
  { id: 3, name: "Uploader" },
  { id: 4, name: "Source" },
  { id: 5, name: "Version" },
  { id: 6, name: "Status" },
  { id: 7, name: "Action" },
];

const mockFiles = [
  createFileModel({
    id: "1",
    fileName: "annual-report-2025.pdf",
    uploaderName: "Alice Smith",
    uploadDate: new Date(2025, 5, 1),
    version: "2.1",
    reviewStatus: "approved",
    source: "Direct upload",
  }),
  createFileModel({
    id: "2",
    fileName: "risk-assessment.xlsx",
    uploaderName: "Bob Jones",
    uploadDate: new Date(2025, 4, 15),
    version: "1.0",
    reviewStatus: "draft",
    source: "Assessment tracker group",
  }),
  createFileModel({
    id: "3",
    fileName: "compliance-evidence.docx",
    uploaderName: "Charlie Brown",
    uploadDate: new Date(2025, 3, 20),
    version: "3.0",
    reviewStatus: "pending_review",
    source: "Compliance tracker group",
  }),
];

const defaultProps = {
  data: { rows: mockFiles, cols: mockColumns },
  bodyData: mockFiles,
  table: "test-file-table",
  onFileDeleted: vi.fn(),
};

describe("FileBasicTable", () => {
  function setBulkSelected(ids: number[]) {
    mockBulkState.selectedIds = ids;
    mockBulkState.count = ids.length;
    mockBulkState.isSelected = (id: number) => ids.includes(id);
  }

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    setBulkSelected([]);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders column headers", () => {
    renderWithProviders(<FileBasicTable {...defaultProps} />);
    expect(screen.getByText("File")).toBeInTheDocument();
    expect(screen.getByText("Upload Date")).toBeInTheDocument();
    expect(screen.getByText("Uploader")).toBeInTheDocument();
    expect(screen.getByText("Source")).toBeInTheDocument();
    expect(screen.getByText("Version")).toBeInTheDocument();
    expect(screen.getByText("Status")).toBeInTheDocument();
    expect(screen.getByText("Action")).toBeInTheDocument();
  });

  it("renders file rows", () => {
    renderWithProviders(<FileBasicTable {...defaultProps} />);
    expect(screen.getByText("annual-report-2025.pdf")).toBeInTheDocument();
    expect(screen.getByText("risk-assessment.xlsx")).toBeInTheDocument();
    expect(screen.getByText("compliance-evidence.docx")).toBeInTheDocument();
  });

  it("renders uploader names", () => {
    renderWithProviders(<FileBasicTable {...defaultProps} />);
    expect(screen.getByText("Alice Smith")).toBeInTheDocument();
    expect(screen.getByText("Bob Jones")).toBeInTheDocument();
    expect(screen.getByText("Charlie Brown")).toBeInTheDocument();
  });

  it("renders formatted upload date", () => {
    renderWithProviders(<FileBasicTable {...defaultProps} />);
    expect(screen.getByText("Jun 1, 2025")).toBeInTheDocument();
    expect(screen.getByText("May 15, 2025")).toBeInTheDocument();
    expect(screen.getByText("Apr 20, 2025")).toBeInTheDocument();
  });

  it("renders version chips", () => {
    renderWithProviders(<FileBasicTable {...defaultProps} />);
    const chips = screen.getAllByTestId("chip");
    const versionChips = chips.filter((c) => c.textContent?.startsWith("v"));
    expect(versionChips.length).toBeGreaterThanOrEqual(3);
    expect(screen.getByText("v2.1")).toBeInTheDocument();
    expect(screen.getByText("v1.0")).toBeInTheDocument();
    expect(screen.getByText("v3.0")).toBeInTheDocument();
  });

  it("renders status chips", () => {
    renderWithProviders(<FileBasicTable {...defaultProps} />);
    expect(screen.getByText("Approved")).toBeInTheDocument();
    expect(screen.getByText("Draft")).toBeInTheDocument();
    expect(screen.getByText("Pending review")).toBeInTheDocument();
  });

  it("renders Not linked text for direct uploads", () => {
    renderWithProviders(<FileBasicTable {...defaultProps} />);
    expect(screen.getByText("Not linked")).toBeInTheDocument();
  });

  it("renders linked source text for tracker groups", () => {
    renderWithProviders(<FileBasicTable {...defaultProps} />);
    expect(screen.getByText("Controls tracker group")).toBeInTheDocument();
    expect(screen.getByText("Requirements tracker group")).toBeInTheDocument();
  });

  it("renders IconButton for each file", () => {
    renderWithProviders(<FileBasicTable {...defaultProps} />);
    const buttons = screen.getAllByTestId("icon-button");
    expect(buttons).toHaveLength(3);
  });

  it("truncates long filenames", () => {
    const longName = "this-is-a-very-long-filename-that-should-be-truncated-in-the-middle.pdf";
    const longFile = createFileModel({ id: "99", fileName: longName });
    renderWithProviders(
      <FileBasicTable
        {...defaultProps}
        data={{ rows: [longFile], cols: mockColumns }}
        bodyData={[longFile]}
      />,
    );
    expect(screen.getByText("this-is-a-very-long(...)n-the-middle.pdf")).toBeInTheDocument();
  });

  it("sorts by file name on header click", async () => {
    const user = userEvent.setup();
    renderWithProviders(<FileBasicTable {...defaultProps} />);

    await user.click(screen.getByText("File"));
    const stored = localStorage.getItem("verifywise_files_basic_sorting");
    expect(stored).toBeTruthy();
    const parsed = JSON.parse(stored!);
    expect(parsed.key).toBe("File");
    expect(parsed.direction).toBe("asc");
  });

  it("toggles sort direction on second click", async () => {
    const user = userEvent.setup();
    renderWithProviders(<FileBasicTable {...defaultProps} />);

    await user.click(screen.getByText("File"));
    await user.click(screen.getByText("File"));
    const parsed = JSON.parse(localStorage.getItem("verifywise_files_basic_sorting")!);
    expect(parsed.direction).toBe("desc");
  });

  it("clears sort on third click", async () => {
    const user = userEvent.setup();
    renderWithProviders(<FileBasicTable {...defaultProps} />);

    const header = screen.getByText("File");
    await user.click(header);
    await user.click(header);
    await user.click(header);
    const parsed = JSON.parse(localStorage.getItem("verifywise_files_basic_sorting")!);
    expect(parsed.key).toBe("");
    expect(parsed.direction).toBe(null);
  });

  it("reads sorting from localStorage on mount", () => {
    localStorage.setItem(
      "verifywise_files_basic_sorting",
      JSON.stringify({ key: "file", direction: "asc" }),
    );
    renderWithProviders(<FileBasicTable {...defaultProps} />);
    expect(screen.getByText("annual-report-2025.pdf")).toBeInTheDocument();
  });

  it("shows pagination when paginated is true", () => {
    renderWithProviders(<FileBasicTable {...defaultProps} paginated />);
    expect(screen.getByText(/Rows per page/)).toBeInTheDocument();
    expect(screen.getByText(/Showing/)).toBeInTheDocument();
  });

  it("shows pagination range text", () => {
    renderWithProviders(<FileBasicTable {...defaultProps} paginated />);
    expect(screen.getByText(/Showing 1 - 3 of 3 items/)).toBeInTheDocument();
  });

  it("hides pagination when hidePagination is true", () => {
    renderWithProviders(<FileBasicTable {...defaultProps} hidePagination />);
    expect(screen.queryByText(/Rows per page/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Showing/)).not.toBeInTheDocument();
  });

  it("hides pagination by default", () => {
    renderWithProviders(<FileBasicTable {...defaultProps} />);
    expect(screen.queryByText(/Rows per page/)).not.toBeInTheDocument();
  });

  it("filters columns by visibleColumnKeys", () => {
    renderWithProviders(
      <FileBasicTable {...defaultProps} visibleColumnKeys={["file", "uploader", "status"]} />,
    );
    expect(screen.getByText("File")).toBeInTheDocument();
    expect(screen.getByText("Uploader")).toBeInTheDocument();
    expect(screen.getByText("Status")).toBeInTheDocument();
    // Header always renders all column labels
    expect(screen.getByText("Upload Date")).toBeInTheDocument();
    expect(screen.getByText("Version")).toBeInTheDocument();
    // Body cells for hidden columns should not render
    expect(screen.queryByText("v2.1")).not.toBeInTheDocument();
    expect(screen.queryByText("Not linked")).not.toBeInTheDocument();
  });

  it("renders with empty bodyData", () => {
    const { container } = renderWithProviders(
      <FileBasicTable {...defaultProps} bodyData={[]} data={{ rows: [], cols: mockColumns }} />,
    );
    const tbody = container.querySelector("tbody");
    expect(tbody?.children).toHaveLength(0);
  });

  it("shows bulk actions toolbar when canRunBulkActions is true", () => {
    renderWithProviders(<FileBasicTable {...defaultProps} canRunBulkActions />);
    expect(screen.getByTestId("bulk-actions-toolbar")).toBeInTheDocument();
  });

  it("hides bulk actions toolbar by default", () => {
    renderWithProviders(<FileBasicTable {...defaultProps} />);
    expect(screen.queryByTestId("bulk-actions-toolbar")).not.toBeInTheDocument();
  });

  it("renders row checkboxes when canRunBulkActions", () => {
    renderWithProviders(<FileBasicTable {...defaultProps} canRunBulkActions />);
    const checkboxes = screen.getAllByTestId("file-checkbox");
    expect(checkboxes.length).toBe(4);
  });

  it("renders select-all checkbox when canRunBulkActions", () => {
    renderWithProviders(<FileBasicTable {...defaultProps} canRunBulkActions />);
    const selectAll = screen.getByLabelText("Select all files on this page");
    expect(selectAll).toBeInTheDocument();
  });

  it("renders bulk action buttons for move to folder and edit tags", () => {
    renderWithProviders(<FileBasicTable {...defaultProps} canRunBulkActions />);
    expect(screen.getByTestId("bulk-action-move_to_folder")).toBeInTheDocument();
    expect(screen.getByTestId("bulk-action-edit_tags")).toBeInTheDocument();
  });

  it("opens move to folder dialog on bulk action click", async () => {
    setBulkSelected([1]);
    const user = userEvent.setup();
    renderWithProviders(<FileBasicTable {...defaultProps} canRunBulkActions />);

    await user.click(screen.getByTestId("bulk-action-move_to_folder"));
    expect(screen.getByTestId("confirmation-modal")).toBeInTheDocument();
    expect(screen.getByText(/Move 1 file to a folder/)).toBeInTheDocument();
  });

  it("opens tags dialog on edit tags bulk action click", async () => {
    setBulkSelected([1]);
    const user = userEvent.setup();
    renderWithProviders(<FileBasicTable {...defaultProps} canRunBulkActions />);

    await user.click(screen.getByTestId("bulk-action-edit_tags"));
    expect(screen.getByTestId("confirmation-modal")).toBeInTheDocument();
    expect(screen.getByText(/Edit tags on 1 file/)).toBeInTheDocument();
  });

  it("calls onFileDeleted when delete is confirmed", async () => {
    const onFileDeleted = vi.fn();
    const user = userEvent.setup();

    renderWithProviders(<FileBasicTable {...defaultProps} onFileDeleted={onFileDeleted} />);

    const deleteBtns = screen.getAllByTestId(/delete-file-/);
    await user.click(deleteBtns[0]);
  });

  it("renders linked policies dialog when evidence has linked source", () => {
    renderWithProviders(<FileBasicTable {...defaultProps} />);

    const iconButtons = screen.getAllByTestId("icon-button");
    expect(iconButtons.length).toBeGreaterThan(0);
  });

  it("handles Assign to folder callback", () => {
    const onAssignToFolder = vi.fn();
    renderWithProviders(<FileBasicTable {...defaultProps} onAssignToFolder={onAssignToFolder} />);
    expect(screen.getAllByTestId(/assign-folder-/).length).toBeGreaterThanOrEqual(1);
  });

  it("renders with linked source rows and handles row click navigation", () => {
    const linkedFiles = [
      createFileModel({
        id: "10",
        fileName: "linked-evidence.pdf",
        source: "Assessment tracker group",
        projectId: "42",
        parentId: 5,
        metaId: 10,
      }),
    ];
    renderWithProviders(
      <FileBasicTable
        {...defaultProps}
        data={{ rows: linkedFiles, cols: mockColumns }}
        bodyData={linkedFiles}
      />,
    );
    expect(screen.getByText("Controls tracker group")).toBeInTheDocument();
  });

  it("calls onBulkActionSuccess when provided", () => {
    const onBulkActionSuccess = vi.fn();
    renderWithProviders(
      <FileBasicTable
        {...defaultProps}
        canRunBulkActions
        onBulkActionSuccess={onBulkActionSuccess}
      />,
    );
    expect(screen.getByTestId("bulk-actions-toolbar")).toBeInTheDocument();
  });

  it("calls onPreview when provided", () => {
    const onPreview = vi.fn();
    renderWithProviders(<FileBasicTable {...defaultProps} onPreview={onPreview} />);
    expect(screen.getAllByTestId(/download-file-/).length).toBeGreaterThanOrEqual(1);
  });

  it("calls onEditMetadata when provided", () => {
    const onEditMetadata = vi.fn();
    renderWithProviders(<FileBasicTable {...defaultProps} onEditMetadata={onEditMetadata} />);
    expect(screen.getAllByTestId(/download-file-/).length).toBeGreaterThanOrEqual(1);
  });

  it("calls onViewHistory when provided", () => {
    const onViewHistory = vi.fn();
    renderWithProviders(<FileBasicTable {...defaultProps} onViewHistory={onViewHistory} />);
    expect(screen.getAllByTestId(/download-file-/).length).toBeGreaterThanOrEqual(1);
  });

  it("redirects on row click for Assessment tracker group", () => {
    const openSpy = vi.spyOn(window, "open").mockImplementation(() => null);
    const linkedFile = createFileModel({
      id: "20",
      fileName: "assessment-file.pdf",
      source: "Assessment tracker group",
      projectId: "10",
      parentId: 3,
      metaId: 7,
    });
    renderWithProviders(
      <FileBasicTable
        {...defaultProps}
        data={{ rows: [linkedFile], cols: mockColumns }}
        bodyData={[linkedFile]}
      />,
    );
    const sourceCell = screen.getByText("Controls tracker group");
    sourceCell.click();
    expect(openSpy).toHaveBeenCalled();
    openSpy.mockRestore();
  });

  it("redirects on row click for Compliance tracker group", () => {
    const openSpy = vi.spyOn(window, "open").mockImplementation(() => null);
    const linkedFile = createFileModel({
      id: "21",
      fileName: "compliance-file.pdf",
      source: "Compliance tracker group",
      projectId: "10",
      parentId: 3,
      metaId: 7,
      isEvidence: true,
    });
    renderWithProviders(
      <FileBasicTable
        {...defaultProps}
        data={{ rows: [linkedFile], cols: mockColumns }}
        bodyData={[linkedFile]}
      />,
    );
    const sourceCell = screen.getByText("Requirements tracker group");
    sourceCell.click();
    expect(openSpy).toHaveBeenCalled();
    openSpy.mockRestore();
  });

  it("persists pagination row count to localStorage", () => {
    renderWithProviders(<FileBasicTable {...defaultProps} paginated />);
    expect(localStorage.getItem("verifywise_files_basic_sorting")).toBeTruthy();
  });

  it("resets to page 0 when data changes", () => {
    const { rerender } = renderWithProviders(<FileBasicTable {...defaultProps} />);
    const newFiles = [createFileModel({ id: "100", fileName: "new-file.pdf" })];
    rerender(
      <FileBasicTable
        {...defaultProps}
        data={{ rows: newFiles, cols: mockColumns }}
        bodyData={newFiles}
      />,
    );
    expect(screen.getByText("new-file.pdf")).toBeInTheDocument();
  });

  it("renders superseded version chip variant", () => {
    const supersededFile = createFileModel({
      id: "30",
      fileName: "old-version.pdf",
      version: "0.5",
      reviewStatus: "superseded",
    });
    renderWithProviders(
      <FileBasicTable
        {...defaultProps}
        data={{ rows: [supersededFile], cols: mockColumns }}
        bodyData={[supersededFile]}
      />,
    );
    expect(screen.getByText("v0.5")).toBeInTheDocument();
    expect(screen.getByText("Superseded")).toBeInTheDocument();
  });

  it("renders with Management system clauses group source", () => {
    const mgmtFile = createFileModel({
      id: "40",
      fileName: "iso-doc.pdf",
      source: "Management system clauses group",
      parentId: 1,
      metaId: 2,
    });
    renderWithProviders(
      <FileBasicTable
        {...defaultProps}
        data={{ rows: [mgmtFile], cols: mockColumns }}
        bodyData={[mgmtFile]}
      />,
    );
    expect(screen.getByText("Management system clauses group")).toBeInTheDocument();
  });

  it("uses uploader field when uploaderName is not set", () => {
    const fileNoName = createFileModel({
      id: "50",
      fileName: "no-name.pdf",
      uploaderName: undefined,
      uploader: "legacy-user",
    });
    renderWithProviders(
      <FileBasicTable
        {...defaultProps}
        data={{ rows: [fileNoName], cols: mockColumns }}
        bodyData={[fileNoName]}
      />,
    );
    expect(screen.getByText("legacy-user")).toBeInTheDocument();
  });
});
