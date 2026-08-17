import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import { useAddFileTags, useRemoveFileTag } from "../useFileTagMutations";
import { fileQueryKeys } from "../useFiles";
import { FileModel } from "../../../domain/models/Common/file/file.model";

vi.mock("../../repository/file.repository", () => ({
  updateFileMetadata: vi.fn(),
}));

vi.mock("../../tools/alertUtils", () => ({
  showAlert: vi.fn(),
}));

import { updateFileMetadata } from "../../repository/file.repository";
import { showAlert } from "../../tools/alertUtils";

const mockUpdateFileMetadata = vi.mocked(updateFileMetadata);
const mockShowAlert = vi.mocked(showAlert);

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

function makeFile(id: string, tags: string[] = []): FileModel {
  return FileModel.createNewFile({
    id,
    fileName: `file-${id}.pdf`,
    uploadDate: new Date("2026-01-01"),
    uploader: "1",
    tags,
  });
}

function deferred<T>() {
  let resolve: (value: T) => void = () => {};
  let reject: (error: unknown) => void = () => {};
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("useAddFileTags", () => {
  beforeEach(() => vi.clearAllMocks());

  it("patches tags optimistically before the server responds, then applies the server tags", async () => {
    // Repository resolves with the FileMetadata entity.
    const d = deferred<unknown>();
    mockUpdateFileMetadata.mockImplementation(() => d.promise as Promise<any>);

    const queryKey = fileQueryKeys.list({});
    const { queryClient, wrapper } = createWrapper();
    queryClient.setQueryData<FileModel[]>(queryKey, [makeFile("1", ["draft"]), makeFile("2")]);

    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    const { result } = renderHook(() => useAddFileTags(), { wrapper });

    act(() => {
      result.current.mutate({ id: "1", currentTags: ["draft"], tags: ["legal", "ai"] });
    });

    // Optimistic merged tags are visible before the repository promise resolves.
    await waitFor(() => {
      const data = queryClient.getQueryData<FileModel[]>(queryKey);
      expect(data?.[0].tags).toEqual(["draft", "legal", "ai"]);
      expect(data?.[1].tags).toEqual([]);
    });
    expect(mockUpdateFileMetadata).toHaveBeenCalledWith({
      id: "1",
      updates: { tags: ["draft", "legal", "ai"] },
    });

    act(() => {
      d.resolve({ id: "1", tags: ["draft", "legal", "ai", "server-added"] });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    // Authoritative server tags replace the optimistic ones.
    expect(queryClient.getQueryData<FileModel[]>(queryKey)?.[0].tags).toEqual([
      "draft",
      "legal",
      "ai",
      "server-added",
    ]);

    // No refetch of any kind on success — the cache holds the server entity.
    expect(invalidateSpy).not.toHaveBeenCalled();
  });

  it("deduplicates tags that already exist", async () => {
    const d = deferred<unknown>();
    mockUpdateFileMetadata.mockImplementation(() => d.promise as Promise<any>);

    const queryKey = fileQueryKeys.list({});
    const { queryClient, wrapper } = createWrapper();
    queryClient.setQueryData<FileModel[]>(queryKey, [makeFile("1", ["draft"])]);

    const { result } = renderHook(() => useAddFileTags(), { wrapper });

    act(() => {
      result.current.mutate({ id: "1", currentTags: ["draft"], tags: ["draft", "new"] });
    });

    await waitFor(() =>
      expect(queryClient.getQueryData<FileModel[]>(queryKey)?.[0].tags).toEqual(["draft", "new"]),
    );
    expect(mockUpdateFileMetadata).toHaveBeenCalledWith({
      id: "1",
      updates: { tags: ["draft", "new"] },
    });

    act(() => {
      d.resolve({ id: "1", tags: ["draft", "new"] });
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
  });

  it("rolls back tags on failure and toasts for 4xx errors", async () => {
    const d = deferred<never>();
    mockUpdateFileMetadata.mockImplementation(() => d.promise as Promise<any>);

    const queryKey = fileQueryKeys.list({});
    const { queryClient, wrapper } = createWrapper();
    queryClient.setQueryData<FileModel[]>(queryKey, [makeFile("1", ["draft"])]);

    const { result } = renderHook(() => useAddFileTags(), { wrapper });

    act(() => {
      result.current.mutate({ id: "1", currentTags: ["draft"], tags: ["legal"] });
    });

    await waitFor(() =>
      expect(queryClient.getQueryData<FileModel[]>(queryKey)?.[0].tags).toEqual(["draft", "legal"]),
    );

    act(() => {
      d.reject({ response: { status: 400 }, message: "Bad request" });
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(queryClient.getQueryData<FileModel[]>(queryKey)?.[0].tags).toEqual(["draft"]);
    expect(mockShowAlert).toHaveBeenCalledWith(expect.objectContaining({ variant: "error" }));
  });
});

describe("useRemoveFileTag", () => {
  beforeEach(() => vi.clearAllMocks());

  it("removes the tag optimistically and keeps the server tags on success", async () => {
    const d = deferred<unknown>();
    mockUpdateFileMetadata.mockImplementation(() => d.promise as Promise<any>);

    const queryKey = fileQueryKeys.list({});
    const { queryClient, wrapper } = createWrapper();
    queryClient.setQueryData<FileModel[]>(queryKey, [makeFile("1", ["draft", "legal"])]);

    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    const { result } = renderHook(() => useRemoveFileTag(), { wrapper });

    act(() => {
      result.current.mutate({ id: "1", currentTags: ["draft", "legal"], tag: "legal" });
    });

    await waitFor(() =>
      expect(queryClient.getQueryData<FileModel[]>(queryKey)?.[0].tags).toEqual(["draft"]),
    );
    expect(mockUpdateFileMetadata).toHaveBeenCalledWith({
      id: "1",
      updates: { tags: ["draft"] },
    });

    act(() => {
      d.resolve({ id: "1", tags: [] });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(queryClient.getQueryData<FileModel[]>(queryKey)?.[0].tags).toEqual([]);
    expect(invalidateSpy).not.toHaveBeenCalled();
  });

  it("restores tags when removal fails", async () => {
    const d = deferred<never>();
    mockUpdateFileMetadata.mockImplementation(() => d.promise as Promise<any>);

    const queryKey = fileQueryKeys.list({});
    const { queryClient, wrapper } = createWrapper();
    queryClient.setQueryData<FileModel[]>(queryKey, [makeFile("1", ["draft", "legal"])]);

    const { result } = renderHook(() => useRemoveFileTag(), { wrapper });

    act(() => {
      result.current.mutate({ id: "1", currentTags: ["draft", "legal"], tag: "legal" });
    });

    await waitFor(() =>
      expect(queryClient.getQueryData<FileModel[]>(queryKey)?.[0].tags).toEqual(["draft"]),
    );

    act(() => {
      d.reject({ response: { status: 500 }, message: "Server error" });
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(queryClient.getQueryData<FileModel[]>(queryKey)?.[0].tags).toEqual(["draft", "legal"]);
    // 5xx is toasted by the axios interceptor, not the hook.
    expect(mockShowAlert).not.toHaveBeenCalled();
  });
});
