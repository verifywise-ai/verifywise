import { renderWithProviders } from "../../../../test/renderWithProviders";

// Mock repositories
vi.mock("../../../../application/repository/automations.repository", () => ({
  getAllAutomations: vi.fn().mockResolvedValue([]),
  getAutomation: vi.fn().mockResolvedValue({ actions: [] }),
  createAutomation: vi.fn().mockResolvedValue({ id: 1 }),
  updateAutomation: vi.fn().mockResolvedValue({}),
  deleteAutomation: vi.fn().mockResolvedValue({}),
  getTriggers: vi.fn().mockResolvedValue([]),
  getActionsByTriggerId: vi.fn().mockResolvedValue([]),
}));

vi.mock("../../../../application/repository/user.repository", () => ({
  getAllUsers: vi.fn().mockResolvedValue({ data: [] }),
}));

// Mock hooks
vi.mock("../../../../application/hooks/useProjects", () => ({
  useProjects: () => ({
    data: [],
  }),
}));

// Mock utils
vi.mock("../../../../application/utils/generateId", () => ({
  generateId: () => "test-id-123",
}));

// Mock data
vi.mock("../data/mockData", () => ({
  mockTriggerTemplates: [],
  mockActionTemplates: [],
}));

// Mock child components
vi.mock("../components/AutomationList", () => ({
  default: () => <div data-testid="automation-list" />,
}));

vi.mock("../components/AutomationBuilder", () => ({
  default: () => <div data-testid="automation-builder" />,
}));

vi.mock("../components/ConfigurationPanel", () => ({
  default: () => <div data-testid="configuration-panel" />,
}));

vi.mock("../../../components/Alert", () => ({
  default: () => <div data-testid="alert" />,
}));

vi.mock("../../../components/breadcrumbs/PageBreadcrumbs", () => ({
  PageBreadcrumbs: () => <div data-testid="breadcrumbs" />,
}));

import AutomationsPage from "../index";

describe("AutomationsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders without crashing", () => {
    const { container } = renderWithProviders(<AutomationsPage />);
    expect(container).toBeTruthy();
  });
});
