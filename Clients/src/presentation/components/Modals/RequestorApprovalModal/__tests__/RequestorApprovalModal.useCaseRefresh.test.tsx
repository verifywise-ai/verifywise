import { vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { QueryClient } from "@tanstack/react-query";

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
vi.mock("../../../../../application/tools/alertUtils", () => ({ showAlert: vi.fn() }));

import { renderWithProviders } from "../../../../../test/renderWithProviders";
import RequestorApprovalModal from "../index";

describe("RequestorApprovalModal and the use case overview", () => {
  it("refreshes use case approval workflows after a decision", async () => {
    repo.getPendingApprovals.mockResolvedValue({
      data: [{ id: 3, request_name: "Use Case: Credit scoring", status: "pending" }],
    });
    repo.getMyApprovalRequests.mockResolvedValue({ data: [] });
    repo.getApprovalRequestById.mockResolvedValue({
      data: {
        id: 3,
        request_name: "Use Case: Credit scoring",
        status: "pending",
        entity_type: "use_case",
        steps: [],
      },
    });
    repo.approveRequest.mockResolvedValue({});
    const queryClient = new QueryClient();
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");

    renderWithProviders(<RequestorApprovalModal isOpen onClose={vi.fn()} onRefresh={vi.fn()} />, {
      queryClient,
    });
    fireEvent.click(await screen.findByRole("button", { name: "Approve" }));

    await waitFor(() => expect(repo.approveRequest).toHaveBeenCalled());
    await waitFor(() =>
      expect(invalidate).toHaveBeenCalledWith({ queryKey: ["useCaseApprovalWorkflow"] }),
    );
  });
});
