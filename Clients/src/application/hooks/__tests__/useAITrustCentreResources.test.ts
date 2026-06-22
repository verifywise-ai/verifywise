import { renderHook, act, waitFor } from "@testing-library/react";
import { useAITrustCentreResources } from "../useAITrustCentreResources";

const mockGetResources = vi.fn();
const mockCreateResource = vi.fn();
const mockDeleteResource = vi.fn();
const mockUpdateResource = vi.fn();

vi.mock("../../repository/aiTrustCentre.repository", () => ({
  getAITrustCentreResources: (...args: unknown[]) => mockGetResources(...args),
  createAITrustCentreResource: (...args: unknown[]) => mockCreateResource(...args),
  deleteAITrustCentreResource: (...args: unknown[]) => mockDeleteResource(...args),
  updateAITrustCentreResource: (...args: unknown[]) => mockUpdateResource(...args),
}));

const mockResources = [
  {
    id: 1,
    name: "Doc 1",
    description: "Desc",
    visible: true,
    file_id: 10,
    updated_at: "2024-01-01",
  },
];

describe("useAITrustCentreResources", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  it("should fetch resources on mount", async () => {
    mockGetResources.mockResolvedValue({ data: { data: { resources: mockResources } } });

    const { result } = renderHook(() => useAITrustCentreResources());

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(mockGetResources).toHaveBeenCalledTimes(1);
    expect(result.current.resources).toEqual(mockResources);
    expect(result.current.error).toBeNull();
  });

  it("should handle nested response shapes", async () => {
    mockGetResources.mockResolvedValue({ data: { resources: mockResources } });

    const { result } = renderHook(() => useAITrustCentreResources());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.resources).toEqual(mockResources);
  });

  it("should handle flat response shape", async () => {
    mockGetResources.mockResolvedValue({ resources: mockResources });

    const { result } = renderHook(() => useAITrustCentreResources());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.resources).toEqual(mockResources);
  });

  it("should default to empty array when no resources", async () => {
    mockGetResources.mockResolvedValue({});

    const { result } = renderHook(() => useAITrustCentreResources());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.resources).toEqual([]);
  });

  it("should handle fetch error", async () => {
    const rejectionHandler = vi.fn();
    process.on("unhandledRejection", rejectionHandler);
    mockGetResources.mockRejectedValue({ response: { data: { message: "Not found" } } });

    const { result } = renderHook(() => useAITrustCentreResources());

    await waitFor(() => expect(result.current.error).toBe("Not found"));
    process.removeListener("unhandledRejection", rejectionHandler);
  });

  it("should create resource and refresh list", async () => {
    mockGetResources.mockResolvedValue({ data: { data: { resources: mockResources } } });
    mockCreateResource.mockResolvedValue({});

    const { result } = renderHook(() => useAITrustCentreResources());

    await waitFor(() => expect(result.current.loading).toBe(false));

    mockGetResources.mockClear();
    mockGetResources.mockResolvedValue({
      data: { data: { resources: [...mockResources, { id: 2, name: "Doc 2" }] } },
    });

    await act(async () => {
      await result.current.createResource(new File([""], "doc.pdf"), "Doc 2", "New doc");
    });

    expect(mockCreateResource).toHaveBeenCalledWith(expect.any(File), "Doc 2", "New doc", true);
    await waitFor(() => expect(result.current.resources.length).toBe(2));
  });

  it("should delete resource and refresh list", async () => {
    mockGetResources.mockResolvedValue({ data: { data: { resources: mockResources } } });
    mockDeleteResource.mockResolvedValue({});

    const { result } = renderHook(() => useAITrustCentreResources());

    await waitFor(() => expect(result.current.loading).toBe(false));

    mockGetResources.mockClear();
    mockGetResources.mockResolvedValue({ data: { data: { resources: [] } } });

    await act(async () => {
      await result.current.deleteResource(1);
    });

    expect(mockDeleteResource).toHaveBeenCalledWith(1);
    await waitFor(() => expect(result.current.resources.length).toBe(0));
  });

  it("should update resource and refresh list", async () => {
    mockGetResources.mockResolvedValue({ data: { data: { resources: mockResources } } });
    mockUpdateResource.mockResolvedValue({});

    const { result } = renderHook(() => useAITrustCentreResources());

    await waitFor(() => expect(result.current.loading).toBe(false));

    mockGetResources.mockClear();
    mockGetResources.mockResolvedValue({
      data: { data: { resources: [{ ...mockResources[0], name: "Updated" }] } },
    });

    await act(async () => {
      await result.current.updateResource(1, "Updated", "New desc", true);
    });

    expect(mockUpdateResource).toHaveBeenCalledWith(
      1,
      "Updated",
      "New desc",
      true,
      undefined,
      undefined,
    );
    await waitFor(() => expect(result.current.resources[0].name).toBe("Updated"));
  });

  it("should handle create error", async () => {
    mockGetResources.mockResolvedValue({ data: { data: { resources: [] } } });
    mockCreateResource.mockRejectedValue(new Error("Create failed"));

    const { result } = renderHook(() => useAITrustCentreResources());

    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      try {
        await result.current.createResource(new File([""], "doc.pdf"), "Fail", "");
      } catch {
        // expected
      }
    });

    expect(result.current.error).toBe("Create failed");
  });
});
