import { vi } from "vitest";
import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { QueryClient } from "@tanstack/react-query";
import { HOME_QUEUE_QUERY_KEY } from "../../../../application/hooks/useHomeQueue";

const repo = vi.hoisted(() => ({
  getPendingApprovals: vi.fn(),
  getMyApprovalRequests: vi.fn(),
}));
vi.mock("../../../../application/repository/approvalRequest.repository", () => repo);
vi.mock("../../Modals/RequestorApprovalModal", () => ({
  default: ({ onRefresh }: any) => <button onClick={onRefresh}>Decide request</button>,
}));
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

  it("refreshes the count and the Home queue after a decision in the modal", async () => {
    const queryClient = new QueryClient();
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");
    renderWithProviders(<DashboardActionButtons />, { route: "/tasks", queryClient });
    await waitFor(() => expect(repo.getPendingApprovals).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByRole("button", { name: "Decide request" }));

    expect(invalidate).toHaveBeenCalledWith({ queryKey: HOME_QUEUE_QUERY_KEY });
    await waitFor(() => expect(repo.getPendingApprovals).toHaveBeenCalledTimes(2));
  });
});
