import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEntityIntakeSubmission } from "../useEntityIntakeSubmission";
import * as intakeFormRepository from "../../repository/intakeForm.repository";

vi.mock("../../repository/intakeForm.repository", () => ({
  getEntityIntakeSubmission: vi.fn(),
}));

const mockGetEntityIntakeSubmission = intakeFormRepository.getEntityIntakeSubmission as jest.Mock;

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
};

describe("useEntityIntakeSubmission", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should not fetch when entityId is null", () => {
    const { result } = renderHook(
      () => useEntityIntakeSubmission("use_case", null),
      { wrapper: createWrapper() }
    );

    expect(result.current.isLoading).toBe(false);
    expect(result.current.isFetching).toBe(false);
    expect(mockGetEntityIntakeSubmission).not.toHaveBeenCalled();
  });

  it("should not fetch when entityId is 0", () => {
    const { result } = renderHook(
      () => useEntityIntakeSubmission("use_case", 0),
      { wrapper: createWrapper() }
    );

    expect(result.current.isLoading).toBe(false);
    expect(result.current.isFetching).toBe(false);
    expect(mockGetEntityIntakeSubmission).not.toHaveBeenCalled();
  });

  it("should fetch submission when entityId is valid for use_case", async () => {
    const mockSubmission = {
      id: 1,
      entity_type: "use_case",
      entity_id: 123,
      status: "completed",
    };
    mockGetEntityIntakeSubmission.mockResolvedValue(mockSubmission);

    const { result } = renderHook(
      () => useEntityIntakeSubmission("use_case", 123),
      { wrapper: createWrapper() }
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toEqual(mockSubmission);
    expect(mockGetEntityIntakeSubmission).toHaveBeenCalledWith(
      "use_case",
      123,
      expect.any(Object)
    );
  });

  it("should fetch submission when entityId is valid for model", async () => {
    const mockSubmission = {
      id: 2,
      entity_type: "model",
      entity_id: 456,
      status: "pending",
    };
    mockGetEntityIntakeSubmission.mockResolvedValue(mockSubmission);

    const { result } = renderHook(
      () => useEntityIntakeSubmission("model", 456),
      { wrapper: createWrapper() }
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toEqual(mockSubmission);
  });

  it("should handle error when fetch fails", async () => {
    mockGetEntityIntakeSubmission.mockRejectedValue(new Error("Failed to fetch"));

    const { result } = renderHook(
      () => useEntityIntakeSubmission("use_case", 123),
      { wrapper: createWrapper() }
    );

    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(result.current.error).toBeDefined();
  });

  it("should return null data when no submission exists", async () => {
    mockGetEntityIntakeSubmission.mockResolvedValue(null);

    const { result } = renderHook(
      () => useEntityIntakeSubmission("use_case", 123),
      { wrapper: createWrapper() }
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toBeNull();
  });

  it("should use correct query key format", async () => {
    mockGetEntityIntakeSubmission.mockResolvedValue(null);

    renderHook(
      () => useEntityIntakeSubmission("use_case", 123),
      { wrapper: createWrapper() }
    );

    await waitFor(() => {});

    expect(mockGetEntityIntakeSubmission).toHaveBeenCalledWith(
      "use_case",
      123,
      expect.any(Object)
    );
  });
});
