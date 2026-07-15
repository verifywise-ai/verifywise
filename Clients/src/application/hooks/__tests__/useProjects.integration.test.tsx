import { describe, it, expect } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { useProjects } from "../useProjects";
import { createWrapper } from "./testUtils";
import { mockProjects } from "../../../test/mocks/data/projects";

describe("useProjects integration", () => {
  it("loads all projects and exposes approvedProjects", async () => {
    const { result } = renderHook(() => useProjects(), {
      wrapper: createWrapper(),
    });

    expect(result.current.isLoading).toBe(true);

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toHaveLength(mockProjects.length);
    expect(result.current.data?.[0].id).toBe(mockProjects[0].id);
    expect(result.current.approvedProjects).toHaveLength(mockProjects.length);
  });
});
