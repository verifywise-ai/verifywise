import { renderHook, act, waitFor } from "@testing-library/react";
import { useAITrustCentreSubprocessors } from "../useAITrustCentreSubprocessors";

const mockGetSubprocessors = vi.fn();
const mockCreateSubprocessor = vi.fn();
const mockDeleteSubprocessor = vi.fn();
const mockUpdateSubprocessor = vi.fn();

vi.mock("../../repository/aiTrustCentre.repository", () => ({
  getAITrustCentreSubprocessors: (...args: unknown[]) => mockGetSubprocessors(...args),
  createAITrustCentreSubprocessor: (...args: unknown[]) => mockCreateSubprocessor(...args),
  deleteAITrustCentreSubprocessor: (...args: unknown[]) => mockDeleteSubprocessor(...args),
  updateAITrustCentreSubprocessor: (...args: unknown[]) => mockUpdateSubprocessor(...args),
}));

const mockSubprocessors = [
  { id: 1, name: "Processor A", purpose: "Processing", location: "US", url: "https://proc-a.com" },
];

describe("useAITrustCentreSubprocessors", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  it("should fetch subprocessors on mount", async () => {
    mockGetSubprocessors.mockResolvedValue({
      data: { data: { subprocessors: mockSubprocessors } },
    });

    const { result } = renderHook(() => useAITrustCentreSubprocessors());

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(mockGetSubprocessors).toHaveBeenCalledTimes(1);
    expect(result.current.subprocessors).toEqual(mockSubprocessors);
    expect(result.current.error).toBeNull();
  });

  it("should handle nested response shapes", async () => {
    mockGetSubprocessors.mockResolvedValue({ data: { subprocessors: mockSubprocessors } });

    const { result } = renderHook(() => useAITrustCentreSubprocessors());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.subprocessors).toEqual(mockSubprocessors);
  });

  it("should handle flat response shape", async () => {
    mockGetSubprocessors.mockResolvedValue({ subprocessors: mockSubprocessors });

    const { result } = renderHook(() => useAITrustCentreSubprocessors());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.subprocessors).toEqual(mockSubprocessors);
  });

  it("should default to empty array when no subprocessors", async () => {
    mockGetSubprocessors.mockResolvedValue({});

    const { result } = renderHook(() => useAITrustCentreSubprocessors());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.subprocessors).toEqual([]);
  });

  it("should handle fetch error", async () => {
    const rejectionHandler = vi.fn();
    process.on("unhandledRejection", rejectionHandler);
    const testError = new Error("Network failure");
    mockGetSubprocessors.mockRejectedValue(testError);

    const { result } = renderHook(() => useAITrustCentreSubprocessors());

    await waitFor(() => expect(result.current.error).toBe("Network failure"));
    process.removeListener("unhandledRejection", rejectionHandler);
  });

  it("should create subprocessor and refresh list", async () => {
    mockGetSubprocessors.mockResolvedValue({
      data: { data: { subprocessors: mockSubprocessors } },
    });
    mockCreateSubprocessor.mockResolvedValue({});

    const { result } = renderHook(() => useAITrustCentreSubprocessors());

    await waitFor(() => expect(result.current.loading).toBe(false));

    mockGetSubprocessors.mockClear();
    mockGetSubprocessors.mockResolvedValue({
      data: { data: { subprocessors: [...mockSubprocessors, { id: 2, name: "Processor B" }] } },
    });

    await act(async () => {
      await result.current.createSubprocessor("Processor B", "Data", "EU", "https://proc-b.com");
    });

    expect(mockCreateSubprocessor).toHaveBeenCalledWith(
      "Processor B",
      "Data",
      "EU",
      "https://proc-b.com",
    );
    await waitFor(() => expect(result.current.subprocessors.length).toBe(2));
  });

  it("should delete subprocessor and refresh list", async () => {
    mockGetSubprocessors.mockResolvedValue({
      data: { data: { subprocessors: mockSubprocessors } },
    });
    mockDeleteSubprocessor.mockResolvedValue({});

    const { result } = renderHook(() => useAITrustCentreSubprocessors());

    await waitFor(() => expect(result.current.loading).toBe(false));

    mockGetSubprocessors.mockClear();
    mockGetSubprocessors.mockResolvedValue({ data: { data: { subprocessors: [] } } });

    await act(async () => {
      await result.current.deleteSubprocessor(1);
    });

    expect(mockDeleteSubprocessor).toHaveBeenCalledWith(1);
    await waitFor(() => expect(result.current.subprocessors.length).toBe(0));
  });

  it("should update subprocessor and refresh list", async () => {
    mockGetSubprocessors.mockResolvedValue({
      data: { data: { subprocessors: mockSubprocessors } },
    });
    mockUpdateSubprocessor.mockResolvedValue({});

    const { result } = renderHook(() => useAITrustCentreSubprocessors());

    await waitFor(() => expect(result.current.loading).toBe(false));

    mockGetSubprocessors.mockClear();
    mockGetSubprocessors.mockResolvedValue({
      data: { data: { subprocessors: [{ ...mockSubprocessors[0], name: "Updated" }] } },
    });

    await act(async () => {
      await result.current.updateSubprocessor(
        1,
        "Updated",
        "New purpose",
        "EU",
        "https://updated.com",
      );
    });

    expect(mockUpdateSubprocessor).toHaveBeenCalledWith(
      1,
      "Updated",
      "New purpose",
      "EU",
      "https://updated.com",
    );
    await waitFor(() => expect(result.current.subprocessors[0].name).toBe("Updated"));
  });

  it("should handle create error", async () => {
    mockGetSubprocessors.mockResolvedValue({ data: { data: { subprocessors: [] } } });
    mockCreateSubprocessor.mockRejectedValue(new Error("Create failed"));

    const { result } = renderHook(() => useAITrustCentreSubprocessors());

    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      try {
        await result.current.createSubprocessor("Fail", "", "", "");
      } catch {
        // expected
      }
    });

    expect(result.current.error).toBe("Create failed");
  });
});
