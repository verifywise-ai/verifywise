import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";

vi.mock("../useUsers", () => ({
  default: () => ({ users: [{ id: 1, name: "John", surname: "Doe" }] }),
}));

vi.mock("../../repository/project.repository", () => ({
  getProjectById: vi.fn(),
}));

import useProjectData from "../useProjectData";
import { getProjectById } from "../../repository/project.repository";

const mockGetProject = vi.mocked(getProjectById);

describe("useProjectData", () => {
  beforeEach(() => vi.clearAllMocks());

  it("fetches project data", async () => {
    mockGetProject.mockResolvedValue({
      data: { id: 1, name: "AI Project", owner: 1, risks: [{ id: 1 }] },
    });

    const { result } = renderHook(() => useProjectData({ projectId: "1" }));

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect((result.current.project as any)?.name).toBe("AI Project");
    expect(result.current.projectOwner).toBe("John Doe");
    expect(result.current.projectRisks).toHaveLength(1);
  });

  it("sets error when projectId is empty", async () => {
    const { result } = renderHook(() => useProjectData({ projectId: "" }));

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.error).toBe("No project ID provided");
  });

  it("handles fetch error", async () => {
    mockGetProject.mockRejectedValue(new Error("Not found"));

    const { result } = renderHook(() => useProjectData({ projectId: "999" }));

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.error).toContain("Failed to fetch project");
  });
});
