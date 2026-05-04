import { renderWithProviders } from "../../../../test/renderWithProviders";

// Mock hooks
vi.mock("../../../../application/hooks/useMultipleOnScreen", () => ({
  default: () => ({
    refs: [{ current: null }, { current: null }, { current: null }],
    allVisible: false,
  }),
}));

// Mock repositories
vi.mock("../../../../application/repository/entity.repository", () => ({
  getEntityById: vi.fn().mockResolvedValue([]),
}));

vi.mock("../../../../application/repository/control_eu_act.repository", () => ({
  getComplianceProgress: vi.fn().mockResolvedValue({
    data: { allDonesubControls: 5, allsubControls: 10 },
  }),
  getControlsByControlCategoryId: vi.fn().mockResolvedValue([]),
}));

// Mock child components
vi.mock("../../../components/Cards/StatsCard", () => ({
  StatsCard: () => <div data-testid="stats-card" />,
}));

vi.mock("../../../components/Skeletons", () => ({
  default: () => <div data-testid="skeleton" />,
}));

vi.mock("../1.0ComplianceTracker/ControlCategory", () => ({
  default: () => <div data-testid="control-category" />,
}));

vi.mock("../../../components/PageTour", () => ({
  default: () => null,
}));

vi.mock("../1.0ComplianceTracker/ComplianceSteps", () => ({
  default: [],
}));

import ComplianceTracker from "../1.0ComplianceTracker/index";

const mockProject = {
  id: 1,
  project_title: "Test Project",
  framework: [{ framework_id: 1, project_framework_id: 100 }],
};

describe("ComplianceTracker", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders without crashing", () => {
    const { container } = renderWithProviders(<ComplianceTracker project={mockProject as any} />);
    expect(container).toBeTruthy();
  });
});
