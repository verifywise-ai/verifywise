import { screen } from "@testing-library/react";
import { renderWithProviders } from "../../../../test/renderWithProviders";
import { IAdvisorToolsRoadmap } from "../../../../domain/interfaces/i.advisorRoadmap";

const mockRoadmap: IAdvisorToolsRoadmap = {
  version: 1,
  generatedAt: "2026-08-31T00:00:00.000Z",
  sources: {
    plan: "AI Implementation Plan.md",
    catalog: "tool_list_.md",
    plannedTotal: 263,
    manifestEntries: 265,
  },
  summary: {
    planned: 265,
    implemented: 200,
    renamed: 1,
    missing: 64,
    extraImplemented: 2,
    percentComplete: 76,
  },
  domains: [
    {
      key: "risk",
      label: "Risk",
      category: "existing",
      total: 11,
      implemented: 10,
      percentComplete: 91,
    },
    { key: "notes", label: "Notes", category: "B", total: 7, implemented: 4, percentComplete: 57 },
  ],
  phases: [
    {
      id: 0,
      title: "Existing baseline (pre-plan)",
      priority: "—",
      dependencies: "—",
      total: 47,
      implemented: 46,
      percentComplete: 98,
    },
    {
      id: 1,
      title: "Write Tools",
      priority: "High",
      dependencies: "—",
      total: 218,
      implemented: 155,
      percentComplete: 71,
    },
    {
      id: 2,
      title: "Approval Gateway",
      priority: "High",
      dependencies: "Phase 1",
      total: 0,
      implemented: 0,
      percentComplete: null,
    },
  ],
  tools: [
    {
      id: 1,
      name: "fetch_risks",
      label: "Fetch risks",
      description: "",
      domain: "Risk",
      category: "existing",
      phase: 0,
      kind: "read",
      status: "implemented",
    },
    {
      id: 48,
      name: "agent_create_risk",
      label: "Create risk",
      description: "Create new risk",
      domain: "Risk",
      category: "A",
      phase: 1,
      kind: "write",
      status: "implemented",
    },
    {
      id: 195,
      name: "agent_update_finding_governance",
      label: "Update finding governance",
      description: "Update finding governance status",
      domain: "AI Detection",
      category: "C",
      phase: 1,
      kind: "write",
      status: "renamed",
      implementedAs: "agent_update_finding_governance_status",
    },
    {
      id: 200,
      name: "agent_create_note",
      label: "Create note",
      description: "Create note",
      domain: "Notes",
      category: "C",
      phase: 1,
      kind: "write",
      status: "planned",
    },
  ],
  extraTools: [{ name: "list_projects", status: "unplanned_implemented" }],
};

const hookReturn = {
  data: mockRoadmap,
  isLoading: false,
  error: null,
};

vi.mock("../../../../application/hooks/useAdvisorToolsRoadmap", () => ({
  useAdvisorToolsRoadmap: vi.fn(() => hookReturn),
}));

// PageHeaderExtended pulls in breadcrumbs/user-guide context; stub it.
vi.mock("../../../components/Layout/PageHeaderExtended", () => ({
  PageHeaderExtended: ({ children, title, summaryCards }: any) => (
    <div data-testid="page-header">
      <h1>{title}</h1>
      {summaryCards}
      {children}
    </div>
  ),
}));

import AIAdvisorRoadmap from "../index";
import { useAdvisorToolsRoadmap } from "../../../../application/hooks/useAdvisorToolsRoadmap";
import userEvent from "@testing-library/user-event";

const mockedHook = vi.mocked(useAdvisorToolsRoadmap);

describe("AIAdvisorRoadmap page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedHook.mockReturnValue(hookReturn as any);
  });

  it("renders summary cards and progress sections", () => {
    renderWithProviders(<AIAdvisorRoadmap />, { route: "/advisor-roadmap" });

    expect(screen.getByText("AI Advisor roadmap")).toBeInTheDocument();
    expect(screen.getByText("Planned tools")).toBeInTheDocument();
    expect(screen.getByText("Overall progress")).toBeInTheDocument();
    expect(screen.getByText("76%")).toBeInTheDocument();
    expect(screen.getByText("Progress by domain")).toBeInTheDocument();
    expect(screen.getByText("Progress by phase")).toBeInTheDocument();
    // Capability phases without tools are shown as informational rows.
    expect(screen.getByText(/Capability phase — no catalogued tools/)).toBeInTheDocument();
  });

  it("renders tool cards with status badges", () => {
    renderWithProviders(<AIAdvisorRoadmap />, { route: "/advisor-roadmap" });

    expect(screen.getByText("fetch_risks")).toBeInTheDocument();
    expect(screen.getByText("agent_create_risk")).toBeInTheDocument();
    expect(screen.getAllByText("Implemented").length).toBeGreaterThan(0);
    expect(screen.getByText("Planned")).toBeInTheDocument();
    expect(screen.getAllByText("Renamed").length).toBeGreaterThan(0);
    expect(
      screen.getByText("Implemented as agent_update_finding_governance_status"),
    ).toBeInTheDocument();
    // Read/write kind badges
    expect(screen.getAllByText("Write").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Read").length).toBeGreaterThan(0);
  });

  it("lists implemented-but-unplanned tools as names only", () => {
    renderWithProviders(<AIAdvisorRoadmap />, { route: "/advisor-roadmap" });

    expect(screen.getByText(/Implemented but not in the plan/)).toBeInTheDocument();
    expect(screen.getByText("list_projects")).toBeInTheDocument();
  });

  it("filters tools by search term", async () => {
    const user = userEvent.setup();
    renderWithProviders(<AIAdvisorRoadmap />, { route: "/advisor-roadmap" });

    await user.type(screen.getByPlaceholderText("Search tools"), "note");

    expect(screen.queryByText("fetch_risks")).not.toBeInTheDocument();
    expect(screen.getByText("agent_create_note")).toBeInTheDocument();
  });

  it("shows an empty state when filters match nothing", async () => {
    const user = userEvent.setup();
    renderWithProviders(<AIAdvisorRoadmap />, { route: "/advisor-roadmap" });

    await user.type(screen.getByPlaceholderText("Search tools"), "no such tool exists");

    expect(screen.getByText("No tools match your search or filter criteria.")).toBeInTheDocument();
  });

  it("shows a skeleton while loading", () => {
    mockedHook.mockReturnValue({ data: undefined, isLoading: true, error: null } as any);
    renderWithProviders(<AIAdvisorRoadmap />, { route: "/advisor-roadmap" });

    expect(screen.queryByText("Progress by domain")).not.toBeInTheDocument();
  });

  it("shows an error empty state when the request fails", () => {
    mockedHook.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: new Error("boom"),
    } as any);
    renderWithProviders(<AIAdvisorRoadmap />, { route: "/advisor-roadmap" });

    expect(
      screen.getByText("Failed to load the advisor tools roadmap. Please try again."),
    ).toBeInTheDocument();
  });
});
