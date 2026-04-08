import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useVendorRiskChangeHistory } from "../useVendorRiskChangeHistory";
import { useEntityChangeHistory } from "../useEntityChangeHistory";

vi.mock("../useEntityChangeHistory", () => ({
  useEntityChangeHistory: vi.fn(),
}));

const mockUseEntityChangeHistory = useEntityChangeHistory as jest.Mock;

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

describe("useVendorRiskChangeHistory", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should call useEntityChangeHistory with 'vendor_risk' entity type", () => {
    const mockData = {
      pages: [{
        data: [
          {
            id: 1,
            action: "updated" as const,
            field_name: "risk_level",
            old_value: "low",
            new_value: "high",
            changed_by_user_id: 1,
            changed_at: "2024-01-01",
          },
        ],
        hasMore: false,
        total: 1,
      }],
      pageParams: [0],
    };

    mockUseEntityChangeHistory.mockReturnValue({
      data: mockData,
      isLoading: false,
      isSuccess: true,
      isError: false,
      error: null,
      fetchNextPage: vi.fn(),
      hasNextPage: false,
      isFetchingNextPage: false,
    });

    const { result } = renderHook(() => useVendorRiskChangeHistory(1), {
      wrapper: createWrapper(),
    });

    expect(mockUseEntityChangeHistory).toHaveBeenCalledWith("vendor_risk", 1);
    expect(result.current.isSuccess).toBe(true);
  });

  it("should pass undefined when vendorRiskId is not provided", () => {
    mockUseEntityChangeHistory.mockReturnValue({
      data: undefined,
      isLoading: false,
      isSuccess: false,
      isError: false,
      error: null,
      fetchNextPage: vi.fn(),
      hasNextPage: false,
      isFetchingNextPage: false,
    });

    renderHook(() => useVendorRiskChangeHistory(undefined), {
      wrapper: createWrapper(),
    });

    expect(mockUseEntityChangeHistory).toHaveBeenCalledWith("vendor_risk", undefined);
  });

  it("should return error state when useEntityChangeHistory fails", () => {
    mockUseEntityChangeHistory.mockReturnValue({
      data: undefined,
      isLoading: false,
      isSuccess: false,
      isError: true,
      error: new Error("Failed to fetch"),
      fetchNextPage: vi.fn(),
      hasNextPage: false,
      isFetchingNextPage: false,
    });

    const { result } = renderHook(() => useVendorRiskChangeHistory(1), {
      wrapper: createWrapper(),
    });

    expect(result.current.isError).toBe(true);
    expect(result.current.error).toBeDefined();
  });
});
