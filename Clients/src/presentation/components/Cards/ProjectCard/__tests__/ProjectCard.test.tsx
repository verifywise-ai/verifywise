import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "../../../../../test/renderWithProviders";
import { ProjectCard } from "../index";
import { buildProject } from "../../../../../test/factories/project.factory";

const { mockNavigate, mockFetchData } = vi.hoisted(() => ({
  mockNavigate: vi.fn(),
  mockFetchData: vi.fn(),
}));

vi.mock("lucide-react", () => ({
  ArrowUpRight: ({ size }: { size?: number }) => (
    <svg data-testid="icon-arrow-up-right" data-size={size} />
  ),
  Eye: ({ size }: { size?: number }) => <svg data-testid="icon-eye" data-size={size} />,
  ExternalLink: ({ size }: { size?: number }) => (
    <svg data-testid="icon-external-link" data-size={size} />
  ),
}));

vi.mock("../../../button/customizable-button", () => ({
  CustomizableButton: ({ children, onClick, startIcon, endIcon, ...props }: any) => (
    <button onClick={onClick} data-testid="customizable-button" {...props}>
      {startIcon}
      {children}
      {endIcon}
    </button>
  ),
}));

vi.mock("../../../ViewRelationshipsButton", () => ({
  default: ({ entityId, entityType, entityLabel }: any) => (
    <div data-testid="view-relationships-button">
      {entityType}-{entityId}-{entityLabel}
    </div>
  ),
}));

vi.mock("../../../ProjectCard/ProgressBar", () => ({
  default: ({ progress }: { progress: string }) => <div data-testid="progress-bar">{progress}</div>,
}));

vi.mock("../../../../../application/hooks/useNavigateSearch", () => ({
  default: () => mockNavigate,
}));

vi.mock("../../../../../application/hooks/useUsers", () => ({
  default: () => ({
    users: [
      { id: 1, name: "John", surname: "Doe" },
      { id: 2, name: "Jane", surname: "Smith" },
    ],
  }),
}));

vi.mock("../../../../../application/hooks/fetchDataHook", () => ({
  fetchData: mockFetchData,
}));

vi.mock("../../../../tools/isoDateToString", () => ({
  displayFormattedDate: () => "15-01-2025",
}));

function setupFetchDataMocks() {
  mockFetchData.mockImplementation((_url: string, setter: (data: any) => void) => {
    setter({
      allDonesubControls: 5,
      allsubControls: 10,
      answeredQuestions: 3,
      totalQuestions: 8,
      doneSubclauses: 2,
      totalSubclauses: 7,
      doneAnnexcategories: 4,
      totalAnnexcategories: 9,
    });
    return Promise.resolve();
  });
}

describe("ProjectCard", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("renders loading skeleton when isLoading is true", () => {
    renderWithProviders(<ProjectCard project={buildProject()} isLoading />);

    expect(screen.getAllByText("Loading...").length).toBeGreaterThanOrEqual(1);
  });

  it("renders project title with uc_id prefix", () => {
    renderWithProviders(<ProjectCard project={buildProject()} />);

    expect(screen.getByText("UC-001: AI Governance Platform")).toBeInTheDocument();
  });

  it("renders project title without uc_id prefix when uc_id is missing", () => {
    renderWithProviders(<ProjectCard project={buildProject({ uc_id: undefined })} />);

    expect(screen.getByText("AI Governance Platform")).toBeInTheDocument();
    expect(screen.queryByText("UC-001:")).not.toBeInTheDocument();
  });

  it("renders article role with correct aria-label", () => {
    renderWithProviders(<ProjectCard project={buildProject()} />);

    const article = screen.getByRole("article");
    expect(article).toHaveAttribute("aria-label", "Project card for AI Governance Platform");
  });

  it("shows owner name from users list", () => {
    renderWithProviders(<ProjectCard project={buildProject({ owner: 2 })} />);

    expect(screen.getByText("Jane Smith")).toBeInTheDocument();
  });

  it("shows Unknown User when owner not found", () => {
    renderWithProviders(<ProjectCard project={buildProject({ owner: 999 })} />);

    expect(screen.getByText("Unknown User")).toBeInTheDocument();
  });

  it("shows formatted last updated date", () => {
    renderWithProviders(<ProjectCard project={buildProject()} />);

    expect(screen.getByText("15-01-2025")).toBeInTheDocument();
  });

  it("renders both framework buttons when both framework IDs present", () => {
    renderWithProviders(<ProjectCard project={buildProject()} />);

    expect(screen.getByText("EU AI Act")).toBeInTheDocument();
    expect(screen.getByText("ISO 42001")).toBeInTheDocument();
  });

  it("renders only EU AI Act framework when only framework_id 1 is present", () => {
    renderWithProviders(
      <ProjectCard
        project={buildProject({
          framework: [{ project_framework_id: 10, framework_id: 1, name: "EU AI Act" }],
        })}
      />,
    );

    expect(screen.getByText("EU AI Act")).toBeInTheDocument();
    expect(screen.queryByText("ISO 42001")).not.toBeInTheDocument();
  });

  it("renders only ISO 42001 framework when only framework_id 2 is present", () => {
    renderWithProviders(
      <ProjectCard
        project={buildProject({
          framework: [{ project_framework_id: 20, framework_id: 2, name: "ISO 42001" }],
        })}
      />,
    );

    expect(screen.queryByText("EU AI Act")).not.toBeInTheDocument();
    expect(screen.getByText("ISO 42001")).toBeInTheDocument();
  });

  it("renders no framework buttons when no frameworks present", () => {
    renderWithProviders(<ProjectCard project={buildProject({ framework: [] })} />);

    expect(screen.queryByText("EU AI Act")).not.toBeInTheDocument();
    expect(screen.queryByText("ISO 42001")).not.toBeInTheDocument();
  });

  it("calls navigate on EU AI Act framework button click", async () => {
    const user = userEvent.setup();
    renderWithProviders(<ProjectCard project={buildProject()} />);

    await user.click(screen.getByText("EU AI Act"));

    expect(mockNavigate).toHaveBeenCalledWith("/project-view", {
      projectId: "1",
      tab: "frameworks",
      framework: "1",
    });
  });

  it("calls navigate on ISO 42001 framework button click", async () => {
    const user = userEvent.setup();
    renderWithProviders(<ProjectCard project={buildProject()} />);

    await user.click(screen.getByText("ISO 42001"));

    expect(mockNavigate).toHaveBeenCalledWith("/project-view", {
      projectId: "1",
      tab: "frameworks",
      framework: "2",
    });
  });

  it("calls navigate on View project details button click", async () => {
    const user = userEvent.setup();
    renderWithProviders(<ProjectCard project={buildProject()} />);

    await user.click(screen.getByText("View project details"));

    expect(mockNavigate).toHaveBeenCalledWith("/project-view", {
      projectId: "1",
    });
  });

  it("renders ViewRelationshipsButton with correct props", () => {
    renderWithProviders(<ProjectCard project={buildProject()} />);

    const relButton = screen.getByTestId("view-relationships-button");
    expect(relButton.textContent).toBe("useCase-1-AI Governance Platform");
  });

  it("renders both frameworks layout with progress data after fetch", async () => {
    setupFetchDataMocks();
    renderWithProviders(<ProjectCard project={buildProject()} />);

    await waitFor(() => {
      expect(screen.getByText("Requirements: 5 out of 10")).toBeInTheDocument();
    });
    expect(screen.getByText("Controls: 3 out of 8")).toBeInTheDocument();
    expect(screen.getByText("Clauses: 2 out of 7")).toBeInTheDocument();
    expect(screen.getByText("Annexes: 4 out of 9")).toBeInTheDocument();
  });

  it("renders both frameworks layout with default 0/0 before fetch resolves", () => {
    renderWithProviders(<ProjectCard project={buildProject()} />);

    const bars = screen.getAllByTestId("progress-bar");
    expect(bars).toHaveLength(4);
    expect(bars.map((b) => b.textContent)).toEqual(["0/0", "0/0", "0/0", "0/0"]);
  });

  it("renders single framework layout with EU AI Act progress", async () => {
    setupFetchDataMocks();
    renderWithProviders(
      <ProjectCard
        project={buildProject({
          framework: [{ project_framework_id: 10, framework_id: 1, name: "EU AI Act" }],
        })}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText("Requirements: 5 out of 10")).toBeInTheDocument();
    });
    expect(screen.getByText("Controls: 3 out of 8")).toBeInTheDocument();
  });

  it("renders single framework layout with ISO 42001 progress", async () => {
    setupFetchDataMocks();
    renderWithProviders(
      <ProjectCard
        project={buildProject({
          framework: [{ project_framework_id: 20, framework_id: 2, name: "ISO 42001" }],
        })}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText("Clauses: 2 out of 7")).toBeInTheDocument();
    });
    expect(screen.getByText("Annexes: 4 out of 9")).toBeInTheDocument();
    expect(screen.queryByText("Requirements:")).not.toBeInTheDocument();
    expect(screen.queryByText("Controls:")).not.toBeInTheDocument();
  });

  it("navigates to compliance subtab on ExternalLink click", async () => {
    const user = userEvent.setup();
    setupFetchDataMocks();
    renderWithProviders(<ProjectCard project={buildProject()} />);

    await waitFor(() => {
      expect(screen.getByText("Requirements: 5 out of 10")).toBeInTheDocument();
    });

    const links = screen.getAllByTestId("icon-external-link");
    await user.click(links[0].closest("button")!);

    expect(mockNavigate).toHaveBeenCalledWith("/project-view", {
      projectId: "1",
      tab: "frameworks",
      framework: "1",
      subtab: "compliance",
    });
  });

  it("navigates to assessment subtab on ExternalLink click", async () => {
    const user = userEvent.setup();
    setupFetchDataMocks();
    renderWithProviders(<ProjectCard project={buildProject()} />);

    await waitFor(() => {
      expect(screen.getByText("Controls: 3 out of 8")).toBeInTheDocument();
    });

    const links = screen.getAllByTestId("icon-external-link");
    await user.click(links[1].closest("button")!);

    expect(mockNavigate).toHaveBeenCalledWith("/project-view", {
      projectId: "1",
      tab: "frameworks",
      framework: "1",
      subtab: "assessment",
    });
  });

  it("renders progress bars with correct progress strings for both frameworks", async () => {
    setupFetchDataMocks();
    renderWithProviders(<ProjectCard project={buildProject()} />);

    await waitFor(() => {
      const bars = screen.getAllByTestId("progress-bar");
      expect(bars).toHaveLength(4);
      expect(bars[0].textContent).toBe("5/10");
      expect(bars[1].textContent).toBe("3/8");
      expect(bars[2].textContent).toBe("2/7");
      expect(bars[3].textContent).toBe("4/9");
    });
  });
});
