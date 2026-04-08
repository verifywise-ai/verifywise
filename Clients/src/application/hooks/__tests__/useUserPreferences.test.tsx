import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useAuth } from "../useAuth";
import useUserPreferences from "../useUserPreferences";
import * as userPreferencesRepository from "../../repository/userPreferences.repository";

const mockGetUserPreferencesByUserId = userPreferencesRepository.getUserPreferencesByUserId as jest.Mock;
const mockUseAuth = useAuth as jest.Mock;

vi.mock("../useAuth", () => ({
  useAuth: vi.fn(),
}));

vi.mock("../../repository/userPreferences.repository", () => ({
  getUserPreferencesByUserId: vi.fn(),
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

describe("useUserPreferences", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseAuth.mockReturnValue({ userId: 123 });
  });

  describe("initial state", () => {
    it("should start with loading true when no data", async () => {
      mockGetUserPreferencesByUserId.mockImplementation(() => new Promise(() => {}));

      const { result } = renderHook(() => useUserPreferences(), {
        wrapper: createWrapper(),
      });

      expect(result.current.loading).toBe(true);
    });

    it("should be disabled when no userId", async () => {
      mockUseAuth.mockReturnValue({ userId: null });

      const { result } = renderHook(() => useUserPreferences(), {
        wrapper: createWrapper(),
      });

      expect(result.current.loading).toBe(false);
      expect(mockGetUserPreferencesByUserId).not.toHaveBeenCalled();
    });
  });

  describe("successful fetch", () => {
    it("should return user preferences on successful fetch", async () => {
      const mockPreferences = {
        date_format: "DD/MM/YYYY",
      };

      mockGetUserPreferencesByUserId.mockResolvedValue({ data: mockPreferences });

      const { result } = renderHook(() => useUserPreferences(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.userPreferences).toEqual(mockPreferences);
      expect(result.current.isDefault).toBe(false);
    });
  });

  describe("error handling", () => {
    it("should use default preferences on error", async () => {
      mockGetUserPreferencesByUserId.mockRejectedValue(new Error("Network error"));

      const { result } = renderHook(() => useUserPreferences(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.isDefault).toBe(true);
      expect(result.current.userPreferences).toHaveProperty("date_format");
    });

    it("should handle non-Error objects", async () => {
      mockGetUserPreferencesByUserId.mockRejectedValue("Something went wrong");

      const { result } = renderHook(() => useUserPreferences(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.error).toBe("Something went wrong");
    });
  });

  describe("refreshUserPreferences", () => {
    it("should provide refreshUserPreferences function", async () => {
      mockGetUserPreferencesByUserId.mockResolvedValue({ data: {} });

      const { result } = renderHook(() => useUserPreferences(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(typeof result.current.refreshUserPreferences).toBe("function");
    });
  });
});
