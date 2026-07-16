import { describe, it, expect } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { useVendors, useVendor } from "../useVendors";
import { createWrapper } from "./testUtils";
import { mockVendors } from "../../../test/mocks/data/vendors";

describe("useVendors integration", () => {
  it("loads all vendors when no project filter is provided", async () => {
    const { result } = renderHook(() => useVendors(), {
      wrapper: createWrapper(),
    });

    expect(result.current.isLoading).toBe(true);

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toHaveLength(mockVendors.length);
  });

  it("loads a single vendor by id", async () => {
    const { result } = renderHook(() => useVendor(mockVendors[0].id), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data?.id).toBe(mockVendors[0].id);
  });
});
