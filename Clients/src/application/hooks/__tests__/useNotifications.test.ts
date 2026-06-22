import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import React from "react";
import { Provider } from "react-redux";
import { configureStore, combineReducers } from "@reduxjs/toolkit";

vi.mock("../../../../env.vars", () => ({
  ENV_VARs: {
    URL: "http://test-api.example.com",
    IS_DEMO_APP: false,
    IS_MULTI_TENANT: false,
    CLIENT_ID: "",
    SLACK_URL: "",
    IS_SLACK_VISIBLE: "true",
  },
}));

vi.mock("../../../infrastructure/api/networkServices", () => ({
  apiServices: { get: vi.fn(), patch: vi.fn(), delete: vi.fn(), post: vi.fn() },
}));

vi.mock("../../../infrastructure/api/customAxios", () => ({
  showAlert: vi.fn(),
}));

vi.mock("../../redux/store", () => ({
  store: {
    getState: vi.fn(() => ({ auth: { activeOrganizationId: null } })),
    dispatch: vi.fn(),
    subscribe: vi.fn(),
  },
}));

import { useNotifications } from "../useNotifications";
import authReducer from "../../redux/auth/authSlice";
import uiSlice from "../../redux/ui/uiSlice";
import fileSlice from "../../redux/file/fileSlice";
import { apiServices } from "../../../infrastructure/api/networkServices";
import { showAlert } from "../../../infrastructure/api/customAxios";
import * as storeModule from "../../redux/store";

// ---- Helpers ----

function createTestStore(authToken = "mock-token") {
  return configureStore({
    reducer: combineReducers({ auth: authReducer, ui: uiSlice, files: fileSlice }),
    preloadedState: {
      auth: {
        isLoading: false,
        authToken,
        user: "test@test.com",
        userExists: true,
        success: null,
        message: null,
        expirationDate: null,
        onboardingStatus: "completed",
        isOrgCreator: false,
        isSuperAdmin: false,
        activeOrganizationId: null,
      },
    },
    middleware: (gD) => gD({ serializableCheck: false }),
  });
}

function createWrapper(authToken = "mock-token") {
  const testStore = createTestStore(authToken);
  const Wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(Provider, { store: testStore, children: children as any }, children);
  return { wrapper: Wrapper, store: testStore };
}

function createImmediateStream() {
  return {
    ok: true,
    body: {
      getReader: () => ({
        read: vi.fn().mockResolvedValue({ done: true, value: undefined } as any),
      }),
    },
  };
}

function createEventStream(...events: string[]) {
  const encoder = new TextEncoder();
  const reads: { done: boolean; value: any }[] = events.map((e) => ({
    done: false,
    value: encoder.encode(e + "\n\n"),
  }));
  reads.push({ done: true, value: undefined });
  const mockRead = vi.fn();
  reads.forEach((r) => mockRead.mockResolvedValueOnce(r));
  return {
    ok: true,
    body: { getReader: () => ({ read: mockRead }) },
  };
}

const defaultSummaryResponse = {
  data: {
    data: {
      unread_count: 0,
      total_count: 0,
      recent_notifications: [],
    },
  },
};

const mockNotification = {
  id: 1,
  type: "task_assigned" as const,
  title: "Test Task",
  message: "You have a new task",
  is_read: false,
  created_at: "2025-01-01T00:00:00Z",
};

// ---- Tests ----

describe("useNotifications", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn().mockResolvedValue(createImmediateStream());
    vi.mocked(apiServices.get).mockResolvedValue(defaultSummaryResponse as any);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("fetch on mount", () => {
    it("fetches notification summary on mount when fetchOnMount is true and has authToken", async () => {
      const summaryData = {
        data: {
          data: {
            unread_count: 3,
            total_count: 10,
            recent_notifications: [mockNotification],
          },
        },
      };
      vi.mocked(apiServices.get).mockResolvedValueOnce(summaryData as any);

      const { wrapper } = createWrapper();
      const { result } = renderHook(() => useNotifications(), { wrapper });

      await waitFor(() => {
        expect(apiServices.get).toHaveBeenCalledWith("/notifications/summary");
      });
      await waitFor(() => {
        expect(result.current.notifications).toHaveLength(1);
        expect(result.current.notifications[0].title).toBe("Test Task");
        expect(result.current.unreadCount).toBe(3);
        expect(result.current.totalCount).toBe(10);
        expect(result.current.isLoading).toBe(false);
      });
    });

    it("does not fetch when fetchOnMount is false", () => {
      const { wrapper } = createWrapper();
      renderHook(() => useNotifications({ fetchOnMount: false }), { wrapper });
      expect(apiServices.get).not.toHaveBeenCalledWith("/notifications/summary");
    });

    it("does not fetch when authToken is empty", () => {
      const { wrapper } = createWrapper("");
      renderHook(() => useNotifications(), { wrapper });
      expect(apiServices.get).not.toHaveBeenCalledWith("/notifications/summary");
    });

    it("handles fetch error gracefully", async () => {
      vi.mocked(apiServices.get).mockRejectedValueOnce(new Error("Network error"));
      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      const { wrapper } = createWrapper();
      const { result } = renderHook(() => useNotifications(), { wrapper });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
        expect(result.current.notifications).toEqual([]);
      });
      consoleSpy.mockRestore();
    });
  });

  describe("markAsRead", () => {
    it("calls API and updates state", async () => {
      vi.mocked(apiServices.get).mockResolvedValueOnce({
        data: {
          data: {
            unread_count: 1,
            total_count: 1,
            recent_notifications: [mockNotification],
          },
        },
      } as any);
      const { wrapper } = createWrapper();
      const { result } = renderHook(() => useNotifications(), { wrapper });

      await waitFor(() => {
        expect(result.current.notifications).toHaveLength(1);
      });

      await act(() => result.current.markAsRead(1));

      expect(apiServices.patch).toHaveBeenCalledWith("/notifications/1/read");
      await waitFor(() => {
        expect(result.current.notifications[0].is_read).toBe(true);
        expect(result.current.unreadCount).toBe(0);
      });
    });

    it("throws on API failure", async () => {
      vi.mocked(apiServices.patch).mockRejectedValueOnce(new Error("API error"));
      const { wrapper } = createWrapper();
      const { result } = renderHook(() => useNotifications({ fetchOnMount: false }), { wrapper });

      await expect(result.current.markAsRead(1)).rejects.toThrow("API error");
    });
  });

  describe("markAllAsRead", () => {
    it("calls API and updates state", async () => {
      vi.mocked(apiServices.get).mockResolvedValueOnce({
        data: {
          data: {
            unread_count: 2,
            total_count: 3,
            recent_notifications: [mockNotification, { ...mockNotification, id: 2 }],
          },
        },
      } as any);
      const { wrapper } = createWrapper();
      const { result } = renderHook(() => useNotifications(), { wrapper });

      await waitFor(() => {
        expect(result.current.notifications).toHaveLength(2);
      });

      await act(() => result.current.markAllAsRead());

      expect(apiServices.patch).toHaveBeenCalledWith("/notifications/read-all");
      await waitFor(() => {
        expect(result.current.notifications.every((n) => n.is_read)).toBe(true);
        expect(result.current.unreadCount).toBe(0);
      });
    });

    it("throws on API failure", async () => {
      vi.mocked(apiServices.patch).mockRejectedValueOnce(new Error("API error"));
      const { wrapper } = createWrapper();
      const { result } = renderHook(() => useNotifications({ fetchOnMount: false }), { wrapper });

      await expect(result.current.markAllAsRead()).rejects.toThrow("API error");
    });
  });

  describe("deleteNotification", () => {
    it("deletes a read notification", async () => {
      const readNotification = { ...mockNotification, is_read: true };
      vi.mocked(apiServices.get).mockResolvedValueOnce({
        data: {
          data: {
            unread_count: 0,
            total_count: 1,
            recent_notifications: [readNotification],
          },
        },
      } as any);
      const { wrapper } = createWrapper();
      const { result } = renderHook(() => useNotifications(), { wrapper });

      await waitFor(() => {
        expect(result.current.notifications).toHaveLength(1);
      });

      await act(() => result.current.deleteNotification(1));

      expect(apiServices.delete).toHaveBeenCalledWith("/notifications/1");
      await waitFor(() => {
        expect(result.current.notifications).toHaveLength(0);
        expect(result.current.totalCount).toBe(0);
        expect(result.current.unreadCount).toBe(0);
      });
    });

    it("decrements unreadCount when deleting unread notification", async () => {
      vi.mocked(apiServices.get).mockResolvedValueOnce({
        data: {
          data: {
            unread_count: 1,
            total_count: 1,
            recent_notifications: [mockNotification],
          },
        },
      } as any);
      const { wrapper } = createWrapper();
      const { result } = renderHook(() => useNotifications(), { wrapper });

      await waitFor(() => {
        expect(result.current.notifications).toHaveLength(1);
        expect(result.current.unreadCount).toBe(1);
      });

      await act(() => result.current.deleteNotification(1));

      await waitFor(() => {
        expect(result.current.unreadCount).toBe(0);
        expect(result.current.totalCount).toBe(0);
      });
    });

    it("throws on API failure", async () => {
      vi.mocked(apiServices.delete).mockRejectedValueOnce(new Error("API error"));
      const { wrapper } = createWrapper();
      const { result } = renderHook(() => useNotifications({ fetchOnMount: false }), { wrapper });

      await expect(result.current.deleteNotification(1)).rejects.toThrow("API error");
    });
  });

  describe("loadMore / hasMore", () => {
    it("loads more notifications and appends them", async () => {
      vi.mocked(apiServices.get).mockResolvedValueOnce({
        data: {
          data: {
            unread_count: 1,
            total_count: 3,
            recent_notifications: [mockNotification],
          },
        },
      } as any);
      const { wrapper } = createWrapper();
      const { result } = renderHook(() => useNotifications(), { wrapper });

      await waitFor(() => {
        expect(result.current.notifications).toHaveLength(1);
        expect(result.current.totalCount).toBe(3);
        expect(result.current.hasMore).toBe(true);
      });

      const pageNotifications = [
        { ...mockNotification, id: 2, title: "Second" },
        { ...mockNotification, id: 3, title: "Third" },
      ];
      vi.mocked(apiServices.get).mockResolvedValueOnce({
        data: { data: pageNotifications },
      } as any);

      await act(() => result.current.loadMore());

      expect(apiServices.get).toHaveBeenCalledWith("/notifications?limit=10&offset=1");
      await waitFor(() => {
        expect(result.current.notifications).toHaveLength(3);
        expect(result.current.hasMore).toBe(false);
        expect(result.current.isLoadingMore).toBe(false);
      });
    });

    it("does not load when already at totalCount", async () => {
      vi.mocked(apiServices.get).mockResolvedValueOnce({
        data: {
          data: {
            unread_count: 0,
            total_count: 1,
            recent_notifications: [mockNotification],
          },
        },
      } as any);
      const { wrapper } = createWrapper();
      const { result } = renderHook(() => useNotifications(), { wrapper });

      await waitFor(() => {
        expect(result.current.notifications).toHaveLength(1);
        expect(result.current.totalCount).toBe(1);
        expect(result.current.hasMore).toBe(false);
      });

      await act(() => result.current.loadMore());
      expect(apiServices.get).toHaveBeenCalledTimes(1);
    });

    it("deduplicates notifications by id", async () => {
      vi.mocked(apiServices.get).mockResolvedValueOnce({
        data: {
          data: {
            unread_count: 1,
            total_count: 2,
            recent_notifications: [mockNotification],
          },
        },
      } as any);
      const { wrapper } = createWrapper();
      const { result } = renderHook(() => useNotifications(), { wrapper });

      await waitFor(() => {
        expect(result.current.notifications).toHaveLength(1);
      });

      vi.mocked(apiServices.get).mockResolvedValueOnce({
        data: { data: [mockNotification, { ...mockNotification, id: 2 }] },
      } as any);

      await act(() => result.current.loadMore());

      await waitFor(() => {
        expect(result.current.notifications).toHaveLength(2);
      });
    });
  });

  describe("SSE connect / disconnect", () => {
    it("connects to SSE on mount when authToken is present", async () => {
      const { wrapper } = createWrapper();
      renderHook(() => useNotifications({ autoReconnect: false, fetchOnMount: false }), {
        wrapper,
      });

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith(
          "http://test-api.example.com/api/notifications/stream",
          expect.objectContaining({
            method: "GET",
            headers: expect.objectContaining({
              Authorization: "Bearer mock-token",
              Accept: "text/event-stream",
            }),
          }),
        );
      });
    });

    it("does not connect when authToken is empty", () => {
      const { wrapper } = createWrapper("");
      renderHook(() => useNotifications({ fetchOnMount: false }), { wrapper });
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it("does not connect when enabled is false", () => {
      const { wrapper } = createWrapper();
      renderHook(() => useNotifications({ enabled: false, fetchOnMount: false }), { wrapper });
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it("includes X-Organization-Id header when activeOrganizationId is set", async () => {
      vi.mocked(storeModule.store.getState).mockReturnValue({
        auth: {
          isLoading: false,
          authToken: "mock-token",
          user: "test@test.com",
          userExists: true,
          success: null,
          message: null,
          expirationDate: null,
          onboardingStatus: "completed",
          isOrgCreator: false,
          isSuperAdmin: false,
          activeOrganizationId: 5,
        },
      } as any);

      const { wrapper } = createWrapper();
      renderHook(() => useNotifications({ autoReconnect: false, fetchOnMount: false }), {
        wrapper,
      });

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith(
          expect.any(String),
          expect.objectContaining({
            headers: expect.objectContaining({
              "X-Organization-Id": "5",
            }),
          }),
        );
      });
    });

    it("disconnect sets isConnected to false", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        body: {
          getReader: () => ({
            read: vi.fn().mockReturnValue(new Promise(() => {})),
          }),
        },
      });

      const { wrapper } = createWrapper();
      const { result } = renderHook(
        () => useNotifications({ autoReconnect: false, fetchOnMount: false }),
        { wrapper },
      );

      await waitFor(() => {
        expect(result.current.isConnected).toBe(true);
      });

      act(() => result.current.disconnect());
      expect(result.current.isConnected).toBe(false);
    });
  });

  describe("displayNotification (via SSE events)", () => {
    it("adds notification to state and shows alert on SSE event", async () => {
      global.fetch = vi
        .fn()
        .mockResolvedValue(createEventStream(`data: ${JSON.stringify(mockNotification)}`));

      const { wrapper } = createWrapper();
      const { result } = renderHook(
        () => useNotifications({ autoReconnect: false, fetchOnMount: false }),
        { wrapper },
      );

      await waitFor(() => {
        expect(result.current.notifications).toHaveLength(1);
        expect(result.current.notifications[0].title).toBe("Test Task");
      });
      await waitFor(() => {
        expect(result.current.unreadCount).toBe(1);
        expect(result.current.totalCount).toBe(1);
      });
      expect(showAlert).toHaveBeenCalledWith(
        expect.objectContaining({
          variant: "info",
          title: "Test Task",
          body: "You have a new task",
        }),
      );
    });

    it("skips connected type notifications", async () => {
      global.fetch = vi.fn().mockResolvedValue(createEventStream(`data: {"type":"connected"}`));

      const { wrapper } = createWrapper();
      const { result } = renderHook(
        () => useNotifications({ autoReconnect: false, fetchOnMount: false }),
        { wrapper },
      );

      await waitFor(() => {
        expect(result.current.notifications).toHaveLength(0);
      });
      expect(showAlert).not.toHaveBeenCalled();
    });

    it("calls onNotification callback when provided", async () => {
      const onNotification = vi.fn();
      global.fetch = vi
        .fn()
        .mockResolvedValue(createEventStream(`data: ${JSON.stringify(mockNotification)}`));

      const { wrapper } = createWrapper();
      renderHook(
        () =>
          useNotifications({
            autoReconnect: false,
            fetchOnMount: false,
            onNotification,
          }),
        { wrapper },
      );

      await waitFor(() => {
        expect(onNotification).toHaveBeenCalledWith(mockNotification);
      });
    });

    it("deduplicates notifications by id", async () => {
      global.fetch = vi
        .fn()
        .mockResolvedValue(
          createEventStream(
            `data: ${JSON.stringify(mockNotification)}`,
            `data: ${JSON.stringify(mockNotification)}`,
          ),
        );

      const { wrapper } = createWrapper();
      const { result } = renderHook(
        () => useNotifications({ autoReconnect: false, fetchOnMount: false }),
        { wrapper },
      );

      await waitFor(() => {
        expect(result.current.notifications).toHaveLength(1);
      });
    });

    it("maps alert variant based on notification type", async () => {
      const errorNotification = { ...mockNotification, type: "approval_rejected", id: 2 };
      global.fetch = vi
        .fn()
        .mockResolvedValue(createEventStream(`data: ${JSON.stringify(errorNotification)}`));

      const { wrapper } = createWrapper();
      renderHook(() => useNotifications({ autoReconnect: false, fetchOnMount: false }), {
        wrapper,
      });

      await waitFor(() => {
        expect(showAlert).toHaveBeenCalledWith(expect.objectContaining({ variant: "error" }));
      });
    });

    it("uses default body when message is empty", async () => {
      const notifNoMsg = { ...mockNotification, message: undefined, id: 3 };
      global.fetch = vi
        .fn()
        .mockResolvedValue(createEventStream(`data: ${JSON.stringify(notifNoMsg)}`));

      const { wrapper } = createWrapper();
      renderHook(() => useNotifications({ autoReconnect: false, fetchOnMount: false }), {
        wrapper,
      });

      await waitFor(() => {
        expect(showAlert).toHaveBeenCalledWith(
          expect.objectContaining({ body: "You have a new notification" }),
        );
      });
    });
  });

  describe("visibility and online events", () => {
    it("reconnects when tab becomes visible and not connected", async () => {
      global.fetch = vi.fn().mockResolvedValue(createImmediateStream());

      const { wrapper } = createWrapper();
      renderHook(() => useNotifications({ autoReconnect: false, fetchOnMount: false }), {
        wrapper,
      });

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledTimes(1);
      });

      document.dispatchEvent(new Event("visibilitychange"));

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledTimes(2);
      });
    });

    it("reconnects when browser comes online", async () => {
      global.fetch = vi.fn().mockResolvedValue(createImmediateStream());

      const { wrapper } = createWrapper();
      renderHook(() => useNotifications({ autoReconnect: false, fetchOnMount: false }), {
        wrapper,
      });

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledTimes(1);
      });

      window.dispatchEvent(new Event("online"));

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledTimes(2);
      });
    });
  });

  describe("refresh and reconnect", () => {
    it("refresh calls fetchNotifications", async () => {
      vi.mocked(apiServices.get)
        .mockResolvedValueOnce(defaultSummaryResponse as any)
        .mockResolvedValueOnce({
          data: {
            data: {
              unread_count: 1,
              total_count: 1,
              recent_notifications: [mockNotification],
            },
          },
        } as any);

      const { wrapper } = createWrapper();
      const { result } = renderHook(() => useNotifications(), { wrapper });

      await waitFor(() => {
        expect(apiServices.get).toHaveBeenCalledTimes(1);
      });

      await act(() => result.current.refresh());

      await waitFor(() => {
        expect(apiServices.get).toHaveBeenCalledTimes(2);
        expect(result.current.unreadCount).toBe(1);
      });
    });

    it("reconnect calls disconnect and connect", async () => {
      global.fetch = vi.fn().mockResolvedValue(createImmediateStream());

      const { wrapper } = createWrapper();
      const { result } = renderHook(
        () => useNotifications({ autoReconnect: false, fetchOnMount: false }),
        { wrapper },
      );

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledTimes(1);
      });

      await act(async () => {
        result.current.reconnect();
        await new Promise((r) => setTimeout(r, 150));
      });

      // disconnect + reconnect via setTimeout(100)
      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledTimes(2);
      });
    });
  });

  describe("error handling", () => {
    it("reconnects on SSE error when autoReconnect is true", async () => {
      global.fetch = vi
        .fn()
        .mockRejectedValueOnce(new Error("Connection failed"))
        .mockResolvedValueOnce(createImmediateStream());

      const { wrapper } = createWrapper();
      renderHook(
        () =>
          useNotifications({
            autoReconnect: true,
            reconnectDelay: 50,
            fetchOnMount: false,
          }),
        { wrapper },
      );

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledTimes(2);
      });
    });

    it("does not reconnect on AbortError", async () => {
      const abortError = new Error("Aborted");
      abortError.name = "AbortError";
      global.fetch = vi.fn().mockRejectedValueOnce(abortError);

      const { wrapper } = createWrapper();
      renderHook(
        () => useNotifications({ autoReconnect: true, reconnectDelay: 50, fetchOnMount: false }),
        { wrapper },
      );

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledTimes(1);
      });
    });

    it("cleans up SSE on unmount", () => {
      const { wrapper } = createWrapper();
      const { unmount } = renderHook(
        () => useNotifications({ autoReconnect: false, fetchOnMount: false }),
        { wrapper },
      );
      expect(() => unmount()).not.toThrow();
    });
  });

  describe("initial state", () => {
    it("returns default values before fetch completes", () => {
      const { wrapper } = createWrapper();
      const { result } = renderHook(() => useNotifications({ fetchOnMount: false }), { wrapper });

      expect(result.current.notifications).toEqual([]);
      expect(result.current.unreadCount).toBe(0);
      expect(result.current.totalCount).toBe(0);
      expect(result.current.isLoading).toBe(false);
      expect(result.current.isLoadingMore).toBe(false);
      expect(result.current.isConnected).toBe(false);
      expect(result.current.hasMore).toBe(false);
    });
  });
});
