import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  useTaskEntityLinks,
  useAddTaskEntityLink,
  useRemoveTaskEntityLink,
} from "../useTaskEntityLinks";
import * as taskEntityLinkRepository from "../../repository/taskEntityLink.repository";

vi.mock("../../repository/taskEntityLink.repository", () => ({
  getTaskEntityLinks: vi.fn(),
  addTaskEntityLink: vi.fn(),
  removeTaskEntityLink: vi.fn(),
}));

const mockGetTaskEntityLinks = taskEntityLinkRepository.getTaskEntityLinks as jest.Mock;
const mockAddTaskEntityLink = taskEntityLinkRepository.addTaskEntityLink as jest.Mock;
const mockRemoveTaskEntityLink = taskEntityLinkRepository.removeTaskEntityLink as jest.Mock;

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
      mutations: {
        retry: false,
      },
    },
  });

  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
};

describe("useTaskEntityLinks", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("useTaskEntityLinks", () => {
    it("should not fetch when taskId is undefined", () => {
      const { result } = renderHook(() => useTaskEntityLinks(undefined), {
        wrapper: createWrapper(),
      });

      expect(result.current.isLoading).toBe(false);
      expect(result.current.isFetching).toBe(false);
    });

    it("should fetch entity links for a task", async () => {
      const mockLinks = [
        { id: 1, task_id: 1, entity_id: 10, entity_type: "vendor" as const, entity_name: "Test Vendor" },
        { id: 2, task_id: 1, entity_id: 20, entity_type: "policy" as const, entity_name: "Test Policy" },
      ];
      mockGetTaskEntityLinks.mockResolvedValue(mockLinks);

      const { result } = renderHook(() => useTaskEntityLinks(1), {
        wrapper: createWrapper(),
      });

      expect(result.current.isLoading).toBe(true);

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(result.current.data).toEqual(mockLinks);
      expect(mockGetTaskEntityLinks).toHaveBeenCalledWith(1);
    });

    it("should handle error when fetching fails", async () => {
      mockGetTaskEntityLinks.mockRejectedValue(new Error("Failed to fetch"));

      const { result } = renderHook(() => useTaskEntityLinks(1), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isError).toBe(true));

      expect(result.current.error).toBeDefined();
    });

    it("should not call API when taskId is undefined", () => {
      renderHook(() => useTaskEntityLinks(undefined), {
        wrapper: createWrapper(),
      });

      expect(mockGetTaskEntityLinks).not.toHaveBeenCalled();
    });
  });

  describe("useAddTaskEntityLink", () => {
    it("should add entity link and invalidate queries", async () => {
      const mockLink = {
        id: 3,
        task_id: 1,
        entity_id: 30,
        entity_type: "model" as const,
        entity_name: "Test Model",
      };
      mockAddTaskEntityLink.mockResolvedValue(mockLink);

      const { result } = renderHook(() => useAddTaskEntityLink(), {
        wrapper: createWrapper(),
      });

      await act(async () => {
        await result.current.mutateAsync({
          taskId: 1,
          entityId: 30,
          entityType: "model",
        });
      });

      expect(mockAddTaskEntityLink).toHaveBeenCalledWith(1, 30, "model");
    });

    it("should handle add failure", async () => {
      mockAddTaskEntityLink.mockRejectedValue(new Error("Failed to add"));

      const { result } = renderHook(() => useAddTaskEntityLink(), {
        wrapper: createWrapper(),
      });

      let error: Error | null = null;
      await act(async () => {
        try {
          await result.current.mutateAsync({
            taskId: 1,
            entityId: 30,
            entityType: "model",
          });
        } catch (e) {
          error = e as Error;
        }
      });

      expect(error).toBeDefined();
    });
  });

  describe("useRemoveTaskEntityLink", () => {
    it("should remove entity link and invalidate queries", async () => {
      mockRemoveTaskEntityLink.mockResolvedValue(undefined);

      const { result } = renderHook(() => useRemoveTaskEntityLink(), {
        wrapper: createWrapper(),
      });

      await act(async () => {
        await result.current.mutateAsync({
          taskId: 1,
          linkId: 3,
        });
      });

      expect(mockRemoveTaskEntityLink).toHaveBeenCalledWith(1, 3);
    });

    it("should handle remove failure", async () => {
      mockRemoveTaskEntityLink.mockRejectedValue(new Error("Failed to remove"));

      const { result } = renderHook(() => useRemoveTaskEntityLink(), {
        wrapper: createWrapper(),
      });

      let error: Error | null = null;
      await act(async () => {
        try {
          await result.current.mutateAsync({
            taskId: 1,
            linkId: 3,
          });
        } catch (e) {
          error = e as Error;
        }
      });

      expect(error).toBeDefined();
    });
  });
});
