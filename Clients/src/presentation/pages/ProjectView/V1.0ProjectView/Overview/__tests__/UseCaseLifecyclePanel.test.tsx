import { screen, fireEvent, waitFor, within } from "@testing-library/react";
import { renderWithProviders } from "../../../../../../test/renderWithProviders";
import UseCaseLifecyclePanel from "../UseCaseLifecyclePanel";
import { canManageLifecycle } from "../../../../../../application/utils/useCaseLifecycle";
import { LifecycleStage } from "../../../../../../domain/enums/lifecycleStage.enum";
import type { Project } from "../../../../../../domain/types/Project";
import CustomException from "../../../../../../infrastructure/exceptions/customException";

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

let mockWorkflows: Array<{
  id: number;
  workflow_title: string;
  entity_type: string;
  auto_approve_max_risk?: string | null;
}> = [];
vi.mock("../../../../../../application/repository/approvalWorkflow.repository", () => ({
  getApprovalWorkflowsByEntityType: () => Promise.resolve(mockWorkflows),
  saveApprovalWorkflow: vi.fn(),
}));

const mockUpdateProject = vi.fn();
const mockResubmit = vi.fn();
// What GET /api/v1/projects/:id/approval-workflow answers; the project rows
// themselves never carry the workflow id.
let mockAttached: {
  approval_workflow_id: number | null;
  workflow_title: string | null;
  workflow_is_active: boolean | null;
  approval_status: "pending" | "rejected" | null;
} = {
  approval_workflow_id: null,
  workflow_title: null,
  workflow_is_active: null,
  approval_status: null,
};
const mockGetAttached = vi.fn();
vi.mock("../../../../../../application/repository/project.repository", () => ({
  updateProject: (...args: unknown[]) => mockUpdateProject(...args),
  getUseCaseApprovalWorkflow: (...args: unknown[]) => mockGetAttached(...args),
  resubmitUseCaseApproval: (...args: unknown[]) => mockResubmit(...args),
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

/**
 * A use case, and the endpoint's answer for it: the workflow id and status a
 * test passes are served by the endpoint, as the API does, and left out of the
 * project row. Id 99 stands for an archived workflow.
 */
const project = (overrides: Partial<Project> = {}): Project => {
  const { approval_workflow_id: workflowId = null, ...rest } = overrides;
  const active = mockWorkflows.find((workflow) => workflow.id === workflowId);
  mockAttached = {
    approval_workflow_id: workflowId ?? null,
    workflow_title: workflowId ? (active?.workflow_title ?? "Old review") : null,
    workflow_is_active: workflowId ? Boolean(active) : null,
    approval_status: overrides.approval_status ?? null,
  };
  return {
    id: 7,
    project_title: "Credit scoring",
    owner: 1,
    lifecycle_stage: LifecycleStage.PLANNED,
    ...rest,
  } as Project;
};

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
    mockGetAttached.mockImplementation(async () => mockAttached);
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
  // With an archived workflow nobody can resubmit it, so the reason stays
  // general.
  it("keeps a rejected use case from going live and says why", async () => {
    renderWithProviders(
      <UseCaseLifecyclePanel
        project={project({ approval_status: "rejected", approval_workflow_id: 99 })}
      />,
    );
    expect(screen.getByTestId("lifecycle-go-live-btn")).toBeDisabled();
    expect(await screen.findByText("Old review (archived)")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Approve this use case before marking it as live. Its last approval request was rejected.",
      ),
    ).toBeInTheDocument();
  });

  it("tells someone who can resubmit a rejected use case to do so before it goes live", async () => {
    renderWithProviders(
      <UseCaseLifecyclePanel
        project={project({ approval_status: "rejected", approval_workflow_id: 3 })}
      />,
    );
    expect(screen.getByTestId("lifecycle-go-live-btn")).toBeDisabled();
    expect(
      await screen.findByText(
        "Its last approval request was rejected. Resubmit it for approval and get it approved before marking it as live.",
      ),
    ).toBeInTheDocument();
  });

  // An admin may clear the workflow of a rejected use case; it stays rejected
  // and only a new approval lets it go live, so the reason says how.
  it("tells an approval workflow admin how to get a rejected use case approved", async () => {
    mockPermissions = ["useCase.edit", "approvalWorkflow.admin"];
    renderWithProviders(
      <UseCaseLifecyclePanel
        project={project({ approval_status: "rejected", approval_workflow_id: null })}
      />,
    );
    expect(screen.getByTestId("lifecycle-go-live-btn")).toBeDisabled();
    expect(
      await screen.findByText(
        "Its last approval request was rejected. Attach an approval workflow and get it approved before marking it as live.",
      ),
    ).toBeInTheDocument();
  });

  it("tells anyone else a workflow admin has to attach a workflow", async () => {
    renderWithProviders(
      <UseCaseLifecyclePanel
        project={project({ approval_status: "rejected", approval_workflow_id: null })}
      />,
    );
    expect(screen.getByTestId("lifecycle-go-live-btn")).toBeDisabled();
    expect(
      await screen.findByText(
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
      {
        id: 5,
        workflow_title: "Fast track",
        entity_type: "use_case",
        auto_approve_max_risk: "Limited risk",
      },
    ];
    vi.clearAllMocks();
    mockGetAttached.mockImplementation(async () => mockAttached);
    mockUpdateProject.mockResolvedValue({});
  });

  it("attaches a workflow to a planned use case and says it goes to In review", async () => {
    const onChanged = vi.fn();
    renderWithProviders(<UseCaseLifecyclePanel project={project()} onChanged={onChanged} />);

    const action = await screen.findByTestId("lifecycle-workflow-action");
    expect(screen.getByTestId("lifecycle-workflow-title")).toHaveTextContent("None");
    expect(mockGetAttached).toHaveBeenCalledWith(expect.objectContaining({ id: 7 }));
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
    // The dialog shows a refusal itself, so the global error toast is skipped.
    expect(mockUpdateProject).toHaveBeenCalledWith({
      id: 7,
      body: { approval_workflow_id: 3 },
      suppressGlobalErrorToast: true,
    });
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
    // The attached workflow is read again from the endpoint.
    await waitFor(() => expect(mockGetAttached).toHaveBeenCalledTimes(2));
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
    const action = await screen.findByTestId("lifecycle-workflow-action");
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
        suppressGlobalErrorToast: true,
      }),
    );
  });

  // The project row has no approval_workflow_id (the API never sends it); the
  // label comes from GET /api/v1/projects/:id/approval-workflow.
  it("shows the workflow title the endpoint returns", async () => {
    mockGetAttached.mockResolvedValue({
      approval_workflow_id: 4,
      workflow_title: "Legal sign-off",
      workflow_is_active: true,
      approval_status: "pending",
    });
    mockPermissions = ["useCase.edit", "approvalWorkflow.admin"];
    renderWithProviders(
      <UseCaseLifecyclePanel project={{ ...project(), approval_status: null } as Project} />,
    );
    await waitFor(() =>
      expect(screen.getByTestId("lifecycle-workflow-title")).toHaveTextContent("Legal sign-off"),
    );
    expect(screen.getByText("Pending approval")).toBeInTheDocument();
    expect(screen.getByTestId("lifecycle-workflow-action")).toHaveTextContent("Change workflow");
    fireEvent.click(screen.getByTestId("lifecycle-workflow-action"));
    // The dialog starts on the attached workflow.
    const dialog = await screen.findByRole("dialog");
    await waitFor(() =>
      expect(within(dialog).getByRole("combobox")).toHaveTextContent("Legal sign-off"),
    );
  });

  it("labels an attached workflow that can't be found, and clearing it withdraws its request", async () => {
    mockGetAttached.mockResolvedValue({
      approval_workflow_id: 44,
      workflow_title: null,
      workflow_is_active: false,
      approval_status: "pending",
    });
    mockPermissions = ["useCase.edit", "approvalWorkflow.admin"];
    renderWithProviders(<UseCaseLifecyclePanel project={project()} />);
    await waitFor(() =>
      expect(screen.getByTestId("lifecycle-workflow-title")).toHaveTextContent(
        "Unavailable workflow",
      ),
    );
    fireEvent.click(screen.getByTestId("lifecycle-workflow-action"));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByRole("combobox")).toHaveTextContent("Unavailable workflow");
    await pickWorkflow("None");
    expect(screen.getByText("The pending approval request is withdrawn.")).toBeInTheDocument();
  });

  it("says so when the approval workflow can't be loaded", async () => {
    mockGetAttached.mockRejectedValue(new Error("network"));
    renderWithProviders(<UseCaseLifecyclePanel project={project()} />);
    await waitFor(() =>
      expect(screen.getByTestId("lifecycle-workflow-title")).toHaveTextContent(
        "Could not load the approval workflow.",
      ),
    );
    expect(screen.queryByTestId("lifecycle-workflow-action")).toBeNull();
  });

  it("replaces a workflow and keeps Save off until the choice changes", async () => {
    renderWithProviders(
      <UseCaseLifecyclePanel
        project={project({ approval_workflow_id: 3, lifecycle_stage: LifecycleStage.LIVE })}
      />,
    );
    fireEvent.click(await screen.findByTestId("lifecycle-workflow-action"));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByRole("button", { name: "Save" })).toBeDisabled();

    await pickWorkflow("Legal sign-off");
    expect(screen.getByText("Saving sends this use case for approval.")).toBeInTheDocument();
    // Only a planned use case moves to In review.
    expect(screen.queryByText(/It moves to In review/)).toBeNull();
    saveWorkflow();
    await waitFor(() =>
      expect(mockUpdateProject).toHaveBeenCalledWith({
        id: 7,
        body: { approval_workflow_id: 4 },
        suppressGlobalErrorToast: true,
      }),
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

  it("lets an approval workflow admin change a rejected use case's workflow", async () => {
    mockPermissions = ["useCase.edit", "approvalWorkflow.admin"];
    renderWithProviders(
      <UseCaseLifecyclePanel
        project={project({ approval_workflow_id: 3, approval_status: "rejected" })}
      />,
    );
    expect(screen.getByText("Rejected")).toBeInTheDocument();
    expect(await screen.findByTestId("lifecycle-workflow-action")).toBeInTheDocument();
    expect(screen.queryByTestId("lifecycle-workflow-locked")).toBeNull();
  });

  // PATCH /v1/projects/:id is authorized on useCase.edit; owning the use case
  // is enough for the lifecycle actions but not for this.
  it("offers no workflow action to an owner without useCase.edit", () => {
    mockRole = "Reviewer";
    mockUserId = 1;
    mockPermissions = [];
    renderWithProviders(<UseCaseLifecyclePanel project={project()} />);
    expect(screen.getByTestId("lifecycle-go-live-btn")).toBeInTheDocument();
    expect(screen.queryByTestId("lifecycle-workflow-action")).toBeNull();
    expect(screen.queryByTestId("lifecycle-workflow-locked")).toBeNull();
  });

  it("says a workflow with an auto-approve level may approve at once", async () => {
    const autoNote =
      "If its risk classification is at or below the workflow's auto-approve level, it is approved at once.";
    renderWithProviders(<UseCaseLifecyclePanel project={project()} />);
    fireEvent.click(await screen.findByTestId("lifecycle-workflow-action"));

    await pickWorkflow("Fast track");
    expect(screen.getByText(autoNote)).toBeInTheDocument();
    expect(screen.getByText("Saving sends this use case for approval.")).toBeInTheDocument();

    await pickWorkflow("Legal sign-off");
    expect(screen.queryByText(autoNote)).toBeNull();
  });

  it("shows an archived current workflow in the Change select", async () => {
    renderWithProviders(<UseCaseLifecyclePanel project={project({ approval_workflow_id: 99 })} />);
    fireEvent.click(await screen.findByTestId("lifecycle-workflow-action"));
    const dialog = await screen.findByRole("dialog");
    await waitFor(() =>
      expect(within(dialog).getByRole("combobox")).toHaveTextContent("Old review (archived)"),
    );
    expect(within(dialog).getByRole("button", { name: "Save" })).toBeDisabled();
  });

  it("offers no workflow action to someone who can't edit the use case", () => {
    mockRole = "Auditor";
    renderWithProviders(<UseCaseLifecyclePanel project={project()} />);
    expect(screen.queryByTestId("lifecycle-workflow-action")).toBeNull();
    expect(screen.queryByTestId("lifecycle-workflow-locked")).toBeNull();
  });

  it("names a workflow that is no longer in the active list as archived", async () => {
    renderWithProviders(<UseCaseLifecyclePanel project={project({ approval_workflow_id: 99 })} />);
    expect(await screen.findByText("Old review (archived)")).toBeInTheDocument();
  });

  it("shows the server's refusal in the modal", async () => {
    mockUpdateProject.mockRejectedValue(
      new CustomException(
        "Only an approval workflow admin can change the workflow while its approval is pending or rejected",
        403,
        {
          message: "Forbidden",
          data: "Only an approval workflow admin can change the workflow while its approval is pending or rejected",
        },
      ),
    );
    renderWithProviders(<UseCaseLifecyclePanel project={project()} />);
    fireEvent.click(await screen.findByTestId("lifecycle-workflow-action"));
    await pickWorkflow("Legal sign-off");
    saveWorkflow();
    expect(
      await screen.findByText(
        "Only an approval workflow admin can change the workflow while its approval is pending or rejected",
      ),
    ).toBeInTheDocument();
  });

  // PATCH /api/v1/projects/:id answers a refused workflow with a field error
  // ({ message: "Bad Request", data: { errors: [...] } }); the dialog shows the
  // field's message, not the status text.
  it("shows the field error of a refused workflow, not Bad Request", async () => {
    mockUpdateProject.mockRejectedValue(
      new CustomException("Bad Request", 400, {
        message: "Bad Request",
        data: {
          errors: [
            {
              field: "approval_workflow_id",
              message: "The selected approval workflow is no longer active",
              location: "body",
            },
          ],
        },
      }),
    );
    renderWithProviders(<UseCaseLifecyclePanel project={project()} />);
    fireEvent.click(await screen.findByTestId("lifecycle-workflow-action"));
    await pickWorkflow("Legal sign-off");
    saveWorkflow();
    const dialog = screen.getByRole("dialog");
    expect(
      await within(dialog).findByText("The selected approval workflow is no longer active"),
    ).toBeInTheDocument();
    expect(within(dialog).queryByText("Bad Request")).toBeNull();
  });

  it("tells a non-admin there are no workflows and to ask an Admin", async () => {
    mockWorkflows = [];
    renderWithProviders(<UseCaseLifecyclePanel project={project()} />);
    fireEvent.click(await screen.findByTestId("lifecycle-workflow-action"));
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
    fireEvent.click(await screen.findByTestId("lifecycle-workflow-action"));
    expect(await screen.findByTestId("use-case-workflow-empty")).toHaveTextContent(
      "No approval workflows for use cases yet.",
    );
    expect(screen.getByTestId("use-case-workflow-create")).toHaveTextContent("Create workflow");
    expect(screen.getByTestId("use-case-workflow-manage")).toHaveTextContent(
      "Manage approval workflows",
    );
  });
});

const resubmitDialog = async () => {
  fireEvent.click(await screen.findByTestId("lifecycle-workflow-resubmit"));
  return screen.findByRole("dialog");
};

describe("UseCaseLifecyclePanel resubmit for approval", () => {
  beforeEach(() => {
    mockRole = "Editor";
    mockUserId = 1;
    mockStaleIds = [];
    mockPermissions = ["useCase.edit"];
    mockWorkflows = [
      { id: 3, workflow_title: "Model risk review", entity_type: "use_case" },
      {
        id: 5,
        workflow_title: "Fast track",
        entity_type: "use_case",
        auto_approve_max_risk: "Limited risk",
      },
    ];
    vi.clearAllMocks();
    mockGetAttached.mockImplementation(async () => mockAttached);
    mockResubmit.mockResolvedValue({
      approval_request_id: 31,
      status: "pending",
      auto_approved: false,
    });
  });

  it("offers a non-admin editor Resubmit for approval on a rejected use case", async () => {
    renderWithProviders(
      <UseCaseLifecyclePanel
        project={project({ approval_workflow_id: 3, approval_status: "rejected" })}
      />,
    );
    expect(await screen.findByTestId("lifecycle-workflow-resubmit")).toHaveTextContent(
      "Resubmit for approval",
    );
    // Changing the workflow still needs an approval workflow admin.
    expect(screen.queryByTestId("lifecycle-workflow-action")).toBeNull();
    expect(screen.getByTestId("lifecycle-workflow-locked")).toBeInTheDocument();
  });

  it("confirms, sends the resubmission and refreshes the use case", async () => {
    const onChanged = vi.fn();
    renderWithProviders(
      <UseCaseLifecyclePanel
        project={project({ approval_workflow_id: 3, approval_status: "rejected" })}
        onChanged={onChanged}
      />,
    );
    const dialog = await resubmitDialog();
    expect(
      within(dialog).getByText("Send this use case for approval again with Model risk review?"),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByText("It moves to In review until the request is approved or rejected."),
    ).toBeInTheDocument();
    expect(within(dialog).queryByText(/auto-approve level/)).toBeNull();

    fireEvent.click(within(dialog).getByRole("button", { name: "Resubmit" }));
    await waitFor(() => expect(mockResubmit).toHaveBeenCalledWith({ id: 7 }));
    expect(mockResubmit).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
    expect(await screen.findByText("The use case was sent for approval.")).toBeInTheDocument();
    // The attached workflow and its status are read again.
    await waitFor(() => expect(mockGetAttached).toHaveBeenCalledTimes(2));
  });

  // A person rejected it, so the server never auto-approves a resubmission;
  // the dialog makes no such promise, even for an auto-approve workflow.
  it("never mentions auto-approval, even for an auto-approve workflow", async () => {
    renderWithProviders(
      <UseCaseLifecyclePanel
        project={project({
          approval_workflow_id: 5,
          approval_status: "rejected",
          lifecycle_stage: LifecycleStage.LIVE,
        })}
      />,
    );
    const dialog = await resubmitDialog();
    expect(within(dialog).queryByText(/auto-approve level/)).toBeNull();
    // Only a planned use case moves to In review.
    expect(within(dialog).queryByText(/It moves to In review/)).toBeNull();
    expect(within(dialog).queryByTestId("lifecycle-resubmit-notes")).toBeNull();
    fireEvent.click(within(dialog).getByRole("button", { name: "Resubmit" }));
    expect(await screen.findByText("The use case was sent for approval.")).toBeInTheDocument();
  });

  it("shows the server's refusal in the modal", async () => {
    const reason =
      "Every step of the selected approval workflow needs an approver. Ask an approval workflow admin to change this use case's approval workflow.";
    mockResubmit.mockRejectedValue(
      new CustomException(reason, 400, { message: "Bad Request", data: reason }),
    );
    renderWithProviders(
      <UseCaseLifecyclePanel
        project={project({ approval_workflow_id: 3, approval_status: "rejected" })}
      />,
    );
    const dialog = await resubmitDialog();
    fireEvent.click(within(dialog).getByRole("button", { name: "Resubmit" }));
    expect(
      await within(dialog).findByText(
        "Every step of the selected approval workflow needs an approver. Ask an approval workflow admin to change this use case's approval workflow.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("does not offer it when the workflow is archived, and shows the admin hint", async () => {
    renderWithProviders(
      <UseCaseLifecyclePanel
        project={project({ approval_workflow_id: 99, approval_status: "rejected" })}
      />,
    );
    expect(await screen.findByText("Old review (archived)")).toBeInTheDocument();
    expect(screen.queryByTestId("lifecycle-workflow-resubmit")).toBeNull();
    expect(screen.getByTestId("lifecycle-workflow-locked")).toHaveTextContent(
      "Only an approval workflow admin can change it while approval is pending or rejected.",
    );
  });

  it("does not offer it while approval is pending", async () => {
    renderWithProviders(
      <UseCaseLifecyclePanel
        project={project({ approval_workflow_id: 3, approval_status: "pending" })}
      />,
    );
    expect(await screen.findByText("Pending approval")).toBeInTheDocument();
    expect(screen.queryByTestId("lifecycle-workflow-resubmit")).toBeNull();
  });

  it("does not offer it when there is no rejection or no workflow", async () => {
    const { unmount } = renderWithProviders(
      <UseCaseLifecyclePanel
        project={project({ approval_workflow_id: 3, approval_status: null })}
      />,
    );
    expect(await screen.findByText("Model risk review")).toBeInTheDocument();
    expect(screen.queryByTestId("lifecycle-workflow-resubmit")).toBeNull();
    unmount();

    renderWithProviders(
      <UseCaseLifecyclePanel
        project={project({ approval_workflow_id: null, approval_status: "rejected" })}
      />,
    );
    await waitFor(() =>
      expect(screen.getByTestId("lifecycle-workflow-title")).toHaveTextContent("None"),
    );
    expect(screen.queryByTestId("lifecycle-workflow-resubmit")).toBeNull();
  });

  it("does not offer it to an owner without useCase.edit", async () => {
    mockRole = "Reviewer";
    mockPermissions = [];
    renderWithProviders(
      <UseCaseLifecyclePanel
        project={project({ approval_workflow_id: 3, approval_status: "rejected" })}
      />,
    );
    expect(await screen.findByText("Model risk review")).toBeInTheDocument();
    expect(screen.queryByTestId("lifecycle-workflow-resubmit")).toBeNull();
  });

  // The server allows useCase.edit plus write access: members, not only the
  // owner.
  it("offers it to a member with useCase.edit who does not own the use case", async () => {
    mockUserId = 2;
    renderWithProviders(
      <UseCaseLifecyclePanel
        project={project({
          approval_workflow_id: 3,
          approval_status: "rejected",
          members: ["2"],
        })}
      />,
    );
    expect(await screen.findByTestId("lifecycle-workflow-resubmit")).toBeInTheDocument();
  });

  it("offers it to an Admin who is neither owner nor member", async () => {
    mockRole = "Admin";
    mockUserId = 2;
    renderWithProviders(
      <UseCaseLifecyclePanel
        project={project({ approval_workflow_id: 3, approval_status: "rejected", members: [] })}
      />,
    );
    expect(await screen.findByTestId("lifecycle-workflow-resubmit")).toBeInTheDocument();
  });

  // Task assignees and workflow approvers can open the use case but only read
  // it; the server answers 403 to their resubmit.
  it("does not offer it to an editor without write access to this use case", async () => {
    mockUserId = 2;
    renderWithProviders(
      <UseCaseLifecyclePanel
        project={project({ approval_workflow_id: 3, approval_status: "rejected", members: [] })}
      />,
    );
    expect(await screen.findByText("Model risk review")).toBeInTheDocument();
    expect(screen.queryByTestId("lifecycle-workflow-resubmit")).toBeNull();
  });

  it("does not offer it to an Auditor", async () => {
    mockRole = "Auditor";
    renderWithProviders(
      <UseCaseLifecyclePanel
        project={project({ approval_workflow_id: 3, approval_status: "rejected" })}
      />,
    );
    expect(await screen.findByText("Model risk review")).toBeInTheDocument();
    expect(screen.queryByTestId("lifecycle-workflow-resubmit")).toBeNull();
  });
});
