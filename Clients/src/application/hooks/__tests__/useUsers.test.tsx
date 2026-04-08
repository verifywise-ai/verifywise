import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useAuth } from "../useAuth";
import useUsers from "../useUsers";
import * as userRepository from "../../repository/user.repository";

const mockGetAllUsers = userRepository.getAllUsers as jest.Mock;
const mockUseAuth = useAuth as jest.Mock;

vi.mock("../useAuth", () => ({
  useAuth: vi.fn(),
}));

vi.mock("../../repository/user.repository", () => ({
  getAllUsers: vi.fn(),
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

describe("useUsers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseAuth.mockReturnValue({ userId: 123 });
  });

  describe("initial state", () => {
    it("should start with loading true and empty users", async () => {
      mockGetAllUsers.mockImplementation(() => new Promise(() => {}));

      const { result } = renderHook(() => useUsers(), {
        wrapper: createWrapper(),
      });

      expect(result.current.loading).toBe(true);
      expect(result.current.users).toEqual([]);
    });

    it("should be disabled when no userId", async () => {
      mockUseAuth.mockReturnValue({ userId: null });

      const { result } = renderHook(() => useUsers(), {
        wrapper: createWrapper(),
      });

      expect(result.current.loading).toBe(false);
      expect(mockGetAllUsers).not.toHaveBeenCalled();
    });
  });

  describe("successful fetch", () => {
    it("should return formatted users on successful fetch", async () => {
      const mockResponse = {
        data: [
          { id: 1, name: "John", surname: "Doe", email: "john@test.com", role_id: 1 },
          { id: 2, name: "Jane", surname: "Smith", email: "jane@test.com", role_id: 2 },
        ],
      };

      mockGetAllUsers.mockResolvedValue(mockResponse);

      const { result } = renderHook(() => useUsers(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.users).toHaveLength(2);
      expect(result.current.users[0]).toEqual({
        id: 1,
        name: "John",
        surname: "Doe",
        email: "john@test.com",
        roleId: 1,
      });
      expect(result.current.error).toBeNull();
    });

    it("should handle empty users", async () => {
      mockGetAllUsers.mockResolvedValue({ data: [] });

      const { result } = renderHook(() => useUsers(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.users).toEqual([]);
    });
  });

  describe("error handling", () => {
    it("should set error on fetch failure", async () => {
      mockGetAllUsers.mockRejectedValue(new Error("Network error"));

      const { result } = renderHook(() => useUsers(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.error).toBe("Network error");
    });

    it("should handle non-Error objects", async () => {
      mockGetAllUsers.mockRejectedValue("Something went wrong");

      const { result } = renderHook(() => useUsers(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.error).toBe("Something went wrong");
    });
  });

  describe("refreshUsers", () => {
    it("should provide refreshUsers function", async () => {
      mockGetAllUsers.mockResolvedValue({ data: [] });

      const { result } = renderHook(() => useUsers(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(typeof result.current.refreshUsers).toBe("function");
    });
  });
});
