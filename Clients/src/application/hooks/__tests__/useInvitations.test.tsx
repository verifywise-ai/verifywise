import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useAuth } from "../useAuth";
import useInvitations from "../useInvitations";
import * as invitationRepository from "../../repository/invitation.repository";

const mockGetInvitations = invitationRepository.getInvitations as jest.Mock;
const mockUseAuth = useAuth as jest.Mock;

vi.mock("../useAuth", () => ({
  useAuth: vi.fn(),
}));

vi.mock("../../repository/invitation.repository", () => ({
  getInvitations: vi.fn(),
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

describe("useInvitations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseAuth.mockReturnValue({ userId: 123 });
  });

  describe("initial state", () => {
    it("should start with loading true when no data", async () => {
      mockGetInvitations.mockImplementation(() => new Promise(() => {}));

      const { result } = renderHook(() => useInvitations(), {
        wrapper: createWrapper(),
      });

      expect(result.current.loading).toBe(true);
    });

    it("should be disabled when no userId", async () => {
      mockUseAuth.mockReturnValue({ userId: null });

      const { result } = renderHook(() => useInvitations(), {
        wrapper: createWrapper(),
      });

      expect(result.current.loading).toBe(false);
      expect(mockGetInvitations).not.toHaveBeenCalled();
    });
  });

  describe("successful fetch", () => {
    it("should return invitations on successful fetch", async () => {
      const mockInvitations = [
        { id: 1, email: "test@example.com", status: "pending" },
        { id: 2, email: "test2@example.com", status: "accepted" },
      ];

      mockGetInvitations.mockResolvedValue({ invitations: mockInvitations });

      const { result } = renderHook(() => useInvitations(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.invitations).toEqual(mockInvitations);
      expect(result.current.error).toBeNull();
    });

    it("should handle empty invitations", async () => {
      mockGetInvitations.mockResolvedValue({ invitations: [] });

      const { result } = renderHook(() => useInvitations(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.invitations).toEqual([]);
    });
  });

  describe("error handling", () => {
    it("should set error on fetch failure", async () => {
      mockGetInvitations.mockRejectedValue(new Error("Network error"));

      const { result } = renderHook(() => useInvitations(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.error).toBe("Network error");
    });

    it("should handle non-Error objects", async () => {
      mockGetInvitations.mockRejectedValue("Something went wrong");

      const { result } = renderHook(() => useInvitations(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.error).toBe("Something went wrong");
    });
  });

  describe("refreshInvitations", () => {
    it("should provide refreshInvitations function", async () => {
      mockGetInvitations.mockResolvedValue({ invitations: [] });

      const { result } = renderHook(() => useInvitations(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(typeof result.current.refreshInvitations).toBe("function");
    });
  });
});
