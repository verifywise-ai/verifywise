import { renderHook, act } from "@testing-library/react";
import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useBulkUpdateFiles } from "../useBulkUpdateFiles";

const mockBulkUpdateFileTags = vi.fn();
const mockAssignFilesToFolder = vi.fn();

vi.mock("../../repository/file.repository", () => ({
  bulkUpdateFileTags: (...args: unknown[]) => mockBulkUpdateFileTags(...args),
}));

vi.mock("../../repository/virtualFolder.repository", () => ({
  assignFilesToFolder: (...args: unknown[]) => mockAssignFilesToFolder(...args),
}));

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
}

describe("useBulkUpdateFiles", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("should call assignFilesToFolder for move_to_folder action", async () => {
    mockAssignFilesToFolder.mockResolvedValue({ success: true });

    const { result } = renderHook(() => useBulkUpdateFiles(), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      await result.current.mutateAsync({ type: "move_to_folder", folderId: 5, ids: [1, 2] });
    });

    expect(mockAssignFilesToFolder).toHaveBeenCalledWith(5, [1, 2]);
    expect(mockBulkUpdateFileTags).not.toHaveBeenCalled();
  });

  it("should call bulkUpdateFileTags for update_tags action", async () => {
    mockBulkUpdateFileTags.mockResolvedValue({ success: true });

    const { result } = renderHook(() => useBulkUpdateFiles(), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      await result.current.mutateAsync({
        type: "update_tags",
        payload: { ids: [1], tags: ["important"], mode: "set" },
      });
    });

    expect(mockBulkUpdateFileTags).toHaveBeenCalledWith({
      ids: [1],
      tags: ["important"],
      mode: "set",
    });
    expect(mockAssignFilesToFolder).not.toHaveBeenCalled();
  });

  it("should call onSuccess callback when mutation succeeds", async () => {
    const onSuccess = vi.fn();
    mockAssignFilesToFolder.mockResolvedValue({ success: true });

    const { result } = renderHook(() => useBulkUpdateFiles({ onSuccess }), {
      wrapper: createWrapper(),
    });

    const action = { type: "move_to_folder" as const, folderId: 1, ids: [1] };
    await act(async () => {
      await result.current.mutateAsync(action);
    });

    expect(onSuccess).toHaveBeenCalledWith(action);
  });

  it("should call onError callback when mutation fails", async () => {
    const onError = vi.fn();
    const testError = new Error("Network error");
    mockBulkUpdateFileTags.mockRejectedValue(testError);

    const { result } = renderHook(() => useBulkUpdateFiles({ onError }), {
      wrapper: createWrapper(),
    });

    const action = {
      type: "update_tags" as const,
      payload: { ids: [1], tags: ["test"], mode: "set" as const },
    };
    await act(async () => {
      try {
        await result.current.mutateAsync(action);
      } catch {
        // expected
      }
    });

    expect(onError).toHaveBeenCalledWith(testError, action);
  });
});
