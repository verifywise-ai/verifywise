import type { PropsWithChildren } from "react";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  useCreateTrainingAssignments,
  useMyTrainingAssignments,
  useTrainingAssignments,
  trainingAssignmentKeys,
} from "../useTrainingAssignments";
import {
  completeAllTrainingAssignments,
  completeTrainingAssignment,
  deleteTrainingAssignment,
  getTrainingAssignmentSummary,
  reopenTrainingAssignment,
  updateTrainingAssignmentDueDate,
} from "../../repository/trainingAssignment.repository";

const { api } = vi.hoisted(() => ({
  api: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}));

vi.mock("../../../infrastructure/api/networkServices", () => ({ apiServices: api }));

const NO_TOAST = { suppressGlobalErrorToast: true };
const envelope = (data: unknown) => ({ data: { message: "OK", data } });

const setup = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const wrapper = ({ children }: PropsWithChildren) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return { queryClient, wrapper };
};

describe("training assignment repository", () => {
  beforeEach(() => vi.clearAllMocks());

  it("reads the summary from the response envelope", async () => {
    const rows = [{ training_id: 1, total: 5, completed: 2, overdue: 1 }];
    api.get.mockResolvedValue(envelope(rows));

    await expect(getTrainingAssignmentSummary()).resolves.toEqual(rows);
    expect(api.get).toHaveBeenCalledWith("/v1/training/assignments/summary", NO_TOAST);
  });

  it("sends each write to its route", async () => {
    api.post.mockResolvedValue(envelope({}));
    api.patch.mockResolvedValue(envelope({}));
    api.delete.mockResolvedValue(envelope({}));

    await completeAllTrainingAssignments(4);
    await completeTrainingAssignment(9);
    await reopenTrainingAssignment(9);
    await updateTrainingAssignmentDueDate({ id: 9, dueDate: "2030-01-15" });
    await deleteTrainingAssignment(9);

    const route = "/v1/training/assignments";
    expect(api.post).toHaveBeenCalledWith(`${route}/complete-all`, { training_id: 4 }, NO_TOAST);
    expect(api.post).toHaveBeenCalledWith(`${route}/9/complete`, {}, NO_TOAST);
    expect(api.post).toHaveBeenCalledWith(`${route}/9/reopen`, {}, NO_TOAST);
    expect(api.patch).toHaveBeenCalledWith(`${route}/9`, { due_date: "2030-01-15" }, NO_TOAST);
    expect(api.delete).toHaveBeenCalledWith(`${route}/9`, NO_TOAST);
  });
});

describe("training assignment hooks", () => {
  beforeEach(() => vi.clearAllMocks());

  it("loads one training's assignments by id", async () => {
    api.get.mockResolvedValue(envelope([{ id: 1 }]));
    const { wrapper } = setup();

    const { result } = renderHook(() => useTrainingAssignments(12), { wrapper });

    await waitFor(() => expect(result.current.data).toEqual([{ id: 1 }]));
    expect(api.get).toHaveBeenCalledWith("/v1/training/assignments", {
      training_id: 12,
      ...NO_TOAST,
    });
  });

  it("does not request a training without a valid id", () => {
    const { wrapper } = setup();

    renderHook(() => useTrainingAssignments(0), { wrapper });

    expect(api.get).not.toHaveBeenCalled();
  });

  it("loads the caller's own assignments", async () => {
    api.get.mockResolvedValue(envelope([{ id: 3 }]));
    const { wrapper } = setup();

    const { result } = renderHook(() => useMyTrainingAssignments(), { wrapper });

    await waitFor(() => expect(result.current.data).toEqual([{ id: 3 }]));
    expect(api.get).toHaveBeenCalledWith("/v1/training/assignments/mine", NO_TOAST);
  });

  it.each([
    ["succeeds", () => api.post.mockResolvedValue(envelope({ created: [], skipped_user_ids: [] }))],
    ["fails", () => api.post.mockRejectedValue(new Error("nope"))],
  ])("refreshes every assignment list when a write %s", async (_name, arrange) => {
    arrange();
    const { queryClient, wrapper } = setup();
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");

    const { result } = renderHook(() => useCreateTrainingAssignments(), { wrapper });
    await act(async () => {
      await result.current
        .mutateAsync({ training_id: 1, user_ids: [2], due_date: "2030-01-15" })
        .catch(() => undefined);
    });

    expect(invalidate).toHaveBeenCalledWith({ queryKey: trainingAssignmentKeys.root });
  });
});
