import { vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";

vi.mock("../../StandardModal", () => ({
  default: ({ isOpen, children, customFooter }: any) =>
    isOpen ? (
      <div data-testid="standard-modal">
        {children}
        <div data-testid="modal-footer">{customFooter}</div>
      </div>
    ) : null,
}));
vi.mock("../../../Inputs/Field", () => ({
  default: () => <textarea data-testid="comment-field" />,
}));
vi.mock("../../../TabBar", () => ({
  default: () => <div data-testid="tab-bar" />,
}));

const repo = vi.hoisted(() => ({
  getPendingApprovals: vi.fn(),
  getMyApprovalRequests: vi.fn(),
  getApprovalRequestById: vi.fn(),
  approveRequest: vi.fn(),
  rejectRequest: vi.fn(),
  withdrawRequest: vi.fn(),
}));
vi.mock("../../../../../application/repository/approvalRequest.repository", () => repo);

const alerts = vi.hoisted(() => ({ showAlert: vi.fn() }));
vi.mock("../../../../../application/tools/alertUtils", () => alerts);

const policyEvents = vi.hoisted(() => ({ dispatchPolicyApprovalChanged: vi.fn() }));
vi.mock("../../../../../application/events/policyEvents", () => policyEvents);

import { renderWithProviders } from "../../../../../test/renderWithProviders";
import RequestorApprovalModal from "../index";

const policyRequest = (status: string) => ({
  data: {
    id: 1,
    request_name: "Acceptable use policy",
    status,
    entity_type: "policy",
    entity_id: 42,
    steps: [
      {
        id: 10,
        step_name: "Legal review",
        status: status === "Pending" ? "Pending" : "Completed",
        approvals: [
          { approver_id: 5, name: "Ada", surname: "Lovelace", approval_result: "Pending" },
        ],
      },
    ],
  },
});

describe("RequestorApprovalModal policy requests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    repo.getMyApprovalRequests.mockResolvedValue({ data: [] });
    repo.getPendingApprovals.mockResolvedValueOnce({
      data: [{ id: 1, request_name: "Acceptable use policy", status: "Pending" }],
    });
    repo.getPendingApprovals.mockResolvedValue({ data: [] });
    repo.getApprovalRequestById.mockResolvedValueOnce(policyRequest("Pending"));
  });

  it("tells the policy pages when the final approval approves the policy", async () => {
    repo.getApprovalRequestById.mockResolvedValue(policyRequest("Approved"));
    repo.approveRequest.mockResolvedValue({ data: {} });
    renderWithProviders(<RequestorApprovalModal isOpen={true} onClose={vi.fn()} />);
    await screen.findByText("Ada Lovelace");

    fireEvent.click(screen.getByRole("button", { name: "Approve" }));

    await waitFor(() =>
      expect(policyEvents.dispatchPolicyApprovalChanged).toHaveBeenCalledWith({
        policyId: 42,
        status: "approved",
      }),
    );
  });

  it("does not refresh the policy while the request still waits on another step", async () => {
    repo.getApprovalRequestById.mockResolvedValue(policyRequest("Pending"));
    repo.approveRequest.mockResolvedValue({ data: {} });
    renderWithProviders(<RequestorApprovalModal isOpen={true} onClose={vi.fn()} />);
    await screen.findByText("Ada Lovelace");

    fireEvent.click(screen.getByRole("button", { name: "Approve" }));

    await waitFor(() => expect(alerts.showAlert).toHaveBeenCalled());
    expect(policyEvents.dispatchPolicyApprovalChanged).not.toHaveBeenCalled();
  });

  it("tells the policy pages when the request is rejected", async () => {
    repo.getApprovalRequestById.mockResolvedValue(policyRequest("Pending"));
    repo.rejectRequest.mockResolvedValue({ data: {} });
    renderWithProviders(<RequestorApprovalModal isOpen={true} onClose={vi.fn()} />);
    await screen.findByText("Ada Lovelace");

    fireEvent.click(screen.getByRole("button", { name: "Reject" }));

    await waitFor(() =>
      expect(policyEvents.dispatchPolicyApprovalChanged).toHaveBeenCalledWith({
        policyId: 42,
        status: "rejected",
      }),
    );
  });

  it("tells the policy pages when the requester withdraws the request", async () => {
    // Only in the requester's own list, opened from a link.
    repo.getPendingApprovals.mockReset();
    repo.getPendingApprovals.mockResolvedValue({ data: [] });
    repo.getMyApprovalRequests.mockResolvedValue({
      data: [{ id: 1, request_name: "Acceptable use policy", status: "Pending" }],
    });
    repo.getApprovalRequestById.mockResolvedValue(policyRequest("Pending"));
    repo.withdrawRequest.mockResolvedValue({ data: {} });
    renderWithProviders(
      <RequestorApprovalModal isOpen={true} onClose={vi.fn()} initialRequestId={1} />,
    );
    await screen.findByText("Ada Lovelace");

    fireEvent.click(screen.getByRole("button", { name: "Withdraw" }));
    const confirmButtons = await screen.findAllByRole("button", { name: "Withdraw" });
    fireEvent.click(confirmButtons[confirmButtons.length - 1]);

    await waitFor(() => expect(repo.withdrawRequest).toHaveBeenCalledWith({ id: 1 }));
    await waitFor(() =>
      expect(policyEvents.dispatchPolicyApprovalChanged).toHaveBeenCalledWith({
        policyId: 42,
        status: "withdrawn",
      }),
    );
  });
});
