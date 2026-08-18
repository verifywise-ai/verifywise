import { screen, fireEvent, waitFor, within } from "@testing-library/react";
import { renderWithProviders } from "../../../../test/renderWithProviders";
import RepositoriesPage from "../RepositoriesPage";
import type { AIDetectionRepository } from "../../../../domain/ai-detection/repositoryTypes";

const mockGetRepositories = vi.fn();
const mockCreateRepository = vi.fn();
const mockUpdateRepository = vi.fn();
const mockDeleteRepository = vi.fn();
const mockTriggerRepositoryScan = vi.fn();

vi.mock("../../../../application/repository/aiDetectionRepository.repository", () => ({
  getRepositories: (...args: unknown[]) => mockGetRepositories(...args),
  createRepository: (...args: unknown[]) => mockCreateRepository(...args),
  updateRepository: (...args: unknown[]) => mockUpdateRepository(...args),
  deleteRepository: (...args: unknown[]) => mockDeleteRepository(...args),
  triggerRepositoryScan: (...args: unknown[]) => mockTriggerRepositoryScan(...args),
  generateWebhookSecret: vi.fn(),
}));

const mockStartTrackingScan = vi.fn();
const mockRefreshRecentScans = vi.fn();
const mockRefreshRepositoryCount = vi.fn();

vi.mock("../../../../application/contexts/AIDetectionSidebar.context", () => ({
  useAIDetectionSidebarContext: () => ({
    startTrackingScan: mockStartTrackingScan,
    refreshRecentScans: mockRefreshRecentScans,
    refreshRepositoryCount: mockRefreshRepositoryCount,
  }),
}));

vi.mock("../../../components/Layout/PageHeaderExtended", () => ({
  PageHeaderExtended: ({ children, title, actionButton, alert }: any) => (
    <div data-testid="page-header">
      <h1>{title}</h1>
      {actionButton}
      {alert}
      {children}
    </div>
  ),
}));

function makeRepo(overrides: Partial<AIDetectionRepository> = {}): AIDetectionRepository {
  return {
    id: 1,
    repository_url: "https://github.com/acme/widgets",
    repository_owner: "acme",
    repository_name: "widgets",
    display_name: null,
    default_branch: "main",
    schedule_enabled: false,
    schedule_frequency: null,
    schedule_day_of_week: null,
    schedule_day_of_month: null,
    schedule_hour: 2,
    schedule_minute: 0,
    ci_enabled: false,
    ci_min_score: 70,
    ci_max_critical: 0,
    ci_post_comments: true,
    ci_status_checks: true,
    last_scan_id: null,
    last_scan_status: null,
    last_scan_at: null,
    next_scan_at: null,
    is_enabled: true,
    created_by: 1,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

describe("RepositoriesPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it("shows a loading message before the first fetch resolves", () => {
    mockGetRepositories.mockImplementation(() => new Promise(() => {}));
    renderWithProviders(<RepositoriesPage />);

    expect(screen.getByText("Loading repositories...")).toBeInTheDocument();
  });

  it("shows an error alert when fetching fails", async () => {
    mockGetRepositories.mockRejectedValue(new Error("Network down"));
    renderWithProviders(<RepositoriesPage />);

    await waitFor(() => {
      expect(screen.getByText("Failed to load repositories.")).toBeInTheDocument();
    });
  });

  it("shows the empty state when there are no repositories", async () => {
    mockGetRepositories.mockResolvedValue({
      repositories: [],
      pagination: { total: 0, page: 1, limit: 10, total_pages: 0 },
    });
    renderWithProviders(<RepositoriesPage />);

    await waitFor(() => {
      expect(screen.getByText(/No repositories added yet/)).toBeInTheDocument();
    });
  });

  it("renders a table row for each repository", async () => {
    mockGetRepositories.mockResolvedValue({
      repositories: [
        makeRepo({ id: 1, repository_name: "widgets" }),
        makeRepo({ id: 2, repository_name: "gadgets", display_name: "Gadgets service" }),
      ],
      pagination: { total: 2, page: 1, limit: 10, total_pages: 1 },
    });
    renderWithProviders(<RepositoriesPage />);

    await waitFor(() => {
      expect(screen.getByText("acme/widgets")).toBeInTheDocument();
    });
    expect(screen.getByText("acme/gadgets")).toBeInTheDocument();
    expect(screen.getByText("Gadgets service")).toBeInTheDocument();
  });

  it("shows 'Disabled' schedule chip when schedule is off", async () => {
    mockGetRepositories.mockResolvedValue({
      repositories: [makeRepo({ schedule_enabled: false })],
      pagination: { total: 1, page: 1, limit: 10, total_pages: 1 },
    });
    renderWithProviders(<RepositoriesPage />);

    await waitFor(() => {
      expect(screen.getByText("Disabled")).toBeInTheDocument();
    });
  });

  it("formats a daily schedule label", async () => {
    mockGetRepositories.mockResolvedValue({
      repositories: [
        makeRepo({
          schedule_enabled: true,
          schedule_frequency: "daily",
          schedule_hour: 3,
          schedule_minute: 30,
        }),
      ],
      pagination: { total: 1, page: 1, limit: 10, total_pages: 1 },
    });
    renderWithProviders(<RepositoriesPage />);

    await waitFor(() => {
      expect(screen.getByText("Daily at 03:30 UTC")).toBeInTheDocument();
    });
  });

  it("shows 'Never' when there is no last scan", async () => {
    mockGetRepositories.mockResolvedValue({
      repositories: [makeRepo({ last_scan_at: null })],
      pagination: { total: 1, page: 1, limit: 10, total_pages: 1 },
    });
    renderWithProviders(<RepositoriesPage />);

    await waitFor(() => {
      expect(screen.getByText("Never")).toBeInTheDocument();
    });
  });

  it("opens the add repository modal from the action button", async () => {
    mockGetRepositories.mockResolvedValue({
      repositories: [],
      pagination: { total: 0, page: 1, limit: 10, total_pages: 0 },
    });
    renderWithProviders(<RepositoriesPage />);

    await waitFor(() => {
      expect(screen.getByText(/No repositories added yet/)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Add repository" }));
    expect(screen.getByRole("heading", { name: "Add repository" })).toBeInTheDocument();
  });

  it("opens the edit modal when a repository row is clicked", async () => {
    mockGetRepositories.mockResolvedValue({
      repositories: [makeRepo({ id: 3, repository_name: "widgets" })],
      pagination: { total: 1, page: 1, limit: 10, total_pages: 1 },
    });
    renderWithProviders(<RepositoriesPage />);

    await waitFor(() => {
      expect(screen.getByText("acme/widgets")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("acme/widgets"));
    expect(screen.getByRole("heading", { name: "Edit repository" })).toBeInTheDocument();
  });

  it("triggers a scan when the scan-now button is clicked", async () => {
    mockGetRepositories.mockResolvedValue({
      repositories: [makeRepo({ id: 5 })],
      pagination: { total: 1, page: 1, limit: 10, total_pages: 1 },
    });
    mockTriggerRepositoryScan.mockResolvedValue({ id: 99 });
    renderWithProviders(<RepositoriesPage />);

    await waitFor(() => {
      expect(screen.getByText("acme/widgets")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByLabelText("Scan now") ?? screen.getByTitle("Scan now"));
  });

  it("shows a delete confirmation dialog and deletes the repository", async () => {
    mockGetRepositories.mockResolvedValue({
      repositories: [makeRepo({ id: 7, repository_name: "widgets" })],
      pagination: { total: 1, page: 1, limit: 10, total_pages: 1 },
    });
    mockDeleteRepository.mockResolvedValue(undefined);
    renderWithProviders(<RepositoriesPage />);

    await waitFor(() => {
      expect(screen.getByText("acme/widgets")).toBeInTheDocument();
    });

    const row = screen.getByText("acme/widgets").closest("tr") as HTMLElement;
    const deleteButton = within(row).getAllByRole("button")[2];
    fireEvent.click(deleteButton);

    expect(await screen.findByText(/Delete "acme\/widgets"\?/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Delete" }));

    await waitFor(() => {
      expect(mockDeleteRepository).toHaveBeenCalledWith(7);
    });
  });

  it("submits the create-repository form and refreshes the list", async () => {
    mockGetRepositories.mockResolvedValue({
      repositories: [],
      pagination: { total: 0, page: 1, limit: 10, total_pages: 0 },
    });
    mockCreateRepository.mockResolvedValue({ id: 10 });

    renderWithProviders(<RepositoriesPage />);

    await waitFor(() => {
      expect(screen.getByText(/No repositories added yet/)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Add repository" }));

    fireEvent.change(screen.getByPlaceholderText("https://github.com/owner/repo"), {
      target: { value: "https://github.com/acme/new-repo" },
    });

    const dialogSubmit = screen.getAllByRole("button", { name: "Add repository" });
    fireEvent.click(dialogSubmit[dialogSubmit.length - 1]);

    await waitFor(() => {
      expect(mockCreateRepository).toHaveBeenCalled();
    });
    await waitFor(() => {
      expect(mockRefreshRepositoryCount).toHaveBeenCalled();
    });
  });
});
