import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import { useBulkUpdateFiles } from "../useBulkUpdateFiles";
import { fileQueryKeys } from "../useFiles";
import { FileModel } from "../../../domain/models/Common/file/file.model";

vi.mock("../../repository/file.repository", () => ({
  bulkUpdateFileTags: vi.fn(),
}));

vi.mock("../../repository/virtualFolder.repository", () => ({
  assignFilesToFolder: vi.fn(),
}));

import { bulkUpdateFileTags } from "../../repository/file.repository";

const mockBulkUpdateFileTags = vi.mocked(bulkUpdateFileTags);

function createFile(id: string, tags: string[]): FileModel {
  return FileModel.createNewFile({
    id,
    fileName: `file-${id}.txt`,
    uploadDate: new Date("2025-01-01"),
    uploader: "user",
    tags,
  });
}

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return {
    queryClient,
    wrapper: ({ children }: { children: React.ReactNode }) =>
      React.createElement(QueryClientProvider, { client: queryClient }, children),
  };
}

describe("useBulkUpdateFiles", () => {
  beforeEach(() => vi.clearAllMocks());

  it("optimistically updates tags for selected files in set mode", async () => {
    let resolveMutation: () => void = () => {};
    mockBulkUpdateFileTags.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolveMutation = resolve;
        }),
    );

    const queryKey = fileQueryKeys.list();
    const { queryClient, wrapper } = createWrapper();

    queryClient.setQueryData(queryKey, [createFile("1", ["old"]), createFile("2", ["old"])]);

    const { result } = renderHook(() => useBulkUpdateFiles(), { wrapper });

    act(() => {
      result.current.mutate({
        type: "update_tags",
        payload: { ids: [1], tags: ["new"], mode: "set" },
      });
    });

    await waitFor(() => {
      const data = queryClient.getQueryData<FileModel[]>(queryKey);
      expect(data?.[0].tags).toEqual(["new"]);
      expect(data?.[1].tags).toEqual(["old"]);
    });

    act(() => {
      resolveMutation();
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
  });

  it("optimistically adds tags in add mode", async () => {
    let resolveMutation: () => void = () => {};
    mockBulkUpdateFileTags.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolveMutation = resolve;
        }),
    );

    const queryKey = fileQueryKeys.list();
    const { queryClient, wrapper } = createWrapper();

    queryClient.setQueryData(queryKey, [createFile("1", ["existing"])]);

    const { result } = renderHook(() => useBulkUpdateFiles(), { wrapper });

    act(() => {
      result.current.mutate({
        type: "update_tags",
        payload: { ids: [1], tags: ["new"], mode: "add" },
      });
    });

    await waitFor(() => {
      const data = queryClient.getQueryData<FileModel[]>(queryKey);
      expect(data?.[0].tags).toEqual(["existing", "new"]);
    });

    act(() => {
      resolveMutation();
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
  });

  it("rolls back tag changes when the mutation fails", async () => {
    let rejectMutation: (error: Error) => void = () => {};
    mockBulkUpdateFileTags.mockImplementation(
      () =>
        new Promise<never>((_resolve, reject) => {
          rejectMutation = reject;
        }),
    );

    const queryKey = fileQueryKeys.list();
    const { queryClient, wrapper } = createWrapper();

    queryClient.setQueryData(queryKey, [createFile("1", ["old"])]);

    const { result } = renderHook(() => useBulkUpdateFiles(), { wrapper });

    act(() => {
      result.current.mutate({
        type: "update_tags",
        payload: { ids: [1], tags: ["new"], mode: "set" },
      });
    });

    await waitFor(() => {
      const data = queryClient.getQueryData<FileModel[]>(queryKey);
      expect(data?.[0].tags).toEqual(["new"]);
    });

    act(() => {
      rejectMutation(new Error("Failed"));
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    const data = queryClient.getQueryData<FileModel[]>(queryKey);
    expect(data?.[0].tags).toEqual(["old"]);
  });
});
