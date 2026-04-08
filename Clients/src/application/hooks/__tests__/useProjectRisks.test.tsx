import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import useProjectRisks from "../useProjectRisks";
import * as projectRiskRepository from "../../repository/projectRisk.repository";

const mockGetAllProjectRisksByProjectId = projectRiskRepository.getAllProjectRisksByProjectId as jest.Mock;

vi.mock("../../repository/projectRisk.repository", () => ({
  getAllProjectRisksByProjectId: vi.fn(),
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

describe("useProjectRisks", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("initial state", () => {
    it("should not fetch when projectId is 0 (falsy)", () => {
      const { result } = renderHook(() => useProjectRisks({ projectId: 0 }), {
        wrapper: createWrapper(),
      });

      expect(result.current.loadingProjectRisks).toBe(false);
      expect(result.current.projectRisks).toEqual([]);
    });
  });

  describe("successful fetch", () => {
    it("should return project risks on successful fetch", async () => {
      const mockRisks = [
        { id: 1, project_id: 1, risk_level_autocalculated: "high" },
        { id: 2, project_id: 1, risk_level_autocalculated: "low" },
      ];

      mockGetAllProjectRisksByProjectId.mockResolvedValue({ data: mockRisks });

      const { result } = renderHook(() => useProjectRisks({ projectId: 1 }), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.loadingProjectRisks).toBe(false);
      });

      expect(result.current.projectRisks).toEqual(mockRisks);
      expect(result.current.error).toBe(false);
    });

    it("should handle empty risks", async () => {
      mockGetAllProjectRisksByProjectId.mockResolvedValue({ data: [] });

      const { result } = renderHook(() => useProjectRisks({ projectId: 1 }), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.loadingProjectRisks).toBe(false);
      });

      expect(result.current.projectRisks).toEqual([]);
    });
  });

  describe("error handling", () => {
    it("should set error on fetch failure", async () => {
      mockGetAllProjectRisksByProjectId.mockRejectedValue(new Error("Network error"));

      const { result } = renderHook(() => useProjectRisks({ projectId: 1 }), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.loadingProjectRisks).toBe(false);
      });

      expect(result.current.error).toContain("Network error");
    });
  });
});
