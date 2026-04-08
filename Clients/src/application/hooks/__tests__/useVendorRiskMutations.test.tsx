import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useCreateVendorRisk, useUpdateVendorRisk, useDeleteVendorRisk, useVendorRisk } from "../useVendorRiskMutations";
import * as vendorRiskRepository from "../../repository/vendorRisk.repository";
import * as useVendorRisks from "../useVendorRisks";

vi.mock("../../repository/vendorRisk.repository", () => ({
  createVendorRisk: vi.fn(),
  updateVendorRisk: vi.fn(),
  deleteVendorRisk: vi.fn(),
  getVendorRiskById: vi.fn(),
}));

vi.mock("../useVendorRisks", () => ({
  vendorRiskQueryKeys: {
    all: ["vendorRisks"],
    lists: vi.fn(() => ["vendorRisks", "list"]),
    detail: vi.fn(() => ["vendorRisks", "detail"]),
  },
}));

const mockCreateVendorRisk = vendorRiskRepository.createVendorRisk as unknown as ReturnType<typeof vi.fn>;
const mockUpdateVendorRisk = vendorRiskRepository.updateVendorRisk as unknown as ReturnType<typeof vi.fn>;
const mockDeleteVendorRisk = vendorRiskRepository.deleteVendorRisk as unknown as ReturnType<typeof vi.fn>;
const mockGetVendorRiskById = vendorRiskRepository.getVendorRiskById as unknown as ReturnType<typeof vi.fn>;

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

describe("useVendorRiskMutations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("useCreateVendorRisk", () => {
    it("should create a vendor risk successfully", async () => {
      const mockResponse = { id: 1, name: "Test Risk" };
      mockCreateVendorRisk.mockResolvedValue(mockResponse);

      const { result } = renderHook(() => useCreateVendorRisk(), {
        wrapper: createWrapper(),
      });

      let isLoading = true;
      result.current.mutate({ name: "Test Risk" });

      await waitFor(() => {
        isLoading = result.current.isLoading;
      });

      expect(result.current.isSuccess).toBe(true);
      expect(mockCreateVendorRisk).toHaveBeenCalledWith({ body: { name: "Test Risk" } });
    });

    it("should handle create error", async () => {
      const error = new Error("Failed to create vendor risk");
      mockCreateVendorRisk.mockRejectedValue(error);

      const { result } = renderHook(() => useCreateVendorRisk(), {
        wrapper: createWrapper(),
      });

      result.current.mutate({ name: "Test Risk" });

      await waitFor(() => {
        expect(result.current.isError).toBe(true);
      });

      expect(result.current.error).toBeDefined();
    });
  });

  describe("useUpdateVendorRisk", () => {
    it("should update a vendor risk successfully", async () => {
      const mockResponse = { id: 1, name: "Updated Risk" };
      mockUpdateVendorRisk.mockResolvedValue(mockResponse);

      const { result } = renderHook(() => useUpdateVendorRisk(), {
        wrapper: createWrapper(),
      });

      result.current.mutate({ id: 1, data: { name: "Updated Risk" } });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(mockUpdateVendorRisk).toHaveBeenCalledWith({
        id: 1,
        body: { name: "Updated Risk" },
      });
    });

    it("should handle update error", async () => {
      const error = new Error("Failed to update vendor risk");
      mockUpdateVendorRisk.mockRejectedValue(error);

      const { result } = renderHook(() => useUpdateVendorRisk(), {
        wrapper: createWrapper(),
      });

      result.current.mutate({ id: 1, data: { name: "Updated Risk" } });

      await waitFor(() => {
        expect(result.current.isError).toBe(true);
      });

      expect(result.current.error).toBeDefined();
    });
  });

  describe("useDeleteVendorRisk", () => {
    it("should delete a vendor risk successfully", async () => {
      mockDeleteVendorRisk.mockResolvedValue(undefined);

      const { result } = renderHook(() => useDeleteVendorRisk(), {
        wrapper: createWrapper(),
      });

      result.current.mutate(1);

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(mockDeleteVendorRisk).toHaveBeenCalledWith({ id: 1 });
    });

    it("should handle delete error", async () => {
      const error = new Error("Failed to delete vendor risk");
      mockDeleteVendorRisk.mockRejectedValue(error);

      const { result } = renderHook(() => useDeleteVendorRisk(), {
        wrapper: createWrapper(),
      });

      result.current.mutate(1);

      await waitFor(() => {
        expect(result.current.isError).toBe(true);
      });

      expect(result.current.error).toBeDefined();
    });
  });

  describe("useVendorRisk", () => {
    it("should fetch a vendor risk by ID", async () => {
      const mockRisk = { id: 1, name: "Test Risk", description: "Test description" };
      mockGetVendorRiskById.mockResolvedValue({ data: mockRisk });

      const { result } = renderHook(() => useVendorRisk(1), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(result.current.data).toEqual(mockRisk);
      expect(mockGetVendorRiskById).toHaveBeenCalledWith({ id: 1 });
    });

    it("should not fetch when id is not provided", async () => {
      const { result } = renderHook(() => useVendorRisk(0), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(mockGetVendorRiskById).not.toHaveBeenCalled();
    });

    it("should handle fetch error", async () => {
      mockGetVendorRiskById.mockRejectedValue(new Error("Failed to fetch vendor risk"));

      const { result } = renderHook(() => useVendorRisk(1), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isError).toBe(true);
      });

      expect(result.current.error).toBeDefined();
    });
  });
});
