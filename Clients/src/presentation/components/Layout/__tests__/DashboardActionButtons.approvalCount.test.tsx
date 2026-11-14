import { vi } from "vitest";
import { act, waitFor } from "@testing-library/react";

const repo = vi.hoisted(() => ({
  getPendingApprovals: vi.fn(),
  getMyApprovalRequests: vi.fn(),
}));
vi.mock("../../../../application/repository/approvalRequest.repository", () => repo);
vi.mock("../../Modals/RequestorApprovalModal", () => ({ default: () => null }));
vi.mock("../../NotificationBell", () => ({ default: () => null }));
vi.mock("../../../../application/hooks/useCan", () => ({ useCan: () => false }));

import { renderWithProviders } from "../../../../test/renderWithProviders";
import { DashboardActionButtons } from "../DashboardActionButtons";
import { dispatchApprovalRequestsChanged } from "../../../../application/events/approvalRequestEvents";

describe("DashboardActionButtons approval count", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    repo.getPendingApprovals.mockResolvedValue({ data: [] });
    repo.getMyApprovalRequests.mockResolvedValue({ data: [] });
  });

  it("refetches the count when a request is decided elsewhere", async () => {
    renderWithProviders(<DashboardActionButtons />, { route: "/tasks" });
    await waitFor(() => expect(repo.getPendingApprovals).toHaveBeenCalledTimes(1));

    act(() => dispatchApprovalRequestsChanged());

    await waitFor(() => expect(repo.getPendingApprovals).toHaveBeenCalledTimes(2));
    expect(repo.getMyApprovalRequests).toHaveBeenCalledTimes(2);
  });
});
