import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import {
  useCreateProjectRisk,
  useUpdateProjectRisk,
  useDeleteProjectRisk,
} from "../useRiskMutations";
import { projectRiskQueryKeys, type ProjectRisk } from "../useProjectRisks";

vi.mock("../../repository/projectRisk.repository", () => ({
  createProjectRisk: vi.fn(),
  updateProjectRisk: vi.fn(),
  deleteProjectRisk: vi.fn(),
}));

vi.mock("../../tools/alertUtils", () => ({
  showAlert: vi.fn(),
}));

import {
  createProjectRisk,
  updateProjectRisk,
  deleteProjectRisk,
} from "../../repository/projectRisk.repository";
import { showAlert } from "../../tools/alertUtils";

const mockCreateProjectRisk = vi.mocked(createProjectRisk);
const mockUpdateProjectRisk = vi.mocked(updateProjectRisk);
const mockDeleteProjectRisk = vi.mocked(deleteProjectRisk);
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

function makeRisk(id: number, overrides: Partial<ProjectRisk> = {}): ProjectRisk {
  return {
    id,
    project_id: 5,
    risk_name: `Risk ${id}`,
    risk_level_autocalculated: "Low",
    ...overrides,
  } as ProjectRisk;
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

function invalidatedKeys(spy: { mock: { calls: unknown[][] } }): unknown[][] {
  return spy.mock.calls.map((call) => (call[0] as { queryKey: unknown[] }).queryKey);
}

// Mirrors the real useProjectRisks cache key, including the refreshKey suffix.
function riskListKey(projectId: number, refreshKey: unknown) {
  return [...projectRiskQueryKeys.list(projectId, "active"), refreshKey] as const;
}

describe("useCreateProjectRisk", () => {
  beforeEach(() => vi.clearAllMocks());

  it("inserts an optimistic temp risk into refreshKey-suffixed variants, then swaps in the server entity", async () => {
    const serverRisk = makeRisk(9, {
      risk_name: "Server Risk",
      risk_level_autocalculated: "High",
    });
    const d = deferred<unknown>();
    mockCreateProjectRisk.mockImplementation(() => d.promise as Promise<any>);

    const key = riskListKey(5, 0);
    const { queryClient, wrapper } = createWrapper();
    queryClient.setQueryData<ProjectRisk[]>(key, [makeRisk(1)]);

    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    const { result } = renderHook(() => useCreateProjectRisk(), { wrapper });

    act(() => {
      result.current.mutate({ body: { risk_name: "Optimistic Risk", project_id: 5 } });
    });

    await waitFor(() => {
      const data = queryClient.getQueryData<ProjectRisk[]>(key);
      expect(data).toHaveLength(2);
      expect(data?.[0].risk_name).toBe("Optimistic Risk");
      expect(data?.[0].id).toBeLessThan(0);
    });

    // Repository returns the full axios response: entity at data.data.
    act(() => {
      d.resolve({ status: 201, data: { data: serverRisk } });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const data = queryClient.getQueryData<ProjectRisk[]>(key);
    expect(data?.[0]).toEqual(serverRisk);

    const keys = invalidatedKeys(invalidateSpy);
    expect(keys).toContainEqual(["dashboard"]);
    expect(keys.every((key) => key[0] !== "projectRisks")).toBe(true);
  });

  it("rolls back on failure and shows an error toast for 4xx", async () => {
    const d = deferred<never>();
    mockCreateProjectRisk.mockImplementation(() => d.promise as Promise<any>);

    const key = riskListKey(5, 0);
    const { queryClient, wrapper } = createWrapper();
    const original = [makeRisk(1)];
    queryClient.setQueryData<ProjectRisk[]>(key, original);

    const { result } = renderHook(() => useCreateProjectRisk(), { wrapper });

    act(() => {
      result.current.mutate({ body: { risk_name: "Doomed" } });
    });

    await waitFor(() => expect(queryClient.getQueryData<ProjectRisk[]>(key)).toHaveLength(2));

    act(() => {
      d.reject({ response: { status: 422 }, message: "Unprocessable" });
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(queryClient.getQueryData<ProjectRisk[]>(key)).toEqual(original);
    expect(mockShowAlert).toHaveBeenCalledWith(expect.objectContaining({ variant: "error" }));
  });
});

describe("useUpdateProjectRisk", () => {
  beforeEach(() => vi.clearAllMocks());

  it("patches the risk optimistically across variants and applies server-computed fields on success", async () => {
    const serverRisk = makeRisk(1, {
      risk_name: "Renamed",
      risk_level_autocalculated: "Critical",
      final_risk_level: "High",
    });
    const d = deferred<unknown>();
    mockUpdateProjectRisk.mockImplementation(() => d.promise as Promise<any>);

    const keyA = riskListKey(5, 0);
    const keyB = riskListKey(5, 1); // different refreshKey, same project
    const { queryClient, wrapper } = createWrapper();
    queryClient.setQueryData<ProjectRisk[]>(keyA, [makeRisk(1), makeRisk(2)]);
    queryClient.setQueryData<ProjectRisk[]>(keyB, [makeRisk(1)]);

    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    const { result } = renderHook(() => useUpdateProjectRisk(), { wrapper });

    act(() => {
      result.current.mutate({ id: 1, projectId: 5, body: { risk_name: "Optimistic Name" } });
    });

    await waitFor(() => {
      expect(queryClient.getQueryData<ProjectRisk[]>(keyA)?.[0].risk_name).toBe("Optimistic Name");
      expect(queryClient.getQueryData<ProjectRisk[]>(keyB)?.[0].risk_name).toBe("Optimistic Name");
    });
    expect(mockUpdateProjectRisk).toHaveBeenCalledWith({
      id: 1,
      body: { risk_name: "Optimistic Name" },
    });

    act(() => {
      d.resolve({ status: 200, data: { data: serverRisk } });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    // risk_level_autocalculated-driven display fields come from the server entity.
    const updated = queryClient.getQueryData<ProjectRisk[]>(keyA)?.[0];
    expect(updated?.risk_name).toBe("Renamed");
    expect(updated?.risk_level_autocalculated).toBe("Critical");
    expect(updated?.final_risk_level).toBe("High");

    const keys = invalidatedKeys(invalidateSpy);
    expect(keys).toContainEqual(["dashboard"]);
    expect(keys.every((key) => key[0] !== "projectRisks")).toBe(true);
  });

  it("rolls back every variant on failure", async () => {
    const d = deferred<never>();
    mockUpdateProjectRisk.mockImplementation(() => d.promise as Promise<any>);

    const keyA = riskListKey(5, 0);
    const keyB = riskListKey(7, 0); // different project list
    const { queryClient, wrapper } = createWrapper();
    queryClient.setQueryData<ProjectRisk[]>(keyA, [makeRisk(1)]);
    queryClient.setQueryData<ProjectRisk[]>(keyB, [makeRisk(1, { project_id: 7 })]);

    const { result } = renderHook(() => useUpdateProjectRisk(), { wrapper });

    act(() => {
      result.current.mutate({ id: 1, body: { risk_name: "Changed" } });
    });

    await waitFor(() =>
      expect(queryClient.getQueryData<ProjectRisk[]>(keyA)?.[0].risk_name).toBe("Changed"),
    );

    act(() => {
      d.reject({ response: { status: 500 }, message: "Server error" });
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(queryClient.getQueryData<ProjectRisk[]>(keyA)).toEqual([makeRisk(1)]);
    expect(queryClient.getQueryData<ProjectRisk[]>(keyB)).toEqual([makeRisk(1, { project_id: 7 })]);
    // 5xx is toasted by the axios interceptor, not the hook.
    expect(mockShowAlert).not.toHaveBeenCalled();
  });
});

describe("useDeleteProjectRisk", () => {
  beforeEach(() => vi.clearAllMocks());

  it("removes the risk optimistically and only invalidates the dashboard", async () => {
    const d = deferred<unknown>();
    mockDeleteProjectRisk.mockImplementation(() => d.promise as Promise<any>);

    const key = riskListKey(5, 0);
    const { queryClient, wrapper } = createWrapper();
    queryClient.setQueryData<ProjectRisk[]>(key, [makeRisk(1), makeRisk(2)]);

    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    const { result } = renderHook(() => useDeleteProjectRisk(), { wrapper });

    act(() => {
      result.current.mutate({ id: 1 });
    });

    await waitFor(() =>
      expect(queryClient.getQueryData<ProjectRisk[]>(key)).toEqual([makeRisk(2)]),
    );
    expect(mockDeleteProjectRisk).toHaveBeenCalledWith({ id: 1 });

    act(() => {
      d.resolve({ status: 200, data: { message: "Deleted" } });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const keys = invalidatedKeys(invalidateSpy);
    expect(keys).toContainEqual(["dashboard"]);
    expect(keys.every((key) => key[0] !== "projectRisks")).toBe(true);
    expect(queryClient.getQueryData<ProjectRisk[]>(key)).toEqual([makeRisk(2)]);
  });

  it("restores the risk when deletion fails", async () => {
    const d = deferred<never>();
    mockDeleteProjectRisk.mockImplementation(() => d.promise as Promise<any>);

    const key = riskListKey(5, 0);
    const { queryClient, wrapper } = createWrapper();
    const original = [makeRisk(1), makeRisk(2)];
    queryClient.setQueryData<ProjectRisk[]>(key, original);

    const { result } = renderHook(() => useDeleteProjectRisk(), { wrapper });

    act(() => {
      result.current.mutate({ id: 1 });
    });

    await waitFor(() =>
      expect(queryClient.getQueryData<ProjectRisk[]>(key)).toEqual([makeRisk(2)]),
    );

    act(() => {
      d.reject({ response: { status: 404 }, message: "Not found" });
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(queryClient.getQueryData<ProjectRisk[]>(key)).toEqual(original);
  });
});
