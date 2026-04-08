import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import useFrameworks from "../useFrameworks";
import * as entityRepository from "../../repository/entity.repository";

const mockGetAllFrameworks = entityRepository.getAllFrameworks as jest.Mock;

vi.mock("../../repository/entity.repository", () => ({
  getAllFrameworks: vi.fn(),
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

describe("useFrameworks", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("initial state", () => {
    it("should start with loading true and empty data", async () => {
      mockGetAllFrameworks.mockImplementation(
        () => new Promise(() => {})
      );

      const { result } = renderHook(() => useFrameworks({ listOfFrameworks: [] }), {
        wrapper: createWrapper(),
      });

      expect(result.current.loading).toBe(true);
      expect(result.current.allFrameworks).toEqual([]);
      expect(result.current.error).toBeNull();
    });
  });

  describe("successful fetch", () => {
    it("should return frameworks on successful fetch", async () => {
      const mockFrameworks = [
        { id: 1, name: "EU AI Act", description: "AI regulation" },
        { id: 2, name: "ISO 27001", description: "Security standard" },
      ];

      mockGetAllFrameworks.mockResolvedValue({ data: mockFrameworks });

      const { result } = renderHook(() => useFrameworks({ listOfFrameworks: [] }), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.allFrameworks).toEqual(mockFrameworks);
      expect(result.current.error).toBeNull();
    });

    it("should filter frameworks based on listOfFrameworks", async () => {
      const mockFrameworks = [
        { id: 1, name: "EU AI Act", description: "AI regulation" },
        { id: 2, name: "ISO 27001", description: "Security standard" },
        { id: 3, name: "GDPR", description: "Privacy regulation" },
      ];

      mockGetAllFrameworks.mockResolvedValue({ data: mockFrameworks });

      const listOfFrameworks = [
        { framework_id: "1", project_framework_id: 100 },
        { framework_id: "3", project_framework_id: 101 },
      ];

      const { result } = renderHook(
        () => useFrameworks({ listOfFrameworks }),
        { wrapper: createWrapper() }
      );

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.filteredFrameworks).toHaveLength(2);
      expect(result.current.filteredFrameworks[0].name).toBe("EU AI Act");
      expect(result.current.filteredFrameworks[1].name).toBe("GDPR");
    });

    it("should create project frameworks map", async () => {
      const mockFrameworks = [
        { id: 1, name: "EU AI Act" },
        { id: 2, name: "ISO 27001" },
      ];

      mockGetAllFrameworks.mockResolvedValue({ data: mockFrameworks });

      const listOfFrameworks = [
        { framework_id: "1", project_framework_id: 100 },
        { framework_id: "2", project_framework_id: 101 },
      ];

      const { result } = renderHook(
        () => useFrameworks({ listOfFrameworks }),
        { wrapper: createWrapper() }
      );

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.projectFrameworksMap.get(1)).toBe(100);
      expect(result.current.projectFrameworksMap.get(2)).toBe(101);
    });

    it("should return empty filtered frameworks when listOfFrameworks is empty", async () => {
      const mockFrameworks = [
        { id: 1, name: "EU AI Act" },
      ];

      mockGetAllFrameworks.mockResolvedValue({ data: mockFrameworks });

      const { result } = renderHook(
        () => useFrameworks({ listOfFrameworks: [] }),
        { wrapper: createWrapper() }
      );

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.filteredFrameworks).toEqual([]);
    });
  });

  describe("error handling", () => {
    it("should set error message on fetch failure", async () => {
      mockGetAllFrameworks.mockRejectedValue(new Error("Network error"));

      const { result } = renderHook(() => useFrameworks({ listOfFrameworks: [] }), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.error).toBe("Network error");
      expect(result.current.allFrameworks).toEqual([]);
    });

    it("should handle non-Error objects in error", async () => {
      mockGetAllFrameworks.mockRejectedValue("Something went wrong");

      const { result } = renderHook(() => useFrameworks({ listOfFrameworks: [] }), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.error).toBe("Failed to fetch frameworks");
    });

    it("should handle invalid response format", async () => {
      mockGetAllFrameworks.mockResolvedValue({});

      const { result } = renderHook(() => useFrameworks({ listOfFrameworks: [] }), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.error).toBe("Invalid response format");
    });
  });

  describe("refresh functions", () => {
    it("should provide refreshAllFrameworks function", async () => {
      mockGetAllFrameworks.mockResolvedValue({ data: [] });

      const { result } = renderHook(() => useFrameworks({ listOfFrameworks: [] }), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(typeof result.current.refreshAllFrameworks).toBe("function");
    });

    it("should provide refreshFilteredFrameworks function", async () => {
      mockGetAllFrameworks.mockResolvedValue({ data: [] });

      const { result } = renderHook(() => useFrameworks({ listOfFrameworks: [] }), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(typeof result.current.refreshFilteredFrameworks).toBe("function");
    });
  });
});
