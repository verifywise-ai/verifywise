import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";

vi.mock("react-redux", () => ({
  useSelector: vi.fn((fn: any) => fn({ auth: { authToken: "mock-token" } })),
}));

vi.mock("../../repository/project.repository", () => ({
  getProjectProgressData: vi.fn(),
}));

import useProjectStatus from "../useProjectStatus";
import { getProjectProgressData } from "../../repository/project.repository";

const mockGetProgress = vi.mocked(getProjectProgressData);

describe("useProjectStatus", () => {
  beforeEach(() => vi.clearAllMocks());

  it("fetches project status", async () => {
    mockGetProgress
      .mockResolvedValueOnce({ allDonesubControls: 5, allsubControls: 10 })
      .mockResolvedValueOnce({ totalQuestions: 20, answeredQuestions: 10 });

    const { result } = renderHook(() => useProjectStatus({ userId: 1 }));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe(false);
    expect(result.current.projectStatus).toBeDefined();
  });

  it("sets error when userId is null", async () => {
    const { result } = renderHook(() => useProjectStatus({ userId: null }));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe("No user ID provided");
  });
});
