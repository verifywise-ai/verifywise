import { vi } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";

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

import { renderWithProviders } from "../../../../../test/renderWithProviders";
import RequestorApprovalModal from "../index";

// One step that needs both approvers; Ada (the viewer) approves first.
const requestWithStep = (adaResult: string) => ({
  data: {
    id: 1,
    request_name: "Chatbot use case",
    status: "Pending",
    entity_type: "use_case",
    steps: [
      {
        id: 10,
        step_name: "Legal review",
        status: "Pending",
        approvals: [
          { approver_id: 5, name: "Ada", surname: "Lovelace", approval_result: adaResult },
          {
            approver_id: 6,
            name: "Grace",
            surname: "Hopper",
            approval_result: "Pending",
            comments: null,
          },
        ],
      },
    ],
  },
});

describe("RequestorApprovalModal approvers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    repo.getMyApprovalRequests.mockResolvedValue({ data: [] });
    repo.getPendingApprovals.mockResolvedValueOnce({
      data: [{ id: 1, request_name: "Chatbot use case", status: "Pending" }],
    });
    // After Ada votes, the request is no longer waiting on her.
    repo.getPendingApprovals.mockResolvedValue({ data: [] });
    repo.getApprovalRequestById.mockResolvedValueOnce(requestWithStep("Pending"));
    repo.getApprovalRequestById.mockResolvedValue(requestWithStep("Approved"));
    repo.approveRequest.mockResolvedValue({ data: {} });
  });

  it("lists every approver on the step with their own status", async () => {
    renderWithProviders(<RequestorApprovalModal isOpen={true} onClose={vi.fn()} />);

    expect(await screen.findByText("Ada Lovelace")).toBeInTheDocument();
    expect(screen.getByText("Grace Hopper")).toBeInTheDocument();
    expect(screen.getByText("Approvers")).toBeInTheDocument();
    for (const name of ["Ada Lovelace", "Grace Hopper"]) {
      const row = screen.getByText(name).parentElement!;
      expect(within(row).getByText("Pending")).toBeInTheDocument();
    }
  });

  it("tells the approver the step is still waiting on others", async () => {
    const onClose = vi.fn();
    renderWithProviders(<RequestorApprovalModal isOpen={true} onClose={onClose} />);
    await screen.findByText("Ada Lovelace");

    fireEvent.click(screen.getByRole("button", { name: "Approve" }));

    await waitFor(() =>
      expect(alerts.showAlert).toHaveBeenCalledWith({
        variant: "success",
        body: "Your approval is recorded. Waiting on 1 more approver for this step.",
        isToast: true,
      }),
    );
    expect(repo.approveRequest).toHaveBeenCalledWith({ id: 1, body: { comments: "" } });
    expect(onClose).not.toHaveBeenCalled();
  });

  it("still reports the approval when the refresh after it fails", async () => {
    renderWithProviders(<RequestorApprovalModal isOpen={true} onClose={vi.fn()} />);
    await screen.findByText("Ada Lovelace");
    repo.getApprovalRequestById.mockReset();
    repo.getApprovalRequestById.mockRejectedValue(new Error("network down"));

    fireEvent.click(screen.getByRole("button", { name: "Approve" }));

    await waitFor(() =>
      expect(alerts.showAlert).toHaveBeenCalledWith({
        variant: "success",
        body: "Your approval is recorded.",
        isToast: true,
      }),
    );
    expect(screen.queryByText(/Failed to approve/)).not.toBeInTheDocument();
  });
});
