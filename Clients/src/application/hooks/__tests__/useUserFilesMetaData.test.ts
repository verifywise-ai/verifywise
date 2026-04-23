import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";

vi.mock("../../repository/file.repository", () => ({
  getFilesWithMetadata: vi.fn(),
}));

vi.mock("../../utils/fileTransform.utils", () => ({
  transformFilesData: vi.fn((files) => files.map((f: any) => ({ ...f, transformed: true }))),
}));

import { useUserFilesMetaData } from "../useUserFilesMetaData";
import { getFilesWithMetadata } from "../../repository/file.repository";

const mockGetFiles = vi.mocked(getFilesWithMetadata);

describe("useUserFilesMetaData", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("fetches files on mount", async () => {
    mockGetFiles.mockResolvedValue({ files: [{ id: "1", name: "test.pdf" }] } as any);

    const { result } = renderHook(() => useUserFilesMetaData());

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.filesData).toHaveLength(1);
    expect(result.current.error).toBeNull();
  });

  it("handles error", async () => {
    mockGetFiles.mockRejectedValue(new Error("Network fail"));

    const { result } = renderHook(() => useUserFilesMetaData());

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.error).toBeInstanceOf(Error);
    expect(result.current.error?.message).toBe("Network fail");
  });

  it("refetch triggers new data load", async () => {
    mockGetFiles.mockResolvedValue({ files: [{ id: "1" }] } as any);

    const { result } = renderHook(() => useUserFilesMetaData());
    await waitFor(() => expect(result.current.loading).toBe(false));

    mockGetFiles.mockResolvedValue({ files: [{ id: "1" }, { id: "2" }] } as any);

    act(() => {
      result.current.refetch();
    });

    await waitFor(() => expect(result.current.filesData).toHaveLength(2));
  });
});
