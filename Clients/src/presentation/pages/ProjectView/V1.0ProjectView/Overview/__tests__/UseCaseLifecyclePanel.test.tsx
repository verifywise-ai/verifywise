import { screen, fireEvent, waitFor } from "@testing-library/react";
import { renderWithProviders } from "../../../../../../test/renderWithProviders";
import UseCaseLifecyclePanel from "../UseCaseLifecyclePanel";
import { canManageUseCaseLifecycle } from "../../../../../../application/utils/useCaseLifecycle";
import { LifecycleStage } from "../../../../../../domain/enums/lifecycleStage.enum";
import type { Project } from "../../../../../../domain/types/Project";

const mockMarkLive = vi.fn();
const mockRetire = vi.fn();
const mockConfirm = vi.fn();
const mockDepartment = vi.fn();
let mockStaleIds: number[] = [];

vi.mock("../../../../../../application/repository/useCaseLifecycle.repository", () => ({
  markUseCaseLive: (...args: unknown[]) => mockMarkLive(...args),
  retireUseCase: (...args: unknown[]) => mockRetire(...args),
  confirmUseCaseStillLive: (...args: unknown[]) => mockConfirm(...args),
  updateUseCaseDepartment: (...args: unknown[]) => mockDepartment(...args),
  getUseCaseLifecycleSummary: () =>
    Promise.resolve({
      counts: { in_review: 0, planned: 0, live: 0, retired: 0 },
      stale_ids: mockStaleIds,
      confirmation_interval_days: 90,
    }),
  getUseCaseLifecycleDashboard: vi.fn(),
  getLifecycleSettings: vi.fn(),
  updateLifecycleSettings: vi.fn(),
}));

let mockPermissions: string[] | undefined = ["useCase.edit"];
vi.mock("../../../../../../application/hooks/useMyPermissions", () => ({
  useMyPermissions: () => ({ permissions: mockPermissions, isLoading: false, error: null }),
}));

let mockRole = "Editor";
let mockUserId: number | null = 1;
vi.mock("../../../../../../application/hooks/useAuth", () => ({
  useAuth: () => ({ userRoleName: mockRole, userId: mockUserId }),
}));

const project = (overrides: Partial<Project> = {}): Project =>
  ({
    id: 7,
    project_title: "Credit scoring",
    owner: 1,
    lifecycle_stage: LifecycleStage.PLANNED,
    ...overrides,
  }) as Project;

describe("canManageUseCaseLifecycle", () => {
  it("allows useCase.edit holders and the owner; never Auditors", () => {
    expect(canManageUseCaseLifecycle("Admin", 2, 1, true)).toBe(true);
    expect(canManageUseCaseLifecycle("Custom role", 2, 1, true)).toBe(true);
    expect(canManageUseCaseLifecycle("Editor", 2, 1, false)).toBe(false);
    expect(canManageUseCaseLifecycle("Reviewer", 1, 1, false)).toBe(true);
    expect(canManageUseCaseLifecycle("Reviewer", 2, 1, false)).toBe(false);
    expect(canManageUseCaseLifecycle("Auditor", 1, 1, true)).toBe(false);
    expect(canManageUseCaseLifecycle("", 1, 1, true)).toBe(false);
  });
});

describe("UseCaseLifecyclePanel", () => {
  beforeEach(() => {
    mockRole = "Editor";
    mockUserId = 1;
    mockStaleIds = [];
    mockPermissions = ["useCase.edit"];
    vi.clearAllMocks();
  });

  it("offers Mark as live and Retire on a planned use case, and sends the chosen date", async () => {
    mockMarkLive.mockResolvedValue({});
    const onChanged = vi.fn();
    renderWithProviders(<UseCaseLifecyclePanel project={project()} onChanged={onChanged} />);

    expect(screen.queryByTestId("lifecycle-confirm-btn")).toBeNull();
    expect(screen.getByTestId("lifecycle-retire-btn")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("lifecycle-go-live-btn"));

    const submit = await screen.findAllByRole("button", { name: "Mark as live" });
    fireEvent.click(submit[submit.length - 1]);
    await waitFor(() => expect(mockMarkLive).toHaveBeenCalledTimes(1));
    expect(mockMarkLive.mock.calls[0][0]).toBe(7);
    // The user's local date (today by default), not a UTC conversion.
    const now = new Date();
    const localToday = [
      now.getFullYear(),
      String(now.getMonth() + 1).padStart(2, "0"),
      String(now.getDate()).padStart(2, "0"),
    ].join("-");
    expect(mockMarkLive.mock.calls[0][1]).toBe(localToday);
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
  });

  it("confirms a live use case and shows the stale warning when it is stale", async () => {
    mockStaleIds = [7];
    mockConfirm.mockResolvedValue({});
    renderWithProviders(
      <UseCaseLifecyclePanel
        project={project({ lifecycle_stage: LifecycleStage.LIVE, go_live_date: "2026-01-01" })}
      />,
    );
    expect(await screen.findByText(/Nobody has confirmed this use case/)).toBeInTheDocument();
    // Shown inside the panel, not pinned to the corner like a toast.
    expect(screen.getByRole("alert")).toHaveStyle({ position: "static" });
    fireEvent.click(screen.getByTestId("lifecycle-confirm-btn"));
    await waitFor(() => expect(mockConfirm).toHaveBeenCalledWith(7));
  });

  it("is read-only for an Auditor who owns the use case", () => {
    mockRole = "Auditor";
    renderWithProviders(<UseCaseLifecyclePanel project={project()} />);
    expect(screen.queryByTestId("lifecycle-go-live-btn")).toBeNull();
    expect(screen.queryByTestId("lifecycle-retire-btn")).toBeNull();
    expect(screen.queryByTestId("lifecycle-edit-department")).toBeNull();
  });

  it("follows the per-org permission list, not the role name", () => {
    mockRole = "Editor";
    mockUserId = 2;
    mockPermissions = [];
    renderWithProviders(<UseCaseLifecyclePanel project={project()} />);
    expect(screen.queryByTestId("lifecycle-go-live-btn")).toBeNull();
  });

  it("shows no actions on a retired use case", () => {
    renderWithProviders(
      <UseCaseLifecyclePanel project={project({ lifecycle_stage: LifecycleStage.RETIRED })} />,
    );
    expect(screen.queryByTestId("lifecycle-go-live-btn")).toBeNull();
    expect(screen.queryByTestId("lifecycle-confirm-btn")).toBeNull();
    expect(screen.queryByTestId("lifecycle-retire-btn")).toBeNull();
  });
});
