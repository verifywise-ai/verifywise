import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import { useUpdateFileMetadata } from "../useUpdateFileMetadata";
import { fileQueryKeys } from "../useFiles";
import { FileModel } from "../../../domain/models/Common/file/file.model";

vi.mock("../../repository/file.repository", () => ({
  updateFileMetadata: vi.fn(),
}));

import { updateFileMetadata, type FileMetadata } from "../../repository/file.repository";

const mockUpdateFileMetadata = vi.mocked(updateFileMetadata);

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

describe("useUpdateFileMetadata", () => {
  beforeEach(() => vi.clearAllMocks());

  it("optimistically updates file metadata in the list cache", async () => {
    let resolveMutation: (value: FileMetadata) => void = () => {};
    mockUpdateFileMetadata.mockImplementation(
      () =>
        new Promise<FileMetadata>((resolve) => {
          resolveMutation = resolve;
        }),
    );

    const queryKey = fileQueryKeys.list();
    const { queryClient, wrapper } = createWrapper();

    queryClient.setQueryData(queryKey, [createFile("1", ["old"])]);

    const { result } = renderHook(() => useUpdateFileMetadata(), { wrapper });

    act(() => {
      result.current.mutate({ id: "1", updates: { tags: ["new"] } });
    });

    await waitFor(() => {
      const data = queryClient.getQueryData<FileModel[]>(queryKey);
      expect(data?.[0].tags).toEqual(["new"]);
    });

    act(() => {
      resolveMutation({ id: "1", filename: "file-1.txt" } as FileMetadata);
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockUpdateFileMetadata).toHaveBeenCalledWith({
      id: "1",
      updates: { tags: ["new"] },
    });
  });

  it("rolls back the optimistic update on failure", async () => {
    let rejectMutation: (error: Error) => void = () => {};
    mockUpdateFileMetadata.mockImplementation(
      () =>
        new Promise<never>((_resolve, reject) => {
          rejectMutation = reject;
        }),
    );

    const queryKey = fileQueryKeys.list();
    const { queryClient, wrapper } = createWrapper();

    queryClient.setQueryData(queryKey, [createFile("1", ["old"])]);

    const { result } = renderHook(() => useUpdateFileMetadata(), { wrapper });

    act(() => {
      result.current.mutate({ id: "1", updates: { tags: ["new"] } });
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
