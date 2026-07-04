import { renderHook, act, waitFor } from "@testing-library/react";
import { useAITrustCentreOverview } from "../useAITrustCentreOverview";

const mockGetOverview = vi.fn();
const mockUpdateOverview = vi.fn();

vi.mock("../../repository/aiTrustCentre.repository", () => ({
  getAITrustCentreOverview: (...args: unknown[]) => mockGetOverview(...args),
  updateAITrustCentreOverview: (...args: unknown[]) => mockUpdateOverview(...args),
}));

const mockOverviewData = {
  overview: {
    info: {
      title: "Trust Centre",
      visible: true,
      header_color: "#000",
      company_description_visible: true,
      compliance_badges_visible: true,
      id: 1,
      intro_visible: true,
      resources_visible: true,
      subprocessor_visible: true,
      terms_and_contact_visible: true,
    },
    intro: {
      our_mission_text: "Mission",
      our_mission_visible: true,
      our_statement_text: "Statement",
      our_statement_visible: true,
      purpose_text: "Purpose",
      purpose_visible: true,
    },
  },
};

describe("useAITrustCentreOverview", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  it("should fetch overview on mount", async () => {
    mockGetOverview.mockResolvedValue({ data: mockOverviewData });

    const { result } = renderHook(() => useAITrustCentreOverview());

    expect(result.current.loading).toBe(true);

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(mockGetOverview).toHaveBeenCalledTimes(1);
    expect(result.current.data).toEqual(mockOverviewData.overview);
    expect(result.current.error).toBeNull();
  });

  it("should handle response with overview at top level", async () => {
    mockGetOverview.mockResolvedValue(mockOverviewData);

    const { result } = renderHook(() => useAITrustCentreOverview());

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.data).toEqual(mockOverviewData.overview);
  });

  it("should set data to null when no overview in response", async () => {
    mockGetOverview.mockResolvedValue({});

    const { result } = renderHook(() => useAITrustCentreOverview());

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.data).toBeNull();
  });

  it("should handle fetch error", async () => {
    const rejectionHandler = vi.fn();
    process.on("unhandledRejection", rejectionHandler);
    const testError = new Error("Fetch failed");
    mockGetOverview.mockRejectedValue(testError);

    const { result } = renderHook(() => useAITrustCentreOverview());

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.error).toBe("Fetch failed");
    process.removeListener("unhandledRejection", rejectionHandler);
  });

  it("should update overview successfully", async () => {
    mockGetOverview.mockResolvedValue({ data: mockOverviewData });
    mockUpdateOverview.mockResolvedValue({});

    const { result } = renderHook(() => useAITrustCentreOverview());

    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.updateOverview({ info: { title: "Updated" } as any });
    });

    expect(mockUpdateOverview).toHaveBeenCalledWith({ info: { title: "Updated" } });
  });

  it("should handle update error", async () => {
    mockGetOverview.mockResolvedValue({ data: mockOverviewData });
    const testError = new Error("Update failed");
    mockUpdateOverview.mockRejectedValue(testError);

    const { result } = renderHook(() => useAITrustCentreOverview());

    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      try {
        await result.current.updateOverview({ info: { title: "Updated" } as any });
      } catch {
        // expected
      }
    });

    expect(result.current.error).toBe("Update failed");
  });

  it("should refetch on fetchOverview call", async () => {
    mockGetOverview.mockResolvedValue({ data: mockOverviewData });

    const { result } = renderHook(() => useAITrustCentreOverview());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(mockGetOverview).toHaveBeenCalledTimes(1);

    mockGetOverview.mockResolvedValue({ data: { overview: { info: { title: "Refreshed" } } } });

    await act(async () => {
      await result.current.fetchOverview();
    });

    expect(mockGetOverview).toHaveBeenCalledTimes(2);
    expect(result.current.data).toEqual({ info: { title: "Refreshed" } });
  });
});
