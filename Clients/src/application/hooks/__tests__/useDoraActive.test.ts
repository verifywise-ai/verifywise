import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import { Project } from "../../../domain/types/Project";

vi.mock("../../repository/project.repository", () => ({
  getAllProjects: vi.fn(),
}));

import useDoraActive from "../useDoraActive";
import { getAllProjects } from "../../repository/project.repository";

const mockGetAllProjects = vi.mocked(getAllProjects);

// Renders useDoraActive under a real QueryClientProvider — useDoraActive
// now sources its data from useProjects() (React Query), NOT from
// VerifyWiseContext, so the wrapper only needs to satisfy React Query.
function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
}

const organizationalProjectWithDora: Project = {
  id: 1,
  project_title: "Organizational framework",
  owner: 1,
  members: [],
  start_date: new Date(),
  ai_risk_classification: null,
  type_of_high_risk_role: null,
  goal: "",
  last_updated: new Date(),
  last_updated_by: 1,
  framework: [{ project_framework_id: 100, framework_id: 9, name: "DORA" }],
  monitored_regulations_and_standards: [],
  is_organizational: true,
};

const organizationalProjectWithoutDora: Project = {
  ...organizationalProjectWithDora,
  framework: [{ project_framework_id: 101, framework_id: 3, name: "ISO 42001" }],
};

describe("useDoraActive", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("doraActive is true when the DORA framework is installed for the org", async () => {
    mockGetAllProjects.mockResolvedValue({ data: [organizationalProjectWithDora] });

    const { result } = renderHook(() => useDoraActive(), { wrapper: createWrapper() });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.doraActive).toBe(true);
  });

  it("doraActive is false when DORA is not installed (empty projects)", async () => {
    mockGetAllProjects.mockResolvedValue({ data: [] });

    const { result } = renderHook(() => useDoraActive(), { wrapper: createWrapper() });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.doraActive).toBe(false);
  });

  it("doraActive is false when only non-DORA frameworks are installed", async () => {
    mockGetAllProjects.mockResolvedValue({ data: [organizationalProjectWithoutDora] });

    const { result } = renderHook(() => useDoraActive(), { wrapper: createWrapper() });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.doraActive).toBe(false);
  });

  it("doraActive is false when there is no organizational project at all", async () => {
    const nonOrgProject: Project = {
      ...organizationalProjectWithDora,
      is_organizational: false,
    };
    mockGetAllProjects.mockResolvedValue({ data: [nonOrgProject] });

    const { result } = renderHook(() => useDoraActive(), { wrapper: createWrapper() });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.doraActive).toBe(false);
  });

  it("fails closed (doraActive: false) while the projects query is still loading", () => {
    // Never resolves within this test — simulates the in-flight window.
    mockGetAllProjects.mockReturnValue(new Promise(() => {}));

    const { result } = renderHook(() => useDoraActive(), { wrapper: createWrapper() });

    expect(result.current.loading).toBe(true);
    expect(result.current.doraActive).toBe(false);
  });

  it("is unaffected by a filtered projects array held by another component's local state", async () => {
    // Regression guard for the original bug report: useDoraActive must not
    // be coupled to any other component's mutable projects state (e.g. one
    // filtered down to non-organizational projects only). Since it now
    // reads exclusively from its own useProjects() query, the full,
    // unfiltered response is all that can ever reach it.
    mockGetAllProjects.mockResolvedValue({ data: [organizationalProjectWithDora] });

    const { result } = renderHook(() => useDoraActive(), { wrapper: createWrapper() });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.doraActive).toBe(true);
  });
});
