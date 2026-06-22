import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React, { act } from "react";
import {
  useMappings,
  useMappingsBetween,
  useScenarios,
  useCreateScenario,
  useUpdateScenario,
  useDeleteScenario,
  useCoverage,
  useRefreshCoverage,
  useUnifiedView,
  useGovernancePreferences,
  useUpdatePreferences,
} from "../useGovernanceOs";

vi.mock("../../repository/governanceOs.repository", () => ({
  getAllMappings: vi.fn(),
  getMappingsBetween: vi.fn(),
  getAllScenarios: vi.fn(),
  createScenario: vi.fn(),
  updateScenario: vi.fn(),
  deleteScenario: vi.fn(),
  getCoverage: vi.fn(),
  refreshCoverage: vi.fn(),
  getUnifiedView: vi.fn(),
  getPreferences: vi.fn(),
  updatePreferences: vi.fn(),
  getRecommendations: vi.fn(),
}));

import {
  getAllMappings,
  getMappingsBetween,
  getAllScenarios,
  createScenario,
  updateScenario,
  deleteScenario,
  getCoverage,
  refreshCoverage,
  getUnifiedView,
  getPreferences,
  updatePreferences,
} from "../../repository/governanceOs.repository";

const mockGetAllMappings = vi.mocked(getAllMappings);
const mockGetMappingsBetween = vi.mocked(getMappingsBetween);
const mockGetAllScenarios = vi.mocked(getAllScenarios);
const mockCreateScenario = vi.mocked(createScenario);
const mockUpdateScenario = vi.mocked(updateScenario);
const mockDeleteScenario = vi.mocked(deleteScenario);
const mockGetCoverage = vi.mocked(getCoverage);
const mockRefreshCoverage = vi.mocked(refreshCoverage);
const mockGetUnifiedView = vi.mocked(getUnifiedView);
const mockGetPreferences = vi.mocked(getPreferences);
const mockUpdatePreferences = vi.mocked(updatePreferences);

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
}

describe("useMappings", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns mappings data", async () => {
    mockGetAllMappings.mockResolvedValue({ data: [{ id: 1, source: "A", target: "B" }] });
    const { result } = renderHook(() => useMappings(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([{ id: 1, source: "A", target: "B" }]);
  });

  it("returns empty array when no data", async () => {
    mockGetAllMappings.mockResolvedValue({ data: undefined });
    const { result } = renderHook(() => useMappings(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([]);
  });

  it("passes filters to repository", async () => {
    mockGetAllMappings.mockResolvedValue({ data: [] });
    const filters = { frameworkId: 1, strength: "strong" };
    renderHook(() => useMappings(filters), { wrapper: createWrapper() });
    await waitFor(() =>
      expect(mockGetAllMappings).toHaveBeenCalledWith(
        expect.objectContaining({ frameworkId: 1, strength: "strong" }),
      ),
    );
  });
});

describe("useMappingsBetween", () => {
  beforeEach(() => vi.clearAllMocks());

  it("fetches mappings between two frameworks", async () => {
    mockGetMappingsBetween.mockResolvedValue({ data: [{ id: 1 }] });
    const { result } = renderHook(() => useMappingsBetween(1, 2), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockGetMappingsBetween).toHaveBeenCalledWith({ sourceId: 1, targetId: 2 });
  });

  it("is disabled when sourceId or targetId is 0", () => {
    const { result } = renderHook(() => useMappingsBetween(0, 2), { wrapper: createWrapper() });
    expect(result.current.isFetching).toBe(false);
    expect(mockGetMappingsBetween).not.toHaveBeenCalled();
  });
});

describe("useScenarios", () => {
  beforeEach(() => vi.clearAllMocks());

  it("fetches all scenarios", async () => {
    mockGetAllScenarios.mockResolvedValue({ data: [{ id: 1, name: "Test" }] });
    const { result } = renderHook(() => useScenarios(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([{ id: 1, name: "Test" }]);
  });
});

describe("useCreateScenario", () => {
  beforeEach(() => vi.clearAllMocks());

  it("creates a scenario", async () => {
    mockCreateScenario.mockResolvedValue({ data: { id: 3 } });
    const { result } = renderHook(() => useCreateScenario(), { wrapper: createWrapper() });
    await act(async () => {
      result.current.mutateAsync({ name: "New Scenario" });
    });
    expect(mockCreateScenario).toHaveBeenCalledWith({ body: { name: "New Scenario" } });
  });
});

describe("useUpdateScenario", () => {
  beforeEach(() => vi.clearAllMocks());

  it("updates a scenario", async () => {
    mockUpdateScenario.mockResolvedValue({ data: { id: 3, name: "Updated" } });
    const { result } = renderHook(() => useUpdateScenario(), { wrapper: createWrapper() });
    await act(async () => {
      result.current.mutateAsync({ id: 3, body: { name: "Updated" } });
    });
    expect(mockUpdateScenario).toHaveBeenCalledWith({ id: 3, body: { name: "Updated" } });
  });
});

describe("useDeleteScenario", () => {
  beforeEach(() => vi.clearAllMocks());

  it("deletes a scenario", async () => {
    mockDeleteScenario.mockResolvedValue({ success: true });
    const { result } = renderHook(() => useDeleteScenario(), { wrapper: createWrapper() });
    await act(async () => {
      result.current.mutateAsync(7);
    });
    expect(mockDeleteScenario).toHaveBeenCalledWith({ id: 7 });
  });
});

describe("useCoverage", () => {
  beforeEach(() => vi.clearAllMocks());

  it("fetches coverage for a project", async () => {
    mockGetCoverage.mockResolvedValue({ data: [{ framework: "ISO27001", percentage: 75 }] });
    const { result } = renderHook(() => useCoverage(1), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockGetCoverage).toHaveBeenCalledWith({ projectId: 1 });
  });

  it("is disabled when projectId is 0", () => {
    renderHook(() => useCoverage(0), { wrapper: createWrapper() });
    expect(mockGetCoverage).not.toHaveBeenCalled();
  });
});

describe("useRefreshCoverage", () => {
  beforeEach(() => vi.clearAllMocks());

  it("refreshes coverage for a project", async () => {
    mockRefreshCoverage.mockResolvedValue({ data: { status: "completed" } });
    const { result } = renderHook(() => useRefreshCoverage(), { wrapper: createWrapper() });
    await act(async () => {
      result.current.mutateAsync(1);
    });
    expect(mockRefreshCoverage).toHaveBeenCalledWith({ projectId: 1 });
  });
});

describe("useUnifiedView", () => {
  beforeEach(() => vi.clearAllMocks());

  it("fetches unified view for a project", async () => {
    mockGetUnifiedView.mockResolvedValue({ data: { mappings: [], coverage: [] } });
    const { result } = renderHook(() => useUnifiedView(1), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockGetUnifiedView).toHaveBeenCalledWith({ projectId: 1 });
  });

  it("is disabled when projectId is 0", () => {
    renderHook(() => useUnifiedView(0), { wrapper: createWrapper() });
    expect(mockGetUnifiedView).not.toHaveBeenCalled();
  });
});

describe("useGovernancePreferences", () => {
  beforeEach(() => vi.clearAllMocks());

  it("fetches preferences", async () => {
    mockGetPreferences.mockResolvedValue({ data: { id: 1, organization_id: 1 } });
    const { result } = renderHook(() => useGovernancePreferences(), {
      wrapper: createWrapper(),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual({ id: 1, organization_id: 1 });
  });

  it("returns null when no data", async () => {
    mockGetPreferences.mockResolvedValue({ data: undefined });
    const { result } = renderHook(() => useGovernancePreferences(), {
      wrapper: createWrapper(),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBeNull();
  });
});

describe("useUpdatePreferences", () => {
  beforeEach(() => vi.clearAllMocks());

  it("updates preferences", async () => {
    mockUpdatePreferences.mockResolvedValue({ data: { id: 1, organization_id: 1 } });
    const { result } = renderHook(() => useUpdatePreferences(), { wrapper: createWrapper() });
    await act(async () => {
      result.current.mutateAsync({ organization_id: 1 });
    });
    expect(mockUpdatePreferences).toHaveBeenCalledWith({ body: { organization_id: 1 } });
  });
});
