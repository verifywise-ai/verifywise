import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useRoles } from "../useRoles";
import * as entityRepository from "../../repository/entity.repository";

const mockGetEntityById = entityRepository.getEntityById as jest.Mock;

vi.mock("../../repository/entity.repository", () => ({
  getEntityById: vi.fn(),
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

describe("useRoles", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("initial state", () => {
    it("should start with loading true and empty roles", async () => {
      mockGetEntityById.mockImplementation(() => new Promise(() => {}));

      const { result } = renderHook(() => useRoles(), {
        wrapper: createWrapper(),
      });

      expect(result.current.loading).toBe(true);
      expect(result.current.roles).toEqual([]);
    });
  });

  describe("successful fetch", () => {
    it("should return roles on successful fetch", async () => {
      const mockRoles = [
        { id: 1, name: "Admin", description: "Administrator role" },
        { id: 2, name: "User", description: "Regular user role" },
      ];

      mockGetEntityById.mockResolvedValue({ data: mockRoles });

      const { result } = renderHook(() => useRoles(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.roles).toEqual(mockRoles);
      expect(result.current.error).toBeNull();
    });

    it("should handle empty roles", async () => {
      mockGetEntityById.mockResolvedValue({ data: [] });

      const { result } = renderHook(() => useRoles(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.roles).toEqual([]);
    });
  });

  describe("error handling", () => {
    it("should set error on fetch failure", async () => {
      mockGetEntityById.mockRejectedValue(new Error("Network error"));

      const { result } = renderHook(() => useRoles(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.error).toBeInstanceOf(Error);
    });
  });

  describe("refreshRoles", () => {
    it("should provide refreshRoles function", async () => {
      mockGetEntityById.mockResolvedValue({ data: [] });

      const { result } = renderHook(() => useRoles(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(typeof result.current.refreshRoles).toBe("function");
    });
  });
});
