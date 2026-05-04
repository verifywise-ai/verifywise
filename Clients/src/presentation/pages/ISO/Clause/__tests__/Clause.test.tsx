import { renderWithProviders } from "../../../../../test/renderWithProviders";
import ISO42001Clauses from "../index";

// Mock repositories
vi.mock("../../../../../application/repository/clause_struct_iso.repository", () => ({
  GetClausesByProjectFrameworkId: vi.fn().mockResolvedValue([]),
}));

vi.mock("../../../../../application/repository/subClause_iso.repository", () => ({
  GetSubClausesById: vi.fn().mockResolvedValue({ data: [] }),
}));

vi.mock("../../../../../application/repository/entity.repository", () => ({
  getEntityById: vi.fn().mockResolvedValue({ data: {} }),
}));

// Mock the drawer dialog
vi.mock("../../../../components/Drawer/ClauseDrawerDialog", () => ({
  default: () => <div>ClauseDrawerDialog</div>,
}));

describe("ISO42001Clauses Page", () => {
  const mockProject = {
    id: 1,
    project_title: "Test Project",
    owner: 1,
    members: [],
    start_date: new Date("2024-01-01"),
    ai_risk_classification: "high risk" as const,
    type_of_high_risk_role: "provider" as const,
    goal: "Test goal",
    last_updated: new Date("2024-01-01"),
    last_updated_by: 1,
    framework: [],
    monitored_regulations_and_standards: [],
  };

  it("renders without crashing", () => {
    const { container } = renderWithProviders(
      <ISO42001Clauses project={mockProject} framework_id={1} projectFrameworkId={1} />,
      { route: "/iso" },
    );

    expect(container).toBeTruthy();
  });
});
