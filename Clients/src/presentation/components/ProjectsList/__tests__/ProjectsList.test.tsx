import { vi } from "vitest";

vi.mock("../../Cards/ProjectCard", () => ({
  ProjectCard: () => <div data-testid="project-card" />,
}));
vi.mock("../ProjectTableView", () => ({
  default: () => <div data-testid="project-table-view" />,
}));
vi.mock("../../NoProject/NoProject", () => ({
  default: () => <div data-testid="no-project" />,
}));
vi.mock("../../ViewToggle", () => ({
  default: () => <div data-testid="view-toggle" />,
}));
vi.mock("../../../hooks/usePersistedViewMode", () => ({
  usePersistedViewMode: () => ["table", vi.fn()],
}));
vi.mock("../../../../application/repository/user.repository", () => ({
  getAllUsers: vi.fn().mockResolvedValue({ data: [] }),
}));
vi.mock("../../Search", () => ({
  SearchBox: () => <div data-testid="search-box" />,
}));
vi.mock("../../Table/GroupBy", () => ({
  GroupBy: () => <div data-testid="group-by" />,
}));
vi.mock("../../../../application/hooks/useTableGrouping", () => ({
  useTableGrouping: () => ({ groups: new Map() }),
  useGroupByState: () => ({
    groupBy: null,
    groupSortOrder: "asc",
    handleGroupChange: vi.fn(),
  }),
}));
vi.mock("../../Table/GroupedTableView", () => ({
  GroupedTableView: () => <div data-testid="grouped-table-view" />,
}));
vi.mock("../../Table/ExportMenu", () => ({
  ExportMenu: () => <div data-testid="export-menu" />,
}));
vi.mock("../../Table/FilterBy", () => ({
  FilterBy: () => <div data-testid="filter-by" />,
}));
vi.mock("../../../../application/hooks/useFilterBy", () => ({
  useFilterBy: () => ({
    filterValues: {},
    handleFilterChange: vi.fn(),
    filterData: (items: any[]) => items,
  }),
}));
vi.mock("../../Table/ColumnSelector", () => ({
  ColumnSelector: () => <div data-testid="column-selector" />,
}));
vi.mock("../../../../application/hooks/useColumnVisibility", () => ({
  useColumnVisibility: () => ({
    visibleColumns: new Set(["name", "status"]),
    toggleColumn: vi.fn(),
    isColumnVisible: () => true,
  }),
}));

import { renderWithProviders } from "../../../../test/renderWithProviders";
import ProjectList from "../ProjectsList";

describe("ProjectsList", () => {
  it("renders without crashing with empty projects", () => {
    renderWithProviders(<ProjectList projects={[]} />);
    expect(document.body).toBeTruthy();
  });
});
