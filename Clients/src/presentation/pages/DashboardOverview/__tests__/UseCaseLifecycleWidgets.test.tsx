import { screen, fireEvent } from "@testing-library/react";
import { renderWithProviders } from "../../../../test/renderWithProviders";
import UseCaseLifecycleWidgets from "../UseCaseLifecycleWidgets";

const mockNavigateSearch = vi.fn();
vi.mock("../../../../application/hooks/useNavigateSearch", () => ({
  default: () => mockNavigateSearch,
}));

const mockGetDashboard = vi.fn();
vi.mock("../../../../application/repository/useCaseLifecycle.repository", () => ({
  getUseCaseLifecycleDashboard: (...args: unknown[]) => mockGetDashboard(...args),
}));

vi.mock("../../../../application/hooks/useDashboard", () => ({
  useDashboard: () => ({
    dashboard: {
      projects_list: [
        { id: 1, lifecycle_stage: "planned" },
        { id: 2, lifecycle_stage: "planned" },
        { id: 3, lifecycle_stage: "live" },
        { id: 4, lifecycle_stage: "planned", is_organizational: true },
      ],
    },
  }),
}));

const dashboard = (overrides: Record<string, unknown> = {}) => ({
  quarter: {
    start: "2026-10-01",
    end: "2026-12-31",
    going_live: [{ id: 11, title: "Chatbot", stage: "live", date: "2026-10-05" }],
    retired: [],
  },
  live_by: {
    department: [
      { label: "Finance", count: 2 },
      { label: "", count: 1 },
    ],
    risk_tier: [{ label: "high risk", count: 3 }],
    regulation: [],
  },
  stale: { total: 1, items: [{ id: 12, title: "Scoring", stage: "live", date: "2026-05-01" }] },
  confirmation_interval_days: 90,
  ...overrides,
});

describe("UseCaseLifecycleWidgets", () => {
  beforeEach(() => vi.clearAllMocks());

  it("shows stage counts and opens the matching tab", async () => {
    mockGetDashboard.mockResolvedValue(dashboard());
    renderWithProviders(<UseCaseLifecycleWidgets />);

    expect(await screen.findByText("Use case lifecycle")).toBeInTheDocument();
    // Counted from the use cases list, organizational projects excluded.
    const plannedRow = screen.getByText("Planned").closest('[role="listitem"]') as HTMLElement;
    expect(plannedRow.textContent).toContain("2");
    fireEvent.click(screen.getByText("Planned"));
    expect(mockNavigateSearch).toHaveBeenCalledWith("/overview", { stage: "planned" });
  });

  it("breaks live use cases down by department, risk tier and regulation", async () => {
    mockGetDashboard.mockResolvedValue(dashboard());
    renderWithProviders(<UseCaseLifecycleWidgets />);

    expect(await screen.findByText("Finance")).toBeInTheDocument();
    expect(screen.getByText("No department")).toBeInTheDocument();

    fireEvent.click(screen.getByText("Risk tier"));
    expect(screen.getByText("High risk")).toBeInTheDocument();

    fireEvent.click(screen.getByText("Regulation"));
    expect(screen.getByText("No live use cases have a framework yet")).toBeInTheDocument();
  });

  it("lists this quarter's go-lives and the stale entries", async () => {
    mockGetDashboard.mockResolvedValue(dashboard());
    renderWithProviders(<UseCaseLifecycleWidgets />);

    expect(await screen.findByText("Chatbot")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Scoring"));
    expect(mockNavigateSearch).toHaveBeenCalledWith("/project-view", { projectId: "12" });
  });

  it("shows the empty states when nothing is stale or changed this quarter", async () => {
    mockGetDashboard.mockResolvedValue(
      dashboard({
        quarter: { start: "2026-10-01", end: "2026-12-31", going_live: [], retired: [] },
        stale: { total: 0, items: [] },
      }),
    );
    renderWithProviders(<UseCaseLifecycleWidgets />);

    expect(
      await screen.findByText("Nothing went live or was retired this quarter"),
    ).toBeInTheDocument();
    expect(screen.getByText("Every live use case was confirmed recently")).toBeInTheDocument();
  });
});
