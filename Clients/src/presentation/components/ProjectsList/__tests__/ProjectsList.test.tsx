import { vi } from "vitest";

const { useTableGroupingMock } = vi.hoisted(() => ({
  useTableGroupingMock: vi.fn(() => ({ groups: new Map() })),
}));

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
  useTableGrouping: useTableGroupingMock,
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
import ProjectList, { RISK_LEVEL_FILTER_OPTIONS } from "../ProjectsList";
import { AiRiskClassification } from "../../../../domain/enums/aiRiskClassification.enum";

describe("ProjectsList", () => {
  it("renders without crashing with empty projects", () => {
    renderWithProviders(<ProjectList projects={[]} />);
    expect(document.body).toBeTruthy();
  });

  it("groups a use case under each of its high-risk roles", () => {
    renderWithProviders(<ProjectList projects={[]} />);
    const options = (useTableGroupingMock.mock.calls as any[][])[0][0];
    const key = (roles: string[]) => options.getGroupKey({ high_risk_roles: roles }, "role");
    expect(key(["Provider", "Deployer"])).toEqual(["Provider", "Deployer"]);
    expect(key(["Deployer"])).toEqual(["Deployer"]);
    expect(key([])).toBe("Unknown");
  });

  it("offers every AI risk classification in the risk level filter", () => {
    const values = RISK_LEVEL_FILTER_OPTIONS.map((o) => o.value).sort();
    expect(values).toEqual(Object.values(AiRiskClassification).sort());
  });
});
