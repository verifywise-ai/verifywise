import { renderWithProviders } from "../../../../test/renderWithProviders";

// Mock hooks
vi.mock("../../../../application/hooks/useAuth", () => ({
  useAuth: () => ({
    userToken: { name: "Test User" },
    userId: 1,
    userRoleName: "Admin",
  }),
}));

vi.mock("../../../../application/hooks/useMultipleOnScreen", () => ({
  default: () => ({
    refs: [{ current: null }],
    allVisible: false,
  }),
}));

vi.mock("../../../../application/hooks/useUserFilesMetaData", () => ({
  useUserFilesMetaData: () => ({
    filesData: [],
    loading: false,
    error: null,
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

// Mock repositories
vi.mock("../../../../application/repository/file.repository", () => ({
  getUserFilesMetaData: vi.fn().mockResolvedValue([]),
  getFilesWithMetadata: vi.fn().mockResolvedValue({ files: [] }),
  getFileMetadata: vi.fn().mockResolvedValue({}),
  updateFileMetadata: vi.fn().mockResolvedValue({}),
}));

vi.mock("../../../../application/repository/virtualFolder.repository", () => ({
  assignFilesToFolder: vi.fn().mockResolvedValue({}),
}));

// Mock utils
vi.mock("../../../../application/utils/fileTransform.utils", () => ({
  transformFilesData: (data: unknown[]) => data,
}));

vi.mock("../../../../application/utils/secureLogger.utils", () => ({
  secureLogError: vi.fn(),
}));

// Mock events
vi.mock("../../../../application/events/fileEvents", () => ({
  onFileApprovalChanged: () => () => {},
}));

// Mock child components
vi.mock("../../../components/Layout/PageHeaderExtended", () => ({
  PageHeaderExtended: ({ children, title }: any) => (
    <div data-testid="page-header-extended">
      <span>{title}</span>
      {children}
    </div>
  ),
}));

vi.mock("../../../components/PageTour", () => ({
  default: () => null,
}));

vi.mock("../../../components/Skeletons", () => ({
  default: (props: any) => <div data-testid="skeleton" {...props} />,
}));

vi.mock("../../../components/Table/FileTable/FileTable", () => ({
  default: () => <div data-testid="file-table" />,
}));

vi.mock("../../../components/Modals/FileManagerUpload", () => ({
  default: () => <div data-testid="file-upload-modal" />,
}));

vi.mock("../../../components/Alert", () => ({
  default: () => <div data-testid="alert" />,
}));

vi.mock("../../../components/Dialogs/ConfirmationModal", () => ({
  default: () => <div data-testid="confirmation-modal" />,
}));

vi.mock("../../../components/Search", () => ({
  SearchBox: () => <div data-testid="search-box" />,
}));

vi.mock("../../../components/Table/GroupBy", () => ({
  GroupBy: () => <div data-testid="group-by" />,
}));

vi.mock("../../../components/Table/FilterBy", () => ({
  FilterBy: () => <div data-testid="filter-by" />,
  FilterColumn: {},
}));

vi.mock("../../../components/Table/GroupedTableView", () => ({
  GroupedTableView: () => <div data-testid="grouped-table-view" />,
}));

vi.mock("../../../components/button/customizable-button", () => ({
  CustomizableButton: () => <div data-testid="customizable-button" />,
}));

vi.mock("../components/FolderTree", () => ({
  default: () => <div data-testid="folder-tree" />,
}));

vi.mock("../components/FolderBreadcrumb", () => ({
  default: () => <div data-testid="folder-breadcrumb" />,
}));

vi.mock("../components/CreateFolderModal", () => ({
  default: () => <div data-testid="create-folder-modal" />,
}));

vi.mock("../components/AssignToFolderModal", () => ({
  default: () => <div data-testid="assign-to-folder-modal" />,
}));

vi.mock("../components/ColumnSelector", () => ({
  ColumnSelector: () => <div data-testid="column-selector" />,
}));

vi.mock("../components/FilePreviewPanel", () => ({
  FilePreviewPanel: () => <div data-testid="file-preview-panel" />,
}));

vi.mock("../components/FileMetadataEditor", () => ({
  FileMetadataEditor: () => <div data-testid="file-metadata-editor" />,
}));

vi.mock("../components/FileVersionHistoryDrawer", () => ({
  FileVersionHistoryDrawer: () => <div data-testid="file-version-history-drawer" />,
}));

import FileManager from "../index";

describe("FileManager", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders without crashing", () => {
    const { container } = renderWithProviders(<FileManager />);
    expect(container).toBeTruthy();
  });
});
