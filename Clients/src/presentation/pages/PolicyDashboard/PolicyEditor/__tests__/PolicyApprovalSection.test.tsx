import { vi } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import type { PolicyApprovalState } from "../../../../../domain/interfaces/i.policy";

const repo = vi.hoisted(() => ({
  getPolicyApproval: vi.fn(),
  submitPolicyForApproval: vi.fn(),
  approvePolicyDirectly: vi.fn(),
}));
vi.mock("../../../../../application/repository/policy.repository", () => repo);

const approvalRepo = vi.hoisted(() => ({ withdrawRequest: vi.fn() }));
vi.mock("../../../../../application/repository/approvalRequest.repository", () => approvalRepo);

const perms = vi.hoisted(() => ({ isAdmin: false }));
vi.mock("../../../../../application/hooks/useCan", () => ({
  useCan: (key: string) => (key === "organization.admin" ? perms.isAdmin : true),
}));

vi.mock("../../../../../application/hooks/useFormattedDate", () => ({
  default: () => (d: string | null) => (d ? d.slice(0, 10) : "—"),
}));

import { renderWithProviders } from "../../../../../test/renderWithProviders";
import { PolicyApprovalSection } from "../PolicyApprovalSection";

const baseState: PolicyApprovalState = {
  usable_workflows: [],
  pending_request: null,
  review_status: null,
  review_comment: null,
  reviewed_by: null,
  reviewed_by_name: null,
  reviewed_at: null,
  can_submit: false,
  can_approve_directly: false,
  can_withdraw: false,
};

const workflowA = { id: 3, workflow_title: "Legal review", step_count: 2 };
const workflowB = { id: 7, workflow_title: "Board review", step_count: 1 };

function renderSection(
  state: Partial<PolicyApprovalState> | null,
  props: Partial<React.ComponentProps<typeof PolicyApprovalSection>> = {},
) {
  if (state) repo.getPolicyApproval.mockResolvedValue({ ...baseState, ...state });
  const onPolicyChanged = vi.fn();
  renderWithProviders(
    <PolicyApprovalSection
      policyId={12}
      policyStatus="Draft"
      hasUnsavedChanges={false}
      canEdit
      onPolicyChanged={onPolicyChanged}
      {...props}
    />,
  );
  return { onPolicyChanged };
}

describe("PolicyApprovalSection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    perms.isAdmin = false;
  });

  it("asks to save a new policy before it can be submitted", () => {
    renderSection(null, { policyId: null, policyStatus: null });
    expect(screen.getByTestId("policy-submit-for-approval")).toBeDisabled();
    expect(
      screen.getByText("Save the policy before submitting it for approval."),
    ).toBeInTheDocument();
    expect(repo.getPolicyApproval).not.toHaveBeenCalled();
  });

  it("renders nothing for a new policy when the user cannot edit", () => {
    renderSection(null, { policyId: null, policyStatus: null, canEdit: false });
    expect(screen.queryByTestId("policy-approval-section")).not.toBeInTheDocument();
  });

  it("shows the pending request with its step and requester, and withdraws it", async () => {
    approvalRepo.withdrawRequest.mockResolvedValue({ data: {} });
    const { onPolicyChanged } = renderSection(
      {
        usable_workflows: [workflowA],
        pending_request: {
          id: 55,
          workflow_id: 3,
          workflow_title: "Legal review",
          current_step: 1,
          total_steps: 2,
          requested_by: 4,
          requested_by_name: "Ada Lovelace",
          created_at: "2026-11-10T09:00:00Z",
        },
        can_withdraw: true,
      },
      { policyStatus: "Under Review" },
    );

    const pending = await screen.findByTestId("policy-approval-pending");
    expect(within(pending).getByText("Waiting for approval in Legal review")).toBeInTheDocument();
    expect(within(pending).getByText("Step 1 of 2")).toBeInTheDocument();
    expect(
      within(pending).getByText("Requested by Ada Lovelace on 2026-11-10"),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("policy-submit-for-approval")).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId("policy-withdraw-approval"));
    fireEvent.click(await screen.findByRole("button", { name: "Withdraw" }));

    await waitFor(() =>
      expect(approvalRepo.withdrawRequest).toHaveBeenCalledWith({
        id: 55,
        suppressGlobalErrorToast: true,
      }),
    );
    await waitFor(() => expect(onPolicyChanged).toHaveBeenCalled());
  });

  it("shows the server's reason when the withdraw is refused", async () => {
    approvalRepo.withdrawRequest.mockRejectedValue(
      Object.assign(new Error("Conflict"), {
        status: 409,
        response: { data: "This approval request is no longer pending" },
      }),
    );
    renderSection(
      {
        pending_request: {
          id: 55,
          workflow_id: 3,
          workflow_title: "Legal review",
          current_step: 2,
          total_steps: 2,
          requested_by: 4,
          requested_by_name: null,
          created_at: "2026-11-10T09:00:00Z",
        },
        can_withdraw: true,
      },
      { policyStatus: "Under Review" },
    );

    expect(await screen.findByText("Requested on 2026-11-10")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("policy-withdraw-approval"));
    fireEvent.click(await screen.findByRole("button", { name: "Withdraw" }));

    const message = await screen.findByText("This approval request is no longer pending");
    // Under the withdraw button, not a fixed toast in the corner.
    expect(message.closest('[role="alert"]')).toHaveStyle({ position: "static" });
  });

  it("shows who approved the policy and when", async () => {
    renderSection(
      {
        review_status: "approved",
        reviewed_by_name: "Grace Hopper",
        reviewed_at: "2026-11-12T10:00:00Z",
        review_comment: "Looks good",
      },
      { policyStatus: "Approved" },
    );
    const decision = await screen.findByTestId("policy-approval-decision");
    expect(
      within(decision).getByText("Approved by Grace Hopper on 2026-11-12"),
    ).toBeInTheDocument();
    expect(within(decision).getByText("Looks good")).toBeInTheDocument();
  });

  it("shows who asked for changes with their comment", async () => {
    renderSection({
      review_status: "changes_requested",
      reviewed_by_name: "Grace Hopper",
      reviewed_at: "2026-11-12T10:00:00Z",
      review_comment: "Add a retention section",
      usable_workflows: [workflowA],
      can_submit: true,
    });
    const decision = await screen.findByTestId("policy-approval-decision");
    expect(within(decision).getByText("Changes requested by Grace Hopper")).toBeInTheDocument();
    expect(within(decision).getByText("Add a retention section")).toBeInTheDocument();
    expect(screen.getByTestId("policy-submit-for-approval")).toBeEnabled();
  });

  it("disables submit with a reason while the editor has unsaved changes", async () => {
    renderSection({ usable_workflows: [workflowA], can_submit: true }, { hasUnsavedChanges: true });
    expect(await screen.findByTestId("policy-submit-for-approval")).toBeDisabled();
    expect(screen.getByTestId("policy-approval-unsaved-hint")).toBeInTheDocument();
  });

  it("submits to the only usable workflow without asking which", async () => {
    repo.submitPolicyForApproval.mockResolvedValue({ request_id: 9, policy: { id: 12 } });
    const { onPolicyChanged } = renderSection({ usable_workflows: [workflowA], can_submit: true });

    fireEvent.click(await screen.findByTestId("policy-submit-for-approval"));
    expect(
      screen.getByText(
        "Legal review approves this policy. It stays under review until a decision.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("policy-approval-workflow-select")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Submit" }));

    await waitFor(() => expect(repo.submitPolicyForApproval).toHaveBeenCalledWith(12, undefined));
    await waitFor(() => expect(onPolicyChanged).toHaveBeenCalled());
  });

  it("asks for a workflow when more than one is usable", async () => {
    repo.submitPolicyForApproval.mockResolvedValue({ request_id: 9, policy: { id: 12 } });
    renderSection({ usable_workflows: [workflowA, workflowB], can_submit: true });

    fireEvent.click(await screen.findByTestId("policy-submit-for-approval"));
    expect(screen.getByText("Choose the workflow that approves this policy.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Submit" })).toBeDisabled();

    fireEvent.mouseDown(
      within(screen.getByTestId("policy-approval-workflow-select")).getByRole("combobox"),
    );
    fireEvent.click(await screen.findByRole("option", { name: "Board review" }));
    fireEvent.click(screen.getByRole("button", { name: "Submit" }));

    await waitFor(() => expect(repo.submitPolicyForApproval).toHaveBeenCalledWith(12, 7));
  });

  it("shows the server's reason when the submit is refused", async () => {
    repo.submitPolicyForApproval.mockRejectedValue(
      Object.assign(new Error("Bad Request"), {
        status: 400,
        response: {
          data: {
            message: "Bad Request",
            errors: [{ field: "workflow_id", message: "Choose an approval workflow" }],
          },
        },
      }),
    );
    renderSection({ usable_workflows: [workflowA], can_submit: true });

    fireEvent.click(await screen.findByTestId("policy-submit-for-approval"));
    fireEvent.click(screen.getByRole("button", { name: "Submit" }));

    expect(await screen.findByText("Choose an approval workflow")).toBeInTheDocument();
  });

  it("lets an Admin approve directly with an optional comment", async () => {
    perms.isAdmin = true;
    repo.approvePolicyDirectly.mockResolvedValue({ id: 12, status: "Approved" });
    const { onPolicyChanged } = renderSection({ can_approve_directly: true });

    fireEvent.click(await screen.findByTestId("policy-approve-directly"));
    const modal = screen.getByText("Approve policy").closest("[role='dialog']") as HTMLElement;
    fireEvent.change(within(modal).getByRole("textbox"), { target: { value: "  Signed off  " } });
    fireEvent.click(within(modal).getByRole("button", { name: "Approve" }));

    await waitFor(() => expect(repo.approvePolicyDirectly).toHaveBeenCalledWith(12, "Signed off"));
    await waitFor(() => expect(onPolicyChanged).toHaveBeenCalled());
    expect(screen.queryByTestId("policy-approval-no-workflow")).not.toBeInTheDocument();
  });

  it("blocks a direct-approve comment over 2000 characters", async () => {
    perms.isAdmin = true;
    renderSection({ can_approve_directly: true });

    fireEvent.click(await screen.findByTestId("policy-approve-directly"));
    const modal = screen.getByText("Approve policy").closest("[role='dialog']") as HTMLElement;
    fireEvent.change(within(modal).getByRole("textbox"), { target: { value: "x".repeat(2001) } });

    expect(within(modal).getByText("Comment must be 2000 characters or fewer")).toBeInTheDocument();
    expect(within(modal).getByRole("button", { name: "Approve" })).toBeDisabled();
  });

  it("tells a non-Admin that an Admin approves when there is no workflow", async () => {
    renderSection({});
    expect(await screen.findByTestId("policy-approval-no-workflow")).toHaveTextContent(
      "An Admin approves this policy. Your organization has no policy approval workflow.",
    );
    expect(screen.queryByTestId("policy-submit-for-approval")).not.toBeInTheDocument();
    expect(screen.queryByTestId("policy-approve-directly")).not.toBeInTheDocument();
  });

  it("renders nothing for a published policy with no decision or action", async () => {
    renderSection({ usable_workflows: [workflowA] }, { policyStatus: "Published" });
    await waitFor(() => expect(repo.getPolicyApproval).toHaveBeenCalledWith(12));
    await waitFor(() =>
      expect(screen.queryByTestId("policy-approval-section")).not.toBeInTheDocument(),
    );
  });

  it("says so when the approval state cannot be loaded", async () => {
    repo.getPolicyApproval.mockRejectedValue(new Error("network down"));
    renderSection(null);
    expect(await screen.findByText("Could not load the approval status.")).toBeInTheDocument();
  });
});
