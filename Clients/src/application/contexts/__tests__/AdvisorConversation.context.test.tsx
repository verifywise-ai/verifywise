import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import React from "react";
import {
  AdvisorConversationProvider,
  useAdvisorConversation,
  useAdvisorConversationSafe,
} from "../AdvisorConversation.context";

const mockListConversations = vi.fn().mockResolvedValue({
  data: {
    conversations: [
      {
        id: 1,
        title: "Chat 1",
        last_message_at: "2025-01-01",
        message_count: 2,
        created_at: "2025-01-01",
        updated_at: "2025-01-01",
      },
      {
        id: 2,
        title: "Chat 2",
        last_message_at: "2024-12-01",
        message_count: 1,
        created_at: "2024-12-01",
        updated_at: "2024-12-01",
      },
    ],
  },
});

const mockGetConversationById = vi.fn().mockResolvedValue({
  data: {
    conversation: {
      id: 1,
      messages: [
        { role: "user", content: "Hello" },
        { role: "assistant", content: "Hi there" },
      ],
    },
  },
});

const mockCreateConversation = vi.fn().mockResolvedValue({
  data: {
    conversation: {
      id: 99,
      title: "New Chat",
      last_message_at: null,
      message_count: 0,
      created_at: "2025-01-02",
      updated_at: "2025-01-02",
    },
  },
});

const mockUpdateConversation = vi.fn().mockResolvedValue({});
const mockDeleteConversation = vi.fn().mockResolvedValue({});

vi.mock("../../repository/advisor.repository", () => ({
  listConversationsAPI: (...args: unknown[]) => mockListConversations(...args),
  getConversationByIdAPI: (...args: unknown[]) => mockGetConversationById(...args),
  createConversationAPI: (...args: unknown[]) => mockCreateConversation(...args),
  updateConversationAPI: (...args: unknown[]) => mockUpdateConversation(...args),
  deleteConversationAPI: (...args: unknown[]) => mockDeleteConversation(...args),
}));

vi.mock("../../../presentation/components/AdvisorChat/advisorConfig", () => ({
  AdvisorDomain: {},
}));

function wrapper({ children }: { children: React.ReactNode }) {
  return React.createElement(AdvisorConversationProvider, null, children);
}

describe("AdvisorConversationContext", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("useAdvisorConversation", () => {
    it("should throw when used outside provider", () => {
      expect(() => {
        renderHook(() => useAdvisorConversation());
      }).toThrow("useAdvisorConversation must be used within an AdvisorConversationProvider");
    });

    it("should provide default empty state for unloaded domain", () => {
      const { result } = renderHook(() => useAdvisorConversation(), { wrapper });
      expect(result.current.getConversations("general" as any)).toEqual([]);
      expect(result.current.getActiveId("general" as any)).toBeNull();
      expect(result.current.getMessages("general" as any)).toEqual([]);
      expect(result.current.isLoaded("general" as any)).toBe(false);
      expect(result.current.isLoading("general" as any)).toBe(false);
    });

    it("should handle isLoaded/isLoading with undefined domain", () => {
      const { result } = renderHook(() => useAdvisorConversation(), { wrapper });
      expect(result.current.isLoaded(undefined)).toBe(false);
      expect(result.current.isLoading(undefined)).toBe(false);
    });

    it("should load domain and auto-select most recent conversation", async () => {
      const { result } = renderHook(() => useAdvisorConversation(), { wrapper });

      await act(async () => {
        await result.current.loadDomain("general" as any);
      });

      expect(mockListConversations).toHaveBeenCalledWith("general");
      expect(result.current.getConversations("general" as any)).toHaveLength(2);
      expect(result.current.getActiveId("general" as any)).toBe(1);
      expect(result.current.isLoaded("general" as any)).toBe(true);
    });

    it("should handle loadDomain when no conversations exist", async () => {
      mockListConversations.mockResolvedValueOnce({ data: { conversations: [] } });
      const { result } = renderHook(() => useAdvisorConversation(), { wrapper });

      await act(async () => {
        await result.current.loadDomain("general" as any);
      });

      expect(result.current.getConversations("general" as any)).toEqual([]);
      expect(result.current.getActiveId("general" as any)).toBeNull();
      expect(result.current.isLoaded("general" as any)).toBe(true);
    });

    it("should start a new conversation by clearing state", async () => {
      const { result } = renderHook(() => useAdvisorConversation(), { wrapper });

      await act(async () => {
        await result.current.loadDomain("general" as any);
      });

      await act(async () => {
        await result.current.startNewConversation("general" as any);
      });

      expect(result.current.getActiveId("general" as any)).toBeNull();
      expect(result.current.getMessages("general" as any)).toEqual([]);
    });

    it("should select a conversation by id", async () => {
      const { result } = renderHook(() => useAdvisorConversation(), { wrapper });

      await act(async () => {
        await result.current.loadDomain("general" as any);
      });

      mockGetConversationById.mockResolvedValueOnce({
        data: {
          conversation: {
            id: 2,
            messages: [{ role: "user", content: "Second chat" }],
          },
        },
      });

      await act(async () => {
        await result.current.selectConversation("general" as any, 2);
      });

      expect(result.current.getActiveId("general" as any)).toBe(2);
      expect(result.current.getMessages("general" as any)).toEqual([
        { role: "user", content: "Second chat" },
      ]);
    });

    it("should handle loadDomain error gracefully", async () => {
      mockListConversations.mockRejectedValueOnce(new Error("Network error"));
      const { result } = renderHook(() => useAdvisorConversation(), { wrapper });

      await act(async () => {
        await result.current.loadDomain("general" as any);
      });

      expect(result.current.isLoaded("general" as any)).toBe(true);
      expect(result.current.getConversations("general" as any)).toEqual([]);
    });
  });

  describe("useAdvisorConversationSafe", () => {
    it("should return null when used outside provider", () => {
      const { result } = renderHook(() => useAdvisorConversationSafe());
      expect(result.current).toBeNull();
    });

    it("should return context when used within provider", () => {
      const { result } = renderHook(() => useAdvisorConversationSafe(), { wrapper });
      expect(result.current).not.toBeNull();
    });
  });
});
