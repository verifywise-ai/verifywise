import { describe, it, expect } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { useFiles } from "../../useFiles";
import { createWrapper } from "../testUtils";
import { mockFiles } from "../../../../test/mocks/data/files";

describe("useFiles integration", () => {
  it("loads transformed file metadata", async () => {
    const { result } = renderHook(() => useFiles({ page: 1, pageSize: 10 }), {
      wrapper: createWrapper(),
    });

    expect(result.current.isLoading).toBe(true);

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toHaveLength(mockFiles.length);
    expect(result.current.data?.[0].fileName).toBe(mockFiles[0].name);
  });
});
