import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";

vi.mock("../../repository/intakeForm.repository", () => ({
  getEntityIntakeSubmission: vi.fn(),
}));

import { useEntityIntakeSubmission } from "../useEntityIntakeSubmission";
import { getEntityIntakeSubmission } from "../../repository/intakeForm.repository";

const mockGet = vi.mocked(getEntityIntakeSubmission);

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
}

describe("useEntityIntakeSubmission", () => {
  beforeEach(() => vi.clearAllMocks());

  it("fetches intake submission for valid entity", async () => {
    mockGet.mockResolvedValue({ id: 1, entityType: "use_case", answers: [] } as any);

    const { result } = renderHook(() => useEntityIntakeSubmission("use_case", 5), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockGet).toHaveBeenCalledWith("use_case", 5, expect.anything());
  });

  it("does not fetch when entityId is null", () => {
    const { result } = renderHook(() => useEntityIntakeSubmission("model", null), {
      wrapper: createWrapper(),
    });
    expect(result.current.fetchStatus).toBe("idle");
  });

  it("does not fetch when entityId is 0", () => {
    const { result } = renderHook(() => useEntityIntakeSubmission("model", 0), {
      wrapper: createWrapper(),
    });
    expect(result.current.fetchStatus).toBe("idle");
  });
});
