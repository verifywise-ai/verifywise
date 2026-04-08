import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import useVendorRisks, { vendorRiskQueryKeys } from "../useVendorRisks";
import * as vendorRiskRepository from "../../repository/vendorRisk.repository";

const mockGetAllVendorRisks = vendorRiskRepository.getAllVendorRisks as jest.Mock;

vi.mock("../../repository/vendorRisk.repository", () => ({
  getAllVendorRisks: vi.fn(),
}));

vi.mock("../tools/stringUtil", () => ({
  convertToCamelCaseRiskKey: vi.fn((key) => key),
}));

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

describe("useVendorRisks", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("initial state", () => {
    it("should start with loading true and empty vendor risks", async () => {
      mockGetAllVendorRisks.mockImplementation(() => new Promise(() => {}));

      const { result } = renderHook(() => useVendorRisks({}), {
        wrapper: createWrapper(),
      });

      expect(result.current.loadingVendorRisks).toBe(true);
      expect(result.current.vendorRisks).toEqual([]);
    });
  });

  describe("successful fetch", () => {
    it("should return vendor risks on successful fetch", async () => {
      const mockRisks = [
        { id: 1, vendor_id: 1, risk_level: "high" },
        { id: 2, vendor_id: 1, risk_level: "low" },
      ];

      mockGetAllVendorRisks.mockResolvedValue({ data: mockRisks });

      const { result } = renderHook(() => useVendorRisks({}), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.loadingVendorRisks).toBe(false);
      });

      expect(result.current.vendorRisks).toEqual(mockRisks);
      expect(result.current.error).toBe(false);
    });

    it("should filter by projectId", async () => {
      const mockRisks = [
        { id: 1, project_id: 1, vendor_id: 1, risk_level: "high" },
        { id: 2, project_id: 2, vendor_id: 1, risk_level: "low" },
      ];

      mockGetAllVendorRisks.mockResolvedValue({ data: mockRisks });

      const { result } = renderHook(() => useVendorRisks({ projectId: "1" }), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.loadingVendorRisks).toBe(false);
      });

      expect(result.current.vendorRisks).toHaveLength(1);
      expect(result.current.vendorRisks[0].project_id).toBe(1);
    });

    it("should filter by vendorId", async () => {
      const mockRisks = [
        { id: 1, project_id: 1, vendor_id: 1, risk_level: "high" },
        { id: 2, project_id: 1, vendor_id: 2, risk_level: "low" },
      ];

      mockGetAllVendorRisks.mockResolvedValue({ data: mockRisks });

      const { result } = renderHook(() => useVendorRisks({ vendorId: "1" }), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.loadingVendorRisks).toBe(false);
      });

      expect(result.current.vendorRisks).toHaveLength(1);
      expect(result.current.vendorRisks[0].vendor_id).toBe(1);
    });

    it("should compute vendorRisksSummary", async () => {
      const mockRisks = [
        { id: 1, vendor_id: 1, risk_level: "high" },
        { id: 2, vendor_id: 1, risk_level: "high" },
        { id: 3, vendor_id: 1, risk_level: "low" },
      ];

      mockGetAllVendorRisks.mockResolvedValue({ data: mockRisks });

      const { result } = renderHook(() => useVendorRisks({}), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.loadingVendorRisks).toBe(false);
      });

      expect(result.current.vendorRisksSummary.total).toBe(3);
    });
  });

  describe("error handling", () => {
    it("should set error on fetch failure", async () => {
      mockGetAllVendorRisks.mockRejectedValue(new Error("Network error"));

      const { result } = renderHook(() => useVendorRisks({}), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.loadingVendorRisks).toBe(false);
      });

      expect(result.current.error).toContain("Request failed");
    });
  });

  describe("queryKeys", () => {
    it("should have correct query key structure", () => {
      expect(vendorRiskQueryKeys.all).toEqual(["vendorRisks"]);
      expect(vendorRiskQueryKeys.lists()).toEqual(["vendorRisks", "list"]);
      expect(vendorRiskQueryKeys.list({})).toEqual(["vendorRisks", "list", {}]);
      expect(vendorRiskQueryKeys.list({ filter: "active" })).toEqual([
        "vendorRisks",
        "list",
        { filter: "active" },
      ]);
    });
  });
});
