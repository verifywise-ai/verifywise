import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";

vi.mock("../../repository/file.repository", () => ({
  getFilesWithMetadata: vi.fn(),
}));

vi.mock("../../utils/fileTransform.utils", () => ({
  transformFilesData: vi.fn((files: any[]) => files.map((f) => ({ ...f, transformed: true }))),
}));

import { useFiles, fileQueryKeys } from "../useFiles";
import { getFilesWithMetadata } from "../../repository/file.repository";
import { transformFilesData } from "../../utils/fileTransform.utils";

const mockGetFiles = vi.mocked(getFilesWithMetadata);
const mockTransform = vi.mocked(transformFilesData);

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
}

describe("useFiles", () => {
  beforeEach(() => vi.clearAllMocks());

  it("fetches files and transforms them", async () => {
    mockGetFiles.mockResolvedValue({ files: [{ id: "f1" }] } as any);

    const { result } = renderHook(() => useFiles({ page: 1, pageSize: 20 }), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(mockGetFiles).toHaveBeenCalledWith(
      expect.objectContaining({ page: 1, pageSize: 20 }),
    );
    expect(mockTransform).toHaveBeenCalledWith([{ id: "f1" }]);
    expect(result.current.data).toEqual([{ id: "f1", transformed: true }]);
  });

  it("fetches files without pagination options", async () => {
    mockGetFiles.mockResolvedValue({ files: [] } as any);

    renderHook(() => useFiles(), { wrapper: createWrapper() });

    await waitFor(() =>
      expect(mockGetFiles).toHaveBeenCalledWith(
        expect.objectContaining({ page: undefined, pageSize: undefined }),
      ),
    );
  });
});

describe("fileQueryKeys", () => {
  it("builds hierarchical query keys", () => {
    expect(fileQueryKeys.all).toEqual(["files"]);
    expect(fileQueryKeys.lists()).toEqual(["files", "list"]);
    expect(fileQueryKeys.list({ page: 1 })).toEqual(["files", "list", { page: 1 }]);
    expect(fileQueryKeys.details()).toEqual(["files", "detail"]);
    expect(fileQueryKeys.detail("f1")).toEqual(["files", "detail", "f1"]);
  });
});
