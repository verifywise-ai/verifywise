/**
 * FileManager — network-backed smoke test.
 *
 * The sibling FileManager.test.tsx mocks every hook including the file
 * repository, so it never exercises the network. This file leaves the file
 * data path real and drives loading / loaded / error through MSW instead.
 *
 * Only the ancillary hooks (virtual folders, folder files, column visibility)
 * and the heavier presentational children are stubbed — everything from
 * useFiles down to the HTTP request runs for real.
 */

import { screen, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { renderWithProviders } from "../../../../test/renderWithProviders";
import { server } from "../../../../test/mocks/server";
import { mockFiles } from "../../../../test/mocks/data/files";

vi.mock("../../../../application/hooks/useAuth", () => ({
  useAuth: () => ({
    userToken: { name: "Test User" },
    userId: 1,
    userRoleName: "Admin",
  }),
}));

vi.mock("../../../../application/hooks/useMultipleOnScreen", () => ({
  default: () => ({ refs: [{ current: null }], allVisible: false }),
}));

vi.mock("../../../../application/hooks/useVirtualFolders", () => ({
  useVirtualFolders: () => ({
    folderTree: [],
    selectedFolder: "all",
    breadcrumb: [],
    loading: false,
    loadingBreadcrumb: false,
    setSelectedFolder: vi.fn(),
    refreshFolders: vi.fn(),
    handleCreateFolder: vi.fn(),
    handleUpdateFolder: vi.fn(),
    handleDeleteFolder: vi.fn(),
  }),
}));

vi.mock("../../../../application/hooks/useFolderFiles", () => ({
  useFolderFiles: () => ({
    files: [],
    loading: false,
    refreshFiles: vi.fn(),
    getFileCurrentFolders: vi.fn().mockResolvedValue([]),
    handleUpdateFileFolders: vi.fn(),
  }),
}));

vi.mock("../../../../application/hooks/useFileColumnVisibility", () => ({
  useFileColumnVisibility: () => ({
    visibleColumns: new Set<string>(),
    availableColumns: [],
    toggleColumn: vi.fn(),
    resetToDefaults: vi.fn(),
    getTableColumns: () => [],
    visibleColumnKeys: new Set<string>(),
  }),
}));

vi.mock("../../../../application/hooks/useTableGrouping", () => ({
  useTableGrouping: () => [],
  useGroupByState: () => ({
    groupBy: null,
    groupSortOrder: "asc",
    handleGroupChange: vi.fn(),
  }),
}));

vi.mock("../../../../application/hooks/useFilterBy", () => ({
  useFilterBy: () => ({
    filterData: (data: unknown[]) => data,
    handleFilterChange: vi.fn(),
  }),
}));

vi.mock("../../../../application/events/fileEvents", () => ({
  onFileApprovalChanged: () => () => {},
}));

vi.mock("../../../components/Layout/PageHeaderExtended", () => ({
  PageHeaderExtended: ({ children, title }: any) => (
    <div data-testid="page-header-extended">
      <span>{title}</span>
      {children}
    </div>
  ),
}));

vi.mock("../../../components/PageTour", () => ({ default: () => null }));

// Rendered with the rows it receives, so the assertion follows real data from
// the HTTP response through useFiles and transformFilesData into the table.
vi.mock("../../../components/Table/GroupedTableView", () => ({
  GroupedTableView: ({ ungroupedData }: any) => (
    <div data-testid="grouped-table-view">
      {(ungroupedData ?? []).map((file: any) => (
        <span key={file.id}>{file.fileName}</span>
      ))}
    </div>
  ),
}));

vi.mock("../../../components/Modals/FileManagerUpload", () => ({ default: () => null }));
vi.mock("../../../components/Dialogs/ConfirmationModal", () => ({ default: () => null }));
vi.mock("../components/FolderTree", () => ({ default: () => null }));
vi.mock("../components/FolderBreadcrumb", () => ({ default: () => null }));
vi.mock("../components/CreateFolderModal", () => ({ default: () => null }));
vi.mock("../components/AssignToFolderModal", () => ({ default: () => null }));
vi.mock("../components/ColumnSelector", () => ({ ColumnSelector: () => null }));
vi.mock("../components/FilePreviewPanel", () => ({ FilePreviewPanel: () => null }));
vi.mock("../components/FileMetadataEditor", () => ({ FileMetadataEditor: () => null }));
vi.mock("../components/FileVersionHistoryDrawer", () => ({
  FileVersionHistoryDrawer: () => null,
}));

import FileManager from "../index";

describe("FileManager (network-backed)", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shows a loading skeleton before the request resolves", () => {
    const { container } = renderWithProviders(<FileManager />);

    expect(container.querySelector(".MuiSkeleton-root")).toBeTruthy();
  });

  it("renders the files returned by the API once loaded", async () => {
    renderWithProviders(<FileManager />);

    expect(await screen.findByText(mockFiles[0].filename)).toBeInTheDocument();
    expect(screen.getByText(mockFiles[1].filename)).toBeInTheDocument();
    expect(document.querySelector(".MuiSkeleton-root")).toBeFalsy();
  });

  it("surfaces an error state when the request fails", async () => {
    // The page reads files from /file-manager/with-metadata (via useFiles);
    // failing that one endpoint is what drives the error branch.
    server.use(http.get("/api/file-manager/with-metadata", () => HttpResponse.error()));

    renderWithProviders(<FileManager />);

    expect(await screen.findByText("Unable to load files")).toBeInTheDocument();
    expect(screen.getByText("Try again")).toBeInTheDocument();
    expect(screen.queryByText(mockFiles[0].filename)).not.toBeInTheDocument();
  });

  it("surfaces an error state when the API returns a 500", async () => {
    server.use(
      http.get("/api/file-manager/with-metadata", () =>
        HttpResponse.json({ message: "Internal server error" }, { status: 500 }),
      ),
    );

    renderWithProviders(<FileManager />);

    await waitFor(() => {
      expect(screen.getByText("Unable to load files")).toBeInTheDocument();
    });
  });

  it("renders an empty table rather than an error when the org has no files", async () => {
    server.use(
      http.get("/api/file-manager/with-metadata", () =>
        HttpResponse.json({
          data: { files: [], pagination: { total: 0, page: 1, pageSize: 20, totalPages: 1 } },
        }),
      ),
    );

    renderWithProviders(<FileManager />);

    await waitFor(() => {
      expect(document.querySelector(".MuiSkeleton-root")).toBeFalsy();
    });
    expect(screen.getByTestId("grouped-table-view")).toBeEmptyDOMElement();
    expect(screen.queryByText("Unable to load files")).not.toBeInTheDocument();
  });
});
