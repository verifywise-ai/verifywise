import { screen, fireEvent, waitFor, within } from "@testing-library/react";
import { renderWithProviders } from "../../../../../../test/renderWithProviders";
import UseCaseLifecyclePanel from "../UseCaseLifecyclePanel";
import { canManageLifecycle } from "../../../../../../application/utils/useCaseLifecycle";
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

let mockWorkflows: Array<{ id: number; workflow_title: string; entity_type: string }> = [];
vi.mock("../../../../../../application/repository/approvalWorkflow.repository", () => ({
  getApprovalWorkflowsByEntityType: () => Promise.resolve(mockWorkflows),
  saveApprovalWorkflow: vi.fn(),
}));

const mockUpdateProject = vi.fn();
vi.mock("../../../../../../application/repository/project.repository", () => ({
  updateProject: (...args: unknown[]) => mockUpdateProject(...args),
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

describe("canManageLifecycle", () => {
  it("allows useCase.edit holders and the owner; never Auditors", () => {
    expect(canManageLifecycle("Admin", 2, 1, true)).toBe(true);
    expect(canManageLifecycle("Custom role", 2, 1, true)).toBe(true);
    expect(canManageLifecycle("Editor", 2, 1, false)).toBe(false);
    expect(canManageLifecycle("Reviewer", 1, 1, false)).toBe(true);
    expect(canManageLifecycle("Reviewer", 2, 1, false)).toBe(false);
    expect(canManageLifecycle("Auditor", 1, 1, true)).toBe(false);
    expect(canManageLifecycle("", 1, 1, true)).toBe(false);
  });
});

describe("UseCaseLifecyclePanel", () => {
  beforeEach(() => {
    mockRole = "Editor";
    mockUserId = 1;
    mockStaleIds = [];
    mockPermissions = ["useCase.edit"];
    mockWorkflows = [
      { id: 3, workflow_title: "Model risk review", entity_type: "use_case" },
      { id: 4, workflow_title: "Legal sign-off", entity_type: "use_case" },
    ];
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

  // The server refuses go-live while the approval is rejected (or pending).
  it("keeps a rejected use case from going live and says why", () => {
    renderWithProviders(
      <UseCaseLifecyclePanel
        project={project({ approval_status: "rejected", approval_workflow_id: 3 })}
      />,
    );
    expect(screen.getByTestId("lifecycle-go-live-btn")).toBeDisabled();
    expect(
      screen.getByText(
        "Approve this use case before marking it as live. Its last approval request was rejected.",
      ),
    ).toBeInTheDocument();
  });

  // An admin may clear the workflow of a rejected use case; it stays rejected
  // and only a new approval lets it go live, so the reason says how.
  it("tells an approval workflow admin how to get a rejected use case approved", () => {
    mockPermissions = ["useCase.edit", "approvalWorkflow.admin"];
    renderWithProviders(
      <UseCaseLifecyclePanel
        project={project({ approval_status: "rejected", approval_workflow_id: null })}
      />,
    );
    expect(screen.getByTestId("lifecycle-go-live-btn")).toBeDisabled();
    expect(
      screen.getByText(
        "Its last approval request was rejected. Attach an approval workflow and get it approved before marking it as live.",
      ),
    ).toBeInTheDocument();
  });

  it("tells anyone else a workflow admin has to attach a workflow", () => {
    renderWithProviders(
      <UseCaseLifecyclePanel
        project={project({ approval_status: "rejected", approval_workflow_id: null })}
      />,
    );
    expect(screen.getByTestId("lifecycle-go-live-btn")).toBeDisabled();
    expect(
      screen.getByText(
        "Its last approval request was rejected. An approval workflow admin needs to attach a workflow and get it approved before it can go live.",
      ),
    ).toBeInTheDocument();
  });

  it("keeps a use case with a pending approval from going live", () => {
    renderWithProviders(
      <UseCaseLifecyclePanel project={project({ approval_status: "pending" })} />,
    );
    expect(screen.getByTestId("lifecycle-go-live-btn")).toBeDisabled();
    expect(
      screen.getByText("Approve this use case before marking it as live."),
    ).toBeInTheDocument();
  });

  it("lets a use case with no open or rejected approval go live", () => {
    renderWithProviders(<UseCaseLifecyclePanel project={project({ approval_status: null })} />);
    expect(screen.getByTestId("lifecycle-go-live-btn")).toBeEnabled();
    expect(screen.queryByText(/Approve this use case before marking it as live/)).toBeNull();
  });
});

const pickWorkflow = async (name: string) => {
  const dialog = await screen.findByRole("dialog");
  fireEvent.mouseDown(within(dialog).getByRole("combobox"));
  fireEvent.click(await screen.findByRole("option", { name }));
};

const saveWorkflow = () => {
  const dialog = screen.getByRole("dialog");
  fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));
};

describe("UseCaseLifecyclePanel approval workflow", () => {
  beforeEach(() => {
    mockRole = "Editor";
    mockUserId = 1;
    mockStaleIds = [];
    mockPermissions = ["useCase.edit"];
    mockWorkflows = [
      { id: 3, workflow_title: "Model risk review", entity_type: "use_case" },
      { id: 4, workflow_title: "Legal sign-off", entity_type: "use_case" },
    ];
    vi.clearAllMocks();
    mockUpdateProject.mockResolvedValue({});
  });

  it("attaches a workflow to a planned use case and says it goes to In review", async () => {
    const onChanged = vi.fn();
    renderWithProviders(<UseCaseLifecyclePanel project={project()} onChanged={onChanged} />);

    expect(screen.getByTestId("lifecycle-workflow-title")).toHaveTextContent("None");
    const action = screen.getByTestId("lifecycle-workflow-action");
    expect(action).toHaveTextContent("Attach workflow");
    fireEvent.click(action);

    await pickWorkflow("Model risk review");
    expect(screen.getByText("Saving sends this use case for approval.")).toBeInTheDocument();
    expect(
      screen.getByText("It moves to In review until the request is approved or rejected."),
    ).toBeInTheDocument();
    // Nothing to clear yet, so no "None" option.
    saveWorkflow();

    await waitFor(() => expect(mockUpdateProject).toHaveBeenCalledTimes(1));
    expect(mockUpdateProject).toHaveBeenCalledWith({ id: 7, body: { approval_workflow_id: 3 } });
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
  });

  it("shows the attached workflow and its status, and clears it with None", async () => {
    mockPermissions = ["useCase.edit", "approvalWorkflow.admin"];
    renderWithProviders(
      <UseCaseLifecyclePanel
        project={project({ approval_workflow_id: 3, approval_status: "pending" })}
      />,
    );

    expect(await screen.findByText("Model risk review")).toBeInTheDocument();
    expect(screen.getByText("Pending approval")).toBeInTheDocument();
    const action = screen.getByTestId("lifecycle-workflow-action");
    expect(action).toHaveTextContent("Change workflow");
    fireEvent.click(action);

    await pickWorkflow("None");
    expect(
      screen.getByText("Saving removes the approval workflow from this use case."),
    ).toBeInTheDocument();
    expect(screen.getByText("The pending approval request is withdrawn.")).toBeInTheDocument();
    saveWorkflow();

    await waitFor(() =>
      expect(mockUpdateProject).toHaveBeenCalledWith({
        id: 7,
        body: { approval_workflow_id: null },
      }),
    );
  });

  it("replaces a workflow and keeps Save off until the choice changes", async () => {
    renderWithProviders(
      <UseCaseLifecyclePanel
        project={project({ approval_workflow_id: 3, lifecycle_stage: LifecycleStage.LIVE })}
      />,
    );
    fireEvent.click(screen.getByTestId("lifecycle-workflow-action"));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByRole("button", { name: "Save" })).toBeDisabled();

    await pickWorkflow("Legal sign-off");
    expect(screen.getByText("Saving sends this use case for approval.")).toBeInTheDocument();
    // Only a planned use case moves to In review.
    expect(screen.queryByText(/It moves to In review/)).toBeNull();
    saveWorkflow();
    await waitFor(() =>
      expect(mockUpdateProject).toHaveBeenCalledWith({ id: 7, body: { approval_workflow_id: 4 } }),
    );
  });

  it("locks the workflow for a non-admin while approval is pending, and says why", () => {
    renderWithProviders(
      <UseCaseLifecyclePanel
        project={project({ approval_workflow_id: 3, approval_status: "pending" })}
      />,
    );
    expect(screen.queryByTestId("lifecycle-workflow-action")).toBeNull();
    expect(screen.getByTestId("lifecycle-workflow-locked")).toHaveTextContent(
      "Only an approval workflow admin can change it while approval is pending or rejected.",
    );
  });

  it("lets an approval workflow admin change a rejected use case's workflow", () => {
    mockPermissions = ["useCase.edit", "approvalWorkflow.admin"];
    renderWithProviders(
      <UseCaseLifecyclePanel
        project={project({ approval_workflow_id: 3, approval_status: "rejected" })}
      />,
    );
    expect(screen.getByText("Rejected")).toBeInTheDocument();
    expect(screen.getByTestId("lifecycle-workflow-action")).toBeInTheDocument();
    expect(screen.queryByTestId("lifecycle-workflow-locked")).toBeNull();
  });

  it("offers no workflow action to someone who can't edit the use case", () => {
    mockRole = "Auditor";
    renderWithProviders(<UseCaseLifecyclePanel project={project()} />);
    expect(screen.queryByTestId("lifecycle-workflow-action")).toBeNull();
    expect(screen.queryByTestId("lifecycle-workflow-locked")).toBeNull();
  });

  it("names a workflow that is no longer in the active list as archived", async () => {
    renderWithProviders(<UseCaseLifecyclePanel project={project({ approval_workflow_id: 99 })} />);
    expect(await screen.findByText("Archived workflow")).toBeInTheDocument();
  });

  it("shows the server's refusal in the modal", async () => {
    mockUpdateProject.mockRejectedValue({
      message:
        "Only an approval workflow admin can change the workflow while its approval is pending or rejected",
    });
    renderWithProviders(<UseCaseLifecyclePanel project={project()} />);
    fireEvent.click(screen.getByTestId("lifecycle-workflow-action"));
    await pickWorkflow("Legal sign-off");
    saveWorkflow();
    expect(
      await screen.findByText(
        "Only an approval workflow admin can change the workflow while its approval is pending or rejected",
      ),
    ).toBeInTheDocument();
  });

  it("tells a non-admin there are no workflows and to ask an Admin", async () => {
    mockWorkflows = [];
    renderWithProviders(<UseCaseLifecyclePanel project={project()} />);
    fireEvent.click(screen.getByTestId("lifecycle-workflow-action"));
    expect(await screen.findByTestId("use-case-workflow-empty")).toHaveTextContent(
      "No approval workflows for use cases yet. Ask an Admin to create one.",
    );
    expect(screen.queryByTestId("use-case-workflow-create")).toBeNull();
    expect(screen.queryByTestId("use-case-workflow-manage")).toBeNull();
  });

  it("offers an admin Create workflow and Manage approval workflows when there are none", async () => {
    mockWorkflows = [];
    mockPermissions = ["useCase.edit", "approvalWorkflow.admin"];
    renderWithProviders(<UseCaseLifecyclePanel project={project()} />);
    fireEvent.click(screen.getByTestId("lifecycle-workflow-action"));
    expect(await screen.findByTestId("use-case-workflow-empty")).toHaveTextContent(
      "No approval workflows for use cases yet.",
    );
    expect(screen.getByTestId("use-case-workflow-create")).toHaveTextContent("Create workflow");
    expect(screen.getByTestId("use-case-workflow-manage")).toHaveTextContent(
      "Manage approval workflows",
    );
  });
});
