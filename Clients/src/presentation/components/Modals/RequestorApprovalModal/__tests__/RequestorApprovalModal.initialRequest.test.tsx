import { vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";

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

const request = (id: number, name: string) => ({
  data: { id, request_name: name, status: "Pending", entity_type: "use_case", steps: [] },
});

describe("RequestorApprovalModal initialRequestId (Home deep link)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    repo.getApprovalRequestById.mockImplementation(({ id }: { id: number }) =>
      Promise.resolve(request(id, `Request ${id}`)),
    );
  });

  it("opens on the linked request instead of the first one", async () => {
    repo.getPendingApprovals.mockResolvedValue({
      data: [
        { id: 1, request_name: "First", status: "Pending" },
        { id: 2, request_name: "Linked", status: "Pending" },
      ],
    });
    repo.getMyApprovalRequests.mockResolvedValue({ data: [] });

    renderWithProviders(
      <RequestorApprovalModal isOpen={true} onClose={vi.fn()} initialRequestId={2} />,
    );

    await waitFor(() => expect(repo.getApprovalRequestById).toHaveBeenCalled());
    expect(repo.getApprovalRequestById).toHaveBeenCalledWith({ id: 2 });
    expect(repo.getApprovalRequestById).not.toHaveBeenCalledWith({ id: 1 });
  });

  it("finds a linked request among the user's own submissions", async () => {
    repo.getPendingApprovals.mockResolvedValue({
      data: [{ id: 1, request_name: "First", status: "Pending" }],
    });
    repo.getMyApprovalRequests.mockResolvedValue({
      data: [{ id: 7, request_name: "Mine", status: "Pending" }],
    });

    renderWithProviders(
      <RequestorApprovalModal isOpen={true} onClose={vi.fn()} initialRequestId={7} />,
    );

    await waitFor(() => expect(repo.getApprovalRequestById).toHaveBeenCalledWith({ id: 7 }));
    expect(repo.getApprovalRequestById).not.toHaveBeenCalledWith({ id: 1 });
    // The withdraw action belongs to the My submissions view.
    expect(await screen.findByRole("button", { name: "Withdraw" })).toBeInTheDocument();
  });

  it("falls back to the first request when the linked one is not in either list", async () => {
    repo.getPendingApprovals.mockResolvedValue({
      data: [{ id: 1, request_name: "First", status: "Pending" }],
    });
    repo.getMyApprovalRequests.mockResolvedValue({ data: [] });

    renderWithProviders(
      <RequestorApprovalModal isOpen={true} onClose={vi.fn()} initialRequestId={99} />,
    );

    await waitFor(() => expect(repo.getApprovalRequestById).toHaveBeenCalledWith({ id: 1 }));
    expect(alerts.showAlert).toHaveBeenCalledWith({
      variant: "info",
      body: "That request is no longer waiting on you.",
      isToast: true,
    });
  });

  it("does not show the notice when the linked request is found", async () => {
    repo.getPendingApprovals.mockResolvedValue({
      data: [{ id: 2, request_name: "Linked", status: "Pending" }],
    });
    repo.getMyApprovalRequests.mockResolvedValue({ data: [] });

    renderWithProviders(
      <RequestorApprovalModal isOpen={true} onClose={vi.fn()} initialRequestId={2} />,
    );

    await waitFor(() => expect(repo.getApprovalRequestById).toHaveBeenCalledWith({ id: 2 }));
    expect(alerts.showAlert).not.toHaveBeenCalled();
  });
});
