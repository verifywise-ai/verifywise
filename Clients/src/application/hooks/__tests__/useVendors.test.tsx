import { renderHook, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  useVendors,
  useVendor,
  useCreateVendor,
  useUpdateVendor,
  useDeleteVendor,
  vendorQueryKeys,
} from "../useVendors";
import * as vendorRepository from "../../repository/vendor.repository";

const mockGetAllVendors = vendorRepository.getAllVendors as jest.Mock;
const mockGetVendorById = vendorRepository.getVendorById as jest.Mock;
const mockGetVendorsByProjectId = vendorRepository.getVendorsByProjectId as jest.Mock;
const mockCreateNewVendor = vendorRepository.createNewVendor as jest.Mock;
const mockUpdateVendor = vendorRepository.update as jest.Mock;
const mockDeleteVendor = vendorRepository.deleteVendor as jest.Mock;

vi.mock("../../repository/vendor.repository", () => ({
  getAllVendors: vi.fn(),
  getVendorById: vi.fn(),
  getVendorsByProjectId: vi.fn(),
  createNewVendor: vi.fn(),
  update: vi.fn(),
  deleteVendor: vi.fn(),
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

describe("useVendors", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("useVendors query", () => {
    it("should fetch all vendors when no projectId filter", async () => {
      const mockVendors = [
        { id: 1, name: "Vendor A" },
        { id: 2, name: "Vendor B" },
      ];
      mockGetAllVendors.mockResolvedValue({ data: mockVendors });

      const { result } = renderHook(() => useVendors(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(mockGetAllVendors).toHaveBeenCalled();
      expect(result.current.data).toEqual(mockVendors);
    });

    it("should fetch vendors by projectId when filter provided", async () => {
      const mockVendors = [{ id: 1, name: "Vendor A" }];
      mockGetVendorsByProjectId.mockResolvedValue({ data: mockVendors });

      const { result } = renderHook(() => useVendors({ projectId: "123" }), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(mockGetVendorsByProjectId).toHaveBeenCalledWith({ projectId: 123 });
    });

    it("should not call API when projectId is 'all'", async () => {
      mockGetAllVendors.mockResolvedValue({ data: [] });

      const { result } = renderHook(() => useVendors({ projectId: "all" }), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(mockGetAllVendors).toHaveBeenCalled();
      expect(mockGetVendorsByProjectId).not.toHaveBeenCalled();
    });

    it("should handle empty response", async () => {
      mockGetAllVendors.mockResolvedValue({ data: [] });

      const { result } = renderHook(() => useVendors(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(result.current.data).toEqual([]);
    });
  });

  describe("useVendor query", () => {
    it("should fetch vendor by id", async () => {
      const mockVendor = { id: 1, name: "Vendor A" };
      mockGetVendorById.mockResolvedValue({ data: mockVendor });

      const { result } = renderHook(() => useVendor(1), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(mockGetVendorById).toHaveBeenCalledWith({ id: 1 });
      expect(result.current.data).toEqual(mockVendor);
    });

    it("should not fetch when id is falsy", async () => {
      const { result } = renderHook(() => useVendor(0), {
        wrapper: createWrapper(),
      });

      expect(result.current.isLoading).toBe(false);
      expect(mockGetVendorById).not.toHaveBeenCalled();
    });
  });

  describe("useCreateVendor mutation", () => {
    it("should create vendor and invalidate queries", async () => {
      const queryClient = new QueryClient();
      const mockVendor = { id: 1, name: "New Vendor" };
      mockCreateNewVendor.mockResolvedValue({ data: mockVendor });

      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      );

      const { result } = renderHook(() => useCreateVendor(), {
        wrapper,
      });

      let error: Error | null = null;
      await act(async () => {
        try {
          await result.current.mutateAsync({ name: "New Vendor" });
        } catch (e) {
          error = e as Error;
        }
      });

      expect(error).toBeNull();
      expect(mockCreateNewVendor).toHaveBeenCalled();
    });
  });

  describe("useUpdateVendor mutation", () => {
    it("should update vendor and invalidate queries", async () => {
      const queryClient = new QueryClient();
      const mockVendor = { id: 1, name: "Updated Vendor" };
      mockUpdateVendor.mockResolvedValue({ data: mockVendor });

      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      );

      const { result } = renderHook(() => useUpdateVendor(), {
        wrapper,
      });

      let error: Error | null = null;
      await act(async () => {
        try {
          await result.current.mutateAsync({ id: 1, data: { name: "Updated Vendor" } });
        } catch (e) {
          error = e as Error;
        }
      });

      expect(error).toBeNull();
      expect(mockUpdateVendor).toHaveBeenCalled();
    });
  });

  describe("useDeleteVendor mutation", () => {
    it("should delete vendor and invalidate queries", async () => {
      const queryClient = new QueryClient();
      mockDeleteVendor.mockResolvedValue({});

      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      );

      const { result } = renderHook(() => useDeleteVendor(), {
        wrapper,
      });

      let error: Error | null = null;
      await act(async () => {
        try {
          await result.current.mutateAsync(1);
        } catch (e) {
          error = e as Error;
        }
      });

      expect(error).toBeNull();
      expect(mockDeleteVendor).toHaveBeenCalledWith({ id: 1 });
    });
  });

  describe("queryKeys", () => {
    it("should have correct query key structure", () => {
      expect(vendorQueryKeys.all).toEqual(["vendors"]);
      expect(vendorQueryKeys.lists()).toEqual(["vendors", "list"]);
      expect(vendorQueryKeys.list({})).toEqual(["vendors", "list", {}]);
      expect(vendorQueryKeys.list({ projectId: "123" })).toEqual([
        "vendors",
        "list",
        { projectId: "123" },
      ]);
      expect(vendorQueryKeys.details()).toEqual(["vendors", "detail"]);
      expect(vendorQueryKeys.detail(1)).toEqual(["vendors", "detail", 1]);
    });
  });
});
