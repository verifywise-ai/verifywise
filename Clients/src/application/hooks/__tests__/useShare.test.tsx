import { renderHook, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  useShareLinks,
  useShareLinkByToken,
  useCreateShareLink,
  useUpdateShareLink,
  useDeleteShareLink,
  shareQueryKeys,
} from "../useShare";
import * as shareRepository from "../../repository/share.repository";

const mockGetShareLinksForResource = shareRepository.getShareLinksForResource as jest.Mock;
const mockGetShareLinkByToken = shareRepository.getShareLinkByToken as jest.Mock;
const mockCreateShareLink = shareRepository.createShareLink as jest.Mock;
const mockUpdateShareLink = shareRepository.updateShareLink as jest.Mock;
const mockDeleteShareLink = shareRepository.deleteShareLink as jest.Mock;

vi.mock("../../repository/share.repository", () => ({
  createShareLink: vi.fn(),
  getShareLinksForResource: vi.fn(),
  getShareLinkByToken: vi.fn(),
  updateShareLink: vi.fn(),
  deleteShareLink: vi.fn(),
  CreateShareLinkParams: {},
  UpdateShareLinkParams: {},
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

describe("useShare hooks", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("useShareLinks", () => {
    it("should fetch share links for a resource", async () => {
      const mockLinks = [
        { id: 1, token: "abc123", resource_type: "project", resource_id: 1 },
        { id: 2, token: "def456", resource_type: "project", resource_id: 1 },
      ];
      mockGetShareLinksForResource.mockResolvedValue({ data: mockLinks });

      const { result } = renderHook(
        () => useShareLinks("project", 1),
        { wrapper: createWrapper() }
      );

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(mockGetShareLinksForResource).toHaveBeenCalledWith("project", 1);
      expect(result.current.data).toEqual(mockLinks);
    });

    it("should not fetch when resourceType is empty", async () => {
      const { result } = renderHook(
        () => useShareLinks("", 1),
        { wrapper: createWrapper() }
      );

      expect(result.current.isLoading).toBe(false);
      expect(mockGetShareLinksForResource).not.toHaveBeenCalled();
    });

    it("should not fetch when resourceId is falsy", async () => {
      const { result } = renderHook(
        () => useShareLinks("project", 0),
        { wrapper: createWrapper() }
      );

      expect(result.current.isLoading).toBe(false);
      expect(mockGetShareLinksForResource).not.toHaveBeenCalled();
    });

    it("should handle empty response", async () => {
      mockGetShareLinksForResource.mockResolvedValue({ data: [] });

      const { result } = renderHook(
        () => useShareLinks("project", 1),
        { wrapper: createWrapper() }
      );

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(result.current.data).toEqual([]);
    });
  });

  describe("useShareLinkByToken", () => {
    it("should fetch share link by token", async () => {
      const mockLink = { id: 1, token: "abc123", resource_type: "project", resource_id: 1 };
      mockGetShareLinkByToken.mockResolvedValue({ data: mockLink });

      const { result } = renderHook(
        () => useShareLinkByToken("abc123"),
        { wrapper: createWrapper() }
      );

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(mockGetShareLinkByToken).toHaveBeenCalledWith("abc123");
      expect(result.current.data).toEqual(mockLink);
    });

    it("should not fetch when token is empty", async () => {
      const { result } = renderHook(
        () => useShareLinkByToken(""),
        { wrapper: createWrapper() }
      );

      expect(result.current.isLoading).toBe(false);
      expect(mockGetShareLinkByToken).not.toHaveBeenCalled();
    });
  });

  describe("useCreateShareLink mutation", () => {
    it("should create share link", async () => {
      const queryClient = new QueryClient();
      const mockLink = { id: 1, token: "new123", resource_type: "project", resource_id: 1 };
      mockCreateShareLink.mockResolvedValue({ data: mockLink });

      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      );

      const { result } = renderHook(() => useCreateShareLink(), { wrapper });

      let error: Error | null = null;
      await act(async () => {
        try {
          await result.current.mutateAsync({
            resource_type: "project",
            resource_id: 1,
            expires_in_days: 7,
          });
        } catch (e) {
          error = e as Error;
        }
      });

      expect(error).toBeNull();
      expect(mockCreateShareLink).toHaveBeenCalled();
    });
  });

  describe("useUpdateShareLink mutation", () => {
    it("should update share link", async () => {
      const queryClient = new QueryClient();
      const mockLink = { id: 1, token: "abc123", resource_type: "project", resource_id: 1 };
      mockUpdateShareLink.mockResolvedValue({ data: mockLink });

      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      );

      const { result } = renderHook(() => useUpdateShareLink(), { wrapper });

      let error: Error | null = null;
      await act(async () => {
        try {
          await result.current.mutateAsync({ id: 1, expires_in_days: 30 });
        } catch (e) {
          error = e as Error;
        }
      });

      expect(error).toBeNull();
      expect(mockUpdateShareLink).toHaveBeenCalled();
    });
  });

  describe("useDeleteShareLink mutation", () => {
    it("should delete share link", async () => {
      const queryClient = new QueryClient();
      mockDeleteShareLink.mockResolvedValue({ data: { success: true } });

      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      );

      const { result } = renderHook(() => useDeleteShareLink(), { wrapper });

      let error: Error | null = null;
      await act(async () => {
        try {
          await result.current.mutateAsync(1);
        } catch (e) {
          error = e as Error;
        }
      });

      expect(error).toBeNull();
      expect(mockDeleteShareLink).toHaveBeenCalledWith(1);
    });
  });

  describe("shareQueryKeys", () => {
    it("should have correct query key structure", () => {
      expect(shareQueryKeys.all).toEqual(["shares"]);
      expect(shareQueryKeys.lists()).toEqual(["shares", "list"]);
      expect(shareQueryKeys.list("project", 1)).toEqual(["shares", "list", "project", 1]);
      expect(shareQueryKeys.details()).toEqual(["shares", "detail"]);
      expect(shareQueryKeys.detail("abc123")).toEqual(["shares", "detail", "abc123"]);
    });
  });
});
